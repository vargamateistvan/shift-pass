import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import type { ProgressStream } from "../lib/sse.js";
import { assertDomainAllowed, isValidEmail, parseUrl } from "../lib/guard.js";
import type { RotateRequest } from "../types.js";
import { BrowserSession } from "./browser.js";
import { runAgentGoal } from "./loop.js";
import { createGemini } from "../llm/gemini.js";
import { pollForResetEmail } from "../gmail/poller.js";
import { generatePassword } from "../password/generate.js";
import { saveEntry } from "../vault/vault.js";

/**
 * Orchestrates one password-rotation run end to end, streaming progress.
 * Stages: request reset (Goal A) -> read email -> set password (Goal B) -> vault.
 */
export async function runRotation(
  req: RotateRequest,
  stream: ProgressStream,
): Promise<void> {
  let browser: BrowserSession | undefined;
  try {
    if (!isValidEmail(req.email)) throw new Error("Invalid account email");
    if (!req.googleAccessToken) throw new Error("Missing Google access token");
    if (!config.geminiApiKey) throw new Error("Server missing GEMINI_API_KEY");
    const url = parseUrl(req.url);
    assertDomainAllowed(url);

    const client = createGemini();
    const newPassword = generatePassword();
    const startedAtMs = Date.now();

    stream.send({
      type: "phase",
      phase: "starting",
      message: `Rotating password for ${req.email} on ${url.host}${config.dryRun ? " (dry run)" : ""}`,
    });

    browser = new BrowserSession();
    await browser.launch();

    stream.send({
      type: "phase",
      phase: "navigating",
      message: `Opening ${url.host}…`,
    });
    await browser.navigate(url.toString());

    // ---- Goal A: trigger the reset email ----
    stream.send({
      type: "phase",
      phase: "requesting_reset",
      message: "Locating the forgot-password flow…",
    });
    const goalA = await runAgentGoal(client, browser, stream, {
      phase: "requesting_reset",
      accountEmail: req.email,
      goal:
        `Trigger a password reset for the account "${req.email}". ` +
        `Prioritize elements listed under Reset candidates and use precise clicks on their coordinates. ` +
        `Order of operations: (1) open sign-in if needed, (2) click forgot/reset link, ` +
        `(3) focus email input, (4) type "${req.email}", (5) click submit/send/continue. ` +
        `Find a "Sign in" / "Log in" page if needed, then a "Forgot password" / ` +
        `"Reset password" link, enter the email "${req.email}", and submit so a ` +
        `reset email is sent. Call finish with status "done" once the site confirms ` +
        `the email was sent. Do NOT set a new password in this step.`,
    });
    if (goalA.status === "needs_human") return human(stream, goalA.summary);
    if (goalA.status === "exhausted")
      throw new Error(`Could not request reset: ${goalA.summary}`);

    // ---- Read the reset email via Gmail ----
    stream.send({
      type: "phase",
      phase: "awaiting_email",
      message: "Waiting for the reset email…",
    });
    const email = await pollForResetEmail(
      req.googleAccessToken,
      url.host,
      startedAtMs,
      stream,
    );
    if (!email) throw new Error("Timed out waiting for the reset email");
    if (email.link) await browser.navigate(email.link);

    // ---- Goal B: set the new password ----
    stream.send({
      type: "phase",
      phase: "setting_password",
      message: config.dryRun
        ? "Filling new password (dry run)…"
        : "Setting the new password…",
    });
    const submitClause = config.dryRun
      ? "Fill the new-password and confirm-password fields with this value but DO NOT submit the form."
      : "Fill the new-password and confirm-password fields with this value and submit to complete the reset.";
    const codeClause = email.code
      ? ` If a verification code is requested, enter this code: ${email.code}.`
      : "";
    const goalB = await runAgentGoal(client, browser, stream, {
      phase: "setting_password",
      goal:
        `Complete the password reset.${codeClause} Set the new password to exactly ` +
        `this value: ${newPassword}. ${submitClause} Call finish with status "done" ` +
        `when complete, or "needs_human" if blocked.`,
    });
    if (goalB.status === "needs_human") return human(stream, goalB.summary);
    if (goalB.status === "exhausted")
      throw new Error(`Could not set password: ${goalB.summary}`);

    // ---- Persist to the encrypted vault ----
    stream.send({
      type: "phase",
      phase: "saving",
      message: "Saving to encrypted vault…",
    });
    await saveEntry({
      id: randomUUID(),
      site: url.toString(),
      host: url.host,
      email: req.email,
      password: newPassword,
      rotatedAt: new Date().toISOString(),
      status: config.dryRun ? "dry_run" : "rotated",
    });

    stream.send({
      type: "done",
      site: url.host,
      email: req.email,
      password: newPassword,
    });
    log.info("rotation complete", { host: url.host, dryRun: config.dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("rotation failed", { message });
    stream.send({ type: "error", message });
  } finally {
    await browser?.close();
    stream.close();
  }
}

function human(stream: ProgressStream, reason: string): void {
  stream.send({
    type: "needs_human",
    reason,
    message: `Paused — manual action required: ${reason}`,
  });
}

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
        `Request a password-reset email for account "${req.email}". ` +
        `Primary objective: complete the reset-request step and reach a clear confirmation state ` +
        `(for example: "email sent", "check your inbox", "reset link sent", "verification email sent"). ` +
        `Required sequence: ` +
        `(1) locate and click Forgot password / Reset password (or equivalent), ` +
        `(2) enter "${req.email}" into the email/username field, ` +
        `(3) submit via Send / Continue / Next / Submit. ` +
        `If reset controls are hidden, open Sign in / Log in first, then retry step (1). ` +
        `Use Reset candidates and their coordinates as your first choice when available. ` +
        `Do not keep clicking the same element repeatedly; if blocked by CAPTCHA, 2FA, login wall, ` +
        `or no recoverable reset path, finish with status "needs_human" and a specific reason. ` +
        `Only finish with status "done" after the reset request has clearly been accepted by the site. ` +
        `Do NOT set a new password in this step.`,
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

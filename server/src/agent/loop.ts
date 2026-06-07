import type { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import type { ProgressStream } from "../lib/sse.js";
import type { BrowserSession } from "./browser.js";
import { executeAction } from "./executor.js";
import { geminiTools, mapGeminiToolCall } from "../llm/gemini.js";
import type { ProgressPhase } from "../types.js";

export type GoalResult = {
  status: "done" | "needs_human" | "exhausted";
  summary: string;
};

type GeminiResponse = {
  text?: string;
  functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
  candidates?: Array<{ finishReason?: string }>;
};

function previewText(value: string, max = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("network")
  );
}

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("resource_exhausted") ||
    msg.includes("quota exceeded") ||
    msg.includes("limit: 0")
  );
}

function parseRetryDelayMs(err: unknown): number | undefined {
  const msg = errorMessage(err);
  const match = msg.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.ceil(seconds * 1000);
}

function mapGeminiError(err: unknown): Error {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();
  if (lower.includes("503") || lower.includes("unavailable")) {
    return new Error(
      "Gemini is temporarily unavailable due to high demand. Please retry shortly.",
    );
  }
  if (msg.toLowerCase().includes("fetch failed")) {
    return new Error(
      "Gemini request failed (network). Check outbound access to Google Gemini APIs and verify GEMINI_API_KEY.",
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function generateGeminiStep(
  client: GoogleGenAI,
  model: string,
  fallbackModel: string | undefined,
  planPrompt: string,
  imageBase64: string,
): Promise<GeminiResponse> {
  const models = [model, fallbackModel]
    .filter((m): m is string => Boolean(m && m.trim()))
    .filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: unknown;

  for (const currentModel of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const rawResp = await client.models.generateContent({
          model: currentModel,
          contents: [
            {
              role: "user",
              parts: [
                { text: planPrompt },
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM,
            tools: geminiTools,
            temperature: 0.1,
          },
        } as never);

        if (currentModel !== model) {
          log.warn("gemini model fallback in use", {
            primaryModel: model,
            fallbackModel: currentModel,
          });
        }

        return rawResp as unknown as GeminiResponse;
      } catch (err) {
        lastError = err;

        const retryDelayMs =
          parseRetryDelayMs(err) ?? 1000 * 2 ** (attempt - 1);
        const quotaExhausted = isQuotaExhaustedError(err);
        const retryable = isRetryableGeminiError(err);

        const canFallback =
          quotaExhausted &&
          currentModel === model &&
          Boolean(fallbackModel) &&
          fallbackModel !== model;
        if (canFallback) {
          log.warn("gemini quota exhausted on primary model", {
            primaryModel: model,
            fallbackModel,
            message: previewText(errorMessage(err), 160),
          });
          break;
        }

        if (!retryable || attempt === 3) {
          throw mapGeminiError(err);
        }

        log.warn("gemini request retry", {
          model: currentModel,
          attempt,
          retryDelayMs,
          message: previewText(errorMessage(err), 160),
        });
        await sleep(retryDelayMs);
      }
    }
  }

  throw mapGeminiError(lastError);
}

const SYSTEM = `You are ShiftPass, an autonomous browser agent that operates a 1280x800 web viewport via the "computer" tool.
Rules:
- There is NO browser chrome or address bar in the screenshot. To open a URL, call the "navigate" tool.
- Take a screenshot first to observe, then act. After acting, observe the new screenshot.
- Be efficient and deliberate; click precisely using pixel coordinates from the screenshot.
- Do not repeat the exact same action and coordinates more than 3 times in a row.
- NEVER attempt to solve CAPTCHAs, image challenges, 2FA/OTP codes, or phone verification. If you hit one, call "finish" with status "needs_human".
- When the goal is fully achieved, call "finish" with status "done" and a short summary.
- Call exactly one tool per turn.`;

async function observation(browser: BrowserSession): Promise<{
  imageBase64: string;
  text: string;
}> {
  const [shot, els] = await Promise.all([
    browser.screenshotBase64(),
    browser.interactiveElements(),
  ]);
  return {
    imageBase64: shot,
    text:
      `Current URL: ${browser.url()}\n` +
      `Interactive elements: ${els.map((e) => `${e.tag}${e.type ? `[${e.type}]` : ""}:"${e.text}"`).join(", ")}`,
  };
}

/** Runs the agent until the given goal is reached, blocked, or steps run out. */
export async function runAgentGoal(
  client: GoogleGenAI,
  browser: BrowserSession,
  stream: ProgressStream,
  opts: { goal: string; phase: ProgressPhase },
): Promise<GoalResult> {
  let obs = await observation(browser);
  const recentActions: string[] = [];
  let lastActionSig = "";
  let repeatedActionCount = 0;

  for (let step = 1; step <= config.maxAgentSteps; step += 1) {
    if (stream.isClosed)
      return { status: "exhausted", summary: "Client disconnected" };

    const planPrompt =
      `GOAL: ${opts.goal}\n` +
      `PHASE: ${opts.phase}\n` +
      `STEP: ${step}\n` +
      `${obs.text}\n` +
      `Recent actions: ${recentActions.join(" | ") || "none"}\n` +
      `Avoid clicking the same coordinates repeatedly; if blocked, use finish(needs_human).\n` +
      `Choose the single best next action and call exactly one tool.`;

    const resp = await generateGeminiStep(
      client,
      config.geminiModel,
      config.geminiFallbackModel,
      planPrompt,
      obs.imageBase64,
    );

    const assistantText = typeof resp.text === "string" ? resp.text.trim() : "";
    const toolUses = Array.isArray(resp.functionCalls)
      ? resp.functionCalls
      : [];

    log.info("agent model response", {
      phase: opts.phase,
      step,
      stopReason: resp.candidates?.[0]?.finishReason ?? "unknown",
      toolUseCount: toolUses.length,
      toolUseNames: toolUses.map((tu) => tu.name ?? "unknown"),
      textPreview: previewText(assistantText),
    });

    if (toolUses.length === 0) {
      log.info("agent produced no tool use", {
        phase: opts.phase,
        text: previewText(assistantText, 120),
      });
      recentActions.push("model returned no tool call");
      if (recentActions.length > 6) recentActions.shift();
      continue;
    }

    const tu = toolUses[0];
    const mapped = mapGeminiToolCall(
      String(tu.name ?? "computer"),
      (tu.args ?? {}) as Record<string, unknown>,
    );

    if (mapped.kind === "finish") {
      log.info("agent finish", {
        phase: opts.phase,
        step,
        status: mapped.status,
        summary: previewText(mapped.summary),
      });
      stream.send({
        type: "step",
        index: step,
        action: `finish:${mapped.status}`,
        detail: mapped.summary,
      });
      return { status: mapped.status, summary: mapped.summary };
    }

    const result = await executeAction(browser, mapped.action);
    const actionSig = `${mapped.action.action}:${result.detail ?? ""}`;
    if (actionSig === lastActionSig) {
      repeatedActionCount += 1;
    } else {
      lastActionSig = actionSig;
      repeatedActionCount = 1;
    }

    if (repeatedActionCount >= 8) {
      const reason =
        "Agent appears stuck repeating the same action. Manual intervention recommended.";
      log.warn("agent repeated-action guard triggered", {
        phase: opts.phase,
        step,
        action: mapped.action.action,
        detail: result.detail,
        repeatedActionCount,
      });
      return { status: "needs_human", summary: reason };
    }

    stream.send({
      type: "step",
      index: step,
      action: mapped.action.action,
      detail: result.detail,
    });

    recentActions.push(`${mapped.action.action}: ${result.detail}`);
    if (recentActions.length > 6) recentActions.shift();

    obs = await observation(browser);
    stream.send({
      type: "screenshot",
      dataUrl: `data:image/png;base64,${obs.imageBase64}`,
    });
  }

  return { status: "exhausted", summary: "Reached maximum agent steps" };
}

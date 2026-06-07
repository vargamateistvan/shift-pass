import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import type { ProgressStream } from "../lib/sse.js";
import type { BrowserSession } from "./browser.js";
import { executeAction } from "./executor.js";
import { COMPUTER_USE_BETA, mapToolUse, tools } from "../llm/anthropic.js";
import type { ProgressPhase } from "../types.js";

export type GoalResult = {
  status: "done" | "needs_human" | "exhausted";
  summary: string;
};

type Msg = { role: "user" | "assistant"; content: unknown };

const SYSTEM = `You are ShiftPass, an autonomous browser agent that operates a 1280x800 web viewport via the "computer" tool.
Rules:
- There is NO browser chrome or address bar in the screenshot. To open a URL, call the "navigate" tool.
- Take a screenshot first to observe, then act. After acting, observe the new screenshot.
- Be efficient and deliberate; click precisely using pixel coordinates from the screenshot.
- NEVER attempt to solve CAPTCHAs, image challenges, 2FA/OTP codes, or phone verification. If you hit one, call "finish" with status "needs_human".
- When the goal is fully achieved, call "finish" with status "done" and a short summary.`;

/** Drops screenshot images from all but the most recent tool results to cap tokens. */
function trimImages(messages: Msg[], keepLast = 2): void {
  const toolResultMsgs = messages.filter(
    (m) => m.role === "user" && Array.isArray(m.content),
  );
  const cutoff = toolResultMsgs.length - keepLast;
  let seen = 0;
  for (const m of messages) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    const keep = seen >= cutoff;
    seen += 1;
    if (keep) continue;
    for (const block of m.content as Record<string, unknown>[]) {
      if (block.type === "tool_result" && Array.isArray(block.content)) {
        block.content = (block.content as Record<string, unknown>[]).map((c) =>
          c.type === "image"
            ? { type: "text", text: "[screenshot omitted]" }
            : c,
        );
      }
    }
  }
}

async function observation(browser: BrowserSession): Promise<{
  image: Record<string, unknown>;
  text: string;
}> {
  const [shot, els] = await Promise.all([
    browser.screenshotBase64(),
    browser.interactiveElements(),
  ]);
  return {
    image: {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: shot },
    },
    text:
      `Current URL: ${browser.url()}\n` +
      `Interactive elements: ${els.map((e) => `${e.tag}${e.type ? `[${e.type}]` : ""}:"${e.text}"`).join(", ")}`,
  };
}

/** Runs the agent until the given goal is reached, blocked, or steps run out. */
export async function runAgentGoal(
  client: Anthropic,
  browser: BrowserSession,
  stream: ProgressStream,
  opts: { goal: string; phase: ProgressPhase },
): Promise<GoalResult> {
  const obs = await observation(browser);
  const messages: Msg[] = [
    {
      role: "user",
      content: [
        { type: "text", text: `GOAL: ${opts.goal}` },
        obs.image,
        { type: "text", text: obs.text },
      ],
    },
  ];

  for (let step = 1; step <= config.maxAgentSteps; step += 1) {
    if (stream.isClosed)
      return { status: "exhausted", summary: "Client disconnected" };
    trimImages(messages);

    const resp = await client.beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      system: SYSTEM,
      tools: tools as never,
      messages: messages as never,
      betas: [COMPUTER_USE_BETA],
    });

    messages.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      const text = resp.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join(" ")
        .trim();
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Use a tool (computer, navigate, or finish) to proceed.",
          },
        ],
      });
      log.info("agent produced no tool use", {
        phase: opts.phase,
        text: text.slice(0, 120),
      });
      continue;
    }

    const results: Record<string, unknown>[] = [];
    for (const tu of toolUses) {
      const mapped = mapToolUse(
        tu.name,
        (tu.input ?? {}) as Record<string, unknown>,
      );

      if (mapped.kind === "finish") {
        stream.send({
          type: "step",
          index: step,
          action: `finish:${mapped.status}`,
          detail: mapped.summary,
        });
        return { status: mapped.status, summary: mapped.summary };
      }

      const result = await executeAction(browser, mapped.action);
      stream.send({
        type: "step",
        index: step,
        action: mapped.action.action,
        detail: result.detail,
      });

      const next = await observation(browser);
      stream.send({
        type: "screenshot",
        dataUrl: `data:image/png;base64,${(next.image.source as { data: string }).data}`,
      });
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: [next.image, { type: "text", text: next.text }],
      });
    }
    messages.push({ role: "user", content: results });
  }

  return { status: "exhausted", summary: "Reached maximum agent steps" };
}

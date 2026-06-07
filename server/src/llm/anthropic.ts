import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { VIEWPORT } from "../agent/browser.js";
import type { AgentAction } from "../types.js";

export const COMPUTER_USE_BETA = "computer-use-2025-01-24";

export function createAnthropic(): Anthropic {
  return new Anthropic({ apiKey: config.anthropicApiKey });
}

/** Tools exposed to Claude: the computer-use tool plus navigate/finish helpers. */
export const tools = [
  {
    type: "computer_20250124" as const,
    name: "computer",
    display_width_px: VIEWPORT.width,
    display_height_px: VIEWPORT.height,
    display_number: 1,
  },
  {
    name: "navigate",
    description: "Load a URL in the browser (there is no visible address bar).",
    input_schema: {
      type: "object" as const,
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "finish",
    description:
      'End the current goal. Use status="done" when the goal is achieved. ' +
      'Use status="needs_human" when blocked by a CAPTCHA, 2FA/OTP code, ' +
      "phone verification, or any login/anti-bot wall you cannot pass.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["done", "needs_human"] },
        summary: { type: "string" },
      },
      required: ["status", "summary"],
    },
  },
];

export type MappedAction =
  | { kind: "action"; action: AgentAction }
  | { kind: "finish"; status: "done" | "needs_human"; summary: string };

/** Translates a Claude tool_use block into an internal action. */
export function mapToolUse(
  name: string,
  input: Record<string, unknown>,
): MappedAction {
  if (name === "navigate") {
    return {
      kind: "action",
      action: { action: "navigate", url: String(input.url ?? "") },
    };
  }
  if (name === "finish") {
    const status = input.status === "needs_human" ? "needs_human" : "done";
    return { kind: "finish", status, summary: String(input.summary ?? "") };
  }

  // computer tool
  const ca = String(input.action ?? "screenshot");
  const coord = Array.isArray(input.coordinate)
    ? (input.coordinate as number[])
    : [0, 0];
  switch (ca) {
    case "left_click":
    case "double_click":
      return {
        kind: "action",
        action: { action: "left_click", x: coord[0], y: coord[1] },
      };
    case "type":
      return {
        kind: "action",
        action: { action: "type", text: String(input.text ?? "") },
      };
    case "key":
      return {
        kind: "action",
        action: { action: "key", key: String(input.text ?? "") },
      };
    case "scroll": {
      const amount = Number(input.scroll_amount ?? 3) * 40;
      const dir = String(input.scroll_direction ?? "down");
      const dx = dir === "left" ? -amount : dir === "right" ? amount : 0;
      const dy = dir === "up" ? -amount : dir === "down" ? amount : 0;
      return {
        kind: "action",
        action: { action: "scroll", x: coord[0], y: coord[1], dx, dy },
      };
    }
    case "wait":
      return {
        kind: "action",
        action: { action: "wait", ms: Number(input.duration ?? 1) * 1000 },
      };
    default:
      // mouse_move, cursor_position, etc. -> just re-observe
      return { kind: "action", action: { action: "screenshot" } };
  }
}

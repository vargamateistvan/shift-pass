import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import type { AgentAction } from "../types.js";
import { VIEWPORT } from "../agent/browser.js";

export function createGemini(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

export const geminiTools = [
  {
    functionDeclarations: [
      {
        name: "computer",
        description:
          "Interact with the webpage. Use action=screenshot to re-observe, left_click to click, type to type text, key to press a key, scroll to scroll, wait to pause.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string" },
            coordinate: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
            },
            text: { type: "string" },
            scroll_direction: {
              type: "string",
              enum: ["up", "down", "left", "right"],
            },
            scroll_amount: { type: "number" },
            duration: { type: "number" },
            viewport: {
              type: "object",
              properties: {
                width: { type: "number" },
                height: { type: "number" },
              },
            },
          },
          required: ["action"],
        },
      },
      {
        name: "navigate",
        description: `Load a URL in the browser. Viewport is ${VIEWPORT.width}x${VIEWPORT.height}.`,
        parameters: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
      {
        name: "finish",
        description:
          "End the current goal. Use status=done when complete, or status=needs_human for CAPTCHA/2FA/phone verification/login walls.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["done", "needs_human"] },
            summary: { type: "string" },
          },
          required: ["status", "summary"],
        },
      },
    ],
  },
];

export type MappedAction =
  | { kind: "action"; action: AgentAction }
  | { kind: "finish"; status: "done" | "needs_human"; summary: string };

export function mapGeminiToolCall(
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
      return { kind: "action", action: { action: "screenshot" } };
  }
}

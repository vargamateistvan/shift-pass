import type { BrowserSession } from "./browser.js";
import type { AgentAction } from "../types.js";
import { parseUrl } from "../lib/guard.js";

export type ExecResult = {
  detail: string;
  /** Terminal actions stop the agent loop. */
  terminal?: "done" | "needs_human";
  summary?: string;
};

/** Applies one agent action to the live browser session. */
export async function executeAction(
  browser: BrowserSession,
  action: AgentAction,
): Promise<ExecResult> {
  switch (action.action) {
    case "screenshot":
      return { detail: "captured screenshot" };

    case "navigate": {
      const url = parseUrl(action.url);
      await browser.navigate(url.toString());
      return { detail: `navigated to ${url.host}` };
    }

    case "left_click":
      await browser.click(action.x, action.y);
      return { detail: `clicked (${action.x}, ${action.y})` };

    case "scroll":
      await browser.scroll(action.x, action.y, action.dx, action.dy);
      return { detail: `scrolled (${action.dx}, ${action.dy})` };

    case "type":
      await browser.type(action.text);
      return { detail: `typed ${action.text.length} chars` };

    case "key":
      await browser.pressKey(action.key);
      return { detail: `pressed ${action.key}` };

    case "wait":
      await browser.wait(action.ms);
      return { detail: `waited ${action.ms}ms` };

    case "done":
      return {
        detail: action.summary,
        terminal: "done",
        summary: action.summary,
      };

    case "needs_human":
      return {
        detail: action.reason,
        terminal: "needs_human",
        summary: action.reason,
      };

    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

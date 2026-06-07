import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

/** Fixed viewport so Claude computer-use pixel coordinates stay consistent. */
export const VIEWPORT = { width: 1280, height: 800 };

const KEY_MAP: Record<string, string> = {
  Return: "Enter",
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  space: " ",
};

export type InteractiveEl = {
  tag: string;
  type?: string;
  text: string;
  x: number;
  y: number;
};

export type ResetHint = {
  kind: "email_input" | "reset_link" | "submit_button";
  text: string;
  x: number;
  y: number;
};

/** Wraps one Chromium page with the primitives the agent can drive. */
export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page!: Page;

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<void> {
    const targets = this.navigationTargets(url);
    let lastError: unknown;

    for (const target of targets) {
      try {
        await this.page.goto(target, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.settle();
        return;
      } catch (err) {
        lastError = err;
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : "Unknown connection error";
    throw new Error(
      `Connection error while opening ${url}. Tried: ${targets.join(", ")}. ${message}`,
    );
  }

  async click(x: number, y: number): Promise<void> {
    await this.page.mouse.click(x, y);
    await this.settle();
  }

  async scroll(x: number, y: number, dx: number, dy: number): Promise<void> {
    await this.page.mouse.move(x, y);
    await this.page.mouse.wheel(dx, dy);
    await this.settle();
  }

  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text, { delay: 20 });
  }

  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(KEY_MAP[key] ?? key);
    await this.settle();
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(Math.min(ms, 10000));
  }

  /**
   * Best-effort deterministic kickoff for forgot-password flows.
   * This reduces random click loops before the model takes over.
   */
  async kickoffResetFlow(email: string): Promise<string[]> {
    const notes: string[] = [];

    const resetTrigger = this.page
      .locator('a, button, [role="button"], [role="link"]')
      .filter({ hasText: /forgot|reset|trouble|can't sign in/i })
      .first();

    if ((await resetTrigger.count()) > 0) {
      try {
        await resetTrigger.click({ timeout: 2000 });
        notes.push("clicked reset trigger");
        await this.settle();
      } catch {
        /* continue with next heuristics */
      }
    }

    const emailInput = this.page
      .locator(
        'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]',
      )
      .first();

    if ((await emailInput.count()) > 0) {
      try {
        await emailInput.fill(email, { timeout: 2000 });
        notes.push("filled email input");
      } catch {
        /* continue with next heuristics */
      }
    }

    const submit = this.page
      .locator(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      )
      .filter({ hasText: /send|submit|continue|next|reset|email/i })
      .first();

    if ((await submit.count()) > 0) {
      try {
        await submit.click({ timeout: 2000 });
        notes.push("clicked submit button");
        await this.settle();
      } catch {
        /* continue with model loop */
      }
    }

    return notes;
  }

  url(): string {
    return this.page.url();
  }

  async screenshotBase64(): Promise<string> {
    const buf = await this.page.screenshot({ type: "png" });
    return buf.toString("base64");
  }

  /** Compact list of interactive elements to give the model textual grounding. */
  async interactiveElements(): Promise<InteractiveEl[]> {
    return this.page.evaluate(() => {
      const out: {
        tag: string;
        type?: string;
        text: string;
        x: number;
        y: number;
      }[] = [];
      const nodes = document.querySelectorAll(
        'a, button, input, textarea, [role="button"], [role="link"]',
      );
      nodes.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const he = el as HTMLElement;
        const label =
          he.getAttribute("aria-label") ||
          he.getAttribute("placeholder") ||
          he.getAttribute("name") ||
          (he.innerText || "").trim().slice(0, 60);
        out.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") ?? undefined,
          text: label,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      });
      return out.slice(0, 40);
    });
  }

  /** Targeted candidates for password-reset flows with direct click coordinates. */
  async resetHints(): Promise<ResetHint[]> {
    return this.page.evaluate(() => {
      const out: {
        kind: "email_input" | "reset_link" | "submit_button";
        text: string;
        x: number;
        y: number;
      }[] = [];

      const emailNodes = document.querySelectorAll(
        'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]',
      );
      emailNodes.forEach((el) => {
        const he = el as HTMLInputElement;
        const label =
          he.getAttribute("aria-label") ||
          he.getAttribute("placeholder") ||
          he.getAttribute("name") ||
          "email";
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        out.push({
          kind: "email_input",
          text: label.slice(0, 80),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      });

      const resetNodes = document.querySelectorAll(
        'a, button, [role="button"], [role="link"]',
      );
      resetNodes.forEach((el) => {
        const txt = ((el as HTMLElement).innerText || "").trim();
        const label =
          (el as HTMLElement).getAttribute("aria-label") ||
          txt ||
          (el as HTMLElement).getAttribute("name") ||
          "";
        const lower = label.toLowerCase();
        if (!lower) return;

        if (
          lower.includes("forgot") ||
          lower.includes("reset") ||
          lower.includes("trouble") ||
          lower.includes("can't sign in")
        ) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            out.push({
              kind: "reset_link",
              text: label.slice(0, 80),
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          }
        }

        if (
          lower.includes("send") ||
          lower.includes("submit") ||
          lower.includes("continue") ||
          lower.includes("next")
        ) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            out.push({
              kind: "submit_button",
              text: label.slice(0, 80),
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          }
        }
      });

      return out.slice(0, 20);
    });
  }

  /** Best-effort wait for navigation/network to quiesce. */
  private async settle(): Promise<void> {
    try {
      await this.page.waitForLoadState("networkidle", { timeout: 4000 });
    } catch {
      /* networkidle is best-effort; ignore timeouts */
    }
  }

  /**
   * Build a small set of safe URL fallbacks for common hostname/protocol issues.
   * Example: https://www.example.com -> https://example.com -> http://example.com
   */
  private navigationTargets(rawUrl: string): string[] {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return [rawUrl];
    }

    const out = [parsed.toString()];
    const hostNoWww = parsed.hostname.replace(/^www\./i, "");

    if (hostNoWww !== parsed.hostname) {
      const withoutWww = new URL(parsed.toString());
      withoutWww.hostname = hostNoWww;
      out.push(withoutWww.toString());
    }

    if (parsed.protocol === "https:") {
      const httpUrl = new URL(parsed.toString());
      httpUrl.protocol = "http:";
      out.push(httpUrl.toString());

      if (hostNoWww !== parsed.hostname) {
        const httpNoWww = new URL(httpUrl.toString());
        httpNoWww.hostname = hostNoWww;
        out.push(httpNoWww.toString());
      }
    }

    return [...new Set(out)];
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }
}

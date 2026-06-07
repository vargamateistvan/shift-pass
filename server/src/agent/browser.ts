import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
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

    const tryClickCandidates = async (
      locator: Locator,
      label: string,
      maxCandidates = 6,
    ): Promise<boolean> => {
      const total = Math.min(await locator.count(), maxCandidates);
      for (let i = 0; i < total; i += 1) {
        const candidate = locator.nth(i);
        try {
          await candidate.scrollIntoViewIfNeeded({ timeout: 1000 });
        } catch {
          /* best effort */
        }
        try {
          await candidate.click({ timeout: 1800 });
          notes.push(`clicked ${label}${i > 0 ? ` #${i + 1}` : ""}`);
          await this.settle();
          return true;
        } catch {
          /* try next candidate */
        }
      }
      return false;
    };

    const tryClickScored = async (
      kind: "reset" | "submit",
      label: string,
      maxCandidates = 6,
    ): Promise<boolean> => {
      const candidates = await this.page.evaluate((k) => {
        const nodes = document.querySelectorAll(
          'a, button, input, [role="button"], [role="link"]',
        );
        const out: Array<{
          x: number;
          y: number;
          score: number;
          text: string;
        }> = [];

        nodes.forEach((node) => {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const text = (
            el.innerText ||
            el.getAttribute("aria-label") ||
            el.getAttribute("name") ||
            el.getAttribute("id") ||
            ""
          )
            .trim()
            .toLowerCase();
          const href = (el.getAttribute("href") || "").toLowerCase();
          const id = (el.getAttribute("id") || "").toLowerCase();
          const cls = (el.getAttribute("class") || "").toLowerCase();
          const type = (el.getAttribute("type") || "").toLowerCase();
          const blob = [text, href, id, cls, type].join(" ");

          let score = 0;
          if (k === "reset") {
            if (blob.includes("forgot")) score += 8;
            if (blob.includes("reset")) score += 7;
            if (blob.includes("recover")) score += 5;
            if (blob.includes("trouble")) score += 4;
            if (blob.includes("password")) score += 3;
            if (href.includes("forgot") || href.includes("reset")) score += 4;
          } else {
            if (blob.includes("submit")) score += 7;
            if (blob.includes("send")) score += 6;
            if (blob.includes("continue")) score += 5;
            if (blob.includes("next")) score += 4;
            if (blob.includes("request")) score += 4;
            if (blob.includes("email")) score += 2;
            if (type === "submit") score += 5;
          }

          if (score > 0) {
            out.push({
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              score,
              text: text.slice(0, 80),
            });
          }
        });

        out.sort((a, b) => b.score - a.score);
        return out.slice(0, 12);
      }, kind);

      for (let i = 0; i < Math.min(candidates.length, maxCandidates); i += 1) {
        const c = candidates[i];
        try {
          await this.click(c.x, c.y);
          notes.push(
            `clicked ${label}${i > 0 ? ` #${i + 1}` : ""} (${c.text || "scored candidate"})`,
          );
          return true;
        } catch {
          /* try next scored candidate */
        }
      }

      return false;
    };

    const resetByText = this.page
      .locator('a, button, [role="button"], [role="link"]')
      .filter({ hasText: /forgot|reset|trouble|can't sign in|recover/i });
    const resetByAria = this.page.locator(
      [
        '[aria-label*="forgot" i]',
        '[aria-label*="reset" i]',
        '[aria-label*="recover" i]',
      ].join(", "),
    );

    const signInTriggers = this.page
      .locator('a, button, [role="button"], [role="link"]')
      .filter({ hasText: /sign in|log in|login|account/i });

    let clickedReset =
      (await tryClickCandidates(resetByText, "reset trigger")) ||
      (await tryClickCandidates(resetByAria, "reset trigger (aria)")) ||
      (await tryClickScored("reset", "reset trigger (scored)"));

    // If reset controls are hidden behind a sign-in entry point, open it first.
    if (!clickedReset) {
      const clickedSignIn = await tryClickCandidates(
        signInTriggers,
        "sign-in trigger",
        3,
      );
      if (clickedSignIn) {
        notes.push("opened sign-in view");
        clickedReset =
          (await tryClickCandidates(
            resetByText,
            "reset trigger after sign-in",
          )) ||
          (await tryClickCandidates(
            resetByAria,
            "reset trigger (aria) after sign-in",
          )) ||
          (await tryClickScored(
            "reset",
            "reset trigger (scored) after sign-in",
          ));
      }
    }

    if (!clickedReset) {
      notes.push("reset trigger not found");
      return notes;
    }

    const emailInput = this.page
      .locator(
        [
          'input[type="email"]',
          'input[name*="email" i]',
          'input[id*="email" i]',
          'input[autocomplete="email"]',
          'input[name*="user" i]',
          'input[id*="user" i]',
        ].join(", "),
      )
      .first();

    if ((await emailInput.count()) > 0) {
      try {
        await emailInput.fill(email, { timeout: 2000 });
        notes.push("filled email input");

        try {
          await emailInput.press("Enter", { timeout: 1000 });
          notes.push("pressed Enter on email input");
          await this.settle();
        } catch {
          /* Enter may not submit; try explicit form submit below */
        }

        try {
          await emailInput.evaluate((el) => {
            const form = (el as HTMLInputElement).form;
            if (form) {
              if (typeof form.requestSubmit === "function") {
                form.requestSubmit();
              } else {
                form.submit();
              }
            }
          });
          notes.push("submitted parent form");
          await this.settle();
        } catch {
          /* ignore; fallback submit-button click still applies */
        }
      } catch {
        /* continue with next heuristics */
      }
    } else {
      notes.push("email input not found");
      return notes;
    }

    const submitByText = this.page
      .locator(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      )
      .filter({ hasText: /send|submit|continue|next|reset|email|request/i });
    const submitByAria = this.page.locator(
      [
        '[aria-label*="send" i]',
        '[aria-label*="submit" i]',
        '[aria-label*="continue" i]',
        '[aria-label*="next" i]',
        '[aria-label*="request" i]',
      ].join(", "),
    );

    const clickedSubmit =
      (await tryClickCandidates(submitByText, "submit button")) ||
      (await tryClickCandidates(submitByAria, "submit button (aria)")) ||
      (await tryClickScored("submit", "submit button (scored)"));
    if (!clickedSubmit) {
      notes.push("submit button not found");
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

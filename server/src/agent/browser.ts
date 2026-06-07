import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/** Fixed viewport so Claude computer-use pixel coordinates stay consistent. */
export const VIEWPORT = { width: 1280, height: 800 };

const KEY_MAP: Record<string, string> = {
  Return: 'Enter',
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  space: ' ',
};

export type InteractiveEl = {
  tag: string;
  type?: string;
  text: string;
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
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    });
    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.settle();
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

  url(): string {
    return this.page.url();
  }

  async screenshotBase64(): Promise<string> {
    const buf = await this.page.screenshot({ type: 'png' });
    return buf.toString('base64');
  }

  /** Compact list of interactive elements to give the model textual grounding. */
  async interactiveElements(): Promise<InteractiveEl[]> {
    return this.page.evaluate(() => {
      const out: { tag: string; type?: string; text: string }[] = [];
      const nodes = document.querySelectorAll(
        'a, button, input, textarea, [role="button"], [role="link"]',
      );
      nodes.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const he = el as HTMLElement;
        const label =
          he.getAttribute('aria-label') ||
          he.getAttribute('placeholder') ||
          he.getAttribute('name') ||
          (he.innerText || '').trim().slice(0, 60);
        out.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? undefined,
          text: label,
        });
      });
      return out.slice(0, 40);
    });
  }

  /** Best-effort wait for navigation/network to quiesce. */
  private async settle(): Promise<void> {
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 4000 });
    } catch {
      /* networkidle is best-effort; ignore timeouts */
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }
}

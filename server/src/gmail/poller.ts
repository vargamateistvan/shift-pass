import { log } from "../lib/logger.js";
import type { ProgressStream } from "../lib/sse.js";
import { searchMessages } from "./client.js";
import {
  extractResetCode,
  extractResetLink,
  looksLikeReset,
  rootDomain,
} from "./extract.js";

export type ResetEmail = {
  messageId: string;
  link: string | null;
  code: string | null;
};

/**
 * Polls Gmail until a reset email for `host` arrives (or timeout).
 * Only considers messages received after `startedAtMs`.
 */
export async function pollForResetEmail(
  token: string,
  host: string,
  startedAtMs: number,
  stream: ProgressStream,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ResetEmail | null> {
  const domain = rootDomain(host);
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  const query = `newer_than:1h (from:${domain} OR subject:(reset OR password OR verify OR recover))`;

  while (Date.now() < deadline) {
    if (stream.isClosed) return null;
    try {
      const messages = await searchMessages(token, query);
      const match = messages
        .filter((m) => m.internalDate >= startedAtMs - 60000)
        .sort((a, b) => b.internalDate - a.internalDate)
        .find((m) => looksLikeReset(m, domain));

      if (match) {
        const link = extractResetLink(match.body, domain);
        const code = extractResetCode(match.body);
        log.info("reset email found", {
          messageId: match.id,
          hasLink: Boolean(link),
        });
        stream.send({
          type: "phase",
          phase: "reading_email",
          message: link
            ? "Reset link found in email"
            : "Reset code found in email",
        });
        return { messageId: match.id, link, code };
      }
    } catch (err) {
      log.warn("gmail poll error", {
        message: err instanceof Error ? err.message : "unknown",
      });
    }

    const remaining = Math.round((deadline - Date.now()) / 1000);
    stream.send({
      type: "phase",
      phase: "awaiting_email",
      message: `Waiting for reset email… (${remaining}s left)`,
    });
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null;
}

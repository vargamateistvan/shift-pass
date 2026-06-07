/** Best-effort registrable domain (handles common multi-part TLDs). */
export function rootDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const multi = /^(co|com|org|net|gov|ac|edu)$/;
  const last2 = labels.slice(-2).join('.');
  if (multi.test(labels[labels.length - 2])) return labels.slice(-3).join('.');
  return last2;
}

const RESET_HINTS = /(reset|password|recover|verify|confirm|set[-\s]?up|account)/i;
const TOKEN_HINTS = /(reset|token|verify|confirm|recover|password|set|change|action)/i;

/** Picks the most likely password-reset link from an email body. */
export function extractResetLink(body: string, domain: string): string | null {
  const urls = [...body.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].map((m) =>
    m[0].replace(/[.,;]+$/, ''),
  );
  if (urls.length === 0) return null;

  const scored = urls
    .map((u) => {
      let score = 0;
      let host: string;
      try {
        host = new URL(u).host.toLowerCase();
      } catch {
        return { u, score: -1 };
      }
      if (host.endsWith(domain)) score += 3;
      if (TOKEN_HINTS.test(u)) score += 2;
      if (/[?&/](token|code|key|t|oobCode|reset)=?/i.test(u)) score += 2;
      if (/unsubscribe|privacy|terms|help|support/i.test(u)) score -= 3;
      return { u, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 && scored[0].score > 0 ? scored[0].u : null;
}

/** Extracts a numeric/alphanumeric OTP-style code when no link is present. */
export function extractResetCode(body: string): string | null {
  const codeContext = body.match(/(?:code|otp|pin)[^\d]{0,20}([0-9]{4,8})/i);
  if (codeContext) return codeContext[1];
  const standalone = body.match(/\b([0-9]{6})\b/);
  return standalone ? standalone[1] : null;
}

/** True if a message plausibly is the reset email for the target domain. */
export function looksLikeReset(
  msg: { from: string; subject: string; body: string },
  domain: string,
): boolean {
  const fromMatch = msg.from.toLowerCase().includes(domain);
  const subjectMatch = RESET_HINTS.test(msg.subject);
  const bodyLink = extractResetLink(msg.body, domain) !== null;
  return (fromMatch && (subjectMatch || bodyLink)) || (subjectMatch && bodyLink);
}

export { RESET_HINTS };

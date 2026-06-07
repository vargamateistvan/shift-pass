import { config } from "../config.js";

export function parseUrl(raw: string): URL {
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are supported");
  }
  return url;
}

/** Throws if the target host is not permitted by ALLOWED_DOMAINS (when set). */
export function assertDomainAllowed(url: URL): void {
  if (config.allowedDomains.length === 0) return;
  const host = url.hostname.toLowerCase();
  const ok = config.allowedDomains.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  if (!ok) {
    throw new Error(`Domain not allowed: ${host}. Add it to ALLOWED_DOMAINS.`);
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

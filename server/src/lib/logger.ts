import { inspect } from "node:util";

/* Tiny structured logger. Never logs secrets (passwords, tokens, keys). */
const SECRET_KEYS = /(password|token|secret|key|authorization)/i;
const RESET = "\x1b[0m";

function color(code: string, value: string): string {
  return `${code}${value}${RESET}`;
}

function levelTag(level: string): string {
  switch (level) {
    case "info":
      return color("\x1b[36m", "INFO");
    case "warn":
      return color("\x1b[33m", "WARN");
    case "error":
      return color("\x1b[31m", "ERROR");
    default:
      return level.toUpperCase();
  }
}

function shouldUseColor(): boolean {
  return process.stdout.isTTY && process.env.NO_COLOR === undefined;
}

function shouldUsePrettyLogs(): boolean {
  if (process.env.LOG_PRETTY === "0" || process.env.LOG_PRETTY === "false") {
    return false;
  }

  if (process.env.LOG_PRETTY === "1" || process.env.LOG_PRETTY === "true") {
    return true;
  }

  return process.stdout.isTTY;
}

function redact(
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

function emit(
  level: string,
  msg: string,
  meta?: Record<string, unknown>,
): void {
  const ts = new Date().toISOString();
  const safeMeta = redact(meta);

  if (!shouldUsePrettyLogs()) {
    const line = { ts, level, msg, ...safeMeta };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
    return;
  }

  const tag = shouldUseColor() ? levelTag(level) : level.toUpperCase();
  const prefix = `${tag} ${ts} ${msg}`;

  if (!safeMeta || Object.keys(safeMeta).length === 0) {
    // eslint-disable-next-line no-console
    console.log(prefix);
    return;
  }

  const renderedMeta = inspect(safeMeta, {
    colors: shouldUseColor(),
    depth: 5,
    compact: true,
    breakLength: 120,
  });

  // eslint-disable-next-line no-console
  console.log(`${prefix} ${renderedMeta}`);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    emit("error", msg, meta),
};

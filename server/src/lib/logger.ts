/* Tiny structured logger. Never logs secrets (passwords, tokens, keys). */
const SECRET_KEYS = /(password|token|secret|key|authorization)/i;

function redact(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  }
  return out;
}

function emit(level: string, msg: string, meta?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), level, msg, ...redact(meta) };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};

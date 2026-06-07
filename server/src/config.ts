import 'dotenv/config';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 8787),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  vaultKey: process.env.VAULT_KEY ?? '',
  allowedDomains: (process.env.ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  dryRun: bool(process.env.DRY_RUN, true),
  maxAgentSteps: int(process.env.MAX_AGENT_STEPS, 40),
};

export type Config = typeof config;

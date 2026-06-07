import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseAllowedDomains(value: string | undefined): string[] {
  const domains = (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  // "*" means allow any domain.
  if (domains.includes("*")) {
    return [];
  }

  return domains;
}

export const config = {
  port: int(process.env.PORT, 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash",
  vaultKey: process.env.VAULT_KEY ?? "",
  allowedDomains: parseAllowedDomains(process.env.ALLOWED_DOMAINS),
  dryRun: bool(process.env.DRY_RUN, true),
  maxAgentSteps: int(process.env.MAX_AGENT_STEPS, 40),
};

export type Config = typeof config;

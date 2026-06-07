import { Router } from "express";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    dryRun: config.dryRun,
    anthropicConfigured: Boolean(config.anthropicApiKey),
    vaultConfigured: Boolean(config.vaultKey),
    allowlist: config.allowedDomains,
  });
});

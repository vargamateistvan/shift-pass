import { Router } from "express";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    dryRun: config.dryRun,
    geminiConfigured: Boolean(config.geminiApiKey),
    vaultConfigured: Boolean(config.vaultKey),
    allowlist: config.allowedDomains,
  });
});

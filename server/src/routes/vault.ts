import { Router } from "express";
import { listEntries } from "../vault/vault.js";

export const vaultRouter = Router();

vaultRouter.get("/vault", async (_req, res) => {
  try {
    const entries = await listEntries(false);
    res.json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Vault error" });
  }
});

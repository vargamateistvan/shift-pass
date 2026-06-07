import { Router } from "express";
import { SseStream } from "../lib/sse.js";
import {
  getBackgroundRotation,
  startBackgroundRotation,
} from "../agent/background.js";
import { runRotation } from "../agent/orchestrator.js";
import type { RotateRequest } from "../types.js";

export const rotateRouter = Router();

rotateRouter.post("/rotate", async (req, res) => {
  const body = req.body as Partial<RotateRequest>;
  if (!body?.url || !body?.email || !body?.googleAccessToken) {
    res
      .status(400)
      .json({ error: "url, email and googleAccessToken are required" });
    return;
  }

  const stream = new SseStream(res);
  await runRotation(
    {
      url: body.url,
      email: body.email,
      googleAccessToken: body.googleAccessToken,
    },
    stream,
  );
});

rotateRouter.post("/rotate/background", (req, res) => {
  try {
    const body = req.body as Partial<RotateRequest>;
    if (!body?.url || !body?.email || !body?.googleAccessToken) {
      res
        .status(400)
        .json({ error: "url, email and googleAccessToken are required" });
      return;
    }

    const job = startBackgroundRotation({
      url: body.url,
      email: body.email,
      googleAccessToken: body.googleAccessToken,
    });

    res.status(202).json({ job });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to start job",
    });
  }
});

rotateRouter.get("/rotate/background/:jobId", (req, res) => {
  const job = getBackgroundRotation(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Background job not found" });
    return;
  }

  res.json({ job });
});

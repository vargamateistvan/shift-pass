import { Router } from "express";
import { SseStream } from "../lib/sse.js";
import {
  getBackgroundRotation,
  listBackgroundRotations,
  startBackgroundRotation,
} from "../agent/background.js";
import { runRotation } from "../agent/orchestrator.js";
import type { BackgroundJobStatus, RotateRequest } from "../types.js";

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

rotateRouter.get("/rotate/background", (req, res) => {
  const email =
    typeof req.query.email === "string" ? req.query.email : undefined;
  const host = typeof req.query.host === "string" ? req.query.host : undefined;
  const url = typeof req.query.url === "string" ? req.query.url : undefined;
  const status =
    typeof req.query.status === "string"
      ? (req.query.status as BackgroundJobStatus)
      : undefined;
  const activeOnly = req.query.activeOnly === "true";
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  const jobs = listBackgroundRotations({
    email,
    host,
    url,
    status,
    activeOnly,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  res.json({ jobs });
});

rotateRouter.get("/rotate/background/:jobId", (req, res) => {
  const job = getBackgroundRotation(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Background job not found" });
    return;
  }

  res.json({ job });
});

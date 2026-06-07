import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import type {
  BackgroundJobStatus,
  ProgressEvent,
  RotateRequest,
} from "../types.js";
import type { ProgressStream } from "../lib/sse.js";
import { runRotation } from "./orchestrator.js";

export interface BackgroundJobResult {
  site: string;
  email: string;
  password: string;
}

export interface BackgroundJobSnapshot {
  id: string;
  url: string;
  email: string;
  status: BackgroundJobStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  result: BackgroundJobResult | null;
  error: string | null;
  recentEvents: Array<{
    type: "phase" | "step" | "needs_human" | "done" | "error";
    text: string;
  }>;
}

interface BackgroundJobRecord extends BackgroundJobSnapshot {
  recentEvents: BackgroundJobSnapshot["recentEvents"];
}

type EncFile = { v: 1; iv: string; tag: string; data: string };

const JOBS_PATH = fileURLToPath(
  new URL("../../background-jobs.json", import.meta.url),
);
const jobs = loadJobs();

function key(): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(config.vaultKey)) {
    throw new Error(
      "VAULT_KEY must be 64 hex chars (32 bytes). See server/.env.example",
    );
  }
  return Buffer.from(config.vaultKey, "hex");
}

function encrypt(records: BackgroundJobRecord[]): EncFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(records), "utf8"),
    cipher.final(),
  ]);

  return {
    v: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: data.toString("hex"),
  };
}

function decrypt(file: EncFile): BackgroundJobRecord[] {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(file.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(file.tag, "hex"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(file.data, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(out.toString("utf8")) as BackgroundJobRecord[];
}

function now(): string {
  return new Date().toISOString();
}

function reviveJob(job: BackgroundJobRecord): BackgroundJobRecord {
  const normalized: BackgroundJobRecord = {
    ...job,
    recentEvents: Array.isArray(job.recentEvents) ? [...job.recentEvents] : [],
    result: job.result ?? null,
    error: job.error ?? null,
  };

  if (
    normalized.status === "queued" ||
    normalized.status === "starting" ||
    normalized.status === "navigating" ||
    normalized.status === "requesting_reset" ||
    normalized.status === "awaiting_email" ||
    normalized.status === "reading_email" ||
    normalized.status === "setting_password" ||
    normalized.status === "saving"
  ) {
    normalized.status = "error";
    normalized.message =
      "Server restarted before the background rotation completed. Start a new run.";
    normalized.error = normalized.message;
    normalized.updatedAt = now();
    normalized.recentEvents.push({ type: "error", text: normalized.message });
    normalized.recentEvents = normalized.recentEvents.slice(-10);
  }

  return normalized;
}

function loadJobs(): Map<string, BackgroundJobRecord> {
  if (!existsSync(JOBS_PATH)) return new Map();
  try {
    const raw = readFileSync(JOBS_PATH, "utf8");
    if (!raw.trim()) return new Map();
    const records = decrypt(JSON.parse(raw) as EncFile).map(reviveJob);
    return new Map(records.map((job) => [job.id, job]));
  } catch (err) {
    log.warn("failed to load background jobs", {
      message: err instanceof Error ? err.message : "Unknown error",
    });
    return new Map();
  }
}

function persistJobs(): void {
  const records = [...jobs.values()];
  writeFileSync(JOBS_PATH, JSON.stringify(encrypt(records)), "utf8");
}

function formatStep(action: string, detail?: string): string {
  return detail ? action + ": " + detail : action;
}

class BackgroundJobStream implements ProgressStream {
  constructor(private readonly jobId: string) {}

  get isClosed(): boolean {
    return false;
  }

  send(event: ProgressEvent): void {
    const job = jobs.get(this.jobId);
    if (!job) return;

    job.updatedAt = new Date().toISOString();

    switch (event.type) {
      case "phase":
        job.status = event.phase;
        job.message = event.message;
        job.recentEvents.push({ type: "phase", text: event.message });
        break;
      case "step":
        job.message = formatStep(event.action, event.detail);
        job.recentEvents.push({
          type: "step",
          text: "→ " + formatStep(event.action, event.detail),
        });
        break;
      case "needs_human":
        job.status = "needs_human";
        job.message = event.message;
        job.recentEvents.push({ type: "needs_human", text: event.message });
        break;
      case "done":
        job.status = "done";
        job.message = `Completed for ${event.site}`;
        job.result = {
          site: event.site,
          email: event.email,
          password: event.password,
        };
        job.recentEvents.push({ type: "done", text: job.message });
        break;
      case "error":
        job.status = "error";
        job.message = event.message;
        job.error = event.message;
        job.recentEvents.push({ type: "error", text: event.message });
        break;
    }

    job.recentEvents = job.recentEvents.slice(-10);
    persistJobs();
  }

  close(): void {
    /* detached background stream never closes early */
  }
}

export function startBackgroundRotation(
  req: RotateRequest,
): BackgroundJobSnapshot {
  const id = randomUUID();
  const startedAt = now();
  const job: BackgroundJobRecord = {
    id,
    url: req.url,
    email: req.email,
    status: "queued",
    message: "Queued",
    createdAt: startedAt,
    updatedAt: startedAt,
    result: null,
    error: null,
    recentEvents: [],
  };
  jobs.set(id, job);
  persistJobs();

  void runRotation(req, new BackgroundJobStream(id)).catch((err) => {
    log.error("background rotation crashed", {
      jobId: id,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    const next = jobs.get(id);
    if (next) {
      next.status = "error";
      next.message = err instanceof Error ? err.message : "Unknown error";
      next.error = next.message;
      next.updatedAt = now();
      next.recentEvents.push({ type: "error", text: next.message });
      next.recentEvents = next.recentEvents.slice(-10);
      persistJobs();
    }
  });

  const started = jobs.get(id);
  if (started) {
    started.status = "starting";
    started.message = "Running in the background";
    started.updatedAt = now();
    persistJobs();
  }

  return snapshot(id);
}

export function getBackgroundRotation(
  jobId: string,
): BackgroundJobSnapshot | null {
  return jobs.has(jobId) ? snapshot(jobId) : null;
}

function snapshot(jobId: string): BackgroundJobSnapshot {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("Unknown background job");
  }

  return {
    id: job.id,
    url: job.url,
    email: job.email,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
    recentEvents: [...job.recentEvents],
  };
}

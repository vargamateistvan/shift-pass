export type RotateProgress =
  | { type: "phase"; phase: string; message: string }
  | { type: "step"; index: number; action: string; detail?: string }
  | { type: "screenshot"; dataUrl: string }
  | { type: "needs_human"; reason: string; message: string }
  | { type: "done"; site: string; email: string; password: string }
  | { type: "error"; message: string };

export interface RotateParams {
  url: string;
  email: string;
  googleAccessToken: string;
}

export interface BackgroundRotationJob {
  id: string;
  url: string;
  email: string;
  status:
    | "queued"
    | "starting"
    | "navigating"
    | "requesting_reset"
    | "awaiting_email"
    | "reading_email"
    | "setting_password"
    | "saving"
    | "done"
    | "needs_human"
    | "error";
  message: string;
  terminalSummary: string | null;
  createdAt: string;
  updatedAt: string;
  result: { site: string; email: string; password: string } | null;
  error: string | null;
  recentEvents: Array<{ type: string; text: string }>;
}

export interface BackgroundRotationJobFilters {
  email?: string;
  host?: string;
  url?: string;
  status?: BackgroundRotationJob["status"];
  activeOnly?: boolean;
  limit?: number;
}

function serverError(status: number, detail: string): Error {
  return new Error("Server error " + status + (detail ? ": " + detail : ""));
}

function parseFrame(frame: string): RotateProgress | null {
  const line = frame.split("\n").find((entry) => entry.startsWith("data:"));
  if (!line) return null;

  const json = line.slice(5).trim();
  if (!json) return null;

  try {
    return JSON.parse(json) as RotateProgress;
  } catch {
    return null;
  }
}

/**
 * Calls the backend rotate endpoint and yields progress events parsed from the
 * Server-Sent-Events stream. SSE-over-POST, so we read the fetch body directly.
 */
export async function* streamRotation(
  params: RotateParams,
  signal?: AbortSignal,
): AsyncGenerator<RotateProgress> {
  const res = await fetch("/api/rotate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw serverError(res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseFrame(frame);
      if (event) yield event;
    }
  }
}

async function jsonFetch<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, { ...init, signal });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw serverError(res.status, detail);
  }

  return (await res.json()) as T;
}

export async function startBackgroundRotation(
  params: RotateParams,
  signal?: AbortSignal,
): Promise<BackgroundRotationJob> {
  const data = await jsonFetch<{ job: BackgroundRotationJob }>(
    "/api/rotate/background",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    signal,
  );

  return data.job;
}

export async function getBackgroundRotationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<BackgroundRotationJob> {
  const data = await jsonFetch<{ job: BackgroundRotationJob }>(
    `/api/rotate/background/${jobId}`,
    { method: "GET" },
    signal,
  );

  return data.job;
}

export async function listBackgroundRotationJobs(
  filters: BackgroundRotationJobFilters = {},
  signal?: AbortSignal,
): Promise<BackgroundRotationJob[]> {
  const params = new URLSearchParams();

  if (filters.email) {
    params.set("email", filters.email);
  }

  if (filters.host) {
    params.set("host", filters.host);
  }

  if (filters.url) {
    params.set("url", filters.url);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.activeOnly) {
    params.set("activeOnly", "true");
  }

  if (typeof filters.limit === "number" && filters.limit > 0) {
    params.set("limit", String(filters.limit));
  }

  const query = params.toString();
  const data = await jsonFetch<{ jobs: BackgroundRotationJob[] }>(
    query ? `/api/rotate/background?${query}` : "/api/rotate/background",
    { method: "GET" },
    signal,
  );

  return data.jobs;
}

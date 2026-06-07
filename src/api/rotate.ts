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
    throw new Error(`Server error ${res.status}${detail ? `: ${detail}` : ""}`);
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
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as RotateProgress;
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

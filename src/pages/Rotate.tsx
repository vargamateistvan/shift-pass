import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  getBackgroundRotationJob,
  streamRotation,
  type BackgroundRotationJob,
  type RotateProgress,
} from "../api/rotate";

type BackgroundJobSource = "tracked" | "fallback";

type Status = "idle" | "running" | "needs_human" | "done" | "error";

interface LogLine {
  text: string;
  tone: "info" | "step" | "warn" | "error";
}

function formatBackgroundStatus(
  status: BackgroundRotationJob["status"],
): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "starting":
      return "Starting";
    case "navigating":
      return "Opening site";
    case "requesting_reset":
      return "Requesting reset";
    case "awaiting_email":
      return "Waiting for email";
    case "reading_email":
      return "Reading email";
    case "setting_password":
      return "Setting password";
    case "saving":
      return "Saving";
    case "done":
      return "Done";
    case "needs_human":
      return "Needs human";
    case "error":
      return "Error";
  }
}

function formatStep(action: string, detail?: string): string {
  return detail ? action + ": " + detail : action;
}

function formatBackgroundSource(source: BackgroundJobSource): string {
  return source === "tracked" ? "Linked via saved job" : "Matched via fallback";
}

export function Rotate() {
  const location = useLocation();

  return <RotateForm key={location.search} />;
}

function RotateForm() {
  const { getToken } = useAuth();
  const [searchParams] = useSearchParams();
  const backgroundJobId = searchParams.get("job");
  const backgroundSource = searchParams.get("source");
  const [url, setUrl] = useState(searchParams.get("url") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [shots, setShots] = useState<string[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [backgroundShotIndex, setBackgroundShotIndex] = useState(0);
  const [result, setResult] = useState<{
    site: string;
    password: string;
  } | null>(null);
  const [backgroundJob, setBackgroundJob] =
    useState<BackgroundRotationJob | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [backgroundCopied, setBackgroundCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const append = (line: LogLine) => setLog((prev) => [...prev, line]);

  useEffect(() => {
    if (!backgroundJobId) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const job = await getBackgroundRotationJob(
          backgroundJobId,
          controller.signal,
        );
        if (cancelled) return;

        setBackgroundJob(job);
        setBackgroundError(null);

        if (job.status === "done") {
          setBackgroundCopied(false);
        }

        if (
          job.status === "done" ||
          job.status === "needs_human" ||
          job.status === "error"
        ) {
          return;
        }

        timer = globalThis.setTimeout(poll, 3000);
      } catch (err) {
        if (cancelled) return;
        setBackgroundError(
          err instanceof Error ? err.message : "Failed to load background job.",
        );
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
    };
  }, [backgroundJobId]);

  const handle = (ev: RotateProgress) => {
    switch (ev.type) {
      case "phase":
        append({ text: ev.message, tone: "info" });
        break;
      case "step":
        append({
          text: "→ " + formatStep(ev.action, ev.detail),
          tone: "step",
        });
        break;
      case "screenshot":
        setShots((prev) => {
          const next = [...prev, ev.dataUrl];
          setShotIndex(next.length - 1);
          return next;
        });
        break;
      case "needs_human":
        append({ text: ev.message, tone: "warn" });
        setStatus("needs_human");
        break;
      case "done":
        setResult({ site: ev.site, password: ev.password });
        setStatus("done");
        break;
      case "error":
        append({ text: ev.message, tone: "error" });
        setStatus("error");
        break;
    }
  };

  const start = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("running");
    setLog([]);
    setShots([]);
    setShotIndex(0);
    setResult(null);
    setCopied(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const googleAccessToken = await getToken();
      for await (const ev of streamRotation(
        { url, email, googleAccessToken },
        controller.signal,
      )) {
        handle(ev);
      }
      setStatus((s) => (s === "running" ? "idle" : s));
    } catch (err) {
      if (!controller.signal.aborted) {
        append({
          text: err instanceof Error ? err.message : "Request failed",
          tone: "error",
        });
        setStatus("error");
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
    append({ text: "Cancelled.", tone: "warn" });
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.password);
    setCopied(true);
  };

  const copyBackgroundPassword = async () => {
    if (!backgroundJob?.result) return;
    await navigator.clipboard.writeText(backgroundJob.result.password);
    setBackgroundCopied(true);
  };

  const running = status === "running";
  const backgroundDone = backgroundJob?.status === "done";
  const backgroundNeedsHuman = backgroundJob?.status === "needs_human";
  const backgroundFailed = backgroundJob?.status === "error";
  const backgroundStatus = backgroundJob?.status ?? "queued";
  const isBackgroundMode = Boolean(backgroundJobId);
  const safeShotIndex =
    shots.length > 0 ? Math.max(0, Math.min(shotIndex, shots.length - 1)) : 0;
  const currentForegroundShot = shots.length > 0 ? shots[safeShotIndex] : null;
  const backgroundShots = backgroundJob?.screenshots ?? [];
  const safeBackgroundShotIndex =
    backgroundShots.length > 0
      ? Math.max(0, Math.min(backgroundShotIndex, backgroundShots.length - 1))
      : 0;
  const currentBackgroundShot =
    backgroundShots.length > 0
      ? backgroundShots[safeBackgroundShotIndex]
      : (backgroundJob?.latestScreenshot ?? null);
  const backgroundSourceLabel =
    backgroundSource === "tracked" || backgroundSource === "fallback"
      ? formatBackgroundSource(backgroundSource)
      : null;

  const canPrevForeground = shots.length > 0 && safeShotIndex > 0;
  const canNextForeground =
    shots.length > 0 && safeShotIndex < shots.length - 1;
  const canPrevBackground =
    backgroundShots.length > 0 && safeBackgroundShotIndex > 0;
  const canNextBackground =
    backgroundShots.length > 0 &&
    safeBackgroundShotIndex < backgroundShots.length - 1;

  return (
    <div className="page">
      <div className="page-head">
        {isBackgroundMode && (
          <Link to="/app/passwords" className="rotate-back-link">
            Back to Password page
          </Link>
        )}
        <h2>Rotate password</h2>
      </div>
      <p className="muted rotate-intro">
        {isBackgroundMode
          ? "This background run is being handled on the server. You can keep this page open to follow progress and copy the result when it finishes."
          : "An AI agent opens the site, requests a reset, reads the email from your inbox, and sets a new strong password — you just click the button."}
      </p>

      {backgroundJobId && (
        <section className="rotate-background">
          <div className="rotate-background-head">
            <h3>Background job</h3>
            <span className={`vault-status vault-${backgroundStatus}`}>
              {formatBackgroundStatus(backgroundStatus)}
            </span>
          </div>
          {backgroundSourceLabel && (
            <p className="rotate-context-note">{backgroundSourceLabel}</p>
          )}
          {backgroundError && <p className="error">{backgroundError}</p>}
          {backgroundJob && (
            <>
              <p className="muted">{backgroundJob.message}</p>
              {backgroundNeedsHuman && (
                <div className="rotate-human rotate-background-alert">
                  ⚠ {backgroundJob.terminalSummary ?? backgroundJob.message}
                </div>
              )}
              {backgroundFailed && (
                <div className="rotate-error rotate-background-alert">
                  <strong>Background run failed.</strong>
                  <span>
                    {backgroundJob.terminalSummary ??
                      backgroundJob.error ??
                      backgroundJob.message}
                  </span>
                </div>
              )}
              {currentBackgroundShot && (
                <div className="rotate-screenshot rotate-background-preview">
                  <img
                    src={currentBackgroundShot}
                    alt="Background agent browser view"
                  />
                </div>
              )}
              {backgroundShots.length > 0 && (
                <div
                  className="rotate-stepper"
                  aria-label="Background screenshot stepper"
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canPrevBackground}
                    onClick={() =>
                      setBackgroundShotIndex(
                        Math.max(0, safeBackgroundShotIndex - 1),
                      )
                    }
                  >
                    Prev
                  </button>
                  <span className="rotate-stepper-index">
                    {safeBackgroundShotIndex + 1} / {backgroundShots.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canNextBackground}
                    onClick={() =>
                      setBackgroundShotIndex(
                        Math.min(
                          backgroundShots.length - 1,
                          safeBackgroundShotIndex + 1,
                        ),
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
              <p className="muted rotate-frame-count">
                Frames captured: {backgroundShots.length}
              </p>
              <ul className="rotate-log rotate-background-log">
                {backgroundJob.recentEvents.map((event) => (
                  <li
                    key={`${event.type}-${event.text}`}
                    className={`log-${event.type}`}
                  >
                    {event.text}
                  </li>
                ))}
              </ul>
              {backgroundDone && backgroundJob.result && (
                <div className="rotate-result">
                  <p className="success">
                    ✓ Background rotation completed for{" "}
                    {backgroundJob.result.site}
                  </p>
                  <div className="password-reveal">
                    <code>{backgroundJob.result.password}</code>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={copyBackgroundPassword}
                    >
                      {backgroundCopied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p className="muted">Saved to your encrypted vault.</p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {!isBackgroundMode && (
        <>
          <form className="compose-form" onSubmit={start}>
            <label>
              Website URL{" "}
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                disabled={running}
              />
            </label>
            <label>
              Account email{" "}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={running}
              />
            </label>
            <div className="compose-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={running}
              >
                {running ? "Rotating…" : "Rotate password"}
              </button>
              {running && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cancel}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {result && (
            <div className="rotate-result">
              <p className="success">✓ New password set for {result.site}</p>
              <div className="password-reveal">
                <code>{result.password}</code>
                <button type="button" className="btn btn-ghost" onClick={copy}>
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p className="muted">Saved to your encrypted vault.</p>
            </div>
          )}

          {status === "needs_human" && (
            <div className="rotate-human">
              ⚠ The agent hit a step it can’t safely automate (CAPTCHA, 2FA, or
              a login wall). Finish that step manually, then try again.
            </div>
          )}

          {(log.length > 0 || currentForegroundShot) && (
            <div className="rotate-monitor">
              {currentForegroundShot && (
                <div className="rotate-screenshot">
                  <img src={currentForegroundShot} alt="Agent browser view" />
                </div>
              )}
              {shots.length > 0 && (
                <div
                  className="rotate-stepper"
                  aria-label="Foreground screenshot stepper"
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canPrevForeground}
                    onClick={() => setShotIndex(Math.max(0, safeShotIndex - 1))}
                  >
                    Prev
                  </button>
                  <span className="rotate-stepper-index">
                    {safeShotIndex + 1} / {shots.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canNextForeground}
                    onClick={() =>
                      setShotIndex(
                        Math.min(shots.length - 1, safeShotIndex + 1),
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
              <p className="muted rotate-frame-count">
                Frames captured: {shots.length}
              </p>
              <ul className="rotate-log">
                {log.map((line) => (
                  <li
                    key={`${line.tone}-${line.text}`}
                    className={`log-${line.tone}`}
                  >
                    {line.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

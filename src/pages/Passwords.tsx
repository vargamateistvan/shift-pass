import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  emptyBackgroundRotationJobListResult,
  getBackgroundRotationJobs,
  listBackgroundRotationJobsDetailed,
  startBackgroundRotation,
  type BackgroundRotationJob,
} from "../api/rotate";
import { type GooglePasswordEntry } from "../passwords/context";
import { useLoadedCsv } from "../passwords/useLoadedCsv";

const BACKGROUND_JOB_STORAGE_KEY = "shiftpass.passwordRowJobs";
const STALE_TRACKED_JOB_FAILURE_LIMIT = 2;
const BACKGROUND_REFRESH_FAST_MS = 4000;
const BACKGROUND_REFRESH_SLOW_MS = 12000;

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === "," && !quoted) {
      out.push(cell.trim());
      cell = "";
      continue;
    }

    cell += ch;
  }

  out.push(cell.trim());
  return out;
}

function parseGooglePasswordsCsv(csv: string): GooglePasswordEntry[] {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCsvRow(line));

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase());
  const idx = {
    name: headers.indexOf("name"),
    url: headers.indexOf("url"),
    username: headers.indexOf("username"),
    password: headers.indexOf("password"),
    note: headers.indexOf("note"),
  };

  return rows.slice(1).map((r) => ({
    name: idx.name >= 0 ? (r[idx.name] ?? "") : "",
    url: idx.url >= 0 ? (r[idx.url] ?? "") : "",
    username: idx.username >= 0 ? (r[idx.username] ?? "") : "",
    password: idx.password >= 0 ? (r[idx.password] ?? "") : "",
    note: idx.note >= 0 ? (r[idx.note] ?? "") : "",
  }));
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function buildRotatePath(entry: GooglePasswordEntry): string {
  const params = new URLSearchParams();

  if (entry.url) {
    params.set("url", entry.url);
  }

  if (entry.username) {
    params.set("email", entry.username);
  }

  const query = params.toString();
  return query ? `/app/rotate?${query}` : "/app/rotate";
}

function entryKey(entry: GooglePasswordEntry): string {
  return `${entry.url}-${entry.username}`;
}

function loadTrackedJobs(): Record<string, string> {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(BACKGROUND_JOB_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(BACKGROUND_JOB_STORAGE_KEY);
    return {};
  }
}

function isTerminalJob(status: BackgroundRotationJob["status"]): boolean {
  return status === "done" || status === "needs_human" || status === "error";
}

function formatRowStatus(status: BackgroundRotationJob["status"]): string {
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

function trackActiveJobs(
  jobs: Record<string, BackgroundRotationJob>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(jobs).map(([key, job]) => [key, job.id]),
  );
}

function shouldRetryTrackedJob(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }

  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error.message.startsWith("Server error 404") ||
    /background job not found/i.test(error.message)
  );
}

function fallbackGroupKey(
  entry: Pick<GooglePasswordEntry, "url" | "username">,
) {
  return `${hostFromUrl(entry.url)}::${entry.username}`;
}

function assignFallbackJobs(
  entries: GooglePasswordEntry[],
  jobs: BackgroundRotationJob[],
): Record<string, BackgroundRotationJob> {
  const availableEntries = new Map<string, GooglePasswordEntry[]>();

  for (const entry of entries) {
    const key = fallbackGroupKey(entry);
    const group = availableEntries.get(key);
    if (group) {
      group.push(entry);
    } else {
      availableEntries.set(key, [entry]);
    }
  }

  const assignments: Record<string, BackgroundRotationJob> = {};

  for (const job of jobs) {
    const key = fallbackGroupKey({ url: job.url, username: job.email });
    const group = availableEntries.get(key);
    if (!group || group.length === 0) {
      continue;
    }

    const exactUrlIndex = group.findIndex((entry) => entry.url === job.url);
    const matchIndex = exactUrlIndex >= 0 ? exactUrlIndex : 0;
    const [match] = group.splice(matchIndex, 1);
    assignments[entryKey(match)] = job;

    if (group.length === 0) {
      availableEntries.delete(key);
    }
  }

  return assignments;
}

export function Passwords() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { entries, fileName, setLoadedCsv } = useLoadedCsv();
  const [error, setError] = useState<string | null>(null);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);
  const [backgroundNoticeTone, setBackgroundNoticeTone] = useState<
    "success" | "error"
  >("success");
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [trackedJobs, setTrackedJobs] =
    useState<Record<string, string>>(loadTrackedJobs);
  const trackedJobsRef = useRef(trackedJobs);
  const [rowJobs, setRowJobs] = useState<Record<string, BackgroundRotationJob>>(
    {},
  );
  const rowJobsRef = useRef(rowJobs);
  const trackedJobFailureCountsRef = useRef<Record<string, number>>({});
  const [fallbackDiscoveryWarning, setFallbackDiscoveryWarning] = useState<
    string | null
  >(null);
  const [visiblePasswords, setVisiblePasswords] = useState<
    Record<string, boolean>
  >({});

  const hasEntries = entries.length > 0;
  const summary = useMemo(
    () => `${entries.length} password${entries.length === 1 ? "" : "s"} loaded`,
    [entries.length],
  );
  const uniqueSites = useMemo(
    () =>
      new Set(entries.map((entry) => hostFromUrl(entry.url)).filter(Boolean))
        .size,
    [entries],
  );

  useEffect(() => {
    rowJobsRef.current = rowJobs;
  }, [rowJobs]);

  useEffect(() => {
    trackedJobsRef.current = trackedJobs;

    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(
      BACKGROUND_JOB_STORAGE_KEY,
      JSON.stringify(trackedJobs),
    );
  }, [trackedJobs]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const controller = new AbortController();

    const refresh = async () => {
      if (entries.length === 0) {
        if (!cancelled) {
          setRowJobs({});
          setTrackedJobs({});
          setFallbackDiscoveryWarning(null);
        }
        return;
      }

      const trackedEntries = entries
        .map((entry) => {
          const key = entryKey(entry);
          const jobId = trackedJobsRef.current[key];
          return jobId ? { key, entry, jobId } : null;
        })
        .filter(
          (
            result,
          ): result is {
            key: string;
            entry: GooglePasswordEntry;
            jobId: string;
          } => Boolean(result),
        );

      let trackedPairs: Array<
        | {
            key: string;
            entry: GooglePasswordEntry;
            job: BackgroundRotationJob;
          }
        | { key: string; entry: GooglePasswordEntry; retryable: boolean }
      >;

      try {
        const jobs = await getBackgroundRotationJobs(
          trackedEntries.map((entry) => entry.jobId),
          controller.signal,
        );
        const jobsById = Object.fromEntries(
          jobs.map((job) => [job.id, job] as const),
        );

        trackedPairs = trackedEntries.map(({ key, entry, jobId }) => {
          const job = jobsById[jobId];
          if (job) {
            return { key, entry, job };
          }

          return { key, entry, retryable: false };
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        const retryable = shouldRetryTrackedJob(error);
        trackedPairs = trackedEntries.map(({ key, entry }) => ({
          key,
          entry,
          retryable,
        }));
      }

      if (cancelled) {
        return;
      }

      const nextFailureCounts = { ...trackedJobFailureCountsRef.current };
      const graceTrackedKeys = new Set<string>();
      const trackedJobsByKey: Record<string, BackgroundRotationJob> = {};

      for (const result of trackedPairs) {
        if ("retryable" in result) {
          if (result.retryable) {
            graceTrackedKeys.add(result.key);
            continue;
          }

          const failureCount = (nextFailureCounts[result.key] ?? 0) + 1;
          if (failureCount < STALE_TRACKED_JOB_FAILURE_LIMIT) {
            nextFailureCounts[result.key] = failureCount;
            graceTrackedKeys.add(result.key);
          } else {
            delete nextFailureCounts[result.key];
          }
          continue;
        }

        trackedJobsByKey[result.key] = result.job;
        delete nextFailureCounts[result.key];
      }

      const unresolvedEntries = entries.filter((entry) => {
        const key = entryKey(entry);
        return !trackedJobsByKey[key] && !graceTrackedKeys.has(key);
      });

      const entryGroups = new Map<string, GooglePasswordEntry[]>();
      for (const entry of unresolvedEntries) {
        const host = hostFromUrl(entry.url);
        if (!host) {
          continue;
        }

        const group = entryGroups.get(host);
        if (group) {
          group.push(entry);
        } else {
          entryGroups.set(host, [entry]);
        }
      }

      const fallbackResult =
        entryGroups.size > 0
          ? await listBackgroundRotationJobsDetailed(
              {
                activeOnly: true,
                hosts: [...entryGroups.keys()],
              },
              controller.signal,
            )
          : emptyBackgroundRotationJobListResult();

      if (cancelled) {
        return;
      }

      setFallbackDiscoveryWarning(
        fallbackResult.meta.truncated
          ? `Showing the most recent ${fallbackResult.meta.returnedCount} active jobs out of ${fallbackResult.meta.matchedCount} matches. Some background runs may be omitted until older jobs finish or disappear.`
          : null,
      );

      const fallbackJobs = assignFallbackJobs(
        unresolvedEntries,
        fallbackResult.jobs,
      );
      const nextJobs = {
        ...fallbackJobs,
        ...trackedJobsByKey,
      };

      for (const key of graceTrackedKeys) {
        const preservedJob = rowJobsRef.current[key];
        if (preservedJob && !nextJobs[key]) {
          nextJobs[key] = preservedJob;
        }
      }

      trackedJobFailureCountsRef.current = nextFailureCounts;
      setRowJobs(nextJobs);

      const nextTrackedJobs = trackActiveJobs(nextJobs);
      for (const key of graceTrackedKeys) {
        const jobId = trackedJobsRef.current[key];
        if (jobId && !nextTrackedJobs[key]) {
          nextTrackedJobs[key] = jobId;
        }
      }

      setTrackedJobs(nextTrackedJobs);

      const hasActiveJob = Object.values(nextJobs).some(
        (job) => !isTerminalJob(job.status),
      );
      const shouldContinuePolling =
        hasActiveJob ||
        graceTrackedKeys.size > 0 ||
        fallbackResult.meta.truncated;
      const refreshDelay = fallbackResult.meta.truncated
        ? BACKGROUND_REFRESH_SLOW_MS
        : BACKGROUND_REFRESH_FAST_MS;

      if (shouldContinuePolling) {
        timer = globalThis.setTimeout(refresh, refreshDelay);
      }
    };

    void refresh();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
    };
  }, [entries]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const csv = await file.text();
      const parsed = parseGooglePasswordsCsv(csv).filter(
        (entry) => entry.url || entry.username || entry.password,
      );

      setLoadedCsv({ fileName: file.name, rawCsv: csv, entries: parsed });
      setVisiblePasswords({});

      if (parsed.length === 0) {
        setError(
          "No valid rows found. Export again from Google Password Manager as CSV.",
        );
      }
    } catch {
      setError("Failed to read CSV file.");
    }
  };

  const startBackgroundReset = async (entry: GooglePasswordEntry) => {
    const key = entryKey(entry);
    setStartingKey(key);
    setFailedKey(null);
    setBackgroundNotice(null);

    try {
      const googleAccessToken = await getToken();
      const job = await startBackgroundRotation({
        url: entry.url,
        email: entry.username,
        googleAccessToken,
      });

      setTrackedJobs((prev) => ({
        ...prev,
        [key]: job.id,
      }));
      setRowJobs((prev) => ({
        ...prev,
        [key]: job,
      }));

      setBackgroundNoticeTone("success");
      setBackgroundNotice(
        `Background AI started for ${hostFromUrl(entry.url) || entry.url}. Opening the live job monitor…`,
      );
      navigate(`/app/rotate?job=${job.id}`);
    } catch (err) {
      setFailedKey(key);
      setBackgroundNoticeTone("error");
      setBackgroundNotice(
        err instanceof Error ? err.message : "Failed to start background AI.",
      );
    } finally {
      setStartingKey(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Password</h2>
      </div>

      <section className="vault-hero">
        <div className="vault-hero-copy">
          <p className="muted rotate-intro">
            Import a Google Password Manager CSV to review accounts in a
            cleaner, searchable layout. Direct password-manager API access is
            not available, so CSV import is the supported path.
          </p>

          <p className="vault-export-help">
            Need a CSV first?{" "}
            <a
              href="https://passwords.google.com/"
              target="_blank"
              rel="noreferrer"
            >
              Open Google Password Manager and export passwords
            </a>
            {"."}
          </p>
        </div>

        <div className="vault-import-card">
          <label className="vault-upload">
            <span className="vault-upload-title">
              Google Password Manager CSV
            </span>
            <span className="vault-upload-text">
              Choose an exported CSV file to load passwords locally in this
              view.
            </span>
            <span className="btn btn-primary vault-upload-button">
              Choose CSV file
            </span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>

          <div className="vault-summary-grid">
            <div className="vault-summary-card">
              <span className="vault-summary-label">Entries</span>
              <strong>{entries.length}</strong>
            </div>
            <div className="vault-summary-card">
              <span className="vault-summary-label">Sites</span>
              <strong>{uniqueSites}</strong>
            </div>
            <div className="vault-summary-card vault-summary-card-wide">
              <span className="vault-summary-label">Source file</span>
              <strong>{fileName || "None loaded"}</strong>
            </div>
          </div>

          {hasEntries && <p className="success">{summary}</p>}
        </div>
      </section>

      {backgroundNotice && (
        <p className={backgroundNoticeTone}>{backgroundNotice}</p>
      )}

      {fallbackDiscoveryWarning && (
        <p className="vault-list-warning">{fallbackDiscoveryWarning}</p>
      )}

      {error && <p className="error">{error}</p>}
      {!error && !hasEntries && (
        <p className="muted">No passwords loaded yet.</p>
      )}

      {!error && hasEntries && (
        <ul className="vault-list">
          {entries.map((entry, idx) => (
            <li
              key={`${entry.url}-${entry.username}-${idx}`}
              className="vault-row"
            >
              {(() => {
                const key = entryKey(entry);
                const rowJob = rowJobs[key];
                const rowJobId = trackedJobs[key];
                const rowJobActive = rowJob
                  ? !isTerminalJob(rowJob.status)
                  : false;

                return (
                  <>
                    <div className="vault-main">
                      <div className="vault-title-group">
                        <strong>
                          {entry.name || entry.url || "(unnamed entry)"}
                        </strong>
                        <span className="muted vault-host">
                          {hostFromUrl(entry.url) || "Unknown site"}
                        </span>
                      </div>
                      <span className="muted vault-username">
                        {entry.username || "(no username)"}
                      </span>
                    </div>
                    <div className="vault-meta">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="vault-link"
                      >
                        {entry.url}
                      </a>
                      <div className="vault-actions">
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost vault-action"
                        >
                          Open site
                        </a>
                        <Link
                          to={buildRotatePath(entry)}
                          className="btn btn-primary vault-action"
                        >
                          Reset password
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost vault-action"
                          onClick={() => void startBackgroundReset(entry)}
                          disabled={startingKey === key || rowJobActive}
                        >
                          {startingKey === key
                            ? "Starting…"
                            : rowJobActive
                              ? "Background running"
                              : "Run in background"}
                        </button>
                      </div>
                      {rowJob && rowJobId && (
                        <div className="vault-job-row">
                          <span
                            className={`vault-status vault-${rowJob.status}`}
                          >
                            {formatRowStatus(rowJob.status)}
                          </span>
                          <Link
                            to={`/app/rotate?job=${rowJobId}`}
                            className="vault-job-link"
                          >
                            View job
                          </Link>
                        </div>
                      )}
                      {failedKey === key &&
                        backgroundNoticeTone === "error" &&
                        backgroundNotice && (
                          <p className="error vault-row-feedback">
                            {backgroundNotice}
                          </p>
                        )}
                      <div className="vault-password-field">
                        <code>
                          {visiblePasswords[
                            `${entry.url}-${entry.username}-${idx}`
                          ]
                            ? entry.password || "(empty password)"
                            : "••••••••••••"}
                        </code>
                        <button
                          type="button"
                          className="vault-password-toggle"
                          onClick={() => {
                            const entryKey = `${entry.url}-${entry.username}-${idx}`;
                            setVisiblePasswords((prev) => ({
                              ...prev,
                              [entryKey]: !prev[entryKey],
                            }));
                          }}
                          aria-label={
                            visiblePasswords[
                              `${entry.url}-${entry.username}-${idx}`
                            ]
                              ? "Hide password"
                              : "Show password"
                          }
                          title={
                            visiblePasswords[
                              `${entry.url}-${entry.username}-${idx}`
                            ]
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {visiblePasswords[
                            `${entry.url}-${entry.username}-${idx}`
                          ] ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M3 3l18 18"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                              <path
                                d="M10.6 10.8a2 2 0 0 0 2.6 2.6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                              <path
                                d="M9.8 5.3A11 11 0 0 1 12 5c5.3 0 9.3 3.8 10 6.8a1.2 1.2 0 0 1 0 .4A11.1 11.1 0 0 1 17 18.2M6.2 15.3A11.3 11.3 0 0 1 2 12.2a1.2 1.2 0 0 1 0-.4A11.2 11.2 0 0 1 7 5.9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M2 12c.7-3 4.7-7 10-7s9.3 4 10 7c-.7 3-4.7 7-10 7S2.7 15 2 12Z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="2.7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    {entry.note && <p className="muted">Note: {entry.note}</p>}
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

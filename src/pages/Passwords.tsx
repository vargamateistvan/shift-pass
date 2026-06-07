import { useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { startBackgroundRotation } from "../api/rotate";
import { type GooglePasswordEntry } from "../passwords/context";
import { useLoadedCsv } from "../passwords/useLoadedCsv";

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
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
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
    const entryKey = `${entry.url}-${entry.username}`;
    setStartingKey(entryKey);
    setFailedKey(null);
    setBackgroundNotice(null);

    try {
      const googleAccessToken = await getToken();
      const job = await startBackgroundRotation({
        url: entry.url,
        email: entry.username,
        googleAccessToken,
      });

      setBackgroundNoticeTone("success");
      setBackgroundNotice(
        `Background AI started for ${hostFromUrl(entry.url) || entry.url}. Opening the live job monitor…`,
      );
      navigate(`/app/rotate?job=${job.id}`);
    } catch (err) {
      setFailedKey(entryKey);
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
                    disabled={startingKey === `${entry.url}-${entry.username}`}
                  >
                    {startingKey === `${entry.url}-${entry.username}`
                      ? "Starting…"
                      : "Run in background"}
                  </button>
                </div>
                {failedKey === `${entry.url}-${entry.username}` &&
                  backgroundNoticeTone === "error" &&
                  backgroundNotice && (
                    <p className="error vault-row-feedback">
                      {backgroundNotice}
                    </p>
                  )}
                <div className="vault-password-field">
                  <code>
                    {visiblePasswords[`${entry.url}-${entry.username}-${idx}`]
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
                      visiblePasswords[`${entry.url}-${entry.username}-${idx}`]
                        ? "Hide password"
                        : "Show password"
                    }
                    title={
                      visiblePasswords[`${entry.url}-${entry.username}-${idx}`]
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

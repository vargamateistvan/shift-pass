import { useRef, useState, type FormEvent } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { streamRotation, type RotateProgress } from "../api/rotate";

type Status = "idle" | "running" | "needs_human" | "done" | "error";

interface LogLine {
  text: string;
  tone: "info" | "step" | "warn" | "error";
}

export function Rotate() {
  const location = useLocation();

  return <RotateForm key={location.search} />;
}

function RotateForm() {
  const { getToken } = useAuth();
  const [searchParams] = useSearchParams();
  const [url, setUrl] = useState(searchParams.get("url") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [shot, setShot] = useState<string | null>(null);
  const [result, setResult] = useState<{
    site: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const append = (line: LogLine) => setLog((prev) => [...prev, line]);

  const handle = (ev: RotateProgress) => {
    switch (ev.type) {
      case "phase":
        append({ text: ev.message, tone: "info" });
        break;
      case "step":
        append({
          text: `→ ${ev.action}${ev.detail ? `: ${ev.detail}` : ""}`,
          tone: "step",
        });
        break;
      case "screenshot":
        setShot(ev.dataUrl);
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

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("running");
    setLog([]);
    setShot(null);
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

  const running = status === "running";

  return (
    <div className="page">
      <div className="page-head">
        <h2>Rotate password</h2>
      </div>
      <p className="muted rotate-intro">
        An AI agent opens the site, requests a reset, reads the email from your
        inbox, and sets a new strong password — you just click the button.
      </p>

      <form className="compose-form" onSubmit={start}>
        <label>
          Website URL
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
          Account email
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
          <button type="submit" className="btn btn-primary" disabled={running}>
            {running ? "Rotating…" : "Rotate password"}
          </button>
          {running && (
            <button type="button" className="btn btn-ghost" onClick={cancel}>
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
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="muted">Saved to your encrypted vault.</p>
        </div>
      )}

      {status === "needs_human" && (
        <div className="rotate-human">
          ⚠ The agent hit a step it can’t safely automate (CAPTCHA, 2FA, or a
          login wall). Finish that step manually, then try again.
        </div>
      )}

      {(log.length > 0 || shot) && (
        <div className="rotate-monitor">
          {shot && (
            <div className="rotate-screenshot">
              <img src={shot} alt="Agent browser view" />
            </div>
          )}
          <ul className="rotate-log">
            {log.map((line, i) => (
              <li key={i} className={`log-${line.tone}`}>
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

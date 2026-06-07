import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { sendMessage } from "../api/gmail";

type Status = "idle" | "sending" | "sent" | "error";

export function Compose() {
  const { getToken } = useAuth();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await sendMessage(getToken, { to, subject, body });
      setStatus("sent");
      setTo("");
      setSubject("");
      setBody("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to send");
    }
  };

  return (
    <div className="page">
      <h2>Compose</h2>
      <form className="compose-form" onSubmit={handleSubmit}>
        <label>
          To
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
          />
        </label>
        <label>
          Subject
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </label>
        <label>
          Message
          <textarea
            required
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </label>
        <div className="compose-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send"}
          </button>
          {status === "sent" && <span className="success">Sent ✓</span>}
          {status === "error" && error && (
            <span className="error">{error}</span>
          )}
        </div>
      </form>
    </div>
  );
}

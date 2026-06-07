import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { listMessages, type MessageSummary } from "../api/gmail";

export function Inbox() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await listMessages(getToken, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const msgs = await listMessages(getToken, 20);
        if (active) setMessages(msgs);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Failed to load messages");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Inbox</h2>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <p className="muted">Loading messages…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && messages.length === 0 && (
        <p className="muted">No messages found.</p>
      )}

      <ul className="message-list">
        {messages.map((m) => (
          <li key={m.id}>
            <Link to={`/app/message/${m.id}`} className="message-row">
              <span className="message-from">{m.from}</span>
              <span className="message-subject">
                {m.subject || "(no subject)"}
              </span>
              <span className="message-snippet">{m.snippet}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

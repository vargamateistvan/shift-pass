import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getMessage, type MessageDetail } from '../api/gmail';

export function Message() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const msg = await getMessage(getToken, id);
        if (active) setMessage(msg);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Failed to load message');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken, id]);

  return (
    <div className="page">
      <Link to="/app" className="back-link">
        ← Back to inbox
      </Link>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {message && (
        <article className="message-detail">
          <h2>{message.subject || '(no subject)'}</h2>
          <div className="message-meta">
            <div>
              <strong>From:</strong> {message.from}
            </div>
            <div>
              <strong>To:</strong> {message.to}
            </div>
            <div>
              <strong>Date:</strong> {message.date}
            </div>
          </div>
          <pre className="message-body">{message.body}</pre>
        </article>
      )}
    </div>
  );
}

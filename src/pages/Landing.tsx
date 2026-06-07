import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { SignInButton } from '../components/SignInButton';

export function Landing() {
  const { isAuthenticated, error } = useAuth();

  if (isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="landing">
      <h1>Manage your Gmail securely</h1>
      <p className="lead">
        Sign in with Google to read and send email. Authentication is handled
        entirely by Google via OAuth — this app never sees your password.
      </p>
      <ul className="features">
        <li>🔐 OAuth 2.0 — no password handling</li>
        <li>📥 Read your latest messages</li>
        <li>✉️ Compose and send email</li>
        <li>🧹 Tokens kept in memory only, revoked on sign-out</li>
      </ul>
      <SignInButton />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

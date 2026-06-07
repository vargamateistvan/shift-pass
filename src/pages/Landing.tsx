import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { SignInButton } from "../components/SignInButton";
import { Logo } from "../components/Logo";

const features = [
  { icon: "🔐", text: "OAuth 2.0 — no password handling" },
  { icon: "📥", text: "Read your latest messages" },
  { icon: "✉️", text: "Compose and send email" },
  { icon: "🧹", text: "Tokens in memory, revoked on sign-out" },
];

export function Landing() {
  const { isAuthenticated, error } = useAuth();

  if (isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="landing">
      <Logo size={64} className="landing-logo" />
      <h1>ShiftPass</h1>
      <p className="lead">
        Sign in with Google to read and send email. Authentication is handled
        entirely by Google via OAuth — ShiftPass never sees your password.
      </p>
      <ul className="features">
        {features.map((f) => (
          <li key={f.text} className="feature">
            <span className="feature-icon" aria-hidden="true">
              {f.icon}
            </span>
            {f.text}
          </li>
        ))}
      </ul>
      <SignInButton />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

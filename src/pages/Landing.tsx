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

const steps = [
  {
    title: "Connect your Google account",
    text: "Sign in with Google OAuth to grant Gmail read and send access.",
  },
  {
    title: "Manage inbox and replies",
    text: "Open recent messages, review full content, and compose responses.",
  },
  {
    title: "Rotate passwords safely",
    text: "Optionally run a guided reset flow that generates a strong new password.",
  },
];

export function Landing() {
  const { isAuthenticated, error } = useAuth();

  if (isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="landing">
      <Logo size={64} className="landing-logo" />
      <h1>ShiftPass</h1>
      <p className="lead">
        ShiftPass is a Gmail productivity app with optional password rotation.
        It helps you read and send email with Google OAuth and can automate
        reset flows for accounts you manage.
      </p>

      <p className="landing-review-note">
        This page is intentionally public for Google OAuth review. You can read
        app details without logging in.
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

      <section className="landing-details" aria-label="How ShiftPass works">
        <h2>How ShiftPass works</h2>
        <ol className="landing-steps">
          {steps.map((step) => (
            <li key={step.title} className="landing-step">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <SignInButton />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

import { Link } from "react-router-dom";

export function Privacy() {
  return (
    <article className="page legal-page">
      <p>
        <Link className="back-link" to="/">
          ← Back to home
        </Link>
      </p>
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Last updated: June 7, 2026</p>

      <section className="legal-card">
        <h2>Overview</h2>
        <p>
          ShiftPass is designed to minimize data collection. Google
          authentication is handled by OAuth, and your Google password is never
          visible to this app.
        </p>
      </section>

      <section className="legal-card">
        <h2>Information We Process</h2>
        <ul className="legal-list">
          <li>
            Google account profile basics (email, name, avatar) after sign-in.
          </li>
          <li>Short-lived Google access tokens stored in memory during use.</li>
          <li>
            Gmail data needed to list, read, and send messages you request.
          </li>
          <li>
            Rotation workflow details such as target website and account email.
          </li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Password Rotation Data</h2>
        <p>
          If you use password rotation, generated passwords are stored encrypted
          at rest by the backend vault using AES-256-GCM. Sensitive values are
          masked in API responses where practical.
        </p>
      </section>

      <section className="legal-card">
        <h2>How We Use Data</h2>
        <ul className="legal-list">
          <li>To authenticate you and operate requested Gmail features.</li>
          <li>To perform optional password-rotation automation flows.</li>
          <li>To improve reliability, security, and troubleshooting.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Retention and Deletion</h2>
        <p>
          Access tokens are in-memory and not persisted in browser storage.
          Vault entries remain until you delete or rotate them again through
          your own operational process.
        </p>
      </section>

      <section className="legal-card">
        <h2>Third-Party Services</h2>
        <p>
          ShiftPass uses Google APIs for email operations and may use Vercel
          Analytics for aggregate usage metrics. Third-party providers apply
          their own privacy terms.
        </p>
      </section>

      <section className="legal-card">
        <h2>Contact</h2>
        <p>
          For privacy questions, contact the project owner through this
          repository's issue tracker.
        </p>
      </section>
    </article>
  );
}

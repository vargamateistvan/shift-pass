import { Link } from "react-router-dom";

export function Terms() {
  return (
    <article className="page legal-page">
      <p>
        <Link className="back-link" to="/">
          ← Back to home
        </Link>
      </p>
      <h1>Terms of Service</h1>
      <p className="legal-meta">Last updated: June 7, 2026</p>

      <section className="legal-card">
        <h2>Acceptance of Terms</h2>
        <p>
          By using ShiftPass, you agree to these Terms of Service and all
          applicable laws and regulations.
        </p>
      </section>

      <section className="legal-card">
        <h2>Service Description</h2>
        <p>
          ShiftPass provides Gmail access features and an optional password
          rotation assistant that automates parts of password reset workflows.
        </p>
      </section>

      <section className="legal-card">
        <h2>User Responsibilities</h2>
        <ul className="legal-list">
          <li>You are responsible for accounts and sites you operate.</li>
          <li>
            You must have permission to automate reset flows you initiate.
          </li>
          <li>You are responsible for reviewing generated credentials.</li>
          <li>You agree not to use the service for unlawful activity.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Automation Limitations</h2>
        <p>
          The service does not bypass CAPTCHAs, multi-factor authentication, or
          anti-bot controls. Some flows may require manual steps or fail based
          on target-site behavior.
        </p>
      </section>

      <section className="legal-card">
        <h2>Security and Availability</h2>
        <p>
          The service is provided on an "as is" basis without warranties of
          uninterrupted availability, compatibility, or fitness for a particular
          purpose.
        </p>
      </section>

      <section className="legal-card">
        <h2>Liability</h2>
        <p>
          To the maximum extent allowed by law, the project owner is not liable
          for indirect, incidental, special, consequential, or punitive damages
          arising from use of this service.
        </p>
      </section>

      <section className="legal-card">
        <h2>Changes to Terms</h2>
        <p>
          These terms may be updated from time to time. Continued use after
          updates means you accept the revised terms.
        </p>
      </section>
    </article>
  );
}

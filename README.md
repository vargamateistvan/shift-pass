# ShiftPass

A React SPA that lets you **sign in with Google**, manage Gmail, and **rotate
passwords on other sites with one click** using a server-side AI agent.
Authentication is delegated entirely to Google via OAuth 2.0 — **this app never
handles your Google password**.

## Features

- 🔐 Sign in with Google (OAuth 2.0 token model — no password handling)
- 📥 Read your latest inbox messages and view full message detail
- ✉️ Compose and send email
- ⚡ **Auto-rotate passwords** — one click runs a site's forgot-password flow,
  reads the reset email from your inbox, and sets a new strong password
- 🧹 Access tokens kept in memory only and revoked on sign-out

## Auto-rotate passwords (AI agent)

The **Rotate** page lets you point ShiftPass at any website and account email.
A backend service (in [`server/`](./server)) runs an **Anthropic Claude
computer-use** agent that drives a real headless browser to:

1. find and submit the site's "forgot password" form,
2. read the reset email via the Gmail API (reusing your token),
3. open the reset link and set a freshly generated strong password,
4. store it in an AES-256-GCM **encrypted vault**.

Progress (phases, steps, live screenshots) streams to the UI over SSE.

> **Defaults to a safe dry run** (`DRY_RUN=true`): the agent fills the new
> password but does not submit it until you opt in. CAPTCHAs, 2FA/OTP, and login
> walls are **not** bypassed — the agent pauses and asks you to finish manually.

See [`server/README.md`](./server/README.md) for full setup. Quick start:

```bash
yarn server:install   # installs backend deps + Chromium
cp server/.env.example server/.env   # set ANTHROPIC_API_KEY and VAULT_KEY
yarn server           # backend on :8787 (the SPA proxies /api to it)
```

## Security model

- Uses the GIS **token model** (implicit flow). The browser requests a
  short-lived **access token** directly from Google.
- **No backend, no refresh tokens.** The access token lives in React state
  (memory) only — never in `localStorage`/`sessionStorage`.
- When the token expires (~1 hour), the app silently re-requests a new one.
- On sign-out the token is revoked via `google.accounts.oauth2.revoke`.
- Requests the minimum scopes needed: `gmail.readonly`, `gmail.send`, plus
  `openid email profile` for the signed-in user display.

> A pure SPA cannot hold long-lived refresh tokens securely. If you need
> background/offline access, add a backend that performs the authorization-code
> flow and stores refresh tokens server-side.

## Prerequisites: Google Cloud setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or select) a project.
2. **Enable the Gmail API**: APIs & Services → Library → search "Gmail API" →
   Enable.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent
   screen. Choose **External**, fill in the app name/support email, add the
   scopes above, and add your Google account under **Test users**.
4. **Create credentials**: APIs & Services → Credentials → Create Credentials →
   **OAuth client ID** → Application type **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173`
5. Copy the generated **Client ID**.

## Local development

```bash
# 1. Install dependencies
yarn install

# 2. Configure your client ID
cp .env.example .env
# edit .env and set VITE_GOOGLE_CLIENT_ID

# 3. Start the dev server
yarn dev
```

Open http://localhost:5173 and click **Sign in with Google**.

## Scripts

- `yarn dev` — start the Vite dev server
- `yarn build` — type-check, build for production, and emit a `404.html` SPA fallback
- `yarn preview` — preview the production build
- `yarn lint` — run ESLint
- `yarn server` — start the auto-rotate backend (see `server/README.md`)

## Deployment (GitHub Pages)

This repo includes a workflow at `.github/workflows/deploy.yml` that builds and
publishes to GitHub Pages on every push to `main`.

One-time setup:

1. In the repo, go to **Settings → Pages → Build and deployment** and set
   **Source** to **GitHub Actions**.
2. Add a repository **secret** `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and
   variables → Actions) with your OAuth client ID — it's injected at build time.
3. In the Google Cloud Console, add your Pages origin
   (`https://<user>.github.io`) to the OAuth client's **Authorized JavaScript
   origins**.

The site is served from `/shift-pass/` on Pages (the Vite `base` is set
automatically when running in GitHub Actions), and a copied `404.html` ensures
client-side routes resolve on refresh/deep links.

## Project structure

```
src/
  auth/AuthContext.tsx     # OAuth token state, sign in/out, silent refresh
  api/gmail.ts             # Gmail REST helpers (list, read, send)
  api/rotate.ts            # SSE client for the auto-rotate backend
  components/              # Header, Logo, SignInButton, ProtectedRoute
  pages/                   # Landing, Inbox, Message, Compose, Rotate
  App.tsx                  # Routes
  main.tsx                 # Providers (GoogleOAuth, Auth, Router)

server/                    # Auto-rotate agent backend (Express + Playwright + Claude)
  src/agent/               # Browser session, action executor, agent loop, orchestrator
  src/gmail/               # Reset-email poller + link/code extractor
  src/vault/               # AES-256-GCM encrypted password vault

.github/
  copilot-instructions.md  # Always-on guidance for AI coding agents
  skills/ui-design/        # UI/design conventions (tokens, dark theme, a11y)
  workflows/deploy.yml     # GitHub Pages build & deploy
```

## Contributing & AI agents

This repo ships customizations for AI coding agents (e.g. GitHub Copilot):

- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) —
  repo-wide conventions: **yarn (never npm)**, the frontend/backend split, ESM
  `.js` import rule for the server, and the safety constraints the auto-rotate
  agent must keep (dry-run default, no CAPTCHA/2FA bypass, never log/commit
  secrets).
- [`.github/skills/ui-design/`](./.github/skills/ui-design/) — design system
  rules for any UI work (design tokens, dark-only theme, semantic class names,
  button variants, accessibility checklist).

Whether you're a human or an agent, follow those when making changes, and verify
with `yarn lint && yarn build` (frontend) and `yarn --cwd server build`
(backend).

## Not included (by design)

- The auto-rotate agent does **not** bypass CAPTCHAs, 2FA/OTP, or anti-bot
  walls — it pauses for manual action instead.
- No long-lived Google refresh tokens in the browser (pure SPA token model).

# Gmail Manager

A frontend-only React SPA that lets you **sign in with Google** and read/send
Gmail on your behalf. Authentication and authorization are delegated entirely to
Google via OAuth 2.0 (Google Identity Services) — **this app never handles your
password**.

## Features

- 🔐 Sign in with Google (OAuth 2.0 token model — no password handling)
- �� Read your latest inbox messages and view full message detail
- ✉️ Compose and send email
- 🧹 Access tokens kept in memory only and revoked on sign-out

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
  components/              # Header, SignInButton, ProtectedRoute
  pages/                   # Landing, Inbox, Message, Compose
  App.tsx                  # Routes
  main.tsx                 # Providers (GoogleOAuth, Auth, Router)
```

## Not included (by design)

- No password storage, rotation, or "forgot password" automation. Google does
  not provide an API for that and actively blocks automating the reset flow.
- No backend, database, or server-side sessions.

# ShiftPass — Copilot Instructions

ShiftPass is a React SPA that signs in with Google (OAuth 2.0 token model),
manages Gmail, and **rotates passwords on other sites with one click** via a
server-side AI agent. Use this file as the always-on guidance for working in
this repo.

## Architecture

Two packages in one repo:

- **Frontend SPA** (root) — React 19 + TypeScript + Vite, plain CSS, no backend
  for auth. Talks to Gmail directly with a short-lived Google access token, and
  to the agent backend over `/api` (proxied to `:8787` in dev).
- **Agent backend** (`server/`) — Express + Playwright + Anthropic Claude
  **computer-use**. Runs browser automation, holds the LLM key, makes Gmail
  calls, and streams progress to the SPA over SSE. It exists because a pure SPA
  cannot automate other origins or hold API keys.

```
src/
  auth/        OAuth token state, sign in/out, silent refresh
  api/         gmail.ts (REST helpers), rotate.ts (SSE client)
  components/  Header, Logo, SignInButton, ProtectedRoute
  pages/       Landing, Inbox, Message, Compose, Rotate
server/src/
  agent/       browser session, action executor, agent loop, orchestrator
  gmail/       reset-email poller + link/code extractor
  vault/       AES-256-GCM encrypted password vault
  routes/      health, rotate (SSE), vault
```

Routes: `/` (Landing), `/app` (Inbox), `/app/message/:id`, `/app/compose`,
`/app/rotate`. Everything under `/app` is wrapped in `ProtectedRoute`.

## Package manager — use yarn, never npm

This repo uses **yarn (classic, 1.x)** for both packages. Never run `npm`.

| Task                  | Command                            |
| --------------------- | ---------------------------------- |
| Install frontend deps | `yarn install`                     |
| Frontend dev server   | `yarn dev` (Vite on `:5173`)       |
| Lint frontend         | `yarn lint`                        |
| Build frontend        | `yarn build`                       |
| Install backend deps  | `yarn server:install`              |
| Run backend           | `yarn server` (Express on `:8787`) |
| Build backend         | `yarn --cwd server build`          |

From inside `server/` use bare `yarn`, `yarn dev`, `yarn build`, `yarn start`.
The backend `postinstall` runs `playwright install chromium`.

## Conventions

**Frontend**

- For any UI/styling work, follow the **`ui-design` skill**
  (`.github/skills/ui-design/SKILL.md`): dark theme only, design tokens from
  `:root` (no hardcoded colors), all CSS in `src/index.css` (no inline styles /
  CSS-in-JS / per-component `.css`), semantic class names, `.btn` /
  `.btn-primary` / `.btn-ghost` buttons, and the a11y checklist.
- Functional components with hooks and **named exports**
  (`export function Compose() {}`). `App` is the only default export.
- Brand mark = the `Logo` component; the wordmark uses `--gradient` clipped to
  text.
- Never persist the Google token to `localStorage`/`sessionStorage` — it lives
  in React state only (see `auth/AuthContext.tsx`). Request a fresh token with
  `useAuth().getToken()`.

**Backend**

- ESM with `verbatimModuleSyntax`: **relative imports must end in `.js`**
  (e.g. `import { config } from "../config.js"`), even from `.ts` files.
- `tsconfig.json` must keep `lib: ["ES2022", "DOM"]` — Playwright
  `page.evaluate` callbacks need DOM types.
- All config comes from `server/src/config.ts` (env-driven, safe defaults).

## Safety & security (do not weaken)

- **`DRY_RUN=true` by default** — the agent fills the new password but does not
  submit it. Don't flip defaults or remove the dry-run gate.
- The agent **never** bypasses CAPTCHAs, 2FA/OTP, or login walls — it emits a
  `needs_human` event and pauses. Don't add bypass logic.
- Respect the `ALLOWED_DOMAINS` allowlist (`lib/guard.ts`).
- **Never log secrets** (use the redacting logger in `lib/logger.ts`) and
  **never commit secrets** — `.env`, `vault.json`, and `node_modules` are
  gitignored; keep it that way.
- The vault is AES-256-GCM encrypted with `VAULT_KEY`; keep passwords encrypted
  at rest and masked in API responses.

## Verifying changes

- Frontend: `yarn lint && yarn build` must pass.
- Backend: `yarn --cwd server build` (tsc) must pass.
- ESLint root config ignores `server/` (separate toolchain) — don't lint the
  backend with the root config.
- Make surgical changes; don't introduce new tooling (test runners, CSS
  frameworks, package managers) without being asked.

# ShiftPass — Auto-Rotate Agent (server)

Backend for the one-click password rotation feature. A server-side AI agent
(Anthropic Claude **computer-use**) drives a real headless browser to run a
site's forgot-password flow, reads the reset email through the Gmail API,
opens the reset link, sets a freshly generated strong password, and stores it
in an encrypted vault.

> **Why a backend?** The SPA can't automate other origins or hold API keys.
> Browser automation, the LLM key, and Gmail calls all run here.

## Setup

```bash
cd server
yarn                   # also downloads Chromium for Playwright
cp .env.example .env   # then fill in the values below
```

Edit `.env`:

| Var                 | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Required. Powers the computer-use agent.                                  |
| `ANTHROPIC_MODEL`   | Claude model id (default `claude-sonnet-4-5`).                            |
| `VAULT_KEY`         | 64 hex chars (32 bytes) for AES-256-GCM. Generate below.                  |
| `ALLOWED_DOMAINS`   | Comma-separated allowlist. Empty = allow any.                             |
| `DRY_RUN`           | `true` (default) walks the flow but does **not** submit the new password. |
| `MAX_AGENT_STEPS`   | Per-goal step cap (default 40).                                           |

Generate a vault key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Run

```bash
yarn dev         # tsx watch on http://localhost:8787
# or
yarn build && yarn start
```

From the repo root you can also run `yarn server`.

## API

- `GET /api/health` — config/status probe.
- `POST /api/rotate` — body `{ url, email, googleAccessToken }`. Streams
  progress as Server-Sent Events (`phase`, `step`, `screenshot`,
  `needs_human`, `done`, `error`).
- `POST /api/rotate/background` — start a detached background rotation job.
- `GET /api/rotate/background/:jobId` — fetch a single persisted background job.
- `GET /api/rotate/background/batch?jobId=...` — fetch multiple persisted
  background jobs by id in one request.
- `GET /api/rotate/background` — list background jobs with filters such as
  `email`, repeated `host`, `status`, and `activeOnly`; responses include
  lightweight metadata describing applied limits and whether the result set was
  truncated.
- `GET /api/vault` — rotated entries (passwords masked).

## How it works

1. **Goal A** — agent finds the forgot-password flow and submits the email.
2. **Gmail poll** — backend polls Gmail for the reset email and extracts the
   link (or code).
3. **Goal B** — agent opens the link and sets the generated password.
4. **Vault** — `{ site, email, password, rotatedAt }` saved to `vault.json`
   (encrypted at rest).

Background job snapshots are also persisted separately so the frontend can
recover row-level progress after refreshes or server restarts.

## Safety & limits

- **`DRY_RUN=true` by default** — nothing is actually changed until you opt in.
- The agent **never** solves CAPTCHAs, 2FA/OTP, or login walls; it emits
  `needs_human` and pauses so you can finish that step.
- Use `ALLOWED_DOMAINS` to restrict which sites the agent may touch.
- Secrets are never logged; the vault is encrypted with `VAULT_KEY`.
- Automating some sites may violate their Terms of Service — use responsibly.

## Manual end-to-end test

1. Start the backend (`yarn server`) and the SPA (`yarn dev`).
2. Sign in with Google in the SPA, open **Rotate**.
3. Enter a test site you control + the account email, click **Rotate**.
4. Watch the live agent log and screenshots; with `DRY_RUN=true` the new
   password is filled but not submitted.

## Manual verification for Password page background jobs

1. Import a CSV in the SPA Password page and start a background job from one
   row.
2. Refresh the page and confirm the frontend reconnects to the existing job via
   the stored job id.
3. Create duplicate rows with the same host and username and confirm fallback
   matching stays one-to-one rather than reusing the same discovered job for
   multiple rows.
4. Delete or invalidate a persisted job id and confirm the frontend retries it
   briefly before dropping the stale mapping.
5. Seed enough active jobs to hit the list cap and confirm the list response is
   marked truncated and the SPA shows the warning banner.

## Troubleshooting Password page reconnects

- `Linked via saved job` means the SPA recovered the row from a persisted job
  id returned by the background job endpoints.
- `Matched via fallback` means the SPA could not reuse a saved id and instead
  matched an active job by normalized host plus username/email.
- If a row does not reconnect immediately, check whether the referenced job id
  still exists; the frontend intentionally retries a stale id briefly before
  abandoning it.
- If the SPA shows a truncated-discovery warning, the list endpoint hit its
  applied limit and older active jobs may be omitted from that refresh cycle.

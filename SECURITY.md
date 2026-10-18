# Frontend Security

This document is the current frontend security posture for Mining Tycoon.
It describes the active runtime rules and maintenance expectations that must remain true in the frontend repo.
Last reviewed: 2026-10-18.

Historical frontend security snapshots live under `docs/history/audits/`.

## Current Security Posture

- Use safe DOM APIs only for runtime rendering: `textContent`, `createElement`, and targeted attribute updates.
- Do not introduce untrusted or dynamic `innerHTML` into gameplay, lobby, admin, or chat rendering paths. This holds on all three scripted pages (the guide and legal pages are static, without scripts): the admin create-result box is built with `createElement`/`textContent`, and its game link gets an `href` only for http(s) URLs. The only remaining `innerHTML` use is `innerHTML = ''` to clear a table body. `src/security-rendering.test.js` guards the lobby, admin and event-display paths.
- Guard JSON parsing and stream payload handling with safe failure behavior. Backend error bodies are normalized by `src/utils/api-error.js` inside `try/catch`.
- Normalize backend URLs and reject non-HTTP(S) schemes; production builds also reject plain `http://` overrides except for `localhost` / `127.0.0.1` (`normalizeBaseUrl` in `src/utils/storage-utils.js`, used by the lobby, the board and the admin console). The build-time default (`VITE_API_BASE_URL`, `src/config/backend-url.js`) also accepts only http(s) and falls back to `http://127.0.0.1:8000`.
- Encode player and game identifiers before interpolating them into request paths. Event tokens must match `^[a-z0-9_-]+$` before they are used in selectors.
- Treat frontend calculations as display-only; backend authority must remain intact.

## Authentication and Tokens

- Account login returns a bearer token. The lobby re-validates a stored token with `GET /auth/me` on load; a `401` clears the local session, while network errors keep it.
- Joining a game returns a per-game `player_token`, stored under `mining-tycoon:playerToken:{game}:{player}` and sent as `X-Player-Token` for upgrades, trades, session start and SSE/chat ticket requests.
- SSE and chat use short-lived tickets: a fresh `GET /games/{id}/sse-ticket` before every stream connect and reconnect; an expired ticket is never replayed.
- Tokens and tickets are never logged or rendered.
- Logout, password change, account deletion and an expired sign-in (`401`) also remove every stored player token (`clearPlayerTokens()` in `src/utils/storage-utils.js`), so the next person on a shared device cannot act as this player in a round that is still running.
- Account data protection: "Download my data" fetches `GET /auth/me/export` with the bearer token and saves it through a Blob and a temporary object URL (revoked right after the download starts); nothing is sent to third parties. "Delete account" re-asks for the password (sent only in the `DELETE /auth/me` body, never stored or rendered) and needs a confirmation checkbox; on `204` the local session is cleared like a logout.
- **Known trade-off:** the account token (`mining-tycoon:authToken`) and player tokens are kept in `localStorage`, so any script running on the page origin could read them. This makes the "no untrusted `innerHTML`" rule and a strict deployment (static `dist/` only, security headers from `deploy/nginx/mining-frontend.conf`) essential. A move to httpOnly cookies would need backend changes and is not planned yet.
- The admin token is typed into `admin.html` per visit and is not persisted; only the backend URL is stored.
- Administrator account session (admin console only): after "Sign in as administrator" the session token is kept in `sessionStorage` under `mining-tycoon:adminSession` (this tab only; gone when the tab closes) and sent as `Authorization: Bearer` only when the Admin Token field is empty. It is cleared on Sign out (`POST /auth/logout`), once `expires_at` has passed, on 401 `ACCOUNT_AUTH_INVALID` and on 403 `ADMIN_REQUIRED`; a stored session is re-checked with `GET /auth/me` on load. A non-admin login is revoked immediately. When the lobby is signed in with an administrator account (`/auth/me` -> `is_admin: true`), the console reuses that lobby token instead of asking again (copied into the same `sessionStorage` entry); signing out in the console revokes it server-side. Like the lobby token, it is readable by scripts on the page origin, so the same no-`innerHTML` and strict deployment rules apply. All admin authorization stays backend-side; the console's gating and the lobby's "you are an administrator" label are convenience only.

## Password Reset and Email Verification

- Password reset uses single-use email tokens. The lobby shows "Forgot password?" only when `GET /auth/email-capabilities` reports `password_reset: true`; the request (`POST /auth/password-reset/request`) always gets the backend's generic answer, so it does not reveal whether an account exists.
- The emailed links `index.html?reset=<token>` and `index.html?verify=<token>` are read once and removed from the address bar right away (`src/ui/lobby-account-email.js`); the tokens are never logged, stored or rendered. The new password is sent only in the `POST /auth/password-reset/confirm` body.
- The backend sends the emails through `MAIL_BACKEND` (`smtp` in production, `log` for local development, `disabled`). Without email delivery the reset endpoints answer `403 PASSWORD_RESET_DISABLED`. The old unverified reset (`ALLOW_UNVERIFIED_PASSWORD_RESET`) was removed.

## Runtime Areas That Matter Most

- Live SSE rendering and reconnect logic.
- Async session start and session-scoped stream wiring.
- Local storage reads and writes for tokens, selected game context, and UI state.
- Lobby, player board, and admin DOM updates.
- Tooltip, chat, and event-display rendering paths.

## Operational Expectations

- Keep the implementation aligned with `LOCKED_DECISIONS.md`, `PROJECT_BASELINE.md`, and `README.md`.
- Update this file whenever frontend security assumptions, rendering guarantees, storage handling, or request-safety rules change.
- Keep the historical audit snapshots for traceability only; do not use them as the live release checklist.
- Deploy only the built `dist/` output (see `DEPLOY.md`).
- The nginx template (`deploy/nginx/mining-frontend.conf`) sends a Content-Security-Policy: scripts and styles only from the site itself (no inline scripts, no `<style>` tags or `style=""` attributes; `style-src` has no `'unsafe-inline'`, JS may still set `element.style`), network calls only to the site and the backend origin (`connect-src` from the deploy's `--api-origin`), no plugins, no framing. New pages must not add inline scripts, inline styles or third-party script/style origins (`src/ui/admin-link-gate.test.js` checks every page).

## Verification

Security-relevant changes run the normal gates in
[QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md), which include
`npm audit --audit-level=high`, CodeQL, gitleaks secret scanning and the
rendering-safety tests.

## Current Known Constraints

- Browser storage availability can vary by environment; failures must degrade gracefully.
- Development-only diagnostics may log structural state information, but should never log secrets or unsafe HTML payloads.
- Frontend code must not weaken the backend's validation, determinism, or authorization model.

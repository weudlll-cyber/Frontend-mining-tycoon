# Frontend Security

This document is the current frontend security posture for Mining Tycoon.
It describes the active runtime rules and maintenance expectations that must remain true in the frontend repo.
Last reviewed: 2026-10-07.

Historical frontend security snapshots live under `docs/history/audits/`.

## Current Security Posture

- Use safe DOM APIs only for runtime rendering: `textContent`, `createElement`, and targeted attribute updates.
- Do not introduce untrusted or dynamic `innerHTML` into gameplay, lobby, admin, or chat rendering paths. This now holds on all three pages: the admin create-result box is built with `createElement`/`textContent`, and its game link gets an `href` only for http(s) URLs. The only remaining `innerHTML` use is `innerHTML = ''` to clear a table body. `src/security-rendering.test.js` guards the lobby, admin and event-display paths.
- Guard JSON parsing and stream payload handling with safe failure behavior. Backend error bodies are normalized by `src/utils/api-error.js` inside `try/catch`.
- Normalize backend URLs and reject non-HTTP(S) schemes. The build-time default (`VITE_API_BASE_URL`, `src/config/backend-url.js`) also accepts only http(s) and falls back to `http://127.0.0.1:8000`.
- Encode player and game identifiers before interpolating them into request paths. Event tokens must match `^[a-z0-9_-]+$` before they are used in selectors.
- Treat frontend calculations as display-only; backend authority must remain intact.

## Authentication and Tokens

- Account login returns a bearer token. The lobby re-validates a stored token with `GET /auth/me` on load; a `401` clears the local session, while network errors keep it.
- Joining a game returns a per-game `player_token`, stored under `mining-tycoon:playerToken:{game}:{player}` and sent as `X-Player-Token` for upgrades, trades, session start and SSE/chat ticket requests.
- SSE and chat use short-lived tickets: a fresh `GET /games/{id}/sse-ticket` before every stream connect and reconnect; an expired ticket is never replayed.
- Tokens and tickets are never logged or rendered.
- Account data protection: "Download my data" fetches `GET /auth/me/export` with the bearer token and saves it through a Blob and a temporary object URL (revoked right after the download starts); nothing is sent to third parties. "Delete account" re-asks for the password (sent only in the `DELETE /auth/me` body, never stored or rendered) and needs a confirmation checkbox; on `204` the local session is cleared like a logout.
- **Known trade-off:** the account token (`mining-tycoon:authToken`) and player tokens are kept in `localStorage`, so any script running on the page origin could read them. This makes the "no untrusted `innerHTML`" rule and a strict deployment (static `dist/` only, security headers from `deploy/nginx/mining-frontend.conf`) essential. A move to httpOnly cookies would need backend changes and is not planned yet.
- The admin token is typed into `admin.html` per visit and is not persisted; only the backend URL is stored.

## Password Reset

- Self-service password reset is **disabled by default** in the backend: `POST /auth/reset-password` answers `403` with code `PASSWORD_RESET_DISABLED` unless the dev/testing flag `ALLOW_UNVERIFIED_PASSWORD_RESET=true` is set (never in strict mode). This is the intended behavior of the backend security hardening PR (`Mining-tycoon` #9, still open on 2026-10-07).
- The lobby's forgot-password dialog shows the server message inside the dialog (fallback: "Password reset is not available. Please contact an administrator.") and still handles a `200` when the flag is enabled.
- A secure email-token reset flow is not implemented yet.

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

## Verification

Security-relevant changes run the normal gates in
[QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md), which include
`npm audit --audit-level=high`, CodeQL, gitleaks secret scanning and the
rendering-safety tests.

## Current Known Constraints

- Browser storage availability can vary by environment; failures must degrade gracefully.
- Development-only diagnostics may log structural state information, but should never log secrets or unsafe HTML payloads.
- Frontend code must not weaken the backend's validation, determinism, or authorization model.

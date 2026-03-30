# Frontend Security

This document is the current frontend security posture for Mining Tycoon.
It describes the active runtime rules and maintenance expectations that must remain true in the frontend repo.

Historical frontend security snapshots live under `docs/history/audits/`.

## Current Security Posture

- Use safe DOM APIs only for runtime rendering: `textContent`, `createElement`, and targeted attribute updates.
- Do not introduce untrusted or dynamic `innerHTML` into gameplay, lobby, admin, or chat rendering paths.
- Guard JSON parsing and stream payload handling with safe failure behavior.
- Normalize backend URLs and reject non-HTTP(S) schemes.
- Encode player and game identifiers before interpolating them into request paths.
- Treat frontend calculations as display-only; backend authority must remain intact.

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

## Minimum Verification For Security-Relevant Frontend Changes

- `npm run lint`
- `npm run test -- --run`
- `npm run test:coverage`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`

## Current Known Constraints

- Browser storage availability can vary by environment; failures must degrade gracefully.
- Development-only diagnostics may log structural state information, but should never log secrets or unsafe HTML payloads.
- Frontend code must not weaken the backend's validation, determinism, or authorization model.
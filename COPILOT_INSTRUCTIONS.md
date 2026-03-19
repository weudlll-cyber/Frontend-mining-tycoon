# Copilot Instructions (Always-On)

These instructions apply to all future Copilot changes in this repository.

## 1) Required Context Before Any Edit

Always read and honor:
- `LOCKED_DECISIONS.md` (canonical invariants)
- `PROJECT_BASELINE.md` (implemented truth)
- `README.md` (UI layout and runbooks)
- `CONTRIBUTING.md` (process expectations)
- `SECURITY_AUDIT.md` (security posture)

If any requested change would violate a locked invariant:
- Stop.
- Require Change Control first.
- Add a REDESIGN DECISION to `LOCKED_DECISIONS.md` before any violating code/docs changes.

## 2) UI Invariants (Must Preserve)

- No blocking overlays, modals, or popups for core gameplay.
- Desktop core gameplay view must remain no-page-scroll.
- Analytics stays read-only and visible, including:
  - per-token output and total output
  - cumulative mined
  - balances
  - oracle prices
  - fee/spread
- Trading and farming remain visible even when disabled.
- Chat remains social-only and inline.

## 3) Security Invariants (Must Preserve)

- Use `textContent` / `createElement` for runtime rendering.
- Do not use untrusted `innerHTML`.
- Keep JSON parsing guarded (`try/catch` with safe fallback).
- Encode game/player IDs in URLs.

## 4) After Every Change

- Evaluate test impact; add or update Vitest tests for behavior changes.
- Evaluate documentation impact; update `README.md` and/or `PROJECT_BASELINE.md` if behavior or UI contract changed.
- Run quality gates:
  - `npm run lint`
  - `npm run format:check`
  - `npm run test -- --run`
  - `npm run build`
  - `npm audit --omit=dev`

## 5) Required Copilot Output Format

For every completed change summary, include:
1. Touched files
2. Rationale
3. Tests added/updated
4. Docs updated
5. Command results

# Copilot Instructions (Always-On Contract)

These instructions are mandatory for all future Copilot changes in this repository.

## 1) Canonical Documents (Read First)

Before proposing or applying any change, read and honor:
- `LOCKED_DECISIONS.md` (hard invariants and change-control gate)
- `PROJECT_BASELINE.md` (implemented truth)
- `README.md` (layout, behavior, runbooks)
- `CONTRIBUTING.md` (process and contribution discipline)
- `SECURITY_AUDIT.md` (security posture and safe patterns)

If a requested change would violate any locked invariant:
- Stop immediately.
- Require an explicit REDESIGN DECISION in `LOCKED_DECISIONS.md` first.
- Do not implement violating code/docs changes before that.

## 2) Architecture & Gameplay Invariants (Must Preserve)

- Backend remains authoritative and deterministic; frontend remains display/intent only.
- Snapshot-locked economy/oracle/halving/events must not be weakened.
- No P2P markets and no real-money mechanics.
- Scoring stays final oracle-weighted portfolio value, fixed before round start.

## 3) UI Invariants (Must Preserve)

- No blocking overlays/modals/popups for core gameplay.
- Desktop core gameplay remains no-page-scroll.
- Trading and Farming sections remain visible even when disabled.
- Analytics/Player State remains read-only and visible, including:
  - per-token output and total output
  - cumulative mined
  - balances
  - oracle prices
  - fee/spread
- Chat remains social-only, inline/docked, internally scrollable, and non-gameplay.

## 4) Security Invariants (Must Preserve)

- Use safe DOM APIs: `textContent`, `createElement`, targeted attribute updates.
- Never introduce untrusted or dynamic `innerHTML`.
- Guard JSON parsing with `try/catch` and safe early return.
- Encode/normalize IDs and URLs.
- Keep security posture consistent so `SECURITY_AUDIT.md` remains accurate/green.

## 5) Code Readability & Commenting Standards (Required)

For every source file touched or created:
- Keep/update a short file-level start comment explaining:
  - file responsibility
  - system role (UI module/service/helper/test utility)
  - key constraints/assumptions
- Add inline comments where logic is non-trivial:
  - non-obvious calculations
  - formatting decisions
  - layout constraints
  - edge cases/fallback behavior
- Explain why decisions exist, not trivial what statements.
- Prefer clear, maintainable code over clever/compact code.

## 6) After Every Change (Required Process)

- Evaluate test impact; add/update Vitest tests for changed behavior.
- Evaluate documentation impact:
  - update `README.md` and/or `PROJECT_BASELINE.md` when behavior/UI contract changes
  - if docs are unchanged, explicitly state why
- Run all quality gates before push:
  - `npm run lint`
  - `npm run format:check`
  - `npm run test -- --run`
  - `npm run build`
  - `npm audit --omit=dev`

## 7) Required Output Format

Every completed task/PR summary must include:
1. Summary of changes
2. Files touched
3. Invariant compliance statement
4. Security considerations
5. Tests added/updated (or explicit reason none)
6. Docs updated (or explicit reason none)
7. Confirmation all quality gates passed

## 8) Scope Discipline

- Keep changes minimal, safe, and reviewable.
- Prefer small focused commits.
- Do not mix refactors, behavior changes, and formatting unless justified.

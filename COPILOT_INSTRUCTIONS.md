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

## 1.1) Cross-Repo Canonical Context (Frontend + Backend)

When a task touches full-stack behavior, also read backend canonical docs:

- `C:\Users\weudl\Mining tycoon\README.md`
- `C:\Users\weudl\Mining tycoon\REQUIREMENTS.md`
- `C:\Users\weudl\Mining tycoon\SECURITY.md`
- `C:\Users\weudl\Mining tycoon\BACKEND_TEST_AUDIT.md`

Cross-repo rule:

- Keep frontend and backend contracts aligned; do not change one side in ways that silently break the other.
- If contracts diverge, update docs/tests on both sides or stop and raise change-control requirements.

## 2) Architecture & Gameplay Invariants (Must Preserve)

- Backend remains authoritative and deterministic; frontend remains display/intent only.
- Snapshot-locked economy/oracle/halving/events must not be weakened.
- No P2P markets and no real-money mechanics.
- Scoring stays final oracle-weighted portfolio value, fixed before round start.

## 3) UI Invariants (Must Preserve)

- No blocking overlays/modals/popups for core gameplay.
- Desktop core gameplay remains no-page-scroll.
- Keep one shared micro-tooltip system for player/season headers (`.ps-tip-trigger` + `.ps-tip-bubble` via `#tooltip-layer`).
- Tooltip close behavior must be pointer-leave / Escape / blur only; do not add timeout-based auto-hide paths.
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

## 5) Commenting Requirements (MUST - All Files)

### 5.1) File-level start comment (required in every source file)

Every source file must start with a short top-of-file comment block that covers:

- file purpose and responsibilities
- module role in system data-flow (upstream/downstream context)
- important constraints (invariants, UI rules, determinism)
- security notes when applicable

Example:

```js
/**
 * File: player-view.js
 * Purpose: Renders the Player State analytics matrix (read-only).
 * Context: Must respect LOCKED_DECISIONS invariants; frontend is display-only.
 * Notes: Uses safe DOM patterns (textContent/createElement).
 */
```

### 5.2) Inline comments (required for non-trivial logic)

- Explain WHY a calculation, layout choice, or fallback exists.
- Clarify data-flow, edge cases, and invariant-preserving logic.
- Do not add trivial commentary (for example, "increment i").

### 5.3) Comment quality

- Keep comments factual, concise, and aligned with current behavior.
- Remove outdated/misleading comments during edits.
- Do not add noisy or unnecessary comments.

### 5.4) Apply to all future changes

- New files must include required file-level start comments.
- Modified files must gain/update comments where logic is non-obvious.
- Large refactors require comprehensive comment updates.
- PRs missing required commenting compliance are incomplete.

## 6) Code Readability & Commenting Standards (Required)

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

## 7) After Every Change (Required Process)

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

If backend files are touched in the same task, also run backend gates before push:

- `python -m ruff check app tests scripts`
- `python -m unittest discover -s tests -q`
- `python -m pip_audit -r requirements.txt`

## 8) Required Output Format

Every completed task/PR summary must include:

1. Summary of changes
2. Files touched
3. Invariant compliance statement
4. Security considerations
5. Tests added/updated (or explicit reason none)
6. Docs updated (or explicit reason none)
7. Confirmation all quality gates passed

## 9) Scope Discipline

- Keep changes minimal, safe, and reviewable.
- Prefer small focused commits.
- Do not mix refactors, behavior changes, and formatting unless justified.

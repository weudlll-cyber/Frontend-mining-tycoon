# Copilot Instructions (Always-On Contract)

These instructions are mandatory for all future Copilot changes in this repository.

## 1) Canonical Documents (Read First)

Before proposing or applying any change, read and honor:

- `LOCKED_DECISIONS.md` (hard invariants and change-control gate)
- `PROJECT_BASELINE.md` (implemented truth)
- `SCORING_MODES.md` (approved scoring/outcome mode definitions)
- `README.md` (layout, behavior, runbooks)
- `CONTRIBUTING.md` (process and contribution discipline)
- `SECURITY.md` (current security posture and safe patterns)

If a requested change would violate any locked invariant:

- Stop immediately.
- Require an explicit REDESIGN DECISION in `LOCKED_DECISIONS.md` first.
- Do not implement violating code/docs changes before that.

## 1.1) Cross-Repo Canonical Context (Frontend + Backend)

When a task touches full-stack behavior, also read backend canonical docs:

- sibling backend repo `README.md`
- sibling backend repo `PROJECT_BASELINE.md`
- sibling backend repo `REQUIREMENTS.md`
- sibling backend repo `SECURITY.md`
- sibling backend repo `TESTING.md`

Cross-repo rule:

- Keep frontend and backend contracts aligned; do not change one side in ways that silently break the other.
- If contracts diverge, update docs/tests on both sides or stop and raise change-control requirements.

## 1.2) Umbrella Workspace Context

When a task changes startup flow, testing workflow, full-stack handover, or other cross-repo operator guidance, also review umbrella workspace docs under `C:\Users\weudl\`:

- `DOCS_STATUS.md`
- `FULL_STACK_AUDIT_SUMMARY.md`
- `HOW_TO_START_THE_GAME_STEP_BY_STEP.txt`
- `HOW_TO_RUN_TESTS_AND_CHECKS_STEP_BY_STEP.txt`
- `PRINT_ME_DAILY_GAME_START_CHECKLIST.txt`
- `QUICK_START_TESTS_AND_CHECKS.txt`

Rule:

- Important umbrella docs must be kept aligned before PR or merge whenever the described workflow or handover behavior changes.

## 2) Architecture & Gameplay Invariants (Must Preserve)

- Backend remains authoritative and deterministic; frontend remains display/intent only.
- Snapshot-locked economy/oracle/halving/events must not be weakened.
- No P2P markets and no real-money mechanics.
- Scoring supports four approved outcome modes: Stockpile (default), Power, Mining Time Equivalent, and Efficiency.
- `scoring_mode` is a first-class round contract field set at creation and snapshot-locked for all players in that round.
- Outcome mode must be fixed before round start and must not switch mid-round.

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
- Keep security posture consistent so `SECURITY.md` remains accurate.

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
  - update other affected frontend docs (`CONTRIBUTING.md`, `LOCKED_DECISIONS.md`, `CODE_ORGANIZATION.md`, `SECURITY.md`, concept docs) when their statements become stale
  - if the change affects backend contracts, runtime behavior, security posture, or operational steps, review and update sibling backend docs in the same workstream
  - if the change affects startup/testing/full-stack workflow or handover guidance, review and update the important umbrella workspace docs in the same workstream
  - if docs are unchanged, explicitly state why
- Run all quality gates before push:
  - `npm run lint`
  - `npm run format:check`
  - `npm run test -- --run`
  - `npm run test:coverage`
  - `npm run build`
  - `npm audit --omit=dev --audit-level=high`

- Prefer the audited push helper when pushing this repo:
  - `& .\scripts\push_with_audit.ps1`
  - ensure tracked hooks are enabled with `& .\scripts\enable_git_hooks.ps1`

If backend files are touched in the same task, also run backend gates before push:

- `python -m ruff check app tests scripts`
- `python -m unittest discover -s tests -q`
- `python -m pytest -q`
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

Additional output policy for this repository:

- Do not paste full file bodies in task summaries, PR summaries, or review comments.
- Report changed files with concise per-file summaries only.
- Include CI gate status with `merge-safe = YES` or `merge-safe = NO` when relevant.
- Keep final merge approval manual; do not recommend or enable auto-merge.

## 8.1) Manual Final Approval Workflow

- Required frontend status checks are: `Lint`, `Format check`, `Unit tests`, `Test coverage`, `Build`, `Security audit`, and `CI Summary (Manual Merge Gate)`.
- PR bodies must include the required machine-generated sections from `.github/pull_request_template.md`.
- Branch protection must keep squash merge as the only merge method and keep auto-merge disabled.
- Stable rollback tagging happens only after a manual merge decision.

## 9) Scope Discipline

- Keep changes minimal, safe, and reviewable.
- Prefer small focused commits.
- Do not mix refactors, behavior changes, and formatting unless justified.

## 10) Control Data / Tuning Values (Steuerdaten)

- All game setup tunables — duration presets, session/enrollment limits, scoring mode defaults, async defaults — must live in `src/config/game-control-data.js`.
- Trade-scheduling tunables must live in `src/config/trading-control-data.js`.
- `src/config/index.js` is the barrel export; external modules may import from either the barrel or the individual files.
- Never hardcode tunable values inline in UI modules, service modules, or `main.js`. Import from `src/config` instead.
- Equivalent backend policy constants must live in `app/policy/control_data.py`. Do not duplicate them in `game_service.py` or `schemas.py`.

## 11) Admin Setup (Separate Entrypoint)

### Separation of Concerns

Game configuration is strictly **admin-only** and is managed via a separate entrypoint:

- **Player entrypoint** (`index.html`): Joins existing rounds, plays games, views state, requests upgrades.
- **Admin entrypoint** (`admin.html`): Creates and configures new rounds with snapshot-locked settings.

### Key Rules

- Admin setup must remain in a **separate file/module** (`src/admin/admin-setup.js`), not mixed into the player workflow.
- Settings are **snapshot-locked** at round creation: once a round is created, no runtime override is possible (backend-enforced invariant from `LOCKED_DECISIONS.md`).
- Admin link discoverability: The player page (`index.html`) has a **hidden** admin link that appears **only if `?admin=1` is in the URL query**. This prevents accidental exposure of admin controls.
- Permission enforcement is **backend-authoritative**: frontend gating is convenience only; backend validates X-Admin-Token header per `REQUIRE_ADMIN_FOR_GAME_CREATE` env flag.
- All admin-facing control data must be imported from `src/config/` (no hardcoded defaults in admin UI).

### Frontend Admin Controls

- Admin-only elements in `index.html` use the `.admin-only` CSS class and are hidden by default (display: none).
- If a feature must show admin UI conditionally (rare), gate it explicitly in code and document the gate.
- No admin controls should ever appear in the player UI without explicit gating.

### Visual Distinction

- Player page uses `body.page-player` styling with player-themed accents (cyan/teal).
- Admin page uses `body.page-admin` styling with admin-themed accents (amber/warning).
- Page banners clearly indicate context: "⏱ Player Dashboard" vs "⚙️ Admin Setup — round configuration is snapshot-locked".

### No Admin In-Game Powers

- Admins configure the round environment only; they have no special in-game capabilities once a round runs.
- All players in a round see identical settings and are evaluated against identical scoring rules.
- Outcome fairness is guaranteed by backend-authoritative deterministic simulation.

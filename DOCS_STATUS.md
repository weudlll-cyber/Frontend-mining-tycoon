# Frontend Documentation Status

As of: 2026-10-07 (full documentation refresh against `main` after PRs #16-#19).

This is the single index of frontend docs. `README.md` only keeps a short
pointer list.

## Primary Read Order

Read these first in every new chat/session:

1. `PROJECT_BASELINE.md` - canonical factual implementation baseline and current status.
2. `README.md` - setup, run, deploy and day-to-day commands.
3. `LOCKED_DECISIONS.md` - non-negotiable product and UX invariants.

## Inventory

### Canonical (kept current with the code)

| Doc | Purpose |
|---|---|
| `DOCS_STATUS.md` | This index. |
| `PROJECT_BASELINE.md` | What is implemented and tested right now; status checkpoint and open work. Source of truth if docs disagree. |
| `README.md` | Entry point: quick start, pages, UI overview, backend URL, deploy, scripts, CI overview, project structure. |
| `LOCKED_DECISIONS.md` | Invariants and change control, including the 2026-10-07 REDESIGN DECISION for the floating live tools window (pending owner confirmation). |
| `CONTRIBUTING.md` | Contribution process, commenting rules, doc-update duty. |
| `QUALITY_ENFORCEMENT.md` | Single source of truth for local gates, required CI checks, scheduled audits, merge policy and test-quality policy. |
| `CODE_ORGANIZATION.md` | Current module map and dependency rules. |
| `SECURITY.md` | Frontend security posture (safe DOM, tokens, password reset). |
| `COPILOT_INSTRUCTIONS.md` | Working contract for AI-assisted changes. |
| `DEPLOY.md` | Frontend VPS deployment (`scripts/deploy-to-vps.ps1`, `deploy/`). |
| `MANUAL_TEST_RUNBOOK.md` | Manual end-to-end checks and the mining playtest checklist. |
| `PRODUCTION_DEFAULTS_CHECKLIST.md` | Release blockers for temporary test defaults (the `1m` preset, hidden `player.html` defaults). |
| `AUDIT_MATRIX.md` | Redirect stub; the matrix now lives in `QUALITY_ENFORCEMENT.md`. |
| `.github/pull_request_template.md` | Required PR body sections. |
| `public/assets/README.md` | Where to put images and how to name them. |

### Product / Design Reference (intent, with status notes)

| Doc | Purpose |
|---|---|
| `SEASONAL_TYCOON_CONCEPT.md` | Game vision, agreed design decisions, farming roadmap; marks where the implementation differs (trade defaults, default round type). |
| `SCORING_MODES.md` | The four scoring modes, plus the backend formulas (two pending product confirmation). |
| `PRODUCT_INFRASTRUCTURE.md` | Non-gameplay systems (accounts, admin, leaderboards, history, chat) with implemented / partial / not-started markers. |

### Historical (do not use as current reference)

| Doc | Note |
|---|---|
| `docs/history/README.md` | Explains the archive. |
| `docs/history/audits/CODE_ORGANIZATION_AUDIT_2026-03-25.md` | Former `CODE_ORGANIZATION.md`, archived 2026-10-07. |
| `docs/history/audits/TEST_AUDIT_REPORT.md` | Point-in-time test audit. |
| `docs/history/audits/SECURITY_AUDIT.md` | Point-in-time security audit. |
| `docs/history/audits/FULL_STACK_AUDIT_SUMMARY.md` | Cross-repo audit snapshot. |

### Local working files (not in the repository)

- `PROJECT_STATUS.md` may exist as an untracked file in a local checkout. It is
  the owner's 2026-10-07 audit and work plan for both repos. It is not
  versioned; once its items are done, the durable facts belong in
  `PROJECT_BASELINE.md`.

## Rollback Markers

- `checkpoint/2026-03-30-stable-01` - last tagged stable rollback point for
  frontend and backend. No newer stable tag has been created; use the
  `stable-tag.yml` workflow after a manual merge to add one.

## New Chat Bootstrap Prompt

```text
New session for Mining Tycoon.
Please load context from PROJECT_BASELINE.md and README.md in both frontend and backend repos.
Use checkpoint tag checkpoint/2026-03-30-stable-01 as the latest known stable rollback point.
Current objective: <replace with today's goal>.
Constraints: backend-authoritative behavior only, update docs with code changes, and run the gates in QUALITY_ENFORCEMENT.md before push.
```

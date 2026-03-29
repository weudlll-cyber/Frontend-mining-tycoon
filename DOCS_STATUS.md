# Frontend Documentation Status

As of: 2026-03-30

## Primary Read Order

Read these first in every new chat/session:

1. `PROJECT_BASELINE.md` - canonical factual implementation baseline.
2. `README.md` - operational runbook, setup flow, and current delivery snapshot.
3. `LOCKED_DECISIONS.md` - non-negotiable product and UX invariants.

## Full Top-Level Document Inventory

Each top-level text document is listed with purpose and why it exists.

### Canonical Current

- `DOCS_STATUS.md`
	- Purpose: index and ownership map for all top-level text docs.
	- Why it exists: prevents documentation ambiguity and speeds new-chat onboarding.
- `PROJECT_BASELINE.md`
	- Purpose: authoritative, implementation-factual project baseline.
	- Why it exists: prevents drift between design intent and what is actually built/tested.
- `README.md`
	- Purpose: operator/developer entrypoint (run, test, deploy, workflow).
	- Why it exists: fastest onboarding and day-to-day command reference.
- `LOCKED_DECISIONS.md`
	- Purpose: immutable constraints for architecture and UX behavior.
	- Why it exists: protects core product contract from accidental regressions.
- `CONTRIBUTING.md`
	- Purpose: contribution standards, process requirements, and expected quality behavior.
	- Why it exists: consistent team workflow and review expectations.
- `COPILOT_INSTRUCTIONS.md`
	- Purpose: repository-specific AI working contract.
	- Why it exists: makes future AI-assisted edits consistent with project constraints.
- `CODE_ORGANIZATION.md`
	- Purpose: module boundaries, ownership, and structural guidance.
	- Why it exists: reduces architecture entropy and clarifies refactor targets.
- `QUALITY_ENFORCEMENT.md`
	- Purpose: mandatory checks and gate policy.
	- Why it exists: enforces repeatable quality bar before merge/push.
- `AUDIT_MATRIX.md`
	- Purpose: cadence matrix for lint/test/security/audit checks.
	- Why it exists: clear rule set for when each verification must run.
- `DEPLOY.md`
	- Purpose: frontend deployment procedure and handoff details.
	- Why it exists: deterministic, low-risk deployment operations.
- `PRODUCTION_DEFAULTS_CHECKLIST.md`
	- Purpose: explicit release-blocker checklist for temporary test defaults.
	- Why it exists: prevents shipping local testing values to production.
	- Current note: active checklist; still relevant because the temporary `1m` preset is intentionally present.

### Product/Design Reference (Intent-Level)

- `SEASONAL_TYCOON_CONCEPT.md`
	- Purpose: high-level game/product concept and direction.
	- Why it exists: preserves product intent separate from current implementation.
- `SCORING_MODES.md`
	- Purpose: approved scoring mode definitions and behavior framing.
	- Why it exists: single design reference for outcome model semantics.
- `PRODUCT_INFRASTRUCTURE.md`
	- Purpose: non-gameplay systems scope (identity, visibility, governance context).
	- Why it exists: keeps platform concerns explicit beyond gameplay mechanics.

### Security/Test/Audit Snapshots (Historical By Design)

- `TEST_AUDIT_REPORT.md`
	- Purpose: point-in-time test quality findings and follow-ups.
	- Why it exists: audit evidence and historical benchmark.
	- Current note: historical snapshot, not the latest authoritative test count.
- `SECURITY_AUDIT.md`
	- Purpose: point-in-time frontend security assessment summary.
	- Why it exists: recorded security posture and residual-risk history.
	- Current note: historical snapshot; keep for audit history, not as a live release checklist.
- `FULL_STACK_AUDIT_SUMMARY.md`
	- Purpose: cross-repo audit snapshot from a specific review window.
	- Why it exists: historical stack-level checkpoint for traceability.
	- Current note: incomplete historical snapshot; archive candidate if top-level cleanup is desired later.

### Operational Runbook Snapshots

- `MANUAL_TEST_RUNBOOK.md`
	- Purpose: manual validation flows for important UI/gameplay paths.
	- Why it exists: reproducible manual QA during feature and release work.

## Current Stable Rollback Marker

- `checkpoint/2026-03-30-stable-01`
	- Why it exists: exact rollback point for both frontend and backend during risky follow-up work.

## New Chat Bootstrap Prompt

Use this prompt at the start of each new chat:

```text
New session for Mining Tycoon.
Please load context from PROJECT_BASELINE.md and README.md in both frontend and backend repos.
Use checkpoint tag checkpoint/2026-03-30-stable-01 as the latest known stable rollback point.
Current objective: <replace with today's goal>.
Constraints: backend-authoritative behavior only, update docs with code changes, and run full frontend+backend gates before push.
```

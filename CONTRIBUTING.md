# CONTRIBUTING

Thank you for contributing to this project.

## Invariant Compliance

All contributions MUST comply with [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

Before opening a PR:

- Read and align with [PROJECT_BASELINE.md](PROJECT_BASELINE.md), [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).
- Update any affected docs in the same change (at minimum README and PROJECT_BASELINE; include CONTRIBUTING, CODE_ORGANIZATION, LOCKED_DECISIONS, QUALITY_ENFORCEMENT, MANUAL_TEST_RUNBOOK or SECURITY when impacted) and remove stale statements that no longer match the implementation. [DOCS_STATUS.md](DOCS_STATUS.md) lists every doc and its role.
- If the change touches API contracts, session flow, security posture, runbooks, or any other full-stack behavior, review the sibling backend repo docs in the same workstream and update them when needed.
- If the change touches startup flow, testing workflow, workspace orchestration, full-stack handover, or any user-facing process that spans both repos, also review and update the umbrella workspace docs under `C:\Users\weudl\` in the same workstream.
- Treat documentation impact review as mandatory for every code change, even when the outcome is that no doc update was required.
- Validate changes against LOCKED_DECISIONS.md.
- Use the PR checklist in [.github/pull_request_template.md](.github/pull_request_template.md).
- Ensure tests remain green and add/update tests for changed behavior.
- Maintain readability and comments:
  - keep file-level responsibility headers accurate in touched source files
  - add concise inline WHY comments for non-trivial logic/edge cases

## Commenting Compliance

Mandatory for all new or significantly modified source files:

- Include a top-of-file comment block describing:
  - file purpose/responsibilities
  - module/system role and data-flow context
  - important constraints/invariants
  - security notes when applicable
- Add or update inline comments for non-trivial logic where intent is not obvious.
- Comments must explain WHY decisions exist, not restate WHAT code already says.
- Remove outdated or misleading comments as part of the same change.

PRs that do not satisfy commenting compliance are incomplete.

## Quality Gates

[QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md) is the single source of truth
for the local pre-push gate, the required CI checks, scheduled audits, the merge
policy and test-quality expectations. Do not copy those lists into other docs;
link to it.

Working cadence:

- During implementation: run targeted tests for the changed modules (for example `npm run test:fast`, `npm run test:flows` or `npx vitest run <file>`).
- Before every commit: `npm run check:all`.
- Push with `& .\scripts\push_with_audit.ps1` (or plain `git push` with the tracked hook enabled via `& .\scripts\enable_git_hooks.ps1`). Never use `--no-verify`.
- Before larger merges: `npm run audit:health` (advisory structural report).
- If behavior or contracts changed, finish the repo and umbrella doc updates in the same change before committing.

For UI/layout or tooltip changes, keep the guard tests green (`src/layout-css.test.js`, `src/layout-controls.test.js`, `src/tooltip-parity.test.js`).

## Locked Invariant Changes

If your change requires violating a locked invariant:

- You MUST first update LOCKED_DECISIONS.md with an explicit REDESIGN DECISION note.
- Then update dependent docs/tests/code.
- Without this sequence, the PR MUST NOT be merged.

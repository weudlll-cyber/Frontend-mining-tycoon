# CONTRIBUTING

Thank you for contributing to this project.

## Invariant Compliance

All contributions MUST comply with [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

Before opening a PR:

- Read and align with [PROJECT_BASELINE.md](PROJECT_BASELINE.md), [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
- Update any affected docs in the same change (at minimum README and PROJECT_BASELINE; include CONTRIBUTING, CODE_ORGANIZATION, LOCKED_DECISIONS, or security docs when impacted) and remove stale statements that no longer match implementation.
- If the change touches API contracts, session flow, security posture, runbooks, or any other full-stack behavior, review the sibling backend repo docs in the same workstream and update them when needed.
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

The authoritative enforcement policy is documented in [QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md).
Use this file as the source of truth for local push gates, CI merge requirements, and test-quality expectations.

All of the following must pass before merge:

- `npm run lint`
- `npm run format:check`
- `npm run test -- --run`
- `npm run test:coverage`
- `Changed lines coverage` (CI PR check)
- `npm run build`
- `npm audit --omit=dev --audit-level=high`

Recommended structural audit before larger merges:

- `npm run audit:health`

This audit reports oversized files, missing top-of-file comment headers, TODO/FIXME markers, and debug-console usage so refactor work can be planned before a larger merge.
- GitHub check run: `CodeQL`
- GitHub check run: `Dependency Review`
- GitHub check run: `Actionlint`

Local push discipline:

- enable the tracked git hooks once with `& .\scripts\enable_git_hooks.ps1`
- use `& .\scripts\push_with_audit.ps1` for normal pushes when possible
- the tracked pre-push hook runs the same local gate automatically and blocks pushes on failure

Repository merge policy:

- Final merge approval is manual even when CI is fully green.
- Auto-merge must remain OFF.
- Branch protection should require these checks: `Lint`, `Format check`, `Unit tests`, `Test coverage`, `Changed lines coverage`, `Build`, `Security audit`, `CodeQL`, `Dependency Review`, `Actionlint`, and `CI Summary (Manual Merge Gate)`.
- Use squash merge only.
- PR descriptions must follow [.github/pull_request_template.md](.github/pull_request_template.md), including `merge-safe = YES/NO` and a changed-files summary without full file bodies.

For UI/layout or tooltip changes, ensure repository guard tests remain green (for example layout-css and tooltip parity assertions).

If your change requires violating a locked invariant:

- You MUST first update LOCKED_DECISIONS.md with an explicit REDESIGN DECISION note.
- Then update dependent docs/tests/code.
- Without this sequence, the PR MUST NOT be merged.

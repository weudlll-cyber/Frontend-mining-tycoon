# CONTRIBUTING

Thank you for contributing to this project.

## Invariant Compliance

All contributions MUST comply with [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

Before opening a PR:
- Read and align with [PROJECT_BASELINE.md](PROJECT_BASELINE.md), [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
- Validate changes against LOCKED_DECISIONS.md.
- Use the PR checklist in [.github/pull_request_template.md](.github/pull_request_template.md).
- Ensure tests remain green and add/update tests for changed behavior.
- Maintain readability and comments:
	- keep file-level responsibility headers accurate in touched source files
	- add concise inline WHY comments for non-trivial logic/edge cases

## Quality Gates

All of the following must pass before merge:
- `npm run lint`
- `npm run format:check`
- `npm run test -- --run`
- `npm run build`
- `npm audit --omit=dev`

If your change requires violating a locked invariant:
- You MUST first update LOCKED_DECISIONS.md with an explicit REDESIGN DECISION note.
- Then update dependent docs/tests/code.
- Without this sequence, the PR MUST NOT be merged.

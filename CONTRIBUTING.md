# CONTRIBUTING

Thank you for contributing to this project.

## Invariant Compliance

All contributions MUST comply with [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

Before opening a PR:
- Validate changes against LOCKED_DECISIONS.md.
- Use the PR checklist in [.github/pull_request_template.md](.github/pull_request_template.md).
- Ensure tests remain green and add/update tests for changed behavior.

If your change requires violating a locked invariant:
- You MUST first update LOCKED_DECISIONS.md with an explicit REDESIGN DECISION note.
- Then update dependent docs/tests/code.
- Without this sequence, the PR MUST NOT be merged.

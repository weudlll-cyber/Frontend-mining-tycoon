## Summary

Describe what changed and why.

## MUST PASS BEFORE MERGE

- [ ] Canonical docs reviewed before implementation (`LOCKED_DECISIONS.md`, `PROJECT_BASELINE.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY_AUDIT.md`).
- [ ] Invariant compliance checked against `LOCKED_DECISIONS.md`.
- [ ] Security posture preserved (no unsafe DOM patterns; no untrusted `innerHTML`).
- [ ] Tests were updated/added when behavior changed.
- [ ] Docs were updated when UI/behavior contract changed (`README.md`, `PROJECT_BASELINE.md`, and related docs as needed).
- [ ] Readability standards preserved (file-level responsibility comments and non-trivial inline WHY comments where needed).
- [ ] Commands run successfully:
	- [ ] `npm run lint`
	- [ ] `npm run format:check`
	- [ ] `npm run test -- --run`
	- [ ] `npm run build`
	- [ ] `npm audit --omit=dev`

## Invariant Compliance

- [ ] I verified this PR does not violate LOCKED_DECISIONS.md.

Checklist (MUST remain compliant):
- [ ] Backend authority is preserved; frontend did not become authoritative.
- [ ] Oracle/halving/events determinism and snapshot-locked settings are preserved.
- [ ] No P2P market mechanics and no real-money semantics were introduced.
- [ ] Core gameplay UI uses no overlays/modals/popups.
- [ ] Desktop gameplay view keeps important information visible without page scrolling.
- [ ] Inline season upgrades remain visible with hashrate/efficiency/cooling lanes.
- [ ] Analytics remains read-only and visible in main layout.
- [ ] Trading/Farming remain visible as sections even when disabled.
- [ ] Chat remains social-only, docked inline, internally scrollable, and non-gameplay.
- [ ] Tests are green and new/changed behavior is covered by tests.
- [ ] Security posture remains XSS-safe (no untrusted innerHTML patterns).

## If this is a redesign

If any invariant above is intentionally changed, this PR MUST:
1. Update LOCKED_DECISIONS.md first.
2. Add an explicit REDESIGN DECISION note in LOCKED_DECISIONS.md.
3. Then update dependent docs/tests/code to match the redesign.

If any locked invariant is violated, this PR must first add a REDESIGN DECISION to LOCKED_DECISIONS.md.

PRs that violate an invariant without this sequence MUST NOT be merged.

## Validation

List the checks you ran (tests/build/lint/docs review).

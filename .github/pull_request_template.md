## Machine-Generated PR Summary

Provide a concise generated summary of what changed and why.

## Invariant Compliance

- [ ] Canonical docs reviewed before implementation (`LOCKED_DECISIONS.md`, `PROJECT_BASELINE.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY_AUDIT.md`).
- [ ] Backend authority is preserved; frontend remains display/intent only.
- [ ] Snapshot-locked economy/oracle/halving/events behavior remains deterministic.
- [ ] No overlays/modals/popups were introduced for core gameplay.
- [ ] Desktop gameplay still keeps important information visible without page scrolling.
- [ ] Shared micro-tooltip contract remains intact (`.ps-tip-trigger`, `.ps-tip-bubble`, `#tooltip-layer`).
- [ ] Trading/Farming remain visible as sections even when disabled.
- [ ] Chat remains social-only, docked inline, internally scrollable, and non-gameplay.

## Security Notes

- [ ] No untrusted `innerHTML` or equivalent unsafe DOM injection was introduced.
- [ ] Safe DOM patterns remain in use (`textContent`, `createElement`, targeted attribute updates).
- [ ] Any new parsing or external input handling is guarded.

## Documentation Notes

- [ ] `README.md` / `PROJECT_BASELINE.md` / related docs were updated if behavior or workflow changed.
- [ ] Cross-repo doc impact was reviewed; sibling backend docs were updated if API/runtime/security/runbook behavior changed.
- [ ] If no docs changed, explain why no documentation update was required.

## Test Summary

- [ ] Tests were updated or added for changed behavior.
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run test -- --run`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm audit --omit=dev --audit-level=high`

## CI Summary

Record the final CI outcome and include the required gate result.

- `merge-safe = YES` or `merge-safe = NO`
- Manual merge required.
- Auto-merge must remain OFF.

## Changed Files Summary

List changed files with concise summaries only.

No full file bodies included.

## Redesign Gate

If any locked invariant changed intentionally:

1. Update `LOCKED_DECISIONS.md` first.
2. Add an explicit REDESIGN DECISION note.
3. Then update dependent docs, tests, and code.

PRs that violate a locked invariant without that sequence must not be merged.

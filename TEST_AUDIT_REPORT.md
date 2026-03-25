# Frontend Test Audit Report (2026-03-25)

## Scope

This audit summarizes current frontend test coverage quality, practical risk gaps, and execution structure improvements.

## Current Snapshot

- Test framework: Vitest + jsdom
- Coverage enforcement: global thresholds in `vitest.config.js`
- Changed-lines coverage gate: enabled in CI and local script support
- Mutation testing: configured (Stryker dry-run/full)

## Test Inventory (by concern)

- UI modules: `src/ui/**/*.test.js`
- Service/API client orchestration: `src/services/**/*.test.js`
- Meta + storage utilities: `src/meta/**/*.test.js`, `src/utils/**/*.test.js`
- Orchestration flows: `src/main.test.js`, `src/layout-controls.test.js`, `src/async-session-flow.test.js`
- Security rendering guardrails: `src/security-rendering.test.js`

## Top Risk Gaps Identified

1. Countdown timer logic had low confidence around live interval behavior.
2. Existing test command shape made grouped execution less obvious for feature-focused checks.
3. Fast local execution path for related suites was not explicit in npm scripts.

## Actions Implemented in this Workstream

1. Added grouped test scripts in `package.json`:
- `test:ui`
- `test:services`
- `test:flows`
- `test:fast`

2. Added concrete regression + runtime tests for countdown behavior:
- Expanded `src/ui/countdown.test.js` to validate:
  - live elapsed-time updates
  - enrollment countdown updates
  - missing payload fallback
  - stop/reset behavior
  - interval clear semantics

## Recommended Execution Model

- Quick confidence before coding: `npm run test:fast`
- UI-focused changes: `npm run test:ui`
- Integration/orchestration changes: `npm run test:flows`
- Full gate before push: existing pre-push audit workflow

## Next Ratchet Targets

1. Raise global branch threshold incrementally (e.g. +1 to +2 points per cycle).
2. Add scenario-focused tests for high-complexity orchestrator branches in `src/main.js`.
3. Keep mutation dry-run in routine checks for core logic-heavy modules.

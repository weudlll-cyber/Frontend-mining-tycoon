# QUALITY_ENFORCEMENT

Single source of truth for the frontend quality gates: local pre-push checks,
merge-time CI checks, scheduled audits and test-quality policy.

Other docs (`README.md`, `CONTRIBUTING.md`, `COPILOT_INSTRUCTIONS.md`,
`AUDIT_MATRIX.md`) link here instead of repeating the lists. The automation is
the ground truth: `scripts/pre_push_gate.ps1`, `package.json` and
`.github/workflows/*.yml`. If this file and the automation disagree, fix both in
the same change.

Last verified against the automation: 2026-10-07.

## 1) Local Gate (Before Push)

One-time setup (activates the tracked `.githooks/pre-push` hook):

```powershell
& .\scripts\enable_git_hooks.ps1
```

Push with the helper (prints the outgoing commits/files, runs the gate, pushes):

```powershell
& .\scripts\push_with_audit.ps1                # fast profile (default)
& .\scripts\push_with_audit.ps1 -Profile full  # fast + coverage + audit + health
& .\scripts\push_with_audit.ps1 -ForceAudit    # ignore the gate cache
```

A plain `git push` runs the same gate through the hook
(`scripts/pre_push_gate.ps1`, fast profile). The gate result is cached per clean
`HEAD` + tree in `.git/gate-cache/`, so an unchanged clean `HEAD` that already
passed is not checked again. Never bypass the hook with `--no-verify`.

| Step (`scripts/pre_push_gate.ps1`) | Command | `fast` | `full` |
|---|---|---|---|
| Required docs present and non-empty: `README.md`, `PROJECT_BASELINE.md`, `CONTRIBUTING.md`, `LOCKED_DECISIONS.md`, `SEASONAL_TYCOON_CONCEPT.md`, `CODE_ORGANIZATION.md`, `SECURITY.md` | built in | blocking | blocking |
| ESLint | `npm run lint` | blocking | blocking |
| Prettier | `npm run format:check` | blocking | blocking |
| Unit tests | `npm run test -- --run` | blocking | blocking |
| Production build | `npm run build` | blocking | blocking |
| Coverage (thresholds in `vitest.config.js`) | `npm run test:coverage` | - | blocking |
| Dependency audit (all deps, high+) | `npm audit --audit-level=high` | - | blocking |
| Code health (large files, missing headers, TODO/FIXME, console use) | `scripts/code_health_audit.ps1` | - | advisory |

Recommended before every commit. It is a superset of the fast gate and uses the
stricter `clean:audit` instead of plain lint:

```bash
npm run check:all
# = clean:audit (eslint --max-warnings=0 + knip) + format:check + test + build + npm audit --audit-level=high
```

Other local checks:

- `npm run test:contract`: the CI contract suite (`src/meta/meta-manager.test.js` plus the `src/main.*` tests).
- `npm run check:changed-lines-coverage`: needs `BASE_SHA` and a fresh `npm run test:coverage`.
- `npm run mutation:check` (Stryker dry run) and `npm run mutation` (full run, config in `stryker.config.mjs`).
- `npm run audit:health`: the advisory code-health report on its own.

`format:check` covers `src/**/*.{js,css}` and the three HTML entry points.
Markdown is not format-checked; keep it tidy by hand.

## 2) Merge-Time CI (Pull Requests)

### `ci.yml`

A path filter (`Detect Changed Areas`) decides whether the frontend checks run.
It matches `src/**`, `public/**`, `*.html`, `scripts/**`, `.github/**`,
`package*.json`, the eslint/prettier/vite/vitest/knip/stryker configs and five
docs (`README.md`, `PROJECT_BASELINE.md`, `LOCKED_DECISIONS.md`,
`CONTRIBUTING.md`, `COPILOT_INSTRUCTIONS.md`). When nothing matches, each job
passes "by policy" without running.

| Job (check name) | Command | Runs on | Gate |
|---|---|---|---|
| `PR Policy` | checks the PR body for the template sections | PRs | warning only |
| `Lint` | `npm run lint` | push + PR | blocking |
| `Format check` | `npm run format:check` | push + PR | blocking |
| `Unit tests` | `npm run test -- --run` | push + PR | blocking |
| `Test coverage` | `npm run test:coverage` (global thresholds) | push + PR | blocking |
| `Changed lines coverage` | `npm run check:changed-lines-coverage` | PRs | blocking; every added production JS line must be covered |
| `Contract checks` | `npm run test:contract` | PRs | blocking |
| `Build` | `npm run build` | push + PR | blocking |
| `Security audit` | `npm audit --audit-level=high` | push + PR | blocking; 0 high/critical |
| `CI Summary (Manual Merge Gate)` | aggregates the jobs above and writes `merge-safe = YES/NO` | push + PR | blocking |
| `Post PR CI Results Comment` | creates or updates the results comment | PRs | informational |

### Other PR workflows

| Workflow | Job (check name) | Gate |
|---|---|---|
| `codeql.yml` | `CodeQL` (also on push and weekly) | blocking |
| `dependency-review.yml` | `Dependency Review` (skips when the dependency graph is unavailable) | blocking |
| `actionlint.yml` | `Actionlint` (also on push) | blocking |
| `security-compliance.yml` | `Secret scan` (gitleaks, full history) | blocking |
| `security-compliance.yml` | `License policy` (`license-checker --production` + `scripts/check_license_policy.mjs`; denies GPL/AGPL/SSPL) | blocking |
| `security-compliance.yml` | `Compliance summary gate` | blocking |

The project has only devDependencies, so `License policy` currently has nothing
to check.

## 3) Scheduled Audits

| Workflow | Schedule (UTC) | Checks |
|---|---|---|
| `nightly-audits.yml` | daily 01:15 | `Full test suite` (lint, format, test, coverage, build); `Flaky detection (3x)` (full test run three times); `Extended security scanning` (`npm audit --audit-level=moderate`); `Nightly summary gate` |
| `security-compliance.yml` | daily 01:45 | secret scan, license policy, `Generate SBOM` (CycloneDX artifact; not on PRs) |
| `codeql.yml` | Mondays 03:20 | CodeQL |
| `keepalive.yml` | Mondays 04:40 | keeps scheduled workflows from being auto-disabled |

Manual workflows: `snapshot.yml` (full gate, then a snapshot tag and optional
release) and `stable-tag.yml` (tags a commit as a stable rollback point after a
manual merge).

## 4) Merge Policy

- Merge only when `CI Summary (Manual Merge Gate)` reports `merge-safe = YES`
  and the other PR workflows above are green.
- Final merge approval is manual. Auto-merge stays OFF.
- PR bodies follow `.github/pull_request_template.md`: all sections, including
  `merge-safe = YES/NO` and a changed-files summary without full file bodies.
- Intended merge method: squash merge.
- Branch protection: `scripts/apply-branch-protection.ps1` requires `Lint`,
  `Format check`, `Unit tests`, `Test coverage`, `Build`, `Security audit` and
  `CI Summary (Manual Merge Gate)`. As of 2026-10-07 it has **not** been applied
  to `main` (the branch is unprotected), and recent PRs were merged with merge
  commits. **Owner decision pending:** apply the protection and enforce squash
  merges, or relax this policy.

## 5) Test Quality Policy

Coverage percentage alone is not enough. Combine:

- fast unit tests for deterministic logic,
- integration-style tests for critical flows (for example
  `src/player-live-board.test.js`, `src/async-session-flow.test.js`,
  `src/post-game-flow.test.js`, `src/lobby.test.js`),
- negative paths (401/403/409/422, malformed payloads, stream failures),
- contract tests for sync/async behavior and backend-authoritative outcomes,
- rendering-safety tests (`src/security-rendering.test.js`) and layout/tooltip
  guard tests (`src/layout-css.test.js`, `src/tooltip-parity.test.js`).

Discipline:

- behavior change: add or update tests in the same change,
- bug fix: add a regression test that fails without the fix,
- contract change: update tests and docs in the same change,
- keep global coverage from decreasing; focus branch coverage on high-risk
  modules; do not write assertion-free tests only to raise coverage,
- quarantine a flaky test only with an owner and an expiry date.

Current enforcement: global coverage thresholds in `vitest.config.js`, 100 %
changed-lines coverage on PRs, and Stryker mutation testing for
`meta-manager`, `storage-utils`, `session-actions` and `stream-controller`
(run manually, not in CI).

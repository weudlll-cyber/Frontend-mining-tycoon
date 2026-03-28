# QUALITY_ENFORCEMENT

This document defines the mandatory quality, test, and security checks for this repository.
It is the operational policy for local pushes and merge-time CI.

## Scope

- Applies to every code change in this repository.
- Documentation-only changes may skip heavy checks only when CI path filters declare no frontend impact.
- Advisory checks may warn without blocking; required checks must block on failure.

## Local Enforcement (Before Push)

Required one-time setup:

```powershell
& .\scripts\enable_git_hooks.ps1
```

Recommended push workflow:

```powershell
& .\scripts\push_with_audit.ps1
```

Mandatory local gate command (run directly or via hook):

```powershell
& .\scripts\pre_push_gate.ps1
```

Required blocking checks in local gate:

- docs presence + non-empty validation
- clean source audit (`npm run clean:audit`)
- prettier format check
- vitest unit tests
- vitest coverage run
- production build
- npm audit (prod dependencies, high+)

Advisory local checks:

- code health audit (large files, comment headers, TODO/FIXME markers, debug console usage)

## Merge-Time CI Enforcement

The CI workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs required jobs for relevant changes.

Required merge checks:

- Lint
- Format check
- Unit tests
- Test coverage
- Changed lines coverage (pull requests)
- Build
- Security audit
- CI Summary (Manual Merge Gate)
- CodeQL
- Dependency Review
- Actionlint

Policy requirements:

- auto-merge must remain disabled
- final merge approval is manual
- squash merge only
- branch protection must require all required checks above

## Test Quality Policy

Coverage percentage alone is not enough. Test quality must combine multiple signals:

- fast unit tests for deterministic logic
- integration-style UI tests for critical user flows
- negative-path tests (422/401/409, malformed payloads, stream failures)
- contract-sensitive tests for async/sync mode behavior and backend-authoritative outcomes
- rendering safety tests (XSS-safe rendering patterns)

Required test change discipline:

- behavior change => add or update tests in same change
- bug fix => add a regression test reproducing old failure first
- contract change => update tests and docs in same change

## Coverage Strategy (High Coverage Without Blind Spots)

Use a ratcheting strategy to reach very high coverage safely:

- keep global coverage non-decreasing over time
- prioritize branch coverage on high-risk modules
- add focused tests for uncovered lines in critical paths first
- avoid coverage inflation via trivial assertion-only tests

Recommended next enforcement upgrades:

- add explicit coverage thresholds in Vitest config (global + per critical area)
- add mutation testing for core business logic modules

Current support for changed-lines coverage:

- local command: `npm run check:changed-lines-coverage` (requires `BASE_SHA` env var)
- CI PR enforcement: `Changed lines coverage` job

Current support for mutation testing:

- dry run: `npm run mutation:check`
- full run: `npm run mutation`
- config: `stryker.config.mjs`

## Early Defect Detection Enhancements

To detect problems earlier than end-to-end runs:

- keep test execution split by concern (lint/format/unit/coverage/build/security)
- run affected tests on each push and full suite before merge
- track flaky tests and quarantine only with owner + expiry
- fail fast on security and contract breakage

## Ownership

If any rule in this file conflicts with scripts or CI definitions, update both in the same change so policy and automation stay aligned.

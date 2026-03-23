# Full Stack Audit Summary

Date: 2026-03-19
Branch: chore/audit-refresh-20260319
Status: In progress

## Step 0 Discovery

Frontend repo:

- Toolchain: Vite, Vitest, ESLint, Prettier
- Key commands:
  - `npm ci`
  - `npm run lint`
  - `npm run format:check`
  - `npm run test -- --run`
  - `npm run build`
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml)

Backend repo:

- Toolchain: Python virtualenv, requirements.txt, unittest, Ruff, Black, pip-audit
- Key commands:
  - `python -m pip install -r requirements.txt`
  - `python -m unittest discover -s tests -q`
  - `python -m ruff check app tests scripts`
  - `python -m black --check app tests scripts`
- CI: `C:\Users\weudl\Mining tycoon\.github\workflows\ci.yml`

Largest source files discovered:

1. `C:\Users\weudl\frontend mining tycoon\src\main.js` — 1330 lines
2. `C:\Users\weudl\Mining tycoon\app\services\game_service.py` — 1025 lines
3. `C:\Users\weudl\Mining tycoon\app\api\routes.py` — 873 lines

Existing audit reports:

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — 2025-01-15
- [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) — 2025-01-15
- `C:\Users\weudl\Mining tycoon\BACKEND_TEST_AUDIT.md` — 2025-01-15

## Step 1 Baseline Quality Run

### Frontend

Commands run:

- `npm ci`
- `npm install`
- `npm run lint`
- `npm run format:check`
- `npm run test -- --run`
- `npm run build`

Results:

- `npm ci`: failed due Windows EPERM on locked Rollup binary under `node_modules`
- `npm install`: succeeded; restored local toolchain, reported 1 high severity npm audit issue
- `npm run lint`: now passes after audit cleanup and modularization work
- `npm run format:check`: now passes after frontend formatting normalization
- `npm run test -- --run`: passed
  - Test files: 7 passed
  - Tests: 97 passed
- `npm run build`: passed
- `npm audit --omit=dev`: passed
  - found 0 vulnerabilities

Warnings:

- Windows file lock prevented clean reinstall with `npm ci`
- `npm ci` remains less reliable than `npm install` on this Windows machine because of transient Rollup binary locks

### Backend

Commands run:

- `python -m pip install -r requirements.txt`
- `python -m unittest discover -s tests -q`
- `python -m ruff check app tests scripts`
- `python -m black --check app tests scripts`

Results:

- dependency install: passed
- unit tests: passed
  - Tests: 171 passed
  - Duration: 21.855s
- Ruff: passes after targeted cleanup of unused imports, locals, and redundant test imports
- Black check: failed
  - 33 files would be reformatted
- `pip_audit -r requirements.txt`: passed
  - No known vulnerabilities found

Warnings:

- repeated SlowAPI deprecation warnings under Python 3.14 during full verbose test run
- backend formatting drift is broader than the targeted audit scope and will be documented if not fully normalized

## Current Overall Status

Passing now:

- Frontend lint
- Frontend formatting
- Frontend tests
- Frontend build
- Frontend production dependency audit
- Backend tests
- Backend Ruff
- Backend dependency install
- Backend runtime dependency audit

Needs cleanup before release-ready:

- Backend formatting status or documented exception
- Security audit
- Docs consistency refresh
- Final audit write-up
- Final commit and push

## Step 2 Security Audit Snapshot

Frontend:

- `npm audit --omit=dev`: 0 production vulnerabilities
- Runtime placeholder resets moved away from `innerHTML`
- Event banner/indicator rendering remains DOM-safe and tooltip-safe

Backend:

- Runtime dependencies from `requirements.txt` remain the main production surface
- CI tooling now pins `black>=26.3.1` to avoid the previously reported tooling CVE
- Secret-like doc example in `BACKEND_TEST_AUDIT.md` was scrubbed to a placeholder dev string
- `pip_audit -r requirements.txt`: no known vulnerabilities found
- Ruff: clean after targeted import and test cleanup

Residual items:

- Backend Black formatting drift remains repo-wide and non-blocking in CI

## Commit Log

Pending

## Follow-ups

Pending

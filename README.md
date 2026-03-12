# Frontend Mining Tycoon

Frontend dashboard for Mining Tycoon, built with Vite.

This app lets you:
- create and join games
- start/stop live SSE stream updates
- view player state, upgrades, and leaderboard in real time
- play Seasonal Oracle upgrades (API contract v2):
	- view 4 seasonal balances and per-token upgrade tracks
	- view oracle prices and fee/spread hints
	- choose upgrade target token and payment token
	- preview converted cross-token upgrade costs before submit

## Requirements

- Node.js (LTS recommended)
- npm
- Backend running on `http://127.0.0.1:8000` (default)

## Quick Start

1. Install dependencies:

```bash
npm ci
```

2. Start development server:

```bash
npm run dev
```

3. Open the URL shown by Vite (usually `http://127.0.0.1:5173`).

If port `5173` is already used, Vite automatically selects the next free port.

4. In the UI:
- keep Backend URL as `http://127.0.0.1:8000`
- click `+ New Game`
- click `Start Stream`

## Runbook

1. Start backend+worker from backend repo:

```powershell
Set-Location "..\Mining tycoon"
& .\scripts\dev_start.ps1
```

2. Verify backend status:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/status" -Method GET
```

3. Start frontend:

```powershell
Set-Location "..\frontend mining tycoon"
npm run dev
```

4. Validate frontend quality gates:

```powershell
npm run test -- --run
npm run build
```

## Scripts

- `npm run dev`: start local dev server
- `npm run build`: create production build in `dist/`
- `npm run preview`: preview production build locally
- `npm run lint`: run ESLint
- `npm run format:check`: run Prettier check
- `npm run test`: run Vitest tests once
- `npm run test:watch`: run Vitest in watch mode
- `npm run test:coverage`: run tests with coverage report

## Quality Checks

Run all important frontend checks manually:

```bash
npm run lint
npm run format:check
npm run test
npm run test:coverage
npm run build
```

## CI

GitHub Actions workflow is in:
- `.github/workflows/ci.yml`

Current CI pipeline runs:
- install (`npm ci`)
- lint
- format check
- unit tests
- coverage
- build
- dependency audit (warning-only)

## Project Structure

- `index.html`: app shell
- `src/main.js`: dashboard logic (streaming, rendering, actions)
- `src/style.css`: styles
- `src/counter.js`: sample utility module
- `src/counter.test.js`: sample Vitest test

## Notes

## Seasonal Oracle (Contract v2)

The frontend supports backend `api_contract_version=2`.

- Supported contract window: `1..2`
- If backend contract version is outside the supported window, upgrade actions are disabled and the UI shows an out-of-date warning.

Upgrade requests now send:

- `upgrade_type`
- `target_token`
- `pay_token`

Cost preview behavior:

- Uses target-token base cost from live state/metrics when available.
- Converts to payment token with:
	- `ceil(base_cost_target * (P_target / P_pay) * (1 + fee + spread))`
- If numeric base cost is unavailable, the UI falls back to displaying conversion ratio only.

Oracle prices and conversion parameters are read from the latest game-scoped snapshot (`/games/{id}/meta`) with existing ETag/304 caching behavior.

For full-stack local development with backend + frontend in one VS Code session, use the umbrella workspace file:
- `C:\Users\weudl\mining-tycoon-umbrella.code-workspace`

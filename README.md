# Frontend Mining Tycoon

Frontend dashboard for Mining Tycoon, built with Vite.

This app lets you:
- create and join games
- start/stop live SSE stream updates
- view player state, upgrades, and leaderboard in real time

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

4. In the UI:
- keep Backend URL as `http://127.0.0.1:8000`
- click `+ New Game`
- click `Start Stream`

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

For full-stack local development with backend + frontend in one VS Code session, use the umbrella workspace file:
- `C:\Users\weudl\mining-tycoon-umbrella.code-workspace`

# Frontend Mining Tycoon

Frontend dashboard for Mining Tycoon, built with Vite.

This app lets you:

- create and join games
- start/stop live SSE stream updates
- view player state, upgrades, and leaderboard in real time
- use an optional chat tool panel (WebSocket, non-persistent, no gameplay impact)
- play Seasonal Oracle upgrades (API contract v2):
  - view 4 seasonal balances and per-token upgrade tracks
  - view oracle prices and fee/spread hints
  - choose pay token inline per upgrade lane (target token is the season card)
  - submit display-only intent; backend remains authoritative for conversion/cost outcome

## Current Implementation Status (2026-03-30)

- Mining is the only gameplay pillar currently implemented and validated end-to-end (backend + frontend).
- **Trading now has an initial scaffold**: read-only panel and capability-driven status in the action bar plus the live tools drawer. Trade execution and fee calculation remain unimplemented.
- Farming gameplay implementation has not started yet; the dashboard exposes a drawer placeholder plus status visibility in the action bar.
- Gameplay-balance validation is still pending through playtests, especially for:
  - mined output pacing over time
  - upgrade impact compared to upgrade cost progression
  - halving trigger and post-halving behavior

## Current Delivery Status (2026-03-30)

This section is an operational handover snapshot for incoming developers.

- Completed recently:
  - Active game discovery flow is available for players.
  - Active game list filtering shows enrolling rounds and running asynchronous rounds only.
  - Active game list auto-refreshes every 5 seconds.
  - Setup/join panel auto-collapses after successful join.
  - `index.html` is now a dedicated auth/lobby start screen with login/register tabs, forgot-password dialog, and open-games selection.
  - Gameplay board moved to `player.html`; post-login flow is now explicit: select open game -> join -> enter live board.
  - Lobby applies the provided background image from `public/assets/backgrounds/Seasonal Enterteinment.png`.
  - Admin game management in `admin.html` now supports delete actions, round-type labels, active-only filtering, and status-based time remaining display.
  - Pre-merge quality checks now include `npm run clean:audit` (strict unused-code/dependency checks).
  - Async fallback flow now shows the same `Game Over` handling when a session ends from the client-side expiry path.
  - Start and auto-start flow hardening prevents unhandled start errors from breaking the UI flow.
  - Lobby join filtering now excludes async rounds where `session_duration_seconds >= run_remaining_seconds`.
  - Temporary `1m` duration preset is enabled for fast local/manual test cycles and must be removed before production rollout.
  - Stable rollback checkpoint tag is available: `checkpoint/2026-03-30-stable-01`.
- Approved and next (not yet implemented):
  - Phase 1: core backend auth and role support.
  - Phase 2: frontend auth/lobby/game screen split.
  - Phase 3: security hardening and audit polish.
- Open/missing right now:
  - Trading execution is still not implemented (status/visibility only).
  - Farming gameplay is still not implemented (status/visibility only).
  - Large-file refactors are tracked as advisory code-health follow-up work.
  - Seasonal artwork integration (spring/summer/autumn/winter images) is planned but not yet implemented.
- Explicitly deferred:
  - Forgot-password and email-reset flow (moved to later phase after core auth is stable).

If this section and PROJECT_BASELINE.md differ, treat PROJECT_BASELINE.md as the source of truth and update this section in the same workstream.

## Documentation Update Rule (Mandatory)

After every meaningful behavior change:

- Update PROJECT_BASELINE.md with current factual implementation status.
- Update this README delivery snapshot (completed, next, missing, deferred).
- Update relevant runbook/API/security docs when contract behavior changes.
- Include test-impact notes whenever behavior or interfaces change.

Goal: a new developer should be able to join and continue work without private context.

## New Chat Bootstrap Prompt (Reusable)

Use this prompt whenever you start a new chat and want immediate continuity:

```text
New session for Mining Tycoon.
Please load context from PROJECT_BASELINE.md and README.md in both frontend and backend repos.
Use checkpoint tag checkpoint/2026-03-30-stable-01 as the latest known stable rollback point.
Current objective: <replace with today's goal>.
Constraints: backend-authoritative behavior only, update docs with code changes, and run full frontend+backend gates before push.
```

## Project Baseline (Authoritative)

The current implemented state of the game is documented in [PROJECT_BASELINE.md](PROJECT_BASELINE.md).

- Treat it as a do-not-casually-break reference.
- Evaluate future changes against it before implementation.
- If you are new to the project, read [PROJECT_BASELINE.md](PROJECT_BASELINE.md) first.

## Project Invariants (Locked Decisions)

Non-negotiable project invariants are defined in [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

Key highlights:

- Backend-authoritative outcomes only; frontend is display/intent and must not become authoritative.
- Deterministic oracle/halving/events with snapshot-locked game settings.
- No P2P markets and no real-money mechanics.
- Desktop gameplay view keeps core information visible without page scrolling.
- No blocking overlays/modals/popups during active gameplay interactions; a post-game return overlay is allowed once a round finishes.
- Seasonal upgrades stay inline with three visible lanes: hashrate, efficiency, cooling.
- Analytics stays read-only and visible with per-token output, cumulative mined, balances, oracle prices, and fee/spread.
- Trading and farming remain visible as status plus on-demand tool panels.
- Chat remains social-only, accessible from anywhere via action bar/chat dock, and non-gameplay.
- Tests must remain green and new behavior must be covered; keep XSS-safe rendering patterns.

## Admin Setup (Round Creation)

Round configuration is **admin-only** and is managed separately from the player experience:

### Player UI (`player.html`)
- Players **cannot** configure rounds.
- Players join an existing round by Game ID or by selecting it from the inline Open Games panel.
- All tunable settings (scoring mode, trade count, duration, enrollment window) are snapshot-locked at creation.
- Admin controls are hidden via `.admin-only` CSS class.
- When a round finishes, a full-screen `Game Over` overlay appears; clicking anywhere dismisses it, clears the ended session context, and returns focus to the player-side Open Games panel.
- The player-side return panel is split into two halves: `Open Games` on top and `Last Game Highscores` below.

### Start/Lobby UI (`index.html`)
- Login and registration forms are rendered on the start screen.
- Forgot-password flow is exposed through a dedicated dialog.
- Open games are shown in a scrollable list with status badges and remaining-time labels.
- Joining is blocked unless authenticated.
- Logging in does not auto-enter a game; player must select a game first.

### Admin Setup UI (`admin.html`)
- Separate entrypoint for round operators.
- All 7 configuration sections (Round Type, Duration, Scoring, Trading, Advanced Overrides) auto-populate from control-data constants.
- Admin enters optional token if server enforces `REQUIRE_ADMIN_FOR_GAME_CREATE=true`.
- Inline error messages if permission is denied.
- Section 8 game management lists active rounds only (enrolling/running), shows sync/async labels, and supports game delete from UI.
- Time remaining in game management is status-aware:
  - enrolling -> enrollment window time left
  - running -> running duration time left

### How to Use

**For Players (index.html -> player.html)**
1. Navigate to `http://localhost:5173`
2. Sign in or register on the start screen
3. Select one open game from the list and click `Enter live board`
4. The app opens `player.html` and starts the live stream for the selected game
5. When the round ends, click the `Game Over` overlay to return to the player panel and choose the next open game

**For Admins (admin.html)**
1. Navigate to `http://localhost:5173/admin.html`
2. Select Round Type (Sync or Async)
3. Configure Duration, Scoring Mode, and Trading Rules
4. Review the summary and click "Create Round"
5. Share the Game ID with players

**Control Data & Defaults**
All tunables come from `src/config/`:
- `ROUND_DURATION_PRESETS` — available round durations
- `ENROLLMENT_WINDOW_LIMITS` / `ENROLLMENT_WINDOW_DEFAULT_SECONDS` — join window
- `SCORING_CONTROL` — allowed scoring modes
- `TRADE_COUNT_LIMITS` — trading constraints
- `computeTradeUnlockOffsetsSeconds()` — trade schedule calculation

Do **not** hardcode tuning values in the UI; always import from control-data.

### Permission Enforcement

When the backend is configured with:
- `REQUIRE_ADMIN_FOR_GAME_CREATE=true`
- `ADMIN_TOKEN=<secret>`

Game creation requires an `X-Admin-Token` header. The admin-setup UI prompts for the token. Player join routes are **never** gated.

See [MANUAL_TEST_RUNBOOK.md](MANUAL_TEST_RUNBOOK.md) for full end-to-end test flows.

When using Copilot, always instruct it to not violate LOCKED_DECISIONS.md.

## Documentation Map

Use these files as the current documentation set for the frontend repo:

- `DOCS_STATUS.md`: quick index of which docs are canonical current vs historical snapshots
- `README.md`: quick start, UI behavior, runbook, and current implementation scope
- `PROJECT_BASELINE.md`: canonical factual baseline of what is implemented right now
- `SEASONAL_TYCOON_CONCEPT.md`: high-level game vision and product intent
- `LOCKED_DECISIONS.md`: non-negotiable product and UX invariants
- `CONTRIBUTING.md`: contribution rules, commenting expectations, and quality gates
- `QUALITY_ENFORCEMENT.md`: mandatory local/CI enforcement policy and test-quality strategy
- `CODE_ORGANIZATION.md`: source-layout and module-responsibility guide
- `SECURITY.md`: current frontend security posture and safe-rendering expectations
- `AUDIT_MATRIX.md`: PR and nightly audit frequencies with blocking thresholds
- `DEPLOY.md`: frontend-only VPS deployment and full-stack deployment handoff notes

If a change affects backend contracts, update the sibling backend repo docs in the same workstream so both repos stay aligned.

## Requirements

- Node.js (LTS recommended)
- npm
- Backend running on `http://127.0.0.1:8000` (default)

## Visual Asset Drop Location

Place image files in:

- `public/assets/backgrounds/` for start/lobby backgrounds
- `public/assets/seasons/` for season-specific images
- `public/assets/ui/` for other UI artwork

See `public/assets/README.md` for naming recommendations.

## Quick Start

1. Install dependencies:

```bash
npm ci
```

2. Start development server (stable detached mode):

```powershell
& .\scripts\dev_frontend_start.ps1
```

Alternative interactive mode:

```bash
npm run dev
```

3. Open the URL shown by Vite (usually `http://127.0.0.1:5173`).

The stable script enforces `5173` using `--strictPort` and keeps PID/log tracking in:

- `data/frontend_dev_process.json`
- `data/frontend_dev_stdout.log`
- `data/frontend_dev_stderr.log`

Stop the stable detached server with:

```powershell
& .\scripts\dev_frontend_stop.ps1
```

4. In the UI:

- keep Backend URL as `http://127.0.0.1:8000`
- click `+ New Game`
- click `Start Game`

For async rounds, use the explicit session action:

- select `Round Type = Async (host)` in Setup
- set `Round Duration` (5m, 10m, 15m, 1h, 3h, 6h, 12h, 1d, 3d, 7d)
- set `Round Duration` (1m temporary test preset, 5m, 10m, 15m, 1h, 3h, 6h, 12h, 1d, 3d, 7d)
- set `Session Duration` (5m, 10m, 30m, 1h, 6h, 12h, 1d)
- keep `Auto-start async session after game creation and join` enabled if you want one-click create/join/session start
- click `+ New Game`
- if auto-start is disabled, click `Start Session (Async)`
- wait for inline status `Async session started.`
- the app switches to `/sessions/{session_id}/stream` automatically

Sync/Async model (backend-aligned):

- Sync rounds use `Round Duration` + `Enrollment Window` and stream via `/games/{id}/stream`.
- Async rounds send `enrollment_window_seconds=0` and include `session_duration_seconds` in create payload.
- Async rounds use session-scoped transport only (`/sessions/{session_id}/stream`) and never fallback to legacy stream.
- Async rounds allow repeated attempts one session at a time; backend computes authoritative best-of score.
- Every new async session attempt starts from the same backend baseline state (balances/tracks/upgrades/cumulative mined reset for that player), so attempts are comparable and only your per-session decisions can change results.
- In async mode, player analytics display `This session` and `Best this round` values from backend payload; these fields are hidden in sync mode.

## VPS Deployment

Frontend-only deploy to a VPS:

```powershell
& .\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/mining-game"
```

Preview without uploading:

```powershell
& .\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/mining-game" -DryRun
```

If you want frontend + backend on the same VPS, run the full-stack deploy from the sibling backend repo:

```powershell
Set-Location "..\Mining tycoon"
& .\deploy-full-stack.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -FrontendDomain "game.your-vps.com" -ApiDomain "api.your-vps.com"
```

Further deployment details live in [DEPLOY.md](DEPLOY.md).

## Audited Push Workflow

This repo now supports a tracked audited push workflow.

One-time local setup:

```powershell
& .\scripts\enable_git_hooks.ps1
```

Daily usage:

```powershell
& .\scripts\push_with_audit.ps1
```

If the exact same clean HEAD already passed the local gate, the helper and the
tracked pre-push hook now reuse that successful result and skip rerunning the
full gate. Use `& .\scripts\push_with_audit.ps1 -ForceAudit` to force a fresh rerun.

What happens before push:

- required frontend docs presence check
- `npm run clean:audit` (eslint + strict unused checks + dependency/file usage scan)
- `npm run format:check`
- `npm run test -- --run`
- `npm run test:coverage`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`
- advisory code-health audit (file-size hotspots, comment-header coverage, TODO/FIXME markers, debug-console scan)

The push helper also prints a concise summary of commits and changed files since the last push so the outgoing change set is easy to review.

Run the structural audit manually at any time:

```powershell
npm run audit:health
npm run clean:audit
```

## UI Layout

The dashboard uses an **inline 2-column layout** designed for desktop viewing without scrolling, with responsive adaptation for tablet and mobile.

### Desktop (1440x900 target)

- **Compact Game Header (top)**: One-line gameplay stats (countdown, phase, score, rank, top, connection) with an inline **Debug** disclosure panel.
- **Debug (inline toggle, collapsed by default)**: Shows contract/meta details and runtime diagnostics (meta hash, duration, emission/cycles metadata, backend URL, game/player IDs) without using overlays.
- **Setup Panel (collapsible)**: "Menu / Setup" toggle collapses setup during play; setup area has its own internal scroll and never blocks the live board.
- **Primary Setup Actions and round mode context**: The Setup panel always shows `+ New Game`, `Start Game`, and `Stop Stream`, plus a `Round: Sync/Async` badge. `Start Session` remains available as an explicit async control, but `Start Game` is the one-click path that handles join plus any required async session setup before connecting the live view.
- **Scoring mode selection (pre-round only)**: Setup includes `Scoring Mode (fixed for this round)` with four options (Stockpile default, Power, Mining Time Equivalent, Efficiency). Selection is locked after the round starts.
- **Explicit async session start flow**: In async mode with backend session support, `Start Game` is the primary one-click action and will start the required async session before connecting the live view. Policy-window denials are shown inline in setup (`Session cannot be started now (policy window closed).`) without modal interruptions.
- **Top summary async badge**: A small non-blocking status badge appears in the header summary line for async rounds (`Async: Ready` or `Async: Session Active`).
- **Best-of visibility (async mode only)**: When playing async/best-of rounds, the Player State panel displays `This session` and `Best this round` score values inline with exact-value tooltips. These fields are hidden in sync mode.
- **Session active badge**: After successful async start, the header summary line shows `Async: Session Active`.
- **Main Grid (2 columns)**:
  - **Left (~65%)**: 2×2 grid of seasonal cards (Spring, Summer, Autumn, Winter). Each card displays:
    - Season header with emoji icon
    - Balance (tokens held)
    - Output per second (mining rate)
    - Halving countdown or "No further halvings"
    - **Inline upgrades** (3 lanes: Hashrate, Efficiency, Cooling) rendered as a compact table with headers:
      - `Upgrade` | `Lvl` | `Cost` | `Pay` | `Out/s` | `BEP` | info icon
      - `Pay` is an inline per-lane select (cross-token spend choice)
      - no preview column; no `Act` header label
      - action remains server-authoritative submit intent (button text: Upgrade)
  - Season meta rows use full labels (**Balance, Output, Halving**) in a single compact line for clarity.
  - **Right (~35%)**: Player State Analytics panel (READ-ONLY):
    - **Compact stats matrix** optimized for rapid scanning:
      - Columns: Metric | SPR | SUM | AUT | WIN | Σ | ⓘ
      - Rows: Out/s, Bal, Price with numeric values right-aligned
      - **Compact number formatting**: Large values (≥1000) display as compact notation (1.23k, 1.23M, 1.23B) to prevent grid overflow and maintain scanability. Exact full values are available in tooltips on hover/focus/tap.
      - Numeric column uses monospace tabular fonts for visual alignment and prevents overflow with `min-width: 0; overflow: hidden; text-overflow: ellipsis`
      - Icon column on the right (one ⓘ per row) for optional precision tooltips showing exact values to 4 decimals
    - **Footer metrics** on deliberate two lines:
      - Line 1: Next halving | Mined
      - Line 2: Fee X / Y with anchored ⓘ tooltip
    - **Non-blocking micro-tooltips**: Hover, focus, or tap ⓘ icons to reveal precision values and explanations. Tooltips never block interaction or hide data.
    - Player analytics remains always visible while optional tools move to the on-demand drawer.
- **Bottom Action Bar**:
  - **Score** shows the live score-context metric for the selected outcome mode. In Power Mode this is the oracle-weighted score; in other modes, this display follows that mode's evaluation context. Large values use compact notation (k/M/B) for scanability, with exact values available via tooltip on hover/focus.
  - Trading and Farming status pills stay visible.
  - `Trade`, `Farm`, and `Chat` buttons open the non-core tools drawer.
  - Chat also exposes a persistent preview dock with unread badge so messages are always visible at a glance.
- **Live Tools Drawer (inline, non-blocking)**:
  - Hosts `Trade`, `Farm`, and `Chat` tabs so non-core tools are always reachable without crowding the main board.
  - Chat remains non-persistent and social-only.
- **In-game mode visibility**: Header summary shows the active scoring mode as read-only text (for example `Scoring: Stockpile Mode`).
- On desktop, the setup panel and season list use internal scrolling while the page itself does not scroll.
- Season upgrades use a compact row-based layout to minimize vertical height and reduce scrolling.
- Player analytics panel width is fixed through a CSS variable, while the left seasons column uses `min-width: 0` to prevent horizontal overflow.
- On mobile, a season-focus strip keeps one full season card visible at a time to reduce vertical scrolling while preserving quick switching between all four seasons.

### Key Principles

- **No overlays/modals during live play**: Upgrade controls and gameplay information remain inline; only the end-of-round return overlay interrupts input after a game has already finished.
- **Core data stays inline; non-blocking micro-tooltips are allowed**: Tooltips are positioned in a fixed layer above all content (never clipped), provide optional explanation and precision (4-decimal accuracy), and never block interaction or hide required information.
- **One shared micro-tooltip contract across player and season headers**: all header triggers use `.ps-tip-trigger` and bubbles use `.ps-tip-bubble` in `#tooltip-layer`; close behavior is hover/leave + keyboard Escape (no timeout auto-hide).
- **Setup never blocks gameplay**: Setup is collapsible and bounded by max height with internal scroll only.
- **Player State uses a fixed-column matrix for fast scan**: Labels left-aligned, numeric values right-aligned in monospace fonts. Tooltip icons (ⓘ) are placed at the end of each row to avoid disrupting the visual flow of data. All matrix values fully visible without scrolling.
- **Halving countdown updates smoothly and remains copyable**: Season-card halving timers tick client-side every second between SSE sync points, and countdown text is selectable/copyable.
- **Stable DOM updates under SSE**: rendering paths update text/attributes incrementally (no untrusted `innerHTML` rebuilds), preserving cursor/selection anchors and per-lane pay-select persistence during live updates.
- **Chat is always reachable and glanceable**: action-bar chat button plus persistent preview dock with unread badge; full chat opens in the tools drawer.
- **Mining/Trading/Farming visibility**: Mining remains on the main board; Trading/Farming are exposed as visible status plus on-demand drawer tabs, even when disabled.
- **Responsive**:
  - **Tablet (768px–1200px)**: Main grid stacks to single column; seasons may arrange 1×4 or 2×2 depending on available space. Scrolling is minimal.
  - **Mobile (<768px)**: Stacked single-column layout. Season cards show one at a time using a tabbed interface. Analytics panel collapses into an accordion for compact viewing.

### Runbook

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

## Mining Validation Playtest Checklist

Use this checklist to validate mining-only gameplay before Trading and Farming UI implementation starts.

### Session Setup

1. Start backend and worker, then confirm backend status endpoint is healthy.
2. Start frontend and create a new round in Sync mode.
3. Join as one player and start the game.
4. Record initial values in a notes table:

- Time
- SPR/SUM/AUT/WIN balances
- Out/s by token
- Total Out/s
- Score (with active outcome mode noted)

### Output Pace Validation

5. Wait 60 seconds with no upgrades and record the same values again.
6. Confirm each token balance increased consistently with its shown Out/s trend.
7. Repeat one more 60-second interval and confirm growth remains monotonic (no unexpected drops/reset).

### Upgrade Value and Cost Validation

8. Buy one Hashrate upgrade on a single season card; record old/new:

- level
- Out/s
- upgrade cost shown
- post-upgrade balance delta

9. Repeat for Efficiency and Cooling on the same token.
10. Confirm each upgrade increases expected production signal and that displayed costs progress upward by level.
11. Perform one cross-token pay selection in Upgrade Pay and confirm backend-authoritative outcome is reflected correctly in balances/cost.

### Halving Validation

12. Run a round configuration where halving should occur during your session.
13. Capture values immediately before and after halving trigger:

- halving countdown display
- token Out/s
- cumulative mined trend

14. Confirm halving trigger timing is consistent with countdown and post-halving output behavior matches expected reduction logic.

### Pass Criteria

15. Mark the session PASS only if all checks hold:

- no non-monotonic mining anomalies under stable conditions
- upgrade gains and cost progression remain coherent
- halving timing and effect behavior are correct
- no frontend/backend desync in displayed authoritative values

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

Recommended one-liner:

```bash
npm run check:all
```

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
- `src/main.js`: thin orchestration entrypoint that wires modules together
- `src/services/stream-controller.js`: SSE lifecycle, reconnect handling, and timer cleanup
- `src/services/game-actions.js`: create/join flow and upgrade submission actions
- `src/services/session-actions.js`: explicit async session start flow and auth-aware ticket retrieval
- `src/ui/setup-shell.js`: setup panel state, action enablement, and header navigation
- `src/ui/live-summary.js`: quick stats and portfolio-value rendering
- `src/ui/leaderboard.js`: top-5 leaderboard rendering
- `src/ui/season-cards.js`: per-season balances, output, and halving tickers
- `src/ui/event-display.js`: active-event banner and affected-value indicators
- `src/style.css`: styles
- `src/counter.js`: sample utility module
- `src/counter.test.js`: sample Vitest test

## Notes

## Async Session Flow (Frontend)

Setup panel placement (desktop):

```text
Primary Actions
[ + New Game ] [ Start Game ] [ Start Session (Async) ] [ Stop Stream ]
                 (enabled after async session exists)
```

### Create Async Round From UI (Host Setup)

Use this host-like flow directly in Setup (no overlays):

```text
Round Type: [Sync] [Async (host)]
Sync controls: Enrollment Window (seconds) + Round Duration preset/custom
Async controls: Round Duration (5m/10m/15m/1h/3h/6h/12h/1d/3d/7d) + Session Duration (5m/10m/30m/1h/6h/12h/1d)
[x] Auto-start async session after game creation and join
```

When `+ New Game` is clicked with `Async (host)` selected:

1. `POST /games` with `round_type="asynchronous"`, `enrollment_window_seconds=0`, `duration_mode="preset"`, selected `duration_preset`, and explicit `session_duration_seconds`.
2. `POST /games/{id}/join` with player name.
3. If auto-start is enabled, `POST /games/{id}/sessions` and switch to session-scoped SSE.

Short request example:

```json
{
  "round_type": "asynchronous",
  "enrollment_window_seconds": 0,
  "duration_mode": "preset",
  "duration_preset": "3d",
  "session_duration_seconds": 86400
}
```

Inline diagnostics chips in Setup (`Async`, `Window`, `Joined`, `SessionAPI`, `NoSession`, `Auth`) show which predicate is blocking readiness.

Frontend call chain for async rounds:

1. `POST /games`
2. `POST /games/{id}/join`
3. `POST /games/{id}/sessions` with `mode: "async"`
4. `GET /sessions/{session_id}/stream?player_id=...`

Auth-aware behavior:

- if player auth is required, frontend sends `X-Player-Token` for session start and ticket calls
- session stream URL includes `ticket` query only for auth-required backends

## Chat (Minimal, Optional, Non-persistent)

Chat is implemented as a side feature only:

- Non-persistent (no history replay)
- Server-authoritative fields (`user`, `ts`)
- Rate-limited server-side
- No gameplay coupling (Mining/Oracle/Halving/Events unaffected)

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

- your shared umbrella workspace file, if you keep one for opening frontend + backend together

## Events (Active Event Visibility & Effect Indicators)

When a deterministic event is active, the frontend shows it inline without changing gameplay layout.

### Event Banner

- A compact single-line banner renders above the 2×2 season grid.
- Format: `⚡ Event: Heatwave (−20% Cooling Efficiency) — 00:45 remaining`
- The banner is hidden automatically when no event is active.
- Styling uses warning/neutral emphasis rather than alarm-red.

### Effect Indicators

- A subtle inline `⚡` indicator is added next to values affected by the active event.
- Indicators are purely visual annotations; they do not recalculate or alter displayed values.
- Annotated values depend on event domain:
- `output`: season output values and analytics output row.
- `upgrade_cost`: inline upgrade cost cells for affected upgrade tracks.
- `oracle_price`: analytics oracle price row.
- `oracle_spread`: player state footer fee/spread segment.

### Event Tooltip

- Each event indicator and the banner use non-blocking micro-tooltip text.
- Tooltip content includes event name, effect description, affected domains, and remaining duration.
- Tooltips render in the shared tooltip layer to avoid clipping.

### Data Contract

- The frontend reads event state from SSE payload field `active_event`.
- Expected structure:

```json
{
  "active_event": {
    "name": "Heatwave",
    "effect_description": "−20% Cooling Efficiency",
    "domains": ["cooling"],
    "end_unix": 1234567890
  }
}
```

- If `active_event` is missing or null, no banner or indicators are rendered.

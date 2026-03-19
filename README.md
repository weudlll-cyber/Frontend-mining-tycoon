# Frontend Mining Tycoon

Frontend dashboard for Mining Tycoon, built with Vite.

This app lets you:
- create and join games
- start/stop live SSE stream updates
- view player state, upgrades, and leaderboard in real time
- use an optional chat side-panel (WebSocket, non-persistent, no gameplay impact)
- play Seasonal Oracle upgrades (API contract v2):
	- view 4 seasonal balances and per-token upgrade tracks
	- view oracle prices and fee/spread hints
	- choose upgrade target token and payment token
	- preview converted cross-token upgrade costs before submit

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
- No overlays/modals/popups for core gameplay interactions.
- Seasonal upgrades stay inline with three visible lanes: hashrate, efficiency, cooling.
- Analytics stays read-only and visible with per-token output + total, cumulative mined, balances, oracle prices, and fee/spread.
- Trading and farming remain visible as sections even when disabled.
- Chat remains social-only, docked inline (not overlay), and non-gameplay.
- Tests must remain green and new behavior must be covered; keep XSS-safe rendering patterns.

When using Copilot, always instruct it to not violate LOCKED_DECISIONS.md.

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

For async rounds, use the explicit session action:
- select `Round Type = Async (host)` in Setup
- set `Enrollment Window (seconds)` and `Session Duration`
- keep `Auto-start async session after game creation and join` enabled if you want one-click create/join/session start
- click `+ New Game`
- if auto-start is disabled, click `Start Session (Async)`
- wait for inline status `Async session started.`
- the app switches to `/sessions/{session_id}/stream` automatically

## UI Layout

The dashboard uses an **inline 2-column layout** designed for desktop viewing without scrolling, with responsive adaptation for tablet and mobile.

### Desktop (1440x900 target)
- **Compact Game Header (top)**: One-line gameplay stats (countdown, phase, score, rank, top, connection) with an inline **Debug** disclosure panel.
- **Debug (inline toggle, collapsed by default)**: Shows contract/meta details and runtime diagnostics (meta hash, duration, emission/cycles metadata, backend URL, game/player IDs) without using overlays.
- **Setup Panel (collapsible)**: "Menu / Setup" toggle collapses setup during play; setup area has its own internal scroll and never blocks the live board.
- **Primary Setup Actions and round mode context**: The Setup panel always shows `+ New Game`, `Start Stream`, and `Stop Stream`, plus a `Round: Sync/Async` badge. `Start Session` appears only for async rounds during pre-play window states and is disabled with inline text `Async sessions not supported by backend (using legacy live view).` when session endpoints are unavailable.
- **Explicit async session start flow**: In async mode with backend session support, `Start Stream` is intentionally gated until `Start Async Session` succeeds. Policy-window denials are shown inline in setup (`Session cannot be started now (policy window closed).`) without modal interruptions.
- **Top summary async badge**: A small non-blocking status badge appears in the header summary line for async rounds (`Async: Session Ready` or `Async: Legacy View`).
- **Session active badge**: After successful async start, the header summary line shows `Async: Session Active`.
- **Main Grid (2 columns)**:
  - **Left (~65%)**: 2×2 grid of seasonal cards (Spring, Summer, Autumn, Winter). Each card displays:
    - Season header with emoji icon
    - Balance (tokens held)
    - Output per second (mining rate)
    - Halving countdown or "No further halvings"
    - **Inline upgrades** (3 columns: Hashrate, Efficiency, Cooling) showing:
      - Current level (Lv N)
      - Cost (in that season's token)
      - Output increase (+X.XX /s)
      - Breakeven time (BE XX.Xs)
      - Upgrade button
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
    - **Docked chat panel directly below analytics** (toggleable, inline, non-overlay)
- **Bottom Bar**: 
  - **Portfolio Value** shows the live oracle-weighted portfolio total used for scoring. Large values use compact notation (k/M/B) for scanability, with the exact full value available via tooltip on hover/focus. Updates live as balances and oracle prices change.
  - Trading status, Farming status, and the Chat toggle button complete the bar.
- On desktop, the setup panel and season list use internal scrolling while the page itself does not scroll.
- Season upgrades use a compact row-based layout to minimize vertical height and reduce scrolling.

### Key Principles
- **No overlays/modals**: All important information remains visible on one screen. Upgrade controls are inline within season cards, not in separate popups.
- **Core data stays inline; non-blocking micro-tooltips are allowed**: Tooltips are positioned in a fixed layer above all content (never clipped), provide optional explanation and precision (4-decimal accuracy), and never block interaction or hide required information.
- **Setup never blocks gameplay**: Setup is collapsible and bounded by max height with internal scroll only.
- **Player State uses a fixed-column matrix for fast scan**: Labels left-aligned, numeric values right-aligned in monospace fonts. Tooltip icons (ⓘ) are placed at the end of each row to avoid disrupting the visual flow of data. All matrix values fully visible without scrolling.
- **Halving countdown updates smoothly and remains copyable**: Season-card halving timers tick client-side every second between SSE sync points, and countdown text is selectable/copyable.
- **Chat is docked inline (no overlays); internal scroll only.** Messages scroll inside the chat panel, and collapsing chat reclaims right-column space for analytics.
- **Mining/Trading/Farming visibility**: All three economic pillars are displayed as sections, even if disabled, allowing players to see what is "not enabled" or "available later".
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
[ + New Game ] [ Start Stream ] [ Start Session (Async) ] [ Stop Stream ]
                 (enabled after async session exists)
```

### Create Async Round From UI (Host Setup)

Use this host-like flow directly in Setup (no overlays):

```text
Round Type: [Sync] [Async (host)]
Async controls: Enrollment Window (seconds) | Session Duration (5m/10m/15m/custom)
[x] Auto-start async session after game creation and join
```

When `+ New Game` is clicked with `Async (host)` selected:

1. `POST /games` with `round_type="asynchronous"`, enrollment window, and duration preset.
2. `POST /games/{id}/join` with player name.
3. If auto-start is enabled, `POST /games/{id}/sessions` and switch to session-scoped SSE.

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
- `C:\Users\weudl\mining-tycoon-umbrella.code-workspace`

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

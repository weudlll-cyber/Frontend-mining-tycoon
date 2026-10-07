# Frontend Mining Tycoon

Browser frontend for Mining Tycoon (Seasonal Tycoon), built with Vite. The
backend lives in the sibling repo `Mining-tycoon` and is authoritative for all
gameplay outcomes; this frontend only displays state and sends player intent.

Four pages:

- **Lobby** (`index.html`): register, log in/out, pick an open game, join or rejoin it, see your result history, full final leaderboards and the last game's highscores.
- **Player board** (`player.html`): the live game. Four season cards with inline upgrades, read-only analytics, halving countdowns, event banner, and a floating live tools window with Trade, Farm, Chat and Top 5.
- **Admin console** (`admin.html`): create rounds with snapshot-locked settings, list and delete active games.
- **How to play** (`how-to-play.html`): static player guide (rules, upgrades, halvings, trading, round types, scoring modes, events). Linked from the lobby and from the player-board header (opens in a new tab).

## Status

The current implementation state, recent changes and open work are tracked in
[PROJECT_BASELINE.md](PROJECT_BASELINE.md) (section 10). In short: mining,
upgrades, halvings, events, trading, sync and async rounds, best-of scoring,
chat, accounts (linked to players, with result history) and the admin console
work end to end. Farming and production hardening are open.

## Documentation

[DOCS_STATUS.md](DOCS_STATUS.md) is the full documentation index. The most
important docs:

- [PROJECT_BASELINE.md](PROJECT_BASELINE.md): what is implemented right now (source of truth if docs disagree).
- [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md): non-negotiable invariants. Do not violate them; changes need a REDESIGN DECISION first.
- [CONTRIBUTING.md](CONTRIBUTING.md) and [QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md): process, gates and CI checks.
- [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md): module map.
- [SECURITY.md](SECURITY.md), [DEPLOY.md](DEPLOY.md), [MANUAL_TEST_RUNBOOK.md](MANUAL_TEST_RUNBOOK.md).
- Product intent: [SEASONAL_TYCOON_CONCEPT.md](SEASONAL_TYCOON_CONCEPT.md), [SCORING_MODES.md](SCORING_MODES.md), [PRODUCT_INFRASTRUCTURE.md](PRODUCT_INFRASTRUCTURE.md).

After every meaningful behavior change, update `PROJECT_BASELINE.md` and the
affected docs in the same change. If a change affects backend contracts, update
the sibling backend repo docs in the same workstream.

## Requirements

- Node.js 24 (the version CI uses) and npm
- The backend running locally on `http://127.0.0.1:8000` (default)

## Quick Start

1. Start the backend (sibling repo):

   ```powershell
   Set-Location "..\Mining tycoon"
   & .\scripts\dev_start.ps1
   Invoke-RestMethod -Uri "http://127.0.0.1:8000/status" -Method GET
   ```

2. Install and start the frontend:

   ```powershell
   Set-Location "..\frontend mining tycoon"
   npm ci
   & .\scripts\dev_frontend_start.ps1   # detached, fixed port 5173
   # or interactively: npm run dev
   ```

   The detached script enforces port 5173 (`--strictPort`) and tracks the
   process in `data/frontend_dev_process.json` (logs in
   `data/frontend_dev_stdout.log` and `data/frontend_dev_stderr.log`). Stop it
   with `& .\scripts\dev_frontend_stop.ps1`.

3. Create a round: open `http://127.0.0.1:5173/admin.html`, choose Sync or
   Async, durations, scoring mode and trades, then click **Create Round**. If
   the backend enforces admin auth (`REQUIRE_ADMIN_FOR_GAME_CREATE=true`),
   enter the admin token in section 1.

4. Play: open `http://127.0.0.1:5173/`, create an account or sign in, select
   the game in **Open Games** and click **Enter game**. The player board opens
   and connects automatically; async rounds start your session automatically.

5. When the round (or your async session) ends, click the **Game Over**
   overlay to return to the lobby.

Detailed manual checks: [MANUAL_TEST_RUNBOOK.md](MANUAL_TEST_RUNBOOK.md).

## Backend URL

The default backend URL is defined once in `src/config/backend-url.js` and read
at build time from `VITE_API_BASE_URL` (copy `.env.example` to `.env.local` and
set it, or set it before `npm run build`). When it is unset or not an http(s)
URL, the fallback is `http://127.0.0.1:8000`. The lobby, player board and admin
console all use this default; the Backend URL fields on `player.html` and
`admin.html` can override it, and the override is stored in localStorage.

## Pages

### Lobby (`index.html`, `src/lobby.js`)

- Sign in, **Create account** (username, display name, email, Discord handle, optional Telegram handle, password with at least 12 characters incl. upper/lower case, digit and special character) and **Logout**.
- A stored login is re-validated with `GET /auth/me` on load; an invalid token signs you out.
- **Change password** (signed in only) opens a dialog for current/new password. The backend ends all sessions after a change, so the lobby signs you out and asks you to sign in again.
- **Download my data** (signed in only) fetches `GET /auth/me/export` with your token and saves it as `mining-tycoon-account-export.json`.
- **Delete account** (signed in only) opens a dialog that explains what is deleted (account, sessions, login history; your in-game names in past results become "Deleted player"; cannot be undone) and asks for your password plus a confirmation checkbox. It calls `DELETE /auth/me`; on success the lobby clears the local session like a logout and shows "Your account has been deleted.". A wrong password (`403 PASSWORD_INCORRECT`), rate limiting (`429`) or a backend without the endpoint show the backend message in the dialog; an expired session (`401`) signs you out.
- **Forgot password?** opens a dialog. Password reset is disabled by default in the backend; the dialog then shows "Password reset is not available. Please contact an administrator." (or the server message).
- **Open Games** lists enrolling games and running async games (only while the session still fits into the remaining round time). Signed in, the list is requested with your account token: games where your account already has a player are marked "You joined" and are always listed (also running sync rounds and async rounds a new session would not fit). The list refreshes every 10 seconds and when the tab becomes visible.
- **Enter game** (requires sign-in and a selected game) joins with your account token, stores the game ID, player ID and `player_token`, and opens `player.html?autostart=1`. For a game you already joined the button reads **Rejoin**: the backend links players to accounts and returns your existing player (same player ID and token), so you continue instead of creating a second leaderboard row. A stale account token (`ACCOUNT_AUTH_INVALID`) signs you out; a round that requires sign-in (`ACCOUNT_REQUIRED`) shows the backend message.
- **My results** (signed in only) opens a dialog with your finished rounds, newest first: date, round type, scoring mode, rank / participants, score and the name you played under, 20 per page with **Load more**, or "No finished rounds yet.". **Full results** shows the round's complete final leaderboard with your row highlighted. `index.html?results=<gameId>&player=<playerId>` (linked from the player board's Game Over overlay) opens that view directly, also signed out.
- **Last Game Highscores** shows the Top 5 of your last finished round. Signed in, it uses the server (your newest history entry and its full results); signed out, or when the backend has no history endpoint, it shows the snapshot stored in this browser.
- A **How to play** link opens the player guide (`how-to-play.html`) in the same tab; an **Admin setup** link leads to `admin.html`.

### Player board (`player.html`, `src/main.js`)

- **Header:** countdown, phase, score, rank, top score, scoring mode, connection status, async session badge; an inline **Debug** disclosure shows meta and IDs; a **How to play** link opens the guide in a new tab so the running game stays open.
- **Join Round panel:** Backend URL, player name, game ID, player ID, `Start Game`, `Start Session (Async)` (async rounds), `Stop Stream`. It collapses once the stream runs. Players cannot create games here; the legacy host controls in the HTML are always hidden (`.admin-only`).
- **Season cards (2x2):** Balance, Output and Halving per season, plus three inline upgrade lanes (Hashrate, Efficiency, Cooling) as a table `Upgrade | Lvl | Cost | Pay | Out/s | BEP`. `Pay` chooses the token you pay with; the backend decides the final cost.
- **Player State (right):** read-only matrix of output, balances and oracle prices per token and in total, plus next halving, cumulative mined and fee/spread. Large numbers use k/M/B; tooltips show exact values.
- **Event banner:** one line above the season grid listing all active events; ⚡ marks affected values.
- **Action bar:** score context, Trading and Farming status (always visible), buttons `Trade`, `Farm`, `Chat`, `🏆 Top 5`, and a chat preview dock with unread badge.
- **Live tools window:** a floating, non-modal window with the tabs Trade, Farm (placeholder), Chat and Top 5. Drag it by its header, resize it, close it with the close button, Escape or a click outside. The rest of the board stays usable.
- **Game Over:** after the round finishes (or the async session ends) a full-screen overlay appears; a click returns to the lobby. A **View full results** link opens the lobby's full results view for that round instead; after an async session it notes "Final results are available when the round ends." This is the only full-screen overlay (see `LOCKED_DECISIONS.md` §C).

Layout rules: desktop (1440x900) has no page scroll, only internal scroll areas;
tablets stack the grid; phones show one season card at a time. See
`LOCKED_DECISIONS.md` for the binding UI invariants.

### How to play (`how-to-play.html`, `src/how-to-play.css`)

A static guide without script: quick start, goal and tokens, mining, upgrades,
halvings, oracle prices, trading, sync/async rounds, scoring modes, events, the
live tools window, accounts and farming (coming later), with a table of
contents and section anchors (for example `/how-to-play.html#scoring`). It
describes the current backend rules; update it in the same change when a game
rule changes. `src/how-to-play.test.js` guards the anchors and both links.

### Admin console (`admin.html`, `src/admin/`)

Eleven sections: 1 Connection (backend URL, optional admin token),
2 Round Type (Sync / Async, "Chat enabled"), 3 Time Configuration,
4 Scoring Mode, 5 Trading Rules (count, unlock preview and optional conversion
fee / oracle spread overrides), 6 Advanced Overrides (anchor token,
anchor tokens/sec, season cycles), 7 Review & Create, 8 Game Management
(active games with sync/async label, status-aware time remaining, player count;
per-row Metrics, Reset (clones the game) and Delete), 9 Global Economy
(`GET`/`PATCH /admin/economy`; changes apply to newly created games only),
10 Metrics (`GET /admin/metrics` summary), 11 Game Settings
(`GET`/`PATCH /admin/game-config`: duration presets, which presets are offered
for sync rounds / async rounds / async sessions, create-form defaults,
duration / enrollment / trade-count limits, default trade count by round
length, trade unlock fractions, "Chat enabled by default"
(`defaults.chat_enabled`, fallback on, sent only when changed) and the account
policy "Require sign-in to join" (`account_policy.require_account_to_join`,
fallback off, sent only when changed); round-setup values apply to newly
created rounds only, existing rounds keep their settings).

Round options (per round, snapshot-locked at creation, backend validates):

- **Conversion fee override (%)** and **Oracle spread override (%)** in
  section 5. Empty = the global economy value (shown as placeholder, from
  section 9 once loaded, otherwise from `GET /meta`). Entered in percent and
  sent as rates (`conversion_fee_rate`, `oracle_spread`; 2 % = 0.02). The
  client only rejects non-numbers and values outside 0 % to below 100 %.
- **Chat enabled** in section 2, pre-ticked from `defaults.chat_enabled`
  (fallback on). `chat_enabled` is sent only when the admin changes it.
- Section 7 lists the effective choice for all three. Omitted fields leave the
  backend defaults in place, so an older backend behaves as before.

Presets and defaults come from the backend: `GET /meta` carries the current
game config as `game_config`, and `src/config/game-config.js`
(`getEffectiveGameConfig()`) resolves it. The admin page fetches `/meta` on
load (and when the backend URL changes) and re-renders sections 2-5 after a
Game Settings save. Only when the backend sends no `game_config` (older
backend) the built-in fallback from `src/config/game-control-data.js` and
`src/config/trading-control-data.js` is used; section 2 shows which source is
active. Built-in fallback values:

- Sync round: all presets from `1m` (short test preset) to `7d`, including `3h`, plus custom; default `5m`; enrollment window default 10 s.
- Async round: 1m, 5m, 10m, 15m, 30m, 1h, 3h, 6h, 12h, 1d, 3d, 7d (default 30m).
- Async session: 1m, 5m, 10m, 30m, 1h, 6h, 12h, 1d (default 5m); it must be shorter than the round.
- Trades: 0-10. The default count depends on the round length (session length for async rounds); unlocks start at 20 % of the duration and spread evenly over the rest (30 minutes with 3 trades: 6, 14 and 22 minutes).

Never hard-code tunables in UI code; read them through `src/config/`.
Production defaults and test presets are set by admins in Game Settings
([PRODUCTION_DEFAULTS_CHECKLIST.md](PRODUCTION_DEFAULTS_CHECKLIST.md)).

Permission enforcement is done by the backend: with
`REQUIRE_ADMIN_FOR_GAME_CREATE=true` and `ADMIN_TOKEN` set, game creation and
the `/admin/*` routes require the `X-Admin-Token` header. Joining never needs
the admin token.

## Sync and Async Rounds

- **Sync:** players join during the enrollment window; the round then runs for the selected duration. Stream: `/games/{id}/stream`.
- **Async:** the round runs immediately (`enrollment_window_seconds=0`). Each player plays fixed-length sessions inside the round window; every session starts from the same baseline, and the backend keeps the best score. Stream: `/sessions/{session_id}/stream` only.
- Async call chain: `POST /games/{id}/join` (lobby) -> `POST /games/{id}/sessions` (automatic on entering the board) -> `GET /sessions/{session_id}/stream?player_id=...&ticket=...`.
- In async rounds the Player State panel shows `This session` and `Best this round`, and trade unlock times count from the session start.
- Upgrades and trades are only accepted while the round runs (sync) or your session is active (async). The board disables the upgrade buttons and "Execute Trade" with a short reason outside that window; if a request still reaches the backend, its `409` `detail` is shown as a toast.

Auth and streaming:

- With `REQUIRE_PLAYER_AUTH` on, the frontend sends `X-Player-Token` for upgrades, trades, session start and ticket requests (the lobby stores the token under `mining-tycoon:playerToken:{game}:{player}`).
- Before every stream connect and reconnect the frontend fetches a fresh ticket (`GET /games/{id}/sse-ticket`) and appends it as `ticket=`; it reconnects itself with backoff (1 s to 15 s, up to 20 attempts).

Scores are integers, except in Efficiency mode where they are shown as a ratio
like `1.2345×` (`src/utils/score-format.js`). Mode definitions and formulas:
[SCORING_MODES.md](SCORING_MODES.md).

## Seasonal Oracle (Contract v2)

- Supported backend `api_contract_version` window: `1..2`; outside it, upgrades are disabled and the UI shows an out-of-date warning.
- Upgrade requests send `upgrade_type`, `target_token` and `pay_token`.
- Cost preview: `ceil(base_cost_target * (P_target / P_pay) * (1 + fee + spread))`; without a numeric base cost the UI shows the conversion ratio only.
- Oracle prices and conversion parameters come from `/games/{id}/meta` (ETag/304 cached).

## Events

The frontend reads the backend list `active_events` from SSE and `/state`
(several events can be active at once):

```json
{
  "current_sim_month": 5,
  "active_events": [
    {
      "event_id": "…",
      "event_type": "DEMAND_SURGE",
      "domain": "oracle_price",
      "token": "summer",
      "magnitude": 1.25,
      "label": "Demand Surge",
      "start_sim_month": 4,
      "end_sim_month": 7
    }
  ]
}
```

- `token: null` means all tokens; token-scoped events only mark that token's cells.
- Domains and marked values: `output` (season output, analytics output row), `upgrade_cost` (upgrade cost cells), `oracle_price` (analytics price row), `oracle_spread` (fee/spread footer).
- Remaining time = `(end_sim_month - current_sim_month) / sim_months_per_real_second` (from game meta); without a rate the banner shows remaining sim-months.
- Indicators are visual only; they never recalculate values. The legacy single `active_event` object is still accepted.

## Chat

Chat is a non-persistent WebSocket side channel (`/ws/chat`) with
server-assigned user and timestamp and server-side rate limits. It has no
effect on gameplay.

Chat can be disabled per round (admin "Chat enabled" round option). When the
game meta says `chat_enabled: false`, the Chat tab stays in the live tools
window but shows "Chat is disabled for this round.", the preview dock shows the
same text and no WebSocket is opened. A server `chat_error` with code
`CHAT_DISABLED` is handled the same way, without reconnect attempts. A game
meta without `chat_enabled` (older backend) keeps chat on.

The trading panel's cost note shows the round's effective fee and, when the
game meta carries it, the oracle spread (`conversion_fee_rate`,
`oracle_spread` from `/games/{id}/meta`). A 0 % fee override is shown as 0 %.

## Visual Assets

- `public/assets/backgrounds/`: lobby backgrounds (the lobby uses `Seasonal Enterteinment.png`)
- `public/assets/seasons/`: season images (present, not used yet)
- `public/assets/ui/`: other UI artwork

See `public/assets/README.md` for naming recommendations.

## Deployment

Frontend-only deploy to a VPS (builds with `VITE_API_BASE_URL` and uploads only
`dist/`):

```powershell
& .\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -FrontendDomain "game.your-vps.com" -ApiBaseUrl "https://api.your-vps.com" -LetsEncryptEmail "ops@your-vps.com"
```

Add `-DryRun` to build and pack without uploading. For frontend and backend on
the same VPS, run `deploy-full-stack.ps1` from the backend repo. Details:
[DEPLOY.md](DEPLOY.md).

## Scripts

npm scripts (`package.json`):

| Script | Purpose |
|---|---|
| `npm run dev` / `dev:fixed` | Vite dev server (both identical) |
| `npm run build` | production build into `dist/` (all four pages) |
| `npm run preview` | serve the production build locally |
| `npm run lint` | ESLint on `src/` |
| `npm run clean:audit` | ESLint with zero warnings + knip (unused files/deps/unresolved imports) |
| `npm run format` / `format:fix` | Prettier write (JS/CSS in `src/` and the four HTML files) |
| `npm run format:check` | Prettier check (same files) |
| `npm run test` | all Vitest tests once (jsdom) |
| `npm run test:fast` | `test:services` + `test:ui` |
| `npm run test:services` | tests in `src/services`, `src/meta`, `src/utils` |
| `npm run test:ui` | UI module, layout and tooltip tests |
| `npm run test:flows` | player-board flow tests (`src/main.*`, layout controls, async session, security rendering) |
| `npm run test:contract` | contract suite used in CI |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | tests with coverage and thresholds |
| `npm run check:changed-lines-coverage` | coverage of added lines (needs `BASE_SHA`) |
| `npm run check:all` | clean:audit + format:check + test + build + `npm audit --audit-level=high` |
| `npm run mutation` / `mutation:check` | Stryker mutation run / dry run |
| `npm run audit:health` | advisory code-health report |

PowerShell scripts (`scripts/`):

| Script | Purpose |
|---|---|
| `dev_frontend_start.ps1` / `dev_frontend_stop.ps1` | start/stop the detached dev server on port 5173 |
| `enable_git_hooks.ps1` | activate the tracked pre-push hook (`.githooks/`) |
| `pre_push_gate.ps1` | local quality gate (`-Profile fast` or `full`) |
| `push_with_audit.ps1` | summarize outgoing changes, run the gate, push |
| `code_health_audit.ps1` | advisory code-health audit |
| `deploy-to-vps.ps1` | build and deploy `dist/` to a VPS |
| `apply-branch-protection.ps1` | create/update the "Protect main" ruleset (needs `GITHUB_TOKEN`) |
| `tag-stable-snapshot.ps1` | create a stable rollback tag |

Node helpers: `scripts/check_changed_lines_coverage.mjs`,
`scripts/check_license_policy.mjs` (used by CI).

## Quality Gates and CI

[QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md) is the single source of truth
for the local gate, required CI checks and scheduled audits. In short:

- Before committing: `npm run check:all`.
- Before pushing: the pre-push hook runs `scripts/pre_push_gate.ps1` (fast profile: required docs, lint, format check, tests, build). Enable it once with `& .\scripts\enable_git_hooks.ps1`, or push with `& .\scripts\push_with_audit.ps1` (`-Profile full` adds coverage, `npm audit` and the advisory health audit). Never use `--no-verify`.
- CI on PRs: lint, format check, unit tests, coverage, changed-lines coverage, contract checks, build, security audit and the merge gate (`ci.yml`), plus CodeQL, Dependency Review, Actionlint, secret scan and license policy. Nightly: full suite, flaky detection, extended audit, SBOM.
- Merges are manual; auto-merge stays off.

## Project Structure

```text
index.html          lobby page            -> src/lobby.js
player.html         player board          -> src/main.js
admin.html          admin console         -> src/admin/admin-setup.js, game-management.js
how-to-play.html    player guide (static) -> src/how-to-play.css
src/config/         control data and backend URL default
src/services/       auth, game actions, async sessions, SSE stream controller
src/meta/           meta fetch/cache and contract version
src/ui/             rendering modules (season cards, upgrades, analytics, live tools window, trading, chat, Top 5, events, setup)
src/utils/          DOM, storage, score and error helpers
public/assets/      images
deploy/             server installer and nginx template used by deploy-to-vps.ps1
scripts/            dev, gate, deploy and maintenance scripts
docs/history/       archived audits and snapshots
```

Module responsibilities: [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md).

For full-stack work in one VS Code window, open the umbrella workspace file
(`mining-tycoon-umbrella.code-workspace`) if you keep one next to both repos.

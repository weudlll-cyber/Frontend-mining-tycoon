# PROJECT BASELINE

This document is the canonical baseline for the current Mining Tycoon project state.
It is intentionally factual and implementation-driven.
It describes what is currently implemented and validated in code/tests, not ideas or future plans.

Last full review: 2026-10-07 (frontend `main` after PR #19; backend after PRs #8 and #10).

## 1) Project Overview

Mining Tycoon is a real-time, backend-authoritative multiplayer simulation game with a live frontend dashboard.

The implemented stack is:

- Backend service handling game lifecycle, simulation, economy, events, validation, and security.
- Simulation worker (started inside the backend process) advancing game time and applying mining yields.
- Frontend with three pages: lobby (`index.html`), live player board (`player.html`, SSE-driven: player state, upgrades, trading, Top 5 leaderboard, halving/event context, chat) admin console (`admin.html`) a static player guide (`how-to-play.html`, linked from the lobby and the player-board header) and static legal page templates (`privacy.html`, `imprint.html`, to be completed by the operator before going live).

The game is built around deterministic simulation inputs (seeded timelines and snapshot-locked settings) and server-authoritative outcomes.

## Locked Invariants (Project Contract)

Canonical locked decisions are defined in [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md). This section maps those constraints to implementation reality and forward constraints.

Implementation-factual contract:

- Backend is authoritative for lifecycle, simulation, economy, event logic, validation, and security.
- Frontend is SSE-driven display/intent orchestration and must not become client-authoritative for outcomes.
- Deterministic behavior (oracle, halving, events, snapshot-locked settings) is a hard project constraint.
- Admin configuration is separate from gameplay: settings are snapshot-locked at round creation and only admins can create rounds (via `admin.html`; the lobby and player board cannot).
- Main gameplay UI is inline: seasonal cards with visible three-lane upgrades and read-only analytics.
- Chat is optional, social-only, always reachable from the action bar/chat dock, and non-gameplay; it lives in the floating, non-modal live tools window.
- Trading and farming visibility is maintained in UI via status pills and tabs of the live tools window, even when disabled.
- Test posture is mandatory: backend and frontend suites remain green; behavior changes require test updates.
- Security posture is mandatory: preserve XSS-safe rendering patterns and avoid untrusted innerHTML paths.

Forward constraints (do not over-claim implementation):

- Farming scope is constrained to Stage 1 Passive and Stage 2 Rotating; Stage 3 is out of scope.
- Four scoring/outcome modes are part of the project contract, fixed before round start and evaluated by the backend (Stockpile default; Power, Mining Time Equivalent, and Efficiency optional).
- Round/game definition contract includes a snapshot-locked `scoring_mode` field set at creation time and shared identically by all players in that round.

## 2) Core Gameplay Systems (stable & authoritative)

Implemented lifecycle:

- enrolling
- running
- finished

Lifecycle behavior:

- Sync rounds: players can join only while the round is enrolling (`409 JOIN_NOT_ALLOWED_STARTED` afterwards). The round starts running automatically when the enrollment window ends.
- Async rounds: created with `enrollment_window_seconds=0`, so they run immediately. Players can join at any time before the round is finished; the lobby lists a running async round only while its session duration is shorter than the remaining round time.
- Finished is terminal for gameplay progression.
- Upgrades and trades are accepted only while the round is running (sync) or while the player has an active session (async). Otherwise the backend answers `409` with `ACTION_NOT_ALLOWED_GAME_NOT_RUNNING` or `ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION`.
- Async sessions run on the session clock: simulation months, halvings and trade unlock offsets count from the player's session start.

State delivery model:

- Backend exposes game/player state endpoints.
- SSE pushes periodic live state: core state, upgrade metrics, `leaderboard_top_5`, `active_events`, trading state and async session fields.
- Game streams (`/games/{id}/stream`) serve sync rounds; async rounds use session streams (`/sessions/{session_id}/stream`) only.

Automatic systems:

- Status transitions, simulation-time advancement, mining yield accumulation, event activation and score evaluation are backend-driven.

Player-triggered systems:

- Register / log in (lobby).
- Join a game (lobby, admin-created games only).
- Start an async session (automatic on entering an async round; manual button as fallback).
- Request upgrades and trades.
- Use chat; open the live tools window.

Admin-triggered systems (admin console only):

- Create games with snapshot-locked settings; list and delete active games.

## 3) Deterministic Economy (mining, halving, events, oracle)

Mining model:

- Tick-based, worker-driven application of yield over elapsed real time.
- Token-scoped output is computed from:
- base emission rate per token
- halving factor per token
- token track multipliers (hashrate, efficiency, cooling)
- active output-domain event multipliers

Token/resource model:

- Four seasonal tokens are implemented: spring, summer, autumn, winter.
- Player balances are persisted in backend state storage.
- Cumulative mined is tracked and exposed as a deterministic gameplay metric used by score/outcome evaluation modes.

Economy snapshot model:

- Each game locks an immutable economy snapshot (config/version/hash) at creation.
- Global economy patches affect only future games.
- Existing games keep original snapshot behavior.

Upgrade and pricing model:

- Upgrade costs use snapshot-locked economy parameters and optional active event multipliers.
- Cross-token payment conversion is server-computed using oracle prices, fee/spread, and ceiling rounding.
- Frontend inline lanes submit display/intent actions only; backend remains authoritative for accepted cost and conversion outcomes.

Oracle model:

- Deterministic oracle prices based on seed/time and configured rules.
- Includes scarcity and halving effects, deterministic variation, and bounded clamping.
- Event multipliers can modify oracle price and spread domains.

Halving model:

- Staggered per-token schedule with fixed offsets and fixed interval.
- Halving affects output/scarcity calculations, not direct instant balance cuts.

Event model:

- Deterministic event timeline generated from seed and snapshot-locked in game settings.
- Active window rule is start-inclusive, end-exclusive.
- Event domains implemented:
- oracle_price
- oracle_spread
- output
- upgrade_cost

## 4) Player Interaction Model (what players can and cannot influence)

Players can:

- Join admin-created games (within the join rules in §2). Players cannot create games.
- Select upgrade type and token/payment choices for upgrades.
- Execute trades within the round's fixed trade count and unlock schedule.
- Start async sessions (one at a time) in async rounds.
- Observe live game state, Top 5 leaderboard, oracle values, halving/event context.
- Use optional side-channel chat.

Players cannot directly influence:

- Game phase transitions.
- Tick progression.
- Oracle calculation internals.
- Event generation/timing.
- Authoritative cost/yield/score calculations.
- Round settings (scoring mode, durations, trade count/schedule).
- Server-derived identity/timestamps in chat broadcasts.

## 5) Frontend Architecture & UX Principles

Entry points (Vite multi-page build):

- `index.html` + `src/lobby.js`: lobby. Register (username, display name, email, Discord handle, optional Telegram handle, password), login, logout, `GET /auth/me` re-validation on load, forgot-password dialog (shows the backend's "disabled" message), open-games list (auto-refresh every 10 s and on tab focus; requested with the account token, own games marked via `my_player_id`), join ("Enter game", or "Rejoin" for a game the account already plays), "Download my data" (`GET /auth/me/export` saved as a JSON file) and "Delete account" dialog (`DELETE /auth/me` with password + confirmation checkbox; clears the local session on 204), "My results" dialog (`GET /auth/me/history` with Load more, full final leaderboard via `GET /games/{id}/results` with the own row highlighted, deep link `index.html?results=<gameId>&player=<playerId>`), and "Last Game Highscores" (server history when signed in, otherwise the local snapshot). Joining sends the account bearer token, stores game ID, player ID and `player_token`, then opens `player.html?autostart=1`.
- `player.html` + `src/main.js`: player board for one joined round.
- `admin.html` + `src/admin/`: admin console with 12 sections (Connection, Round Type, Time Configuration, Scoring Mode, Trading & Farming Rules, Advanced Overrides, Review & Create, Game Management with per-row Metrics/Reset/Delete, Global Economy, Metrics, Game Settings, Administrators). Create-form presets, defaults and limits come from the backend game config (`GET /meta` -> `game_config`); section 11 edits it via `GET`/`PATCH /admin/game-config` (new rounds only).
- Round options (snapshot-locked per round, backend-validated): optional conversion fee / oracle spread overrides in percent (section 5; empty = global economy, sent as `conversion_fee_rate` / `oracle_spread` rates) and "Chat enabled" (section 2; default from `defaults.chat_enabled`, fallback on; `chat_enabled` sent only when changed). `/games/{id}/meta` exposes the effective `conversion_fee_rate`, `oracle_spread` and `chat_enabled`; the player board shows the round fee/spread in the trading panel and, with chat disabled, a "Chat is disabled for this round." Chat tab without opening a WebSocket (also on a `CHAT_DISABLED` socket error, no reconnect). Missing fields = today's behavior (chat on, economy snapshot fee).
- Admin sign-in (section 1, `src/admin/admin-account.js` + `src/admin/admin-session.js`): "Sign in as administrator" (`POST /auth/login`, kept only when `user.is_admin` is true; a non-admin login shows "This account is not an administrator." and is revoked), Sign out (`POST /auth/logout`), the Admin Token field as the alternative. Admin requests (`adminRequest`, `POST /games`, game list/delete) send `X-Admin-Token` when the field is filled, else `Authorization: Bearer <session token>` for a signed-in administrator, else nothing. The session lives in `sessionStorage` (`mining-tycoon:adminSession`) and is cleared on sign out, after `expires_at`, on 401 `ACCOUNT_AUTH_INVALID` and on 403 `ADMIN_REQUIRED`; on load it is re-checked via `GET /auth/me`, and without one the lobby session is reused when `/auth/me` reports `is_admin: true`.
- Administrators (section 12, `src/admin/admin-users.js`): `GET /admin/users` with search and paging (20 per page), "Make admin" / "Remove admin" with a confirm step (`PATCH /admin/users/{id}` `{"is_admin": bool}`), 409 `LAST_ADMIN` explained inline; removing your own rights ends the console session. Disabled without credentials.
- Lobby: the "Admin setup" link reads "Admin setup (you are an administrator)" (accent color) when the signed-in account has `is_admin` (login payload or `/auth/me`); convenience only.
- Farming Stage 1 round options (section 5, `src/admin/farming-options.js`): "Farming enabled", minimum duration (value + unit) and reward per cycle (%), defaults/limits from Game Settings (`defaults.farming_*`, `farming_min_duration_limits`, `farming_reward_rate_limits`; fallbacks off / 300 s / 5 %, 10 s..7 d, 0.01 %..100 %), client check that the minimum duration is shorter than the round (sync) or session (async). Sent as `farming_enabled`, `farming_min_duration_seconds`, `farming_reward_rate` when enabled (only `farming_enabled: false` when unticked against an "on" default). Section 11 edits the farming defaults and limits (`src/admin/farming-config-fields.js`).

The module map is in [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md).

Frontend update strategy:

- SSE is the primary live state channel. Before every connect and reconnect the frontend fetches a fresh `GET /games/{id}/sse-ticket` (with `X-Player-Token` when stored) and appends `ticket=` to the game or session stream URL; reconnects use backoff (1 s to 15 s, up to 20 attempts).
- Meta/capabilities are fetched with ETag-aware cache behavior; contract versions `1..2` are supported, others disable upgrade actions.
- The default backend URL comes from `VITE_API_BASE_URL` at build time (`src/config/backend-url.js`, fallback `http://127.0.0.1:8000`); the URL fields on `player.html` and `admin.html` can override it (stored in localStorage).
- Backend errors are normalized by `src/utils/api-error.js`; 409/422 `detail` texts are shown inline or as toasts.
- Scores are formatted per scoring mode (`src/utils/score-format.js`): integers, or `1.2345×` in Efficiency mode. A missing `scoring_mode` means Stockpile.

Session-mode behavior:

- Round mode (sync/async) comes from game meta (`round_type`). Async rounds are assumed to support sessions; there is no capability probe.
- Entering an async round from the lobby starts a session automatically (`POST /games/{id}/sessions`) and switches to the session stream. The `Start Session (Async)` button in the setup panel is the manual fallback.
- Async rounds never fall back to the game stream.
- Every new async session starts from the same backend baseline (balances, tracks, upgrades, cumulative mined), so attempts are comparable; the backend keeps the best finalized score.
- In async rounds the Player State panel shows `This session` and `Best this round`; the header shows `Async: Session Active` and a session countdown. Both are hidden in sync rounds.
- Accounts are linked to players: the lobby (and the board's fallback join) send the account token on `POST /games/{id}/join`, and a repeated join returns the same player (`rejoined: true`), so async best-of continues across lobby re-entries instead of creating a second leaderboard row. With an older backend that ignores the token, each join still creates a new player.
- Session-start denials (`403`/`409`, for example `SESSION_ASYNC_INSUFFICIENT_TIME`) are shown inline in the setup panel, without modals.

Player board layout (desktop target 1440x900, no page scroll):

- **Header:** countdown, phase, score, rank, top score, scoring mode, connection badge, async badge; inline Debug disclosure (meta hash, backend URL, IDs).
- **Setup panel ("Join Round"):** Backend URL, player name, game ID, player ID, `Start Game`, `Start Session (Async)` (async only), `Stop Stream`. It collapses after the stream starts. Legacy host controls (round type, scoring, trade count, durations, overrides) remain in the HTML with `.admin-only` and are always hidden.
- **Main grid, left (~65%):** 2x2 season cards (Balance, Output, Halving countdown) with inline upgrade lanes Hashrate / Efficiency / Cooling as a row table `Upgrade | Lvl | Cost | Pay | Out/s | BEP`. An event banner above the grid lists all `active_events`; ⚡ indicators mark affected values.
- **Main grid, right (~35%):** read-only Player State analytics (per-token and total output, spendable balances, oracle prices, cumulative mined, next halving, fee/spread) with micro-tooltips for exact values; a "Farmed (not spendable)" line lists tokens in farming when there are any.
- **Action bar:** score context value (holdings value includes farmed tokens), Trading and Farming status pills (always visible; Farming "Enabled (5% / 5m)" or "Not enabled"), buttons `Trade`, `Farm`, `Chat`, `Top 5`, and a chat preview dock with unread badge.
- **Floating live tools window** (`#live-drawer`): one non-modal window with tabs Trade, Farm (Farming Stage 1), Chat and Top 5. It is draggable and resizable, has no backdrop, and closes via the close button, Escape or a click outside. Recorded as REDESIGN DECISION (2026-10-07) in `LOCKED_DECISIONS.md` §D, confirmed by the owner on 2026-10-07.
- **Post-game overlay:** when the round finishes (`running` -> `finished`) or the async session ends, a full-screen `Game Over` / `Session Finished` overlay appears. A click (or Enter/Space) resets the board and returns to the lobby, which shows the last-game highscores. The overlay's "View full results" link resets the board too and opens the lobby's full results view for that round (`index.html?results=<gameId>&player=<playerId>`); after an async session it notes that final results exist only once the round ends (the backend answers `409 GAME_NOT_FINISHED` until then).

Responsive behavior:

- Desktop: no page scroll; setup panel, season list and window contents scroll internally.
- Tablet (768-1200 px): grid stacks, minimal scrolling.
- Mobile (<768 px): one season card at a time via the season focus strip.

UX/behavior principles implemented:

- Contract compatibility gating for upgrade interactions.
- Incremental DOM updates (text/attribute diffs) for live values; tooltip anchors and pay-token selections survive SSE ticks.
- Mining, trading and farming are always visible as sections or status pills, even when disabled.
- One shared micro-tooltip contract (`.ps-tip-trigger`, `.ps-tip-bubble`, `#tooltip-layer`) with hover/focus/tap open and leave/Escape close, no timeout auto-hide.
- Tunables come only from `src/config/`: `game-config.js` resolves the effective round-setup config (backend `/meta` `game_config`, admin-editable), with `game-control-data.js` / `trading-control-data.js` as the built-in fallback for backends that send none.
- Safe DOM rendering only (see `SECURITY.md`).

## 6) Security & Anti-Cheat Invariants

Authoritative boundaries:

- Gameplay-critical rules are enforced on backend routes/services/worker.
- Frontend calculations are display/preview only.

Player auth and stream controls:

- Account auth (register/login/logout/`/auth/me`/change-password) with bearer session tokens; the lobby re-validates a stored token on load. Joins send the token (links the player to the account); `401 ACCOUNT_AUTH_INVALID` clears the local session, `401 ACCOUNT_REQUIRED` (admin Game Settings "Require sign-in to join", `account_policy.require_account_to_join`) shows the backend message.
- Per-player (per-game) `player_token` model is implemented; the lobby stores it for the player board.
- Optional strict player auth mode (`REQUIRE_PLAYER_AUTH`) enforces token validation.
- SSE ticket flow provides short-lived stream authorization; the frontend requests a fresh ticket for every (re)connect.
- Password reset: the backend security PR (#9, open on 2026-10-07) disables the unverified reset by default (`403 PASSWORD_RESET_DISABLED`); the lobby shows that message. A secure email-token reset is not implemented.
- Frontend security details: [SECURITY.md](SECURITY.md).

Chat security posture:

- In-band auth handshake with validated ticket context.
- Scope/identity derived from validated token context.
- Origin policy checks, strict schema validation, size bounds, rate limits.
- Global flood guard and slow-consumer/backpressure pruning.
- Non-persistent handling, no gameplay-state mutation.

Platform hardening implemented:

- Endpoint rate limiting.
- SSE per-IP connection cap.
- Security headers middleware.
- Request body size limits.
- CORS and host policy controls.
- Strict-mode behavior controls for production posture.

## 7) Test Coverage Guarantees

Backend test coverage (sibling repo) includes:

- Join policy and lifecycle timing behavior.
- End-to-end create/join/stream/tick/upgrade/leaderboard flow.
- Economy snapshot immutability/versioning.
- Oracle and cross-token conversion correctness.
- Halving and duration/emission mapping behavior.
- Deterministic global events and active-event effects.
- Scoring modes, action windows and async session clock.
- Meta endpoint contract and ETag behavior.
- Auth/token/ticket enforcement paths.
- Chat isolation, auth, schema, rate, origin, and backpressure controls.
- Security headers, rate limiting, and admin access sanity checks.
- Admin game management and aggregated metrics behavior.

Frontend test coverage (Vitest + jsdom; 52 files, 460 tests on 2026-10-07):

- Module tests next to each module in `src/ui/`, `src/services/`, `src/meta/`, `src/utils/`, `src/config/` and `src/admin/`.
- Player-board orchestration split across `src/main.*.test.js` (halving, halving passthrough, season upgrades, inline upgrades, chat preview, compact numbers, portfolio value, seasonal oracle helpers, stream join).
- Page-level flows: `src/player-live-board.test.js` (real `player.html` + `main.js` with an SSE payload), `src/lobby.test.js`, `src/async-session-flow.test.js`, `src/post-game-flow.test.js`.
- Rendering safety: `src/security-rendering.test.js` (lobby, admin, event display) and chat XSS tests.
- Layout guardrails: `src/layout-css.test.js`, `src/layout-controls.test.js` (no page scroll, 2x2 grid, column alignment, fixed analytics width).
- Tooltip parity: `src/tooltip-parity.test.js`.
- Coverage thresholds, changed-lines coverage, contract checks and mutation testing are described in `QUALITY_ENFORCEMENT.md`.

## 8) Explicit Non-Goals / Out of Scope

Intentionally not implemented in current baseline:

- Chat message persistence/history replay.
- Chat-driven gameplay mechanics or economy coupling.
- Client-authoritative gameplay state changes.
- Player-to-player trading/market systems.
- Offline progression mode.

Operational/security out-of-scope items (documented at threat-model level):

- WAF/CDN edge protections.
- Network-edge DDoS mitigation architecture.
- Multi-region failover/disaster-recovery architecture.

## 9) Open Design Space (Not Implemented)

Areas intentionally left open by current implementation:

- Deeper player decision systems beyond current upgrade model.
- Longer-term meta progression structures across games.
- Additional non-gameplay social/community surfaces beyond minimal chat.

## 10) Project Status & Next Steps (Non-Binding)

### Checkpoint 2026-10-08: Farming Stage 1 (frontend)

- Farm tab implemented (`src/ui/farming-panel.js`, `src/ui/farming-state.js`): status line, rule summary, per-token balance / farmed / cycles / next-reward countdown (local tick between SSE updates), Deposit / Withdraw / Withdraw all via `POST /games/{id}/players/{pid}/farm/deposit|withdraw` (`src/services/game-actions.js`, same player-token header and error toasts as trades), play-window gate, `updated_state` merge. Older backends without `farming` show "Farming is not enabled for this round."
- Player State "Farmed" line and holdings value including farmed tokens; admin create-form farming options and Game Settings farming defaults/limits.
- Needs the matching backend (farming fields in `/meta`, `/state`, SSE and the two farm endpoints). Stage 2 (rotating farming) remains open.

### Current status (checkpoint 2026-10-07)

The core loop works end to end: backend-authoritative simulation, lobby, live player board, admin console, sync and async rounds, trading and chat. The project is not release-ready yet (see "Open work" below).

Recently completed (frontend PRs #16-#19 and backend PRs #8, #10):

- CI runs on Node 24, audits all dependencies, covers all three HTML entry points in its path filter, and runs a contract suite (`npm run test:contract`) on PRs.
- Deployment publishes only the built `dist/` with `VITE_API_BASE_URL` set, through `scripts/deploy-to-vps.ps1`, `deploy/remote/install-frontend.sh` and the nginx template in `deploy/nginx/` (see `DEPLOY.md`).
- Backend URL is configurable at build time (`VITE_API_BASE_URL`).
- Event banner reads the backend `active_events` list (several events, token-scoped indicators).
- Live Top 5 leaderboard is shown as a tab of the live tools window.
- Admin advanced overrides (anchor token, anchor rate, season cycles) reach the backend; the admin create result uses safe DOM.
- Lobby stores the `player_token`, re-validates stored logins via `/auth/me`, and shows the backend message when password reset is disabled.
- SSE reconnects always use a fresh ticket.
- Backend: all four scoring modes are evaluated (`mining_time` and `efficiency` definitions confirmed by the owner on 2026-10-07, see `SCORING_MODES.md`); upgrades/trades only while the round runs or the async session is active; async rounds use the session clock; 3h preset.
- Dead code removed: player-side game creation, the in-board open-games/return panel, the legacy upgrade panel, the Vite counter sample.

Accounts linked to players (frontend side): lobby join/rejoin with the account token, "My results" history and full results, server-backed "Last Game Highscores", "View full results" on the Game Over overlay, admin "Require sign-in to join" (needs the matching backend: `user_id`/`rejoined` on join, `my_player_id` on `/games/active`, `/auth/me/history`, `/games/{id}/results`, `account_policy`).

Earlier milestones still valid: lobby/board split (`index.html` / `player.html`), admin-only round creation, async sessions with best-of, trading execution, floating live tools window, last-game highscores in the lobby.

In progress elsewhere:

- Backend security hardening (backend PR #9, open on 2026-10-07): password reset disabled by default (`403 PASSWORD_RESET_DISABLED`, dev opt-in `ALLOW_UNVERIFIED_PASSWORD_RESET`), rate limiting, secrets and input validation. The frontend already handles the 403.

Open work (summary):

- Owner decisions: branch protection / merge method (`QUALITY_ENFORCEMENT.md` §4). Decided on 2026-10-07: floating live tools window (`LOCKED_DECISIONS.md` §D), `mining_time` / `efficiency` formulas (`SCORING_MODES.md`), implemented default trade counts (`SEASONAL_TYCOON_CONCEPT.md`); production defaults are now set by admins in Game Settings (`PRODUCTION_DEFAULTS_CHECKLIST.md`).
- Gameplay features: Farming Stage 2 (Stage 1 is implemented in the UI, see the 2026-10-08 checkpoint); secure email-based password reset; scheduled sync live rounds; chat moderation and emoji; season artwork (`public/assets/seasons/` images exist but are unused).
- Release: remove the `1m` preset and the hidden `player.html` defaults, playtests (`MANUAL_TEST_RUNBOOK.md` §8), legal pages, backups/monitoring, versioning.
- Code health: `src/main.js` was split into player-board modules (now ~750 lines, see `CODE_ORGANIZATION.md`); `src/ui/trading-panel.js` (~1,020 lines after moving its pure helpers to `trading-panel-model.js`) is still the largest UI module.

Last stable rollback tag: `checkpoint/2026-03-30-stable-01` (no newer stable tag yet).

### Round Formats & Shared Chat

Both round formats are implemented. Sync rounds start automatically when the enrollment window ends; host-scheduled start times are not implemented. Round-wide chat is available to all players of the same round in both formats.

### Farming

Stage 1 (passive farming) is implemented in the UI: Farm tab, Farming status pill, Player State "Farmed" line, holdings value, admin round options and Game Settings defaults/limits (contract in `README.md`, section "Farming (Stage 1)"). Rules: a reward of `reward_rate` x farmed amount after each full minimum duration, compounding; a deposit restarts that token's cycle timer; withdrawing early earns nothing for the unfinished cycle; farmed tokens are not spendable until withdrawn but count toward the stockpile, power and mining-time scores. Stage 2 (rotating) is still open; Stage 3 is out of scope. The staged design is described in [SEASONAL_TYCOON_CONCEPT.md](SEASONAL_TYCOON_CONCEPT.md).

### UI & UX Work (Open)

The UI is functional but not final. Visual identity, layout refinement per game mode, onboarding/how-to-play and accessibility checks remain open and are deferred until gameplay and mode decisions settle.

### Deployment & Infrastructure

A deploy path exists for a single VPS (frontend: `DEPLOY.md`; backend and full stack: backend `BACKEND_DEPLOY.md`). Production hardening (secrets, strict mode, backups, monitoring) and real playtest hosting are still open.

### Playtesting & Validation (Open)

Structured playtests have not been run yet. They should validate mined output pacing, upgrade value vs. cost, halving timing and effect, trading balance and pacing across round lengths. Use `MANUAL_TEST_RUNBOOK.md` §8.

### Release Preparation (Not Started)

No release process exists yet (no versioning, changelog or release tags beyond rollback checkpoints). Release timing is undecided.

## 11) Operational Tracking Protocol (Mandatory)

This project now follows a strict high-level documentation protocol so onboarding and handovers remain reliable.

Required updates after each meaningful implementation batch:

- Update this file with a factual checkpoint date and completed items.
- Update next-step and missing-work bullets so a new developer can continue without tribal context.
- Keep README consistent with it. README no longer carries its own status snapshot; it links here.
- Reflect test-impact changes explicitly when behavior/contracts change.

Required status content in each checkpoint:

- What is completed and verified (implementation + tests).
- What is in progress right now.
- What is next in sequence.
- What remains intentionally deferred.
- Known risks, open decisions, and validation gaps.

Source-of-truth rule:

- This baseline remains the canonical technical state.
- Vision/intent remains in SEASONAL_TYCOON_CONCEPT.md.
- Locked invariants remain in LOCKED_DECISIONS.md.

## Concept Alignment & Remaining Work (Non-Binding)

### 1) Concept Areas Covered

- Deterministic, backend-authoritative simulation and fairness boundaries.
- Mining, oracle-relative value, halvings and global events.
- Round/session model: sync rounds and async rounds in which each player runs an identical, fixed-length session that can start at any time within the round window (session clock, baseline reset per session, best-of).
- Host-defined trading gates: fixed trade count and unlock schedule per round, identical for all players, enforced by the backend.
- Four scoring modes (Stockpile default, Power, Mining Time Equivalent, Efficiency), selected before round start and evaluated by the backend.
- Admin-only, snapshot-locked round setup with presets plus optional overrides.
- Shared round-level chat, separate from gameplay outcomes.

### 2) Concept Areas Partially Covered

- Default trade allocation by game length: implemented; the implemented table was confirmed by the owner on 2026-10-07 and is admin-configurable in Game Settings (see `SEASONAL_TYCOON_CONCEPT.md`). Hosts can override the count, not individual unlock times.
- Trading cost: deterministic conversion fee and spread exist; the admin can override both per round (round options in the admin console).
- Leaderboards: live Top 5 during play; full final leaderboard and per-account result history in the lobby ("My results") after a round finishes. No provisional/final marker on the live Top 5.

### 3) Concept Areas Not Yet Implemented

#### A) Core Game & Simulation

- Host-scheduled synchronous live event rounds (fixed start date/time).

#### B) Economy & Progression

- ~~Farming Stage 1 (passive lock-duration farming with post-duration reward and compounding).~~ Implemented in the UI (2026-10-08; needs the matching backend).
- Farming Stage 2 (rotating farming), the final planned farming layer.
- ~~Per-round trading fee override.~~ Implemented (admin round options).

#### C) Accounts & Results

- Profile page (avatars, cross-round statistics beyond the history list).

#### D) Frontend / UX

- ~~Farming panel (currently a placeholder tab).~~ Implemented (Farm tab, Stage 1).
- Season artwork from `public/assets/seasons/` in the season cards.
- Onboarding / how-to-play guidance.

#### E) Platform / Operations

- Production defaults, hardening, backups and monitoring (see section 10).

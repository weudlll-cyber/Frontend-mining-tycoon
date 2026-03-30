# PROJECT BASELINE

This document is the canonical baseline for the current Mining Tycoon project state.
It is intentionally factual and implementation-driven.
It describes what is currently implemented and validated in code/tests, not ideas or future plans.

## 1) Project Overview

Mining Tycoon is a real-time, backend-authoritative multiplayer simulation game with a live frontend dashboard.

The implemented stack is:

- Backend service handling game lifecycle, simulation, economy, events, validation, and security.
- Background simulation worker advancing game time and applying mining yields.
- Frontend dashboard consuming live state via SSE and rendering player state, upgrades, leaderboard, halving/event context, and optional chat.

The game is built around deterministic simulation inputs (seeded timelines and snapshot-locked settings) and server-authoritative outcomes.

## Locked Invariants (Project Contract)

Canonical locked decisions are defined in [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md). This section maps those constraints to implementation reality and forward constraints.

Implementation-factual contract:

- Backend is authoritative for lifecycle, simulation, economy, event logic, validation, and security.
- Frontend is SSE-driven display/intent orchestration and must not become client-authoritative for outcomes.
- Deterministic behavior (oracle, halving, events, snapshot-locked settings) is a hard project constraint.
- Admin configuration is separate from gameplay: settings are snapshot-locked at round creation and only admin can create rounds (via admin.html, not index.html).
- Main gameplay UI is inline: seasonal cards with visible three-lane upgrades and read-only analytics.
- Chat is optional, social-only, always reachable from the action bar/chat dock, and non-gameplay.
- Trading and farming visibility is maintained in UI via status pills and on-demand drawer panels even when disabled.
- Test posture is mandatory: backend and frontend suites remain green; behavior changes require test updates.
- Security posture is mandatory: preserve XSS-safe rendering patterns and avoid untrusted innerHTML paths.

Forward constraints (do not over-claim implementation):

- Farming scope is constrained to Stage 1 Passive and Stage 2 Rotating; Stage 3 is out of scope.
- Four scoring/outcome modes are part of the project contract and are fixed before round start (Stockpile default; Power, Mining Time Equivalent, and Efficiency optional).
- Round/game definition contract includes a snapshot-locked `scoring_mode` field set at creation time and shared identically by all players in that round.

## 2) Core Gameplay Systems (stable & authoritative)

Implemented lifecycle:

- enrolling
- running
- finished

Lifecycle behavior:

- Players can join only during enrolling.
- Running starts after enrollment window completion.
- Finished is terminal for gameplay progression.

State delivery model:

- Backend exposes game/player state endpoints.
- SSE stream pushes periodic live state updates.
- Stream payload includes core state, upgrade metrics, and top leaderboard entries.

Automatic systems:

- Status transitions, simulation-time advancement, mining yield accumulation, and event activation are backend-driven.

Player-triggered systems:

- Create game.
- Join game.
- Request upgrade actions.
- Open/close stream and optional chat in frontend.

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

- Create and join games (within join policy constraints).
- Select upgrade type and token/payment choices for upgrades.
- Observe live game state, leaderboard, oracle values, halving/event context.
- Use optional side-channel chat.

Players cannot directly influence:

- Game phase transitions.
- Tick progression.
- Oracle calculation internals.
- Event generation/timing.
- Authoritative cost/yield calculations.
- Server-derived identity/timestamps in chat broadcasts.

## 5) Frontend Architecture & UX Principles

Frontend update strategy:

- SSE is the primary live state channel.
- Meta/capabilities are fetched with ETag-aware cache behavior.
- UI state reacts to backend contract and game-scoped metadata.

Frontend structure is modular:

- Main orchestration module (`main.js`): coordinates SSE lifecycle, data rendering, and user interactions.
- Session transport module (`services/stream-controller.js`): owns SSE setup, reconnect state, and timer cleanup.
- Action module (`services/game-actions.js`): owns create/join flow and upgrade submission requests.
- Setup shell module (`ui/setup-shell.js`): manages setup panel state, action enablement, and live-board navigation.
- Summary module (`ui/live-summary.js`): renders score/rank/top-score stats and a live score-context metric display.
- Leaderboard module (`ui/leaderboard.js`): renders the live top-5 table.
- Season card module (`ui/season-cards.js`): updates balances, output rates, and per-card halving countdowns.
- Season focus module (`ui/season-focus.js`): keeps mobile layout compact by focusing one season card at a time.
- Live drawer module (`ui/live-drawer.js`): manages non-core panel access (trade/farm/chat) without crowding the core board.
- Player state analytics render module (`player-view.js`): orchestrates per-token output, balances, cumulative mined, oracle prices, and conversion parameter display.
- Player analytics layout helper (`ui/player-view-layout.js`): owns analytics matrix construction and tooltip trigger/bubble anchors.
- Player analytics score helper (`ui/player-view-score.js`): owns `This session` / `Best this round` display resolution and score formatting.
- Inline upgrade rendering module (`upgrade-panel-inline.js`): renders upgrade lanes (hashrate, efficiency, cooling) within each seasonal card as a compact row-table with headers `Upgrade | Lvl | Cost | Pay | Out/s | BEP` plus inline info tooltip trigger.
- Legacy upgrade panel module (`upgrade-panel.js`): maintained for backward compatibility (not visible in new inline layout).
- Countdown module: manages game duration and enrollment countdown timers.
- Halving display module: calculates and renders halving schedules and countdowns per token.
- Control-data layer (`src/config/game-control-data.js`): centralises all game setup tunables — duration presets, round/session limits, enrollment window defaults, async defaults, and scoring mode constants. `src/config/trading-control-data.js` holds trade-scheduling tunables. UI modules and `main.js` import from here; constants are not duplicated inline.

Frontend session-mode readiness:

- Setup shell surfaces round mode (`sync` / `async`) and async session support state without blocking gameplay.
- Async rounds now use an explicit user-triggered `Start Async Session` action in Setup before session-scoped streaming begins.
- `Start Async Session` is enabled only when player join context exists, backend session support is available, and no session is active yet.
- Setup shell exposes explicit host round types:
  Sync uses enrollment window + round duration controls.
  Async uses round duration + session duration controls with optional auto-start.
- Async create payload sends `enrollment_window_seconds=0`, `duration_mode="preset"`, and explicit `session_duration_seconds`.
- Async enrollment phase is intentionally skipped: because `enrollment_window_seconds=0`, the backend transitions directly from creation to `running` without an `enrolling` phase. The frontend detects async mode via `getRoundModeFromMeta() === 'async'` from the game meta payload and skips the enrollment countdown, showing the round duration countdown immediately instead.
- Policy-window denials (`403`/`409`) render inline non-blocking setup status text and do not use modals.
- Async stream start is session-only: frontend uses `/sessions/{session_id}/stream` and never falls back to `/games/{id}/stream` for async mode.
- In auth-required mode, frontend requests `GET /games/{id}/sse-ticket` with `X-Player-Token` and appends `ticket` only to the session stream URL.
- Async best-of attempts are backend-reset per session start: player state is reset to deterministic baseline (balances/tracks/upgrades/cumulative mined) before each new async session, so attempts are directly comparable.
- Best-of visibility is surfaced in Player State panel during async rounds only: shows `This session` and `Best this round` (read-only backend values from backend payload). Hidden in sync mode.
- Live tools behavior is split intentionally: core mining/analytics remain always visible, while trade/farm/chat are reachable via an inline non-blocking bottom drawer.
- Chat presence remains visible everywhere through an always-available chat button plus compact preview/unread indicator.
- Event display module: renders the active-event banner and inline affected-value indicators using the shared micro-tooltip layer.
- Meta manager: handles meta endpoint responses, caching, versioning, and contract-version support validation.
- Chat panel module: optional side-channel WebSocket communication, non-persistent, isolated from gameplay.
- Tooltip module (`micro-tooltip.js`): single shared non-blocking tooltip contract (`.ps-tip-trigger`, `.ps-tip-bubble`, `#tooltip-layer`) used by player-status and season-header info triggers, with hover-stable behavior across SSE ticks.

Dashboard layout (inline during play, post-game overlay allowed after finish):

- **Status Bar (top)**: connection status, game phase, countdown timer, quick stats.
- **Main Grid (2 columns)**:
  - Left (~65%): 2×2 seasonal card grid with inline upgrade lanes (Hashrate, Efficiency, Cooling) and compact row-table headers `Upgrade | Lvl | Cost | Pay | Out/s | BEP`.
  - Right (~35%): Player-state analytics panel (per-token output, total output, balances, oracle prices, fee/spread), followed by a split player-return panel (`Open Games` + `Last Game Highscores`) and optional docked inline chat below.
- **Bottom Bar**: score-context metric display, trading status, farming status, chat toggle.
- **Chat Panel (docked inline, optional)**: toggleable via bottom bar button; expands/collapses inline in the right column with internal message scrolling only.
- **Post-game return overlay**: when `game_status=finished`, the player sees a full-screen `Game Over` overlay; clicking it clears the ended game/player context and returns focus to the inline Open Games panel.
- Desktop no-page-scroll remains enforced; setup and seasons use internal scroll containers, and left column overflow is constrained with `min-width: 0`.

Responsive behavior:

- Desktop (1440×900+): fixed layout, zero vertical scrolling in dashboard.
- Tablet (768px–1200px): grid stacks, minimal scrolling.
- Mobile (<768px): single-column layout with season card tabs or accordion controls.

UX/behavior principles implemented:

- Contract compatibility gating/disabling for upgrade interactions (no UI mutation after disable).
- Incremental DOM updates for live metric values (balance, output, countdown) using text/attribute diff updates instead of subtree remounting.
- Inline upgrade controls integrated into season cards (no separate modal/overlay panel).
- All three economic modes (mining, trading, farming) visible as sections, even when disabled, supporting long-term planning.
- Optional chat panel is docked inline and non-gameplay (independent lifecycle, no gameplay coupling).
- Local persistence of UI/session settings and meta hash hints.
- Deterministic oracle pricing visible per-token to inform player decision-making.
- Tooltip anchors are kept stable across SSE ticks (no trigger remount while a tooltip is open).

## 6) Security & Anti-Cheat Invariants

Authoritative boundaries:

- Gameplay-critical rules are enforced on backend routes/services/worker.
- Frontend calculations are display/preview only.

Player auth and stream controls:

- Per-player session token model is implemented.
- Optional strict player auth mode enforces token validation.
- SSE ticket flow provides short-lived stream authorization.

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

Backend test coverage includes:

- Join policy and lifecycle timing behavior.
- End-to-end create/join/stream/tick/upgrade/leaderboard flow.
- Economy snapshot immutability/versioning.
- Oracle and cross-token conversion correctness.
- Halving and duration/emission mapping behavior.
- Deterministic global events and active-event effects.
- Meta endpoint contract and ETag behavior.
- Auth/token/ticket enforcement paths.
- Chat isolation, auth, schema, rate, origin, and backpressure controls.
- Security headers, rate limiting, and admin access sanity checks.
- Admin game management and aggregated metrics behavior.

Frontend test coverage includes:

- Contract support guards.
- Token normalization and conversion helper coverage.
- Halving helper behavior and transitions.
- Orchestration coverage split across `src/main.test.js`, `src/main.halving.test.js`, `src/main.halving-passthrough.test.js`, `src/main.season-upgrades.test.js`, and `src/main.inline-upgrades.test.js`.
- Direct player analytics rendering tests in `src/ui/player-view.test.js`.
- Upgrade rendering interaction behavior.
- Chat rendering/XSS-safety and scroll behavior.
- Layout guardrails for desktop no-page-scroll, 2×2 season grid, shared upgrade-column alignment, and fixed player panel width.
- Repo-wide tooltip parity assertions (shared trigger/bubble contract, scoped tooltip init, and no timeout-based auto-hide paths).
- Large-value compact-number rendering coverage in analytics/upgrade rows (with exact-value tooltip metadata retained).

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

### Current status

The current baseline is stable for the implemented mining-focused loop: backend-authoritative simulation, live frontend dashboard, deterministic economy foundations, security boundaries, and test-covered core behaviors are working together for mining gameplay.

At the same time, the project is still in an iterative phase. Some major areas are intentionally left open so that future decisions can be evaluated against the implemented baseline rather than assumed from design intent alone.

Implementation checkpoint (2026-03-30):

- Mining is the only fully implemented and validated gameplay pillar at this time.
- Active game discovery and selection flow is implemented for players, including backend filtering rules and frontend auto-refresh.
- Active game list behavior is constrained to joinable states: enrolling rounds plus asynchronous rounds already running; running synchronous rounds are excluded.
- Async joinability applies a duration-fit guard: rounds are hidden when `session_duration_seconds >= run_remaining_seconds`.
- Player setup panel now auto-collapses after successful join to preserve gameplay screen space.
- Frontend now uses a split entry flow: `index.html` for auth/lobby and `player.html` for the live board.
- Login no longer auto-enters gameplay. Players must select an open game first, then explicitly enter the live board.
- Player live board now includes an inline return panel with `Open Games` and `Last Game Highscores` so players can re-enter the join flow without leaving `player.html`.
- The frontend persists the most recent finished-round highscore snapshot locally and restores it into the player return panel.
- Game-over handling is aligned for async session expiry from both server-driven finish transitions and client-side elapsed-session fallback paths.
- Start/autostart path is wrapped in defensive error handling to prevent unhandled flow errors from collapsing player state transitions.
- Lobby now consumes the provided seasonal start background asset from `public/assets/backgrounds/Seasonal Enterteinment.png`.
- Temporary fast-test preset `1m` is available in round/session setup control data; this is a local testing convenience and a release blocker for production default cleanup.
- Trading UI and Farming UI work are not started yet beyond explicit placeholder visibility/status in the layout.
- Balance/tuning validation is still pending for mined output pace, upgrade value/cost calibration, and halving correctness in live runs.
- Stable rollback tag for this checkpoint: `checkpoint/2026-03-30-stable-01`.

### Round Formats & Shared Chat (Non-Binding Status)

Round-wide chat is implemented and available as a shared communication layer for players in the same round.

Synchronous live event rounds remain a planned format that builds on the same core deterministic systems already used by challenge-style rounds.

Hosting logic is intended to remain host-controlled and deterministic across round formats so the fairness model stays consistent.

### Farming (Planned, Staged Introduction)

Farming is treated as a planned third economic pillar alongside mining and trading.

Conceptually, farming represents liquidity provision, demand creation, and long-term stability within the broader seasonal economy. It is not intended to replace mining as the production layer or trading as the allocation layer. Instead, it is understood as a complementary system that adds another way for players to position themselves within the cycle.

Its introduction is intentionally framed as staged rather than universal.

In an initial stage, some game modes may have no farming at all. In those formats, the game remains focused on mining only, or mining with trading, and farming is intentionally disabled or unavailable.

In a later limited stage, farming can exist as a simple allocation choice. In that form, players commit tokens to farming in exchange for steady, relatively low-risk returns, without requiring active optimization or continual rotation.

In a more strategic stage, farming rewards can rotate across seasonal tokens over time. At that point, players are encouraged to reallocate farming positions as the cycle changes, and farming begins to compete directly with mining upgrades and trading decisions for attention and resources.

In an optional endgame-oriented stage, farming can become one of the primary tools for long-term income and positioning. In that shape of the game, mining continues to matter as infrastructure, while farming and trading take on a larger role in expressing strategic judgment across the full economy.

The relationship to game modes remains intentionally selective rather than uniform:

- short games may exclude farming entirely
- medium games may treat farming as optional or limited
- long games may use farming as a core strategic layer

Farming is also explicitly bounded by several non-goals. It is not intended to introduce player-to-player markets, real-world liquidity pools, or any real-money mechanics. It remains an abstracted and deterministic system inside the game’s own economy.

### UI & UX Work (Open)

The current UI is functional and structurally sound, but it is not treated as final.

A broader UI/UX pass remains intentionally open around:

- visual identity and polish
- layout refinement for different game modes
- onboarding clarity and information hierarchy

This work is intentionally deferred until gameplay structure and mode decisions are more settled, so presentation changes do not force premature revisions to the interface model.

### Deployment & Infrastructure (Open)

The project is currently operating as a local/development setup.

Deployment to a VPS or similar hosted environment remains an open phase intended to support:

- real playtest sessions
- longer-running games
- evaluation of performance and stability under real usage

Related infrastructure work is understood at a high level and includes environment configuration, reverse proxy / HTTPS posture, and basic monitoring and logging.

### Playtesting & Validation Phases (Open)

Structured playtesting is planned as a later validation phase, but it has not yet been executed as part of the current baseline.

The expected role of playtesting is to validate:

- balance between mining and trading-oriented decisions
- pacing across different game modes
- UX comprehension for new players

This validation phase is intended to inform tuning and calibration of the implemented systems, not to redefine the project’s core architecture.

Immediate validation backlog (mining-first):

- Validate mined output amounts over full-round timelines.
- Validate per-upgrade gains against upgrade price progression.
- Validate halving timing and post-halving output behavior end-to-end.

Immediate delivery backlog (security-first auth):

- Phase 1: backend auth/profile extension (strict unique username, required contact fields persistence, rate limiting, tests).
- Phase 2: frontend auth/lobby/game split with persistent login/session validation and clean screen routing. (implemented)
- Phase 3: security hardening and audit polish (headers, stricter validation, audit log coverage, dependency/security audits).
- Phase 4 (explicitly deferred): forgot-password via email, reset-token flow, email templates, and related end-to-end tests.

### Release Preparation (Not Started)

No release process has been initiated at the current stage.

Release preparation is understood only at a high level and includes:

- final balancing
- UI polish
- documentation review
- deployment hardening

Release timing remains intentionally undecided in the current project state.

## 11) Operational Tracking Protocol (Mandatory)

This project now follows a strict high-level documentation protocol so onboarding and handovers remain reliable.

Required updates after each meaningful implementation batch:

- Update this file with a factual checkpoint date and completed items.
- Update next-step and missing-work bullets so a new developer can continue without tribal context.
- Keep README aligned with the same status and phase ordering.
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

### 1) Concept Areas Already Covered

- Deterministic, backend-authoritative simulation and fairness boundaries are established.
- Mining, oracle-relative value behavior, halvings, and global events are already part of the implemented game model.
- Shared round-level chat is documented as available and separated from gameplay outcomes.
- The baseline already treats host-controlled deterministic round governance as the intended fairness anchor.

### 2) Concept Areas Partially Covered

- Round format framing exists: challenge-style rounds are represented and synchronous live rounds are documented as planned; what is still missing is full alignment to the locked session model where each player runs an identical fixed-duration session within a round window.
- Host control framing exists in principle through admin and configuration controls; what is still missing is explicit concept-level alignment to preset-plus-override round setup as a stable pre-round contract.
- Trading cost behavior exists in the economy model through deterministic conversion costs; what is still missing is implementation-level support for the agreed default that every trade carries a round-consistent conversion-ratio-based fee unless the host predefines an override.
- Farming is already documented as planned; what is still missing is implementation-level support for the locked two-stage scope (Stage 1 passive and Stage 2 rotating only) in the non-binding farming narrative.

### 3) Concept Areas Not Yet Implemented

Required future work to realize the agreed concept:

### A) Core Game & Simulation Layer

- Implement the locked round/session structure where each player runs an identical time-limited session that can start at any point within the round window.
- Implement host-defined trading gates per round, including fixed trade count and fixed minimum trade-start timing shared equally across all players.
- Implement full support for the four approved scoring/outcome modes (Stockpile default, plus optional Power, Mining Time Equivalent, and Efficiency), with mode selection fixed before round start and no mid-round switching.

### B) Economy & Progression Systems

- Implement the agreed default trade allocation profile by game length, with host overrides fixed before round start.
- Implement Farming Stage 1 as a passive lock-duration system with post-duration reward and compounding behavior when positions remain allocated.
- Implement Farming Stage 2 rotating farming as the next and final planned farming layer, consistent with the explicit no-Stage-3 design limit.

### C) Host / Round Configuration Layer

- Implement the host-scheduled synchronous live event round format on top of the same deterministic rules used by challenge rounds.

### D) Frontend / UX Layer

### E) Platform / Operations

- Integrate approved visual asset pipeline for lobby/background and season artwork from `public/assets/backgrounds` and `public/assets/seasons`.

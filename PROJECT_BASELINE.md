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
- Main gameplay UI is inline: seasonal cards with visible three-lane upgrades and read-only analytics.
- Chat is optional, social-only, docked inline, and non-gameplay.
- Trading and farming visibility is maintained in UI even when disabled (status remains explicit).
- Test posture is mandatory: backend and frontend suites remain green; behavior changes require test updates.
- Security posture is mandatory: preserve XSS-safe rendering patterns and avoid untrusted innerHTML paths.

Forward constraints (do not over-claim implementation):

- Farming scope is constrained to Stage 1 Passive and Stage 2 Rotating; Stage 3 is out of scope.
- Alternative scoring/outcome models are allowed only when fixed before round start.

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
- Cumulative mined is tracked and used for leaderboard scoring.

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
- Summary module (`ui/live-summary.js`): renders score/rank/top-score stats and portfolio value.
- Leaderboard module (`ui/leaderboard.js`): renders the live top-5 table.
- Season card module (`ui/season-cards.js`): updates balances, output rates, and per-card halving countdowns.
- Player state analytics module (`player-view.js`): renders per-token output, balances, cumulative mined, oracle prices, and conversion parameters.
- Inline upgrade rendering module (`upgrade-panel-inline.js`): renders upgrade lanes (hashrate, efficiency, cooling) within each seasonal card as a compact row-table with headers `Upgrade | Lvl | Cost | Pay | Out/s | BEP` plus inline info tooltip trigger.
- Legacy upgrade panel module (`upgrade-panel.js`): maintained for backward compatibility (not visible in new inline layout).
- Countdown module: manages game duration and enrollment countdown timers.
- Halving display module: calculates and renders halving schedules and countdowns per token.

Frontend session-mode readiness:

- Setup shell surfaces round mode (`sync` / `async`) and async session support state without blocking gameplay.
- Async rounds now use an explicit user-triggered `Start Async Session` action in Setup before session-scoped streaming begins.
- `Start Async Session` is enabled only when player join context exists, backend session support is available, and no session is active yet.
- Setup shell exposes explicit host round types:
  Sync uses enrollment window + round duration controls.
  Async uses round duration + session duration controls with optional auto-start.
- Async create payload sends `enrollment_window_seconds=0`, `duration_mode="preset"`, and explicit `session_duration_seconds`.
- Policy-window denials (`403`/`409`) render inline non-blocking setup status text and do not use modals.
- Async stream start is session-only: frontend uses `/sessions/{session_id}/stream` and never falls back to `/games/{id}/stream` for async mode.
- In auth-required mode, frontend requests `GET /games/{id}/sse-ticket` with `X-Player-Token` and appends `ticket` only to the session stream URL.
- Best-of visibility is surfaced inline: header and player analytics show `This session` and `Best this round` (read-only backend values).
- Event display module: renders the active-event banner and inline affected-value indicators using the shared micro-tooltip layer.
- Meta manager: handles meta endpoint responses, caching, versioning, and contract-version support validation.
- Chat panel module: optional side-channel WebSocket communication, non-persistent, isolated from gameplay.
- Tooltip module (`micro-tooltip.js`): single shared non-blocking tooltip contract (`.ps-tip-trigger`, `.ps-tip-bubble`, `#tooltip-layer`) used by player-status and season-header info triggers, with hover-stable behavior across SSE ticks.

Dashboard layout (inline, no overlays):

- **Status Bar (top)**: connection status, game phase, countdown timer, quick stats.
- **Main Grid (2 columns)**:
  - Left (~65%): 2×2 seasonal card grid with inline upgrade lanes (Hashrate, Efficiency, Cooling) and compact row-table headers `Upgrade | Lvl | Cost | Pay | Out/s | BEP`.
  - Right (~35%): Player-state analytics panel (per-token output, total output, balances, oracle prices, fee/spread), with fixed panel width variable and optional docked inline chat below.
- **Bottom Bar**: portfolio value, trading status, farming status, chat toggle.
- **Chat Panel (docked inline, optional)**: toggleable via bottom bar button; expands/collapses inline in the right column with internal message scrolling only.
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

The current baseline is functionally complete in the sense that the implemented backend-authoritative game loop, live frontend dashboard, deterministic economy systems, security boundaries, and test-covered core behaviors are present and working together as a coherent product surface.

At the same time, the project is still in an iterative phase. Some major areas are intentionally left open so that future decisions can be evaluated against the implemented baseline rather than assumed from design intent alone.

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

### Release Preparation (Not Started)

No release process has been initiated at the current stage.

Release preparation is understood only at a high level and includes:

- final balancing
- UI polish
- documentation review
- deployment hardening

Release timing remains intentionally undecided in the current project state.

## Concept Alignment & Remaining Work (Non-Binding)

### 1) Concept Areas Already Covered

- Deterministic, backend-authoritative simulation and fairness boundaries are established.
- Mining, oracle-relative value behavior, halvings, and global events are already part of the implemented game model.
- Shared round-level chat is documented as available and separated from gameplay outcomes.
- The baseline already treats host-controlled deterministic round governance as the intended fairness anchor.

### 2) Concept Areas Partially Covered

- Round format framing exists: challenge-style rounds are represented and synchronous live rounds are documented as planned; what is still missing is full alignment to the locked session model where each player runs an identical fixed-duration session within a round window.
- Host control framing exists in principle through admin and configuration controls; what is still missing is explicit concept-level alignment to preset-plus-override round setup as a stable pre-round contract.
- Trading cost behavior exists in the economy model through deterministic conversion costs; what is still missing is implementation-level support for the agreed default that every trade carries a round-consistent value-based fee unless the host predefines an override.
- Farming is already documented as planned; what is still missing is implementation-level support for the locked two-stage scope (Stage 1 passive and Stage 2 rotating only) in the non-binding farming narrative.

### 3) Concept Areas Not Yet Implemented

Required future work to realize the agreed concept:

### A) Core Game & Simulation Layer

- Implement the locked round/session structure where each player runs an identical time-limited session that can start at any point within the round window.
- Implement host-defined trading gates per round, including fixed trade count and fixed minimum trade-start timing shared equally across all players.
- Implement the agreed scoring model based on final portfolio value weighted by oracle-relative value at session end, including pre-fixed alternative outcome formats when used.

### B) Economy & Progression Systems

- Implement the agreed default trade allocation profile by game length, with host overrides fixed before round start.
- Implement Farming Stage 1 as a passive lock-duration system with post-duration reward and compounding behavior when positions remain allocated.
- Implement Farming Stage 2 rotating farming as the next and final planned farming layer, consistent with the explicit no-Stage-3 design limit.

### C) Host / Round Configuration Layer

- Implement the host-scheduled synchronous live event round format on top of the same deterministic rules used by challenge rounds.

### D) Frontend / UX Layer

### E) Platform / Operations

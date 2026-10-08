# Code Organization

Current module map of the frontend (verified 2026-10-07). Each source file
starts with a header comment that states its purpose; this page only gives the
overview. The 2026-03-25 modularity audit that used to live here is archived at
[docs/history/audits/CODE_ORGANIZATION_AUDIT_2026-03-25.md](docs/history/audits/CODE_ORGANIZATION_AUDIT_2026-03-25.md).

## Entry Points (Vite multi-page build)

| Page | Script | Role |
|---|---|---|
| `index.html` | `src/lobby.js` (+ `src/lobby.css`) | Lobby: register / login / logout, `/auth/me` check, forgot-password dialog, open-games list (auto-refresh every 10 s), join, last-game highscores |
| `player.html` | `src/main.js` (+ `src/style.css`) | Player board for one joined round: SSE stream, season cards, inline upgrades, analytics, live tools window, game-over handling |
| `how-to-play.html` | none (static, `src/how-to-play.css`) | Player guide: rules, upgrades, halvings, trading, round types, scoring modes, events, live tools; linked from the lobby and the player-board header |
| `privacy.html`, `imprint.html` | none (static, `src/how-to-play.css`) | Legal page templates for the operator (template banner, `[PLACEHOLDER]` markers); linked from the lobby footer, the registration dialog and the how-to-play footer |
| `admin.html` | `src/admin/admin-setup.js` (+ `game-management.js`, `economy-settings.js`, `admin-metrics.js`, `game-config-settings.js`, `round-options.js`) | Admin console: 11 sections (connection, round type, time, scoring, trading, advanced overrides, review & create, game management, global economy, metrics, game settings) |

`vite.config.js` declares the six inputs. Static images live in
`public/assets/`.

## `src/` Layout

| Path | Contents |
|---|---|
| `src/main.js` | Player-board orchestrator (about 2,400 lines): wires the modules below, owns stream/session/setup state. Largest file; splitting it is open code-health work. |
| `src/lobby.js` | Lobby page logic (auth, open games, join, stores `player_token`). |
| `src/halving.js` | Pure halving-timeline helpers. |
| `src/admin/` | `admin-setup.js` (round creation form built from the effective game config, payload, trade schedule preview), `game-management.js` (list / delete / reset active games via `/admin/games`), `economy-settings.js` (`/admin/economy`), `admin-metrics.js` (`/admin/metrics`), `game-config-settings.js` (Game Settings editor, `/admin/game-config`), `round-options.js` (per-round fee/spread overrides and chat option of the create form), `admin-api.js` (shared admin request helper). |
| `src/config/` | Control data. `game-config.js` (effective round-setup config: backend `/meta` `game_config`, else the fallback below; trade-count defaults, unlock schedule, clamp helpers), `game-control-data.js` (fallback duration presets, enrollment and async defaults, scoring modes), `trading-control-data.js` (fallback trade-count limits, default buckets and unlock fractions), `backend-url.js` (`VITE_API_BASE_URL` default), `index.js` (barrel). Tunables live only here. |
| `src/meta/` | `meta-manager.js`: `/meta` and `/games/{id}/meta` fetch, ETag cache, contract-version support. |
| `src/services/` | Network flows: `auth-client.js` (`/auth/*`, `/games/active`, join), `game-actions.js` (upgrade and trade requests, 409 handling), `session-actions.js` (async session start, SSE tickets), `stream-controller.js` (EventSource lifecycle, fresh ticket per reconnect, backoff). |
| `src/ui/` | Rendering and UI state modules (see below). |
| `src/utils/` | `api-error.js` (backend error normalization), `score-format.js` (per-mode score formatting), `dom-utils.js` (safe DOM helpers), `storage-utils.js` (localStorage keys, URL normalization), `token-utils.js` (token/pricing helpers), `debug-log.js`. |
| `src/test-utils/` | Shared test fixtures (`main-test-helpers.js`). |
| `src/*.test.js` | Cross-module and page-level tests (`main.*`, `lobby`, `how-to-play`, `legal-pages`, `player-live-board`, `async-session-flow`, `post-game-flow`, `security-rendering`, `layout-*`, `tooltip-parity`). |

### `src/ui/` modules

| Area | Modules |
|---|---|
| Season board | `season-cards.js`, `season-focus.js` (mobile one-card focus), `upgrade-panel-inline.js` (3-lane inline upgrades), `halving-display.js`, `countdown.js` |
| Analytics | `player-view.js`, `player-view-layout.js`, `player-view-score.js`, `live-summary.js` (header stats, action-bar score) |
| Live tools window | `live-drawer.js` (floating window, tabs, drag, Escape/outside-click close), `trading-panel.js` + `trading-panel-formatters.js`, `chat-panel.js`, `leaderboard.js` (Top 5 tab) |
| Events | `event-display.js` (`active_events` banner and indicators) |
| Setup / session | `setup-shell.js`, `setup-state.js`, `setup-payload.js` (shared with admin), `round-context.js`, `async-duration.js`, `async-session-state.js`, `async-diagnostics.js`, `setup-async-diagnostics.js`, `session-timers.js`, `debug-panel-manager.js` |
| Lobby helpers | `lobby-games.js`, `last-game-highscores.js`, `lobby-results.js` (history/results formatters and DOM builders), `lobby-results-dialog.js` ("My results" dialog controller), `lobby-account-data.js` ("Download my data" and "Delete account" dialog controller) |
| Shared | `micro-tooltip.js` (single tooltip contract), `badge.js`, `selection-persist.js`, `ui-update-state.js` |

## Dependency Rules

- `src/main.js`, `src/lobby.js` and `src/admin/*` are the only page roots;
  modules in `ui/`, `services/`, `meta/`, `utils/`, `config/` must not import
  them.
- `utils/` and `config/` import nothing from `ui/` or `services/`.
- Network calls belong in `services/` (and `meta/`); `ui/` modules render
  data they are given. Exceptions: `ui/chat-panel.js` owns its WebSocket and
  chat-ticket request, and the admin modules call the admin API directly.
- Rendering uses safe DOM APIs only (see [SECURITY.md](SECURITY.md)).
- Tunables come from `src/config/`; never hard-code them in UI or services.

Unused files, exports and dependencies are caught by `knip` (`npm run clean:audit`).

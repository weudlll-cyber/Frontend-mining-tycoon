# Changelog

All notable changes to the Mining Tycoon frontend. The backend has its own
changelog in the `Mining-tycoon` repository.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
No versions have been released yet; `package.json` is still `0.0.0`.

## [Unreleased]

### Added

- Account-based admin sign-in in the admin console (section 1 "Sign in as
  administrator": `POST /auth/login`, only accounts with `is_admin` are kept,
  Sign out via `POST /auth/logout`). Admin requests send `X-Admin-Token` when
  the token field is filled, otherwise the administrator session as
  `Authorization: Bearer`; token-only admin works exactly as before. The
  session is kept in `sessionStorage` (this tab only), re-checked with
  `/auth/me` on load, reused from the lobby when that account is an
  administrator, and cleared on sign out, expiry, 401 `ACCOUNT_AUTH_INVALID`
  and 403 `ADMIN_REQUIRED` with a clear message.
- Admin console section 12 "Administrators": account search with paging
  (`GET /admin/users`), "Make admin" / "Remove admin" with confirmation
  (`PATCH /admin/users/{id}`) and an explanation for 409 `LAST_ADMIN`.
- The lobby labels the link "Admin setup (you are an administrator)" for
  administrator accounts.
- Standings label for leaderboard values: the header (next to `Top`) and the
  Top 5 tab show `Live` while a sync round runs, `Provisional — the round is
  still open.` while an async round is open, and `Final` once the round is
  finished (from `game_status` in the state/stream payload and the round type
  from game meta). The header tag reserves its width, so the summary line does
  not shift (`src/ui/standings-status.js`).
- Accessibility: `prefers-reduced-motion` support on all pages (style.css,
  lobby.css, how-to-play.css); visible `:focus-visible` rings for buttons,
  links, inputs and tabs; the live tools window tabs follow the ARIA tabs
  pattern (roving tabindex, arrow keys / Home / End, labelled tab panels,
  focus moves into the window on open and back to the opener on close).
- Toasts now have styles (they were unstyled and ended up off-screen) and are
  announced through persistent live regions: info/success in a polite
  `role="status"` region, errors in an assertive `role="alert"` region
  (`src/ui/toast.js`).

- Farming Stage 1 (passive farming) in the UI. The Farm tab of the live tools
  window shows the round status ("Farming is not enabled for this round." when
  off), the rules (reward % per completed minimum duration, timer restart on
  deposit, no reward for an unfinished cycle, compounding, farmed tokens not
  spendable but scored) and one row per token with balance, farmed amount,
  cycles completed, a locally ticking next-reward countdown, an amount field
  and Deposit / Withdraw / Withdraw all (`POST .../farm/deposit` and
  `.../farm/withdraw`, same player-token header as trades). Buttons follow the
  play-window gate; backend errors (409 `FARMING_DISABLED`,
  `ACTION_NOT_ALLOWED_*`, 400 insufficient balance) are shown as toasts. The
  Farming pill in the action bar shows "Enabled (5% / 5m)" or "Not enabled".
  The Player State panel lists farmed tokens on a "Farmed" line and the
  action-bar holdings value includes them.
- Admin create form section 5 "Trading & Farming Rules": "Farming enabled",
  minimum duration (value + unit) and reward per cycle (%), with defaults and
  limits from Game Settings and a client check that the minimum duration is
  shorter than the round (sync) or session (async). Sent as
  `farming_enabled`, `farming_min_duration_seconds`, `farming_reward_rate`;
  section 7 lists it. Game Settings (section 11) gains a "Farming (Stage 1)"
  block for the defaults and limits (fallbacks: off, 300 s, 5 %; limits
  10 s..7 d and 0.01 %..100 %).

- Legal page templates `privacy.html` (GDPR-oriented privacy notice that
  describes what the software actually processes) and `imprint.html` (legal
  notice), with a "Template" banner and highlighted `[PLACEHOLDER]` markers for
  every operator-specific fact. Linked from a new lobby footer, the how-to-play
  footer and the Create account dialog ("By creating an account you agree to
  the privacy notice"); built by Vite and served by the deploy scripts. Not
  legal advice: operators must complete and review them before going live.
- Lobby account data protection: **Download my data** saves the
  `GET /auth/me/export` JSON as `mining-tycoon-account-export.json`, and
  **Delete account** opens a dialog (warning, password, confirmation checkbox)
  that calls `DELETE /auth/me` and clears the local session on success.
- Per-round options in the admin create form: optional "Conversion fee
  override (%)" and "Oracle spread override (%)" in section 5 (empty = global
  economy, current values as placeholders; sent as `conversion_fee_rate` /
  `oracle_spread` rates) and a "Chat enabled" checkbox in section 2 (default
  from the new Game Settings option "Chat enabled by default",
  `defaults.chat_enabled`). Section 7 lists all three.
- Player board: a round with `chat_enabled: false` keeps the Chat tab but shows
  "Chat is disabled for this round." and opens no WebSocket; a server
  `CHAT_DISABLED` chat error is handled the same way without reconnecting. The
  trading cost note shows the round's fee and oracle spread.

- "How to play" guide (`how-to-play.html`): a static page covering the goal
  and tokens, mining, upgrades, halvings, oracle prices, trading, sync/async
  rounds, scoring modes, events, the live tools window, accounts and farming
  (coming later). Linked from the lobby (same tab) and the player-board header
  (new tab); built by Vite and served by the deploy scripts.
- Admin console section 11 "Game Settings": admins edit duration presets
  (including short test presets), which presets are offered for sync rounds,
  async rounds and sessions, defaults, limits, the default trade-count table and
  trade unlock fractions at runtime. The create form reads them from `/meta`,
  with the old constants as fallback (#32).
- Admin console sections 9 "Global Economy" and 10 "Metrics", plus per-game
  Metrics and Reset actions (#28).
- Lobby "Change password" dialog (#28).
- Upgrade and trade buttons are disabled with a reason outside the play window
  (#28).
- Top-5 leaderboard tab in the floating live tools window (#19).
- Event banner for the backend `active_events` list, including several
  concurrent events (#19).
- Configurable backend URL at build time via `VITE_API_BASE_URL` (#19).
- Dependabot for npm and GitHub Actions (#21).
- `CHANGELOG.md`.

### Changed

- Refactor, no behavior change: `src/main.js` (2,590 lines) is now a thin
  composition root (~750 lines). Its responsibilities moved into player-board
  modules: `src/ui/board-dom.js`, `board-state.js`, `board-update.js`,
  `live-board-lifecycle.js`, `session-clock.js`, `game-over.js`,
  `start-flow.js`, `setup-controller.js`, `setup-settings.js`,
  `setup-host-controls.js`, `scoring-mode-ui.js`, `meta-debug.js`,
  `chat-preview.js` and `src/services/player-join.js`. The pure view-model
  helpers of `src/ui/trading-panel.js` moved to `trading-panel-model.js`. The
  board's duplicate scoring-mode normalization now reuses
  `trading-panel-formatters.js`. New unit tests cover the extracted modules.

- Colour contrast raised to WCAG AA (4.5:1) for status text and buttons on the
  player board: status green `#10b981` -> `#047857`, blue `#3b82f6` ->
  `#2563eb`, amber text `#f59e0b`/`#d97706`/`#c8960c` -> `#b45309`/`#a16207`,
  gray badge `#9ca3af` -> `#4b5563`, unread badges `#ef4444` -> `#dc2626`
  (hover shades darkened accordingly). Lobby disabled link text slightly
  brighter.
- Screen readers: the header countdown, the async "Round left" readout and
  the Top 5 table are no longer live regions (they changed every second);
  only the Phase badge announces changes. Decorative emoji in the header,
  season headings and the Chat / Top 5 buttons are hidden from assistive
  technology; the ⏱ countdown has a hidden "Time" label.
- Mobile (375 px): the live tools window never exceeds the viewport
  (`max-width: calc(100vw - 16px)`), its tabs wrap, and dragging keeps the
  header on screen; the player page blocks horizontal page scroll on phones;
  lobby panel headers wrap. Desktop layout unchanged.

- Privacy: the lobby fonts (Sora, Space Grotesk) are self-hosted via
  `@fontsource` (OFL-1.1) instead of Google Fonts, so no visitor IP reaches
  Google; the privacy template no longer needs a Google Fonts section.
- Privacy: the nginx frontend template logs the path without query string or
  referrer (`mining_frontend_noquery` log format).
- `main` is protected by the "Protect main" ruleset: pull request plus a green
  `CI Summary (Manual Merge Gate)` check (#31).
- Join names are mapped to the backend rules (1-24 letters, digits, spaces,
  `_ - .`), falling back to the username (#20).
- Chat matches the own messages by `player_id` (#20).
- SSE streams fetch a fresh ticket before every reconnect (#19).
- The lobby re-validates a stored login with `GET /auth/me` (#19).
- Backend 403/409/422 messages (password reset disabled, action window, invalid
  names, session time) are shown to the player (#19).
- Score formatting supports the efficiency mode (`1.2345×`) (#19).
- Deploy uploads only the built `dist/` and builds with the production API URL;
  new nginx template (#18).
- Tooling: vitest 5, eslint 10, globals 17, prettier 3.9 (#29); Node 24 and a
  full `npm audit` in CI (#16).
- All docs re-checked against the code; gate policy consolidated in
  `QUALITY_ENFORCEMENT.md` (#27, #30).

### Fixed

- The trading panel no longer replaces a 0 % round fee with the 2 % fallback.

- Admin "Advanced overrides" were silently ignored (wrong field names) (#19).
- Admin page rendered backend values with `innerHTML` (#19).
- The lobby dropped the `player_token` on join, which made `player.html`
  re-join as a new anonymous player when player auth is required (#19).
- The async-session probe sent a header rejected by CORS (#19).
- CI skipped every check for PRs touching only `player.html` or `admin.html`;
  dead `backend-ci` jobs removed; contract tests ran only 5 tests (#17).
- Flaky tests caused by async work logging after jsdom teardown (#17, #29).

### Removed

- Dead code: player-side game picker, legacy upgrade panel, `counter.js`,
  unused game-creation helpers, stray `console.log` calls (#19).

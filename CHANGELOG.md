# Changelog

All notable changes to the Mining Tycoon frontend. The backend has its own
changelog in the `Mining-tycoon` repository.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
No versions have been released yet; `package.json` is still `0.0.0`.

## [Unreleased]

### Added

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

# Changelog

All notable changes to the Mining Tycoon frontend. The backend has its own
changelog in the `Mining-tycoon` repository.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
No versions have been released yet; `package.json` is still `0.0.0`.

## [Unreleased]

### Added

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

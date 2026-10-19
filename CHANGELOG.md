# Changelog

All notable changes to the Mining Tycoon frontend. The backend has its own
changelog in the `Mining-tycoon` repository.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/); `0.x` releases are
pre-1.0 playtest builds.

## [Unreleased]

### Changed

- Privacy notice template (`privacy.html`) brought in line with the current
  backend: account emails (email confirmation link valid 48 h, password reset
  link valid 30 min, single use, stored only as hashes) and the SMTP provider
  as recipient; the exact nginx access-log fields (no query string, no
  referrer); administrator actions in the security log; chat mutes and chat
  clearing; bot opponents; hashed session and player tokens; the hourly
  retention cleanup; the browser storage list and the removal of player tokens
  on sign-out, password change, account deletion and an expired sign-in.
- Imprint template (`imprint.html`) names § 5 DDG and § 18(2) MStV; the
  outdated online dispute resolution example is replaced.
- New `docs/LEGAL_CHECKLIST.md`: every remaining placeholder of both pages with
  what to provide, an example and whether it is required, plus the open
  operator decisions.

## [0.2.0] - 2026-10-19

Playtest build: bot opponents, the full October 2026 audit (security
hardening, cleanup, structure) and the strict Content-Security-Policy.

### Fixed

- Board action bar at 1280×630 with an event banner: the bar wrapped into a
  second row and the board scrolled by ~30 px. The bar now stays on one row;
  the Trading/Farming values end with an ellipsis (full text as tooltip). The
  trading status no longer drops its ellipsis class and no longer repeats
  "Trading" ("Trading Trading: …"); its three copies are one function.

### Changed

- One duration formatter (`src/utils/duration-format.js`, clock / compact /
  long styles) replaces ten per-module copies; one `isPlainObject`,
  `isFiniteNumber`, `toFiniteNumber` and rate-percent formatter in
  `src/utils/value-utils.js`. Every visible label is unchanged.
- One `formatTokenName` (`src/utils/value-utils.js`) for token, upgrade and
  status names; the halving footer and countdown now say "Summer" like the
  rest of the board instead of "SUMMER".
- Player board: removed the always-hidden legacy host controls (round type,
  durations, scoring, trade count, advanced overrides; about 300 lines of
  `player.html`), `setup-host-controls.js` and their CSS. The round type now
  always comes from the round's meta; the join fields are unchanged.
- CSS: the admin console styles moved from an inline `<style>` block in
  `admin.html` to `src/admin.css` (imported by `admin-setup.js`); every
  `style=""` attribute of `admin.html` and `player.html` became a class or
  id rule. The BOT badge and last-game name rules live once in
  `src/shared.css` (board and lobby). `src/style.css` (about 3000 lines) is
  split by area into `src/styles/*.css` and imports them in the old order;
  the built CSS is byte-identical.
- Console noise: a failed admin game delete logs one clear `console.error`
  instead of a "[DELETE] Catch block error" stack dump; the meta-hash change
  note is a dev-only `debugLog`.
- Removed fallbacks for backend fields that the bundled backend always sends
  (verified in the backend code): the old single-event keys (`active_event`,
  `event_context.active_event`, `events.active`), the `status` key of
  `/games/active` items, the `token`/`session_token`/`login` auth keys, the
  404 path of `/auth/email-capabilities` and the aggregated `upgrade_levels`.
  Defensive handling of missing or malformed data stays.
- `initTradingPanel` (about 480 lines of closures) is split into module-level
  functions with an explicit panel state object; the lobby account forms
  (login, register, change password, logout) moved from `src/lobby.js` to
  `src/ui/lobby-auth-forms.js`. Behaviour is unchanged.
- Tests: shared helpers in `src/test-utils/` (`flush`, `okResponse`,
  `readRepoFile`, `readCssBundle`, the board and setup-flow fixtures) replace
  per-file copies; the trade-default check samples every boundary and a 61 s
  grid instead of looping over 691k seconds without `expect`.
- CI: third-party actions (`dorny/paths-filter`, `github/codeql-action`,
  `gitleaks/gitleaks-action`, `anchore/sbom-action`) are pinned to commit
  SHAs, `license-checker` to 25.0.1; `stable-tag` takes an optional
  `tag_message` input (generic default) and passes inputs via `env`; the
  unused `any` output of `detect-changes` is gone.
- Audit cleanup: removed dead code (unused helpers and exports, about 35 CSS
  rules of the old upgrade panel and status bar, admin theme rules that
  admin.html never loads, the Vite template `javascript.svg`); one shared
  `byId` / `clearNode` in `dom-utils.js` instead of 13 copies; knip now uses
  the Vite page entries.
- Lobby background: `seasonal-entertainment.webp` (49 KB) replaces the 636 KB
  PNG with the misspelled name.
- Accessibility: setup inputs have linked labels; the BOT badge is darker
  (AAA contrast) and announces its level to screen readers.
- CI: pushes run on `main` only (feature branches run once, as pull requests).
- `LICENSE`: all rights reserved (the repository is public for reading only);
  `.editorconfig`; docs refreshed to the current feature set.

### Security

- Content-Security-Policy: `style-src` no longer allows `'unsafe-inline'`;
  no page has inline styles any more (guarded by a test).
- Email confirmation links (`index.html?verify=`) no longer confirm on page
  load: the token is still removed from the address bar, and the lobby shows
  a "Confirm my email" button that sends it. Mail link scanners and
  prefetchers can no longer use up the one-time token.
- Production builds reject a plain `http://` backend URL override (lobby,
  board and admin console) unless it points to `localhost` / `127.0.0.1`.
- Logging out, changing the password, deleting the account or an expired
  sign-in now also removes the stored player tokens, so the next person on a
  shared device cannot act as this player in a round that is still running.
- Content-Security-Policy in the nginx template: scripts only from the site
  itself, network calls only to the site and the backend (`--api-origin`, passed
  by `scripts/deploy-to-vps.ps1`), no framing. The admin link gate of
  player.html moved from an inline script into `src/ui/admin-link-gate.js`.
- CI: the workflow is read-only by default; only the PR comment job may write.
- `.env` files (except `.env.example`) are gitignored.

### Added

- Bot opponents (backend `bots`): admin section 2 has "Bot opponents" (Easy,
  Medium, Hard counts; sync rounds only; limit from `/meta`
  `max_bots_per_round`) with a review row. Bots are always recognisable: a
  **BOT** badge (level in the tooltip) next to their "Bot ..." names in the Top
  5, the lobby's Last Game Highscores and Full results. Guide (English and
  German) explains the levels.

- Admin Game Settings: "Default favored season bonus" (`defaults.farming_favored_multiplier`,
  1-5); the round form takes its default from it. Older backends without the
  key keep ×2.

- Farming Stage 2 on the board (backend "the favored season pays more"): the
  Farm tab names the favored season token, marks its row ("×2 now"), counts
  down to the next change and labels the card "Stage 2 · Favored season"; the
  action-bar pill and rule summary mention the bonus. Admin section 2 adds
  "Favored season bonus (× reward)" (1-5, default 2) sent as
  `farming_favored_multiplier` and shown in the review. Guide (English and
  German) explains Stage 2; "Rotating farming" left the roadmap.

- "Buy several levels": a **×5** button next to each **Upgrade** button buys up
  to five levels at once, as many as the pay balance covers (backend `levels`
  on the upgrade endpoint; the limit comes from `/meta`
  `max_upgrade_levels_per_action`, the button is hidden without it). The toast
  names the levels bought ("to level 7 (+3)"). Guide (English and German)
  explains it.

- Game icon (`public/favicon.svg`, the "season gem": four facets in the season
  colors) on every page, replacing the default Vite logo. "A game icon" left
  the guide's roadmap (English and German).

## [0.1.0] - 2026-10-18

First tagged version: the complete game as built so far (lobby, accounts,
player board, admin console, how-to-play guide in English and German),
ready for playtests.

### Added

- Lobby password reset by email and email confirmation (backend email-link
  flow): "Forgot password?" asks for the username or email and requests a
  link; `?reset=<token>` opens "Choose a new password"; `?verify=<token>`
  confirms the address; an unconfirmed account sees a note with "Send the link
  again". Tokens are removed from the address bar at once. "Forgot password?"
  only appears when the backend can send email (`/auth/email-capabilities`).
  The guide (English and German) explains both; "Safer accounts" left the
  roadmap.

- Player board: 1-3 small dots under each upgrade name show that upgrade's
  profile in the current round (small steps, steady, big step), ranked by the
  per-level increment from the game's own meta; the name's tooltip gives the
  exact values and the upgrade button's label names the profile for screen
  readers. The lanes legend and the guide (English and German) explain the
  dots.

- Admin Global Economy (section 9): one profile per upgrade (increment per
  level, base cost, cost growth for Hashrate, Efficiency and Cooling) instead of
  one shared cost curve, plus a "Shuffle upgrade profiles per round" switch
  (backend per-upgrade profiles). The how-to-play guide (English and German)
  explains the three default profiles and that they are dealt out at random
  per round.

- German translation of the how-to-play guide (`how-to-play.de.html`),
  reachable through the guide's language switch (English / Deutsch). English
  stays the default page; labels of the game UI stay in English in both
  versions because the game itself is in English.

- Help for new players on the start screen: a "New to Mining Tycoon?" box at
  the top of the lobby sums up the game and links the guide and its roadmap.
  The how-to-play guide gains "The game in one minute" (the game principle in
  five steps) and "What's coming" (planned features, and what is not planned
  by design). The guide gets a language switch; English stays the default, and
  translations are added as separate pages listed in
  `src/config/guide-languages.js`.

- `scripts/dev_all_start.ps1` / `scripts/dev_all_stop.ps1`: start and stop
  the local backend (:8000) and frontend dev server (:5273) together, hidden in
  the background with log files, reusing servers that already run.
- Scheduled sync rounds (live events). Admin create form section 3: "Start
  now" (default) or "Schedule start" with a local date-time picker (time zone
  shown), client check >= now + 60 s and <= `scheduling.max_days_ahead` days
  (fallback 30), review row "Starts: <local date/time> (in 2 h 15 min)",
  `scheduled_start_at` (unix seconds UTC) on `POST /games`; hidden for async.
  Admin Game Settings: "Max days ahead for scheduled rounds"
  (`scheduling.max_days_ahead`, patched only when changed). Lobby: scheduled
  rounds listed under "Upcoming" with a "Scheduled" badge, local start time
  and a live "opens in ..." countdown; the join button is disabled ("Opens at
  HH:MM") and the list reloads when the countdown reaches 0; 409
  `JOIN_NOT_ALLOWED_SCHEDULED` is explained. Player board: status `scheduled`
  shows "Scheduled — opens at <time>" in the phase badge, header countdown and
  standings label, and the action gate keeps upgrades, trades and farming
  disabled ("The round has not opened yet."). Without the new backend fields
  everything behaves as before.
- Keyboard access: the lobby's open-games list is a listbox (roving
  tabindex, Arrow keys / Home / End move and select, Enter / Space select,
  visible focus, focus kept across the 10-second refresh); the player board's
  season focus strip (phones) supports Left / Right / Home / End like the
  live tools window tabs.
- Chat emoji picker: an emoji button next to the chat input opens a small
  inline, keyboard-operable picker inside the Chat tab (arrow keys / Home /
  End, Escape closes only the picker, emoji names as aria-labels) and inserts
  the emoji at the cursor. The list comes from `/meta` `chat_emoji`, with a
  built-in fallback for backends without it (`src/ui/chat-emoji-picker.js`).
- Chat moderation for players: `chat_error` `CHAT_MUTED` shows "You are muted
  in this round's chat (until HH:MM)." and disables the composer until
  `muted_until` (socket stays open, no reconnect); `chat_cleared` empties the
  message list and shows "Chat was cleared by an administrator.", also in the
  preview dock.
- Admin console section 13 "Chat Moderation", opened per game with the new
  "💬 Chat" action in Game Management: active mutes with Unmute, mute a player
  (picker from the game's leaderboard, player ID fallback) for 15 min / 1 h /
  24 h / until the round ends, and "Clear chat" with confirmation
  (`/admin/games/{id}/chat/mute|mutes|clear`, `src/admin/chat-moderation.js`).

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

- Event banner with several concurrent events: it stays one line high (the
  board must not grow and scroll) and shows one event at a time in full,
  with a counter ("Event 1/2"), rotating every 4 s; the rotation pauses while
  the pointer or keyboard focus is on the banner, and the tooltip still lists
  all events. Previously all events were joined on one line and everything
  after the first was cut off.
- Tooling: vite 7 → 8, jsdom 28 → 30, knip 6.40 → 6.41 (combines Dependabot
  #51-#53; no code changes needed). jsdom 30 requires Node >= 24.15.
- Lobby "Your data": a short explanation under Download my data / Delete
  account says what the export contains (profile, sign-ins and 90-day login
  history, rounds played, results; no passwords) and what deletion does.
- Lobby: while signed in, the sign-in form and "Create account" are hidden
  and a "Your account" panel shows "Signed in as <display name>
  (@username)" with My results, Change password, Logout and the "Your data"
  row; How to play and Admin setup moved below as plain links.
- Create account: the Discord handle is optional like the Telegram handle
  (field no longer `required`, labelled "(optional)"); blank handles are sent
  as `null`. Needs backend support (Mining-tycoon PR "optional Discord
  handle"); older backends still require it.
- Local dev ports moved off Vite's defaults: dev server 5273 (was 5173),
  `npm run preview` 4273 (was 4173), both `strictPort`, so the project can run
  next to other Vite projects. The backend stays on 8000.
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

- Trade window: clicking **Execute Trade** right after typing an amount did
  nothing. Leaving the amount field (or a live update arriving during the
  click) rebuilt the panel between mouse down and click, so the browser dropped
  the click. While a press inside the panel is in progress, or the Execute
  button has keyboard focus, the panel now updates in place. Found by the new
  browser end-to-end test.

- Quick repeated upgrades no longer report the same level in every toast: the
  toast now shows the level confirmed in the upgrade response, and the response
  state is applied to the season cards right away instead of on the next stream
  tick. At most two toasts are visible per region, so they no longer pile up
  over the board.

- Player board scrolled on low windows (1366x768 laptops, 1920x1080 at
  150 % Windows scaling = about 1280x630 CSS px): the bottom upgrade rows were
  cut and the action bar (Trade/Farm/Chat/Top 5) was off screen. The desktop
  board is now bound to the window height and a compact mode for windows up
  to 760 px high reduces spacing (not font sizes). Verified in Chrome at
  1920x947, 1600x767, 1536x731 (125 %), 1366x635 and 1280x630 (150 %), with
  and without the event banner: no page scroll and nothing hidden.
- Event banner: it added another line on almost every live update (the
  banner tooltip lives in the shared tooltip layer; when that bubble was
  detached, the banner was rebuilt by appending a second content line). The
  rebuild now clears the banner first.
- Event banner countdown jumped once per sim month (e.g. every 8 s). The
  remaining time is now computed from the round's own clock (round duration
  minus remaining run time, or the session clock for async sessions) and the
  round's sim-month rate, so it counts down per second for any round length.
- Random pre-push failures under CPU load: tests that freshly import
  `src/main.js` hit Vitest's 5 s default timeout; `testTimeout`/`hookTimeout`
  are now 30 s (`vitest.config.js`).
- `dev_frontend_stop.ps1` refused to stop a server started by
  `dev_frontend_start.ps1` (the tracked `cmd.exe /c npm run dev` wrapper did
  not match its `vite` check) and only terminated the wrapper, leaving vite on
  the port; it now accepts the wrapper, kills the whole process tree and stops
  a leftover vite listener of this project. `dev_frontend_start.ps1` starts the
  server hidden.
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

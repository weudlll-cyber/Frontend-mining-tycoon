# Manual Test Runbook

End-to-end manual checks for the current frontend: lobby, player board, async
sessions, game over and the admin console. Last rewritten 2026-10-07 against
`main` (after PRs #16-#19).

Use it before a release, after larger UI changes, and for playtests (section 8).
Automated gates are described in [QUALITY_ENFORCEMENT.md](QUALITY_ENFORCEMENT.md).

---

## 0. Setup

Backend (sibling repo, PowerShell):

```powershell
Set-Location "..\Mining tycoon"
& .\scripts\dev_start.ps1
Invoke-RestMethod -Uri "http://127.0.0.1:8000/status" -Method GET
```

Optional backend switches (set before starting the backend; see the backend
`README.md` for the full list):

- `REQUIRE_ADMIN_FOR_GAME_CREATE=true` and `ADMIN_TOKEN=<local test token>` to test admin enforcement.
- `REQUIRE_PLAYER_AUTH=1` to test player tokens and SSE tickets.
- `ALLOW_UNVERIFIED_PASSWORD_RESET=true` only if you want to test the dev-only reset path (default: disabled).

Frontend:

```powershell
Set-Location "..\frontend mining tycoon"
& .\scripts\dev_frontend_start.ps1   # or: npm run dev
```

Pages: `http://127.0.0.1:5173/` (lobby), `/player.html` (player board, opened
from the lobby), `/admin.html` (admin console). Use two browsers or a private
window to play with two accounts.

---

## 1. Admin Console (`admin.html`)

1. Open `/admin.html`. The amber banner reads "Admin Setup - round configuration is snapshot-locked at creation".
2. Verify **13 sections**: 1 Connection, 2 Round Type, 3 Time Configuration, 4 Scoring Mode, 5 Trading & Farming Rules, 6 Advanced Overrides (optional), 7 Review & Create, 8 Game Management, 9 Global Economy, 10 Metrics, 11 Game Settings, 12 Administrators, 13 Chat Moderation.
3. Defaults come from the backend game config (`GET /meta` -> `game_config`). Section 2 shows the source: "backend Game Settings vN (hash)" or, with an older backend, "built-in fallback". Built-in fallback / shipped backend defaults: Backend URL = stored URL or `VITE_API_BASE_URL` default; round type Sync; enrollment window 10 s; sync round 5m; async round 30m; async session 5m; scoring Stockpile.
4. Sync presets include `1m` (short test preset), `3h` and `Custom...`. Async round presets: 1m, 5m, 10m, 15m, 30m, 1h, 3h, 6h, 12h, 1d, 3d, 7d. Session presets: 1m, 5m, 10m, 30m, 1h, 6h, 12h, 1d; a session longer than the round is clamped. (These lists change when an admin edits Game Settings.)
5. **Trade schedule:** set Sync, round 30m, trade count 3. The preview shows `Trade 1: unlocks at 6m`, `Trade 2: ... 14m`, `Trade 3: ... 22m` (first unlock at 20 %, then evenly over the remaining 80 %). Changing the duration (or round type) resets the count to that duration's default (30m -> 2), so set the count last. In Async mode the preview is computed from the **session** duration and says "per session".
6. **Create a sync round:** keep the defaults, click "Create Round". The result box shows "Round created successfully.", the Game ID and the lobby URL. No HTML from the server is rendered.
7. **Create an async round:** Async, round 30m, session 5m, scoring Power. Review & Create shows these values; create succeeds.
8. **Advanced overrides:** set anchor token / tokens per second / season cycles, create a round, and confirm in the player board's Debug panel (or `/games/{id}/meta`) that the values were applied.
9. **Permission (if enforcement is on):** empty or wrong Admin Token -> inline red error, no modal. Correct token -> success.
   **Administrator sign-in (backend with admin accounts):** leave the Admin Token empty. Sign in with a non-admin account -> "This account is not an administrator.", still signed out. Sign in with an admin account -> "Signed in as <name> (administrator)", the form is replaced by "Sign out", the game list reloads, and creating a round, Global Economy, Metrics and Game Settings work without the token (DevTools: requests carry `Authorization: Bearer`, no `X-Admin-Token`). Fill the token field: requests switch to `X-Admin-Token`. Reload the tab: still signed in (sessionStorage). Revoke or expire the session on the backend and click a load button -> "Your administrator session has expired. Please sign in again." and the sign-in form returns. "Sign out" -> "Signed out.". With an older backend (no `is_admin`) the token flow is unchanged.
   **Lobby reuse:** sign in to the lobby with an admin account (link reads "Admin setup (you are an administrator)"), open the link: section 1 shows "... (using your lobby sign-in)". A non-admin lobby account shows the plain link and the console stays signed out.
   **Administrators (section 12):** without credentials the section is disabled with a hint. Signed in: Search with an empty box lists accounts (20 per page, Previous/Next with "1–20 of N"); a search term narrows the list. "Make admin" asks for confirmation and the row then shows Admin = Yes; "Remove admin" on the only administrator shows "This is the last administrator. Make another account an administrator first.". Removing your own rights signs the console out.
10. **Game Management:** "Refresh Game List" shows only enrolling/running games with ID, status, Sync/Async, time remaining (enrolling: enrollment time left; running: run time left) and player count. "Delete" asks for confirmation, deletes the game and refreshes the list. "📊 Metrics" shows that game's counters. "♻ Reset" asks for confirmation, clones the game (same settings) and shows the new Game ID.
    **Chat moderation (section 13):** "💬 Chat" on a game row opens section 13 for that game ("Game N chat"): active mutes (player, ID, "Muted until" date/time or "Until the round ends", Unmute), the mute form (player picker filled from `/games/{id}/leaderboard`; a player ID box when the game has no players) with 15 minutes / 1 hour / 24 hours / Until the round ends, and "🧹 Clear chat". Mute a player for 15 minutes: `POST /admin/games/{id}/chat/mute` `{"player_id": N, "minutes": 15}`, the result says "Player N muted until <time>." and the list shows the mute. In that player's Chat tab, sending a message shows "You are muted in this round's chat (until HH:MM)." under the list, the input, Send and emoji button are disabled, the status stays "Online" (no reconnect, the DevTools WS connection stays open); at HH:MM the composer works again. "Unmute" removes the mute (`DELETE .../chat/mute/{player_id}`). "Clear chat" asks for confirmation; after OK every player's message list is replaced by "Chat was cleared by an administrator." and the preview dock shows the same text; Cancel sends nothing. Against a backend without these endpoints, section 13 shows the backend error (e.g. "Could not load mutes for game N: Not Found").
11. **Global Economy:** "Load" shows the current values, version and snapshot hash. Change one value and save: only the changed field is sent, the version increases, and a newly created game uses the new value while existing games keep their snapshot. Invalid input shows the backend message inline.
12. **Metrics:** the summary shows total games and games per status.
    **Round options:** section 5 shows "Conversion fee override (%)" and "Oracle spread override (%)" with the global values as placeholders (from `/meta`; after "Load" in section 9 from the Global Economy values). Enter fee `0.5` and spread `0`, untick "Chat enabled" in section 2: section 7 lists `Conversion fee 0.5% (override)`, `Oracle spread 0% (override)`, `Chat Disabled`. Create the round and check `/games/{id}/meta`: `conversion_fee_rate` 0.005, `oracle_spread` 0, `chat_enabled` false. A fee of `-1` or `100` shows an inline error and sends no request. Leaving the fields empty and the box at its default sends none of the three fields.
    **Farming options (Stage 1):** section 5 shows "Farming enabled" (unticked by default), "Farming minimum duration" (5 minutes) and "Reward per completed cycle (%)" (5) with the limits in the note; the value fields are greyed out while the box is unticked and section 7 says `Farming Disabled` (no farming field is sent). Tick it, set 1 minute and 10 %: section 7 shows `Enabled: 10% per 1m cycle`; create a sync 5m round and check `/games/{id}/meta`: `farming` = `{enabled: true, min_duration_seconds: 60, reward_rate: 0.1}`. A minimum duration of 5 minutes in a 5m sync round (or an async round with a 5m session), 5 seconds or a reward of 200 % shows an inline error and sends no request.
13. **Game Settings:** "Chat enabled by default" mirrors `defaults.chat_enabled` (ticked when the backend has no value); changing it and saving sends only `defaults.chat_enabled`, and the "Chat enabled" box in section 2 follows. "Load game settings" shows version, hash and update time plus all editors. Add a preset `2m` = 120 s, tick it for "Sync round duration", choose it as default sync round duration and save: the result names the changed keys (`duration_presets`, `sync_round_preset_ids`, `defaults`), the version increases, and sections 2-5 re-render (Round Duration now offers and preselects 2m). Create a 2m sync round; it runs 2 minutes. Existing rounds are unchanged. Unticking every preset of a list, an empty preset id or a non-number shows an inline error without a request; a value the backend rejects (for example trade count max 99) shows the backend message inline. Reload the page: section 2 still shows the new version (from `/meta`). **Farming (Stage 1)** shows the farming defaults (fallback off / 300 s / 5 %) and limits (10..604800 s, 0.01..100 %); tick "Farming enabled by default", set the default reward to 7 and save: only `defaults.farming_enabled` and `defaults.farming_reward_rate` (0.07) are sent and section 5 follows. A default outside the limits shows an inline error without a request.
14. **Scheduled start (sync, backend with scheduling):** section 3 shows "Start" with **Start now** (selected) and **Schedule start**; with Async selected the whole Start block is hidden. Choose **Schedule start**: a date-time picker appears with "Your time zone: <zone> (UTC+hh:mm)". An empty or past time shows a red hint and "Create Round" fails with "The scheduled start must be at least 1 minute in the future." (no request is sent); a time beyond the limit fails with "... at most 30 days ahead.". Pick a time ~10 minutes ahead: section 7 shows "Starts: <local date/time> (in 10 min)" (Start now: "Starts: Now (enrollment opens on creation)"), create succeeds, the result repeats "Scheduled start: ..." and `GET /games/{id}/meta` reports `status: scheduled` with the matching `scheduled_start_at` (unix seconds UTC). With an older backend, Start now behaves exactly as before.
15. **Max days ahead:** section 11 "Scheduled rounds" shows "Max days ahead for scheduled rounds" (30 when the backend has no `scheduling`). Saving unchanged sends nothing; changing it to 2 sends only `{"scheduling": {"max_days_ahead": 2}}`, and the create form then rejects a scheduled start 3 days ahead.

---

## 2. Lobby (`index.html`)

1. **Register:** "Create account" opens a dialog with username, display name, email, Discord handle (required), Telegram handle (optional), password and confirmation. Passwords need at least 12 characters with upper and lower case, a digit and a special character. A weak password or duplicate username shows the backend message in the dialog. Success signs you in.
2. **Login / logout:** sign in; the account summary shows your name and "Logout" becomes enabled. Logout clears the local session even if the backend is unreachable.
3. **Change password:** signed in, "Change password" opens a dialog. A mismatched confirmation is rejected locally; a weak new password shows the backend rule; a valid change signs you out and asks you to sign in with the new password.
4. **Session check:** reload the page while signed in. The lobby calls `GET /auth/me`; a valid token keeps you signed in. Invalidate the token (log out in another tab or restart the backend with a fresh DB) and reload: the lobby clears the session and asks you to sign in.
5. **Forgot password (default backend):** "Forgot password?" opens a dialog. Submitting shows "Password reset is not available. Please contact an administrator." (or the server's message) **inside the dialog**; the dialog stays open. With `ALLOW_UNVERIFIED_PASSWORD_RESET=true` a valid reset closes the dialog and shows a success message.
6. **Open games:** the list shows enrolling games and running async games with a status badge and remaining time. Running sync games are not listed, and running async games are hidden when the session is not shorter than the remaining round time. The list refreshes every 10 s and when the tab becomes visible again.
7. **Join:** "Enter game" is disabled until you are signed in and have selected a game. Clicking it joins and opens `player.html?autostart=1`. The join name is your display name, or a cleaned/shortened version (1-24 letters, digits, spaces, `_ - .`), falling back to your username.
8. **Last Game Highscores:** after a finished game (section 5), the lobby shows that game's Top 5. Signed in, it comes from the server (newest entry of "My results"), so it matches on any device; signed out it shows the snapshot stored in this browser.
9. **Rejoin:** join a running async round (or an enrolling sync round), go back to the lobby. The game is marked "You joined" and selecting it turns the button into **Rejoin**. Rejoining opens the board with the **same** player ID (Debug panel) and the leaderboard has no second row for you. Running sync rounds you already play in are listed too.
10. **Stale token:** sign in, then invalidate the session on the backend (log out in another tab) and click Enter game/Rejoin: the lobby signs you out ("session has expired") and asks you to sign in again.
11. **My results:** signed out the button is disabled. Signed in with no finished rounds it shows "No finished rounds yet.". After finished rounds it lists date, round type, scoring mode, rank / participants, score and name (newest first); with more than 20 rounds **Load more** appends the next page and disappears at the end. Efficiency scores show 4 decimals and a `×`.
12. **Full results:** "Full results" on a history row shows the complete final leaderboard with your row highlighted; "Back to my results" returns to the list. Hostile player names render as plain text.
13. **Require sign-in (admin section 11):** tick "Require sign-in to join" and save. Joining from `player.html` without a stored account (clear localStorage, enter the Game ID, Start Game) shows the backend `ACCOUNT_REQUIRED` message; signed-in lobby joins still work. Untick and save to restore.
14. **Download my data:** signed out, "Download my data" and "Delete account" are disabled. Signed in, "Download my data" saves `mining-tycoon-account-export.json`; open it and check it contains your account data (and no password hash). With an invalidated session (log out in another tab) the lobby signs you out ("session has expired"). Against a backend without the endpoint the status line shows the backend message (for example "Not Found").
15. **Delete account:** signed in, "Delete account" opens a dialog with the warning (account, sessions, login history; names in past results become "Deleted player"; cannot be undone). "Delete account" stays disabled until the checkbox is ticked. A wrong password shows "Password is incorrect." in the dialog and keeps it open; repeated attempts eventually show the rate-limit message. The correct password closes the dialog, signs you out and shows "Your account has been deleted."; signing in with that account fails afterwards, and "Full results" of a round you played shows "Deleted player" for your row. Escape or Cancel closes the dialog without a request.
16. **How to play:** the "How to play" link opens `how-to-play.html` in the same tab. Check: the table of contents jumps to each section, "Back to the lobby" returns, the page reads well at desktop width and on a phone (no sideways page scroll; tables scroll inside their box), and the rules still match the current game (upgrade increments and costs, halving order, trade schedule, scoring modes, event kinds).
17. **Legal pages:** the lobby footer links **Privacy** (`privacy.html`) and **Imprint** (`imprint.html`); the Create account dialog shows "By creating an account you agree to the privacy notice" (the link opens a new tab). Check: both pages show the template banner until the operator has completed them, read well on desktop and phone, and their footers link each other and the lobby.
18. **Upcoming (scheduled rounds):** with a round scheduled ~3 minutes ahead (admin step 14), the lobby lists it below an "Upcoming" divider after the joinable games, with a **Scheduled** badge, "Starts <local date, time>" and a countdown "opens in 2 min" that ticks down (seconds in the last minute). Selecting it shows "It opens at ...; you can join then." and the button reads **Opens at HH:MM** (disabled). At 0 the list reloads and the round appears as Enrolling and can be joined. Race check: select the round just before it opens and join through a stale list (or call the join endpoint): the lobby shows "This round has not opened yet. It opens at <time>." and reloads.
19. **Keyboard (open games):** Tab into the list: focus lands on the selected (or first) game with a visible ring. Arrow Down/Up (and Right/Left) move between games and select them (the message and the button update), Home/End jump to the first/last game, Enter/Space select the focused game. Wait for the 10-second refresh: focus stays on the same game. Mouse clicks behave as before.

---

## 3. Player Board (`player.html`, sync round)

Join an enrolling sync round from the lobby.

1. **Autostart:** the board connects without further clicks; the setup panel ("Join Round": Backend URL, Player Name, Game ID, Player ID, Start Game / Stop Stream) collapses. No round-type, scoring or trade controls are visible to players.
2. **Header:** countdown, Phase badge, Score, Rank, Top, scoring mode (for example "Scoring: Stockpile Mode"), connection badge. Debug toggle shows meta hash, backend URL and IDs inline. "How to play" opens the guide in a new tab; the board keeps running and the page still does not scroll.
3. **Enrollment:** during enrolling, the upgrade buttons and "Execute Trade" are disabled with a short reason. If a request still reaches the backend, the toast shows its `detail` (409 `ACTION_NOT_ALLOWED_GAME_NOT_RUNNING`).
4. **Season cards (2x2):** each shows Balance, Output and Halving countdown (ticking every second, selectable text) and three inline upgrade lanes (Hashrate, Efficiency, Cooling) with columns `Upgrade | Lvl | Cost | Pay | Out/s | BEP`. Change `Pay` to another token, upgrade, and confirm the balances follow the backend result. The selected pay token survives live updates.
5. **Player State panel:** read-only matrix (Out/s, Bal, Price per token and total), footer with next halving, cumulative mined, and fee/spread. Large values use k/M/B with the exact value in the tooltip. Tooltips open on hover/focus/tap and close on leave or Escape.
6. **Halving:** when a token halves, its output drops accordingly and the halving countdown moves to the next checkpoint (or "No further halvings").
7. **Events:** when the backend has an active event, a one-line banner above the season grid lists it (label, effect, remaining time); several events are listed together. ⚡ markers appear only on affected values (only on the event's token if it is token-scoped). No banner when no event is active.
8. **Action bar:** score context value, Trading and Farming status pills (always visible), buttons `Trade`, `Farm`, `Chat`, `Top 5`, and the chat preview dock with unread badge.
9. **Live tools window:** each button opens the floating window on its tab. Verify: no backdrop and the board stays usable; drag it by its header and resize it; Escape closes it; a click outside closes it; tabs switch without closing.
   - **Trade:** "Trades used", "Next trade" (countdown or "Available now"), the full schedule, From/To token, amount, balances, conversion cost and the mode-specific net effect. "Execute Trade" is disabled with a reason when trading is off, no slots remain, the next slot is locked, tokens are equal, the amount is 0 or exceeds the balance. A successful trade updates balances; a 409 shows the backend `detail`.
   - **Farm:** in a round without farming (or with an older backend) the tab says "Farming is not enabled for this round." and the Farming pill "Not enabled". In a round created with farming (for example 1 minute, 10 %): the pill reads "Enabled (10% / 1m)", the tab shows the rule summary and one row per token (Balance, Farmed, Cycles, Next reward). During enrolling (or async without a session) the buttons are disabled with "Farming opens when the round starts." / "Start a session to deposit or withdraw.". While running: deposit 10 Spring -> balance -10, Farmed 10, Next reward counts down from 1m every second; after the cycle the backend adds 10 % (Cycles 1, Farmed 11) and the next cycle starts. A second deposit restarts the countdown. "Withdraw" with an amount above the farmed amount stays disabled; "Withdraw all" before the cycle ends returns the farmed amount without the unfinished reward. The Player State panel shows "Farmed (not spendable): SPR ..." and the action-bar holdings value includes farmed tokens. Errors from the backend (for example 400 insufficient balance) appear as a toast with the backend message.
   - **Chat:** send a message from two accounts; both see it with server-assigned user and time. The list scrolls internally; the preview dock and unread badge update while the window is closed. In a round created with "Chat enabled" unticked, the Chat tab stays visible but shows "Chat is disabled for this round.", the status reads "Disabled", the preview dock shows the same text and the browser opens no `/ws/chat` connection (DevTools Network -> WS); no reconnect attempts appear.
   - **Emoji picker:** the 😀 button left of the input opens a grid of emoji inside the chat panel (no overlay). With a backend that sends `chat_emoji` in `/meta` the grid shows that list, otherwise a built-in list of 24. Clicking an emoji inserts it at the cursor (also in the middle of the text) and focuses the input. Keyboard: Tab to the button, Enter opens the grid and focuses the first emoji, arrow keys / Home / End move, Enter inserts, Escape closes the grid (the live tools window stays open) and focus returns to the button; screen readers announce emoji names (e.g. "thumbs up"). The button is disabled while chat is offline or muted.
   - **Round fee/spread:** in a round with overrides (see the admin round options check) the Trade tab's cost note shows the round's fee and spread, and the Trading pill shows the round fee (a 0 % override reads `0.0% fee`).
   - **Top 5:** live ranking with scores; in Efficiency rounds scores look like `1.2345×`, otherwise integers. A line above the table reads "Live — standings update while the round runs." in a running sync round and "Final — the round is finished." after it ends; in an async round it reads "Provisional — the round is still open." until the round ends. The header shows the same short label (`Live` / `Provisional` / `Final`) next to `Top`; the header line does not shift when it appears or changes.
10. **Layout:** at 1440x900 the page does not scroll; only the setup panel, season list and window contents scroll internally. Below 768 px a season strip shows one season card at a time.
11. **Reconnect:** stop and restart the backend briefly; the connection badge shows the reconnect and the stream resumes with a fresh ticket (no manual reload).
12. **Scheduled round on the board:** open `player.html?autostart=1` with the stored Game ID of a round that is still scheduled (or keep the board open on a payload with `game_status: scheduled`): the Phase badge reads "Scheduled — opens at HH:MM", the header shows "Round opens at" with the local time, the standings label reads "Scheduled" (tooltip / Top 5 note "Scheduled — opens at <date, time>."), an info toast says "This round has not opened yet.", and upgrade/trade/farm buttons are disabled with "The round has not opened yet.".

---

## 3a. Accessibility and Mobile Checks

Run on the player board (`player.html`), the lobby and the how-to-play,
privacy and imprint pages.

1. **Keyboard focus:** Tab through each page. Every button, link, input, select and tab shows a clearly visible focus ring (blue on the board, amber on the lobby/guide pages); nothing is focused invisibly.
2. **Live tools window by keyboard:** focus `Trade` in the action bar and press Enter: the window opens and focus lands on the active tab. Arrow Right/Left, Home and End move between Trade / Farm / Chat / Top 5 and switch the panel; Tab moves from the active tab into the panel (other tabs are skipped). Escape closes the window and focus returns to the `Trade` button.
   **Season focus strip (phone width, below 768 px):** Tab reaches only the active season tab; Arrow Right/Left (wrapping), Home and End switch the visible season card and move focus with it.
3. **Reduced motion:** enable "reduce motion" (Windows: Settings -> Accessibility -> Visual effects -> Animation effects off; macOS: Accessibility -> Display -> Reduce motion; or DevTools -> Rendering -> Emulate `prefers-reduced-motion: reduce`). Toasts appear and disappear without fading/sliding, buttons do not lift on hover, lobby list rows do not slide, and "Jump to Live Board" jumps without smooth scrolling.
4. **Screen reader (NVDA / VoiceOver):** a toast such as a join error is read immediately (assertive), info toasts are read politely; the header countdown and the Top 5 table are NOT read every second; the Phase badge is read when it changes. Emoji in headings and buttons (⛏️, 🌱, 💬, 🏆, ⏱) are not read out; the ⏱ countdown is announced as "Time".
5. **Contrast spot check:** badges (Phase, Conn, Scoring), green/amber upgrade metrics and the blue upgrade buttons are readable; DevTools -> Inspect -> contrast shows >= 4.5 for text.
6. **Mobile (375 px, DevTools device toolbar, e.g. iPhone SE):**
   - player board: no horizontal page scroll; the page scrolls vertically; one season card at a time.
   - open the live tools window: it fits the screen width (8 px margin each side), tabs and Close wrap instead of overflowing; dragging it far to a corner keeps the header on screen.
   - lobby: panels stack, the open-games header buttons wrap, dialogs fit the screen, no horizontal scroll.
   - desktop (1440x900) still has no page scroll (section 3, step 10).

---

## 4. Async Session Flow

Create an async round (round 30m, session 5m) in the admin console.

1. Join it from the lobby. Autostart starts a session: the header shows `Async: Session Active` and a "Session Left" countdown; the stream uses `/sessions/{id}/stream`.
2. Player State shows `This session` and `Best this round` (hidden in sync rounds).
3. Trades unlock relative to the **session** start. Example: create the round with trade count 2 (the default for a 5m session is 0); the trades unlock 1m and 3m after the session starts.
4. When the session ends, the `Session Finished` overlay appears; a click returns to the lobby.
5. Join the same round again from the lobby while enough round time remains. The new session starts from the same baseline balances and upgrades.
   - The lobby shows **Rejoin** for this round, and the backend returns your existing player (same player ID): the leaderboard keeps one row for you and `Best this round` keeps the best of both sessions. (With an older backend that does not link accounts, a second row appears instead.)
6. Join an async round whose remaining time is shorter than the session: it is not listed in the lobby (unless you already joined it, then it stays listed for Rejoin); forcing it (for example via `player.html` with the Game ID) shows the backend 409 (`SESSION_ASYNC_INSUFFICIENT_TIME`) inline.

---

## 5. Game Over

1. Let a sync round finish while the board is open. A full-screen `Game Over` overlay says the round finished; it is the only full-screen overlay and appears only after play has ended.
2. Click it (or press Enter/Space): the board resets and the browser returns to the lobby, which now shows "Last Game Highscores" for that round.
3. Finish another round and click **View full results** on the overlay instead: the lobby opens the full results dialog for that round with your row highlighted, and the URL loses its `?results=` query (a reload does not reopen it).
4. Async: when your session ends while the round still runs, the overlay notes "Final results are available when the round ends."; the link opens the lobby, which shows the same note (backend `409 GAME_NOT_FINISHED`). After the round ends the link/history show the final leaderboard.
5. Upgrades sent after the end are rejected by the backend (409).

---

## 6. Security and Robustness Spot Checks

1. Register a display name like `<img src=x onerror=alert(1)>` and send the same text in chat: it renders as plain text everywhere (lobby, Top 5, chat, admin list).
2. With `REQUIRE_PLAYER_AUTH=1`: joining from the lobby stores the player token; upgrades, trades, chat and the stream work without re-joining.
3. Set a bogus Backend URL (for example `javascript:alert(1)`) in the player or admin URL field: it is rejected.

---

## 7. Backend Permission Checks (optional, enforcement on)

```bash
curl -X POST http://127.0.0.1:8000/games -H "Content-Type: application/json" \
  -d '{"duration_mode":"preset","duration_preset":"5m"}'
# expect 403 (no token)

curl -X POST http://127.0.0.1:8000/games -H "Content-Type: application/json" \
  -H "X-Admin-Token: <local test token>" \
  -d '{"duration_mode":"preset","duration_preset":"5m","enrollment_window_seconds":30,"scoring_mode":"stockpile"}'
# expect 200 with a game_id

curl -X POST http://127.0.0.1:8000/games/<game-id>/join -H "Content-Type: application/json" \
  -d '{"name":"TestPlayer"}'
# expect 200; joining never needs the admin token
```

---

## 8. Mining Validation Playtest Checklist

Use this to validate mining balance (moved here from `README.md`).

### Session setup

1. Start backend and frontend (section 0); create a Sync round in the admin console and join it from the lobby.
2. Record in a notes table: time, SPR/SUM/AUT/WIN balances, Out/s per token, total Out/s, score (note the scoring mode).

### Output pace

3. Wait 60 seconds without upgrades and record the same values.
4. Confirm each balance grew in line with its Out/s.
5. Repeat once more; growth stays monotonic (no unexpected drops or resets).

### Upgrade value and cost

6. Buy one Hashrate upgrade on one season card; record level, Out/s, cost and the balance change.
7. Repeat for Efficiency and Cooling on the same token.
8. Confirm each upgrade raises production as expected and costs rise per level.
9. Pay with another token once and confirm the backend-authoritative cost and balances.

### Halving

10. Use a round where a halving happens during the session.
11. Record halving countdown, token Out/s and cumulative mined right before and after the halving.
12. Confirm the timing matches the countdown and output drops as expected.

### Pass criteria

13. PASS only if: no non-monotonic mining under stable conditions, coherent upgrade gains and cost progression, correct halving timing and effect, and no frontend/backend desync in displayed authoritative values.

---

## 9. Summary Checklist

- [ ] Admin console: 13 sections, defaults (backend game config), trade preview (30m/3 -> 6/14/22 min), sync + async create, overrides applied, round options (fee/spread overrides, chat enabled), game list + metrics/chat/reset/delete, chat moderation (mute/unmute/clear), global economy edit, metrics summary, game settings edit (2m test preset, chat default)
- [ ] Lobby: register, login, change password, logout, `/auth/me` re-check, forgot-password disabled message, open-games filter + 10 s refresh, join, rejoin (same player), My results + Load more, Full results highlight, require sign-in, download my data, delete account
- [ ] Player board: autostart, no host controls, season cards + upgrades, analytics, halving, events banner
- [ ] Live tools window: Trade / Farm / Chat / Top 5, drag, Escape and outside-click close, board stays usable; a chat-disabled round shows the disabled note and opens no WebSocket; emoji picker by mouse and keyboard; muted note and cleared notice
- [ ] Standings label: Live (sync running) / Provisional (async open) / Final (finished) in header and Top 5
- [ ] Scheduled rounds: admin Schedule start (local time, zone hint, limits, review row), Max days ahead setting, lobby Upcoming + countdown + "Opens at HH:MM" + reload at 0, board "Scheduled — opens at" with actions disabled
- [ ] Keyboard: lobby open-games list (arrows / Home / End / Enter / Space, focus kept on refresh), season focus strip arrows
- [ ] Accessibility and mobile (section 3a): focus rings, keyboard tabs, reduced motion, screen-reader announcements, 375 px without horizontal scroll
- [ ] Async: session start, session countdown, This session / Best this round, Session Finished -> lobby
- [ ] Game Over overlay -> lobby -> Last Game Highscores; View full results -> lobby results dialog
- [ ] Safe rendering of hostile names/messages
- [ ] Gates in `QUALITY_ENFORCEMENT.md` green

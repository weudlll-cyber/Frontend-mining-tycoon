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
2. Verify **11 sections**: 1 Connection, 2 Round Type, 3 Time Configuration, 4 Scoring Mode, 5 Trading Rules, 6 Advanced Overrides (optional), 7 Review & Create, 8 Game Management, 9 Global Economy, 10 Metrics, 11 Game Settings.
3. Defaults come from the backend game config (`GET /meta` -> `game_config`). Section 2 shows the source: "backend Game Settings vN (hash)" or, with an older backend, "built-in fallback". Built-in fallback / shipped backend defaults: Backend URL = stored URL or `VITE_API_BASE_URL` default; round type Sync; enrollment window 10 s; sync round 5m; async round 30m; async session 5m; scoring Stockpile.
4. Sync presets include `1m` (short test preset), `3h` and `Custom...`. Async round presets: 1m, 5m, 10m, 15m, 30m, 1h, 3h, 6h, 12h, 1d, 3d, 7d. Session presets: 1m, 5m, 10m, 30m, 1h, 6h, 12h, 1d; a session longer than the round is clamped. (These lists change when an admin edits Game Settings.)
5. **Trade schedule:** set Sync, round 30m, trade count 3. The preview shows `Trade 1: unlocks at 6m`, `Trade 2: ... 14m`, `Trade 3: ... 22m` (first unlock at 20 %, then evenly over the remaining 80 %). Changing the duration (or round type) resets the count to that duration's default (30m -> 2), so set the count last. In Async mode the preview is computed from the **session** duration and says "per session".
6. **Create a sync round:** keep the defaults, click "Create Round". The result box shows "Round created successfully.", the Game ID and the lobby URL. No HTML from the server is rendered.
7. **Create an async round:** Async, round 30m, session 5m, scoring Power. Review & Create shows these values; create succeeds.
8. **Advanced overrides:** set anchor token / tokens per second / season cycles, create a round, and confirm in the player board's Debug panel (or `/games/{id}/meta`) that the values were applied.
9. **Permission (if enforcement is on):** empty or wrong Admin Token -> inline red error, no modal. Correct token -> success.
10. **Game Management:** "Refresh Game List" shows only enrolling/running games with ID, status, Sync/Async, time remaining (enrolling: enrollment time left; running: run time left) and player count. "Delete" asks for confirmation, deletes the game and refreshes the list. "📊 Metrics" shows that game's counters. "♻ Reset" asks for confirmation, clones the game (same settings) and shows the new Game ID.
11. **Global Economy:** "Load" shows the current values, version and snapshot hash. Change one value and save: only the changed field is sent, the version increases, and a newly created game uses the new value while existing games keep their snapshot. Invalid input shows the backend message inline.
12. **Metrics:** the summary shows total games and games per status.
13. **Game Settings:** "Load game settings" shows version, hash and update time plus all editors. Add a preset `2m` = 120 s, tick it for "Sync round duration", choose it as default sync round duration and save: the result names the changed keys (`duration_presets`, `sync_round_preset_ids`, `defaults`), the version increases, and sections 2-5 re-render (Round Duration now offers and preselects 2m). Create a 2m sync round; it runs 2 minutes. Existing rounds are unchanged. Unticking every preset of a list, an empty preset id or a non-number shows an inline error without a request; a value the backend rejects (for example trade count max 99) shows the backend message inline. Reload the page: section 2 still shows the new version (from `/meta`).

---

## 2. Lobby (`index.html`)

1. **Register:** "Create account" opens a dialog with username, display name, email, Discord handle (required), Telegram handle (optional), password and confirmation. Passwords need at least 12 characters with upper and lower case, a digit and a special character. A weak password or duplicate username shows the backend message in the dialog. Success signs you in.
2. **Login / logout:** sign in; the account summary shows your name and "Logout" becomes enabled. Logout clears the local session even if the backend is unreachable.
3. **Change password:** signed in, "Change password" opens a dialog. A mismatched confirmation is rejected locally; a weak new password shows the backend rule; a valid change signs you out and asks you to sign in with the new password.
4. **Session check:** reload the page while signed in. The lobby calls `GET /auth/me`; a valid token keeps you signed in. Invalidate the token (log out in another tab or restart the backend with a fresh DB) and reload: the lobby clears the session and asks you to sign in.
5. **Forgot password (default backend):** "Forgot password?" opens a dialog. Submitting shows "Password reset is not available. Please contact an administrator." (or the server's message) **inside the dialog**; the dialog stays open. With `ALLOW_UNVERIFIED_PASSWORD_RESET=true` a valid reset closes the dialog and shows a success message.
6. **Open games:** the list shows enrolling games and running async games with a status badge and remaining time. Running sync games are not listed, and running async games are hidden when the session is not shorter than the remaining round time. The list refreshes every 10 s and when the tab becomes visible again.
7. **Join:** "Enter game" is disabled until you are signed in and have selected a game. Clicking it joins and opens `player.html?autostart=1`. The join name is your display name, or a cleaned/shortened version (1-24 letters, digits, spaces, `_ - .`), falling back to your username.
8. **Last Game Highscores:** after a finished game (section 5), the lobby shows that game's Top 5.

---

## 3. Player Board (`player.html`, sync round)

Join an enrolling sync round from the lobby.

1. **Autostart:** the board connects without further clicks; the setup panel ("Join Round": Backend URL, Player Name, Game ID, Player ID, Start Game / Stop Stream) collapses. No round-type, scoring or trade controls are visible to players.
2. **Header:** countdown, Phase badge, Score, Rank, Top, scoring mode (for example "Scoring: Stockpile Mode"), connection badge. Debug toggle shows meta hash, backend URL and IDs inline.
3. **Enrollment:** during enrolling, the upgrade buttons and "Execute Trade" are disabled with a short reason. If a request still reaches the backend, the toast shows its `detail` (409 `ACTION_NOT_ALLOWED_GAME_NOT_RUNNING`).
4. **Season cards (2x2):** each shows Balance, Output and Halving countdown (ticking every second, selectable text) and three inline upgrade lanes (Hashrate, Efficiency, Cooling) with columns `Upgrade | Lvl | Cost | Pay | Out/s | BEP`. Change `Pay` to another token, upgrade, and confirm the balances follow the backend result. The selected pay token survives live updates.
5. **Player State panel:** read-only matrix (Out/s, Bal, Price per token and total), footer with next halving, cumulative mined, and fee/spread. Large values use k/M/B with the exact value in the tooltip. Tooltips open on hover/focus/tap and close on leave or Escape.
6. **Halving:** when a token halves, its output drops accordingly and the halving countdown moves to the next checkpoint (or "No further halvings").
7. **Events:** when the backend has an active event, a one-line banner above the season grid lists it (label, effect, remaining time); several events are listed together. ⚡ markers appear only on affected values (only on the event's token if it is token-scoped). No banner when no event is active.
8. **Action bar:** score context value, Trading and Farming status pills (always visible), buttons `Trade`, `Farm`, `Chat`, `Top 5`, and the chat preview dock with unread badge.
9. **Live tools window:** each button opens the floating window on its tab. Verify: no backdrop and the board stays usable; drag it by its header and resize it; Escape closes it; a click outside closes it; tabs switch without closing.
   - **Trade:** "Trades used", "Next trade" (countdown or "Available now"), the full schedule, From/To token, amount, balances, conversion cost and the mode-specific net effect. "Execute Trade" is disabled with a reason when trading is off, no slots remain, the next slot is locked, tokens are equal, the amount is 0 or exceeds the balance. A successful trade updates balances; a 409 shows the backend `detail`.
   - **Farm:** placeholder text; farming is not implemented.
   - **Chat:** send a message from two accounts; both see it with server-assigned user and time. The list scrolls internally; the preview dock and unread badge update while the window is closed.
   - **Top 5:** live ranking with scores; in Efficiency rounds scores look like `1.2345×`, otherwise integers.
10. **Layout:** at 1440x900 the page does not scroll; only the setup panel, season list and window contents scroll internally. Below 768 px a season strip shows one season card at a time.
11. **Reconnect:** stop and restart the backend briefly; the connection badge shows the reconnect and the stream resumes with a fresh ticket (no manual reload).

---

## 4. Async Session Flow

Create an async round (round 30m, session 5m) in the admin console.

1. Join it from the lobby. Autostart starts a session: the header shows `Async: Session Active` and a "Session Left" countdown; the stream uses `/sessions/{id}/stream`.
2. Player State shows `This session` and `Best this round` (hidden in sync rounds).
3. Trades unlock relative to the **session** start. Example: create the round with trade count 2 (the default for a 5m session is 0); the trades unlock 1m and 3m after the session starts.
4. When the session ends, the `Session Finished` overlay appears; a click returns to the lobby.
5. Join the same round again from the lobby while enough round time remains. The new session starts from the same baseline balances and upgrades.
   - Known limitation: every lobby join creates a **new player entry** (accounts are not linked to players yet), so a second attempt appears as a separate leaderboard row instead of improving `Best this round` of the first one. Record what you see.
6. Join an async round whose remaining time is shorter than the session: it is not listed in the lobby; forcing it (for example via `player.html` with the Game ID) shows the backend 409 (`SESSION_ASYNC_INSUFFICIENT_TIME`) inline.

---

## 5. Game Over

1. Let a sync round finish while the board is open. A full-screen `Game Over` overlay says the round finished; it is the only full-screen overlay and appears only after play has ended.
2. Click it (or press Enter/Space): the board resets and the browser returns to the lobby, which now shows "Last Game Highscores" for that round.
3. Upgrades sent after the end are rejected by the backend (409).

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

- [ ] Admin console: 11 sections, defaults (backend game config), trade preview (30m/3 -> 6/14/22 min), sync + async create, overrides applied, game list + metrics/reset/delete, global economy edit, metrics summary, game settings edit (2m test preset)
- [ ] Lobby: register, login, change password, logout, `/auth/me` re-check, forgot-password disabled message, open-games filter + 10 s refresh, join
- [ ] Player board: autostart, no host controls, season cards + upgrades, analytics, halving, events banner
- [ ] Live tools window: Trade / Farm / Chat / Top 5, drag, Escape and outside-click close, board stays usable
- [ ] Async: session start, session countdown, This session / Best this round, Session Finished -> lobby
- [ ] Game Over overlay -> lobby -> Last Game Highscores
- [ ] Safe rendering of hostile names/messages
- [ ] Gates in `QUALITY_ENFORCEMENT.md` green

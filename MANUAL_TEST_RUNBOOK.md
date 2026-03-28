# Manual Test Runbook — Admin Setup & Player Flow

This runbook covers end-to-end testing of the Admin Setup UI and Player Dashboard after the merge of the Admin Setup feature.

---

## 0 — Pre-flight Setup

### Start Backend
```bash
cd "C:\Users\weudl\Mining tycoon"
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```
Confirm backend listens on `http://127.0.0.1:8000` and `/meta` returns the contract.

### Optional: Set Admin Enforcement
To test permission enforcement, set environment variables **before** starting the backend:
```powershell
$env:REQUIRE_ADMIN_FOR_GAME_CREATE = "true"
$env:ADMIN_TOKEN = "test-admin-secret"
```
Without these, game creation is open to all (default behavior).

### Start Frontend Dev Server
```bash
cd "C:\Users\weudl\frontend mining tycoon"
npm run dev
```
Confirm Vite listens on `http://localhost:5173` and both entries build:
- `http://localhost:5173` → Player UI (index.html)
- `http://localhost:5173/admin.html` → Admin Setup UI

---

## 1 — Admin Flow (Create a Round)

### 1.1 — Open Admin Setup
1. Navigate to `http://localhost:5173/admin.html`
2. Verify the **amber/yellow banner** displays: "⚙️ Admin Setup — round configuration is snapshot-locked at creation"
3. Verify all 7 sections load (Connection, Round Type, Time Config, Scoring, Trading, Advanced Overrides, Review & Create)

### 1.2 — Create a Sync Round (with defaults)
1. **Connection**: Leave Backend URL as `http://127.0.0.1:8000`
2. If `REQUIRE_ADMIN_FOR_GAME_CREATE=true`: Enter Admin Token as `test-admin-secret`
3. **Round Type**: Select "Sync"
4. **Time Configuration**:
   - Enrollment Window: 10 seconds (default 10)
   - Round Duration: 5 minutes (preset)
5. **Scoring Mode**: Leave as "Stockpile" (default)
6. **Trading Rules**: Leave as 0 trades (default for 5m round)
7. **Advanced Overrides**: Leave blank (use server defaults)
8. **Review & Create**: Click "Create Round"
9. Verify success box displays:
   - ✅ Round created successfully
   - Game ID (e.g., `game-12345`)
   - Link to player dashboard

### 1.3 — Create an Async Round
1. **Round Type**: Select "Async (host)"
2. **Time Configuration**:
   - Round Duration: 30 minutes
   - Session Duration: 5 minutes
3. **Scoring Mode**: Select "Power"
4. Review summary shows:
   - Round type: Async (host)
   - Scoring mode: Power
   - Duration: 30m
   - Session duration: 5m
5. Click "Create Round" and verify success

### 1.4 — Permission Enforcement (if enabled)
1. Clear the Admin Token field
2. Click "Create Round"
3. Verify **inline error** appears (red box):
   - "❌ Admin permission required to create rounds. Invalid admin token"
4. Re-enter correct token and retry; creation succeeds

---

## 2 — Player Flow (Join & Play)

### 2.1 — Player Dashboard
1. Navigate to `http://localhost:5173` (or `http://localhost:5173/index.html`)
2. Verify the **teal banner** displays: "▶ Player Dashboard — join a round above to begin playing"
3. Confirm admin controls are **NOT visible**:
   - ❌ No "Round Type" radio buttons
   - ❌ No "Scoring Mode" options
   - ❌ No "Trade Count" input
   - ❌ No "+ New Game" button
4. Verify "+ New Game (Admin)" link is **hidden** (cannot see it without ?admin=1)

### 2.2 — Admin Link Gating
1. Append `?admin=1` to the URL: `http://localhost:5173?admin=1`
2. Verify "+ New Game (Admin)" link now appears
3. Remove query param; link disappears again (refresh to confirm)

### 2.3 — Join Created Round
1. Enter the Game ID from admin setup (e.g., `12345`)
2. Enter any Player Name (e.g., "TestPlayer")
3. Click "Start Game"
4. Verify player connects and sees:
   - Countdown timer (⏱ shows round remaining time)
   - Game status badge
   - Scoring mode displayed (e.g., "Scoring: Stockpile Mode")
   - Player dashboard with token balances, mining output

### 2.4 — Verify Scoring Mode is Snapshot-Locked
1. From the admin setup, note the scoring mode used (e.g., "Power")
2. In the player dashboard, confirm the correct mode displays
3. Attempt any action to change it (e.g., open inspector and try local edits)
   - Verify changes don't persist and backend authorizes based on round snapshot

### 2.5 — Verify Trading Panel
1. If trading was enabled in admin setup (trade_count > 0):
   - Player dashboard trading panel shows:
     - "Trades available: X / Y"
     - Full unlock schedule (times for each trade)
   - After a trade, panel updates immediately
2. If trading was disabled (trade_count = 0):
   - Trading panel shows "Trading disabled for this round"

---

## 3 — Layout & No-Scroll Invariants

### 3.1 — Desktop Layout
1. Open player dashboard on desktop (1920×1080 typical)
2. Confirm **no page scroll** appears on the main viewport
3. Verify internal scrolling only within panels:
   - Setup panel scrolls independently
   - Live board (seasons) scrolls internally
   - Right sidebar (analytics) scrolls internally

### 3.2 — Mobile Layout
1. Test on mobile or narrow viewport (e.g., browser dev tools 375×667)
2. Confirm banners don't break layout
3. Verify form controls remain usable and readable

---

## 4 — Regression Checks

### 4.1 — No Modal/Overlay Dialogs
1. Throughout admin and player flows:
   - ❌ No blocking modal popups
   - ❌ No overlays that prevent interaction
   - All feedback is inline (banners, info boxes)

### 4.2 — No Untrusted HTML Rendering
1. In both admin and player UIs:
   - Form inputs don't render unescaped HTML
   - Error messages are plain text or safe DOM nodes
   - Game IDs and player names are text-only

### 4.3 — Admin-Only Elements Remain Inert
1. In browser dev tools, inspect the player UI and search for admin elements:
   - `.admin-only` CSS class hides them
   - Hidden elements have no focus/tab order issues
   - No console errors about missing admin controls

---

## 5 — Control Data Wiring Verification

### 5.1 — Admin Defaults Match Library
1. Open admin setup and verify defaults match `src/config/`:
   - Enrollment window default: 10 seconds ✓
   - Default round duration: 5 minutes (sync) ✓
   - Default async round duration: 30 minutes ✓
   - Default session duration: 5 minutes ✓
   - Trade count limits: 0–10 (from `TRADE_COUNT_LIMITS`) ✓

### 5.2 — Trading Schedule Calculation
1. In admin setup, set:
   - Round duration: 30 minutes
   - Trade count: 3
2. Verify preview shows unlock times calculated from `computeTradeUnlockOffsetsSeconds`:
   - Trade 1: ~6 minutes (20% offset)
   - Trade 2: ~18 minutes (middle)
   - Trade 3: ~27 minutes (end)
3. Create round and join as player; confirm player panel shows same schedule

---

## 6 — Backend Permission Tests (Optional, if REQUIRE_ADMIN_FOR_GAME_CREATE=true)

### 6.1 — Create Without Token
```bash
curl -X POST http://127.0.0.1:8000/games \
  -H "Content-Type: application/json" \
  -d '{"duration_mode":"preset","duration_preset":"5m"}'
```
Expect: **403 Forbidden** with message "Admin permission required…"

### 6.2 — Create With Correct Token
```bash
curl -X POST http://127.0.0.1:8000/games \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: test-admin-secret" \
  -d '{"duration_mode":"preset","duration_preset":"5m","enrollment_window_seconds":30,"scoring_mode":"stockpile"}'
```
Expect: **200 OK** with `{ "game_id": <number> }`

### 6.3 — Create With Wrong Token
```bash
curl -X POST http://127.0.0.1:8000/games \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: wrong-secret" \
  -d '{"duration_mode":"preset","duration_preset":"5m"}'
```
Expect: **403 Forbidden**

### 6.4 — Join is Unaffected
```bash
curl -X POST http://127.0.0.1:8000/games/<game-id>/join \
  -H "Content-Type: application/json" \
  -d '{"name":"TestPlayer"}'
```
Expect: **200 OK** (no admin token needed)

---

## 7 — Quality Gates

Before merging, run:

### Frontend
```bash
npm run lint
npm run test -- --run
npm run build
```
Expected: ✓ All 338+ tests pass, build succeeds with both `dist/index.html` and `dist/admin.html`.

### Backend
```bash
python -m pytest tests/test_admin_game_create.py -v
python -m pytest --tb=short -q
```
Expected: ✓ All 7 new admin tests + 289 existing tests pass (~296 total).

---

## 8 — Summary Checklist

- [ ] Admin Setup page opens and displays all sections
- [ ] Player Dashboard does not expose admin controls
- [ ] Admin link on player page hidden by default, visible with ?admin=1
- [ ] Sync and Async rounds create successfully
- [ ] Scoring mode (and trading rules) are snapshot-locked in player view
- [ ] Permission errors display inline, not in modals
- [ ] No page scroll on desktop; only internal panel scrolling
- [ ] Trading panel shows correct schedule for rounds with trades
- [ ] Backend enforces admin token when flag is enabled
- [ ] Frontend lint, test, build all pass
- [ ] Backend pytest all pass

---

**Last Updated:** 2026-03-25  
**Merge Ready:** After all checkmarks are verified and quality gates pass.

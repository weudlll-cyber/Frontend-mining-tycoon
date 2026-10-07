# Production Defaults Checklist

Purpose: Track the transition from test defaults to production-ready defaults.

Status as of 2026-10-07:
- Round-setup defaults are no longer a code change. Admins set them at runtime
  in the admin console, section **"11 — Game Settings"** (`GET`/`PATCH
  /admin/game-config`, exposed to all pages as `game_config` in `GET /meta`).
  Changes apply to newly created rounds only; existing rounds keep their
  settings.
- Short test presets (for example `1m`, or a new `2m`) may stay available.
  Whether they are offered is an admin decision in Game Settings (untick them
  in the offered-preset lists), not a release blocker.
- The values in `src/config/game-control-data.js` and
  `src/config/trading-control-data.js` are only the frontend fallback for a
  backend that sends no `game_config`; they mirror backend
  `app/policy/control_data.py` and do not need editing for production.

## Current Shipped Defaults (Backend Seed / Frontend Fallback)

- Duration presets `1m` (short test preset), `5m`, `10m`, `15m`, `20m`, `30m`, `60m`, `3h`, `6h`, `12h`, `24h`, `3d`, `7d`
- Enrollment window default: 10 seconds (limits 5-3600 s)
- Sync round default: 5 minutes
- Async round default: 30 minutes
- Async session default: 5 minutes
- Trade count limits 0-10; default trade counts by round length as in `SEASONAL_TYCOON_CONCEPT.md`

Hidden legacy host controls in `player.html` (`.admin-only`, never shown to
players) are now filled from the effective game config on load and after
`/meta`; only the enrollment window (`600` s) and trade count (`0`) are still
seeded in the HTML.

## Decision Checklist (Admin, in Game Settings)
- [ ] Choose the production enrollment window default (seconds)
- [ ] Choose the production sync round default preset
- [ ] Choose the production async round default preset
- [ ] Choose the production async session default preset
- [ ] Decide which short test presets stay offered for sync / async round / async session
- [ ] Confirm async/session guard behavior remains valid (session < round)
- [ ] Decide what to do with the hidden `player.html` host controls: remove them, or keep them filled from the game config

## Frontend Checklist
- [x] Defaults, presets, limits and trade defaults come from the backend game config (`src/config/game-config.js`), with the old constants as fallback
- [x] Sync default preset moved from `src/admin/admin-setup.js` into control data (`SYNC_ROUND_DEFAULT_PRESET`)
- [x] `admin.html` create form is built from the effective config (no seeded values)
- [x] Backend URL is configurable: `VITE_API_BASE_URL` via `src/config/backend-url.js` (`.env.example`); `scripts/deploy-to-vps.ps1` requires `-ApiBaseUrl` and refuses localhost builds (PRs #18, #19)

## Backend Alignment Checklist
- [ ] Backend serves `game_config` in `GET /meta` and `GET`/`PATCH /admin/game-config` in production
- [ ] Validate the backend accepts the configured presets without schema/policy mismatch
- [ ] Verify admin create flow payload examples remain correct
- [ ] Verify async and sync behavior in manual smoke tests

## Test & Verification Checklist
- [ ] Run the gates in `QUALITY_ENFORCEMENT.md`
- [ ] Run backend smoke test for `POST /games` with sync and async payloads
- [ ] Manual admin create + Game Settings edit + player join sanity pass (`MANUAL_TEST_RUNBOOK.md`)

## Release Gate
- [ ] Production values chosen and saved in Game Settings on the production backend
- [ ] Final sign-off: defaults approved for production

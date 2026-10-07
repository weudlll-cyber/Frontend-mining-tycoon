# Production Defaults Checklist

Purpose: Track the transition from temporary test defaults to production-ready defaults.

Status as of 2026-10-07:
- This checklist is still active. Only the backend-URL item is done.
- The temporary `1m` preset remains intentionally available for local/manual testing.
- That preset is a release blocker until production defaults are confirmed and the temporary value is removed (frontend and backend).

## Current Temporary Test Defaults (Do Not Ship)

Admin console (`admin.html`, values from `src/config/game-control-data.js` and `src/admin/admin-setup.js`):

- Temporary fast-test preset `1m` in `ROUND_DURATION_PRESETS`, `ASYNC_ROUND_PRESET_IDS` and `ASYNC_SESSION_PRESET_IDS` (backend: `app/policy/control_data.py`)
- Enrollment window default: 10 seconds (`ENROLLMENT_WINDOW_DEFAULT_SECONDS`)
- Sync round default: 5 minutes (`SYNC_DEFAULT_PRESET` in `src/admin/admin-setup.js`, not in control data)
- Async round default: 30 minutes (`ASYNC_ROUND_DEFAULT_PRESET`)
- Async session default: 5 minutes (`ASYNC_SESSION_DEFAULT_PRESET`)

Hidden legacy host controls in `player.html` (`.admin-only`, never shown to players, but still seeded in the HTML and partly restored from localStorage by `main.js`). Their values differ from the control data:

- Enrollment window `600` s, sync round `30m`, async round `3d`, async session `24h`, trade count `0`
- The sync preset list there has no `1m` and no `3h`

## Decision Checklist
- [ ] Confirm production enrollment window default (seconds)
- [ ] Confirm production sync round default preset
- [ ] Confirm production async round default preset
- [ ] Confirm production async session default preset
- [ ] Confirm async/session guard behavior remains valid (session < round)
- [ ] Decide what to do with the hidden `player.html` host controls: remove them, or seed them from control data

## Frontend Update Checklist
- [ ] Update `src/config/game-control-data.js` defaults and remove `1m`
- [ ] Move the sync default preset from `src/admin/admin-setup.js` into control data
- [ ] Ensure `admin.html` seed values match control-data defaults
- [ ] Align or remove the hidden `player.html` host-control defaults
- [ ] Update `MANUAL_TEST_RUNBOOK.md`, `README.md` and `PROJECT_BASELINE.md` where they mention defaults
- [x] Backend URL is configurable: `VITE_API_BASE_URL` via `src/config/backend-url.js` (`.env.example`); `scripts/deploy-to-vps.ps1` requires `-ApiBaseUrl` and refuses localhost builds (PRs #18, #19)

## Backend Alignment Checklist
- [ ] Remove `1m` from the backend control data in the same release
- [ ] Validate backend accepts selected presets without schema/policy mismatch
- [ ] Verify admin create flow payload examples remain correct
- [ ] Verify async and sync behavior in manual smoke tests

## Test & Verification Checklist
- [ ] Update/confirm impacted frontend tests (`game-control-data`, `admin-setup`, async duration helpers)
- [ ] Run the gates in `QUALITY_ENFORCEMENT.md`
- [ ] Run backend smoke test for `POST /games` with sync and async payloads
- [ ] Manual admin create + player join sanity pass (`MANUAL_TEST_RUNBOOK.md`)

## Release Gate
- [ ] Remove/replace temporary-default note before release
- [ ] Confirm final values are documented in README and baseline docs
- [ ] Final sign-off: defaults approved for production

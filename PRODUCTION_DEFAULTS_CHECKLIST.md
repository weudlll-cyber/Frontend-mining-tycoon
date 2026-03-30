# Production Defaults Checklist

Purpose: Track the transition from temporary test defaults to production-ready defaults.

Status note as of 2026-03-30:
- This checklist is still active.
- The temporary `1m` preset remains intentionally available for local/manual testing.
- That preset is a release blocker until production defaults are confirmed and the temporary value is removed.

## Current Temporary Test Defaults (Do Not Ship)
- Temporary fast-test preset present in control data: `1m`
- Enrollment window default: 10 seconds
- Sync round default: 5 minutes
- Async round default: 30 minutes
- Async session default: 5 minutes

## Decision Checklist
- [ ] Confirm production enrollment window default (seconds)
- [ ] Confirm production sync round default preset
- [ ] Confirm production async round default preset
- [ ] Confirm production async session default preset
- [ ] Confirm async/session guard behavior remains valid (session <= round)

## Frontend Update Checklist
- [ ] Update `src/config/game-control-data.js` defaults
- [ ] Validate `src/admin/admin-setup.js` sync default preset
- [ ] Ensure `admin.html` seed values match control-data defaults
- [ ] Update runbook and any top-level docs that mention defaults

## Backend Alignment Checklist
- [ ] Validate backend accepts selected presets without schema/policy mismatch
- [ ] Verify admin create flow payload examples remain correct
- [ ] Verify async and sync behavior in manual smoke tests

## Test & Verification Checklist
- [ ] Update/confirm impacted frontend tests (`game-control-data`, `admin-setup`, async duration helpers)
- [ ] Run frontend lint and focused tests for changed modules
- [ ] Run backend smoke test for `POST /games` with sync and async payloads
- [ ] Manual admin create + player join sanity pass

## Release Gate
- [ ] Remove/replace temporary-default note before release
- [ ] Confirm final values are documented in README and baseline docs
- [ ] Final sign-off: defaults approved for production

/**
 * Built-in control data / tuning values for game setup settings.
 *
 * Since the admin "Game Settings" section (admin.html, section 11) the backend
 * owns the live values: GET /meta exposes them as `game_config`, and
 * src/config/game-config.js resolves the effective config. The constants in
 * this file are the FALLBACK used when the backend does not send a
 * `game_config` (older backend). They mirror backend app/policy/control_data.py.
 * Other modules must read the effective config via src/config/game-config.js
 * and must not duplicate these constants inline.
 *
 * File: src/config/game-control-data.js
 */

// ── Duration presets ────────────────────────────────────────────────────────
// Full preset table covering all sync and async round durations + session
// durations. Values are in seconds. '3h' is async-round-only; '20m' is
// sync-only; '30m' is available in both async round and session dropdowns.
export const ROUND_DURATION_PRESETS = {
  // NOTE: '1m' is for testing only — remove before production
  '1m': 60,
  '5m': 300,
  '10m': 600,
  '15m': 900,
  '20m': 1200,
  '30m': 1800,
  '60m': 3600,
  '3h': 10800,
  '6h': 21600,
  '12h': 43200,
  '24h': 86400,
  '3d': 259200,
  '7d': 604800,
};

// ── Sync round duration ─────────────────────────────────────────────────────
// Every preset is valid for sync rounds in the backend, so the sync dropdown
// offers the full table. '5m' is the default for manual testing.
export const SYNC_ROUND_PRESET_IDS = Object.keys(ROUND_DURATION_PRESETS);
export const SYNC_ROUND_DEFAULT_PRESET = '5m';

// Round type preselected in the admin create form. Uses the same strings the
// create-game API accepts in `round_type` ('synchronous' | 'asynchronous').
export const DEFAULT_ROUND_TYPE = 'synchronous';

// Min/max for custom duration entry (same as backend DURATION_MIN/MAX_SECONDS)
export const ROUND_DURATION_LIMITS = { min: 60, max: 2592000 }; // 2592000 = 30 days

// ── Async round duration ────────────────────────────────────────────────────
// Preset IDs shown in the async round duration dropdown.
// Must be a subset of ROUND_DURATION_PRESETS keys.
export const ASYNC_ROUND_PRESET_IDS = [
  // NOTE: '1m' is for testing only — remove before production
  '1m',
  '5m',
  '10m',
  '15m',
  '30m',
  '60m',
  '3h',
  '6h',
  '12h',
  '24h',
  '3d',
  '7d',
];
export const ASYNC_ROUND_DEFAULT_PRESET = '30m';

// ── Async session duration ──────────────────────────────────────────────────
// Preset IDs shown in the session duration dropdown.
// Must be a subset of ROUND_DURATION_PRESETS keys.
export const ASYNC_SESSION_PRESET_IDS = [
  // NOTE: '1m' is for testing only — remove before production
  '1m',
  '5m',
  '10m',
  '30m',
  '60m',
  '6h',
  '12h',
  '24h',
];
export const ASYNC_SESSION_DEFAULT_PRESET = '5m';

// ── Enrollment window ───────────────────────────────────────────────────────
export const ENROLLMENT_WINDOW_LIMITS = { min: 5, max: 3600 }; // seconds
export const ENROLLMENT_WINDOW_DEFAULT_SECONDS = 10;

// ── Account policy ──────────────────────────────────────────────────────────
// Fallback for `account_policy`: an older backend without the key lets
// everyone join (the lobby still sends the account token when signed in).
export const ACCOUNT_POLICY_DEFAULTS = Object.freeze({
  require_account_to_join: false,
});

// ── Chat ────────────────────────────────────────────────────────────────────
// Fallback for `defaults.chat_enabled`: an older backend without the key keeps
// chat on for every round (today's behavior).
export const CHAT_ENABLED_DEFAULT = true;

// ── Farming (Stage 1, passive) ───────────────────────────────────────────────
// Fallbacks for `defaults.farming_*` and the farming limits when the backend
// sends no game_config (older backend): farming stays off for new rounds.
// Mirror the backend seed values in app/policy/control_data.py.
export const FARMING_DEFAULTS = Object.freeze({
  enabled: false,
  min_duration_seconds: 300,
  reward_rate: 0.05, // fraction per completed cycle (0.05 = 5 %)
});
export const FARMING_MIN_DURATION_LIMITS = Object.freeze({
  min: 10,
  max: 604800, // 7 days
});
export const FARMING_REWARD_RATE_LIMITS = Object.freeze({
  min: 0.0001,
  max: 1.0,
});

// ── Scoring modes ───────────────────────────────────────────────────────────
// DEFAULT_MODE is the full canonical mode used throughout the app.
// ALLOWED_MODES are the short aliases accepted by the backend scoring_mode field.
// CANONICAL_MODES maps each short alias to its full canonical form.
export const SCORING_CONTROL = {
  DEFAULT_MODE: 'stockpile_total_tokens',
  ALLOWED_MODES: ['stockpile', 'power', 'mining_time', 'efficiency'],
  CANONICAL_MODES: {
    stockpile: 'stockpile_total_tokens',
    power: 'power_oracle_weighted',
    mining_time: 'mining_time_equivalent',
    efficiency: 'efficiency_system_mastery',
  },
};

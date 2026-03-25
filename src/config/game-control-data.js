/**
 * Control data / tuning values (Steuerdaten) for game setup settings.
 *
 * Change values here to tune defaults and limits for duration presets,
 * enrollment windows, scoring modes, and async session defaults.
 * All other modules must import from here and must not duplicate these
 * constants inline.
 *
 * File: src/config/game-control-data.js
 */

// ── Duration presets ────────────────────────────────────────────────────────
// Full preset table covering all sync and async round durations + session
// durations. Values are in seconds.  '3h' is async-round-only; '20m' is
// sync-only; '30m' appears in the session dropdown.
export const ROUND_DURATION_PRESETS = {
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

// Min/max for custom duration entry (same as backend DURATION_MIN/MAX_SECONDS)
export const ROUND_DURATION_LIMITS = { min: 60, max: 2592000 }; // 2592000 = 30 days

// ── Async round duration ────────────────────────────────────────────────────
// Preset IDs shown in the async round duration dropdown.
// Must be a subset of ROUND_DURATION_PRESETS keys.
export const ASYNC_ROUND_PRESET_IDS = [
  '5m',
  '10m',
  '15m',
  '60m',
  '3h',
  '6h',
  '12h',
  '24h',
  '3d',
  '7d',
];
export const ASYNC_ROUND_DEFAULT_PRESET = '10m';

// ── Async session duration ──────────────────────────────────────────────────
// Preset IDs shown in the session duration dropdown.
// Must be a subset of ROUND_DURATION_PRESETS keys.
export const ASYNC_SESSION_PRESET_IDS = [
  '5m',
  '10m',
  '30m',
  '60m',
  '6h',
  '12h',
  '24h',
];
export const ASYNC_SESSION_DEFAULT_PRESET = '24h';

// ── Enrollment window ───────────────────────────────────────────────────────
export const ENROLLMENT_WINDOW_LIMITS = { min: 5, max: 3600 }; // seconds
export const ENROLLMENT_WINDOW_DEFAULT_SECONDS = 600;

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

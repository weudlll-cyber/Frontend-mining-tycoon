/**
 * Built-in tuning/control data for trade defaults and schedule rules.
 *
 * These are the FALLBACK values used when the backend /meta does not send a
 * `game_config` (older backend). The live values are admin-editable in the
 * backend; src/config/game-config.js resolves the effective config and owns
 * the helper functions (clampTradeCount, getDefaultTradeCount,
 * computeTradeUnlockOffsetsSeconds). UI modules must not duplicate these numbers.
 *
 * File: src/config/trading-control-data.js
 */

export const TRADE_COUNT_LIMITS = { min: 0, max: 10 };

export const FIRST_TRADE_UNLOCK_FRACTION = 0.2;
export const REMAINING_WINDOW_FRACTION = 0.8;

// Default trade count by trade-window length, in the backend `trade_defaults`
// shape: ascending buckets, the first bucket whose max_duration_seconds is
// >= the duration wins, `null` means "longer than all other buckets".
// WHY these boundaries: older backends use inclusive ranges (5-10m -> 0,
// 15-30m -> 2, 45-60m -> 3, 2-3h -> 4, 6-12h -> 5, >= 24h -> 6) and fill the
// gaps with the nearest range center (600, 1350, 3150, 9000, 32400, 86400 s).
// The 601-899 s gap is closer to 600 than to 1350, so the first bucket ends at
// 899; the other boundaries are the midpoints between neighbouring centers
// (2250, 6075, 20700, 59400, ties go to the shorter bucket as before). This
// reproduces the old behavior exactly for whole-second durations.
export const TRADE_DEFAULT_BUCKETS = [
  { max_duration_seconds: 899, trade_count: 0 },
  { max_duration_seconds: 2250, trade_count: 2 },
  { max_duration_seconds: 6075, trade_count: 3 },
  { max_duration_seconds: 20700, trade_count: 4 },
  { max_duration_seconds: 59400, trade_count: 5 },
  { max_duration_seconds: null, trade_count: 6 },
];

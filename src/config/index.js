/**
 * Barrel export for src/config.
 * Import game setup tunables (duration, scoring, enrollment, trading) from here.
 *
 * File: src/config/index.js
 */

export {
  ROUND_DURATION_PRESETS,
  ROUND_DURATION_LIMITS,
  ASYNC_ROUND_PRESET_IDS,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_PRESET_IDS,
  ASYNC_SESSION_DEFAULT_PRESET,
  ENROLLMENT_WINDOW_LIMITS,
  ENROLLMENT_WINDOW_DEFAULT_SECONDS,
  SCORING_CONTROL,
} from './game-control-data.js';

export {
  TRADE_COUNT_LIMITS,
  FIRST_TRADE_UNLOCK_FRACTION,
  REMAINING_WINDOW_FRACTION,
  clampTradeCount,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from './trading-control-data.js';

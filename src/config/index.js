/**
 * Barrel export for src/config.
 * Built-in fallback tunables (duration, scoring, enrollment, trading) and the
 * effective-config resolver (game-config.js) that prefers the backend
 * `game_config` from GET /meta.
 *
 * File: src/config/index.js
 */

export {
  ROUND_DURATION_PRESETS,
  ROUND_DURATION_LIMITS,
  SYNC_ROUND_PRESET_IDS,
  SYNC_ROUND_DEFAULT_PRESET,
  DEFAULT_ROUND_TYPE,
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
  TRADE_DEFAULT_BUCKETS,
} from './trading-control-data.js';

export {
  ROUND_TYPE_VALUES,
  isAsyncRoundType,
  buildFallbackGameConfig,
  normalizeGameConfig,
  setGameConfigDocument,
  getActiveGameConfigDocument,
  getEffectiveGameConfig,
  getPresetSeconds,
  clampTradeCount,
  clampEnrollmentWindowSeconds,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
  formatPresetLabel,
} from './game-config.js';

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
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_DEFAULT_PRESET,
  ENROLLMENT_WINDOW_LIMITS,
  ENROLLMENT_WINDOW_DEFAULT_SECONDS,
  SCORING_CONTROL,
  SCHEDULED_START_MIN_LEAD_SECONDS,
} from './game-control-data.js';

export { TRADE_COUNT_LIMITS } from './trading-control-data.js';

export {
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
} from './game-config.js';

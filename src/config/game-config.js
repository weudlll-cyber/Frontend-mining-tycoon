/**
 * File: src/config/game-config.js
 * Purpose: Single place that resolves the EFFECTIVE round-setup config
 *          (duration presets, offered presets, defaults, limits, trade-count
 *          defaults, trade unlock fractions) and the helpers built on it.
 * Role in system:
 *  - Upstream: the backend owns the live values (admin "Game Settings",
 *    GET/PATCH /admin/game-config) and exposes them publicly as
 *    `game_config` in GET /meta (cached by src/meta/meta-manager.js).
 *  - Fallback: when /meta has no `game_config` (older backend, or /meta not
 *    loaded yet) the config is built from the constants in
 *    game-control-data.js / trading-control-data.js, in the same shape.
 *  - Downstream: admin create form (src/admin/admin-setup.js), the admin
 *    Game Settings editor, player.html legacy host controls (src/main.js,
 *    src/ui/async-duration.js, src/ui/setup-payload.js).
 * Constraints:
 *  - Backend stays authoritative: these values only drive form options,
 *    defaults and previews; POST /games is validated by the backend and each
 *    created round keeps a snapshot of the config it was created with.
 *  - `defaults.chat_enabled` only pre-ticks the create form's "Chat enabled"
 *    box; the backend decides per round and refuses the chat socket when off.
 *  - `account_policy.require_account_to_join` is enforced by the backend on
 *    join (401 ACCOUNT_REQUIRED); the frontend only edits/displays it.
 *  - Malformed backend sections fall back per top-level key, so one bad
 *    field never breaks the whole admin form.
 * Security notes: pure data handling, no DOM or network access.
 */

import {
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
  ACCOUNT_POLICY_DEFAULTS,
  CHAT_ENABLED_DEFAULT,
} from './game-control-data.js';
import {
  TRADE_COUNT_LIMITS,
  FIRST_TRADE_UNLOCK_FRACTION,
  REMAINING_WINDOW_FRACTION,
  TRADE_DEFAULT_BUCKETS,
} from './trading-control-data.js';
import { getGlobalMeta } from '../meta/meta-manager.js';

// Round type strings accepted by the create-game API (`round_type`).
export const ROUND_TYPE_VALUES = Object.freeze([
  'synchronous',
  'asynchronous',
  'sync',
  'async',
]);

/** True when a backend round_type string means an async round. */
export function isAsyncRoundType(roundType) {
  return roundType === 'asynchronous' || roundType === 'async';
}

/**
 * Build the fallback config from the built-in constants. A fresh object is
 * returned each time so callers can never mutate the shared constants.
 */
export function buildFallbackGameConfig() {
  return {
    duration_presets: { ...ROUND_DURATION_PRESETS },
    sync_round_preset_ids: [...SYNC_ROUND_PRESET_IDS],
    async_round_preset_ids: [...ASYNC_ROUND_PRESET_IDS],
    async_session_preset_ids: [...ASYNC_SESSION_PRESET_IDS],
    defaults: {
      round_type: DEFAULT_ROUND_TYPE,
      sync_round_preset: SYNC_ROUND_DEFAULT_PRESET,
      async_round_preset: ASYNC_ROUND_DEFAULT_PRESET,
      async_session_preset: ASYNC_SESSION_DEFAULT_PRESET,
      enrollment_window_seconds: ENROLLMENT_WINDOW_DEFAULT_SECONDS,
      scoring_mode: 'stockpile',
      chat_enabled: CHAT_ENABLED_DEFAULT,
    },
    duration_limits: {
      min_seconds: ROUND_DURATION_LIMITS.min,
      max_seconds: ROUND_DURATION_LIMITS.max,
    },
    enrollment_window_limits: {
      min_seconds: ENROLLMENT_WINDOW_LIMITS.min,
      max_seconds: ENROLLMENT_WINDOW_LIMITS.max,
    },
    trade_count_limits: {
      min: TRADE_COUNT_LIMITS.min,
      max: TRADE_COUNT_LIMITS.max,
    },
    trade_defaults: TRADE_DEFAULT_BUCKETS.map((bucket) => ({ ...bucket })),
    trade_unlock: {
      first_unlock_fraction: FIRST_TRADE_UNLOCK_FRACTION,
      remaining_window_fraction: REMAINING_WINDOW_FRACTION,
    },
    account_policy: { ...ACCOUNT_POLICY_DEFAULTS },
  };
}

// ── Normalization (per top-level key) ───────────────────────────────────────

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePresets(raw, fallback) {
  if (!isPlainObject(raw)) return fallback;
  const entries = Object.entries(raw);
  const valid =
    entries.length > 0 &&
    entries.every(
      ([id, seconds]) => id && isFiniteNumber(seconds) && seconds > 0
    );
  return valid ? { ...raw } : fallback;
}

function normalizePresetIds(raw, presets, fallbackIds) {
  const known = (ids) =>
    Array.isArray(ids)
      ? ids.filter((id) => typeof id === 'string' && id in presets)
      : [];
  const fromBackend = known(raw);
  if (fromBackend.length) return fromBackend;
  const fromFallback = known(fallbackIds);
  // Last resort: every preset, shortest first, so a dropdown is never empty.
  return fromFallback.length
    ? fromFallback
    : Object.keys(presets).sort((a, b) => presets[a] - presets[b]);
}

function normalizeRange(raw, fallback, minKey, maxKey) {
  if (
    isPlainObject(raw) &&
    isFiniteNumber(raw[minKey]) &&
    isFiniteNumber(raw[maxKey]) &&
    raw[minKey] <= raw[maxKey]
  ) {
    return { [minKey]: raw[minKey], [maxKey]: raw[maxKey] };
  }
  return fallback;
}

function normalizeTradeDefaults(raw, fallback) {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  const valid = raw.every(
    (bucket) =>
      isPlainObject(bucket) &&
      Number.isInteger(bucket.trade_count) &&
      (bucket.max_duration_seconds === null ||
        isFiniteNumber(bucket.max_duration_seconds))
  );
  if (!valid) return fallback;
  // Defensive ascending sort ("longer than all" = null goes last) so the
  // first-match lookup stays correct even if the backend order drifts.
  const rank = (bucket) => bucket.max_duration_seconds ?? Infinity;
  return raw.map((bucket) => ({ ...bucket })).sort((a, b) => rank(a) - rank(b));
}

function normalizeTradeUnlock(raw, fallback) {
  const isFraction = (value) =>
    isFiniteNumber(value) && value > 0 && value <= 1;
  if (
    isPlainObject(raw) &&
    isFraction(raw.first_unlock_fraction) &&
    isFraction(raw.remaining_window_fraction)
  ) {
    return {
      first_unlock_fraction: raw.first_unlock_fraction,
      remaining_window_fraction: raw.remaining_window_fraction,
    };
  }
  return fallback;
}

function normalizeAccountPolicy(raw, fallback) {
  const value = isPlainObject(raw) ? raw.require_account_to_join : undefined;
  return {
    require_account_to_join:
      typeof value === 'boolean' ? value : fallback.require_account_to_join,
  };
}

function normalizeDefaults(raw, fallback, config) {
  const source = isPlainObject(raw) ? raw : {};
  const pickPreset = (key, ids) =>
    ids.includes(source[key])
      ? source[key]
      : ids.includes(fallback[key])
        ? fallback[key]
        : ids[0];
  return {
    round_type: ROUND_TYPE_VALUES.includes(source.round_type)
      ? source.round_type
      : fallback.round_type,
    sync_round_preset: pickPreset(
      'sync_round_preset',
      config.sync_round_preset_ids
    ),
    async_round_preset: pickPreset(
      'async_round_preset',
      config.async_round_preset_ids
    ),
    async_session_preset: pickPreset(
      'async_session_preset',
      config.async_session_preset_ids
    ),
    enrollment_window_seconds: isFiniteNumber(source.enrollment_window_seconds)
      ? source.enrollment_window_seconds
      : fallback.enrollment_window_seconds,
    scoring_mode: SCORING_CONTROL.ALLOWED_MODES.includes(source.scoring_mode)
      ? source.scoring_mode
      : fallback.scoring_mode,
    // Only a real boolean counts; a missing key (older backend) keeps chat on.
    chat_enabled:
      typeof source.chat_enabled === 'boolean'
        ? source.chat_enabled
        : fallback.chat_enabled,
  };
}

/**
 * Turn a backend `game_config.config` object (possibly partial or malformed)
 * into a complete config. Each top-level key falls back independently.
 * @param {object|null|undefined} raw
 */
export function normalizeGameConfig(raw) {
  const fallback = buildFallbackGameConfig();
  const source = isPlainObject(raw) ? raw : {};
  const presets = normalizePresets(
    source.duration_presets,
    fallback.duration_presets
  );
  const config = {
    duration_presets: presets,
    sync_round_preset_ids: normalizePresetIds(
      source.sync_round_preset_ids,
      presets,
      fallback.sync_round_preset_ids
    ),
    async_round_preset_ids: normalizePresetIds(
      source.async_round_preset_ids,
      presets,
      fallback.async_round_preset_ids
    ),
    async_session_preset_ids: normalizePresetIds(
      source.async_session_preset_ids,
      presets,
      fallback.async_session_preset_ids
    ),
    duration_limits: normalizeRange(
      source.duration_limits,
      fallback.duration_limits,
      'min_seconds',
      'max_seconds'
    ),
    enrollment_window_limits: normalizeRange(
      source.enrollment_window_limits,
      fallback.enrollment_window_limits,
      'min_seconds',
      'max_seconds'
    ),
    trade_count_limits: normalizeRange(
      source.trade_count_limits,
      fallback.trade_count_limits,
      'min',
      'max'
    ),
    trade_defaults: normalizeTradeDefaults(
      source.trade_defaults,
      fallback.trade_defaults
    ),
    trade_unlock: normalizeTradeUnlock(
      source.trade_unlock,
      fallback.trade_unlock
    ),
    account_policy: normalizeAccountPolicy(
      source.account_policy,
      fallback.account_policy
    ),
  };
  config.defaults = normalizeDefaults(
    source.defaults,
    fallback.defaults,
    config
  );
  return config;
}

// ── Effective config resolution ─────────────────────────────────────────────

// Document returned by PATCH /admin/game-config in this page session. /meta may
// be ETag-cached, so the admin page applies its own save result immediately.
let _savedDocument = null;

function isGameConfigDocument(doc) {
  return isPlainObject(doc) && isPlainObject(doc.config);
}

function versionOf(doc) {
  return isFiniteNumber(doc?.version) ? doc.version : -1;
}

/** Remember a game-config document returned by the admin API (or clear it). */
export function setGameConfigDocument(doc) {
  _savedDocument = isGameConfigDocument(doc) ? doc : null;
}

/**
 * The backend document that currently wins: the newer of /meta `game_config`
 * and the document saved from this page; null when neither exists.
 */
export function getActiveGameConfigDocument() {
  const fromMeta = getGlobalMeta()?.game_config;
  const metaDoc = isGameConfigDocument(fromMeta) ? fromMeta : null;
  if (_savedDocument && versionOf(_savedDocument) > versionOf(metaDoc)) {
    return _savedDocument;
  }
  return metaDoc;
}

/**
 * Effective round-setup config: backend `game_config.config` when present,
 * otherwise the fallback built from the src/config constants.
 */
export function getEffectiveGameConfig() {
  const doc = getActiveGameConfigDocument();
  return doc ? normalizeGameConfig(doc.config) : buildFallbackGameConfig();
}

/** Seconds for a preset id, or null when the preset is unknown. */
export function getPresetSeconds(presetId, config = getEffectiveGameConfig()) {
  const presets = config.duration_presets;
  return Object.prototype.hasOwnProperty.call(presets, presetId)
    ? presets[presetId]
    : null;
}

// ── Clamp helpers ───────────────────────────────────────────────────────────

export function clampTradeCount(value, config = getEffectiveGameConfig()) {
  const { min, max } = config.trade_count_limits;
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

/**
 * Clamp an enrollment window to the configured limits. Empty / zero / invalid
 * input falls back to the configured default (same rule as before).
 */
export function clampEnrollmentWindowSeconds(
  value,
  config = getEffectiveGameConfig()
) {
  const { min_seconds: min, max_seconds: max } =
    config.enrollment_window_limits;
  const rounded =
    Math.round(Number(value)) || config.defaults.enrollment_window_seconds;
  return Math.max(min, Math.min(max, rounded));
}

// ── Trade defaults and schedule ─────────────────────────────────────────────

/**
 * Default trade count for a trade window: the first bucket whose
 * max_duration_seconds is >= the duration (null = longer than all) wins.
 */
export function getDefaultTradeCount(
  durationSeconds,
  config = getEffectiveGameConfig()
) {
  const duration = Math.max(
    0,
    Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : 0
  );
  const buckets = config.trade_defaults;
  const match =
    buckets.find(
      (bucket) =>
        bucket.max_duration_seconds === null ||
        duration <= bucket.max_duration_seconds
    ) ?? buckets[buckets.length - 1];
  return clampTradeCount(match.trade_count, config);
}

/**
 * Deterministic trade unlock offsets (seconds from window start). Mirrors the
 * backend: the first unlock at ceil(duration * first_unlock_fraction), the
 * rest evenly spread over remaining_window_fraction of the window, strictly
 * increasing and always < duration.
 */
export function computeTradeUnlockOffsetsSeconds(
  durationSeconds,
  tradeCount,
  config = getEffectiveGameConfig()
) {
  const duration = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const count = clampTradeCount(tradeCount, config);
  if (duration <= 0 || count <= 0) {
    return [];
  }

  const { first_unlock_fraction: firstFraction, remaining_window_fraction } =
    config.trade_unlock;
  const firstUnlock = Math.ceil(duration * firstFraction);
  const interval = (duration * remaining_window_fraction) / count;

  const offsets = [];
  let previous = 0;

  for (let idx = 0; idx < count; idx += 1) {
    let nextOffset = firstUnlock + Math.ceil(interval * idx);
    nextOffset = Math.max(nextOffset, previous + 1);
    nextOffset = Math.min(nextOffset, Math.max(1, duration - 1));
    if (nextOffset <= previous) {
      nextOffset = Math.min(duration - 1, previous + 1);
    }
    offsets.push(nextOffset);
    previous = nextOffset;
  }

  return offsets;
}

/**
 * Short label for a preset ("90s", "5m", "3h", "7d") derived from its seconds,
 * so admin-added presets with unusual lengths still read naturally.
 */
export function formatPresetLabel(presetId, config = getEffectiveGameConfig()) {
  const seconds = getPresetSeconds(presetId, config);
  if (seconds === null) return String(presetId);
  if (seconds < 60 || seconds % 60 !== 0) return `${seconds}s`;
  if (seconds < 3600 || seconds % 3600 !== 0) return `${seconds / 60}m`;
  if (seconds < 86400 || seconds % 86400 !== 0) return `${seconds / 3600}h`;
  return `${seconds / 86400}d`;
}

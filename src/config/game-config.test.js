/**
 * File: src/config/game-config.test.js
 * Purpose: Verify effective game-config resolution (backend /meta
 *          `game_config` vs built-in fallback), per-key normalization of
 *          malformed backend sections, and the helpers built on the config.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const metaState = vi.hoisted(() => ({ globalMeta: null }));
vi.mock('../meta/meta-manager.js', () => ({
  getGlobalMeta: () => metaState.globalMeta,
}));

import {
  buildFallbackGameConfig,
  clampEnrollmentWindowSeconds,
  clampTradeCount,
  computeTradeUnlockOffsetsSeconds,
  formatPresetLabel,
  getActiveGameConfigDocument,
  getDefaultTradeCount,
  getEffectiveGameConfig,
  getPresetSeconds,
  isAsyncRoundType,
  normalizeGameConfig,
  setGameConfigDocument,
} from './game-config.js';
import { ROUND_DURATION_PRESETS } from './game-control-data.js';

const BACKEND_CONFIG = {
  duration_presets: { '2m': 120, '5m': 300, '30m': 1800, '24h': 86400 },
  sync_round_preset_ids: ['2m', '5m'],
  async_round_preset_ids: ['30m', '24h'],
  async_session_preset_ids: ['2m', '5m'],
  defaults: {
    round_type: 'asynchronous',
    sync_round_preset: '2m',
    async_round_preset: '24h',
    async_session_preset: '5m',
    enrollment_window_seconds: 20,
    scoring_mode: 'power',
    chat_enabled: false,
    farming_enabled: true,
    farming_min_duration_seconds: 120,
    farming_reward_rate: 0.1,
  },
  duration_limits: { min_seconds: 30, max_seconds: 7200 },
  enrollment_window_limits: { min_seconds: 15, max_seconds: 60 },
  trade_count_limits: { min: 1, max: 4 },
  trade_defaults: [
    { max_duration_seconds: 300, trade_count: 1 },
    { max_duration_seconds: null, trade_count: 3 },
  ],
  trade_unlock: { first_unlock_fraction: 0.5, remaining_window_fraction: 0.5 },
  account_policy: { require_account_to_join: true },
  farming_min_duration_limits: { min_seconds: 30, max_seconds: 3600 },
  farming_reward_rate_limits: { min: 0.01, max: 0.5 },
};

function doc(config, version = 3) {
  return {
    version,
    updated_at: '2026-10-07T20:00:00Z',
    config_hash: 'abc123def456',
    config,
  };
}

afterEach(() => {
  metaState.globalMeta = null;
  setGameConfigDocument(null);
});

describe('effective config resolution', () => {
  it('uses the fallback built from the src/config constants without game_config', () => {
    metaState.globalMeta = { meta_hash: 'x' };
    const config = getEffectiveGameConfig();
    expect(getActiveGameConfigDocument()).toBeNull();
    expect(config).toEqual(buildFallbackGameConfig());
    expect(config.duration_presets).toEqual(ROUND_DURATION_PRESETS);
    expect(config.sync_round_preset_ids).toEqual(
      Object.keys(ROUND_DURATION_PRESETS)
    );
    expect(config.defaults).toEqual({
      round_type: 'synchronous',
      sync_round_preset: '5m',
      async_round_preset: '30m',
      async_session_preset: '5m',
      enrollment_window_seconds: 10,
      scoring_mode: 'stockpile',
      chat_enabled: true,
      farming_enabled: false,
      farming_min_duration_seconds: 300,
      farming_reward_rate: 0.05,
    });
    expect(config.farming_min_duration_limits).toEqual({
      min_seconds: 10,
      max_seconds: 604800,
    });
    expect(config.farming_reward_rate_limits).toEqual({
      min: 0.0001,
      max: 1,
    });
  });

  it('returns a fresh fallback object so callers cannot mutate constants', () => {
    getEffectiveGameConfig().duration_presets['5m'] = 1;
    expect(ROUND_DURATION_PRESETS['5m']).toBe(300);
  });

  it('prefers the backend game_config from /meta', () => {
    metaState.globalMeta = { game_config: doc(BACKEND_CONFIG) };
    expect(getEffectiveGameConfig()).toEqual(BACKEND_CONFIG);
    expect(getActiveGameConfigDocument().version).toBe(3);
  });

  it('ignores a game_config without a config object', () => {
    metaState.globalMeta = { game_config: { version: 9 } };
    expect(getActiveGameConfigDocument()).toBeNull();
  });

  it('uses a document saved on this page when it is newer than /meta', () => {
    metaState.globalMeta = { game_config: doc(BACKEND_CONFIG, 3) };
    const saved = doc(
      { ...BACKEND_CONFIG, trade_count_limits: { min: 0, max: 2 } },
      4
    );
    setGameConfigDocument(saved);
    expect(getActiveGameConfigDocument()).toBe(saved);
    expect(getEffectiveGameConfig().trade_count_limits).toEqual({
      min: 0,
      max: 2,
    });

    // Once /meta catches up (same or newer version) it wins again.
    metaState.globalMeta = { game_config: doc(BACKEND_CONFIG, 4) };
    expect(getActiveGameConfigDocument()).not.toBe(saved);
  });

  it('uses a saved document when /meta has none and ignores invalid saves', () => {
    setGameConfigDocument(doc(BACKEND_CONFIG, undefined));
    expect(getEffectiveGameConfig().duration_presets['2m']).toBe(120);
    setGameConfigDocument('garbage');
    expect(getActiveGameConfigDocument()).toBeNull();
  });
});

describe('normalizeGameConfig', () => {
  it('falls back per top-level key for malformed sections', () => {
    const fallback = buildFallbackGameConfig();
    const config = normalizeGameConfig({
      duration_presets: { '1m': 0 },
      sync_round_preset_ids: 'nope',
      async_round_preset_ids: ['unknown'],
      async_session_preset_ids: [],
      defaults: 'nope',
      duration_limits: { min_seconds: 10, max_seconds: 5 },
      enrollment_window_limits: null,
      trade_count_limits: { min: '0', max: 3 },
      trade_defaults: [{ max_duration_seconds: '600', trade_count: 1 }],
      trade_unlock: {
        first_unlock_fraction: 2,
        remaining_window_fraction: 0.5,
      },
      account_policy: { require_account_to_join: 'yes' },
      farming_min_duration_limits: { min_seconds: 'x', max_seconds: 5 },
      farming_reward_rate_limits: { min: 0.5, max: 0.1 },
    });
    expect(config).toEqual(fallback);
    expect(fallback.account_policy).toEqual({ require_account_to_join: false });
    expect(normalizeGameConfig(null)).toEqual(fallback);
    // Invalid farming defaults fall back to the seed values (off, 300 s, 5 %).
    expect(
      normalizeGameConfig({
        defaults: {
          farming_enabled: 'yes',
          farming_min_duration_seconds: -5,
          farming_reward_rate: 'high',
        },
      }).defaults
    ).toMatchObject({
      farming_enabled: false,
      farming_min_duration_seconds: 300,
      farming_reward_rate: 0.05,
    });
    // A non-boolean chat default falls back to "chat on" (today's behavior).
    expect(
      normalizeGameConfig({ defaults: { chat_enabled: 'no' } }).defaults
        .chat_enabled
    ).toBe(true);
    expect(
      normalizeGameConfig({ duration_presets: [] }).duration_presets
    ).toEqual(fallback.duration_presets);
    expect(normalizeGameConfig({ trade_defaults: [] }).trade_defaults).toEqual(
      fallback.trade_defaults
    );
  });

  it('drops unknown preset ids and repairs defaults that are not offered', () => {
    const config = normalizeGameConfig({
      duration_presets: { '2m': 120, '9m': 540 },
      sync_round_preset_ids: ['9m', 'ghost', '2m'],
      defaults: {
        sync_round_preset: 'ghost',
        round_type: 'async',
        scoring_mode: 'x',
      },
    });
    expect(config.sync_round_preset_ids).toEqual(['9m', '2m']);
    // Fallback lists reference presets this backend dropped -> all presets.
    expect(config.async_round_preset_ids).toEqual(['2m', '9m']);
    expect(config.defaults.sync_round_preset).toBe('9m');
    expect(config.defaults.round_type).toBe('async');
    expect(config.defaults.scoring_mode).toBe('stockpile');
  });

  it('keeps fallback preset lists when they fit the backend presets', () => {
    const config = normalizeGameConfig({
      duration_presets: { ...ROUND_DURATION_PRESETS, '2m': 120 },
      defaults: { async_session_preset: '24h' },
    });
    expect(config.async_session_preset_ids).toContain('24h');
    expect(config.defaults.async_session_preset).toBe('24h');
  });

  it('sorts trade buckets ascending with the open-ended bucket last', () => {
    const config = normalizeGameConfig({
      trade_defaults: [
        { max_duration_seconds: null, trade_count: 6 },
        { max_duration_seconds: 900, trade_count: 1 },
      ],
    });
    expect(config.trade_defaults.map((b) => b.max_duration_seconds)).toEqual([
      900,
      null,
    ]);
  });
});

describe('helpers on an explicit config', () => {
  const config = normalizeGameConfig(BACKEND_CONFIG);

  it('resolves preset seconds and labels', () => {
    expect(getPresetSeconds('2m', config)).toBe(120);
    expect(getPresetSeconds('constructor', config)).toBeNull();
    expect(getPresetSeconds('5m')).toBe(300);
    const labels = normalizeGameConfig({
      duration_presets: {
        a: 45,
        b: 90,
        c: 5400,
        d: 7200,
        e: 129600,
        f: 604800,
      },
    });
    expect(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => formatPresetLabel(id, labels))
    ).toEqual(['45s', '90s', '90m', '2h', '36h', '7d']);
    expect(formatPresetLabel('missing', labels)).toBe('missing');
  });

  it('clamps trade counts and enrollment windows to the configured limits', () => {
    expect(clampTradeCount(9, config)).toBe(4);
    expect(clampTradeCount('abc', config)).toBe(1);
    expect(clampEnrollmentWindowSeconds(5, config)).toBe(15);
    expect(clampEnrollmentWindowSeconds('', config)).toBe(20);
    expect(clampEnrollmentWindowSeconds(500, config)).toBe(60);
  });

  it('picks the first bucket whose max covers the duration', () => {
    expect(getDefaultTradeCount(300, config)).toBe(1);
    expect(getDefaultTradeCount(301, config)).toBe(3);
    expect(getDefaultTradeCount('bad', config)).toBe(1);
    const closed = normalizeGameConfig({
      trade_defaults: [{ max_duration_seconds: 60, trade_count: 2 }],
    });
    // No open-ended bucket: longer windows use the last bucket.
    expect(getDefaultTradeCount(5000, closed)).toBe(2);
  });

  it('spreads unlock offsets with the configured fractions', () => {
    expect(computeTradeUnlockOffsetsSeconds(1000, 2, config)).toEqual([
      500, 750,
    ]);
    expect(computeTradeUnlockOffsetsSeconds(0, 2, config)).toEqual([]);
    // Offsets always stay below the window length.
    expect(computeTradeUnlockOffsetsSeconds(3, 4, config)).toEqual([
      2, 2, 2, 2,
    ]);
  });

  it('recognizes async round type spellings', () => {
    expect(isAsyncRoundType('asynchronous')).toBe(true);
    expect(isAsyncRoundType('async')).toBe(true);
    expect(isAsyncRoundType('synchronous')).toBe(false);
  });
});

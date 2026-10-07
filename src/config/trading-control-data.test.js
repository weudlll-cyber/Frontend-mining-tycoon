// Tests deterministic trading schedule defaults and unlock offsets with the
// built-in fallback config (no backend game_config).
import { describe, expect, it } from 'vitest';
import {
  TRADE_COUNT_LIMITS,
  TRADE_DEFAULT_BUCKETS,
} from './trading-control-data.js';
import {
  buildFallbackGameConfig,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from './game-config.js';

// The pre-game-config algorithm (inclusive ranges + nearest bucket center for
// gaps), kept here to prove the fallback buckets reproduce it exactly.
function legacyDefaultTradeCount(duration) {
  if (duration >= 86400) return 6;
  const ranges = [
    [300, 600, 0],
    [900, 1800, 2],
    [2700, 3600, 3],
    [7200, 10800, 4],
    [21600, 43200, 5],
  ];
  const range = ranges.find(([min, max]) => duration >= min && duration <= max);
  if (range) return range[2];
  const centers = [
    [600, 0],
    [1350, 2],
    [3150, 3],
    [9000, 4],
    [32400, 5],
    [86400, 6],
  ];
  return centers.reduce((best, candidate) =>
    Math.abs(duration - candidate[0]) < Math.abs(duration - best[0])
      ? candidate
      : best
  )[1];
}

describe('trading-control-data', () => {
  it('exports trade count limits', () => {
    expect(TRADE_COUNT_LIMITS.min).toBe(0);
    expect(TRADE_COUNT_LIMITS.max).toBe(10);
  });

  it('keeps the fallback buckets ascending with a final "longer" bucket', () => {
    expect(TRADE_DEFAULT_BUCKETS.at(-1).max_duration_seconds).toBeNull();
    const maxes = TRADE_DEFAULT_BUCKETS.slice(0, -1).map(
      (bucket) => bucket.max_duration_seconds
    );
    expect([...maxes].sort((a, b) => a - b)).toEqual(maxes);
  });

  it('maps duration defaults to expected buckets', () => {
    expect(getDefaultTradeCount(300)).toBe(0);
    expect(getDefaultTradeCount(600)).toBe(0);
    expect(getDefaultTradeCount(900)).toBe(2);
    expect(getDefaultTradeCount(1800)).toBe(2);
    expect(getDefaultTradeCount(2700)).toBe(3);
    expect(getDefaultTradeCount(3600)).toBe(3);
    expect(getDefaultTradeCount(7200)).toBe(4);
    expect(getDefaultTradeCount(10800)).toBe(4);
    expect(getDefaultTradeCount(21600)).toBe(5);
    expect(getDefaultTradeCount(43200)).toBe(5);
    expect(getDefaultTradeCount(86400)).toBe(6);
  });

  it('uses nearest bucket for uncovered durations', () => {
    expect(getDefaultTradeCount(2400)).toBe(3);
    expect(getDefaultTradeCount(54000)).toBe(5);
  });

  it('reproduces the legacy default for every whole second up to 8 days', () => {
    const config = buildFallbackGameConfig();
    for (let duration = 0; duration <= 8 * 86400; duration += 1) {
      if (
        getDefaultTradeCount(duration, config) !==
        legacyDefaultTradeCount(duration)
      ) {
        throw new Error(`mismatch at ${duration}s`);
      }
    }
  });

  it('computes deterministic unlock offsets with strict monotonicity', () => {
    const offsets = computeTradeUnlockOffsetsSeconds(3600, 3);
    expect(offsets).toEqual([720, 1680, 2640]);
  });

  it('returns empty schedule when trade count is zero', () => {
    expect(computeTradeUnlockOffsetsSeconds(3600, 0)).toEqual([]);
  });
});

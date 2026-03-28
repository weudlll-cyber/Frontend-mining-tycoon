// Tests deterministic trading schedule defaults and unlock offsets.
import { describe, expect, it } from 'vitest';
import {
  TRADE_COUNT_LIMITS,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from './trading-control-data.js';

describe('trading-control-data', () => {
  it('exports trade count limits', () => {
    expect(TRADE_COUNT_LIMITS.min).toBe(0);
    expect(TRADE_COUNT_LIMITS.max).toBe(10);
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

  it('computes deterministic unlock offsets with strict monotonicity', () => {
    const offsets = computeTradeUnlockOffsetsSeconds(3600, 3);
    expect(offsets.length).toBe(3);
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[1]).toBeGreaterThan(offsets[0]);
    expect(offsets[2]).toBeGreaterThan(offsets[1]);
    expect(offsets[2]).toBeLessThan(3600);
  });

  it('returns empty schedule when trade count is zero', () => {
    expect(computeTradeUnlockOffsetsSeconds(3600, 0)).toEqual([]);
  });
});

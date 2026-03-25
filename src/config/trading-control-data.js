/**
 * This is tuning/control data for trade defaults and schedule rules.
 * UI modules must import from here and must not duplicate trade default numbers.
 */

export const TRADE_COUNT_LIMITS = { min: 0, max: 10 };

export const FIRST_TRADE_UNLOCK_FRACTION = 0.2;
export const REMAINING_WINDOW_FRACTION = 0.8;

const TRADE_DEFAULT_RANGES = [
  { minSeconds: 300, maxSeconds: 600, tradeCount: 0 },
  { minSeconds: 900, maxSeconds: 1800, tradeCount: 2 },
  { minSeconds: 2700, maxSeconds: 3600, tradeCount: 3 },
  { minSeconds: 7200, maxSeconds: 10800, tradeCount: 4 },
  { minSeconds: 21600, maxSeconds: 43200, tradeCount: 5 },
];

const NEAREST_BUCKETS = [
  { centerSeconds: 600, tradeCount: 0 },
  { centerSeconds: 1350, tradeCount: 2 },
  { centerSeconds: 3150, tradeCount: 3 },
  { centerSeconds: 9000, tradeCount: 4 },
  { centerSeconds: 32400, tradeCount: 5 },
  { centerSeconds: 86400, tradeCount: 6 },
];

export function clampTradeCount(value) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  const rounded = Math.round(numeric);
  return Math.max(
    TRADE_COUNT_LIMITS.min,
    Math.min(TRADE_COUNT_LIMITS.max, rounded)
  );
}

export function getDefaultTradeCount(durationSeconds) {
  const duration = Math.max(0, Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : 0);

  if (duration >= 86400) {
    return clampTradeCount(6);
  }

  const matchingRange = TRADE_DEFAULT_RANGES.find(
    (range) => duration >= range.minSeconds && duration <= range.maxSeconds
  );
  if (matchingRange) {
    return clampTradeCount(matchingRange.tradeCount);
  }

  // For gaps (for example 31m-44m or 13h-23h), pick the nearest configured bucket.
  const nearest = NEAREST_BUCKETS.reduce((best, candidate) => {
    if (!best) return candidate;
    const bestDistance = Math.abs(duration - best.centerSeconds);
    const candidateDistance = Math.abs(duration - candidate.centerSeconds);
    return candidateDistance < bestDistance ? candidate : best;
  }, null);

  return clampTradeCount(nearest?.tradeCount ?? 0);
}

export function computeTradeUnlockOffsetsSeconds(durationSeconds, tradeCount) {
  const duration = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const count = clampTradeCount(tradeCount);
  if (duration <= 0 || count <= 0) {
    return [];
  }

  const firstUnlock = Math.ceil(duration * FIRST_TRADE_UNLOCK_FRACTION);
  const remainingWindow = duration * REMAINING_WINDOW_FRACTION;
  const interval = remainingWindow / count;

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

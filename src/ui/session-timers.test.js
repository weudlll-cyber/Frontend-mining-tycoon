import { describe, expect, it } from 'vitest';
import {
  computeRoundRemainingSeconds,
  normalizeSessionTimerInputs,
  shouldReuseSessionElapsedTimer,
  computeElapsedSeconds,
  isSessionExpired,
  computeSessionLeftSeconds,
} from './session-timers.js';

describe('session-timers helpers', () => {
  it('computes round remaining seconds from stream payload and age', () => {
    const nowMs = 20000;
    const lastGameData = {
      seconds_remaining: 30,
      timestamp: 15000,
    };

    expect(computeRoundRemainingSeconds(lastGameData, nowMs)).toBe(25);
    expect(computeRoundRemainingSeconds({}, nowMs)).toBeNull();
  });

  it('normalizes session timer inputs and rejects invalid start', () => {
    expect(normalizeSessionTimerInputs('nope', 0)).toBeNull();
    expect(normalizeSessionTimerInputs(100, 'bad')).toEqual({
      normalizedStartUnix: 100,
      nextInitialElapsed: 0,
    });
  });

  it('detects timer reuse for same anchor while interval exists', () => {
    const fakeInterval = {};
    expect(
      shouldReuseSessionElapsedTimer({
        sessionElapsedInterval: fakeInterval,
        sessionElapsedAnchorUnix: 10,
        normalizedStartUnix: 10,
      })
    ).toBe(true);
    expect(
      shouldReuseSessionElapsedTimer({
        sessionElapsedInterval: null,
        sessionElapsedAnchorUnix: 10,
        normalizedStartUnix: 10,
      })
    ).toBe(false);
  });

  it('computes elapsed and session-left values safely', () => {
    const elapsed = computeElapsedSeconds({
      sessionElapsedSeedSeconds: 4,
      sessionElapsedAnchorUnix: 10,
      nowSeconds: 20,
    });
    expect(elapsed).toBe(10);

    expect(
      isSessionExpired({ sessionDurationSec: 10, elapsedSeconds: elapsed })
    ).toBe(true);
    expect(
      computeSessionLeftSeconds({ sessionDurationSec: 10, elapsedSeconds: elapsed })
    ).toBe(0);
    expect(
      computeSessionLeftSeconds({ sessionDurationSec: null, elapsedSeconds: 8 })
    ).toBe(8);
  });
});

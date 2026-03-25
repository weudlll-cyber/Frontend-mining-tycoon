/**
File: src/ui/countdown.test.js
Purpose: Guard countdown display formatting against regressions.
*/

import { describe, expect, it } from 'vitest';
import { formatCountdown } from './countdown.js';

describe('formatCountdown', () => {
  it('renders zero as full hh:mm:ss', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
  });

  it('renders sub-minute values as hh:mm:ss', () => {
    expect(formatCountdown(9)).toBe('00:00:09');
  });

  it('renders minute and hour boundaries as hh:mm:ss', () => {
    expect(formatCountdown(65)).toBe('00:01:05');
    expect(formatCountdown(3605)).toBe('01:00:05');
  });

  it('clamps negative values to zero', () => {
    expect(formatCountdown(-10)).toBe('00:00:00');
  });

  it('returns placeholder for invalid values', () => {
    expect(formatCountdown(undefined)).toBe('-');
    expect(formatCountdown(Number.NaN)).toBe('-');
  });
});

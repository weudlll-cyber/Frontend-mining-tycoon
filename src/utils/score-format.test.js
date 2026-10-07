/**
File: src/utils/score-format.test.js
Purpose: Verify per-mode score formatting (integers vs efficiency ratios).
*/

import { describe, expect, it } from 'vitest';
import { formatBackendScore, isEfficiencyScoringMode } from './score-format.js';

describe('formatBackendScore', () => {
  it('formats efficiency scores as 4-decimal ratios', () => {
    expect(formatBackendScore(1.2345, 'efficiency')).toBe('1.2345×');
    expect(formatBackendScore(1, 'efficiency_system_mastery')).toBe('1.0000×');
  });

  it('formats other modes (and a missing mode = stockpile) as integers', () => {
    expect(formatBackendScore(12345, 'stockpile')).toBe('12,345');
    expect(formatBackendScore(12345.9, null)).toBe('12,345');
    expect(formatBackendScore(98765, 'mining_time', { grouping: false })).toBe(
      '98765'
    );
  });

  it('returns a dash for missing or invalid values', () => {
    expect(formatBackendScore(null, 'efficiency')).toBe('—');
    expect(formatBackendScore(undefined, 'stockpile')).toBe('—');
    expect(formatBackendScore('abc', 'stockpile')).toBe('—');
  });

  it('detects efficiency modes case-insensitively', () => {
    expect(isEfficiencyScoringMode(' Efficiency ')).toBe(true);
    expect(isEfficiencyScoringMode('power')).toBe(false);
    expect(isEfficiencyScoringMode(undefined)).toBe(false);
  });
});

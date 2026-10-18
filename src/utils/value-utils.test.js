import { describe, expect, it } from 'vitest';
import {
  formatRatePercent,
  isFiniteNumber,
  formatTokenName,
  isPlainObject,
  toFiniteNumber,
} from './value-utils.js';

describe('value-utils', () => {
  it('isPlainObject accepts objects only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('isFiniteNumber rejects numeric strings and NaN', () => {
    expect(isFiniteNumber(1.5)).toBe(true);
    expect(isFiniteNumber('1')).toBe(false);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
  });

  it('toFiniteNumber parses numbers and numeric strings', () => {
    expect(toFiniteNumber('2.5')).toBe(2.5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber('')).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber('abc')).toBeNull();
  });

  it('formatRatePercent avoids float noise', () => {
    expect(formatRatePercent(0.0125)).toBe('1.25');
    expect(formatRatePercent(0.07)).toBe('7');
    expect(formatRatePercent(0.05, { suffix: '%' })).toBe('5%');
    expect(formatRatePercent(undefined)).toBeNull();
    expect(formatRatePercent('x', { fallback: '--' })).toBe('--');
  });

  it('formatTokenName capitalizes the first letter only', () => {
    expect(formatTokenName('summer')).toBe('Summer');
    expect(formatTokenName(' autumn ')).toBe('Autumn');
    expect(formatTokenName('')).toBe('Unknown');
    expect(formatTokenName(null)).toBe('Unknown');
  });
});

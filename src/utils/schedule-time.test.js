/**
File: src/utils/schedule-time.test.js
Purpose: Verify the scheduled-round time helpers: local datetime-local parsing
  (unix seconds UTC), local formatting, countdown text and the time-zone hint.
*/

import { describe, expect, it } from 'vitest';
import {
  describeLocalTimeZone,
  formatLocalDateTime,
  formatLocalTime,
  formatOpensAtShort,
  formatOpensIn,
  normalizeUnixSeconds,
  nowUnixSeconds,
  parseLocalDateTimeInput,
  toDateTimeLocalValue,
} from './schedule-time.js';

describe('schedule-time', () => {
  it('normalizes unix seconds', () => {
    expect(normalizeUnixSeconds(1800000000)).toBe(1800000000);
    expect(normalizeUnixSeconds('1800000000')).toBe(1800000000);
    expect(normalizeUnixSeconds(null)).toBeNull();
    expect(normalizeUnixSeconds(undefined)).toBeNull();
    expect(normalizeUnixSeconds('')).toBeNull();
    expect(normalizeUnixSeconds('soon')).toBeNull();
    expect(normalizeUnixSeconds(0)).toBeNull();
    expect(nowUnixSeconds(12_345)).toBe(12);
  });

  it('parses a datetime-local value as local time and round-trips it', () => {
    const expected = Math.floor(new Date(2026, 9, 9, 14, 30).getTime() / 1000);
    expect(parseLocalDateTimeInput('2026-10-09T14:30')).toBe(expected);
    expect(parseLocalDateTimeInput('2026-10-09T14:30:15')).toBe(expected + 15);
    expect(toDateTimeLocalValue(expected)).toBe('2026-10-09T14:30');
    expect(parseLocalDateTimeInput('')).toBeNull();
    expect(parseLocalDateTimeInput('tomorrow')).toBeNull();
    expect(parseLocalDateTimeInput(undefined)).toBeNull();
  });

  it('formats local times', () => {
    const at = Math.floor(new Date(2026, 9, 9, 7, 5).getTime() / 1000);
    expect(formatLocalTime(at)).toBe('07:05');
    expect(formatLocalDateTime(at)).toMatch(/2026.*, 07:05$/);
    const now = new Date(2026, 9, 9, 6, 0).getTime();
    expect(formatOpensAtShort(at, now)).toBe('07:05');
    // More than a day away: the date is added so the time is unambiguous.
    const later = at + 3 * 86400;
    expect(formatOpensAtShort(later, now)).toMatch(/\S+ .*07:05$/);
    expect(formatOpensAtShort(later, now)).not.toBe('07:05');
  });

  it('formats countdowns', () => {
    expect(formatOpensIn(45)).toBe('45 s');
    expect(formatOpensIn(-3)).toBe('0 s');
    expect(formatOpensIn('x')).toBe('0 s');
    expect(formatOpensIn(300)).toBe('5 min');
    expect(formatOpensIn(3900)).toBe('1 h 05 min');
    expect(formatOpensIn(2 * 3600 + 15 * 60)).toBe('2 h 15 min');
    expect(formatOpensIn(2 * 86400 + 3 * 3600)).toBe('2 d 03 h');
  });

  it('describes the local time zone with its UTC offset', () => {
    expect(describeLocalTimeZone()).toMatch(/UTC[+-]\d\d:\d\d\)?$/);
  });
});

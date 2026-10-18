import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration-format.js';

describe('formatDuration clock style', () => {
  it('formats mm:ss with unbounded minutes', () => {
    expect(formatDuration(0, { style: 'clock' })).toBe('00:00');
    expect(formatDuration(65.9, { style: 'clock' })).toBe('01:05');
    expect(formatDuration(7260, { style: 'clock' })).toBe('121:00');
    expect(formatDuration(-4, { style: 'clock' })).toBe('00:00');
  });

  it('formats HH:MM:SS with hours', () => {
    expect(formatDuration(3605, { style: 'clock', hours: true })).toBe(
      '01:00:05'
    );
  });

  it('returns the fallback for missing or invalid input', () => {
    expect(formatDuration(null, { style: 'clock', fallback: '-' })).toBe('-');
    expect(formatDuration('x', { style: 'clock', fallback: '-' })).toBe('-');
    expect(formatDuration(undefined, { style: 'clock' })).toBe('00:00');
  });
});

describe('formatDuration compact style', () => {
  it('shows two units by default, keeping a zero minor part', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(90061)).toBe('1d 1h');
  });

  it('limits the unit range', () => {
    expect(formatDuration(59, { largest: 'h', smallest: 'm' })).toBe('0m');
    expect(formatDuration(90000, { largest: 'h', smallest: 'm' })).toBe(
      '25h 0m'
    );
  });

  it('keeps the leading unit at least minLeading', () => {
    expect(formatDuration(30, { largest: 'h', minLeading: 'm' })).toBe(
      '0m 30s'
    );
  });

  it('pads minor parts (all or selected units)', () => {
    expect(formatDuration(3661, { largest: 'h', pad: true })).toBe('1h 01m');
    expect(formatDuration(90000, { pad: ['m'] })).toBe('1d 1h');
    expect(formatDuration(3660, { pad: ['m'] })).toBe('1h 01m');
  });

  it('drops a zero minor part when asked', () => {
    expect(formatDuration(86400, { keepZeroMinor: false })).toBe('1d');
  });

  it('rounds or floors and signs', () => {
    expect(formatDuration(59.6, { round: 'round' })).toBe('1m 0s');
    expect(formatDuration(59.6)).toBe('59s');
    expect(formatDuration(-90, { signed: true })).toBe('-1m 30s');
    expect(formatDuration(90, { signed: true })).toBe('+1m 30s');
  });

  it('shows a single rounded unit with parts: 1', () => {
    expect(formatDuration(45, { parts: 1 })).toBe('45s');
    expect(formatDuration(5400, { parts: 1, round: 'round' })).toBe('2h');
    expect(formatDuration(5400, { parts: 1 })).toBe('1h');
    expect(formatDuration(0, { parts: 1 })).toBe('0s');
  });
});

describe('formatDuration long style', () => {
  it('uses spaced units and drops seconds above one minute', () => {
    expect(formatDuration(45, { style: 'long' })).toBe('45 s');
    expect(formatDuration(330, { style: 'long' })).toBe('5 min');
    expect(formatDuration(3900, { style: 'long' })).toBe('1 h 05 min');
    expect(formatDuration(183600, { style: 'long' })).toBe('2 d 03 h');
  });
});

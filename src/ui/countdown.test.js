/**
File: src/ui/countdown.test.js
Purpose: Guard countdown display formatting against regressions.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCountdownInterval,
  formatCountdown,
  getCountdownInterval,
  initCountdown,
  startCountdownTimer,
  startEnrollmentCountdown,
  stopCountdownTimer,
} from './countdown.js';

function createDomRefs() {
  const countdownEl = document.createElement('div');
  const countdownLabelEl = document.createElement('div');
  return { countdownEl, countdownLabelEl };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-25T12:00:00.000Z'));
});

afterEach(() => {
  clearCountdownInterval();
  vi.useRealTimers();
});

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

describe('countdown runtime behavior', () => {
  it('updates game countdown from seconds_remaining and elapsed wall clock', () => {
    const els = createDomRefs();
    const now = Date.now();
    initCountdown(els, {
      get: () => ({
        seconds_remaining: 10,
        timestamp: now,
      }),
    });

    startCountdownTimer();
    expect(els.countdownEl.textContent).toBe('00:00:10');

    vi.setSystemTime(new Date(now + 3500));
    vi.advanceTimersByTime(100);
    expect(els.countdownEl.textContent).toBe('00:00:06');
  });

  it('updates enrollment countdown from enrollment_seconds_remaining', () => {
    const els = createDomRefs();
    const now = Date.now();
    initCountdown(els, {
      get: () => ({
        enrollment_seconds_remaining: 65,
        timestamp: now,
      }),
    });

    startEnrollmentCountdown();
    expect(els.countdownEl.textContent).toBe('00:01:05');

    vi.setSystemTime(new Date(now + 5000));
    vi.advanceTimersByTime(100);
    expect(els.countdownEl.textContent).toBe('00:00:59');
  });

  it('renders placeholder when countdown payload values are missing', () => {
    const els = createDomRefs();
    initCountdown(els, {
      get: () => ({
        seconds_remaining: null,
        timestamp: Date.now(),
      }),
    });

    startCountdownTimer();
    expect(els.countdownEl.textContent).toBe('-');
  });

  it('stopCountdownTimer clears interval and resets label/value display', () => {
    const els = createDomRefs();
    initCountdown(els, {
      get: () => ({
        seconds_remaining: 30,
        timestamp: Date.now(),
      }),
    });

    startCountdownTimer();
    expect(getCountdownInterval()).toBeTruthy();

    stopCountdownTimer();
    expect(getCountdownInterval()).toBeNull();
    expect(els.countdownLabelEl.textContent).toBe('Time Remaining');
    expect(els.countdownEl.textContent).toBe('-');
  });

  it('clearCountdownInterval stops active timer without mutating display text', () => {
    const els = createDomRefs();
    initCountdown(els, {
      get: () => ({
        seconds_remaining: 5,
        timestamp: Date.now(),
      }),
    });

    startCountdownTimer();
    const snapshot = els.countdownEl.textContent;

    clearCountdownInterval();
    expect(getCountdownInterval()).toBeNull();
    expect(els.countdownEl.textContent).toBe(snapshot);
  });
});

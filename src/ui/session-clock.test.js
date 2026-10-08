// Tests the async-session header clock and the secondary "Round left" hint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let clock;
let boardState;
let els;
let onSessionExpired;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  document.body.innerHTML = `
    <span id="countdown-label"></span>
    <span id="countdown"></span>
    <span id="round-remaining-hint" hidden>Round left: <span id="round-remaining"></span></span>
  `;
  els = {
    countdownEl: document.getElementById('countdown'),
    countdownLabelEl: document.getElementById('countdown-label'),
    roundRemainingHintEl: document.getElementById('round-remaining-hint'),
    roundRemainingEl: document.getElementById('round-remaining'),
  };
  ({ boardState } = await import('./board-state.js'));
  clock = await import('./session-clock.js');
  onSessionExpired = vi.fn();
  clock.initSessionClock({ ...els, onSessionExpired });
});

afterEach(() => {
  clock.stopSessionElapsedTimer();
  vi.useRealTimers();
});

describe('round remaining hint', () => {
  it('shows the round time left from the latest payload', () => {
    boardState.lastGameData = { seconds_remaining: 125, timestamp: Date.now() };
    clock.startRoundRemainingHintTimer();

    expect(els.roundRemainingHintEl.hidden).toBe(false);
    expect(els.roundRemainingEl.textContent).not.toBe('');
  });

  it('hides the hint when the payload has no round countdown', () => {
    els.roundRemainingHintEl.hidden = false;
    boardState.lastGameData = {};
    clock.startRoundRemainingHintTimer();

    expect(els.roundRemainingHintEl.hidden).toBe(true);
  });

  it('restarts cleanly and is hidden again by stopSessionElapsedTimer', () => {
    boardState.lastGameData = { seconds_remaining: 60, timestamp: Date.now() };
    clock.startRoundRemainingHintTimer();
    clock.startRoundRemainingHintTimer();
    vi.advanceTimersByTime(1000);
    expect(els.roundRemainingHintEl.hidden).toBe(false);

    clock.stopSessionElapsedTimer();
    expect(els.roundRemainingHintEl.hidden).toBe(true);
    expect(els.countdownLabelEl.textContent).toBe('Time Remaining');
    expect(els.countdownEl.textContent).toBe('-');
  });
});

describe('session elapsed timer', () => {
  it('counts the session down and reports expiry once the duration is reached', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    boardState.activeSession = { sessionId: 's1', sessionDurationSec: 30 };
    clock.startSessionElapsedTimer(nowUnix, 0);

    expect(els.countdownLabelEl.textContent).toBe('Session Left');
    expect(onSessionExpired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(31_000);
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it('keeps the running interval for the same session start', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    boardState.activeSession = { sessionId: 's1', sessionDurationSec: 600 };
    clock.startSessionElapsedTimer(nowUnix, 5);
    const before = els.countdownEl.textContent;
    clock.startSessionElapsedTimer(nowUnix, 10);

    expect(els.countdownEl.textContent).toBe(before);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('ignores an invalid session start', () => {
    clock.startSessionElapsedTimer(Number.NaN, 0);
    expect(els.countdownLabelEl.textContent).toBe('');
  });
});

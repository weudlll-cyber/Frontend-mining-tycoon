/*
File: src/ui/countdown.js
Purpose: Game and enrollment countdown timer display.
Manages the countdown interval and renders remaining seconds into the provided DOM elements.
Call init() once with the display elements before using the other exports.
*/

let _countdownEl = null;
let _countdownLabelEl = null;
let _countdownInterval = null;
let _lastGameDataRef = null;

/**
 * Wire up the DOM elements used by this module.
 * @param {{ countdownEl: HTMLElement, countdownLabelEl: HTMLElement }} els
 * @param {{ get: () => object|null }} lastGameDataAccessor
 */
export function initCountdown(els, lastGameDataAccessor) {
  _countdownEl = els.countdownEl;
  _countdownLabelEl = els.countdownLabelEl;
  _lastGameDataRef = lastGameDataAccessor;
}

export function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '-';
  }
  const s = Math.max(0, Math.floor(seconds));
  return String(s).padStart(2, '0');
}

function updateCountdown() {
  const lastGameData = _lastGameDataRef?.get();
  if (!lastGameData || lastGameData.seconds_remaining === null) {
    _countdownEl.textContent = '-';
    return;
  }
  const elapsed = (Date.now() - lastGameData.timestamp) / 1000;
  const remaining = Math.max(0, lastGameData.seconds_remaining - elapsed);
  _countdownEl.textContent = formatCountdown(remaining);
}

function updateEnrollmentCountdown() {
  const lastGameData = _lastGameDataRef?.get();
  if (!lastGameData || lastGameData.enrollment_seconds_remaining === null) {
    _countdownEl.textContent = '-';
    return;
  }
  const elapsed = (Date.now() - lastGameData.timestamp) / 1000;
  const remaining = Math.max(
    0,
    lastGameData.enrollment_seconds_remaining - elapsed
  );
  _countdownEl.textContent = formatCountdown(remaining);
}

export function startCountdownTimer() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  updateCountdown();
  _countdownInterval = setInterval(updateCountdown, 100);
}

export function startEnrollmentCountdown() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  updateEnrollmentCountdown();
  _countdownInterval = setInterval(updateEnrollmentCountdown, 100);
}

export function stopCountdownTimer() {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
  if (_countdownLabelEl) _countdownLabelEl.textContent = 'Time Remaining';
  if (_countdownEl) _countdownEl.textContent = '-';
}

/** Returns the raw interval ID (used by stream-level tear-down). */
export function getCountdownInterval() {
  return _countdownInterval;
}

/** Forcefully clear the interval without resetting display. */
export function clearCountdownInterval() {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
}

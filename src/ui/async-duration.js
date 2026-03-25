/**
File: src/ui/async-duration.js
Purpose: Async host/session duration helper logic used by setup controls.
Key responsibilities:
- Convert duration presets to seconds for comparisons.
- Enforce session-duration <= round-duration in host controls.
- Resolve selected async round/session durations into payload-safe values.
Invariants:
- Session duration must never exceed selected async round duration.
- Unknown presets degrade gracefully to safe defaults.
Security notes:
- Pure client-side UI helpers; no network or token handling.
*/

import {
  ROUND_DURATION_PRESETS,
  ASYNC_ROUND_PRESET_IDS,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_PRESET_IDS,
  ASYNC_SESSION_DEFAULT_PRESET,
} from '../config/game-control-data.js';

/**
 * Converts a preset label (e.g. "5m", "3h", "7d") to seconds.
 * Returns null for unknown labels so callers can handle unsupported presets safely.
 */
export function presetToSeconds(preset) {
  return Object.prototype.hasOwnProperty.call(ROUND_DURATION_PRESETS, preset)
    ? ROUND_DURATION_PRESETS[preset]
    : null;
}

/**
 * Enforces session duration <= round duration by disabling invalid options.
 * If the selected session option becomes invalid, it clamps to the largest valid option.
 */
export function syncSessionDurationOptions({
  roundDurationInput,
  sessionDurationInput,
  warningEl,
  enforceLimit = true,
}) {
  if (!roundDurationInput || !sessionDurationInput) return;

  if (!enforceLimit) {
    for (const opt of sessionDurationInput.options) {
      opt.disabled = false;
    }
    if (warningEl) {
      warningEl.textContent = '';
      warningEl.hidden = true;
    }
    return;
  }

  const roundSeconds = presetToSeconds(roundDurationInput.value);
  if (roundSeconds === null) return;

  let lastValidValue = null;
  for (const opt of sessionDurationInput.options) {
    const optSec = presetToSeconds(opt.value);
    const tooLong = optSec !== null && optSec > roundSeconds;
    opt.disabled = tooLong;
    if (!tooLong) lastValidValue = opt.value;
  }

  const currentOpt = sessionDurationInput.selectedOptions[0];
  const hadToClamp = Boolean(currentOpt?.disabled) && lastValidValue !== null;
  if (hadToClamp) {
    sessionDurationInput.value = lastValidValue;
  }

  if (!warningEl) return;
  if (hadToClamp) {
    const roundLabel = roundDurationInput.value;
    const newLabel = sessionDurationInput.value;
    warningEl.textContent = `Session clamped to ${newLabel} - must be <= round (${roundLabel})`;
    warningEl.hidden = false;
    return;
  }

  warningEl.textContent = '';
  warningEl.hidden = true;
}

export function getAsyncDurationPreset(roundDurationInput) {
  const selectedPreset = String(
    roundDurationInput?.value || ASYNC_ROUND_DEFAULT_PRESET
  );
  const allowed = new Set(ASYNC_ROUND_PRESET_IDS);
  return allowed.has(selectedPreset)
    ? selectedPreset
    : ASYNC_ROUND_DEFAULT_PRESET;
}

export function getAsyncSessionDurationSeconds(sessionDurationInput) {
  const selected = String(
    sessionDurationInput?.value || ASYNC_SESSION_DEFAULT_PRESET
  );
  const isValidSession = ASYNC_SESSION_PRESET_IDS.includes(selected);
  const seconds = ROUND_DURATION_PRESETS[selected];
  if (isValidSession && seconds !== undefined) {
    return seconds;
  }
  return ROUND_DURATION_PRESETS[ASYNC_SESSION_DEFAULT_PRESET];
}

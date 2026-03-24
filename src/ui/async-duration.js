/*
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

/**
 * Converts a preset label (e.g. "5m", "3h", "7d") to seconds.
 * Returns null for unknown labels so callers can handle unsupported presets safely.
 */
export function presetToSeconds(preset) {
  const map = {
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '60m': 3600,
    '3h': 10800,
    '6h': 21600,
    '12h': 43200,
    '24h': 86400,
    '3d': 259200,
    '7d': 604800,
    // Session-only alias.
    '30m': 1800,
  };
  return Object.prototype.hasOwnProperty.call(map, preset) ? map[preset] : null;
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
  const selectedPreset = String(roundDurationInput?.value || '10m');
  const allowed = new Set([
    '5m',
    '10m',
    '15m',
    '60m',
    '3h',
    '6h',
    '12h',
    '24h',
    '3d',
    '7d',
  ]);
  return allowed.has(selectedPreset) ? selectedPreset : '10m';
}

export function getAsyncSessionDurationSeconds(sessionDurationInput) {
  const selected = String(sessionDurationInput?.value || '24h');
  const presetSeconds = {
    '5m': 300,
    '10m': 600,
    '30m': 1800,
    '60m': 3600,
    '6h': 21600,
    '12h': 43200,
    '24h': 86400,
  };
  return presetSeconds[selected] || 86400;
}

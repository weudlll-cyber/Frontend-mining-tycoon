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
- Presets, offered preset lists and defaults come from the effective game
  config (backend /meta `game_config`, fallback src/config constants).
Security notes:
- Pure client-side UI helpers; no network or token handling. Options are
  built with createElement/textContent only.
*/

import {
  getEffectiveGameConfig,
  getPresetSeconds,
  formatPresetLabel,
} from '../config/game-config.js';

/**
 * Converts a preset label (e.g. "5m", "3h", "7d") to seconds.
 * Returns null for unknown labels so callers can handle unsupported presets safely.
 */
export function presetToSeconds(preset) {
  return getPresetSeconds(preset);
}

/**
 * Rebuild a <select> with the given preset ids (labels derived from the
 * preset seconds). Keeps the current value when it is still offered,
 * otherwise selects `defaultId`. `customOption` appends the "Custom..." entry
 * used by sync duration dropdowns.
 */
export function fillPresetSelect(
  select,
  presetIds,
  defaultId,
  { customOption = false, keepCurrent = true } = {}
) {
  if (!select) return;
  const config = getEffectiveGameConfig();
  const current = select.value;
  const values = customOption ? [...presetIds, 'custom'] : [...presetIds];
  select.replaceChildren(
    ...values.map((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent =
        id === 'custom' ? 'Custom…' : formatPresetLabel(id, config);
      return option;
    })
  );
  select.value = keepCurrent && values.includes(current) ? current : defaultId;
}

/**
 * Fill the legacy (always hidden) host duration dropdowns on player.html from
 * the effective game config so they never offer presets the backend dropped.
 */
export function populateHostPresetSelects({
  durationPresetInput,
  asyncDurationPresetInput,
  asyncSessionPresetInput,
}) {
  const config = getEffectiveGameConfig();
  fillPresetSelect(
    durationPresetInput,
    config.sync_round_preset_ids,
    config.defaults.sync_round_preset,
    { customOption: true }
  );
  fillPresetSelect(
    asyncDurationPresetInput,
    config.async_round_preset_ids,
    config.defaults.async_round_preset
  );
  fillPresetSelect(
    asyncSessionPresetInput,
    config.async_session_preset_ids,
    config.defaults.async_session_preset
  );
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
  const config = getEffectiveGameConfig();
  const fallbackPreset = config.defaults.async_round_preset;
  const selectedPreset = String(roundDurationInput?.value || fallbackPreset);
  return config.async_round_preset_ids.includes(selectedPreset)
    ? selectedPreset
    : fallbackPreset;
}

export function getAsyncSessionDurationSeconds(sessionDurationInput) {
  const config = getEffectiveGameConfig();
  const fallbackPreset = config.defaults.async_session_preset;
  const selected = String(sessionDurationInput?.value || fallbackPreset);
  const isValidSession = config.async_session_preset_ids.includes(selected);
  const seconds = getPresetSeconds(selected, config);
  if (isValidSession && seconds !== null) {
    return seconds;
  }
  return getPresetSeconds(fallbackPreset, config);
}

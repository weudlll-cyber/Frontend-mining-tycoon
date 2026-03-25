/**
File: src/ui/setup-payload.js
Purpose: Build setup payload fragments for game creation inputs.
*/

export function resolveDurationSecondsFromInputs({
  durationPresetInput,
  durationCustomValueInput,
  durationCustomUnitInput,
}) {
  const preset = durationPresetInput?.value;
  if (preset === 'custom') {
    const customValue = parseInt(durationCustomValueInput?.value, 10);
    const unit = durationCustomUnitInput?.value || 'seconds';
    if (!Number.isFinite(customValue) || customValue <= 0) {
      throw new Error('Custom duration must be a positive number');
    }

    let seconds = customValue;
    if (unit === 'minutes') seconds = customValue * 60;
    else if (unit === 'hours') seconds = customValue * 3600;
    else if (unit === 'days') seconds = customValue * 86400;

    const MIN_SECONDS = 60;
    const MAX_SECONDS = 30 * 24 * 3600;
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      throw new Error(
        `Duration must be between ${MIN_SECONDS}s and ${MAX_SECONDS}s`
      );
    }
    return { mode: 'custom', customSeconds: seconds };
  }

  return { mode: 'preset', preset };
}

export function collectAdvancedOverridesFromInputs({
  showAdvancedCheckbox,
  anchorTokenInput,
  anchorRateInput,
  seasonCyclesInput,
}) {
  if (!showAdvancedCheckbox?.checked) {
    return {};
  }

  const overrides = {};
  const anchorToken = String(anchorTokenInput?.value || '').trim();
  if (anchorToken) {
    overrides.emission_anchor_token = anchorToken;
  }

  const anchorRate = parseFloat(String(anchorRateInput?.value || ''));
  if (Number.isFinite(anchorRate) && anchorRate > 0) {
    overrides.emission_anchor_tokens_per_second = anchorRate;
  }

  const seasonCycles = parseInt(String(seasonCyclesInput?.value || ''), 10);
  if (Number.isFinite(seasonCycles) && seasonCycles > 0) {
    overrides.season_cycles_per_game = seasonCycles;
  }

  return overrides;
}

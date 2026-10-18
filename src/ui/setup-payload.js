/**
File: src/ui/setup-payload.js
Purpose: Build the optional advanced-override fragment of the admin create
  payload (admin-setup.js); the backend re-validates every value.
*/

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

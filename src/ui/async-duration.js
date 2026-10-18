/**
File: src/ui/async-duration.js
Purpose: Fill the admin duration dropdowns (admin.html, admin-setup.js) from
  the effective game config.
Invariants:
- Presets, offered preset lists and defaults come from the effective game
  config (backend /meta `game_config`, fallback src/config constants).
Security notes:
- Pure client-side UI helpers; no network or token handling. Options are
  built with createElement/textContent only.
*/

import {
  getEffectiveGameConfig,
  formatPresetLabel,
} from '../config/game-config.js';

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

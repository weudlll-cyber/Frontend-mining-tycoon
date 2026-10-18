/**
 * File: src/admin/economy-settings.js
 * Purpose: Admin "Global Economy" section. Loads GET /admin/economy, renders
 *          the current values with version + snapshot hash, and saves edits via
 *          PATCH /admin/economy sending only the changed fields.
 * Role in system: Standalone admin module initialised from admin-setup.js.
 * Constraints:
 *  - Global economy only seeds NEW games; every existing game keeps the
 *    economy snapshot taken at creation (LOCKED_DECISIONS: snapshot-locked).
 *  - Backend is authoritative for validation; client checks only reject
 *    non-numeric input. Backend 400/422 messages are shown verbatim.
 *  - Each upgrade has its own profile (increment, base cost, cost growth);
 *    with "shuffle" on, the backend swaps the three profiles at random
 *    between the upgrades for every new round.
 * Security notes: all values are rendered via textContent / input.value.
 */

import { adminRequest } from './admin-api.js';
import { byId as el } from '../utils/dom-utils.js';

const UPGRADE_PROFILES = [
  ['hashrate', 'Hashrate', '> 0'],
  ['efficiency', 'Efficiency', '> 0'],
  ['cooling', 'Cooling', '>= 0'],
];

function upgradeProfileFields([stat, name, incrementRule]) {
  return [
    {
      key: `${stat}_increment`,
      label: `${name}: increment per level`,
      hint: `Added to the output multiplier per level (0.1 = +10 %); must be ${incrementRule}.`,
    },
    {
      key: `${stat}_base_cost`,
      label: `${name}: base cost`,
      hint: 'Cost of the first level, in the card token; must be >= 0.',
    },
    {
      key: `${stat}_cost_growth`,
      label: `${name}: cost growth`,
      hint: 'Cost multiplier per level (1.2 = +20 % per level); must be > 0.',
    },
  ];
}

// Field list mirrors EconomySettingsPatchRequest in the backend schemas.
// `hint` repeats the backend constraint so admins know the valid range.
export const ECONOMY_FIELDS = Object.freeze([
  { key: 'base_mining_rate', label: 'Base mining rate', hint: 'Must be > 0.' },
  ...UPGRADE_PROFILES.flatMap(upgradeProfileFields),
  {
    key: 'shuffle_upgrade_profiles',
    label: 'Shuffle upgrade profiles per round',
    hint: 'On: every new round swaps the three upgrade profiles above at random between Hashrate, Efficiency and Cooling (the same for all players). Off: each upgrade keeps its own profile.',
    boolean: true,
  },
  {
    key: 'conversion_fee_rate',
    label: 'Conversion fee rate',
    hint: 'Fraction, e.g. 0.02 = 2%; must be >= 0.',
  },
  {
    key: 'oracle_spread',
    label: 'Oracle spread',
    hint: 'Fraction; must be >= 0.',
  },
  {
    key: 'rotation_period_months',
    label: 'Rotation period (months)',
    hint: 'Whole number of months; must be > 0.',
    integer: true,
  },
]);

let loadedConfig = null;
let onLoadedCallback = null;

/**
 * The economy config last loaded or saved in this page session (a copy), or
 * null before "Load". The create form uses it for the fee/spread placeholders.
 */
export function getLoadedEconomyConfig() {
  return loadedConfig ? { ...loadedConfig } : null;
}

function fieldInputId(key) {
  return `admin-economy-${key.replaceAll('_', '-')}`;
}

function setResult(message, kind) {
  const resultEl = el('admin-economy-result');
  if (!resultEl) return;
  resultEl.className = `result-box ${kind}`;
  resultEl.textContent = message;
}

/**
 * Compare edited raw input values against the loaded config.
 * @param {Record<string, string>} rawValues - field key -> input string
 * @param {Record<string, number>} baseline - config returned by the backend
 * @returns {{ patch: Record<string, number>, errors: string[] }}
 */
export function buildEconomyPatch(rawValues, baseline) {
  const patch = {};
  const errors = [];
  ECONOMY_FIELDS.forEach(({ key, label, integer, boolean }) => {
    if (boolean) {
      const checked = rawValues?.[key] === true || rawValues?.[key] === 'true';
      if (checked !== Boolean(baseline?.[key])) patch[key] = checked;
      return;
    }
    const raw = String(rawValues?.[key] ?? '').trim();
    if (!raw) {
      errors.push(`${label} is required.`);
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors.push(`${label} must be a number.`);
      return;
    }
    if (integer && !Number.isInteger(value)) {
      errors.push(`${label} must be a whole number.`);
      return;
    }
    // Only send real changes so the backend version is bumped deliberately.
    if (value !== Number(baseline?.[key])) {
      patch[key] = value;
    }
  });
  return { patch, errors };
}

function renderFields(container) {
  ECONOMY_FIELDS.forEach(({ key, label, hint, integer, boolean }) => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = fieldInputId(key);
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.id = fieldInputId(key);
    if (boolean) {
      input.type = 'checkbox';
    } else {
      input.type = 'number';
      input.step = integer ? '1' : 'any';
    }
    input.dataset.economyField = key;

    const note = document.createElement('p');
    note.className = 'derived-note';
    note.textContent = hint;

    group.append(labelEl, input, note);
    container.appendChild(group);
  });
}

function renderSettings(settings) {
  loadedConfig = { ...(settings?.config || {}) };
  ECONOMY_FIELDS.forEach(({ key, boolean }) => {
    const input = el(fieldInputId(key));
    if (!input) return;
    const value = loadedConfig[key];
    if (boolean) {
      input.checked = Boolean(value);
    } else {
      input.value = value === undefined || value === null ? '' : String(value);
    }
  });

  const versionEl = el('admin-economy-version');
  if (versionEl) {
    const hash = String(settings?.snapshot_hash || '').slice(0, 12);
    versionEl.textContent = `Version ${settings?.version ?? '?'} · snapshot ${hash || 'n/a'}`;
  }
  el('admin-economy-fields').hidden = false;
  el('admin-economy-save-btn').disabled = false;
  onLoadedCallback?.(getLoadedEconomyConfig());
}

function readRawValues() {
  const values = {};
  ECONOMY_FIELDS.forEach(({ key, boolean }) => {
    const input = el(fieldInputId(key));
    values[key] = boolean ? Boolean(input?.checked) : (input?.value ?? '');
  });
  return values;
}

export async function loadEconomySettings() {
  setResult('Loading economy settings...', 'info');
  try {
    const settings = await adminRequest('/admin/economy');
    renderSettings(settings);
    setResult('', 'hidden');
  } catch (error) {
    setResult(`❌ Could not load economy settings: ${error.message}`, 'error');
  }
}

export async function saveEconomySettings() {
  if (!loadedConfig) {
    setResult('Load the current economy settings first.', 'error');
    return;
  }
  const { patch, errors } = buildEconomyPatch(readRawValues(), loadedConfig);
  if (errors.length) {
    setResult(`❌ ${errors.join(' ')}`, 'error');
    return;
  }
  if (!Object.keys(patch).length) {
    setResult('No changes to save.', 'info');
    return;
  }

  const saveBtn = el('admin-economy-save-btn');
  saveBtn.disabled = true;
  try {
    const settings = await adminRequest('/admin/economy', {
      method: 'PATCH',
      body: patch,
    });
    renderSettings(settings);
    setResult(
      `✅ Saved ${Object.keys(patch).length} field(s). Version ${settings?.version} applies to games created from now on; existing games are unchanged.`,
      'success'
    );
  } catch (error) {
    // 400 = backend range validation, 422 = schema validation; both carry a
    // readable message via readApiError.
    setResult(`❌ Save rejected: ${error.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * Wire the section. `onLoaded` runs with the config after every load/save
 * (admin-setup.js refreshes the create form's fee/spread placeholders).
 */
export function initEconomySettings({ onLoaded } = {}) {
  const container = el('admin-economy-fields');
  if (!container) return;
  loadedConfig = null;
  onLoadedCallback = onLoaded || null;
  container.replaceChildren();
  renderFields(container);
  container.hidden = true;
  el('admin-economy-save-btn').disabled = true;
  el('admin-economy-load-btn').addEventListener('click', loadEconomySettings);
  el('admin-economy-save-btn').addEventListener('click', saveEconomySettings);
}

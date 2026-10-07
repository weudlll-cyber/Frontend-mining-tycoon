/**
 * File: src/admin/game-config-settings.js
 * Purpose: Admin "Game Settings" section (admin.html, section 11). Loads
 *          GET /admin/game-config, renders editors for the round-setup
 *          tunables (duration presets, presets offered per round type,
 *          create-form defaults, limits, default trade counts by round length,
 *          trade unlock fractions) and saves edits via PATCH /admin/game-config
 *          sending only the changed top-level keys (`defaults` as a partial).
 * Role in system: Standalone admin module initialised from admin-setup.js.
 *          After a save the returned document is handed to
 *          src/config/game-config.js and the create form re-renders.
 * Constraints:
 *  - The game config only seeds NEW rounds; every existing round keeps the
 *    settings it was created with (LOCKED_DECISIONS: snapshot-locked).
 *  - Backend is authoritative for validation; the client only catches obvious
 *    mistakes (non-numbers, empty lists, min > max). Backend 400/422 messages
 *    are shown verbatim.
 * Security notes: backend values are rendered via textContent / input.value /
 *          option.value only; no innerHTML.
 */

import { adminRequest } from './admin-api.js';
import {
  SCORING_CONTROL,
  isAsyncRoundType,
  normalizeGameConfig,
  setGameConfigDocument,
} from '../config/index.js';

const PREFIX = 'admin-gameconfig';

// Preset lists offered by the create form, one checklist each.
const OFFER_LISTS = Object.freeze([
  {
    key: 'sync_round_preset_ids',
    id: `${PREFIX}-offer-sync`,
    label: 'sync rounds',
  },
  {
    key: 'async_round_preset_ids',
    id: `${PREFIX}-offer-async-round`,
    label: 'async rounds',
  },
  {
    key: 'async_session_preset_ids',
    id: `${PREFIX}-offer-async-session`,
    label: 'async sessions',
  },
]);

// Default preset per list; each must be one of the presets offered in `list`.
const DEFAULT_PRESET_FIELDS = Object.freeze([
  {
    key: 'sync_round_preset',
    list: 'sync_round_preset_ids',
    id: `${PREFIX}-default-sync-round-preset`,
    label: 'Default sync round duration',
  },
  {
    key: 'async_round_preset',
    list: 'async_round_preset_ids',
    id: `${PREFIX}-default-async-round-preset`,
    label: 'Default async round duration',
  },
  {
    key: 'async_session_preset',
    list: 'async_session_preset_ids',
    id: `${PREFIX}-default-async-session-preset`,
    label: 'Default async session duration',
  },
]);

// [config key, min field, max field, min input id, max input id, label]
const LIMIT_FIELDS = Object.freeze([
  [
    'duration_limits',
    'min_seconds',
    'max_seconds',
    'duration',
    'Custom duration limits',
  ],
  [
    'enrollment_window_limits',
    'min_seconds',
    'max_seconds',
    'enrollment',
    'Enrollment window limits',
  ],
  ['trade_count_limits', 'min', 'max', 'trade', 'Trade count limits'],
]);

const FRACTION_FIELDS = Object.freeze([
  {
    key: 'first_unlock_fraction',
    id: `${PREFIX}-first-unlock`,
    label: 'First unlock fraction',
  },
  {
    key: 'remaining_window_fraction',
    id: `${PREFIX}-remaining-window`,
    label: 'Remaining window fraction',
  },
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'duration_presets',
  'sync_round_preset_ids',
  'async_round_preset_ids',
  'async_session_preset_ids',
  'duration_limits',
  'enrollment_window_limits',
  'trade_count_limits',
  'trade_defaults',
  'trade_unlock',
]);

let loadedDocument = null;
let onSavedCallback = null;

function el(id) {
  return document.getElementById(id);
}

function setResult(message, kind) {
  const resultEl = el(`${PREFIX}-result`);
  resultEl.className = `result-box ${kind}`;
  resultEl.textContent = message;
}

function createInput(type, value, ariaLabel) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value === null || value === undefined ? '' : String(value);
  input.setAttribute('aria-label', ariaLabel);
  return input;
}

function createRemoveButton(onRemove) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-row-btn';
  button.style.background = 'var(--danger)';
  button.textContent = 'Remove';
  button.addEventListener('click', onRemove);
  return button;
}

function createRow(cells) {
  const row = document.createElement('tr');
  cells.forEach((cell) => {
    const td = document.createElement('td');
    td.appendChild(cell);
    row.appendChild(td);
  });
  return row;
}

// ── Pure helpers (exported for tests) ───────────────────────────────────────

/**
 * Ordered list of ticked presets. Presets that stay ticked keep their loaded
 * order and newly ticked ones are appended by duration, so an unchanged
 * checklist never produces a diff. When the loaded list is already ascending
 * by duration (the usual case) the result is kept ascending as well, so a
 * new "2m" preset lands before "5m" instead of after "7d".
 */
export function orderSelection(checkedIds, baselineIds, presets) {
  const byDuration = (a, b) => presets[a] - presets[b];
  const checked = new Set(checkedIds);
  const kept = (baselineIds || []).filter((id) => checked.has(id));
  const added = checkedIds.filter((id) => !kept.includes(id)).sort(byDuration);
  const keptAscending = kept.every(
    (id, index) => index === 0 || presets[kept[index - 1]] <= presets[id]
  );
  const merged = [...kept, ...added];
  return keptAscending ? merged.sort(byDuration) : merged;
}

/**
 * Structural sanity checks on a complete draft config. The backend remains
 * authoritative; this only catches mistakes before a round trip.
 * @returns {string[]} human-readable errors (empty when the draft looks sane)
 */
export function validateGameConfigDraft(config) {
  const errors = [];
  if (!Object.keys(config.duration_presets).length) {
    errors.push('Add at least one duration preset.');
  }
  Object.entries(config.duration_presets).forEach(([id, seconds]) => {
    if (seconds <= 0)
      errors.push(`Preset ${id} must be longer than 0 seconds.`);
  });
  OFFER_LISTS.forEach(({ key, label }) => {
    if (!config[key].length)
      errors.push(`Offer at least one preset for ${label}.`);
  });
  DEFAULT_PRESET_FIELDS.forEach(({ key, list, label }) => {
    if (!config[list].includes(config.defaults[key])) {
      errors.push(`${label} must be one of the offered presets.`);
    }
  });
  LIMIT_FIELDS.forEach(([key, minKey, maxKey, , label]) => {
    const range = config[key];
    if (range[minKey] < 0 || range[minKey] > range[maxKey]) {
      errors.push(`${label}: min must be >= 0 and <= max.`);
    }
  });
  const { min_seconds: enrollMin, max_seconds: enrollMax } =
    config.enrollment_window_limits;
  const enrollment = config.defaults.enrollment_window_seconds;
  if (enrollment < enrollMin || enrollment > enrollMax) {
    errors.push(
      'Default enrollment window must be within the enrollment limits.'
    );
  }
  const buckets = config.trade_defaults;
  if (!buckets.length) errors.push('Add at least one trade default row.');
  let previousMax = 0;
  buckets.forEach((bucket, index) => {
    const isLast = index === buckets.length - 1;
    const max = bucket.max_duration_seconds;
    if (max === null && !isLast) {
      errors.push(
        'Only the last trade default row may leave max duration empty.'
      );
    } else if (max !== null && max <= previousMax) {
      errors.push('Trade default max durations must be > 0 and ascending.');
    }
    previousMax = max ?? previousMax;
    const { min, max: countMax } = config.trade_count_limits;
    if (bucket.trade_count < min || bucket.trade_count > countMax) {
      errors.push(
        `Trade count ${bucket.trade_count} is outside the trade count limits.`
      );
    }
  });
  FRACTION_FIELDS.forEach(({ key, label }) => {
    const value = config.trade_unlock[key];
    if (value <= 0 || value > 1) errors.push(`${label} must be > 0 and <= 1.`);
  });
  return errors;
}

/**
 * Diff a draft against the loaded config: changed top-level keys are sent
 * whole (backend replaces them), `defaults` only with its changed fields
 * (backend merges per field).
 */
export function buildGameConfigPatch(draft, baseline) {
  const patch = {};
  TOP_LEVEL_KEYS.forEach((key) => {
    if (JSON.stringify(draft[key]) !== JSON.stringify(baseline?.[key])) {
      patch[key] = draft[key];
    }
  });
  const changedDefaults = {};
  Object.entries(draft.defaults).forEach(([key, value]) => {
    if (value !== baseline?.defaults?.[key]) changedDefaults[key] = value;
  });
  if (Object.keys(changedDefaults).length) patch.defaults = changedDefaults;
  return patch;
}

// ── Rendering ───────────────────────────────────────────────────────────────

function addPresetRow(id = '', seconds = '') {
  const idInput = createInput('text', id, 'Preset id');
  const secondsInput = createInput('number', seconds, 'Duration in seconds');
  secondsInput.min = '1';
  secondsInput.step = '1';
  [idInput, secondsInput].forEach((input) =>
    input.addEventListener('change', refreshPresetDependents)
  );
  const row = createRow([
    idInput,
    secondsInput,
    createRemoveButton(() => {
      row.remove();
      refreshPresetDependents();
    }),
  ]);
  el(`${PREFIX}-presets-body`).appendChild(row);
}

function readPresetRows() {
  return Array.from(el(`${PREFIX}-presets-body`).rows).map((row) => {
    const [idInput, secondsInput] = row.querySelectorAll('input');
    return { id: idInput.value.trim(), seconds: secondsInput.value };
  });
}

function currentPresetIds() {
  const ids = readPresetRows()
    .map((row) => row.id)
    .filter(Boolean);
  return [...new Set(ids)];
}

function renderChecklist(container, ids, checked) {
  container.replaceChildren(
    ...ids.map((presetId, index) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = `${container.id}-${index}`;
      box.value = presetId;
      box.checked = checked.has(presetId);
      const text = document.createElement('span');
      text.textContent = presetId;
      label.htmlFor = box.id;
      label.append(box, text);
      return label;
    })
  );
}

function checkedIn(container) {
  return Array.from(container.querySelectorAll('input:checked')).map(
    (box) => box.value
  );
}

function fillSelect(select, values, selected) {
  select.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      return option;
    })
  );
  select.value = selected;
}

/**
 * Preset ids changed (row added/renamed/removed): rebuild the checklists and
 * default dropdowns, keeping ticks and selections for ids that still exist.
 */
function refreshPresetDependents() {
  const ids = currentPresetIds();
  OFFER_LISTS.forEach(({ id }) => {
    const container = el(id);
    renderChecklist(container, ids, new Set(checkedIn(container)));
  });
  DEFAULT_PRESET_FIELDS.forEach(({ id }) => {
    const select = el(id);
    fillSelect(select, ids, select.value);
  });
}

function addTradeRow(
  maxSeconds = '',
  tradeCount = '',
  { beforeLast = false } = {}
) {
  const maxInput = createInput('number', maxSeconds, 'Max duration in seconds');
  maxInput.placeholder = 'empty = longer than all';
  maxInput.step = '1';
  const countInput = createInput('number', tradeCount, 'Trade count');
  countInput.step = '1';
  const body = el(`${PREFIX}-trade-body`);
  const row = createRow([
    maxInput,
    countInput,
    createRemoveButton(() => row.remove()),
  ]);
  // New rows go before the final "longer than all" row.
  body.insertBefore(row, beforeLast ? body.lastElementChild : null);
}

function renderDocument(doc) {
  loadedDocument = doc;
  const config = normalizeGameConfig(doc?.config);

  el(`${PREFIX}-presets-body`).replaceChildren();
  Object.entries(config.duration_presets).forEach(([id, seconds]) =>
    addPresetRow(id, seconds)
  );
  const ids = Object.keys(config.duration_presets);
  OFFER_LISTS.forEach(({ key, id }) =>
    renderChecklist(el(id), ids, new Set(config[key]))
  );
  DEFAULT_PRESET_FIELDS.forEach(({ key, id }) =>
    fillSelect(el(id), ids, config.defaults[key])
  );
  // The select offers the long API spellings; 'sync'/'async' aliases map onto them.
  el(`${PREFIX}-default-round-type`).value = isAsyncRoundType(
    config.defaults.round_type
  )
    ? 'asynchronous'
    : 'synchronous';
  el(`${PREFIX}-default-scoring-mode`).value = config.defaults.scoring_mode;
  el(`${PREFIX}-default-enrollment`).value = String(
    config.defaults.enrollment_window_seconds
  );
  LIMIT_FIELDS.forEach(([key, minKey, maxKey, idPart]) => {
    el(`${PREFIX}-${idPart}-min`).value = String(config[key][minKey]);
    el(`${PREFIX}-${idPart}-max`).value = String(config[key][maxKey]);
  });
  el(`${PREFIX}-trade-body`).replaceChildren();
  config.trade_defaults.forEach((bucket) =>
    addTradeRow(bucket.max_duration_seconds, bucket.trade_count)
  );
  FRACTION_FIELDS.forEach(({ key, id }) => {
    el(id).value = String(config.trade_unlock[key]);
  });

  const hash = String(doc?.config_hash || '').slice(0, 12);
  const updated = doc?.updated_at ? ` · updated ${doc.updated_at}` : '';
  el(`${PREFIX}-version`).textContent =
    `Version ${doc?.version ?? '?'} · hash ${hash || 'n/a'}${updated}`;
  el(`${PREFIX}-editor`).hidden = false;
  el(`${PREFIX}-save-btn`).disabled = false;
}

// ── Reading the draft from the DOM ──────────────────────────────────────────

function parseNumber(raw, label, errors, { integer = true } = {}) {
  const text = String(raw ?? '').trim();
  const value = Number(text);
  if (!text || !Number.isFinite(value)) {
    errors.push(`${label} must be a number.`);
    return null;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(`${label} must be a whole number.`);
    return null;
  }
  return value;
}

/**
 * Read every editor into a complete config object.
 * @returns {{ config: object, errors: string[] }} parse errors only
 */
export function readGameConfigDraft() {
  const errors = [];
  const baseline = loadedDocument?.config || {};

  const presets = {};
  readPresetRows().forEach(({ id, seconds }) => {
    if (!id) {
      errors.push('Every preset needs an id.');
    } else if (id in presets) {
      errors.push(`Preset id ${id} is used twice.`);
    } else {
      presets[id] = parseNumber(seconds, `Preset ${id}`, errors);
    }
  });

  const config = { duration_presets: presets };
  OFFER_LISTS.forEach(({ key, id }) => {
    config[key] = orderSelection(checkedIn(el(id)), baseline[key], presets);
  });

  config.defaults = {
    round_type: el(`${PREFIX}-default-round-type`).value,
    scoring_mode: el(`${PREFIX}-default-scoring-mode`).value,
    enrollment_window_seconds: parseNumber(
      el(`${PREFIX}-default-enrollment`).value,
      'Default enrollment window',
      errors
    ),
  };
  DEFAULT_PRESET_FIELDS.forEach(({ key, id }) => {
    config.defaults[key] = el(id).value;
  });

  LIMIT_FIELDS.forEach(([key, minKey, maxKey, idPart, label]) => {
    config[key] = {
      [minKey]: parseNumber(
        el(`${PREFIX}-${idPart}-min`).value,
        `${label} min`,
        errors
      ),
      [maxKey]: parseNumber(
        el(`${PREFIX}-${idPart}-max`).value,
        `${label} max`,
        errors
      ),
    };
  });

  config.trade_defaults = Array.from(el(`${PREFIX}-trade-body`).rows).map(
    (row, index) => {
      const [maxInput, countInput] = row.querySelectorAll('input');
      const label = `Trade default row ${index + 1}`;
      return {
        // Empty max = "longer than all" (null); validation allows it last only.
        max_duration_seconds: maxInput.value.trim()
          ? parseNumber(maxInput.value, `${label} max duration`, errors)
          : null,
        trade_count: parseNumber(
          countInput.value,
          `${label} trade count`,
          errors
        ),
      };
    }
  );

  config.trade_unlock = {};
  FRACTION_FIELDS.forEach(({ key, id, label }) => {
    config.trade_unlock[key] = parseNumber(el(id).value, label, errors, {
      integer: false,
    });
  });

  return { config, errors };
}

// ── Actions ─────────────────────────────────────────────────────────────────

export async function loadGameConfigSettings() {
  setResult('Loading game settings...', 'info');
  try {
    renderDocument(await adminRequest('/admin/game-config'));
    setResult('', 'hidden');
  } catch (error) {
    setResult(`❌ Could not load game settings: ${error.message}`, 'error');
  }
}

export async function saveGameConfigSettings() {
  if (!loadedDocument) {
    setResult('Load the current game settings first.', 'error');
    return;
  }
  const { config, errors } = readGameConfigDraft();
  const problems = errors.length ? errors : validateGameConfigDraft(config);
  if (problems.length) {
    setResult(`❌ ${problems.join(' ')}`, 'error');
    return;
  }
  const patch = buildGameConfigPatch(config, loadedDocument.config);
  if (!Object.keys(patch).length) {
    setResult('No changes to save.', 'info');
    return;
  }

  const saveBtn = el(`${PREFIX}-save-btn`);
  saveBtn.disabled = true;
  try {
    const doc = await adminRequest('/admin/game-config', {
      method: 'PATCH',
      body: patch,
    });
    renderDocument(doc);
    // Hand the new document to the config resolver so the create form
    // re-renders without waiting for /meta (which may be ETag-cached).
    setGameConfigDocument(doc);
    onSavedCallback?.();
    setResult(
      `✅ Saved ${Object.keys(patch).join(', ')}. Version ${doc?.version} applies to rounds created from now on; existing rounds keep their settings.`,
      'success'
    );
  } catch (error) {
    // 400 = backend rule violation, 422 = schema validation; both carry a
    // readable message via readApiError.
    setResult(`❌ Save rejected: ${error.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * Wire the section. `onSaved` runs after a successful save (admin-setup.js
 * re-renders the create form from the new config).
 */
export function initGameConfigSettings({ onSaved } = {}) {
  const editor = el(`${PREFIX}-editor`);
  if (!editor) return;
  loadedDocument = null;
  onSavedCallback = onSaved || null;
  editor.hidden = true;
  fillSelect(
    el(`${PREFIX}-default-scoring-mode`),
    SCORING_CONTROL.ALLOWED_MODES,
    'stockpile'
  );
  el(`${PREFIX}-save-btn`).disabled = true;
  el(`${PREFIX}-load-btn`).addEventListener('click', loadGameConfigSettings);
  el(`${PREFIX}-save-btn`).addEventListener('click', saveGameConfigSettings);
  el(`${PREFIX}-add-preset-btn`).addEventListener('click', () =>
    addPresetRow()
  );
  el(`${PREFIX}-add-trade-row-btn`).addEventListener('click', () =>
    addTradeRow('', '0', { beforeLast: true })
  );
}

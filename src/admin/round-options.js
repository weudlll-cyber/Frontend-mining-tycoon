/**
 * File: src/admin/round-options.js
 * Purpose: Per-round options of the admin create form (admin.html): the
 *          optional conversion fee / oracle spread overrides (section 5,
 *          entered in percent, sent as rates) and the "Chat enabled" checkbox
 *          (section 2). Builds their POST /games payload fields and review rows.
 * Role in system: Helper module of src/admin/admin-setup.js.
 *  - Upstream: global economy values for the placeholders come from the
 *    "Global Economy" section once loaded (economy-settings.js) or from the
 *    public GET /meta (`conversion_fee_rate`, `oracle_spread`); the chat
 *    default comes from the effective game config (`defaults.chat_enabled`).
 *  - Downstream: POST /games `conversion_fee_rate`, `oracle_spread`,
 *    `chat_enabled` (all optional; omitted = backend defaults).
 * Constraints:
 *  - Backend is authoritative: the client only rejects obvious mistakes
 *    (non-numbers, below 0 %, 100 % or more). The created round keeps the
 *    effective values as its snapshot (LOCKED_DECISIONS: snapshot-locked).
 *  - Empty override fields are omitted, so an older backend behaves as today.
 * Security notes: values are written via textContent / input properties only.
 */

import { getGlobalMeta } from '../meta/meta-manager.js';
import { getLoadedEconomyConfig } from './economy-settings.js';

// Overrides are entered in percent; the API takes a rate (0.02 = 2 %).
const RATE_FIELDS = Object.freeze([
  {
    key: 'conversion_fee_rate',
    inputId: 'admin-fee-override',
    noteId: 'admin-fee-override-note',
    label: 'Conversion fee',
  },
  {
    key: 'oracle_spread',
    inputId: 'admin-spread-override',
    noteId: 'admin-spread-override-note',
    label: 'Oracle spread',
  },
]);

// Chat default the form was last reset to; `chat_enabled` is only sent when
// the admin changes the checkbox away from it.
let chatDefault = true;

function el(id) {
  return document.getElementById(id);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Format a rate as a percent string without float noise
 * (0.02 -> "2", 0.0125 -> "1.25"); null when the rate is not a number.
 */
export function formatRateAsPercent(rate) {
  if (!isFiniteNumber(rate)) return null;
  return String(Number((rate * 100).toFixed(4)));
}

/**
 * Parse a percent input into a rate.
 * @returns {{ rate: number|null, error: string|null }} rate null = empty field
 */
export function parsePercentToRate(raw, label) {
  const text = String(raw ?? '').trim();
  if (!text) return { rate: null, error: null };
  const percent = Number(text);
  if (!Number.isFinite(percent)) {
    return { rate: null, error: `${label} override must be a number.` };
  }
  // Sanity bounds only; the backend validates the real range.
  if (percent < 0 || percent >= 100) {
    return {
      rate: null,
      error: `${label} override must be at least 0% and below 100%.`,
    };
  }
  // toFixed avoids binary noise such as 0.07 / 100 = 0.0007000000000000001.
  return { rate: Number((percent / 100).toFixed(8)), error: null };
}

/**
 * Current global economy fee/spread: the Global Economy section once loaded
 * (freshest, admin-authenticated), otherwise the public GET /meta values.
 * Missing values are null.
 */
export function resolveGlobalEconomyRates() {
  const economy = getLoadedEconomyConfig();
  const meta = getGlobalMeta();
  const pick = (key) => {
    if (isFiniteNumber(economy?.[key])) return economy[key];
    if (isFiniteNumber(meta?.[key])) return meta[key];
    return null;
  };
  return {
    conversion_fee_rate: pick('conversion_fee_rate'),
    oracle_spread: pick('oracle_spread'),
  };
}

/** Show the current global values as placeholders / notes of the overrides. */
export function refreshRateOverrideHints() {
  const globals = resolveGlobalEconomyRates();
  RATE_FIELDS.forEach(({ key, inputId, noteId }) => {
    const input = el(inputId);
    const note = el(noteId);
    const percent = formatRateAsPercent(globals[key]);
    if (input) {
      input.placeholder = percent === null ? 'Global economy value' : percent;
    }
    if (note) {
      note.textContent =
        percent === null
          ? 'Empty = use the global economy value (section 9).'
          : `Empty = use the global economy value (currently ${percent}%).`;
    }
  });
}

/**
 * Reset the chat checkbox to the effective default (`defaults.chat_enabled`,
 * fallback true). Called whenever the game config (re)loads.
 */
export function applyChatDefault(config) {
  const value = config?.defaults?.chat_enabled;
  chatDefault = typeof value === 'boolean' ? value : true;
  const box = el('admin-chat-enabled');
  if (box) box.checked = chatDefault;
}

function isChatChecked() {
  const box = el('admin-chat-enabled');
  return box ? box.checked : chatDefault;
}

/**
 * POST /games fields for the round options. Empty overrides and an unchanged
 * chat checkbox are omitted so the backend applies its own defaults.
 * @throws {Error} when an override is not a sane percent value
 */
export function collectRoundOptionsPayload() {
  const payload = {};
  const errors = [];
  RATE_FIELDS.forEach(({ key, inputId, label }) => {
    const { rate, error } = parsePercentToRate(el(inputId)?.value, label);
    if (error) errors.push(error);
    else if (rate !== null) payload[key] = rate;
  });
  if (errors.length) {
    throw new Error(errors.join(' '));
  }
  const chatEnabled = isChatChecked();
  if (chatEnabled !== chatDefault) {
    payload.chat_enabled = chatEnabled;
  }
  return payload;
}

/** Review rows (section 7) for the fee/spread overrides and chat. */
export function buildRoundOptionsReviewRows() {
  const globals = resolveGlobalEconomyRates();
  const rows = RATE_FIELDS.map(({ key, inputId, label }) => {
    const { rate, error } = parsePercentToRate(el(inputId)?.value, label);
    if (error) return [label, 'Invalid value'];
    if (rate !== null)
      return [label, `${formatRateAsPercent(rate)}% (override)`];
    const globalPercent = formatRateAsPercent(globals[key]);
    return [
      label,
      globalPercent === null
        ? 'Global economy'
        : `Global economy (${globalPercent}%)`,
    ];
  });
  rows.push(['Chat', isChatChecked() ? 'Enabled' : 'Disabled']);
  return rows;
}

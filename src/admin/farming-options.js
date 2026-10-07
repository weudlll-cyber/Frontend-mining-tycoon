/**
 * File: src/admin/farming-options.js
 * Purpose: Farming Stage 1 options of the admin create form (admin.html,
 *          section 5): "Farming enabled", minimum farming duration (value +
 *          unit, like the custom round duration) and reward per completed
 *          cycle in percent. Builds their POST /games fields and review rows.
 * Role in system: Helper module of src/admin/admin-setup.js.
 *  - Upstream: defaults and limits from the effective game config
 *    (`defaults.farming_*`, `farming_min_duration_limits`,
 *    `farming_reward_rate_limits`; fallbacks off / 300 s / 5 %).
 *  - Downstream: POST /games `farming_enabled`,
 *    `farming_min_duration_seconds`, `farming_reward_rate` (rate, 0.05 = 5 %).
 * Constraints:
 *  - Backend is authoritative (422 on invalid values); the client only checks
 *    the configured limits and that the minimum duration is shorter than the
 *    round (sync) or session (async) so the admin sees the problem early.
 *  - With farming off and an "off" default nothing is sent, so an older
 *    backend without farming receives exactly today's payload.
 *  - The created round snapshots its farming rules (LOCKED_DECISIONS §A).
 * Security notes: values are written via textContent / input properties only.
 */

import { formatFarmDuration } from '../ui/farming-state.js';
import { formatRateAsPercent } from './round-options.js';

const IDS = Object.freeze({
  enabled: 'admin-farming-enabled',
  fields: 'admin-farming-fields',
  durationValue: 'admin-farming-min-duration-value',
  durationUnit: 'admin-farming-min-duration-unit',
  reward: 'admin-farming-reward',
  note: 'admin-farming-note',
});

const UNIT_SECONDS = Object.freeze({
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
});

const FALLBACK = Object.freeze({
  enabled: false,
  minDurationSeconds: 300,
  rewardRate: 0.05,
  durationLimits: { min_seconds: 10, max_seconds: 604800 },
  rewardLimits: { min: 0.0001, max: 1 },
});

// Settings the form was last reset to (effective game config).
let current = {
  enabled: FALLBACK.enabled,
  durationLimits: FALLBACK.durationLimits,
  rewardLimits: FALLBACK.rewardLimits,
};

function el(id) {
  return document.getElementById(id);
}

/** Largest unit that divides the seconds evenly: 300 -> 5 minutes. */
export function splitDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const unit =
    ['days', 'hours', 'minutes'].find(
      (name) => total > 0 && total % UNIT_SECONDS[name] === 0
    ) || 'seconds';
  return { value: total / UNIT_SECONDS[unit], unit };
}

function hasForm() {
  return Boolean(el(IDS.enabled));
}

function isEnabledChecked() {
  return Boolean(el(IDS.enabled)?.checked);
}

/** Grey out the value fields while farming is off. */
function syncFieldState() {
  const disabled = !isEnabledChecked();
  [IDS.durationValue, IDS.durationUnit, IDS.reward].forEach((id) => {
    const input = el(id);
    if (input) input.disabled = disabled;
  });
  el(IDS.fields)?.classList.toggle('farming-fields-off', disabled);
}

/**
 * Reset the farming options to the effective defaults and show the limits.
 * Called whenever the game config (re)loads.
 */
export function applyFarmingDefaults(config) {
  const defaults = config?.defaults || {};
  current = {
    enabled:
      typeof defaults.farming_enabled === 'boolean'
        ? defaults.farming_enabled
        : FALLBACK.enabled,
    durationLimits:
      config?.farming_min_duration_limits || FALLBACK.durationLimits,
    rewardLimits: config?.farming_reward_rate_limits || FALLBACK.rewardLimits,
  };
  if (!hasForm()) return;

  el(IDS.enabled).checked = current.enabled;
  const { value, unit } = splitDuration(
    defaults.farming_min_duration_seconds ?? FALLBACK.minDurationSeconds
  );
  if (el(IDS.durationValue)) el(IDS.durationValue).value = String(value);
  if (el(IDS.durationUnit)) el(IDS.durationUnit).value = unit;
  const reward = el(IDS.reward);
  if (reward) {
    reward.value =
      formatRateAsPercent(
        defaults.farming_reward_rate ?? FALLBACK.rewardRate
      ) ?? '';
    reward.min = formatRateAsPercent(current.rewardLimits.min) ?? '';
    reward.max = formatRateAsPercent(current.rewardLimits.max) ?? '';
  }
  const note = el(IDS.note);
  if (note) {
    const { min_seconds: minS, max_seconds: maxS } = current.durationLimits;
    note.textContent =
      `Minimum duration ${formatFarmDuration(minS)} to ${formatFarmDuration(maxS)}; ` +
      `reward ${formatRateAsPercent(current.rewardLimits.min)}% to ` +
      `${formatRateAsPercent(current.rewardLimits.max)}% per completed cycle. ` +
      'The minimum duration must be shorter than the round (sync) or session (async).';
  }
  syncFieldState();
}

/**
 * Read and validate the farming inputs.
 * @param {number} windowSeconds round (sync) or session (async) length
 * @returns {{ enabled: boolean, minDurationSeconds: number|null,
 *   rewardRate: number|null, errors: string[] }}
 */
export function readFarmingForm(windowSeconds) {
  const enabled = isEnabledChecked();
  const result = {
    enabled,
    minDurationSeconds: null,
    rewardRate: null,
    errors: [],
  };
  if (!enabled) return result;

  const rawValue = String(el(IDS.durationValue)?.value ?? '').trim();
  const unit = el(IDS.durationUnit)?.value || 'seconds';
  const numeric = Number(rawValue);
  if (!rawValue || !Number.isFinite(numeric) || numeric <= 0) {
    result.errors.push('Farming minimum duration must be a positive number.');
  } else {
    const seconds = Math.round(numeric * (UNIT_SECONDS[unit] ?? 1));
    const { min_seconds: minS, max_seconds: maxS } = current.durationLimits;
    if (seconds < minS || seconds > maxS) {
      result.errors.push(
        `Farming minimum duration must be between ${formatFarmDuration(minS)} and ${formatFarmDuration(maxS)}.`
      );
    } else if (windowSeconds > 0 && seconds >= windowSeconds) {
      result.errors.push(
        `Farming minimum duration (${formatFarmDuration(seconds)}) must be shorter than the round/session duration (${formatFarmDuration(windowSeconds)}).`
      );
    }
    result.minDurationSeconds = seconds;
  }

  // Percent -> rate; toFixed avoids float noise (7 / 100 = 0.07000000000000001).
  // Not parsePercentToRate: a 100 % reward (rate 1.0) is a valid limit here.
  const rewardText = String(el(IDS.reward)?.value ?? '').trim();
  const percent = Number(rewardText);
  const rate =
    rewardText && Number.isFinite(percent)
      ? Number((percent / 100).toFixed(8))
      : null;
  const { min, max } = current.rewardLimits;
  if (rate === null) {
    result.errors.push('Farming reward must be a percent value.');
  } else if (rate < min || rate > max) {
    result.errors.push(
      `Farming reward must be between ${formatRateAsPercent(min)}% and ${formatRateAsPercent(max)}%.`
    );
  } else {
    result.rewardRate = rate;
  }
  return result;
}

/**
 * POST /games fields for farming. Enabled: all three values (the round
 * snapshots them). Disabled: `farming_enabled: false` only when the default is
 * "on", otherwise nothing (older backends see today's payload).
 * @throws {Error} when the enabled options are invalid
 */
export function collectFarmingPayload(windowSeconds) {
  if (!hasForm()) return {};
  const form = readFarmingForm(windowSeconds);
  if (!form.enabled) {
    return current.enabled ? { farming_enabled: false } : {};
  }
  if (form.errors.length) {
    throw new Error(form.errors.join(' '));
  }
  return {
    farming_enabled: true,
    farming_min_duration_seconds: form.minDurationSeconds,
    farming_reward_rate: form.rewardRate,
  };
}

/** Review row (section 7) for farming. */
export function buildFarmingReviewRows(windowSeconds) {
  if (!hasForm()) return [];
  const form = readFarmingForm(windowSeconds);
  if (!form.enabled) return [['Farming', 'Disabled']];
  if (form.errors.length) return [['Farming', `Invalid: ${form.errors[0]}`]];
  return [
    [
      'Farming',
      `Enabled: ${formatRateAsPercent(form.rewardRate)}% per ${formatFarmDuration(form.minDurationSeconds)} cycle`,
    ],
  ];
}

/** Wire the farming inputs; `onChange` refreshes the review. */
export function bindFarmingInputs(onChange) {
  el(IDS.enabled)?.addEventListener('change', () => {
    syncFieldState();
    onChange?.();
  });
  [IDS.durationValue, IDS.reward].forEach((id) =>
    el(id)?.addEventListener('input', () => onChange?.())
  );
  el(IDS.durationUnit)?.addEventListener('change', () => onChange?.());
}

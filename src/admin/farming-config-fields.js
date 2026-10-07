/**
 * File: src/admin/farming-config-fields.js
 * Purpose: Farming editors of the admin "Game Settings" section (admin.html,
 *          section 11): create-form defaults (`defaults.farming_enabled`,
 *          `defaults.farming_min_duration_seconds`,
 *          `defaults.farming_reward_rate`) and the limits
 *          (`farming_min_duration_limits`, `farming_reward_rate_limits`).
 * Role in system: Helper of src/admin/game-config-settings.js (render, read,
 *          validate and diff), kept separate so that module stays focused.
 * Constraints:
 *  - Rewards are edited in percent and stored as rates (5 % -> 0.05).
 *  - Diffs compare against the NORMALIZED baseline, so an older backend
 *    without farming keys only receives them when the admin changes a value.
 *  - Backend stays authoritative (400/422 shown verbatim by the caller).
 * Security notes: values are written via input properties only.
 */

import { normalizeGameConfig } from '../config/index.js';

const PREFIX = 'admin-gameconfig';

const IDS = Object.freeze({
  enabled: `${PREFIX}-default-farming-enabled`,
  minDuration: `${PREFIX}-default-farming-min-duration`,
  reward: `${PREFIX}-default-farming-reward`,
  durationMin: `${PREFIX}-farming-duration-min`,
  durationMax: `${PREFIX}-farming-duration-max`,
  rewardMin: `${PREFIX}-farming-reward-min`,
  rewardMax: `${PREFIX}-farming-reward-max`,
});

const DEFAULT_KEYS = Object.freeze([
  'farming_enabled',
  'farming_min_duration_seconds',
  'farming_reward_rate',
]);

const LIMIT_KEYS = Object.freeze([
  'farming_min_duration_limits',
  'farming_reward_rate_limits',
]);

function el(id) {
  return document.getElementById(id);
}

function rateToPercentText(rate) {
  return Number.isFinite(rate) ? String(Number((rate * 100).toFixed(6))) : '';
}

function readNumber(id, label, errors, { integer = false, percent = false }) {
  const text = String(el(id)?.value ?? '').trim();
  const value = Number(text);
  if (!text || !Number.isFinite(value)) {
    errors.push(`${label} must be a number.`);
    return null;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(`${label} must be a whole number.`);
    return null;
  }
  // toFixed avoids float noise such as 7 / 100 = 0.07000000000000001.
  return percent ? Number((value / 100).toFixed(8)) : value;
}

/** True when the farming editors exist on the page. */
export function hasFarmingConfigFields() {
  return Boolean(el(IDS.enabled));
}

/** Fill the farming editors from a normalized config. */
export function renderFarmingConfig(config) {
  if (!hasFarmingConfigFields()) return;
  el(IDS.enabled).checked = config.defaults.farming_enabled;
  el(IDS.minDuration).value = String(
    config.defaults.farming_min_duration_seconds
  );
  el(IDS.reward).value = rateToPercentText(config.defaults.farming_reward_rate);
  el(IDS.durationMin).value = String(
    config.farming_min_duration_limits.min_seconds
  );
  el(IDS.durationMax).value = String(
    config.farming_min_duration_limits.max_seconds
  );
  el(IDS.rewardMin).value = rateToPercentText(
    config.farming_reward_rate_limits.min
  );
  el(IDS.rewardMax).value = rateToPercentText(
    config.farming_reward_rate_limits.max
  );
}

/**
 * Read the farming editors. Parse errors are appended to `errors`.
 * @returns {{ defaults: object, farming_min_duration_limits: object,
 *   farming_reward_rate_limits: object }|null} null without editors
 */
export function readFarmingConfigDraft(errors) {
  if (!hasFarmingConfigFields()) return null;
  return {
    defaults: {
      farming_enabled: el(IDS.enabled).checked,
      farming_min_duration_seconds: readNumber(
        IDS.minDuration,
        'Default farming minimum duration',
        errors,
        { integer: true }
      ),
      farming_reward_rate: readNumber(
        IDS.reward,
        'Default farming reward',
        errors,
        { percent: true }
      ),
    },
    farming_min_duration_limits: {
      min_seconds: readNumber(
        IDS.durationMin,
        'Farming duration limits min',
        errors,
        { integer: true }
      ),
      max_seconds: readNumber(
        IDS.durationMax,
        'Farming duration limits max',
        errors,
        { integer: true }
      ),
    },
    farming_reward_rate_limits: {
      min: readNumber(IDS.rewardMin, 'Farming reward limits min', errors, {
        percent: true,
      }),
      max: readNumber(IDS.rewardMax, 'Farming reward limits max', errors, {
        percent: true,
      }),
    },
  };
}

/** Sanity checks for the farming part of a complete draft config. */
export function validateFarmingConfig(config) {
  const errors = [];
  const durations = config.farming_min_duration_limits;
  const rewards = config.farming_reward_rate_limits;
  if (!durations || !rewards) return errors;

  if (
    durations.min_seconds < 1 ||
    durations.min_seconds > durations.max_seconds
  ) {
    errors.push('Farming duration limits: min must be >= 1 and <= max.');
  }
  if (rewards.min <= 0 || rewards.min > rewards.max || rewards.max > 1) {
    errors.push(
      'Farming reward limits: min must be > 0% and <= max, max <= 100%.'
    );
  }
  const minDuration = config.defaults?.farming_min_duration_seconds;
  if (
    minDuration < durations.min_seconds ||
    minDuration > durations.max_seconds
  ) {
    errors.push(
      'Default farming minimum duration must be within the farming duration limits.'
    );
  }
  const reward = config.defaults?.farming_reward_rate;
  if (reward < rewards.min || reward > rewards.max) {
    errors.push(
      'Default farming reward must be within the farming reward limits.'
    );
  }
  return errors;
}

/**
 * PATCH fields for farming: changed defaults (merged into `defaults` by the
 * caller) and changed limit objects, compared with the normalized baseline.
 */
export function buildFarmingConfigPatch(draft, baseline) {
  const effective = normalizeGameConfig(baseline);
  const defaults = {};
  DEFAULT_KEYS.forEach((key) => {
    const value = draft.defaults?.[key];
    if (value !== undefined && value !== effective.defaults[key]) {
      defaults[key] = value;
    }
  });
  const limits = {};
  LIMIT_KEYS.forEach((key) => {
    if (
      draft[key] &&
      JSON.stringify(draft[key]) !== JSON.stringify(effective[key])
    ) {
      limits[key] = draft[key];
    }
  });
  return { defaults, limits };
}

/** Keys of `defaults` handled here (skipped by the generic defaults diff). */
export const FARMING_DEFAULT_KEYS = DEFAULT_KEYS;

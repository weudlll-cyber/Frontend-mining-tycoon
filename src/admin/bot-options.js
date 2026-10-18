/**
 * File: src/admin/bot-options.js
 * Purpose: "Bot opponents" inputs of the admin create form (admin.html,
 *          section 2, sync rounds only): how many Easy, Medium and Hard bots
 *          join the round.
 * Role in system: Helper of src/admin/admin-setup.js (payload, review rows,
 *          limit from GET /meta `max_bots_per_round`).
 * Constraints:
 *  - Sync rounds only; the inputs live inside #admin-sync-fields, which the
 *    form hides for async rounds, and nothing is sent for async rounds.
 *  - No bots selected: nothing is sent (older backends see today's payload).
 *  - The backend stays authoritative (422 for more than the limit).
 */

import { byId as el } from '../utils/dom-utils.js';

const BOT_LEVELS = Object.freeze([
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
]);

// Used until /meta arrives (and for backends without the field).
const FALLBACK_MAX_BOTS = 10;

let maxBots = FALLBACK_MAX_BOTS;

function inputId(level) {
  return `admin-bots-${level}`;
}

function hasForm() {
  return Boolean(el(inputId('easy')));
}

/** Apply the limit from GET /meta (`max_bots_per_round`). */
export function applyBotLimits(meta) {
  const limit = Number(meta?.max_bots_per_round);
  maxBots = Number.isInteger(limit) && limit >= 0 ? limit : FALLBACK_MAX_BOTS;
  if (!hasForm()) return;
  BOT_LEVELS.forEach(([level]) => {
    el(inputId(level)).max = String(maxBots);
  });
  const note = el('admin-bots-note');
  if (note) {
    note.textContent = `Bots play like real players and are always shown as "Bot …" with a BOT badge. Easy is beatable, Medium plays solidly, Hard plays the strongest plan found in the balance simulations. Up to ${maxBots} bots per round (sync rounds only).`;
  }
}

/**
 * Read the bot inputs.
 * @returns {{ counts: {easy: number, medium: number, hard: number},
 *   total: number, errors: string[] }}
 */
export function readBotForm() {
  const counts = { easy: 0, medium: 0, hard: 0 };
  const errors = [];
  if (!hasForm()) return { counts, total: 0, errors };
  BOT_LEVELS.forEach(([level, label]) => {
    const text = String(el(inputId(level)).value ?? '').trim();
    const value = text ? Number(text) : 0;
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`${label} bots must be a whole number of 0 or more.`);
      return;
    }
    counts[level] = value;
  });
  const total = counts.easy + counts.medium + counts.hard;
  if (total > maxBots) {
    errors.push(`At most ${maxBots} bots per round (now ${total}).`);
  }
  return { counts, total, errors };
}

/**
 * POST /games field: `bots` for sync rounds with at least one bot.
 * @throws {Error} when the counts are invalid
 */
export function collectBotPayload(roundType) {
  if (roundType !== 'sync') return {};
  const form = readBotForm();
  if (form.errors.length) throw new Error(form.errors.join(' '));
  return form.total > 0 ? { bots: form.counts } : {};
}

/** Review row (section 7), e.g. "2 Easy, 1 Hard". */
export function buildBotReviewRows(roundType) {
  if (roundType !== 'sync' || !hasForm()) return [];
  const form = readBotForm();
  if (form.errors.length) return [['Bots', `Invalid: ${form.errors[0]}`]];
  if (!form.total) return [['Bots', 'None']];
  const parts = BOT_LEVELS.filter(([level]) => form.counts[level] > 0).map(
    ([level, label]) => `${form.counts[level]} ${label}`
  );
  return [['Bots', parts.join(', ')]];
}

/** Wire the inputs; `onChange` refreshes the review. */
export function bindBotInputs(onChange) {
  BOT_LEVELS.forEach(([level]) => {
    el(inputId(level))?.addEventListener('input', () => onChange?.());
  });
}

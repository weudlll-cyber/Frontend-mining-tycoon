/**
 * File: src/admin/schedule-options.js
 * Purpose: "Start" option of the admin create form (admin.html, section 3,
 *          sync rounds only): "Start now" (default) or "Schedule start" with
 *          a local `<input type="datetime-local">`. Converts the local time to
 *          unix seconds (UTC) for `scheduled_start_at` on POST /games, shows
 *          the admin's time zone, and builds the review row
 *          ("Starts: <local date/time> (in 2 h 15 min)").
 * Role in system: Helper of src/admin/admin-setup.js (payload, review,
 *          visibility), kept separate so admin-setup.js stays focused.
 * Constraints:
 *  - Async rounds never send `scheduled_start_at` (the backend only accepts
 *    it for sync rounds); the controls are hidden for async.
 *  - "Start now" sends no field at all, so today's backend behaves as before.
 *  - Client check only (>= now + 60 s, <= `scheduling.max_days_ahead` days
 *    from the effective game config, fallback 30); the backend stays
 *    authoritative and answers 422 for an out-of-range start.
 * Security notes: values are written via textContent / input properties only.
 */

import {
  SCHEDULED_START_MIN_LEAD_SECONDS,
  getEffectiveGameConfig,
} from '../config/index.js';
import {
  describeLocalTimeZone,
  formatLocalDateTime,
  formatOpensIn,
  nowUnixSeconds,
  parseLocalDateTimeInput,
  toDateTimeLocalValue,
} from '../utils/schedule-time.js';

const IDS = Object.freeze({
  container: 'admin-schedule-fields',
  now: 'admin-start-now',
  scheduled: 'admin-start-scheduled',
  row: 'admin-scheduled-start-row',
  input: 'admin-scheduled-start',
  zone: 'admin-scheduled-start-zone',
  hint: 'admin-scheduled-start-hint',
});

function el(id) {
  return document.getElementById(id);
}

/** Max days ahead from the effective game config (fallback 30). */
export function getMaxDaysAhead(config = getEffectiveGameConfig()) {
  return config.scheduling.max_days_ahead;
}

/** True when the "Schedule start" option is selected. */
export function isScheduleSelected() {
  return Boolean(el(IDS.scheduled)?.checked);
}

/**
 * Validate a scheduled start (unix seconds) against the client-side window.
 * @returns {string} an error message, or '' when the start looks valid.
 */
export function validateScheduledStart(
  startUnix,
  { nowSeconds = nowUnixSeconds(), maxDaysAhead = getMaxDaysAhead() } = {}
) {
  if (startUnix === null) {
    return 'Choose a date and time for the scheduled start.';
  }
  if (startUnix < nowSeconds + SCHEDULED_START_MIN_LEAD_SECONDS) {
    return 'The scheduled start must be at least 1 minute in the future.';
  }
  if (startUnix > nowSeconds + maxDaysAhead * 86400) {
    return `The scheduled start must be at most ${maxDaysAhead} days ahead.`;
  }
  return '';
}

function readScheduledStart() {
  return parseLocalDateTimeInput(el(IDS.input)?.value);
}

/**
 * `scheduled_start_at` for POST /games. Empty for async rounds and for
 * "Start now"; throws with a readable message when the chosen time is
 * invalid (createRound shows it as the error).
 */
export function collectSchedulePayload(roundType) {
  if (roundType !== 'sync' || !isScheduleSelected()) return {};
  const startUnix = readScheduledStart();
  const error = validateScheduledStart(startUnix);
  if (error) throw new Error(error);
  return { scheduled_start_at: startUnix };
}

/** Review rows ("Starts") for sync rounds; none for async rounds. */
export function buildScheduleReviewRows(
  roundType,
  nowSeconds = nowUnixSeconds()
) {
  if (roundType !== 'sync') return [];
  if (!isScheduleSelected()) {
    return [['Starts', 'Now (enrollment opens on creation)']];
  }
  const startUnix = readScheduledStart();
  const error = validateScheduledStart(startUnix, { nowSeconds });
  if (error) return [['Starts', `⚠ ${error}`]];
  return [
    [
      'Starts',
      `${formatLocalDateTime(startUnix)} (in ${formatOpensIn(startUnix - nowSeconds)})`,
    ],
  ];
}

/**
 * Refresh the picker bounds, the time-zone hint and the row visibility.
 * Runs on load, after /meta or a Game Settings save (max days may change)
 * and whenever the round type or start option changes.
 */
export function applyScheduleState(roundType, nowSeconds = nowUnixSeconds()) {
  const container = el(IDS.container);
  if (!container) return;
  container.classList.toggle('hidden-section', roundType !== 'sync');

  const scheduled = isScheduleSelected();
  el(IDS.row).hidden = !scheduled;

  const input = el(IDS.input);
  const maxDays = getMaxDaysAhead();
  input.min = toDateTimeLocalValue(
    nowSeconds + SCHEDULED_START_MIN_LEAD_SECONDS
  );
  input.max = toDateTimeLocalValue(nowSeconds + maxDays * 86400);
  input.required = scheduled;

  el(IDS.zone).textContent =
    `Your time zone: ${describeLocalTimeZone(nowSeconds * 1000)}. Players see the start in their own local time.`;

  const error = scheduled
    ? validateScheduledStart(readScheduledStart(), {
        nowSeconds,
        maxDaysAhead: maxDays,
      })
    : '';
  const hint = el(IDS.hint);
  hint.textContent = scheduled
    ? error ||
      `The lobby lists the round as Upcoming until it opens. At most ${maxDays} days ahead.`
    : '';
  hint.dataset.kind = error ? 'error' : 'info';
  input.setAttribute('aria-invalid', String(Boolean(error)));
}

/** Wire the start radios and the picker; `onChange` refreshes the review. */
export function bindScheduleInputs(getRoundType, onChange) {
  const handler = () => {
    applyScheduleState(getRoundType());
    onChange();
  };
  [IDS.now, IDS.scheduled].forEach((id) =>
    el(id)?.addEventListener('change', handler)
  );
  el(IDS.input)?.addEventListener('input', handler);
  el(IDS.input)?.addEventListener('change', handler);
}

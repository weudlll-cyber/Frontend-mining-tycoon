/**
File: src/ui/halving-display.js
Purpose: Next-halving countdown clock and last-halving notice display.
Owns the halvingCountdownInterval and the last-halving notice state.
Call initHalvingDisplay() once with required dependencies before use.
*/

import {
  HALVING_INTERVAL_MONTHS,
  HALVING_BASE_OFFSETS,
  LAST_HALVING_NOTICE_SECONDS,
  halvingKey,
  computeMostRecentPastHalving,
  deriveLastHalvingNoticeUpdate,
} from '../halving.js';
import { normalizeTokenNames } from '../utils/token-utils.js';

// Module-level state
let _halvingClockInterval = null;
let _halvingCountdownTarget = null;
let _lastHalvingSeenKey = null;
let _lastHalvingNotice = null;
let _lastHalvingHideTimeout = null;
let _getActiveGameMeta = null;
const _halvingClockSubscribers = new Set();

/**
 * @param {{ getActiveGameMeta: (gameId: string) => object|null }} deps
 */
export function initHalvingDisplay(deps) {
  _getActiveGameMeta = deps.getActiveGameMeta;
}

export function getLastHalvingNotice() {
  return _lastHalvingNotice;
}

/* ---------- clock formatting ---------- */

export function formatCountdownClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ---------- next-halving countdown ---------- */

function syncHalvingClockInterval() {
  const shouldRun =
    Boolean(_halvingCountdownTarget) || _halvingClockSubscribers.size > 0;

  if (shouldRun && !_halvingClockInterval) {
    _halvingClockInterval = setInterval(() => {
      renderNextHalvingCountdownTick();
      _halvingClockSubscribers.forEach((listener) => listener());
    }, 1000);
    return;
  }

  if (!shouldRun && _halvingClockInterval) {
    clearInterval(_halvingClockInterval);
    _halvingClockInterval = null;
  }
}

export function subscribeHalvingClock(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  _halvingClockSubscribers.add(listener);
  syncHalvingClockInterval();
  return () => {
    _halvingClockSubscribers.delete(listener);
    syncHalvingClockInterval();
  };
}

export function stopNextHalvingCountdown() {
  _halvingCountdownTarget = null;
  syncHalvingClockInterval();
}

function renderNextHalvingCountdownTick() {
  if (!_halvingCountdownTarget || !_halvingCountdownTarget.textNode) return;
  const nowUnix = Date.now() / 1000;
  const remainingSeconds = Math.max(
    0,
    _halvingCountdownTarget.halvingAtUnix - nowUnix
  );
  _halvingCountdownTarget.textNode.textContent = `Next halving in: ~${formatCountdownClock(remainingSeconds)} (token: ${_halvingCountdownTarget.token.toUpperCase()})`;
}

export function startNextHalvingCountdown(target) {
  _halvingCountdownTarget = target;
  renderNextHalvingCountdownTick();
  syncHalvingClockInterval();
}

export function getHalvingCountdownTarget() {
  return _halvingCountdownTarget;
}

export function setHalvingCountdownTextNode(textNode) {
  if (_halvingCountdownTarget) {
    _halvingCountdownTarget.textNode = textNode;
  }
}

export function shouldResetNextHalvingCountdownTarget(prevTarget, nextTarget) {
  if (!prevTarget || !nextTarget) return true;
  return (
    prevTarget.token !== nextTarget.token ||
    prevTarget.halvingMonth !== nextTarget.halvingMonth
  );
}

/* ---------- computeNextHalvingHint ---------- */

export function computeNextHalvingHint({
  currentSimMonth,
  simMonthsPerRealSecond,
  simMonthsTotal,
  tokenNames,
}) {
  if (!Number.isFinite(Number(currentSimMonth))) return null;
  const rate = Number(simMonthsPerRealSecond);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const month = Number(currentSimMonth);
  const totalMonths =
    Number.isFinite(Number(simMonthsTotal)) && Number(simMonthsTotal) > 0
      ? Number(simMonthsTotal)
      : null;

  const candidates = [];
  tokenNames.forEach((token) => {
    const offset = HALVING_BASE_OFFSETS[token];
    if (offset === undefined) return;

    const n = Math.max(
      0,
      Math.floor((month - offset) / HALVING_INTERVAL_MONTHS) + 1
    );
    const halvingMonth = offset + n * HALVING_INTERVAL_MONTHS;

    if (halvingMonth <= month) return;
    if (totalMonths !== null && halvingMonth >= totalMonths) return;

    const deltaMonths = halvingMonth - month;
    const deltaSeconds = deltaMonths / rate;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;

    candidates.push({ token, halvingMonth, deltaSeconds });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.halvingMonth - b.halvingMonth);
  return candidates[0];
}

export function resolveNextHalvingTarget({ data, activeGameMeta, tokenNames }) {
  const seasonCyclesPerGame = Number(
    activeGameMeta?.season_cycles_per_game || 0
  );
  const simMonthsTotal =
    Number.isFinite(seasonCyclesPerGame) && seasonCyclesPerGame > 0
      ? seasonCyclesPerGame * HALVING_INTERVAL_MONTHS
      : null;

  const halvingHint = computeNextHalvingHint({
    currentSimMonth: data?.current_sim_month,
    simMonthsPerRealSecond: activeGameMeta?.sim_months_per_real_second,
    simMonthsTotal,
    tokenNames,
  });
  if (!halvingHint) {
    return null;
  }
  return {
    token: halvingHint.token,
    halvingMonth: halvingHint.halvingMonth,
    halvingAtUnix: Date.now() / 1000 + halvingHint.deltaSeconds,
  };
}

/* ---------- last-halving notice ---------- */

function scheduleLastHalvingHide(notice) {
  if (_lastHalvingHideTimeout) {
    clearTimeout(_lastHalvingHideTimeout);
    _lastHalvingHideTimeout = null;
  }
  if (!notice) return;

  const noticeKey = halvingKey(notice);
  _lastHalvingHideTimeout = setTimeout(() => {
    if (_lastHalvingSeenKey === noticeKey) {
      _lastHalvingNotice = null;
    }
  }, LAST_HALVING_NOTICE_SECONDS * 1000);
}

export function handleLastHalvingStateUpdate(data) {
  const activeGameMeta = _getActiveGameMeta
    ? _getActiveGameMeta(String(data?.game_id || ''))
    : null;
  const tokenNames = normalizeTokenNames(
    Array.isArray(data?.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );
  const seasonCyclesPerGame = Number(
    activeGameMeta?.season_cycles_per_game || 0
  );
  const simMonthsTotal =
    Number.isFinite(seasonCyclesPerGame) && seasonCyclesPerGame > 0
      ? seasonCyclesPerGame * HALVING_INTERVAL_MONTHS
      : null;

  const mostRecentPastHalving = computeMostRecentPastHalving({
    currentSimMonth: data?.current_sim_month,
    tokenNames,
    simMonthsTotal,
  });

  const update = deriveLastHalvingNoticeUpdate({
    previousSeenKey: _lastHalvingSeenKey,
    previousNotice: _lastHalvingNotice,
    mostRecentPastHalving,
    nowUnix: Date.now() / 1000,
  });

  _lastHalvingSeenKey = update.seenKey;
  if (update.changed) {
    _lastHalvingNotice = update.notice;
    scheduleLastHalvingHide(_lastHalvingNotice);
  }
}

export function resetTransientHalvingState() {
  if (_lastHalvingHideTimeout) {
    clearTimeout(_lastHalvingHideTimeout);
    _lastHalvingHideTimeout = null;
  }
  _lastHalvingNotice = null;
  _lastHalvingSeenKey = null;
}

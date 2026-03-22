/*
File: src/ui/season-cards.js
Purpose: Keep season card metrics and per-card halving timers in sync with SSE payloads.
*/

import { setElementTextValue } from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';
import { resolveNextHalvingTarget } from './halving-display.js';

let _getGameMeta = null;
const _seasonHalvingTimers = new Map();

export function initSeasonCards(deps) {
  _getGameMeta = deps.getGameMeta;
}

export function formatRemainingMmSs(targetUnix, nowUnix = Date.now() / 1000) {
  const target = Number(targetUnix);
  if (!Number.isFinite(target)) return '—';
  const now = Number(nowUnix);
  const remaining = Math.max(0, Math.ceil(target - now));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatDurationCompact(totalSeconds) {
  const remaining = Math.max(0, Math.ceil(Number(totalSeconds)));
  if (!Number.isFinite(remaining)) return '—';

  if (remaining < 3600) {
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  if (remaining < 86400) {
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export function classifyHalvingSeverity(remainingSeconds) {
  const remaining = Number(remainingSeconds);
  if (!Number.isFinite(remaining)) return 'normal';
  if (remaining < 5) return 'critical';
  if (remaining < 30) return 'warning';
  return 'normal';
}

export function applyHalvingTextAndSeverity(halvingEl, targetUnix) {
  if (!halvingEl) return;

  if (!Number.isFinite(Number(targetUnix))) {
    setElementTextValue(halvingEl, '—');
    halvingEl.classList.remove(
      'season-halving--warning',
      'season-halving--critical'
    );
    return;
  }

  const nowUnix = Date.now() / 1000;
  const remaining = Math.max(0, Math.ceil(Number(targetUnix) - nowUnix));
  setElementTextValue(halvingEl, formatDurationCompact(remaining));

  const severity = classifyHalvingSeverity(remaining);
  halvingEl.classList.toggle('season-halving--warning', severity === 'warning');
  halvingEl.classList.toggle(
    'season-halving--critical',
    severity === 'critical'
  );
}

export function stopSeasonHalvingTimer(token) {
  const timerState = _seasonHalvingTimers.get(token);
  if (!timerState) return;
  clearInterval(timerState.intervalId);
  _seasonHalvingTimers.delete(token);
}

export function stopSeasonHalvingTimers() {
  Array.from(_seasonHalvingTimers.keys()).forEach(stopSeasonHalvingTimer);
}

export function syncSeasonHalvingTicker({
  token,
  halvingEl,
  halvingAtUnix,
  halvingMonth,
}) {
  if (!halvingEl || !token) return;
  const targetUnix = Number(halvingAtUnix);
  if (!Number.isFinite(targetUnix)) {
    stopSeasonHalvingTimer(token);
    applyHalvingTextAndSeverity(halvingEl, Number.NaN);
    return;
  }

  const existing = _seasonHalvingTimers.get(token);
  const nextHalvingMonth = Number(halvingMonth);
  if (existing && existing.halvingEl === halvingEl) {
    const sameMonth = Number(existing.halvingMonth) === nextHalvingMonth;
    if (sameMonth) {
      const driftSeconds = Math.abs(
        Number(existing.halvingAtUnix) - targetUnix
      );
      // Ignore tiny payload drift caused by coarse sim-month updates; keep smooth local ticking.
      if (driftSeconds >= 3) {
        existing.halvingAtUnix = targetUnix;
      }
      applyHalvingTextAndSeverity(halvingEl, Number(existing.halvingAtUnix));
      return;
    }
  }

  if (
    existing &&
    existing.halvingEl === halvingEl &&
    Number(existing.halvingAtUnix) === targetUnix
  ) {
    applyHalvingTextAndSeverity(halvingEl, targetUnix);
    return;
  }

  stopSeasonHalvingTimer(token);
  applyHalvingTextAndSeverity(halvingEl, targetUnix);

  // The client-side ticker keeps the countdown smooth between authoritative SSE updates.
  const intervalId = setInterval(() => {
    const timerState = _seasonHalvingTimers.get(token);
    if (!timerState) {
      clearInterval(intervalId);
      return;
    }
    const liveTargetUnix = Number(timerState.halvingAtUnix);
    applyHalvingTextAndSeverity(halvingEl, liveTargetUnix);
    const remaining = Math.max(
      0,
      Math.ceil(liveTargetUnix - Date.now() / 1000)
    );
    if (remaining <= 0) {
      clearInterval(intervalId);
      _seasonHalvingTimers.delete(token);
    }
  }, 1000);

  _seasonHalvingTimers.set(token, {
    intervalId,
    halvingAtUnix: targetUnix,
    halvingMonth: nextHalvingMonth,
    halvingEl,
  });
}

export function renderSeasonData(data) {
  if (!data) return;

  const playerState = data.player_state || {};
  const balances = playerState.balances || playerState.tokens || {};
  const outputRatePerToken = data.output_rate_per_token || {};
  const activeGameMeta = _getGameMeta?.(String(data.game_id || ''));
  const tokenNames = normalizeTokenNames(
    Array.isArray(data.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );

  tokenNames.forEach((token) => {
    const seasonCardEl = document.getElementById(`season-${token}`);
    if (!seasonCardEl) return;

    const balanceEl = seasonCardEl.querySelector('.season-balance');
    if (balanceEl) {
      const balance = balances[token];
      balanceEl.classList.add('selectable');
      setElementTextValue(
        balanceEl,
        balance !== undefined
          ? (Math.floor(balance * 100) / 100).toFixed(2)
          : '—'
      );
    }

    const outputEl = seasonCardEl.querySelector('.season-output');
    if (outputEl) {
      const rate = Number(outputRatePerToken[token]);
      outputEl.classList.add('selectable');
      setElementTextValue(
        outputEl,
        Number.isFinite(rate) ? `${rate.toFixed(2)}/s` : '—/s'
      );
    }

    const halvingEl = seasonCardEl.querySelector('.season-halving');
    if (!halvingEl) return;
    halvingEl.classList.add('selectable');

    const nextHalvingTarget = resolveNextHalvingTarget({
      data,
      activeGameMeta,
      tokenNames: [token],
    });
    if (nextHalvingTarget && data.game_status === 'running') {
      syncSeasonHalvingTicker({
        token,
        halvingEl,
        halvingAtUnix: nextHalvingTarget.halvingAtUnix,
        halvingMonth: nextHalvingTarget.halvingMonth,
      });
    } else {
      stopSeasonHalvingTimer(token);
      applyHalvingTextAndSeverity(halvingEl, Number.NaN);
    }
  });

  Array.from(_seasonHalvingTimers.keys()).forEach((token) => {
    if (!tokenNames.includes(token)) {
      stopSeasonHalvingTimer(token);
    }
  });
}

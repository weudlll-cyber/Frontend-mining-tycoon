/**
File: src/ui/lobby-games.js
Purpose: Shared helpers for formatting and normalizing open game records in the lobby.
Backend contract: GET /games/active items; with an account token each item may
carry `my_player_id` (the caller's linked player in that game, or null). Older
backends omit it, which reads as "not joined yet".
Scheduled sync rounds: items with status `scheduled` (in `game_status` or
`status`) carry `scheduled_start_at` (unix seconds) and `opens_in_seconds`.
They are listed as "Upcoming" but cannot be joined until they open; older
backends never send them.
*/

import {
  formatLocalDateTime,
  formatOpensIn,
  normalizeUnixSeconds,
} from '../utils/schedule-time.js';

function normalizeStatus(rawStatus) {
  const status = String(rawStatus || '')
    .trim()
    .toLowerCase();
  if (
    status === 'enrolling' ||
    status === 'running' ||
    status === 'finished' ||
    status === 'scheduled'
  ) {
    return status;
  }
  return 'unknown';
}

function normalizeRoundTypeLabel(rawRoundType) {
  const value = String(rawRoundType || '')
    .trim()
    .toLowerCase();
  if (value === 'asynchronous' || value === 'async') {
    return 'Async';
  }
  if (value === 'synchronous' || value === 'sync') {
    return 'Sync';
  }
  return 'Round n/a';
}

function normalizeScoringModeLabel(rawScoringMode) {
  const value = String(rawScoringMode || '').trim();
  if (!value) {
    return 'Scoring n/a';
  }
  return `Scoring ${value}`;
}

export function formatDurationLabel(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

/** Lifecycle status of a /games/active item (`game_status`, else `status`). */
export function readGameStatus(rawGame) {
  return normalizeStatus(rawGame?.game_status || rawGame?.status);
}

/**
 * When a scheduled round opens, as epoch milliseconds. `opens_in_seconds` is
 * preferred because it is relative to the server clock (immune to a skewed
 * local clock); `scheduled_start_at` is the fallback. Null when neither is set.
 */
export function resolveOpensAtMs(rawGame, nowMs = Date.now()) {
  const opensIn = Number(rawGame?.opens_in_seconds);
  if (
    rawGame?.opens_in_seconds !== null &&
    rawGame?.opens_in_seconds !== undefined &&
    Number.isFinite(opensIn)
  ) {
    return nowMs + Math.max(0, opensIn) * 1000;
  }
  const startAt = normalizeUnixSeconds(rawGame?.scheduled_start_at);
  return startAt === null ? null : startAt * 1000;
}

/** "opens in 1 h 05 min" (or "opening now" once the time has passed). */
export function formatOpensInLabel(opensAtMs, nowMs = Date.now()) {
  const remaining = Math.ceil((opensAtMs - nowMs) / 1000);
  return remaining > 0 ? `opens in ${formatOpensIn(remaining)}` : 'opening now';
}

export function normalizeGameItem(rawGame = {}, nowMs = Date.now()) {
  const gameId = String(rawGame?.game_id || '').trim();
  const status = readGameStatus(rawGame);
  const roundTypeLabel = normalizeRoundTypeLabel(rawGame?.round_type);
  const scoringModeLabel = normalizeScoringModeLabel(rawGame?.scoring_mode);
  const tradeCount = Math.max(0, Number(rawGame?.trade_count || 0));
  const tradeCountLabel = `Trades ${tradeCount}`;
  const playersCount = Math.max(0, Number(rawGame?.players_count || 0));
  const myPlayerId =
    rawGame?.my_player_id === null || rawGame?.my_player_id === undefined
      ? ''
      : String(rawGame.my_player_id).trim();

  let remainingSeconds = 0;
  let remainingLabel = 'n/a';
  let opensAtMs = null;
  let startLabel = '';

  if (status === 'enrolling') {
    remainingSeconds = Math.max(
      0,
      Number(rawGame?.enrollment_remaining_seconds || 0)
    );
    remainingLabel = `Starts in ${formatDurationLabel(remainingSeconds)}`;
  } else if (status === 'running') {
    remainingSeconds = Math.max(0, Number(rawGame?.run_remaining_seconds || 0));
    remainingLabel = `${formatDurationLabel(remainingSeconds)} left`;
  } else if (status === 'scheduled') {
    opensAtMs = resolveOpensAtMs(rawGame, nowMs);
    const startAt =
      normalizeUnixSeconds(rawGame?.scheduled_start_at) ??
      (opensAtMs === null ? null : Math.round(opensAtMs / 1000));
    startLabel =
      startAt === null ? '' : `Starts ${formatLocalDateTime(startAt)}`;
    remainingLabel =
      opensAtMs === null ? 'Opens soon' : formatOpensInLabel(opensAtMs, nowMs);
  }

  return {
    gameId,
    status,
    roundTypeLabel,
    scoringModeLabel,
    tradeCount,
    tradeCountLabel,
    playersCount,
    myPlayerId,
    remainingSeconds,
    remainingLabel,
    isScheduled: status === 'scheduled',
    opensAtMs,
    startLabel,
  };
}

export function buildGameStatusBadge(status) {
  if (status === 'enrolling') {
    return { text: 'Enrolling', className: 'game-badge badge-enrolling' };
  }
  if (status === 'running') {
    return { text: 'Running', className: 'game-badge badge-running' };
  }
  if (status === 'finished') {
    return { text: 'Finished', className: 'game-badge badge-finished' };
  }
  if (status === 'scheduled') {
    return { text: 'Scheduled', className: 'game-badge badge-scheduled' };
  }
  return { text: 'Unknown', className: 'game-badge badge-unknown' };
}

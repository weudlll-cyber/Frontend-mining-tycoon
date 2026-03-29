/**
File: src/ui/lobby-games.js
Purpose: Shared helpers for formatting and normalizing open game records in the lobby.
*/

function normalizeStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();
  if (status === 'enrolling' || status === 'running' || status === 'finished') {
    return status;
  }
  return 'unknown';
}

function normalizeRoundTypeLabel(rawRoundType) {
  const value = String(rawRoundType || '').trim().toLowerCase();
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

export function normalizeGameItem(rawGame = {}) {
  const gameId = String(rawGame?.game_id || '').trim();
  const status = normalizeStatus(rawGame?.game_status);
  const roundTypeLabel = normalizeRoundTypeLabel(rawGame?.round_type);
  const scoringModeLabel = normalizeScoringModeLabel(rawGame?.scoring_mode);
  const tradeCount = Math.max(0, Number(rawGame?.trade_count || 0));
  const tradeCountLabel = `Trades ${tradeCount}`;
  const playersCount = Math.max(0, Number(rawGame?.players_count || 0));

  let remainingSeconds = 0;
  let remainingLabel = 'n/a';

  if (status === 'enrolling') {
    remainingSeconds = Math.max(0, Number(rawGame?.enrollment_remaining_seconds || 0));
    remainingLabel = `Starts in ${formatDurationLabel(remainingSeconds)}`;
  } else if (status === 'running') {
    remainingSeconds = Math.max(0, Number(rawGame?.run_remaining_seconds || 0));
    remainingLabel = `${formatDurationLabel(remainingSeconds)} left`;
  }

  return {
    gameId,
    status,
    roundTypeLabel,
    scoringModeLabel,
    tradeCount,
    tradeCountLabel,
    playersCount,
    remainingSeconds,
    remainingLabel,
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
  return { text: 'Unknown', className: 'game-badge badge-unknown' };
}

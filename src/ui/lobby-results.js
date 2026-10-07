/**
File: src/ui/lobby-results.js
Purpose: Pure formatting and DOM builders for the lobby "My results" dialog:
  account history rows (GET /auth/me/history) and the full final leaderboard
  of one round (GET /games/{id}/results), plus the server-backed snapshot for
  the "Last Game Highscores" panel.
Role in system:
- Upstream: backend-authoritative history/results payloads fetched by
  src/services/auth-client.js.
- Downstream: src/ui/lobby-results-dialog.js (dialog controller) and
  src/lobby.js (last-game panel).
Constraints: display-only; scores are never recomputed, only formatted via
  src/utils/score-format.js (int, or 4-decimal float in Efficiency mode).
Security notes: every backend value (player names included) is rendered with
  textContent / createElement only; no innerHTML.
*/

import { formatBackendScore } from '../utils/score-format.js';

const SCORING_MODE_LABELS = Object.freeze({
  stockpile: 'Stockpile',
  stockpile_total_tokens: 'Stockpile',
  power: 'Power',
  power_oracle_weighted: 'Power',
  mining_time: 'Mining Time',
  mining_time_equivalent: 'Mining Time',
  efficiency: 'Efficiency',
  efficiency_system_mastery: 'Efficiency',
});

/** Human label for a short or canonical scoring mode (missing = Stockpile). */
export function formatScoringModeLabel(mode) {
  const key = String(mode || 'stockpile')
    .trim()
    .toLowerCase();
  return SCORING_MODE_LABELS[key] || key;
}

/** "Sync round" / "Async round" / "Round" for a backend round_type. */
export function formatRoundTypeLabel(roundType) {
  const value = String(roundType || '')
    .trim()
    .toLowerCase();
  if (value === 'asynchronous' || value === 'async') return 'Async round';
  if (value === 'synchronous' || value === 'sync') return 'Sync round';
  return 'Round';
}

/** Local date/time for a unix timestamp in seconds; "—" when missing. */
export function formatFinishedAt(unixSeconds) {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  return new Date(seconds * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rankLabel(rank, participants) {
  const rankText = Number.isFinite(Number(rank)) ? `#${rank}` : '#?';
  const count = Number(participants);
  return Number.isFinite(count) && count > 0
    ? `${rankText} of ${count}`
    : rankText;
}

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * One history row: rank/participants, name and score on the first line,
 * date, round type and scoring mode on the second, and a "Full results" button.
 */
export function buildHistoryItem(item, { onFullResults } = {}) {
  const row = document.createElement('li');
  row.className = 'history-item';
  row.dataset.gameId = String(item?.game_id ?? '');

  const main = document.createElement('div');
  main.className = 'history-main';
  const headline = document.createElement('div');
  headline.className = 'history-headline';
  headline.append(
    span('history-rank', rankLabel(item?.rank, item?.participants)),
    span('history-name', String(item?.player_name || 'Player')),
    span(
      'history-score',
      formatBackendScore(item?.score, item?.scoring_mode, { grouping: true })
    )
  );
  const meta = document.createElement('div');
  meta.className = 'history-meta';
  meta.textContent = [
    formatFinishedAt(item?.finished_at),
    formatRoundTypeLabel(item?.round_type),
    formatScoringModeLabel(item?.scoring_mode),
  ].join(' • ');
  main.append(headline, meta);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-full-results-btn';
  button.textContent = 'Full results';
  button.addEventListener('click', () => onFullResults?.(item));

  row.append(main, button);
  return row;
}

/**
 * Index of the viewer's own row: by player_id when known (deep link from the
 * player board), otherwise by player_name + rank (history entry).
 * @returns {number} -1 when nothing matches
 */
export function findOwnResultIndex(rows, { playerId, playerName, rank } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const id = String(playerId ?? '').trim();
  if (id) {
    return list.findIndex((row) => String(row?.player_id ?? '') === id);
  }
  const name = String(playerName || '').trim();
  if (!name) return -1;
  return list.findIndex(
    (row) =>
      String(row?.player_name || '').trim() === name &&
      Number(row?.rank) === Number(rank)
  );
}

/** Full final leaderboard as an ordered list; the own row gets `.is-own`. */
export function buildResultsList(payload, highlight = {}) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const ownIndex = findOwnResultIndex(rows, highlight);
  const list = document.createElement('ol');
  list.className = 'results-list';
  rows.forEach((row, index) => {
    const item = document.createElement('li');
    item.className = 'results-item';
    if (index === ownIndex) {
      item.classList.add('is-own');
      item.setAttribute('aria-current', 'true');
    }
    item.append(
      span('results-rank', `#${row?.rank ?? index + 1}`),
      span('results-name', String(row?.player_name || 'Player')),
      span(
        'results-score',
        formatBackendScore(row?.score, payload?.scoring_mode)
      )
    );
    list.appendChild(item);
  });
  return list;
}

/** One-line summary above the full leaderboard. */
export function formatResultsSummary(payload) {
  const participants = Number(payload?.participants);
  const parts = [
    formatFinishedAt(payload?.finished_at),
    formatRoundTypeLabel(payload?.round_type),
    formatScoringModeLabel(payload?.scoring_mode),
  ];
  if (Number.isFinite(participants) && participants > 0) {
    parts.push(`${participants} player${participants === 1 ? '' : 's'}`);
  }
  return parts.join(' • ');
}

/**
 * Snapshot in the shape src/ui/last-game-highscores.js renders, built from a
 * server results payload (top 5 only, like the local snapshot).
 */
export function buildServerLastGameSnapshot(payload) {
  const gameId = String(payload?.game_id ?? '').trim();
  if (!gameId) return null;
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return {
    gameId,
    scoringModeLabel: `${formatScoringModeLabel(payload?.scoring_mode)} Mode`,
    leaderboard: rows.slice(0, 5).map((row, index) => ({
      rank: Number(row?.rank) || index + 1,
      name: String(row?.player_name || 'Player'),
      score: formatBackendScore(row?.score, payload?.scoring_mode, {
        grouping: false,
      }),
    })),
  };
}

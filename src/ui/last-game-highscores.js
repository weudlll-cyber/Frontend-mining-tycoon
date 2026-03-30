/**
File: src/ui/last-game-highscores.js
Purpose: Render the latest finished game's highscore snapshot in the player panel.
*/

import { clearNode, setElementTextValue } from '../utils/dom-utils.js';

let _summaryEl = null;
let _listEl = null;

export function initLastGameHighscores({ summaryEl, listEl }) {
  _summaryEl = summaryEl;
  _listEl = listEl;
}

function normalizeLeaderboardRows(data) {
  const leaderboard = Array.isArray(data?.leaderboard_top_5)
    ? data.leaderboard_top_5
    : Array.isArray(data?.leaderboard)
      ? data.leaderboard
      : [];

  return leaderboard.slice(0, 5).map((entry, index) => ({
    rank: index + 1,
    name: String(entry?.name || entry?.player_id || 'Unknown player'),
    score: String(Math.floor(Number(entry?.score || 0))),
  }));
}

export function buildLastGameSnapshot({
  data,
  gameId,
  scoringModeLabel,
  finishedAt = new Date().toISOString(),
} = {}) {
  const normalizedGameId = String(gameId || data?.game_id || '').trim();
  if (!normalizedGameId) {
    return null;
  }

  return {
    gameId: normalizedGameId,
    scoringModeLabel: String(scoringModeLabel || 'Score'),
    finishedAt,
    leaderboard: normalizeLeaderboardRows(data),
  };
}

function renderPlaceholder(message) {
  if (!_listEl) return;
  clearNode(_listEl);
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = message;
  _listEl.appendChild(placeholder);
}

export function renderLastGameHighscores(snapshot = null) {
  if (!_summaryEl || !_listEl) {
    return;
  }

  if (!snapshot) {
    setElementTextValue(_summaryEl, 'No finished game recorded yet.');
    renderPlaceholder('Finish a round to see the latest highscores here.');
    return;
  }

  setElementTextValue(
    _summaryEl,
    `${snapshot.gameId} • ${snapshot.scoringModeLabel} • Last finished game`
  );

  if (
    !Array.isArray(snapshot.leaderboard) ||
    snapshot.leaderboard.length === 0
  ) {
    renderPlaceholder('No leaderboard snapshot was available for that round.');
    return;
  }

  clearNode(_listEl);
  const list = document.createElement('ol');
  list.className = 'last-game-score-list';

  snapshot.leaderboard.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'last-game-score-item';

    const rank = document.createElement('span');
    rank.className = 'last-game-score-rank';
    rank.textContent = `#${entry.rank}`;

    const name = document.createElement('span');
    name.className = 'last-game-score-name';
    name.textContent = entry.name;

    const score = document.createElement('span');
    score.className = 'last-game-score-value';
    score.textContent = entry.score;

    item.append(rank, name, score);
    list.appendChild(item);
  });

  _listEl.appendChild(list);
}

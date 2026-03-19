/*
File: src/ui/leaderboard.js
Purpose: Render the compact top-5 leaderboard table.
*/

import { clearNode } from '../utils/dom-utils.js';

let _leaderboardEl = null;

export function initLeaderboard(deps) {
  _leaderboardEl = deps.leaderboardEl;
}

export function renderLeaderboard(data) {
  if (!_leaderboardEl) return;

  clearNode(_leaderboardEl);

  if (!data) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Waiting for game data...';
    _leaderboardEl.appendChild(placeholder);
    return;
  }

  const leaderboard = data.leaderboard_top_5 || data.leaderboard || [];
  if (!leaderboard.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Waiting for leaderboard data...';
    _leaderboardEl.appendChild(placeholder);
    return;
  }

  const table = document.createElement('table');
  table.className = 'leaderboard-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Rank', 'Player', 'Mined'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (label === 'Mined') {
      th.style.textAlign = 'right';
    }
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  leaderboard.slice(0, 5).forEach((player, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${index + 1}`;
    rankCell.appendChild(rank);

    const playerCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = player.name || player.player_id || '-';
    playerCell.appendChild(name);

    const scoreCell = document.createElement('td');
    scoreCell.style.textAlign = 'right';
    const score = document.createElement('span');
    score.className = 'leaderboard-score';
    score.textContent = String(Math.floor(player.score || 0));
    scoreCell.appendChild(score);

    row.append(rankCell, playerCell, scoreCell);
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  _leaderboardEl.appendChild(table);
}

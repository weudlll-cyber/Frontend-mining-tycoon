/*
File: src/ui/leaderboard.js
Purpose: Render the compact top-5 leaderboard table.
*/

import { clearNode, setElementTextValue } from '../utils/dom-utils.js';

let _leaderboardEl = null;
const _uiRefs = {
  built: false,
  placeholder: null,
  table: null,
  tbody: null,
  rows: [],
};

export function initLeaderboard(deps) {
  _leaderboardEl = deps.leaderboardEl;
  _uiRefs.built = false;
  _uiRefs.placeholder = null;
  _uiRefs.table = null;
  _uiRefs.tbody = null;
  _uiRefs.rows = [];
}

function ensureLeaderboardBuilt() {
  if (_uiRefs.built) {
    return _uiRefs;
  }

  clearNode(_leaderboardEl);

  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder selectable';
  placeholder.hidden = true;

  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.hidden = true;

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Rank', 'Player', 'Score'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (label === 'Score') {
      th.style.textAlign = 'right';
    }
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  const rows = Array.from({ length: 5 }, () => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank selectable';
    rankCell.appendChild(rank);

    const playerCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'leaderboard-name selectable';
    playerCell.appendChild(name);

    const scoreCell = document.createElement('td');
    scoreCell.style.textAlign = 'right';
    const score = document.createElement('span');
    score.className = 'leaderboard-score selectable';
    scoreCell.appendChild(score);

    row.append(rankCell, playerCell, scoreCell);
    tbody.appendChild(row);

    return { row, rank, name, score };
  });

  table.append(thead, tbody);
  _leaderboardEl.append(placeholder, table);

  _uiRefs.built = true;
  _uiRefs.placeholder = placeholder;
  _uiRefs.table = table;
  _uiRefs.tbody = tbody;
  _uiRefs.rows = rows;
  return _uiRefs;
}

export function renderLeaderboard(data) {
  if (!_leaderboardEl) return;

  const refs = ensureLeaderboardBuilt();

  if (!data) {
    refs.table.hidden = true;
    refs.placeholder.hidden = false;
    setElementTextValue(refs.placeholder, 'Waiting for game data...');
    return;
  }

  const leaderboard = data.leaderboard_top_5 || data.leaderboard || [];
  if (!leaderboard.length) {
    refs.table.hidden = true;
    refs.placeholder.hidden = false;
    setElementTextValue(refs.placeholder, 'Waiting for leaderboard data...');
    return;
  }

  refs.placeholder.hidden = true;
  refs.table.hidden = false;

  refs.rows.forEach((rowRefs, index) => {
    const player = leaderboard[index];
    const visible = Boolean(player);
    if (!visible) {
      if (rowRefs.row.parentNode === refs.tbody) {
        refs.tbody.removeChild(rowRefs.row);
      }
      return;
    }

    if (rowRefs.row.parentNode !== refs.tbody) {
      refs.tbody.appendChild(rowRefs.row);
    }

    setElementTextValue(rowRefs.rank, `#${index + 1}`);
    setElementTextValue(rowRefs.name, player.name || player.player_id || '-');
    setElementTextValue(rowRefs.score, String(Math.floor(player.score || 0)));
  });
}

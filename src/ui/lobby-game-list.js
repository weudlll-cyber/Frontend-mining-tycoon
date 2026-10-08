/**
File: src/ui/lobby-game-list.js
Purpose: Render the lobby's open-games list (index.html `#open-games-list`) as
  a keyboard-accessible single-select listbox, group scheduled rounds under a
  visual "Upcoming" divider and tick their "opens in ..." countdowns.
Role in system:
- Upstream: src/lobby.js passes the listed /games/active items (already
  filtered) and owns the selection state, join button and messages.
- Downstream: DOM only; `onSelect(game)` reports a selection back to lobby.js,
  `onDue()` asks it to reload the list when a scheduled round should open.
Accessibility (WAI-ARIA listbox pattern):
- The list is `role="listbox"` while it has rows; each row is `role="option"`
  with `aria-selected` and a roving tabindex (one row in the Tab order).
- ArrowDown/ArrowRight and ArrowUp/ArrowLeft move to the next/previous row,
  Home/End to the first/last; selection follows focus (same effect as a
  click). Enter/Space select the focused row. Mouse behavior is unchanged.
- The 10 s auto refresh rebuilds the rows; focus is moved back onto the same
  game's row so a keyboard user does not lose their place.
- The "Upcoming" divider is decorative (aria-hidden); every scheduled row also
  carries its own "Scheduled" badge and start time in its accessible text.
Constraints: display only; whether a round can be joined stays a backend
  decision (409 JOIN_NOT_ALLOWED_SCHEDULED).
Security notes: backend values are rendered with textContent only.
*/

import {
  buildGameStatusBadge,
  formatOpensInLabel,
  normalizeGameItem,
} from './lobby-games.js';

const COUNTDOWN_TICK_MS = 1000;
const NAV_KEYS = new Set([
  'ArrowDown',
  'ArrowRight',
  'ArrowUp',
  'ArrowLeft',
  'Home',
  'End',
]);

let countdownTimer = null;

function getOptionRows(listEl) {
  return Array.from(listEl.querySelectorAll('.game-list-item'));
}

/**
 * Mark `row` as the selected option (null clears the selection). The roving
 * tabindex follows the selection; with no selection the first row is the
 * Tab stop.
 */
export function markSelectedRow(listEl, row) {
  const rows = getOptionRows(listEl);
  rows.forEach((item) => {
    const isSelected = item === row;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-selected', String(isSelected));
    item.tabIndex = isSelected ? 0 : -1;
  });
  if (!row && rows.length) rows[0].tabIndex = 0;
}

function buildRow(game) {
  const row = document.createElement('li');
  row.className = 'game-list-item';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  row.tabIndex = -1;
  row.dataset.gameId = game.gameId;
  if (game.myPlayerId) row.dataset.myPlayerId = game.myPlayerId;

  const left = document.createElement('div');
  left.className = 'game-list-main';

  const title = document.createElement('div');
  title.className = 'game-id';
  title.textContent = `${game.roundTypeLabel} • ${game.scoringModeLabel}`;
  if (game.myPlayerId) {
    const chip = document.createElement('span');
    chip.className = 'game-mine-chip';
    chip.textContent = 'You joined';
    title.appendChild(chip);
  }

  const subtitle = document.createElement('div');
  subtitle.className = 'game-subtitle';
  const players = `${game.playersCount} player${game.playersCount === 1 ? '' : 's'}`;
  if (game.isScheduled) {
    row.classList.add('is-scheduled');
    subtitle.textContent = `${game.tradeCountLabel} • ${players}`;
    const schedule = document.createElement('div');
    schedule.className = 'game-schedule';
    if (game.startLabel) {
      const start = document.createElement('span');
      start.className = 'game-start-time';
      start.textContent = `${game.startLabel} • `;
      schedule.appendChild(start);
    }
    const countdown = document.createElement('span');
    countdown.className = 'game-countdown';
    countdown.textContent = game.remainingLabel;
    schedule.appendChild(countdown);
    if (game.opensAtMs !== null) {
      row.dataset.opensAtMs = String(game.opensAtMs);
    }
    left.append(title, subtitle, schedule);
  } else {
    subtitle.textContent = `${game.tradeCountLabel} • ${players} • ${game.remainingLabel}`;
    left.append(title, subtitle);
  }

  const badge = document.createElement('span');
  const badgeMeta = buildGameStatusBadge(game.status);
  badge.className = badgeMeta.className;
  badge.textContent = badgeMeta.text;

  row.append(left, badge);
  return row;
}

function buildUpcomingDivider() {
  const divider = document.createElement('li');
  divider.className = 'game-list-group-label';
  // Decorative: the rows below announce "Scheduled" and their start time.
  divider.setAttribute('aria-hidden', 'true');
  divider.textContent = 'Upcoming';
  return divider;
}

/**
 * Rebuild the list. Joinable rounds come first, scheduled rounds after them
 * (ordered by opening time) below an "Upcoming" divider.
 * @param {HTMLElement} listEl
 * @param {object[]} rawGames - /games/active items that should be listed
 * @param {{ selectedGameId?: string, nowMs?: number,
 *   onSelect: (game: object) => void }} options
 * @returns {object|null} the normalized game that is still selected, or null
 */
export function renderLobbyGameList(
  listEl,
  rawGames,
  { selectedGameId = '', nowMs = Date.now(), onSelect }
) {
  const focusedGameId = listEl.contains(document.activeElement)
    ? document.activeElement?.dataset?.gameId || ''
    : '';
  listEl.replaceChildren();

  const games = rawGames
    .map((raw) => normalizeGameItem(raw, nowMs))
    .filter((game) => game.gameId);
  const openGames = games.filter((game) => !game.isScheduled);
  const upcoming = games
    .filter((game) => game.isScheduled)
    .sort((a, b) => (a.opensAtMs ?? Infinity) - (b.opensAtMs ?? Infinity));

  if (!games.length) {
    // An empty listbox is not a valid widget: plain list with a message.
    listEl.removeAttribute('role');
    const emptyItem = document.createElement('li');
    emptyItem.className = 'game-list-empty';
    emptyItem.textContent = 'No joinable games right now.';
    listEl.appendChild(emptyItem);
    stopScheduledCountdown();
    return null;
  }

  listEl.setAttribute('role', 'listbox');
  let selectedGame = null;
  let selectedRow = null;
  let focusRow = null;

  const appendGame = (game) => {
    const row = buildRow(game);
    if (game.gameId === selectedGameId) {
      selectedGame = game;
      selectedRow = row;
    }
    if (game.gameId === focusedGameId) focusRow = row;
    row.addEventListener('click', () => {
      markSelectedRow(listEl, row);
      onSelect(game);
    });
    listEl.appendChild(row);
  };

  openGames.forEach(appendGame);
  if (upcoming.length) {
    listEl.appendChild(buildUpcomingDivider());
    upcoming.forEach(appendGame);
  }

  markSelectedRow(listEl, selectedRow);
  // Keep keyboard focus on the same game across the periodic refresh.
  focusRow?.focus();
  return selectedGame;
}

/**
 * Keyboard support for the listbox (bound once; rows are delegated so the
 * handler survives every refresh).
 */
export function bindLobbyGameListKeyboard(listEl) {
  listEl.addEventListener('keydown', (event) => {
    const rows = getOptionRows(listEl);
    const current = event.target.closest?.('.game-list-item');
    const index = rows.indexOf(current);
    if (index < 0) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      current.click();
      return;
    }
    if (!NAV_KEYS.has(event.key)) return;

    event.preventDefault();
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = Math.min(rows.length - 1, index + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = Math.max(0, index - 1);
    } else if (event.key === 'Home') {
      next = 0;
    } else {
      next = rows.length - 1;
    }
    // Selection follows focus, exactly like clicking the row.
    rows[next].click();
    rows[next].focus();
  });
}

/**
 * Update every scheduled row's "opens in ..." text. While a row's opening
 * time has passed, every tick calls `onDue` so the lobby reloads the list
 * (the backend then reports the round as enrolling); the lobby throttles
 * these reloads.
 * @returns {boolean} true when at least one row is due in this tick
 */
export function tickScheduledCountdowns(listEl, onDue, nowMs = Date.now()) {
  let due = false;
  listEl
    .querySelectorAll('.game-list-item[data-opens-at-ms]')
    .forEach((row) => {
      const opensAtMs = Number(row.dataset.opensAtMs);
      const countdown = row.querySelector('.game-countdown');
      countdown.textContent = formatOpensInLabel(opensAtMs, nowMs);
      if (nowMs >= opensAtMs) due = true;
    });
  if (due) onDue();
  return due;
}

/** Start (or restart) the 1 s countdown ticker for scheduled rows. */
export function startScheduledCountdown(listEl, onDue) {
  stopScheduledCountdown();
  if (!listEl.querySelector('.game-list-item[data-opens-at-ms]')) return;
  countdownTimer = window.setInterval(() => {
    tickScheduledCountdowns(listEl, onDue);
  }, COUNTDOWN_TICK_MS);
}

export function stopScheduledCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

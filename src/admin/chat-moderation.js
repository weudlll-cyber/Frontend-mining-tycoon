/**
 * File: src/admin/chat-moderation.js
 * Purpose: Admin "Chat Moderation" section (admin.html section 13). Opened per
 *          game from the Chat row action in Game Management: lists active
 *          mutes with Unmute buttons, mutes a player for 15 min / 1 h / 24 h
 *          or until the round ends, and clears the game's chat.
 * Role in system: Initialised by game-management.js. Endpoints (backend
 *          enforces admin access via admin-api.js headers):
 *          GET    /admin/games/{id}/chat/mutes  -> {mutes:[{player_id, player_name, muted_until}]}
 *          POST   /admin/games/{id}/chat/mute   {player_id, minutes|null}
 *          DELETE /admin/games/{id}/chat/mute/{player_id}
 *          POST   /admin/games/{id}/chat/clear
 *          The player picker uses the public GET /games/{id}/leaderboard
 *          ([{player_id, name, score}]); without it a player ID input is used.
 * Constraints: chat is social-only (LOCKED_DECISIONS §D); moderation never
 *          touches gameplay state. Backends without these endpoints show the
 *          backend error message.
 * Security notes: names and backend messages are rendered via textContent;
 *          game and player IDs are URL-encoded.
 */

import { adminRequest } from './admin-api.js';

const ROUND_END = 'round';

let _gameId = null;
let _loadToken = 0;

function el(id) {
  return document.getElementById(id);
}

function showResult(message, kind = '') {
  const resultEl = el('admin-chat-result');
  if (!resultEl) return;
  resultEl.textContent = message;
  resultEl.className = message ? `result-box ${kind}` : 'result-box';
}

function gamePath(gameId, suffix = '') {
  return `/admin/games/${encodeURIComponent(gameId)}/chat${suffix}`;
}

/** "Until the round ends" for null, else the local date and time. */
export function formatMutedUntil(mutedUntil) {
  const seconds = Number(mutedUntil);
  if (mutedUntil === null || mutedUntil === undefined || !seconds) {
    return 'Until the round ends';
  }
  return new Date(seconds * 1000).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Duration select value -> request `minutes` (null = until round ends). */
export function parseMuteMinutes(value) {
  if (value === ROUND_END) return null;
  const minutes = Number.parseInt(value, 10);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440
    ? minutes
    : null;
}

function renderMutes(mutes) {
  const tableEl = el('admin-chat-mutes-table');
  const tbodyEl = el('admin-chat-mutes-tbody');
  const emptyEl = el('admin-chat-mutes-empty');
  const rows = mutes.map((mute) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = String(mute?.player_name || '—');
    const idCell = document.createElement('td');
    idCell.textContent = String(mute?.player_id ?? '?');
    const untilCell = document.createElement('td');
    untilCell.textContent = formatMutedUntil(mute?.muted_until);
    const actionCell = document.createElement('td');
    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.className = 'admin-secondary-btn';
    unmuteBtn.textContent = 'Unmute';
    unmuteBtn.setAttribute(
      'aria-label',
      `Unmute ${mute?.player_name || `player ${mute?.player_id}`}`
    );
    unmuteBtn.addEventListener('click', () =>
      unmutePlayer(mute?.player_id, unmuteBtn)
    );
    actionCell.appendChild(unmuteBtn);
    row.append(nameCell, idCell, untilCell, actionCell);
    return row;
  });
  tbodyEl.replaceChildren(...rows);
  tableEl.hidden = rows.length === 0;
  emptyEl.hidden = rows.length !== 0;
}

async function loadMutes() {
  const gameId = _gameId;
  const token = _loadToken;
  try {
    const result = await adminRequest(gamePath(gameId, '/mutes'));
    if (token !== _loadToken) return;
    renderMutes(Array.isArray(result?.mutes) ? result.mutes : []);
  } catch (error) {
    if (token !== _loadToken) return;
    renderMutes([]);
    el('admin-chat-mutes-empty').hidden = true;
    showResult(
      `❌ Could not load mutes for game ${gameId}: ${error.message}`,
      'error'
    );
  }
}

/**
 * Fill the player picker from the public leaderboard. Without players (or
 * when the request fails) the player ID input is shown instead.
 */
async function loadPlayers() {
  const gameId = _gameId;
  const token = _loadToken;
  const selectEl = el('admin-chat-mute-player');
  const idInputEl = el('admin-chat-mute-player-id');
  let players;
  try {
    const result = await adminRequest(
      `/games/${encodeURIComponent(gameId)}/leaderboard`
    );
    players = (Array.isArray(result) ? result : []).filter((player) =>
      Number.isInteger(player?.player_id)
    );
  } catch {
    players = [];
  }
  if (token !== _loadToken) return;
  const options = players
    .slice()
    .sort((a, b) => a.player_id - b.player_id)
    .map((player) => {
      const option = document.createElement('option');
      option.value = String(player.player_id);
      option.textContent = `${player.name || 'Player'} (#${player.player_id})`;
      return option;
    });
  selectEl.replaceChildren(...options);
  selectEl.hidden = options.length === 0;
  idInputEl.hidden = options.length !== 0;
}

function selectedPlayerId() {
  const selectEl = el('admin-chat-mute-player');
  const raw = selectEl.hidden
    ? el('admin-chat-mute-player-id').value
    : selectEl.value;
  const playerId = Number(String(raw || '').trim());
  return Number.isInteger(playerId) && playerId > 0 ? playerId : null;
}

async function mutePlayer() {
  const gameId = _gameId;
  const playerId = selectedPlayerId();
  if (playerId === null) {
    showResult('❌ Choose a player or enter a valid player ID.', 'error');
    return;
  }
  const minutes = parseMuteMinutes(el('admin-chat-mute-duration').value);
  const button = el('admin-chat-mute-btn');
  button.disabled = true;
  showResult('');
  try {
    const result = await adminRequest(gamePath(gameId, '/mute'), {
      method: 'POST',
      body: { player_id: playerId, minutes },
    });
    const until = result?.muted_until
      ? `until ${formatMutedUntil(result.muted_until)}`
      : 'until the round ends';
    showResult(`✅ Player ${playerId} muted ${until}.`, 'success');
    await loadMutes();
  } catch (error) {
    showResult(
      `❌ Could not mute player ${playerId}: ${error.message}`,
      'error'
    );
  } finally {
    button.disabled = false;
  }
}

async function unmutePlayer(playerId, button) {
  const gameId = _gameId;
  button.disabled = true;
  showResult('');
  try {
    await adminRequest(
      gamePath(gameId, `/mute/${encodeURIComponent(playerId)}`),
      { method: 'DELETE' }
    );
    showResult(`✅ Player ${playerId} unmuted.`, 'success');
    await loadMutes();
  } catch (error) {
    button.disabled = false;
    showResult(
      `❌ Could not unmute player ${playerId}: ${error.message}`,
      'error'
    );
  }
}

async function clearChat() {
  const gameId = _gameId;
  if (
    !confirm(
      `Clear the chat of game ${gameId}? All players' chat messages disappear. This cannot be undone.`
    )
  ) {
    return;
  }
  const button = el('admin-chat-clear-btn');
  button.disabled = true;
  showResult('');
  try {
    await adminRequest(gamePath(gameId, '/clear'), { method: 'POST' });
    showResult(`✅ Chat of game ${gameId} was cleared.`, 'success');
  } catch (error) {
    showResult(`❌ Could not clear chat: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

/**
 * Open the moderation panel for one game (row action in Game Management) and
 * load its mutes and players. Scrolls the section into view because the
 * trigger lives in the game list further up the page.
 */
export async function showChatModeration(gameId) {
  const panelEl = el('admin-chat-panel');
  if (!panelEl) return;
  _gameId = String(gameId);
  _loadToken += 1;
  el('admin-chat-gate').hidden = true;
  el('admin-chat-title').textContent = `Game ${_gameId} chat`;
  panelEl.hidden = false;
  showResult('');
  panelEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  await Promise.all([loadMutes(), loadPlayers()]);
}

export function initChatModeration() {
  const formEl = el('admin-chat-mute-form');
  const clearBtn = el('admin-chat-clear-btn');
  if (!formEl || !clearBtn) return;
  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    void mutePlayer();
  });
  clearBtn.addEventListener('click', () => {
    void clearChat();
  });
}

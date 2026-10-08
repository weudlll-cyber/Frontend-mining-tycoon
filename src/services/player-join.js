/**
File: src/services/player-join.js
Purpose: Make sure the player board streams as a player of the chosen game:
  reuse the stored player id when it still belongs to the game, else join.
Role in system:
- Upstream: start-flow.js (Enter game / Start Async Session) with the game id
  chosen in the lobby and the stored player id.
- Downstream: GET /games/{id}/state (reuse check), POST /games/{id}/join, the
  stored game/player ids and player token, and the injected player-id field
  setter and `onJoined` callback (collapses the setup shell).
Constraints:
- With an account token the backend links the player to the account and
  returns the account's existing player (rejoin) instead of a new one.
- Join errors are thrown as Error with a player-facing message (422 = name
  rejected by the backend).
Security notes: ids are URL-encoded; tokens are stored, never shown or logged.
*/

import { readApiError } from '../utils/api-error.js';
import {
  STORAGE_KEYS,
  getPlayerTokenStorageKey,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';

let _deps = {};

/**
 * @param {{ getPlayerName: () => string, setPlayerId: (id: string) => void,
 *   onJoined: () => void }} deps
 */
export function initPlayerJoin(deps) {
  _deps = deps || {};
}

async function canReusePlayerForGame({ baseUrl, gameId, playerId }) {
  const normalizedGameId = String(gameId || '').trim();
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedGameId || !normalizedPlayerId) {
    return false;
  }

  const headers = {};
  const storedToken = getStorageItem(
    getPlayerTokenStorageKey(normalizedGameId, normalizedPlayerId)
  );
  if (storedToken) {
    headers['X-Player-Token'] = storedToken;
  }

  try {
    const response = await fetch(
      `${baseUrl}/games/${encodeURIComponent(normalizedGameId)}/state?player_id=${encodeURIComponent(normalizedPlayerId)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return (
      String(payload?.game_id || '') === normalizedGameId &&
      String(payload?.player_id || '') === normalizedPlayerId
    );
  } catch {
    return false;
  }
}

export async function ensurePlayerJoinedForStream({
  baseUrl,
  gameId,
  playerId,
}) {
  const normalizedGameId = String(gameId || '').trim();
  const existingPlayerId = String(playerId || '').trim();

  if (!normalizedGameId) {
    throw new Error('Enter a game ID before starting the stream.');
  }

  if (existingPlayerId) {
    const canReuse = await canReusePlayerForGame({
      baseUrl,
      gameId: normalizedGameId,
      playerId: existingPlayerId,
    });
    if (canReuse) {
      return existingPlayerId;
    }

    // Existing player id does not belong to the selected game anymore.
    _deps.setPlayerId('');
    setStorageItem(STORAGE_KEYS.playerId, '');
  }

  const playerName = String(_deps.getPlayerName() || '').trim() || 'Player';
  // WHY: with the account token the backend links the player to the account
  // and returns the account's existing player (rejoin) instead of a new one.
  const joinHeaders = { 'Content-Type': 'application/json' };
  const accountToken = String(
    getStorageItem(STORAGE_KEYS.authToken) || ''
  ).trim();
  if (accountToken) joinHeaders.Authorization = `Bearer ${accountToken}`;
  const joinResponse = await fetch(
    `${baseUrl}/games/${encodeURIComponent(normalizedGameId)}/join`,
    {
      method: 'POST',
      headers: joinHeaders,
      body: JSON.stringify({ name: playerName }),
    }
  );

  if (!joinResponse.ok) {
    const { message, status } = await readApiError(
      joinResponse,
      `${joinResponse.status} ${joinResponse.statusText}`.trim()
    );
    // 422: backend rejected the player name (1-24 chars, letters/digits/space/_-.).
    throw new Error(
      status === 422
        ? `Invalid player name: ${message}`
        : `Join failed: ${message}`
    );
  }

  const joinData = await joinResponse.json();
  const joinedPlayerId = String(joinData?.player_id || '').trim();
  if (!joinedPlayerId) {
    throw new Error('Join succeeded but no player_id was returned.');
  }

  _deps.setPlayerId(joinedPlayerId);
  if (joinData.player_token) {
    setStorageItem(
      getPlayerTokenStorageKey(normalizedGameId, joinedPlayerId),
      joinData.player_token
    );
  }
  setStorageItem(STORAGE_KEYS.gameId, normalizedGameId);
  setStorageItem(STORAGE_KEYS.playerId, joinedPlayerId);
  _deps.onJoined();

  return joinedPlayerId;
}

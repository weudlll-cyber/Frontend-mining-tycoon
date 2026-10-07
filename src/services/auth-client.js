/**
File: src/services/auth-client.js
Purpose: Thin API client for account authentication endpoints.
Security notes:
- Uses JSON requests with strict content-type.
- Never logs credentials or tokens.
*/

import { createApiError, readApiError } from '../utils/api-error.js';

function safeTrim(value) {
  return String(value || '').trim();
}

function mapRegisterErrorMessage(message) {
  if (message === 'Registration failed') {
    return 'This email address is already in use, or the username is already taken.';
  }
  return message;
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const fallback = `Request failed (${response.status})`;
    throw createApiError(await readApiError(response, fallback));
  }

  if (response.status === 204) {
    return null;
  }
  return await response.json();
}

export async function login(baseUrl, { username, password }) {
  return await requestJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: {
      username: safeTrim(username),
      password: String(password || ''),
    },
  });
}

export async function register(baseUrl, payload) {
  try {
    return await requestJson(baseUrl, '/auth/register', {
      method: 'POST',
      body: {
        username: safeTrim(payload?.username),
        email: safeTrim(payload?.email),
        password: String(payload?.password || ''),
        display_name: safeTrim(payload?.displayName),
        discord_handle: safeTrim(payload?.discord),
        telegram_handle: safeTrim(payload?.telegram) || null,
      },
    });
  } catch (error) {
    throw new Error(
      mapRegisterErrorMessage(error?.message || 'Registration failed'),
      { cause: error }
    );
  }
}

export async function resetPassword(baseUrl, payload) {
  return await requestJson(baseUrl, '/auth/reset-password', {
    method: 'POST',
    body: {
      username: safeTrim(payload?.username),
      email: safeTrim(payload?.email),
      new_password: String(payload?.newPassword || ''),
    },
  });
}

/**
 * Change the signed-in account's password via POST /auth/change-password.
 * Password strength rules are enforced by the backend (400/422 messages are
 * surfaced as-is). On success the backend revokes every session of the account,
 * so callers must treat the current token as expired.
 */
export async function changePassword(
  baseUrl,
  { authToken, currentPassword, newPassword } = {}
) {
  const headers = {};
  if (safeTrim(authToken)) {
    headers.Authorization = `Bearer ${safeTrim(authToken)}`;
  }
  return await requestJson(baseUrl, '/auth/change-password', {
    method: 'POST',
    headers,
    body: {
      current_password: String(currentPassword || ''),
      new_password: String(newPassword || ''),
    },
  });
}

/**
 * Fetch the account behind a stored auth token.
 * Throws an Error with `status` (e.g. 401 for an expired/revoked session).
 */
export async function fetchCurrentUser(baseUrl, { authToken } = {}) {
  const headers = {};
  if (safeTrim(authToken)) {
    headers.Authorization = `Bearer ${safeTrim(authToken)}`;
  }
  return await requestJson(baseUrl, '/auth/me', { headers });
}

export async function logout(baseUrl, { authToken } = {}) {
  const headers = {};
  if (safeTrim(authToken)) {
    headers.Authorization = `Bearer ${safeTrim(authToken)}`;
  }
  return await requestJson(baseUrl, '/auth/logout', {
    method: 'POST',
    headers,
  });
}

function bearerHeaders(authToken) {
  const headers = {};
  if (safeTrim(authToken)) {
    headers.Authorization = `Bearer ${safeTrim(authToken)}`;
  }
  return headers;
}

/**
 * GET /games/active. When an account token is passed the backend adds
 * `my_player_id` per item (the caller's linked player, or null) and also lists
 * running sync games the caller already plays in, so the lobby can offer
 * "Rejoin". Older backends ignore the header.
 */
export async function fetchOpenGames(baseUrl, { authToken } = {}) {
  const response = await fetch(`${baseUrl}/games/active`, {
    method: 'GET',
    headers: bearerHeaders(authToken),
  });
  if (!response.ok) {
    throw createApiError(
      await readApiError(response, 'Could not load open games.')
    );
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

/**
 * POST /games/{id}/join with the account token (when signed in). The backend
 * links the player to the account; joining again returns the SAME player_id
 * and player_token with `rejoined: true` (the name is ignored then).
 * Account errors carry `code`: 401 ACCOUNT_AUTH_INVALID (stale token) and
 * 401 ACCOUNT_REQUIRED (round requires a signed-in account).
 */
export async function joinGame(baseUrl, { gameId, playerName, authToken }) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (safeTrim(authToken)) {
    headers.Authorization = `Bearer ${safeTrim(authToken)}`;
  }

  const response = await fetch(
    `${baseUrl}/games/${encodeURIComponent(safeTrim(gameId))}/join`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: safeTrim(playerName) || 'Player',
      }),
    }
  );

  if (!response.ok) {
    const apiError = await readApiError(
      response,
      'Could not join selected game.'
    );
    // WHY: the backend validates player names (1-24 chars, letters/digits/space/_-.)
    // and answers 422; surface its message so the player knows what to change.
    if (apiError.status === 422) {
      apiError.message = `Invalid player name: ${apiError.message}`;
    }
    throw createApiError(apiError);
  }
  return await response.json();
}

/**
 * GET /auth/me/history: the signed-in account's finished rounds, newest first.
 * @returns {Promise<{ items: object[], total: number }>} malformed bodies
 *   degrade to an empty page.
 */
export async function fetchMyHistory(
  baseUrl,
  { authToken, limit = 20, offset = 0 } = {}
) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.floor(Number(limit) || 20))),
    offset: String(Math.max(0, Math.floor(Number(offset) || 0))),
  });
  const payload = await requestJson(baseUrl, `/auth/me/history?${query}`, {
    headers: bearerHeaders(authToken),
  });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const total = Number(payload?.total);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
  };
}

/**
 * GET /games/{id}/results (public): the final leaderboard of a finished round.
 * Throws an Error with `status`/`code` (409 GAME_NOT_FINISHED, 404 unknown).
 */
export async function fetchGameResults(baseUrl, gameId) {
  return await requestJson(
    baseUrl,
    `/games/${encodeURIComponent(safeTrim(gameId))}/results`
  );
}

/**
 * GET /auth/me/export: the signed-in account's personal data as JSON (the
 * backend sends it as an attachment). Returns the parsed payload; the caller
 * turns it into a file download. 401 = expired session.
 */
export async function exportMyAccountData(baseUrl, { authToken } = {}) {
  return await requestJson(baseUrl, '/auth/me/export', {
    headers: bearerHeaders(authToken),
  });
}

/**
 * DELETE /auth/me with the account password as confirmation. 204 on success
 * (the account, its sessions and login history are gone). Errors carry
 * `status`/`code`: 403 PASSWORD_INCORRECT, 401 expired session, 429 rate
 * limited. Backends without the endpoint answer 404/405 and their message is
 * surfaced as-is.
 */
export async function deleteMyAccount(baseUrl, { authToken, password } = {}) {
  return await requestJson(baseUrl, '/auth/me', {
    method: 'DELETE',
    headers: bearerHeaders(authToken),
    body: { password: String(password || '') },
  });
}

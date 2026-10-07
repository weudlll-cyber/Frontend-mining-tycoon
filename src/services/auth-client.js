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

async function parseError(response, fallback) {
  const { message } = await readApiError(response, fallback);
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
      mapRegisterErrorMessage(error?.message || 'Registration failed')
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

export async function fetchOpenGames(baseUrl) {
  const response = await fetch(`${baseUrl}/games/active`, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(await parseError(response, 'Could not load open games.'));
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

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

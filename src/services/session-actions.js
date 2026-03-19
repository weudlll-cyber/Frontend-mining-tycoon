/*
File: src/services/session-actions.js
Purpose: Build explicit async-session HTTP flows while keeping frontend display/intent only.
Role in system:
- Encapsulates the frontend half of the backend session contract without making policy decisions locally.
Invariants:
- Never surface player tokens in UI.
- Only include auth headers when backend auth requirement is detected.
- Keep session start and ticket retrieval deterministic and non-authoritative.
Security notes:
- Always encode IDs in URLs.
- Never log tickets or player tokens.
*/

let _deps = null;

export function initSessionActions(deps) {
  _deps = deps;
}

async function parseErrorDetail(response, fallback) {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload.detail === 'string' &&
      payload.detail.trim()
    ) {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parse failures and use fallback text.
  }
  return fallback;
}

async function detectRequirePlayerAuth(baseUrl, gameId, playerId, playerToken) {
  const encodedGameId = encodeURIComponent(gameId);
  const encodedPlayerId = encodeURIComponent(playerId);
  const ticketProbeUrl = `${baseUrl}/games/${encodedGameId}/sse-ticket?player_id=${encodedPlayerId}`;

  // WHY: A 401 probe is a safe signal that X-Player-Token is required.
  const probe = await fetch(ticketProbeUrl, { method: 'GET' });
  if (probe.status === 401) {
    return true;
  }
  if (probe.ok) {
    return false;
  }

  // If the backend rejects unauthenticated probe for another reason, retry once with token.
  if (!playerToken) {
    return false;
  }
  const probeWithToken = await fetch(ticketProbeUrl, {
    method: 'GET',
    headers: { 'X-Player-Token': playerToken },
  });
  if (probeWithToken.status === 401 || probeWithToken.status === 403) {
    return true;
  }
  return false;
}

export async function createAsyncSession({ gameId, playerId }) {
  const baseUrl = _deps.getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    return {
      ok: false,
      kind: 'network',
      message: 'Invalid backend URL.',
    };
  }

  const encodedGameId = encodeURIComponent(gameId);
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(gameId, playerId)
  );

  let requirePlayerAuth = false;
  try {
    requirePlayerAuth = await detectRequirePlayerAuth(
      baseUrl,
      gameId,
      playerId,
      playerToken
    );
  } catch {
    requirePlayerAuth = false;
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (requirePlayerAuth && playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  const body = {
    mode: 'async',
  };
  // WHY: backend policy says player_id can be omitted when player auth is authoritative.
  if (!requirePlayerAuth) {
    body.player_id = playerId;
  }

  try {
    const response = await fetch(`${baseUrl}/games/${encodedGameId}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 403 || response.status === 409) {
      return {
        ok: false,
        kind: 'policy-closed',
        message: 'Session cannot be started now (policy window closed).',
      };
    }

    if (!response.ok) {
      const detail = await parseErrorDetail(
        response,
        `Session start failed: ${response.status} ${response.statusText}`
      );
      return {
        ok: false,
        kind: 'http',
        message: detail,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      sessionId: payload?.session_id ?? null,
      sessionStartUnix: Number(payload?.session_start_unix) || null,
      requiresPlayerAuth: requirePlayerAuth,
      raw: payload,
    };
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Network error while starting async session.',
    };
  }
}

export async function getSessionStreamTicket({
  gameId,
  playerId,
  requirePlayerAuth,
}) {
  if (!requirePlayerAuth) {
    return { ok: true, ticket: null };
  }

  const baseUrl = _deps.getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    return { ok: false, message: 'Invalid backend URL.' };
  }

  const encodedGameId = encodeURIComponent(gameId);
  const encodedPlayerId = encodeURIComponent(playerId);
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(gameId, playerId)
  );

  if (!playerToken) {
    return {
      ok: false,
      message: 'Missing player token for authenticated stream.',
    };
  }

  try {
    // WHY: EventSource cannot send X-Player-Token directly, so the frontend exchanges it for a short-lived ticket first.
    const response = await fetch(
      `${baseUrl}/games/${encodedGameId}/sse-ticket?player_id=${encodedPlayerId}`,
      {
        method: 'GET',
        headers: { 'X-Player-Token': playerToken },
      }
    );
    if (!response.ok) {
      const detail = await parseErrorDetail(
        response,
        `Ticket request failed: ${response.status} ${response.statusText}`
      );
      return { ok: false, message: detail };
    }

    const payload = await response.json();
    if (!payload?.ticket) {
      return { ok: false, message: 'Ticket response missing ticket.' };
    }

    return { ok: true, ticket: payload.ticket };
  } catch {
    return {
      ok: false,
      message: 'Network error while requesting stream ticket.',
    };
  }
}

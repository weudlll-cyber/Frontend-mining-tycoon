/**
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

import { debugLog } from '../utils/debug-log.js';

let _deps = null;

export function initSessionActions(deps) {
  _deps = deps;
}

function parseValidSessionResponse(payload) {
  const sessionIdRaw = payload?.session_id;
  const sessionId =
    typeof sessionIdRaw === 'number'
      ? String(sessionIdRaw)
      : typeof sessionIdRaw === 'string'
        ? sessionIdRaw.trim()
        : '';
  const sessionStartUnix = Number(payload?.session_start_unix);
  const sessionDurationSec = Number(payload?.session_duration_sec);

  const isSessionIdValid = sessionId.length > 0;
  const isStartValid = Number.isFinite(sessionStartUnix);
  const isDurationValid =
    Number.isFinite(sessionDurationSec) && sessionDurationSec > 0;

  if (!isSessionIdValid || !isStartValid || !isDurationValid) {
    return null;
  }

  return {
    sessionId,
    sessionStartUnix,
    sessionDurationSec,
  };
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

export async function probeRequirePlayerAuth({ gameId, playerId }) {
  const baseUrl = _deps?.getNormalizedBaseUrlOrNull?.({ notify: false });
  if (!baseUrl) {
    return { value: 'unknown', reason: 'missing-base-url' };
  }
  if (!gameId || !playerId) {
    return { value: 'unknown', reason: 'missing-identifiers' };
  }

  const encodedGameId = encodeURIComponent(gameId);
  const encodedPlayerId = encodeURIComponent(playerId);
  const ticketProbeUrl = `${baseUrl}/games/${encodedGameId}/sse-ticket?player_id=${encodedPlayerId}`;

  try {
    // WHY: SSE ticket endpoint is the authoritative place to infer whether X-Player-Token is mandatory.
    const response = await fetch(ticketProbeUrl, { method: 'GET' });
    if (response.status === 401 || response.status === 403) {
      debugLog('async-probe', 'require-player-auth inferred true', {
        gameId,
        status: response.status,
      });
      return { value: true, code: response.status };
    }

    if (
      response.status === 404 ||
      response.status === 405 ||
      response.status === 501
    ) {
      return {
        value: 'unknown',
        code: response.status,
        reason: 'ticket-endpoint-unsupported',
      };
    }

    return { value: false, code: response.status };
  } catch {
    return { value: 'unknown', reason: 'network-error' };
  }
}

export async function probeSessionSupport({ gameId, playerId }) {
  const baseUrl = _deps?.getNormalizedBaseUrlOrNull?.({ notify: false });
  if (!baseUrl) {
    return { supported: null, reason: 'missing-base-url' };
  }
  if (!gameId) {
    return { supported: null, reason: 'missing-game-id' };
  }

  const encodedGameId = encodeURIComponent(gameId);
  const url = `${baseUrl}/games/${encodedGameId}/sessions`;

  try {
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      headers: { 'X-Dry-Run': 'true' },
    });

    if (optionsResponse.status === 404) {
      // Could be either "route not found" or "game not found" depending on backend.
      // Defer a hard unsupported decision to the dry-run POST probe.
      return { supported: null, code: optionsResponse.status };
    }

    if (optionsResponse.status === 501) {
      return { supported: false, code: optionsResponse.status };
    }

    if (optionsResponse.ok) {
      return { supported: true, code: optionsResponse.status };
    }
  } catch {
    // Continue to POST inference if OPTIONS is blocked by intermediaries.
  }

  const dryRunBody = {
    mode: 'async',
  };
  if (playerId) {
    dryRunBody.player_id = playerId;
  }

  try {
    const postResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dry-Run': 'true',
      },
      body: JSON.stringify(dryRunBody),
    });

    if (postResponse.status === 405 || postResponse.status === 501) {
      return { supported: false, code: postResponse.status };
    }

    if (postResponse.status === 404) {
      // 404 here is ambiguous across backend variants (missing game vs missing route).
      // Keep diagnostics neutral to avoid false "endpoint unavailable" UI states.
      return { supported: null, code: postResponse.status };
    }

    // WHY: Any non-capability error (400/401/403/409/422/etc.) still proves endpoint support.
    return { supported: true, code: postResponse.status };
  } catch {
    // Network/CORS failures are not authoritative for capability support.
    // Keep diagnostics neutral so users can still attempt real session start.
    return { supported: null, reason: 'network-error' };
  }
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
    const authProbe = await probeRequirePlayerAuth({ gameId, playerId });
    if (authProbe.value === true || authProbe.value === false) {
      requirePlayerAuth = authProbe.value;
    } else {
      requirePlayerAuth = await detectRequirePlayerAuth(
        baseUrl,
        gameId,
        playerId,
        playerToken
      );
    }
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

    if (response.status === 409) {
      const detail = await parseErrorDetail(
        response,
        'Session cannot be started now (policy window closed).'
      );
      return {
        ok: false,
        kind: 'policy-closed',
        message: detail,
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
    const validSession = parseValidSessionResponse(payload);
    if (!validSession) {
      return {
        ok: false,
        kind: 'http',
        code: 'MALFORMED_SESSION_RESPONSE',
        message: 'Session could not be started (malformed response).',
      };
    }

    return {
      ok: true,
      sessionId: validSession.sessionId,
      sessionStartUnix: validSession.sessionStartUnix,
      sessionDurationSec: validSession.sessionDurationSec,
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

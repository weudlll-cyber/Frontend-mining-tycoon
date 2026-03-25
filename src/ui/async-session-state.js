/**
File: src/ui/async-session-state.js
Purpose: Pure helpers for async session start result handling.
*/

export function normalizeAsyncSessionStartFailure(result) {
  if (result?.code === 'MALFORMED_SESSION_RESPONSE') {
    const message = 'Session could not be started (malformed response).';
    return {
      statusType: 'error',
      message,
      nextLatestGameStatus: null,
      response: {
        ok: false,
        code: result.code,
        message,
      },
    };
  }

  if (result?.kind === 'policy-closed') {
    const message = result.message;
    return {
      statusType: 'warning',
      message,
      nextLatestGameStatus: /finished/i.test(String(message || ''))
        ? 'finished'
        : null,
      response: {
        ok: false,
        kind: result.kind,
        message,
      },
    };
  }

  return {
    statusType: 'error',
    message: result?.message,
    nextLatestGameStatus: null,
    response: {
      ok: false,
      kind: result?.kind,
      message: result?.message,
    },
  };
}

export function buildActiveSessionFromResult(result) {
  return {
    sessionId: result.sessionId,
    sessionStartUnix: Number(result.sessionStartUnix) || null,
    sessionDurationSec: Number(result.sessionDurationSec) || null,
    requiresPlayerAuth: Boolean(result.requiresPlayerAuth),
  };
}

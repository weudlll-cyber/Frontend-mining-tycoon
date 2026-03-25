/**
 * File: src\ui\async-session-state.test.js
 * Purpose: Regression tests for async-session-state.test.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeAsyncSessionStartFailure,
  buildActiveSessionFromResult,
} from './async-session-state.js';

describe('async-session-state helpers', () => {
  it('normalizes malformed session responses to a stable error message', () => {
    const normalized = normalizeAsyncSessionStartFailure({
      ok: false,
      kind: 'http',
      code: 'MALFORMED_SESSION_RESPONSE',
      message: 'ignored backend text',
    });

    expect(normalized).toEqual({
      statusType: 'error',
      message: 'Session could not be started (malformed response).',
      nextLatestGameStatus: null,
      response: {
        ok: false,
        code: 'MALFORMED_SESSION_RESPONSE',
        message: 'Session could not be started (malformed response).',
      },
    });
  });

  it('preserves policy-closed warning messages and marks finished status when relevant', () => {
    const normalized = normalizeAsyncSessionStartFailure({
      ok: false,
      kind: 'policy-closed',
      message: 'Game finished; session cannot be started now.',
    });

    expect(normalized.statusType).toBe('warning');
    expect(normalized.message).toBe(
      'Game finished; session cannot be started now.'
    );
    expect(normalized.nextLatestGameStatus).toBe('finished');
    expect(normalized.response).toEqual({
      ok: false,
      kind: 'policy-closed',
      message: 'Game finished; session cannot be started now.',
    });
  });

  it('builds active session state from successful session creation result', () => {
    expect(
      buildActiveSessionFromResult({
        sessionId: 'session-9',
        sessionStartUnix: '1700000000',
        sessionDurationSec: '600',
        requiresPlayerAuth: 1,
      })
    ).toEqual({
      sessionId: 'session-9',
      sessionStartUnix: 1700000000,
      sessionDurationSec: 600,
      requiresPlayerAuth: true,
    });
  });
});

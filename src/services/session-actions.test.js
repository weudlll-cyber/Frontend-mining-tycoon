/*
File: src/services/session-actions.test.js
Purpose: Validate auth-aware async session request construction and policy error mapping.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initSessionActions, createAsyncSession } from './session-actions.js';

describe('session-actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupDeps() {
    initSessionActions({
      getNormalizedBaseUrlOrNull: () => 'http://127.0.0.1:8000',
      getStorageItem: () => 'token-123',
      getPlayerTokenStorageKey: () => 'player-token-key',
    });
  }

  it('maps 403 to policy-closed message', async () => {
    setupDeps();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ticket: 't' }),
      })
      .mockResolvedValueOnce({
        status: 403,
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({}),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '1', playerId: '2' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('policy-closed');
  });

  it('maps 409 to policy-closed message', async () => {
    setupDeps();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ticket: 't' }),
      })
      .mockResolvedValueOnce({
        status: 409,
        ok: false,
        statusText: 'Conflict',
        json: async () => ({}),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '1', playerId: '2' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('policy-closed');
  });

  it('omits player_id and sends X-Player-Token when auth is required', async () => {
    setupDeps();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          session_id: '77',
          session_start_unix: 1700000000,
          session_duration_sec: 600,
        }),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '9', playerId: '8' });

    expect(result.ok).toBe(true);
    expect(result.requiresPlayerAuth).toBe(true);

    const postCall = fetchMock.mock.calls[1];
    const body = JSON.parse(postCall[1].body);
    expect(body.mode).toBe('async');
    expect('player_id' in body).toBe(false);
    expect(postCall[1].headers['X-Player-Token']).toBe('token-123');
  });

  it('treats malformed 200 session response as explicit failure', async () => {
    setupDeps();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ticket: 't' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        // Missing required session fields: session_id as non-empty string and session_duration_sec > 0
        json: async () => ({ session_start_unix: 1700000000 }),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '1', playerId: '2' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MALFORMED_SESSION_RESPONSE');
    expect(result.message).toContain('malformed response');
  });
});

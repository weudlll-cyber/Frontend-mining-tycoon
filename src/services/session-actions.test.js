/**
File: src/services/session-actions.test.js
Purpose: Validate auth-aware async session request construction and policy error mapping.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initSessionActions,
  createAsyncSession,
  probeRequirePlayerAuth,
  getStreamTicket,
} from './session-actions.js';

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

  it('maps 403 to http error and preserves backend detail', async () => {
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
        json: async () => ({ detail: 'Missing or invalid player token.' }),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '1', playerId: '2' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('http');
    expect(result.message).toBe('Missing or invalid player token.');
  });

  it('maps 409 to policy-closed and preserves backend detail', async () => {
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
        json: async () => ({
          detail: 'Finish the current async session before starting another.',
        }),
      });
    globalThis.fetch = fetchMock;

    const result = await createAsyncSession({ gameId: '1', playerId: '2' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('policy-closed');
    expect(result.message).toBe(
      'Finish the current async session before starting another.'
    );
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

  it('probeRequirePlayerAuth returns true on 401 ticket probe', async () => {
    setupDeps();

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      status: 401,
      ok: false,
    });

    const result = await probeRequirePlayerAuth({ gameId: '1', playerId: '2' });
    expect(result.value).toBe(true);
    expect(result.code).toBe(401);
  });

  it('probeRequirePlayerAuth returns unknown on unsupported ticket endpoint', async () => {
    setupDeps();

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    const result = await probeRequirePlayerAuth({ gameId: '1', playerId: '2' });
    expect(result.value).toBe('unknown');
    expect(result.code).toBe(404);
  });

  it('getStreamTicket requests a fresh ticket with the stored player token', async () => {
    setupDeps();

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ticket: 'fresh-ticket', expires_in: 60 }),
    });
    globalThis.fetch = fetchMock;

    const first = await getStreamTicket({
      gameId: 'g 1',
      playerId: '2',
      requirePlayerAuth: true,
    });
    const second = await getStreamTicket({
      gameId: 'g 1',
      playerId: '2',
      requirePlayerAuth: true,
    });

    expect(first).toEqual({ ok: true, ticket: 'fresh-ticket' });
    expect(second).toEqual({ ok: true, ticket: 'fresh-ticket' });
    // One network call per connect attempt — tickets are never cached.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://127.0.0.1:8000/games/g%201/sse-ticket?player_id=2'
    );
    expect(options.headers['X-Player-Token']).toBe('token-123');
  });

  it('getStreamTicket fails when auth is required but no token is stored', async () => {
    initSessionActions({
      getNormalizedBaseUrlOrNull: () => 'http://127.0.0.1:8000',
      getStorageItem: () => null,
      getPlayerTokenStorageKey: () => 'player-token-key',
    });
    globalThis.fetch = vi.fn();

    const result = await getStreamTicket({
      gameId: '1',
      playerId: '2',
      requirePlayerAuth: true,
    });
    expect(result.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('getStreamTicket surfaces backend detail when auth is required', async () => {
    setupDeps();
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Invalid player token' }),
    });

    const result = await getStreamTicket({
      gameId: '1',
      playerId: '2',
      requirePlayerAuth: true,
    });
    expect(result).toEqual({ ok: false, message: 'Invalid player token' });
  });

  it('getStreamTicket is best-effort when auth is not known to be required', async () => {
    initSessionActions({
      getNormalizedBaseUrlOrNull: () => 'http://127.0.0.1:8000',
      getStorageItem: () => null,
      getPlayerTokenStorageKey: () => 'player-token-key',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({}),
    });
    expect(await getStreamTicket({ gameId: '1', playerId: '2' })).toEqual({
      ok: true,
      ticket: null,
    });

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network'));
    expect(await getStreamTicket({ gameId: '1', playerId: '2' })).toEqual({
      ok: true,
      ticket: null,
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ ticket: 'dev-ticket' }),
    });
    const devResult = await getStreamTicket({ gameId: '1', playerId: '2' });
    expect(devResult).toEqual({ ok: true, ticket: 'dev-ticket' });
    expect(globalThis.fetch.mock.calls[0][1].headers).toEqual({});
  });

  it('does not send OPTIONS or X-Dry-Run probes (removed CORS-unsafe capability probe)', async () => {
    const module = await import('./session-actions.js');
    expect(module.probeSessionSupport).toBeUndefined();
  });
});

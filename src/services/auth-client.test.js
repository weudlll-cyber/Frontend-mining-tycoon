import { describe, expect, it, vi } from 'vitest';
import {
  changePassword,
  deleteMyAccount,
  exportMyAccountData,
  fetchCurrentUser,
  fetchGameResults,
  fetchMyHistory,
  fetchOpenGames,
  joinGame,
  login,
  logout,
  register,
  resetPassword,
} from './auth-client.js';

describe('auth-client', () => {
  it('posts login payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 't' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await login('http://127.0.0.1:8000', {
      username: 'alice',
      password: 'secret',
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.body).toContain('alice');
  });

  it('posts rich registration payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await register('http://127.0.0.1:8000', {
      username: 'alice',
      email: 'a@example.com',
      password: 'secret',
      displayName: 'Alice',
      discord: 'alice#1111',
      telegram: '@alice',
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toContain('display_name');
    expect(options.body).toContain('discord_handle');
  });

  it('maps duplicate registration error to friendly guidance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Registration failed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      register('http://127.0.0.1:8000', {
        username: 'alice',
        email: 'a@example.com',
        password: 'secret',
        displayName: 'Alice',
        discord: 'alice#1111',
      })
    ).rejects.toThrow(
      'This email address is already in use, or the username is already taken.'
    );
  });

  it('fetches open games list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ game_id: 'game-1' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const games = await fetchOpenGames('http://127.0.0.1:8000');
    expect(games).toHaveLength(1);
  });

  it('sends authorization header on join when auth token exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ player_id: 'p-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await joinGame('http://127.0.0.1:8000', {
      gameId: 'game-1',
      playerName: 'Alice',
      authToken: 'jwt-1',
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer jwt-1');
  });

  it('posts forgot-password payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await resetPassword('http://127.0.0.1:8000', {
      username: 'alice',
      email: 'a@example.com',
      newPassword: 'new-secret',
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toContain('new_password');
  });

  it('posts logout payload with authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Logged out' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await logout('http://127.0.0.1:8000', {
      authToken: 'jwt-logout',
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jwt-logout');
  });

  it('validates the stored token via GET /auth/me with a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: 'alice', display_name: 'Alice' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = await fetchCurrentUser('http://127.0.0.1:8000', {
      authToken: ' jwt-me ',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/auth/me');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer jwt-me');
    expect(user.display_name).toBe('Alice');
  });

  it('exposes the 401 status when the stored session is no longer valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Authentication required' }),
      })
    );

    await expect(
      fetchCurrentUser('http://127.0.0.1:8000', { authToken: 'old' })
    ).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  it('carries status and code of a disabled password reset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          detail: {
            code: 'PASSWORD_RESET_DISABLED',
            message:
              'Password reset is not available. Please contact an administrator.',
          },
        }),
      })
    );

    await expect(
      resetPassword('http://127.0.0.1:8000', {
        username: 'alice',
        email: 'a@example.com',
        newPassword: 'x',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'PASSWORD_RESET_DISABLED',
      message:
        'Password reset is not available. Please contact an administrator.',
    });
  });

  it('shows the backend name validation message on 422 join', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'name'],
              msg: 'String should have at most 24 characters',
            },
          ],
        }),
      })
    );

    await expect(
      joinGame('http://127.0.0.1:8000', {
        gameId: 'game-1',
        playerName: 'x'.repeat(30),
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'Invalid player name: String should have at most 24 characters',
    });
  });
});

describe('auth-client contract errors', () => {
  it('validates the stored token via GET /auth/me with a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: 'alice', display_name: 'Alice' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = await fetchCurrentUser('http://127.0.0.1:8000', {
      authToken: ' jwt-me ',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/auth/me');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer jwt-me');
    expect(user.display_name).toBe('Alice');
  });

  it('exposes the 401 status when the stored session is no longer valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Authentication required' }),
      })
    );

    await expect(
      fetchCurrentUser('http://127.0.0.1:8000', { authToken: 'old' })
    ).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  it('carries status and code of a disabled password reset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          detail: {
            code: 'PASSWORD_RESET_DISABLED',
            message:
              'Password reset is not available. Please contact an administrator.',
          },
        }),
      })
    );

    await expect(
      resetPassword('http://127.0.0.1:8000', {
        username: 'alice',
        email: 'a@example.com',
        newPassword: 'x',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'PASSWORD_RESET_DISABLED',
      message:
        'Password reset is not available. Please contact an administrator.',
    });
  });

  it('shows the backend name validation message on 422 join', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'name'],
              msg: 'String should have at most 24 characters',
            },
          ],
        }),
      })
    );

    await expect(
      joinGame('http://127.0.0.1:8000', {
        gameId: 'game-1',
        playerName: 'x'.repeat(30),
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'Invalid player name: String should have at most 24 characters',
    });
  });

  it('keeps generic join failures unprefixed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Game already finished' }),
      })
    );

    await expect(
      joinGame('http://127.0.0.1:8000', { gameId: 'g', playerName: 'A' })
    ).rejects.toMatchObject({ status: 409, message: 'Game already finished' });
  });

  it('surfaces backend detail when the open-games list fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'Maintenance' }),
      })
    );

    await expect(fetchOpenGames('http://127.0.0.1:8000')).rejects.toMatchObject(
      { status: 503, message: 'Maintenance' }
    );
  });
});

describe('auth-client changePassword', () => {
  it('posts current/new password with the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Password changed successfully.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await changePassword('http://127.0.0.1:8000', {
      authToken: ' tok ',
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/auth/change-password');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(options.body)).toEqual({
      current_password: 'OldPassword123!',
      new_password: 'NewPassword123!',
    });
    expect(result.message).toContain('Password changed');
  });

  it('omits the Authorization header without a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await changePassword('http://127.0.0.1:8000');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({
      current_password: '',
      new_password: '',
    });
  });

  it('surfaces backend 422 password-strength messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'new_password'],
              msg: 'Value error, Password must be at least 12 characters',
            },
          ],
        }),
      })
    );

    await expect(
      changePassword('http://127.0.0.1:8000', {
        authToken: 'tok',
        currentPassword: 'a',
        newPassword: 'short',
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'Password must be at least 12 characters',
    });
  });
});

describe('auth-client accounts, history and results', () => {
  function stubJson(body, { ok = true, status = 200 } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sends the account token when listing open games', async () => {
    const fetchMock = stubJson([{ game_id: '1', my_player_id: 4 }]);

    const games = await fetchOpenGames('http://h', { authToken: ' jwt ' });

    expect(games[0].my_player_id).toBe(4);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer jwt',
    });
  });

  it('lists open games anonymously without a token', async () => {
    const fetchMock = stubJson({ not: 'a list' });

    expect(await fetchOpenGames('http://h')).toEqual([]);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('fetches a history page with bearer header and paging query', async () => {
    const item = { game_id: 5, rank: 1, participants: 3, score: 10 };
    const fetchMock = stubJson({ items: [item], total: 7 });

    const page = await fetchMyHistory('http://h', {
      authToken: 'jwt',
      limit: 20,
      offset: 40,
    });

    expect(page).toEqual({ items: [item], total: 7 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://h/auth/me/history?limit=20&offset=40');
    expect(options.headers.Authorization).toBe('Bearer jwt');
  });

  it('degrades a malformed history body to an empty page and sane paging', async () => {
    const fetchMock = stubJson({ items: 'nope', total: 'x' });

    expect(
      await fetchMyHistory('http://h', { limit: 'x', offset: -3 })
    ).toEqual({ items: [], total: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://h/auth/me/history?limit=20&offset=0'
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();

    stubJson({ items: [{ game_id: 1 }] });
    expect((await fetchMyHistory('http://h')).total).toBe(1);
  });

  it('fetches public results and surfaces 409 GAME_NOT_FINISHED', async () => {
    const fetchMock = stubJson({ game_id: 9, results: [] });
    expect(await fetchGameResults('http://h', ' 9 ')).toEqual({
      game_id: 9,
      results: [],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://h/games/9/results');

    stubJson(
      { code: 'GAME_NOT_FINISHED', detail: 'Game is not finished' },
      { ok: false, status: 409 }
    );
    await expect(fetchGameResults('http://h', '9')).rejects.toMatchObject({
      status: 409,
      code: 'GAME_NOT_FINISHED',
    });
  });

  it('fetches the account data export with the bearer token', async () => {
    const fetchMock = stubJson({ account: { username: 'weudl' } });

    expect(
      await exportMyAccountData('http://h', { authToken: ' jwt ' })
    ).toEqual({ account: { username: 'weudl' } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://h/auth/me/export');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer jwt');
  });

  it('deletes the account with the password and handles 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await deleteMyAccount('http://h', { authToken: 'jwt', password: 'pw' })
    ).toBeNull();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://h/auth/me');
    expect(options.method).toBe('DELETE');
    expect(options.headers.Authorization).toBe('Bearer jwt');
    expect(JSON.parse(options.body)).toEqual({ password: 'pw' });
  });

  it('surfaces 403 PASSWORD_INCORRECT from the account deletion', async () => {
    stubJson(
      { code: 'PASSWORD_INCORRECT', detail: 'Password is incorrect.' },
      { ok: false, status: 403 }
    );
    await expect(deleteMyAccount('http://h')).rejects.toMatchObject({
      status: 403,
      code: 'PASSWORD_INCORRECT',
      message: 'Password is incorrect.',
    });
  });
});

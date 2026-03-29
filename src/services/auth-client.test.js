import { describe, expect, it, vi } from 'vitest';
import {
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
    ).rejects.toThrow('This email address is already in use, or the username is already taken.');
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
});

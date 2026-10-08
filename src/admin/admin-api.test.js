/**
 * File: src/admin/admin-api.test.js
 * Purpose: Verify the shared admin request helper (connection inputs, admin
 *          token header, backend error normalization).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRequest, readAdminConnection } from './admin-api.js';
import {
  ADMIN_SESSION_EXPIRED_MESSAGE,
  getAdminSession,
  setAdminSession,
} from './admin-session.js';

beforeEach(() => {
  window.sessionStorage.clear();
  document.body.innerHTML = `
    <input id="admin-backend-url" value="http://127.0.0.1:8000/" />
    <input id="admin-token" value=" secret " />
  `;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAdminConnection', () => {
  it('trims the URL (including trailing slashes) and the token', () => {
    expect(readAdminConnection()).toEqual({
      baseUrl: 'http://127.0.0.1:8000',
      adminToken: 'secret',
    });
  });

  it('throws when the backend URL is empty', () => {
    document.getElementById('admin-backend-url').value = '  ';
    expect(() => readAdminConnection()).toThrow('Backend URL is not set');
  });
});

describe('adminRequest', () => {
  it('sends the admin token and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adminRequest('/admin/economy', {
      method: 'PATCH',
      body: { oracle_spread: 0.02 },
    });

    expect(result).toEqual({ ok: 1 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/admin/economy');
    expect(options.method).toBe('PATCH');
    expect(options.headers['X-Admin-Token']).toBe('secret');
    expect(JSON.parse(options.body)).toEqual({ oracle_spread: 0.02 });
  });

  it('omits the token header and body when not provided', async () => {
    document.getElementById('admin-token').value = '';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adminRequest('/admin/metrics');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('GET');
    expect(options.headers['X-Admin-Token']).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it('throws the backend message with status on errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'oracle_spread must be >= 0' }),
      })
    );

    await expect(adminRequest('/admin/economy')).rejects.toMatchObject({
      status: 400,
      message: 'oracle_spread must be >= 0',
    });
  });

  it('sends the administrator session as Bearer when no token is set', async () => {
    document.getElementById('admin-token').value = '';
    setAdminSession({ token: 'sess-1', name: 'Ada' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adminRequest('/admin/metrics');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer sess-1');
    expect(options.headers['X-Admin-Token']).toBeUndefined();
  });

  it('signs out an expired administrator session (401 ACCOUNT_AUTH_INVALID)', async () => {
    document.getElementById('admin-token').value = '';
    setAdminSession({ token: 'sess-1', name: 'Ada' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'ACCOUNT_AUTH_INVALID' }),
      })
    );

    await expect(adminRequest('/admin/metrics')).rejects.toMatchObject({
      status: 401,
      message: ADMIN_SESSION_EXPIRED_MESSAGE,
    });
    expect(getAdminSession()).toBeNull();
  });
});

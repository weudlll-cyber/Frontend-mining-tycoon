/**
 * File: src/admin/admin-account.test.js
 * Purpose: Verify admin console section 1 account sign-in: administrator and
 *          non-administrator logins, sign out, restoring a stored session and
 *          reusing the lobby's session for administrator accounts. Fetch is
 *          mocked against the backend contract (POST /auth/login,
 *          GET /auth/me with `is_admin`, POST /auth/logout).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleAdminLoginSubmit,
  handleAdminLogout,
  initAdminAccount,
  renderAccountState,
  restoreAdminSession,
  setAccountMessage,
} from './admin-account.js';
import {
  ADMIN_SESSION_EXPIRED_MESSAGE,
  NOT_ADMIN_MESSAGE,
  clearAdminSession,
  getAdminSession,
  setAdminSession,
} from './admin-session.js';
import { STORAGE_KEYS } from '../utils/storage-utils.js';

const BASE = 'http://127.0.0.1:8000';

function buildDom() {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="${BASE}" />
    <p id="admin-account-status"></p>
    <form id="admin-login-form">
      <input id="admin-login-username" value="ada" />
      <input id="admin-login-password" value="pw" />
      <button id="admin-login-btn" type="submit">Sign in</button>
    </form>
    <button id="admin-logout-btn" hidden>Sign out</button>
    <div id="admin-account-message" class="result-box"></div>
    <input id="admin-token" value="" />
  `;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function text(id) {
  return document.getElementById(id).textContent;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  buildDom();
});

afterEach(() => {
  clearAdminSession();
  vi.unstubAllGlobals();
});

describe('renderAccountState / setAccountMessage', () => {
  it('shows the signed-out state', () => {
    renderAccountState(null);
    expect(text('admin-account-status')).toBe(
      'Not signed in as an administrator.'
    );
    expect(document.getElementById('admin-login-form').hidden).toBe(false);
    expect(document.getElementById('admin-logout-btn').hidden).toBe(true);
  });

  it('shows the administrator name and the lobby source', () => {
    renderAccountState({ name: 'Ada', source: 'lobby' });
    expect(text('admin-account-status')).toBe(
      'Signed in as Ada (administrator) (using your lobby sign-in).'
    );
    expect(document.getElementById('admin-login-form').hidden).toBe(true);
    expect(document.getElementById('admin-logout-btn').hidden).toBe(false);
  });

  it('does nothing without the section elements', () => {
    document.body.innerHTML = '';
    expect(() => renderAccountState(null)).not.toThrow();
    expect(() => setAccountMessage('x')).not.toThrow();
  });
});

describe('handleAdminLoginSubmit', () => {
  it('stores the administrator session and clears the password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { id: 3, username: 'ada', display_name: 'Ada', is_admin: true },
        session_token: 'sess-1',
        access_token: 'acc-1',
        expires_at: '2999-01-01T00:00:00Z',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const event = { preventDefault: vi.fn() };

    await handleAdminLoginSubmit(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/auth/login`);
    expect(getAdminSession()).toMatchObject({
      token: 'sess-1',
      name: 'Ada',
      userId: '3',
      source: 'admin',
    });
    expect(document.getElementById('admin-login-password').value).toBe('');
    expect(document.getElementById('admin-login-btn').disabled).toBe(false);
  });

  it('falls back to access_token and the username', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          user: { id: 4, username: 'bob', is_admin: true },
          access_token: 'acc-2',
        })
      )
    );
    await handleAdminLoginSubmit();
    expect(getAdminSession()).toMatchObject({ token: 'acc-2', name: 'bob' });
  });

  it('rejects a non-administrator and revokes the fresh session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: { id: 5, username: 'eve', is_admin: false },
          session_token: 'sess-x',
        })
      )
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await handleAdminLoginSubmit();

    expect(getAdminSession()).toBeNull();
    expect(text('admin-account-message')).toBe(NOT_ADMIN_MESSAGE);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${BASE}/auth/logout`);
    expect(options.headers.Authorization).toBe('Bearer sess-x');
  });

  it('reports a login response without a token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { user: {} }))
    );
    await handleAdminLoginSubmit();
    expect(text('admin-account-message')).toBe(
      'Sign-in failed: the server returned no session.'
    );
  });

  it('shows the backend error for wrong credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { detail: 'Invalid username or password' })
        )
    );
    await handleAdminLoginSubmit();
    expect(text('admin-account-message')).toBe('Invalid username or password');
    expect(
      document.getElementById('admin-account-message').className
    ).toContain('error');
  });

  it('uses a generic message for errors without text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('')));
    await handleAdminLoginSubmit();
    expect(text('admin-account-message')).toBe('Sign-in failed.');
  });

  it('requires username and password', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    document.getElementById('admin-login-password').value = '';
    await handleAdminLoginSubmit();
    expect(text('admin-account-message')).toBe('Enter username and password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tolerates a page without the form inputs', async () => {
    document.body.innerHTML = '';
    await expect(handleAdminLoginSubmit()).resolves.toBeUndefined();
  });

  it('keeps going without the submit button', async () => {
    document.getElementById('admin-login-btn').remove();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await handleAdminLoginSubmit();
    expect(text('admin-account-message')).toBe('down');
  });
});

describe('handleAdminLogout', () => {
  it('clears the session and revokes it on the backend', async () => {
    setAdminSession({ token: 'sess-1', name: 'Ada' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);

    await handleAdminLogout();

    expect(getAdminSession()).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/auth/logout`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer sess-1'
    );
  });

  it('stays signed out locally when the revoke fails', async () => {
    setAdminSession({ token: 'sess-1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await handleAdminLogout();
    expect(getAdminSession()).toBeNull();
  });

  it('does nothing when not signed in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await handleAdminLogout();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('restoreAdminSession', () => {
  it('keeps a stored session that is still an administrator', async () => {
    setAdminSession({ token: 'sess-1', name: 'Ada' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { username: 'ada', is_admin: true })
      );
    vi.stubGlobal('fetch', fetchMock);

    await restoreAdminSession();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/auth/me`);
    expect(getAdminSession()?.token).toBe('sess-1');
  });

  it('clears a stored session that lost administrator rights', async () => {
    setAdminSession({ token: 'sess-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { is_admin: false }))
    );
    await restoreAdminSession();
    expect(getAdminSession()).toBeNull();
  });

  it('clears an expired stored session (401) but keeps it on network errors', async () => {
    setAdminSession({ token: 'sess-1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')));
    await restoreAdminSession();
    expect(getAdminSession()?.token).toBe('sess-1');

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { code: 'ACCOUNT_AUTH_INVALID' }))
    );
    await restoreAdminSession();
    expect(getAdminSession()).toBeNull();
  });

  it('ignores a stale /auth/me answer after the session changed', async () => {
    setAdminSession({ token: 'old' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        setAdminSession({ token: 'new' });
        return jsonResponse(200, { is_admin: false });
      })
    );
    await restoreAdminSession();
    expect(getAdminSession()?.token).toBe('new');
  });

  it('reuses the lobby session of an administrator account', async () => {
    window.localStorage.setItem(STORAGE_KEYS.authToken, 'lobby-tok');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 9,
        username: 'ada',
        display_name: 'Ada',
        is_admin: true,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await restoreAdminSession();

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer lobby-tok'
    );
    expect(getAdminSession()).toMatchObject({
      token: 'lobby-tok',
      name: 'Ada',
      userId: '9',
      source: 'lobby',
    });
  });

  it('does not reuse a non-admin or invalid lobby session', async () => {
    window.localStorage.setItem(STORAGE_KEYS.authToken, 'lobby-tok');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { username: 'eve' }))
    );
    await restoreAdminSession();
    expect(getAdminSession()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));
    await restoreAdminSession();
    expect(getAdminSession()).toBeNull();
  });

  it('skips /auth/me when the lobby is signed out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await restoreAdminSession();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('initAdminAccount', () => {
  it('does nothing without the sign-in form', () => {
    document.body.innerHTML = '';
    expect(() => initAdminAccount()).not.toThrow();
  });

  it('wires sign-in, sign-out and session messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { id: 1, username: 'ada', is_admin: true },
        session_token: 'sess-1',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    initAdminAccount();
    expect(text('admin-account-status')).toBe(
      'Not signed in as an administrator.'
    );

    document
      .getElementById('admin-login-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(getAdminSession()?.token).toBe('sess-1'));
    expect(text('admin-account-status')).toBe(
      'Signed in as ada (administrator).'
    );

    document.getElementById('admin-logout-btn').click();
    await vi.waitFor(() => expect(getAdminSession()).toBeNull());
    expect(text('admin-account-message')).toBe('Signed out.');

    clearAdminSession('expired');
    expect(text('admin-account-message')).toBe(ADMIN_SESSION_EXPIRED_MESSAGE);
    clearAdminSession('not-admin');
    expect(text('admin-account-message')).toBe(NOT_ADMIN_MESSAGE);
    clearAdminSession('unknown-reason');
    expect(text('admin-account-message')).toBe('');
  });
});

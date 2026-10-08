/**
 * File: src/admin/admin-users.test.js
 * Purpose: Verify admin console section 12 "Administrators": credential gate,
 *          search + paging (GET /admin/users), grant/remove administrator
 *          rights with confirm (PATCH /admin/users/{id}) and the LAST_ADMIN
 *          error. Fetch is mocked against the backend contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_USERS_PAGE_SIZE,
  LAST_ADMIN_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  initAdminUsers,
  loadAdminUsers,
  resetAdminUsersState,
  toggleAdmin,
  updateAdminUsersGate,
} from './admin-users.js';
import {
  clearAdminSession,
  getAdminSession,
  setAdminSession,
} from './admin-session.js';

const BASE = 'http://127.0.0.1:8000';

function buildDom({ token = 'tok' } = {}) {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="${BASE}" />
    <input id="admin-token" value="${token}" />
    <p id="admin-users-gate"></p>
    <form id="admin-users-search-form">
      <input id="admin-users-query" value="" />
      <button id="admin-users-search-btn" type="submit">Search</button>
    </form>
    <table id="admin-users-table" hidden><tbody id="admin-users-tbody"></tbody></table>
    <button id="admin-users-prev" disabled></button>
    <span id="admin-users-page"></span>
    <button id="admin-users-next" disabled></button>
    <div id="admin-users-result" class="result-box"></div>
  `;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function user(overrides = {}) {
  return {
    id: 1,
    username: 'ada',
    display_name: 'Ada',
    email: 'ada@example.org',
    is_admin: false,
    is_active: true,
    created_at: '2026-01-02T03:04:05Z',
    ...overrides,
  };
}

function q(id) {
  return document.getElementById(id);
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetAdminUsersState();
  buildDom();
});

afterEach(() => {
  clearAdminSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('updateAdminUsersGate', () => {
  it('disables the section without credentials', () => {
    buildDom({ token: '' });
    q('admin-users-tbody').append(document.createElement('tr'));
    updateAdminUsersGate();
    expect(q('admin-users-gate').hidden).toBe(false);
    expect(q('admin-users-query').disabled).toBe(true);
    expect(q('admin-users-search-btn').disabled).toBe(true);
    expect(q('admin-users-tbody').children).toHaveLength(0);
    expect(q('admin-users-table').hidden).toBe(true);
    expect(q('admin-users-next').disabled).toBe(true);
  });

  it('enables the section with a signed-in administrator', () => {
    buildDom({ token: '' });
    setAdminSession({ token: 'sess' });
    updateAdminUsersGate();
    expect(q('admin-users-gate').hidden).toBe(true);
    expect(q('admin-users-query').disabled).toBe(false);
  });

  it('tolerates a page without the section', () => {
    document.body.innerHTML = '';
    expect(() => updateAdminUsersGate()).not.toThrow();
  });
});

describe('loadAdminUsers', () => {
  it('renders a page of accounts with safe text and paging', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          user({ display_name: '<img src=x onerror=alert(1)>' }),
          user({
            id: 2,
            username: 'bob',
            is_admin: true,
            is_active: false,
            email: undefined,
            created_at: 'bad',
          }),
        ],
        total: 45,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await loadAdminUsers();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${BASE}/admin/users?query=&limit=${ADMIN_USERS_PAGE_SIZE}&offset=0`
    );
    expect(options.headers['X-Admin-Token']).toBe('tok');
    const rows = q('admin-users-tbody').querySelectorAll('tr');
    expect(rows).toHaveLength(2);
    expect(q('admin-users-tbody').querySelector('img')).toBeNull();
    expect(rows[0].children[1].textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(rows[0].children[3].textContent).toBe('No');
    expect(rows[0].querySelector('button').textContent).toBe('Make admin');
    expect(rows[1].children[2].textContent).toBe('—');
    expect(rows[1].children[3].textContent).toBe('Yes');
    expect(rows[1].children[4].textContent).toBe('No');
    expect(rows[1].children[5].textContent).toBe('—');
    expect(rows[1].querySelector('button').textContent).toBe('Remove admin');
    expect(q('admin-users-table').hidden).toBe(false);
    expect(q('admin-users-page').textContent).toBe('1–20 of 45');
    expect(q('admin-users-prev').disabled).toBe(true);
    expect(q('admin-users-next').disabled).toBe(false);
    expect(q('admin-users-result').textContent).toBe('');
  });

  it('shows an empty result and tolerates malformed pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));
    await loadAdminUsers();
    expect(q('admin-users-result').textContent).toBe('No accounts found.');
    expect(q('admin-users-table').hidden).toBe(true);
    expect(q('admin-users-page').textContent).toBe('');
  });

  it('shows backend errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { detail: 'Administrator account required.' })
        )
    );
    await loadAdminUsers();
    expect(q('admin-users-result').textContent).toBe(
      'Could not load accounts: Administrator account required.'
    );
  });

  it('does not call the backend without credentials', async () => {
    buildDom({ token: '' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await loadAdminUsers();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q('admin-users-gate').hidden).toBe(false);
  });
});

describe('toggleAdmin', () => {
  it('asks first and does nothing when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await toggleAdmin(user(), null);
    expect(window.confirm).toHaveBeenCalledWith('Make ada an administrator?');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grants admin rights and reloads the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, user({ is_admin: true })))
      .mockResolvedValueOnce(
        jsonResponse(200, { items: [user({ is_admin: true })], total: 1 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const button = document.createElement('button');

    await toggleAdmin(user({ id: 'a/1' }), button);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/admin/users/a%2F1`);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ is_admin: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(q('admin-users-result').textContent).toBe(
      'ada is now an administrator.'
    );
    expect(button.disabled).toBe(false);
  });

  it('shows the LAST_ADMIN conflict', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(409, { code: 'LAST_ADMIN', detail: 'last admin' })
        )
    );
    await toggleAdmin(user({ is_admin: true }), null);
    expect(window.confirm).toHaveBeenCalledWith(
      'Remove administrator rights from ada?'
    );
    expect(q('admin-users-result').textContent).toBe(
      `Could not change ada: ${LAST_ADMIN_MESSAGE}`
    );
  });

  it('shows USER_NOT_FOUND as a refresh hint', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(404, { code: 'USER_NOT_FOUND', detail: 'not found' })
        )
    );
    await toggleAdmin(user({ is_admin: true }), null);
    expect(q('admin-users-result').textContent).toBe(
      `Could not change ada: ${USER_NOT_FOUND_MESSAGE}`
    );
  });

  it('renders the backend page shape {users, total, limit, offset}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          users: [user(), user({ id: 8, username: 'bob' })],
          total: 2,
          limit: 20,
          offset: 0,
        })
      )
    );
    await loadAdminUsers();
    expect(q('admin-users-tbody').querySelectorAll('tr')).toHaveLength(2);
  });

  it('shows other errors as-is', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'User not found' }))
    );
    await toggleAdmin({ id: 8, is_admin: true }, null);
    expect(q('admin-users-result').textContent).toBe(
      'Could not change 8: User not found'
    );
  });

  it('ends the own session after removing your own rights', async () => {
    buildDom({ token: '' });
    setAdminSession({ token: 'sess', userId: 1 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, user({ is_admin: false })));
    vi.stubGlobal('fetch', fetchMock);

    await toggleAdmin(user({ is_admin: true }), null);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer sess'
    );
    expect(getAdminSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(q('admin-users-result').textContent).toBe(
      'ada is no longer an administrator.'
    );
  });
});

describe('initAdminUsers', () => {
  it('does nothing without the section', () => {
    document.body.innerHTML = '';
    expect(() => initAdminUsers()).not.toThrow();
  });

  it('wires search, paging, the token field and session changes', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(200, { items: [user()], total: 45 })
      );
    vi.stubGlobal('fetch', fetchMock);
    initAdminUsers();
    expect(q('admin-users-gate').hidden).toBe(true);

    q('admin-users-query').value = ' ad ';
    q('admin-users-search-form').dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('query=ad&');
    await vi.waitFor(() => expect(q('admin-users-next').disabled).toBe(false));

    q('admin-users-next').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toContain('offset=20');
    await vi.waitFor(() => expect(q('admin-users-prev').disabled).toBe(false));

    q('admin-users-prev').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toContain('offset=0');

    q('admin-token').value = '';
    q('admin-token').dispatchEvent(new Event('input'));
    expect(q('admin-users-gate').hidden).toBe(false);

    setAdminSession({ token: 'sess' });
    expect(q('admin-users-gate').hidden).toBe(true);
  });

  it('runs a row button toggle', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { items: [user()], total: 1 }))
    );
    await loadAdminUsers();
    q('admin-users-tbody').querySelector('button').click();
    expect(window.confirm).toHaveBeenCalled();
  });
});

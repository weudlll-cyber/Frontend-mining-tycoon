/**
 * File: src/admin/admin-session.test.js
 * Purpose: Verify the admin account session store (sessionStorage, expiry,
 *          malformed values), the admin auth header choice (token field wins
 *          over the account session) and the 401/403 session handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_SESSION_EXPIRED_MESSAGE,
  ADMIN_SESSION_STORAGE_KEY,
  NOT_ADMIN_MESSAGE,
  buildAdminAuthHeaders,
  clearAdminSession,
  getAdminSession,
  handleAdminAuthError,
  hasAdminCredentials,
  onAdminSessionChange,
  setAdminSession,
} from './admin-session.js';
import { createApiError } from '../utils/api-error.js';

beforeEach(() => {
  window.sessionStorage.clear();
  document.body.innerHTML = '<input id="admin-token" value="" />';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin session store', () => {
  it('stores, reads and clears the session with listener notifications', () => {
    const listener = vi.fn();
    const unsubscribe = onAdminSessionChange(listener);

    setAdminSession({ token: ' abc ', name: 'Ada', userId: 7 });
    expect(getAdminSession()).toEqual({
      token: 'abc',
      name: 'Ada',
      userId: '7',
      source: 'admin',
      expiresAt: '',
    });
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'abc' }),
      'signed-in'
    );

    clearAdminSession('expired');
    expect(getAdminSession()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null, 'expired');

    unsubscribe();
    clearAdminSession();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the lobby source and defaults missing fields', () => {
    setAdminSession({ token: 't', source: 'lobby' });
    expect(getAdminSession()).toMatchObject({
      source: 'lobby',
      name: '',
      userId: '',
    });
    window.sessionStorage.setItem(
      ADMIN_SESSION_STORAGE_KEY,
      JSON.stringify({ token: 't' })
    );
    expect(getAdminSession()).toMatchObject({ userId: '', source: 'admin' });
  });

  it('drops malformed, empty and expired sessions', () => {
    window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, '{nope');
    expect(getAdminSession()).toBeNull();
    expect(window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(
      ADMIN_SESSION_STORAGE_KEY,
      JSON.stringify({ token: '  ' })
    );
    expect(getAdminSession()).toBeNull();

    setAdminSession({ token: 't', expiresAt: '2000-01-01T00:00:00Z' });
    expect(getAdminSession()).toBeNull();

    setAdminSession({ token: 't', expiresAt: '2999-01-01T00:00:00Z' });
    expect(getAdminSession()?.token).toBe('t');

    setAdminSession({ token: 't', expiresAt: 'not a date' });
    expect(getAdminSession()?.token).toBe('t');
  });

  it('survives blocked sessionStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setAdminSession({ token: 't' })).not.toThrow();
    expect(getAdminSession()).toBeNull();
  });
});

describe('buildAdminAuthHeaders', () => {
  it('prefers the admin token field over the account session', () => {
    setAdminSession({ token: 'sess' });
    document.getElementById('admin-token').value = ' tok ';
    expect(buildAdminAuthHeaders()).toEqual({ 'X-Admin-Token': 'tok' });
    expect(hasAdminCredentials()).toBe(true);
  });

  it('uses the account session as Bearer when the field is empty', () => {
    setAdminSession({ token: 'sess' });
    expect(buildAdminAuthHeaders()).toEqual({ Authorization: 'Bearer sess' });
    expect(hasAdminCredentials()).toBe(true);
  });

  it('sends nothing without credentials (also without the field)', () => {
    document.body.innerHTML = '';
    expect(buildAdminAuthHeaders()).toEqual({});
    expect(hasAdminCredentials()).toBe(false);
  });
});

describe('handleAdminAuthError', () => {
  it('signs out locally on 401 and explains the expiry', () => {
    setAdminSession({ token: 'sess' });
    const error = handleAdminAuthError(
      createApiError({ message: 'x', status: 401 })
    );
    expect(error.message).toBe(ADMIN_SESSION_EXPIRED_MESSAGE);
    expect(error.adminSessionEnded).toBe(true);
    expect(getAdminSession()).toBeNull();
  });

  it('treats ACCOUNT_AUTH_INVALID as expiry regardless of status', () => {
    setAdminSession({ token: 'sess' });
    const error = handleAdminAuthError(
      createApiError({ message: 'x', code: 'ACCOUNT_AUTH_INVALID' })
    );
    expect(error.message).toBe(ADMIN_SESSION_EXPIRED_MESSAGE);
  });

  it('signs out on ADMIN_REQUIRED with the not-admin message', () => {
    setAdminSession({ token: 'sess' });
    const listener = vi.fn();
    const unsubscribe = onAdminSessionChange(listener);
    const error = handleAdminAuthError(
      createApiError({ message: 'x', code: 'ADMIN_REQUIRED', status: 403 })
    );
    unsubscribe();
    expect(error.message).toBe(NOT_ADMIN_MESSAGE);
    expect(listener).toHaveBeenCalledWith(null, 'not-admin');
  });

  it('leaves other errors, token-field requests and no-session errors alone', () => {
    setAdminSession({ token: 'sess' });
    const other = handleAdminAuthError(
      createApiError({ message: 'bad', status: 403 })
    );
    expect(other.message).toBe('bad');
    expect(getAdminSession()).not.toBeNull();

    document.getElementById('admin-token').value = 'tok';
    const withToken = handleAdminAuthError(
      createApiError({ message: 'denied', status: 401 })
    );
    expect(withToken.message).toBe('denied');
    expect(getAdminSession()).not.toBeNull();

    document.getElementById('admin-token').value = '';
    clearAdminSession();
    const noSession = handleAdminAuthError(
      createApiError({ message: 'denied', status: 401 })
    );
    expect(noSession.adminSessionEnded).toBeUndefined();
  });
});

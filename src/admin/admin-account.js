/**
 * File: src/admin/admin-account.js
 * Purpose: Admin console section 1 "Sign in as administrator": username +
 *          password sign-in (POST /auth/login), sign out (POST /auth/logout)
 *          and the signed-in status line. On page load it re-validates a
 *          stored admin session (GET /auth/me) or reuses the lobby's session
 *          when that account is an administrator.
 * Role in system: Initialised from admin-setup.js. Writes the session through
 *          admin-session.js, which every admin request reads. The Admin Token
 *          field stays the alternative and wins when filled.
 * Constraints: frontend gating is convenience only; the backend checks
 *          `is_admin` on every admin request.
 * Security notes:
 *  - The password is read once per submit, sent only to /auth/login and the
 *    field is cleared afterwards; tokens are never logged or rendered.
 *  - Names and messages are rendered with textContent only.
 *  - A non-admin sign-in is revoked right away (best-effort /auth/logout) so
 *    no unused session is left behind.
 */

import { fetchCurrentUser, login, logout } from '../services/auth-client.js';
import { STORAGE_KEYS, getStorageItem } from '../utils/storage-utils.js';
import { readAdminConnection } from './admin-api.js';
import {
  ADMIN_SESSION_EXPIRED_MESSAGE,
  NOT_ADMIN_MESSAGE,
  clearAdminSession,
  getAdminSession,
  onAdminSessionChange,
  setAdminSession,
} from './admin-session.js';

function el(id) {
  return document.getElementById(id);
}

function displayNameOf(user) {
  return String(user?.display_name || user?.username || 'administrator');
}

export function setAccountMessage(message, kind = 'info') {
  const box = el('admin-account-message');
  if (!box) return;
  box.textContent = message;
  box.className = message ? `result-box ${kind}` : 'result-box';
}

/** Show the status line and toggle the sign-in form / sign-out button. */
export function renderAccountState(session = getAdminSession()) {
  const status = el('admin-account-status');
  if (status) {
    if (session) {
      const via =
        session.source === 'lobby' ? ' (using your lobby sign-in)' : '';
      status.textContent = `Signed in as ${session.name} (administrator)${via}.`;
    } else {
      status.textContent = 'Not signed in as an administrator.';
    }
  }
  const form = el('admin-login-form');
  if (form) form.hidden = Boolean(session);
  const logoutBtn = el('admin-logout-btn');
  if (logoutBtn) logoutBtn.hidden = !session;
}

const REASON_MESSAGES = {
  expired: [ADMIN_SESSION_EXPIRED_MESSAGE, 'error'],
  'not-admin': [NOT_ADMIN_MESSAGE, 'error'],
  'signed-out': ['Signed out.', 'info'],
  'signed-in': ['', 'info'],
};

function handleSessionChange(session, reason) {
  renderAccountState(session);
  const [message, kind] = REASON_MESSAGES[reason] || ['', 'info'];
  setAccountMessage(message, kind);
}

/** POST /auth/login and keep the session only for administrator accounts. */
export async function handleAdminLoginSubmit(event) {
  event?.preventDefault?.();
  const usernameInput = el('admin-login-username');
  const passwordInput = el('admin-login-password');
  const submitBtn = el('admin-login-btn');
  const username = String(usernameInput?.value || '').trim();
  const password = String(passwordInput?.value || '');
  if (!username || !password) {
    setAccountMessage('Enter username and password.', 'error');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  setAccountMessage('Signing in…', 'info');
  try {
    const { baseUrl } = readAdminConnection();
    const payload = await login(baseUrl, { username, password });
    // The contract names the Bearer credential `session_token`; older
    // payloads only carry `access_token` (the value the lobby uses).
    const token = String(
      payload?.session_token || payload?.access_token || ''
    ).trim();
    if (!token) {
      throw new Error('Sign-in failed: the server returned no session.');
    }
    if (payload?.user?.is_admin !== true) {
      // Revoke the fresh non-admin session; failures are irrelevant here.
      await logout(baseUrl, { authToken: token }).catch(() => {});
      setAccountMessage(NOT_ADMIN_MESSAGE, 'error');
      return;
    }
    setAdminSession({
      token,
      name: displayNameOf(payload.user),
      userId: payload.user.id ?? payload.user.user_id,
      source: 'admin',
      expiresAt: payload.expires_at,
    });
  } catch (error) {
    setAccountMessage(error?.message || 'Sign-in failed.', 'error');
  } finally {
    if (passwordInput) passwordInput.value = '';
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Sign out: forget the session locally first (so the console is signed out
 * even when the backend is unreachable), then revoke it server-side. A reused
 * lobby session is revoked too, which also signs the lobby out.
 */
export async function handleAdminLogout() {
  const session = getAdminSession();
  if (!session) return;
  clearAdminSession('signed-out');
  try {
    const { baseUrl } = readAdminConnection();
    await logout(baseUrl, { authToken: session.token });
  } catch {
    // Already signed out locally; an expired session needs no revoke.
  }
}

async function loadAdminUser(token) {
  const { baseUrl } = readAdminConnection();
  return await fetchCurrentUser(baseUrl, { authToken: token });
}

/**
 * Page load: re-validate the stored admin session, or reuse the lobby's
 * session (localStorage) when GET /auth/me says that account is an
 * administrator. Network errors keep a stored session (the backend may be
 * restarting); 401 and non-admin answers clear it. Backends that do not send
 * `is_admin` are treated as "not an administrator" (token-only admin).
 */
export async function restoreAdminSession() {
  const session = getAdminSession();
  if (session) {
    try {
      const user = await loadAdminUser(session.token);
      if (getAdminSession()?.token !== session.token) return;
      if (user?.is_admin !== true) clearAdminSession('not-admin');
    } catch (error) {
      if (error?.status === 401 && getAdminSession()?.token === session.token) {
        clearAdminSession('expired');
      }
    }
    return;
  }

  const lobbyToken = String(
    getStorageItem(STORAGE_KEYS.authToken) || ''
  ).trim();
  if (!lobbyToken) return;
  try {
    const user = await loadAdminUser(lobbyToken);
    // Do not override a sign-in that happened while /auth/me was running.
    if (user?.is_admin === true && !getAdminSession()) {
      setAdminSession({
        token: lobbyToken,
        name: displayNameOf(user),
        userId: user.id ?? user.user_id,
        source: 'lobby',
      });
    }
  } catch {
    // Lobby session invalid or backend unreachable: just stay signed out.
  }
}

export function initAdminAccount() {
  const form = el('admin-login-form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    void handleAdminLoginSubmit(event);
  });
  el('admin-logout-btn')?.addEventListener('click', () => {
    void handleAdminLogout();
  });
  onAdminSessionChange(handleSessionChange);
  renderAccountState();
  void restoreAdminSession();
}

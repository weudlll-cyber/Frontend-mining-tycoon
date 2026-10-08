/**
 * File: src/admin/admin-session.js
 * Purpose: Holds the admin console's account session (an administrator signed
 *          in with username + password, or the lobby's session reused when
 *          that account is an administrator) and builds the admin auth
 *          headers for every admin request.
 * Role in system: Shared by admin-api.js (adminRequest), admin-setup.js
 *          (POST /games), game-management.js, admin-account.js (section 1 UI)
 *          and admin-users.js (section 12). The backend stays authoritative:
 *          it accepts either `X-Admin-Token` or `Authorization: Bearer
 *          <session token>` of an administrator account and rejects the rest.
 * Constraints:
 *  - The admin token field wins: when it is filled, only `X-Admin-Token` is
 *    sent (exactly the pre-account behavior); the account session is used only
 *    when the field is empty.
 *  - The session lives in sessionStorage (this tab only, gone when the tab
 *    closes) and is cleared on sign out, on 401 ACCOUNT_AUTH_INVALID, on 403
 *    ADMIN_REQUIRED and once `expires_at` has passed.
 * Security notes: the session token is never logged or rendered; the stored
 *          JSON is parsed inside try/catch and malformed values are dropped.
 */

export const ADMIN_SESSION_STORAGE_KEY = 'mining-tycoon:adminSession';

export const ADMIN_SESSION_EXPIRED_MESSAGE =
  'Your administrator session has expired. Please sign in again.';
export const NOT_ADMIN_MESSAGE = 'This account is not an administrator.';

const listeners = new Set();

function readStorage() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    if (value === null) {
      sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, value);
    }
  } catch {
    // Storage blocked (private mode/policy): the session simply ends with
    // the page; admin requests keep working while the page stays open.
  }
}

function notify(reason) {
  const session = getAdminSession();
  listeners.forEach((listener) => listener(session, reason));
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= Date.now();
}

/**
 * Current admin account session or null.
 * @returns {{ token: string, name: string, userId: string,
 *   source: 'admin'|'lobby', expiresAt: string } | null}
 */
export function getAdminSession() {
  const raw = readStorage();
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    writeStorage(null);
    return null;
  }
  const token = String(parsed?.token || '').trim();
  if (!token) {
    writeStorage(null);
    return null;
  }
  // WHY: the backend would answer 401 anyway; dropping the stale session here
  // avoids one failing request and shows the sign-in form right away.
  if (isExpired(parsed.expiresAt)) {
    writeStorage(null);
    return null;
  }
  return {
    token,
    name: String(parsed.name || ''),
    userId: String(parsed.userId ?? ''),
    source: parsed.source === 'lobby' ? 'lobby' : 'admin',
    expiresAt: String(parsed.expiresAt || ''),
  };
}

/**
 * Store a new admin session and notify listeners.
 * @param {{ token: string, name?: string, userId?: string|number,
 *   source?: 'admin'|'lobby', expiresAt?: string }} session
 */
export function setAdminSession(session) {
  writeStorage(
    JSON.stringify({
      token: String(session.token || '').trim(),
      name: String(session.name || ''),
      userId: String(session.userId ?? ''),
      source: session.source === 'lobby' ? 'lobby' : 'admin',
      expiresAt: String(session.expiresAt || ''),
    })
  );
  notify('signed-in');
}

/**
 * Forget the admin session locally.
 * @param {'signed-out'|'expired'|'not-admin'} [reason]
 */
export function clearAdminSession(reason = 'signed-out') {
  writeStorage(null);
  notify(reason);
}

/** Subscribe to session changes; returns an unsubscribe function. */
export function onAdminSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function adminTokenFieldValue() {
  return String(document.getElementById('admin-token')?.value || '').trim();
}

/**
 * Auth headers for an admin request: `X-Admin-Token` when the token field is
 * filled, else `Authorization: Bearer` for a signed-in administrator, else none
 * (the backend then decides, e.g. open game creation).
 */
export function buildAdminAuthHeaders() {
  const adminToken = adminTokenFieldValue();
  if (adminToken) {
    return { 'X-Admin-Token': adminToken };
  }
  const session = getAdminSession();
  if (session) {
    return { Authorization: `Bearer ${session.token}` };
  }
  return {};
}

/** True when admin requests carry credentials (token field or session). */
export function hasAdminCredentials() {
  return Boolean(adminTokenFieldValue() || getAdminSession());
}

/**
 * React to an admin request failure. When the account session was the
 * credential (token field empty), 401 means it expired and 403 ADMIN_REQUIRED
 * means the account is no longer an administrator: the session is cleared and
 * the error message is replaced by a clear explanation and
 * `adminSessionEnded` is set. Other errors are returned unchanged.
 * @param {Error & { status?: number, code?: string|null,
 *   adminSessionEnded?: boolean }} error
 * @returns {Error} the same error object
 */
export function handleAdminAuthError(error) {
  if (adminTokenFieldValue() || !getAdminSession()) return error;
  if (error?.status === 401 || error?.code === 'ACCOUNT_AUTH_INVALID') {
    clearAdminSession('expired');
    error.message = ADMIN_SESSION_EXPIRED_MESSAGE;
    error.adminSessionEnded = true;
  } else if (error?.code === 'ADMIN_REQUIRED') {
    clearAdminSession('not-admin');
    error.message = NOT_ADMIN_MESSAGE;
    error.adminSessionEnded = true;
  }
  return error;
}

/**
 * File: src/admin/admin-users.js
 * Purpose: Admin console section 12 "Administrators": searches accounts
 *          (GET /admin/users?query=&limit=&offset=), pages through them and
 *          grants or removes administrator rights (PATCH /admin/users/{id}
 *          {"is_admin": bool}) after a confirm step.
 * Role in system: Initialised from admin-setup.js; all requests go through
 *          adminRequest (admin token or administrator account session). The
 *          backend is authoritative and refuses to demote the last
 *          administrator (409 LAST_ADMIN).
 * Constraints: usable only while admin credentials are present (token field
 *          filled or an administrator signed in); otherwise the controls are
 *          disabled with a hint.
 * Security notes: usernames, names and emails come from the backend and are
 *          rendered with textContent only; user IDs are URL-encoded.
 */

import { adminRequest } from './admin-api.js';
import {
  clearAdminSession,
  getAdminSession,
  hasAdminCredentials,
  onAdminSessionChange,
} from './admin-session.js';

export const ADMIN_USERS_PAGE_SIZE = 20;

export const LAST_ADMIN_MESSAGE =
  'This is the last administrator. Make another account an administrator first.';

const state = { query: '', offset: 0, total: 0 };

function el(id) {
  return document.getElementById(id);
}

function setResult(message, kind = 'info') {
  const box = el('admin-users-result');
  if (!box) return;
  box.textContent = message;
  box.className = message ? `result-box ${kind}` : 'result-box';
}

function formatDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '—';
}

/** Enable the section only when admin credentials are present. */
export function updateAdminUsersGate() {
  const usable = hasAdminCredentials();
  const gate = el('admin-users-gate');
  if (gate) gate.hidden = usable;
  ['admin-users-query', 'admin-users-search-btn'].forEach((id) => {
    const node = el(id);
    if (node) node.disabled = !usable;
  });
  if (!usable) {
    el('admin-users-tbody')?.replaceChildren();
    const table = el('admin-users-table');
    if (table) table.hidden = true;
    renderPager();
  }
}

function renderPager() {
  const label = el('admin-users-page');
  const prev = el('admin-users-prev');
  const next = el('admin-users-next');
  const hasRows = state.total > 0 && hasAdminCredentials();
  if (label) {
    const last = Math.min(state.offset + ADMIN_USERS_PAGE_SIZE, state.total);
    label.textContent = hasRows
      ? `${state.offset + 1}–${last} of ${state.total}`
      : '';
  }
  if (prev) prev.disabled = !hasRows || state.offset <= 0;
  if (next) {
    next.disabled =
      !hasRows || state.offset + ADMIN_USERS_PAGE_SIZE >= state.total;
  }
}

function textCell(value) {
  const td = document.createElement('td');
  td.textContent = value;
  return td;
}

function buildUserRow(user) {
  const row = document.createElement('tr');
  const isAdmin = user.is_admin === true;
  row.append(
    textCell(String(user.username ?? '')),
    textCell(String(user.display_name ?? '')),
    textCell(String(user.email ?? '—')),
    textCell(isAdmin ? 'Yes' : 'No'),
    textCell(user.is_active === false ? 'No' : 'Yes'),
    textCell(formatDate(user.created_at))
  );
  const actionCell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-row-btn';
  button.style.background = isAdmin ? 'var(--danger)' : 'var(--primary)';
  button.textContent = isAdmin ? 'Remove admin' : 'Make admin';
  button.addEventListener('click', () => {
    void toggleAdmin(user, button);
  });
  actionCell.append(button);
  row.append(actionCell);
  return row;
}

/** GET /admin/users for the current query/offset and render the table. */
export async function loadAdminUsers() {
  if (!hasAdminCredentials()) {
    updateAdminUsersGate();
    return;
  }
  setResult('Loading accounts…', 'info');
  try {
    const query = new URLSearchParams({
      query: state.query,
      limit: String(ADMIN_USERS_PAGE_SIZE),
      offset: String(state.offset),
    });
    const page = await adminRequest(`/admin/users?${query}`);
    const items = Array.isArray(page?.items) ? page.items : [];
    const total = Number(page?.total);
    state.total = Number.isFinite(total) ? total : items.length;
    el('admin-users-tbody')?.replaceChildren(...items.map(buildUserRow));
    const table = el('admin-users-table');
    if (table) table.hidden = items.length === 0;
    setResult(items.length ? '' : 'No accounts found.', 'info');
  } catch (error) {
    state.total = 0;
    setResult(`Could not load accounts: ${error.message}`, 'error');
  }
  renderPager();
}

/**
 * PATCH /admin/users/{id} after a confirm step. Removing your own rights ends
 * the local administrator session (the backend would answer ADMIN_REQUIRED
 * from now on anyway).
 */
export async function toggleAdmin(user, button) {
  const makeAdmin = user.is_admin !== true;
  const name = String(user.username ?? user.id);
  const question = makeAdmin
    ? `Make ${name} an administrator?`
    : `Remove administrator rights from ${name}?`;
  if (!window.confirm(question)) return;

  if (button) button.disabled = true;
  try {
    const updated = await adminRequest(
      `/admin/users/${encodeURIComponent(String(user.id))}`,
      { method: 'PATCH', body: { is_admin: makeAdmin } }
    );
    const nowAdmin = updated?.is_admin === true;
    const done = nowAdmin
      ? `${name} is now an administrator.`
      : `${name} is no longer an administrator.`;
    const session = getAdminSession();
    if (!nowAdmin && session && session.userId === String(user.id)) {
      clearAdminSession('not-admin');
    } else {
      await loadAdminUsers();
    }
    // Set after the reload so the list's own status does not replace it.
    setResult(done, 'success');
  } catch (error) {
    const message =
      error?.code === 'LAST_ADMIN' ? LAST_ADMIN_MESSAGE : error.message;
    setResult(`Could not change ${name}: ${message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

export function initAdminUsers() {
  const form = el('admin-users-search-form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.query = String(el('admin-users-query')?.value || '').trim();
    state.offset = 0;
    void loadAdminUsers();
  });
  el('admin-users-prev')?.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - ADMIN_USERS_PAGE_SIZE);
    void loadAdminUsers();
  });
  el('admin-users-next')?.addEventListener('click', () => {
    state.offset += ADMIN_USERS_PAGE_SIZE;
    void loadAdminUsers();
  });
  // The gate follows the token field and the account session.
  el('admin-token')?.addEventListener('input', updateAdminUsersGate);
  onAdminSessionChange(updateAdminUsersGate);
  updateAdminUsersGate();
}

/** Test helper: reset the paging state between tests. */
export function resetAdminUsersState() {
  state.query = '';
  state.offset = 0;
  state.total = 0;
}

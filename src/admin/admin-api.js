/**
 * File: src/admin/admin-api.js
 * Purpose: Shared request helper for admin console endpoints (economy, metrics,
 *          game reset). Reads the backend URL and admin token from the
 *          Connection section of admin.html.
 * Role in system: Used by economy-settings.js, admin-metrics.js and
 *          game-management.js; backend enforces admin access (X-Admin-Token).
 * Security notes:
 *  - The admin token is read from the password input per request and never
 *    persisted or logged.
 *  - Backend error payloads are normalized via utils/api-error.js; callers
 *    render the message with textContent only.
 */

import { createApiError, readApiError } from '../utils/api-error.js';

function inputValue(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

/**
 * Resolve the admin connection from the page inputs.
 * @returns {{ baseUrl: string, adminToken: string }}
 */
export function readAdminConnection() {
  // Trailing slashes would produce "//admin/..." paths.
  const baseUrl = inputValue('admin-backend-url').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Backend URL is not set. Please enter a backend URL.');
  }
  return { baseUrl, adminToken: inputValue('admin-token') };
}

/**
 * Call an admin endpoint and return the parsed JSON body.
 * Throws an Error carrying `status` and `code` on non-2xx responses so callers
 * can show the backend's own validation message (400/404/422).
 * @param {string} path - absolute API path, IDs already URL-encoded
 * @param {{ method?: string, body?: object }} [options]
 */
export async function adminRequest(path, { method = 'GET', body } = {}) {
  const { baseUrl, adminToken } = readAdminConnection();
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) {
    headers['X-Admin-Token'] = adminToken;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const fallback = `Request failed (${response.status})`;
    throw createApiError(await readApiError(response, fallback));
  }
  return await response.json();
}

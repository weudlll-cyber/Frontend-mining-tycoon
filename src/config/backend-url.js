/**
File: src/config/backend-url.js
Purpose: Single source of truth for the default backend base URL used by the
lobby (index.html), the player board (player.html) and the admin console (admin.html).
Role in system:
- Read once at build time from `VITE_API_BASE_URL` (see `.env.example`).
- Falls back to the local development backend when the variable is unset or blank.
- Pages still let the user override the URL (base-url fields + localStorage);
  this module only provides the default seed value.
Security notes:
- Only http/https origins are accepted; anything else falls back to the default.
*/

export const FALLBACK_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Resolve the default backend URL from a Vite env object.
 * Exported separately so tests can exercise the fallback rules without
 * depending on the build-time `import.meta.env` value.
 * @param {Record<string, unknown> | undefined} env
 * @returns {string}
 */
export function resolveDefaultBackendUrl(env) {
  const raw = String(env?.VITE_API_BASE_URL ?? '').trim();
  if (!raw) {
    return FALLBACK_BACKEND_URL;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return FALLBACK_BACKEND_URL;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    // WHY: a malformed build-time value must not break page boot; the user can
    // still correct the URL in the base-url field.
    return FALLBACK_BACKEND_URL;
  }
}

export const DEFAULT_BACKEND_URL = resolveDefaultBackendUrl(import.meta.env);

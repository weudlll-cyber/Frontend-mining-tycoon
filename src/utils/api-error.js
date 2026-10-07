/**
File: src/utils/api-error.js
Purpose: Normalize backend error payloads into a short human-readable message plus optional machine code.
Role in system:
- Shared by lobby auth client, player join/upgrade/trade actions and admin flows so every
  surface shows the backend's own message instead of a generic failure.
- Handles the FastAPI shapes the backend emits:
  - `{ "detail": "text" }`
  - `{ "detail": { "code": "X", "message": "text" } }`
  - `{ "detail": [{ "loc": [...], "msg": "text" }] }` (422 validation errors)
  - `{ "code": "X", "message": "text" }` (top-level error envelope)
Security notes:
- Returns plain strings only; callers must render them with textContent.
- Never includes request bodies, tokens or headers in the message.
*/

function cleanValidationMessage(msg) {
  // WHY: pydantic prefixes custom validator errors with "Value error, " which
  // is noise for players.
  return String(msg || '')
    .replace(/^Value error,\s*/i, '')
    .trim();
}

function messageFromDetail(detail) {
  if (typeof detail === 'string') {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        return cleanValidationMessage(item?.msg);
      })
      .filter(Boolean)
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return String(detail.message || detail.msg || '').trim();
  }
  return '';
}

function codeFromPayload(payload) {
  const candidates = [payload?.code, payload?.detail?.code];
  const code = candidates.find(
    (value) => typeof value === 'string' && value.trim()
  );
  return code ? code.trim() : null;
}

/**
 * Extract `{ message, code }` from a parsed backend error payload.
 * @param {unknown} payload
 * @param {string} fallback - used when the payload carries no readable message
 */
export function extractApiError(payload, fallback) {
  const message =
    messageFromDetail(payload?.detail) ||
    (typeof payload?.message === 'string' ? payload.message.trim() : '') ||
    fallback;
  return { message, code: codeFromPayload(payload) };
}

/**
 * Read and normalize an error response body.
 * @param {Response} response
 * @param {string} fallback
 * @returns {Promise<{ message: string, code: string | null, status: number }>}
 */
export async function readApiError(response, fallback) {
  const status = Number(response?.status) || 0;
  try {
    const payload = await response.json();
    return { ...extractApiError(payload, fallback), status };
  } catch {
    return { message: fallback, code: null, status };
  }
}

/**
 * Build an Error carrying the backend status and code so callers can branch
 * on specific contract responses (e.g. 403 PASSWORD_RESET_DISABLED, 409, 422).
 */
export function createApiError({ message, code = null, status = 0 }) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

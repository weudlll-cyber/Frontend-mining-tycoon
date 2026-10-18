/**
File: src/utils/value-utils.js
Purpose: Shared value guards and small number formatters (one copy instead of
  per-module re-implementations).
Key responsibilities:
- isPlainObject / isFiniteNumber / toFiniteNumber type guards for backend
  payloads.
- formatRatePercent: a rate as percent text without float noise.
- formatTokenName: "summer" -> "Summer" for token, upgrade and status names.
Dependencies: none (pure helpers).
Security notes: returns plain values/strings; callers render via textContent.
*/

/** True for a non-null, non-array object. */
export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** True only for a real finite number (no numeric strings). */
export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Number or numeric string as a finite number; null for empty/invalid. */
export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Format a rate as percent text without float noise
 * (0.02 -> "2", 0.0125 -> "1.25"). `suffix` is appended to valid values;
 * `fallback` is returned when the rate is not a number.
 */
export function formatRatePercent(rate, { suffix = '', fallback = null } = {}) {
  const numeric = toFiniteNumber(rate);
  if (numeric === null) return fallback;
  return `${Number((numeric * 100).toFixed(4))}${suffix}`;
}

/** Capitalize a token/upgrade name ("summer" -> "Summer"); "Unknown" if empty. */
export function formatTokenName(token) {
  const text = String(token || '').trim();
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

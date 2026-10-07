/*
File: src/utils/player-name.js
Purpose: Derive a join name that satisfies the backend player-name contract.
Role in system:
- The backend rejects join names that are not 1-24 characters of letters,
  digits, spaces and `_ - .` (422). Account display names allow up to 80
  arbitrary characters, so the lobby must map them to a valid player name.
*/

export const PLAYER_NAME_MAX_LENGTH = 24;

const VALID_PLAYER_NAME = /^[\p{L}\p{N}_ .-]+$/u;
const DISALLOWED_CHARS = /[^\p{L}\p{N}_ .-]+/gu;

function isValidPlayerName(name) {
  return (
    name.length >= 1 &&
    name.length <= PLAYER_NAME_MAX_LENGTH &&
    VALID_PLAYER_NAME.test(name)
  );
}

function sanitize(raw) {
  return String(raw || '')
    .replace(DISALLOWED_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH)
    .trim();
}

/**
 * Return the first usable player name: the display name as-is when valid,
 * otherwise a sanitized display name, then the sanitized username, then 'Player'.
 */
export function toPlayerName(displayName, username) {
  const trimmed = String(displayName || '').trim();
  if (isValidPlayerName(trimmed)) {
    return trimmed;
  }
  return sanitize(displayName) || sanitize(username) || 'Player';
}

/**
File: src/utils/storage-utils.js
Purpose: LocalStorage and backend URL helpers for frontend session and metadata cache state.
Role in system:
- Keeps client-side persistence deterministic and scoped to setup and session metadata.
Invariants:
- Storage failures remain non-fatal to gameplay.
- Keys remain namespaced to avoid collisions and accidental authority leaks.
Security notes:
- URL normalization accepts only http and https origins.
- Storage wrappers avoid throwing on browser quota or policy failures.
*/

const GAME_META_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GAME_META_CACHE_MAX_ENTRIES = 30;

export const STORAGE_KEYS = {
  baseUrl: 'mining-tycoon:baseUrl',
  playerName: 'mining-tycoon:playerName',
  durationPreset: 'mining-tycoon:durationPreset',
  durationCustomValue: 'mining-tycoon:durationCustomValue',
  durationCustomUnit: 'mining-tycoon:durationCustomUnit',
  enrollmentWindow: 'mining-tycoon:enrollmentWindow',
  roundType: 'mining-tycoon:roundType',
  asyncDurationPreset: 'mining-tycoon:asyncDurationPreset',
  asyncDurationCustomMinutes: 'mining-tycoon:asyncDurationCustomMinutes',
  asyncAutoStart: 'mining-tycoon:asyncAutoStart',
  debugPanelOpen: 'mining-tycoon:debugPanelOpen',
  gameId: 'mining-tycoon:gameId',
  playerId: 'mining-tycoon:playerId',
  globalMetaHash: 'mining-tycoon:globalMetaHash',
  gameMetaSeenAt: 'mining-tycoon:gameMetaSeenAt',
};

/**
 * Return the localStorage key for the player session token.
 * Scoped by both game and player so tokens from different sessions don't collide.
 */
export function getPlayerTokenStorageKey(gameId, playerId) {
  return `mining-tycoon:playerToken:${gameId}:${playerId}`;
}

export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`localStorage set failed for key ${key}:`, e);
  }
}

export function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`localStorage get failed for key ${key}:`, e);
    return null;
  }
}

export function normalizeBaseUrl(rawValue) {
  const trimmed = (rawValue || '').trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      'Invalid backend URL. Use http://host:port or https://host:port.'
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Backend URL must use http or https.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

export function getGameMetaHashStorageKey(gameId) {
  return `mining-tycoon:gameMetaHash:${gameId}`;
}

/** List all per-game meta hash cache keys currently present in localStorage. */
function listGameMetaKeys() {
  const prefix = 'mining-tycoon:gameMetaHash:';
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
  } catch (e) {
    console.warn('Failed to list game meta cache keys:', e);
  }
  return keys;
}

function readGameMetaSeenMap() {
  try {
    const raw = getStorageItem(STORAGE_KEYS.gameMetaSeenAt);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    // Backward compatible fallback if old/corrupt metadata exists.
    return {};
  }
}

function writeGameMetaSeenMap(mapObj) {
  setStorageItem(STORAGE_KEYS.gameMetaSeenAt, JSON.stringify(mapObj));
}

export function markGameMetaSeen(gameId) {
  if (gameId === null || gameId === undefined || gameId === '') return;
  const gameIdStr = String(gameId);
  const seenMap = readGameMetaSeenMap();
  seenMap[gameIdStr] = Date.now();
  writeGameMetaSeenMap(seenMap);
}

/**
 * Enforce retention rules for per-game meta hash cache:
 * - Drop entries older than TTL days.
 * - Keep only the N most recently seen game entries.
 */
export function cleanupGameMetaCache() {
  const keys = listGameMetaKeys();
  if (keys.length === 0) {
    return;
  }

  const now = Date.now();
  const prefix = 'mining-tycoon:gameMetaHash:';
  const seenMap = readGameMetaSeenMap();

  const entries = keys.map((key) => {
    const gameId = key.slice(prefix.length);
    const rawSeenAt = seenMap[gameId];
    const seenAt = Number.isFinite(rawSeenAt)
      ? rawSeenAt
      : Number.parseInt(rawSeenAt || '0', 10);
    return {
      key,
      gameId,
      seenAt: Number.isFinite(seenAt) ? seenAt : 0,
    };
  });

  // TTL-based cleanup for entries with known timestamps.
  const ttlCutoff = now - GAME_META_CACHE_TTL_MS;
  entries.forEach((entry) => {
    if (entry.seenAt > 0 && entry.seenAt < ttlCutoff) {
      try {
        localStorage.removeItem(entry.key);
        delete seenMap[entry.gameId];
      } catch (e) {
        console.warn(
          'Failed to remove stale game meta cache entry:',
          entry.key,
          e
        );
      }
    }
  });

  const remainingKeys = listGameMetaKeys();
  const remainingEntries = remainingKeys.map((key) => {
    const gameId = key.slice(prefix.length);
    const rawSeenAt = seenMap[gameId];
    const seenAt = Number.isFinite(rawSeenAt)
      ? rawSeenAt
      : Number.parseInt(rawSeenAt || '0', 10);
    return {
      key,
      gameId,
      seenAt: Number.isFinite(seenAt) ? seenAt : 0,
    };
  });

  // Keep only the most recent N entries.
  remainingEntries.sort((a, b) => b.seenAt - a.seenAt);
  if (remainingEntries.length > GAME_META_CACHE_MAX_ENTRIES) {
    const staleByCount = remainingEntries.slice(GAME_META_CACHE_MAX_ENTRIES);
    staleByCount.forEach((entry) => {
      try {
        localStorage.removeItem(entry.key);
        delete seenMap[entry.gameId];
      } catch (e) {
        console.warn(
          'Failed to remove overflow game meta cache entry:',
          entry.key,
          e
        );
      }
    });
  }

  // Remove seen-map metadata for missing hash keys.
  const remainingGameIds = new Set(
    listGameMetaKeys().map((key) => key.slice(prefix.length))
  );
  Object.keys(seenMap).forEach((gameId) => {
    if (!remainingGameIds.has(gameId)) {
      delete seenMap[gameId];
    }
  });

  writeGameMetaSeenMap(seenMap);
}

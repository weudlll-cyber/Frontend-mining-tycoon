/*
File: src/meta/meta-manager.js
Purpose: Game and global meta fetch/cache state, ETag-based deduplication, and contract version tracking.
Call initMetaManager() once with required callbacks before use.
*/

import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
  getGameMetaHashStorageKey,
  markGameMetaSeen,
  cleanupGameMetaCache,
  normalizeBaseUrl,
} from '../utils/storage-utils.js';

// Module-level meta state
let _globalMeta = null;
const _gameMetaById = new Map();
const _metaChangeToastShownForGame = new Set();
const _metaFetchState = {
  global: { inFlight: null, lastFetchedAt: 0, lastResult: null },
  byGame: new Map(),
};

let _activeMetaHash = null;
let _activeContractVersion = null;
let _activeContractSupported = true;
let _activeUpgradeDefinitions = null;
let _contractUnsupportedToastShown = false;

const META_FETCH_THROTTLE_MS = 1500;
const META_HASH_PREFIX_LENGTH = 8;
let _SUPPORTED_CONTRACT_VERSION_MIN = 1;
let _SUPPORTED_CONTRACT_VERSION_MAX = 2;

// Render callbacks registered from main.js
let _onMetaChanged = null;
let _showToast = null;

/**
 * Wire up mutable dependencies (render callbacks, toast).
 * @param {{ onMetaChanged: () => void, showToast: (message: string, type: string) => void, supportedMin?: number, supportedMax?: number }} deps
 */
export function initMetaManager(deps) {
  _onMetaChanged = deps.onMetaChanged;
  _showToast = deps.showToast;
  if (Number.isInteger(deps.supportedMin))
    _SUPPORTED_CONTRACT_VERSION_MIN = deps.supportedMin;
  if (Number.isInteger(deps.supportedMax))
    _SUPPORTED_CONTRACT_VERSION_MAX = deps.supportedMax;
}

/* ---------- public state accessors ---------- */

export function getActiveMetaHash() {
  return _activeMetaHash;
}

export function setActiveMetaHashFromStorage(hash) {
  _activeMetaHash = hash;
}

export function getActiveContractVersion() {
  return _activeContractVersion;
}

export function isActiveContractSupported() {
  return _activeContractSupported;
}

export function getActiveUpgradeDefinitions() {
  return _activeUpgradeDefinitions;
}

export function getGameMeta(gameId) {
  return _gameMetaById.get(String(gameId)) || null;
}

export function getGlobalMeta() {
  return _globalMeta;
}

/* ---------- contract version check ---------- */

export function isContractVersionSupported(version) {
  return (
    Number.isInteger(version) &&
    version >= _SUPPORTED_CONTRACT_VERSION_MIN &&
    version <= _SUPPORTED_CONTRACT_VERSION_MAX
  );
}

/* ---------- meta hash helpers ---------- */

export function shortMetaHash(hash) {
  if (!hash || typeof hash !== 'string') return '-';
  return hash.slice(0, META_HASH_PREFIX_LENGTH);
}

/* ---------- internal fetch state ---------- */

function getMetaFetchEntry(gameId = null) {
  if (gameId === null || gameId === undefined || gameId === '') {
    return _metaFetchState.global;
  }
  const gameIdStr = String(gameId);
  if (!_metaFetchState.byGame.has(gameIdStr)) {
    _metaFetchState.byGame.set(gameIdStr, {
      inFlight: null,
      lastFetchedAt: 0,
      lastResult: null,
    });
  }
  return _metaFetchState.byGame.get(gameIdStr);
}

function getCachedMetaHash(gameId = null) {
  if (gameId === null || gameId === undefined || gameId === '') {
    return _globalMeta?.meta_hash || getStorageItem(STORAGE_KEYS.globalMetaHash);
  }
  const gameIdStr = String(gameId);
  return (
    _gameMetaById.get(gameIdStr)?.meta_hash ||
    getStorageItem(getGameMetaHashStorageKey(gameIdStr))
  );
}

function persistMetaHash(meta, gameId = null) {
  if (!meta || typeof meta.meta_hash !== 'string' || !meta.meta_hash) return;
  try {
    if (gameId === null || gameId === undefined || gameId === '') {
      setStorageItem(STORAGE_KEYS.globalMetaHash, meta.meta_hash);
    } else {
      setStorageItem(getGameMetaHashStorageKey(gameId), meta.meta_hash);
      markGameMetaSeen(gameId);
      cleanupGameMetaCache();
    }
  } catch (e) {
    console.warn('Failed to persist meta_hash:', e);
  }
}

async function fetchMetaWithOptionalEtag(url, cachedMetaHash, fallbackMeta = null) {
  const headers = {};
  if (cachedMetaHash) {
    headers['If-None-Match'] = cachedMetaHash;
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    if (fallbackMeta) {
      return { meta: fallbackMeta, notModified: true };
    }
    const fullResponse = await fetch(url);
    if (!fullResponse.ok) {
      throw new Error(
        `Meta fetch failed: ${fullResponse.status} ${fullResponse.statusText}`
      );
    }
    return { meta: await fullResponse.json(), notModified: false };
  }

  if (!response.ok) {
    throw new Error(
      `Meta fetch failed: ${response.status} ${response.statusText}`
    );
  }

  return { meta: await response.json(), notModified: false };
}

/* ---------- setActiveMeta ---------- */

export function setActiveMeta(meta) {
  if (!meta || typeof meta !== 'object') return;
  _activeMetaHash =
    typeof meta.meta_hash === 'string' && meta.meta_hash
      ? meta.meta_hash
      : null;
  _activeContractVersion = Number.isInteger(meta.api_contract_version)
    ? meta.api_contract_version
    : null;
  _activeContractSupported = isContractVersionSupported(_activeContractVersion);
  _activeUpgradeDefinitions =
    meta.upgrade_definitions && typeof meta.upgrade_definitions === 'object'
      ? meta.upgrade_definitions
      : null;

  if (!_activeContractSupported && !_contractUnsupportedToastShown) {
    _showToast?.(
      `Unsupported contract version v${_activeContractVersion}. Upgrades are disabled.`,
      'error'
    );
    _contractUnsupportedToastShown = true;
  }

  _onMetaChanged?.();
}

/* ---------- fetchMetaSnapshot ---------- */

export async function fetchMetaSnapshot(baseUrl, gameId = null, options = {}) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const { force = false } = options;

  const fetchEntry = getMetaFetchEntry(gameId);
  if (!force) {
    const ageMs = Date.now() - fetchEntry.lastFetchedAt;
    if (fetchEntry.inFlight) return fetchEntry.inFlight;
    if (
      fetchEntry.lastResult &&
      ageMs >= 0 &&
      ageMs < META_FETCH_THROTTLE_MS
    ) {
      return fetchEntry.lastResult;
    }
  }

  const task = (async () => {
    const cachedGlobalHash = getCachedMetaHash(null);
    try {
      const globalResult = await fetchMetaWithOptionalEtag(
        `${normalizedBase}/meta`,
        cachedGlobalHash,
        _globalMeta
      );
      if (!globalResult.notModified) {
        _globalMeta = globalResult.meta;
        persistMetaHash(_globalMeta, null);
      }
    } catch (e) {
      console.warn('Unable to fetch /meta:', e);
    }

    if (gameId === null || gameId === undefined || gameId === '') {
      if (_globalMeta) {
        const latestGlobalHash = _globalMeta.meta_hash || null;
        if (latestGlobalHash !== _activeMetaHash || !_activeContractVersion) {
          setActiveMeta(_globalMeta);
        }
      }
      fetchEntry.lastFetchedAt = Date.now();
      fetchEntry.lastResult = _globalMeta;
      return _globalMeta;
    }

    const gameIdStr = String(gameId);
    const previousMeta = _gameMetaById.get(gameIdStr) || null;
    const cachedGameHash = getCachedMetaHash(gameIdStr);

    const gameResult = await fetchMetaWithOptionalEtag(
      `${normalizedBase}/games/${encodeURIComponent(gameIdStr)}/meta`,
      cachedGameHash,
      previousMeta
    );

    const gameMeta = gameResult.meta;
    const previousHash = previousMeta?.meta_hash || null;
    const nextHash = gameMeta?.meta_hash || null;

    if (!gameResult.notModified) {
      _gameMetaById.set(gameIdStr, gameMeta);
      persistMetaHash(gameMeta, gameIdStr);

      if (previousHash && nextHash && previousHash !== nextHash) {
        console.info(
          `[meta] meta_hash changed for game ${gameIdStr}: ${shortMetaHash(previousHash)} -> ${shortMetaHash(nextHash)}`
        );
        if (!_metaChangeToastShownForGame.has(gameIdStr)) {
          _showToast?.('Game rules updated - refreshing upgrades...', 'info');
          _metaChangeToastShownForGame.add(gameIdStr);
        }
      }

      setActiveMeta(gameMeta);

      if (previousHash && nextHash && previousHash !== nextHash) {
        // Signal to main.js that upgrade metrics should be re-rendered with latest game data.
        _onMetaChanged?.();
      }
    }

    fetchEntry.lastFetchedAt = Date.now();
    fetchEntry.lastResult = gameMeta;
    return gameMeta;
  })();

  fetchEntry.inFlight = task;
  try {
    return await task;
  } finally {
    fetchEntry.inFlight = null;
  }
}

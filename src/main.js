/*
File: src/main.js
Purpose: Browser dashboard client for Mining Tycoon (SSE updates, upgrades, and capabilities metadata).
Key responsibilities:
- Manage SSE lifecycle and reconnect behavior.
- Fetch/cache meta contracts with ETag, dedupe/throttle, and retention cleanup.
- Render state/leaderboard/upgrades and enforce contract-version safety gates.
Entry points / public functions:
- DOMContentLoaded bootstrap, start/stop/new-game handlers, fetchMetaSnapshot.
Dependencies:
- Browser fetch/EventSource/localStorage APIs and backend HTTP endpoints.
Last updated: 2026-03-10
Author/Owner: Frontend Team
*/

import './style.css';

// DOM elements - inputs
const baseUrlInput = document.getElementById('base-url');
const playerNameInput = document.getElementById('player-name');
const gameDurationInput = document.getElementById('game-duration');
const enrollmentWindowInput = document.getElementById('enrollment-window');
const gameIdInput = document.getElementById('game-id');
const playerIdInput = document.getElementById('player-id');

// DOM elements - buttons
const newGameBtn = document.getElementById('new-game-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');

// DOM elements - status displays
const connStatusEl = document.getElementById('conn-status');
const gameStatusEl = document.getElementById('game-status');
const countdownEl = document.getElementById('countdown');
const countdownLabelEl = document.getElementById('countdown-label');
const newGameStatusEl = document.getElementById('new-game-status');
const metaDebugEl = document.getElementById('meta-debug');

// DOM elements - player and leaderboard
const playerStateEl = document.getElementById('player-state');
const leaderboardEl = document.getElementById('leaderboard');
const upgradesEl = document.getElementById('upgrades');

let eventSource = null;
let intentionalClose = false;
let countdownInterval = null;
let lastGameData = null;
let waitingTimer = null;
let payloadLogged = false;

let globalMeta = null;
const gameMetaById = new Map();
let activeMetaHash = null;
let activeContractVersion = null;
let activeUpgradeDefinitions = null;
let activeContractSupported = true;
let contractUnsupportedToastShown = false;
const metaChangeToastShownForGame = new Set();

const metaFetchState = {
  global: { inFlight: null, lastFetchedAt: 0, lastResult: null },
  byGame: new Map(),
};

const META_HASH_PREFIX_LENGTH = 8;
const GAME_META_CACHE_MAX_ENTRIES = 20;
const GAME_META_CACHE_TTL_DAYS = 30;
const GAME_META_CACHE_TTL_MS = GAME_META_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const META_FETCH_THROTTLE_MS = 1500;
const SUPPORTED_CONTRACT_VERSION_MIN = 1;
const SUPPORTED_CONTRACT_VERSION_MAX = 1;

// localStorage helpers
const STORAGE_KEYS = {
  baseUrl: 'mining-tycoon:baseUrl',
  playerName: 'mining-tycoon:playerName',
  gameDuration: 'mining-tycoon:gameDuration',
  enrollmentWindow: 'mining-tycoon:enrollmentWindow',
  gameId: 'mining-tycoon:gameId',
  playerId: 'mining-tycoon:playerId',
  globalMetaHash: 'mining-tycoon:globalMetaHash',
  gameMetaSeenAt: 'mining-tycoon:gameMetaSeenAt',
};

/**
 * Return the localStorage key for the player session token.
 * Scoped by both game and player so tokens from different sessions don't collide.
 */
function getPlayerTokenStorageKey(gameId, playerId) {
  return `mining-tycoon:playerToken:${gameId}:${playerId}`;
}

function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`localStorage set failed for key ${key}:`, e);
  }
}

function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`localStorage get failed for key ${key}:`, e);
    return null;
  }
}

function normalizeBaseUrl(rawValue) {
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

function getNormalizedBaseUrlOrNull({ notify = true } = {}) {
  try {
    return normalizeBaseUrl(baseUrlInput.value);
  } catch (e) {
    if (notify) {
      showToast(e.message, 'error');
    }
    return null;
  }
}

function getGameMetaHashStorageKey(gameId) {
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    return parsed;
  } catch {
    // Backward compatible fallback if old/corrupt metadata exists.
    return {};
  }
}

function writeGameMetaSeenMap(mapObj) {
  setStorageItem(STORAGE_KEYS.gameMetaSeenAt, JSON.stringify(mapObj));
}

function markGameMetaSeen(gameId) {
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
function cleanupGameMetaCache() {
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
  let removedByTtl = 0;
  entries.forEach((entry) => {
    if (entry.seenAt > 0 && entry.seenAt < ttlCutoff) {
      try {
        localStorage.removeItem(entry.key);
        delete seenMap[entry.gameId];
        removedByTtl += 1;
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
  let removedByCount = 0;
  if (remainingEntries.length > GAME_META_CACHE_MAX_ENTRIES) {
    const staleByCount = remainingEntries.slice(GAME_META_CACHE_MAX_ENTRIES);
    staleByCount.forEach((entry) => {
      try {
        localStorage.removeItem(entry.key);
        delete seenMap[entry.gameId];
        removedByCount += 1;
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

  if (removedByTtl > 0 || removedByCount > 0) {
    console.debug(
      `[meta-cache] cleanup removed ${removedByTtl} by TTL and ${removedByCount} by max-count; kept ${remainingGameIds.size}`
    );
  }
}

function shortMetaHash(hash) {
  if (!hash || typeof hash !== 'string') return '-';
  return hash.slice(0, META_HASH_PREFIX_LENGTH);
}

function renderMetaDebugLine() {
  if (!metaDebugEl) return;
  const versionText = Number.isInteger(activeContractVersion)
    ? `v${activeContractVersion}`
    : 'v-';
  metaDebugEl.textContent = `contract ${versionText} | meta_hash ${shortMetaHash(activeMetaHash)}`;
}

function isContractVersionSupported(version) {
  return (
    Number.isInteger(version) &&
    version >= SUPPORTED_CONTRACT_VERSION_MIN &&
    version <= SUPPORTED_CONTRACT_VERSION_MAX
  );
}

function getMetaFetchEntry(gameId = null) {
  if (gameId === null || gameId === undefined || gameId === '') {
    return metaFetchState.global;
  }
  const gameIdStr = String(gameId);
  if (!metaFetchState.byGame.has(gameIdStr)) {
    metaFetchState.byGame.set(gameIdStr, {
      inFlight: null,
      lastFetchedAt: 0,
      lastResult: null,
    });
  }
  return metaFetchState.byGame.get(gameIdStr);
}

function getCachedMetaHash(gameId = null) {
  if (gameId === null || gameId === undefined || gameId === '') {
    return globalMeta?.meta_hash || getStorageItem(STORAGE_KEYS.globalMetaHash);
  }

  const gameIdStr = String(gameId);
  return (
    gameMetaById.get(gameIdStr)?.meta_hash ||
    getStorageItem(getGameMetaHashStorageKey(gameIdStr))
  );
}

async function fetchMetaWithOptionalEtag(
  url,
  cachedMetaHash,
  fallbackMeta = null
) {
  const headers = {};
  if (cachedMetaHash) {
    headers['If-None-Match'] = cachedMetaHash;
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    if (fallbackMeta) {
      return { meta: fallbackMeta, notModified: true };
    }

    // Backward compatible fallback: if we only had a hash but no body, refetch once.
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

function setActiveMeta(meta) {
  if (!meta || typeof meta !== 'object') return;
  activeMetaHash =
    typeof meta.meta_hash === 'string' && meta.meta_hash
      ? meta.meta_hash
      : null;
  activeContractVersion = Number.isInteger(meta.api_contract_version)
    ? meta.api_contract_version
    : null;
  activeContractSupported = isContractVersionSupported(activeContractVersion);
  activeUpgradeDefinitions =
    meta.upgrade_definitions && typeof meta.upgrade_definitions === 'object'
      ? meta.upgrade_definitions
      : null;

  if (!activeContractSupported && !contractUnsupportedToastShown) {
    showToast(
      `Unsupported contract version v${activeContractVersion}. Upgrades are disabled.`,
      'error'
    );
    contractUnsupportedToastShown = true;
  }

  renderMetaDebugLine();
}

async function fetchMetaSnapshot(baseUrl, gameId = null, options = {}) {
  // Dedupe in-flight requests and throttle repeated reconnect bursts.
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const { force = false } = options;

  const fetchEntry = getMetaFetchEntry(gameId);
  if (!force) {
    const ageMs = Date.now() - fetchEntry.lastFetchedAt;
    if (fetchEntry.inFlight) {
      return fetchEntry.inFlight;
    }
    if (fetchEntry.lastResult && ageMs >= 0 && ageMs < META_FETCH_THROTTLE_MS) {
      return fetchEntry.lastResult;
    }
  }

  const task = (async () => {
    const cachedGlobalHash = getCachedMetaHash(null);
    try {
      const globalResult = await fetchMetaWithOptionalEtag(
        `${normalizedBase}/meta`,
        cachedGlobalHash,
        globalMeta
      );
      if (!globalResult.notModified) {
        globalMeta = globalResult.meta;
        persistMetaHash(globalMeta, null);
      }
    } catch (e) {
      console.warn('Unable to fetch /meta:', e);
    }

    if (gameId === null || gameId === undefined || gameId === '') {
      if (globalMeta) {
        // Skip re-render on 304 by only applying on changed payload.
        const latestGlobalHash = globalMeta.meta_hash || null;
        if (latestGlobalHash !== activeMetaHash || !activeContractVersion) {
          setActiveMeta(globalMeta);
        }
      }
      fetchEntry.lastFetchedAt = Date.now();
      fetchEntry.lastResult = globalMeta;
      return globalMeta;
    }

    const gameIdStr = String(gameId);
    const previousMeta = gameMetaById.get(gameIdStr) || null;
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
      gameMetaById.set(gameIdStr, gameMeta);
      persistMetaHash(gameMeta, gameIdStr);

      if (previousHash && nextHash && previousHash !== nextHash) {
        console.info(
          `[meta] meta_hash changed for game ${gameIdStr}: ${shortMetaHash(previousHash)} -> ${shortMetaHash(nextHash)}`
        );

        if (!metaChangeToastShownForGame.has(gameIdStr)) {
          showToast('Game rules updated - refreshing upgrades...', 'info');
          metaChangeToastShownForGame.add(gameIdStr);
        }
      }

      setActiveMeta(gameMeta);

      if (
        previousHash &&
        nextHash &&
        previousHash !== nextHash &&
        lastGameData
      ) {
        renderUpgradeMetrics(lastGameData);
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

function setBadgeStatus(element, status) {
  element.className = 'badge';
  switch (status) {
    case 'connected':
    case 'running':
      element.classList.add('badge-green');
      element.textContent = status === 'connected' ? 'Connected' : 'Running';
      break;
    case 'reconnecting':
      element.classList.add('badge-yellow');
      element.textContent = 'Reconnecting';
      break;
    case 'waiting':
      element.classList.add('badge-yellow');
      element.textContent = 'Waiting for first event...';
      break;
    case 'finished':
      element.classList.add('badge-blue');
      element.textContent = 'Finished';
      break;
    default:
      element.classList.add('badge-gray');
      element.textContent = 'Idle';
  }
}

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '-';
  }
  const s = Math.max(0, Math.floor(seconds));
  return String(s).padStart(2, '0');
}

function updateCountdown() {
  if (!lastGameData || lastGameData.seconds_remaining === null) {
    countdownEl.textContent = '-';
    return;
  }

  const elapsed = (Date.now() - lastGameData.timestamp) / 1000;
  const remaining = Math.max(0, lastGameData.seconds_remaining - elapsed);
  countdownEl.textContent = formatCountdown(remaining);
}

function updateEnrollmentCountdown() {
  if (!lastGameData || lastGameData.enrollment_seconds_remaining === null) {
    countdownEl.textContent = '-';
    return;
  }

  const elapsed = (Date.now() - lastGameData.timestamp) / 1000;
  const remaining = Math.max(
    0,
    lastGameData.enrollment_seconds_remaining - elapsed
  );
  countdownEl.textContent = formatCountdown(remaining);
}

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 100);
}

function startEnrollmentCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  updateEnrollmentCountdown();
  countdownInterval = setInterval(updateEnrollmentCountdown, 100);
}

function stopCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownLabelEl.textContent = 'Time Remaining';
  countdownEl.textContent = '-';
}

function calculateCurrentMiningRate(playerState) {
  if (!playerState) return 0;
  const mining = playerState.mining || {};
  const baseRate = 1.0;
  const hashrate = mining.hashrate || 1.0;
  const efficiency = mining.efficiency || 1.0;
  return baseRate * hashrate * efficiency;
}

function renderPlayerState(data) {
  if (!data) {
    playerStateEl.innerHTML =
      '<p class="placeholder">Waiting for game data...</p>';
    return;
  }

  let html = '';
  const metrics = data.upgrade_metrics || {};
  const currentRate =
    typeof metrics.output_per_second === 'number'
      ? metrics.output_per_second
      : calculateCurrentMiningRate(data.player_state);

  html += `<div class="state-stat">
    <span class="state-stat-label">Output Rate</span>
    <span class="state-stat-value highlight">${currentRate.toFixed(2)} tokens/s</span>
  </div>`;

  if (data.player_tokens !== undefined) {
    html += `<div class="state-stat">
      <span class="state-stat-label">Tokens</span>
      <span class="state-stat-value">${Math.floor(data.player_tokens)}</span>
    </div>`;
  }

  if (data.player_mining_rate !== undefined) {
    html += `<div class="state-stat">
      <span class="state-stat-label">Mining Rate</span>
      <span class="state-stat-value">${data.player_mining_rate.toFixed(2)} tokens/s</span>
    </div>`;
  }

  if (data.player_cumulative_mined !== undefined) {
    html += `<div class="state-stat">
      <span class="state-stat-label">Total Mined</span>
      <span class="state-stat-value">${Math.floor(data.player_cumulative_mined)}</span>
    </div>`;
  }

  if (!html) {
    html = '<p class="placeholder">Waiting for player data...</p>';
  }

  playerStateEl.innerHTML = html;
}

function renderLeaderboard(data) {
  if (!data) {
    leaderboardEl.innerHTML =
      '<p class="placeholder">Waiting for game data...</p>';
    return;
  }

  const leaderboard = data.leaderboard_top_5 || data.leaderboard || [];

  if (!leaderboard || leaderboard.length === 0) {
    leaderboardEl.innerHTML =
      '<p class="placeholder">Waiting for leaderboard data...</p>';
    return;
  }

  const topFive = leaderboard.slice(0, 5);

  let html = '<table class="leaderboard-table"><thead><tr>';
  html += '<th>Rank</th>';
  html += '<th>Player</th>';
  html += '<th style="text-align: right;">Mined</th>';
  html += '</tr></thead><tbody>';

  topFive.forEach((player, index) => {
    const rank = index + 1;
    const name = player.name || player.player_id || '-';
    const tokens = Math.floor(player.score || 0);
    html += '<tr>';
    html += `<td><span class="leaderboard-rank">#${rank}</span></td>`;
    html += `<td><span class="leaderboard-name">${escapeHtml(name)}</span></td>`;
    html += `<td><span class="leaderboard-score">${tokens}</span></td>`;
    html += '</tr>';
  });

  html += '</tbody></table>';
  leaderboardEl.innerHTML = html;
}

function formatCost(cost) {
  if (cost == null) return '-';
  if (typeof cost === 'object') {
    const parts = [];
    for (const [k, v] of Object.entries(cost)) {
      parts.push(`${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`);
    }
    return parts.join(', ');
  }
  if (typeof cost === 'number') {
    return cost.toString();
  }
  return String(cost);
}

function renderUpgradeMetrics(data) {
  if (!data || !data.upgrade_metrics) {
    upgradesEl.innerHTML =
      '<p class="placeholder">Waiting for upgrade data...</p>';
    return;
  }

  const metrics = data.upgrade_metrics;
  const upgrades = metrics.upgrades || {};
  const playerState = data.player_state || {};
  const upgradeLevels = playerState.upgrade_levels || {};
  let html = '';

  if (typeof metrics.output_per_second === 'number') {
    html += `<div class="state-stat">
      <span class="state-stat-label">Current Output</span>
      <span class="state-stat-value highlight">${metrics.output_per_second.toFixed(2)} tokens/s</span>
    </div>`;
  }

  const defaultUpgradeOrder = ['hashrate', 'efficiency', 'cooling'];
  const supportedUpgradeTypes = activeUpgradeDefinitions
    ? Object.keys(activeUpgradeDefinitions)
    : defaultUpgradeOrder;

  supportedUpgradeTypes.forEach((type) => {
    const info = upgrades[type];
    const definition = activeUpgradeDefinitions?.[type];
    if (!info && !definition) return;

    const level = upgradeLevels[type] || 0;
    const title =
      definition?.display_name || type.charAt(0).toUpperCase() + type.slice(1);

    html += '<div class="upgrade-section">';
    html += `<h3>${escapeHtml(title)} Upgrade <span class="upgrade-level">Level ${level}</span></h3>`;

    if (definition?.effect_summary) {
      html += `<div class="upgrade-stat">Effect: <span class="upgrade-current">${escapeHtml(definition.effect_summary)}</span></div>`;
    }

    html += `<div class="upgrade-stat">Cost: <span class="upgrade-cost">${escapeHtml(formatCost(info?.cost_to_next))}</span></div>`;

    if (info && info.delta_output !== undefined) {
      html += `<div class="upgrade-stat">Output Increase: <span class="upgrade-benefit">+${info.delta_output.toFixed(2)} tokens/s</span></div>`;
    }
    if (info && info.output_after !== undefined) {
      html += `<div class="upgrade-stat">Output After: <span class="upgrade-current">${info.output_after.toFixed(2)} tokens/s</span></div>`;
    }
    if (info && info.breakeven_seconds !== undefined) {
      html += `<div class="upgrade-stat">Breakeven: <span class="upgrade-roi">${info.breakeven_seconds.toFixed(1)}s</span></div>`;
    }

    const disabledAttrs = activeContractSupported
      ? ''
      : ' disabled title="Unsupported API contract version. Upgrades disabled."';
    html += `<button class="btn-upgrade" data-upgrade="${type}" data-level="${level}"${disabledAttrs}>Upgrade -> Level ${level + 1}</button>`;
    html += '</div>';
  });

  if (!html) {
    html = '<p class="placeholder">No upgrade data available</p>';
  }

  upgradesEl.innerHTML = html;

  const upgradeButtons = upgradesEl.querySelectorAll('.btn-upgrade');
  upgradeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const upgradeType = button.dataset.upgrade;
      const nextLevel = parseInt(button.dataset.level, 10) + 1;
      performUpgrade(upgradeType, nextLevel);
    });
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function performUpgrade(upgradeType, nextLevel) {
  if (!activeContractSupported) {
    showToast(
      'Unsupported contract version. Upgrade actions are disabled.',
      'error'
    );
    return;
  }

  if (!lastGameData || !lastGameData.game_id || !lastGameData.player_id) {
    console.error('No game or player data available for upgrade');
    return;
  }

  const baseUrl = getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }
  const gameId = lastGameData.game_id;
  const playerId = lastGameData.player_id;

  const playerToken = getStorageItem(
    getPlayerTokenStorageKey(gameId, playerId)
  );
  const upgradeHeaders = { 'Content-Type': 'application/json' };
  if (playerToken) {
    upgradeHeaders['X-Player-Token'] = playerToken;
  }

  try {
    const response = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/upgrade`,
      {
        method: 'POST',
        headers: upgradeHeaders,
        body: JSON.stringify({ upgrade_type: upgradeType }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Upgrade failed: ${response.status}`);
    }

    await response.json();
    const upgradeName =
      upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1);
    showToast(`Upgraded ${upgradeName} to level ${nextLevel}`, 'success');
  } catch (error) {
    console.error('Upgrade error:', error);
    showToast(`Upgrade failed: ${error.message}`, 'error');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showNewGameStatus(message, type = 'info') {
  newGameStatusEl.textContent = message;
  newGameStatusEl.className = `status-message ${type}`;
}

function clearNewGameStatus() {
  newGameStatusEl.textContent = '';
  newGameStatusEl.className = 'status-message empty';
}

async function getErrorMessageFromResponse(response, fallbackMessage) {
  try {
    const errorData = await response.json();
    const detail =
      errorData &&
      typeof errorData.detail === 'string' &&
      errorData.detail.trim()
        ? errorData.detail
        : fallbackMessage;
    const code =
      errorData && typeof errorData.code === 'string' && errorData.code
        ? errorData.code
        : null;
    return { detail, code };
  } catch {
    // Ignore parse errors and use fallback.
  }
  return { detail: fallbackMessage, code: null };
}

function saveSettings() {
  setStorageItem(STORAGE_KEYS.baseUrl, baseUrlInput.value);
  setStorageItem(STORAGE_KEYS.playerName, playerNameInput.value);
  setStorageItem(STORAGE_KEYS.gameDuration, gameDurationInput.value);
  setStorageItem(STORAGE_KEYS.enrollmentWindow, enrollmentWindowInput.value);
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);
}

// Defensive UI guard: keep main form inputs editable even if browser/autofill
// or extension state accidentally toggles readOnly/disabled flags.
function ensureInputsEditable() {
  [
    baseUrlInput,
    playerNameInput,
    gameDurationInput,
    enrollmentWindowInput,
    gameIdInput,
    playerIdInput,
  ].forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

function loadSettings() {
  const savedBaseUrl = getStorageItem(STORAGE_KEYS.baseUrl);
  const savedPlayerName = getStorageItem(STORAGE_KEYS.playerName);
  const savedGameDuration = getStorageItem(STORAGE_KEYS.gameDuration);
  const savedEnrollmentWindow = getStorageItem(STORAGE_KEYS.enrollmentWindow);
  const savedGameId = getStorageItem(STORAGE_KEYS.gameId);
  const savedPlayerId = getStorageItem(STORAGE_KEYS.playerId);

  if (savedBaseUrl) baseUrlInput.value = savedBaseUrl;
  if (savedPlayerName) playerNameInput.value = savedPlayerName;
  if (savedGameDuration) gameDurationInput.value = savedGameDuration;
  if (savedEnrollmentWindow)
    enrollmentWindowInput.value = savedEnrollmentWindow;
  if (savedGameId) gameIdInput.value = savedGameId;
  if (savedPlayerId) playerIdInput.value = savedPlayerId;

  try {
    const loadedGameId = gameIdInput.value;
    const gameHash = loadedGameId
      ? getStorageItem(getGameMetaHashStorageKey(loadedGameId))
      : null;
    const globalHash = getStorageItem(STORAGE_KEYS.globalMetaHash);
    activeMetaHash = gameHash || globalHash || null;
  } catch (e) {
    console.warn('localStorage meta_hash load failed:', e);
  }

  renderMetaDebugLine();
}

function updateUI(data) {
  lastGameData = data;
  lastGameData.timestamp = Date.now();

  if (data.game_status) {
    setBadgeStatus(gameStatusEl, data.game_status);

    if (data.game_status === 'enrolling') {
      countdownLabelEl.textContent = 'Game starts in';
      startEnrollmentCountdown();
    } else if (data.game_status === 'running') {
      countdownLabelEl.textContent = 'Time Remaining';
      startCountdownTimer();
    } else if (data.game_status === 'finished') {
      countdownLabelEl.textContent = 'Time Remaining';
      stopCountdownTimer();
    }
  }

  renderPlayerState(data);
  renderUpgradeMetrics(data);
  renderLeaderboard(data);
}

function startStream(gameId, playerId) {
  console.log('Starting SSE stream...');

  if (eventSource) {
    intentionalClose = true;
    if (countdownInterval) clearInterval(countdownInterval);
    if (waitingTimer) clearTimeout(waitingTimer);
    eventSource.close();
    eventSource = null;
  }

  const base = getNormalizedBaseUrlOrNull();
  if (!base) {
    return;
  }

  /**
   * Obtain a short-lived SSE ticket.
   * Required when REQUIRE_PLAYER_AUTH=true on the backend.
   * In dev mode the endpoint still works but the ticket is optional.
   * The ticket is placed in the URL rather than a header because
   * browser EventSource cannot send custom request headers.
   * Token-in-URL is justified here because:
   *   - The ticket is HMAC-signed and expires in 60 s.
   *   - The alternative (plain player_token in URL) would be permanent.
   *   - The call is guarded by CORS and HTTPS in production.
   */
  async function buildSseUrl() {
    const baseStreamUrl = `${base}/games/${encodeURIComponent(gameId)}/stream?player_id=${encodeURIComponent(playerId)}`;
    const playerToken = getStorageItem(
      getPlayerTokenStorageKey(gameId, playerId)
    );
    try {
      const ticketResp = await fetch(
        `${base}/games/${encodeURIComponent(gameId)}/sse-ticket?player_id=${encodeURIComponent(playerId)}`,
        {
          headers: playerToken ? { 'X-Player-Token': playerToken } : {},
        }
      );
      if (ticketResp.ok) {
        const ticketData = await ticketResp.json();
        if (ticketData.ticket) {
          return `${baseStreamUrl}&ticket=${encodeURIComponent(ticketData.ticket)}`;
        }
      }
    } catch {
      // Ticket fetch failed — fall back to no-ticket URL.
      // This works in dev mode; in production the SSE endpoint will reject without a ticket.
    }
    return baseStreamUrl;
  }

  setBadgeStatus(connStatusEl, 'reconnecting');
  startBtn.disabled = true;
  intentionalClose = false;

  buildSseUrl().then((url) => {
    console.log('SSE URL:', url.replace(/ticket=[^&]+/, 'ticket=[redacted]'));

    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setBadgeStatus(connStatusEl, 'waiting');
      startBtn.disabled = false;

      waitingTimer = setTimeout(() => {
        if (eventSource && eventSource.readyState === EventSource.OPEN) {
          setBadgeStatus(connStatusEl, 'waiting');
        }
      }, 3000);

      // Refresh capabilities on each reconnect and detect meta drift.
      fetchMetaSnapshot(base, gameId).catch((err) =>
        console.warn('Meta refresh on connect failed:', err)
      );
    };

    eventSource.onmessage = (e) => {
      if (waitingTimer) {
        clearTimeout(waitingTimer);
        waitingTimer = null;
      }

      setBadgeStatus(connStatusEl, 'connected');

      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        console.error('Failed to parse SSE data:', e.data);
        return;
      }

      if (!payloadLogged) {
        console.log('SSE payload keys:', Object.keys(data));
        if (data.upgrade_metrics) {
          console.log('upgrade_metrics structure:', data.upgrade_metrics);
        }
        if (data.player_state) {
          console.log('player_state keys:', Object.keys(data.player_state));
        }
        payloadLogged = true;
      }

      updateUI(data);

      if (data && data.game_status === 'finished') {
        intentionalClose = true;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (countdownInterval) clearInterval(countdownInterval);
        if (waitingTimer) clearTimeout(waitingTimer);
        startBtn.disabled = false;
      }
    };

    eventSource.onerror = () => {
      if (waitingTimer) {
        clearTimeout(waitingTimer);
        waitingTimer = null;
      }

      if (!intentionalClose) {
        setBadgeStatus(connStatusEl, 'reconnecting');
        console.log('Connection error, readyState:', eventSource?.readyState);
      } else {
        setBadgeStatus(connStatusEl, 'idle');
        startBtn.disabled = false;
      }
    };
  }); // end buildSseUrl().then(...)
} // end startStream

startBtn.addEventListener('click', async () => {
  const gameId = gameIdInput.value;
  const playerId = playerIdInput.value;
  const baseUrl = getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }

  cleanupGameMetaCache();
  markGameMetaSeen(gameId);

  try {
    await fetchMetaSnapshot(baseUrl, gameId);
  } catch (e) {
    console.warn('Initial meta fetch failed before stream start:', e);
  }

  startStream(gameId, playerId);
});

stopBtn.addEventListener('click', () => {
  if (eventSource) {
    intentionalClose = true;
    eventSource.close();
    eventSource = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (waitingTimer) {
    clearTimeout(waitingTimer);
    waitingTimer = null;
  }
  setBadgeStatus(connStatusEl, 'idle');
  setBadgeStatus(gameStatusEl, 'idle');
  stopCountdownTimer();
  lastGameData = null;
  playerStateEl.innerHTML =
    '<p class="placeholder">Waiting for game data...</p>';
  leaderboardEl.innerHTML =
    '<p class="placeholder">Waiting for game data...</p>';
  upgradesEl.innerHTML =
    '<p class="placeholder">Waiting for upgrade data...</p>';
  newGameBtn.disabled = false;
  startBtn.disabled = false;
  stopBtn.disabled = false;
  ensureInputsEditable();
});

async function createNewGameAndJoin() {
  if (eventSource) {
    intentionalClose = true;
    if (countdownInterval) clearInterval(countdownInterval);
    if (waitingTimer) clearTimeout(waitingTimer);
    eventSource.close();
    eventSource = null;
  }

  newGameBtn.disabled = true;
  startBtn.disabled = true;
  stopBtn.disabled = true;

  clearNewGameStatus();

  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    showNewGameStatus(
      'Error: Invalid backend URL. Use http://host:port or https://host:port.',
      'error'
    );
    newGameBtn.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = false;
    return;
  }
  const playerName = playerNameInput.value.trim() || 'Player';
  const gameDuration = parseInt(gameDurationInput.value, 10) || 300;
  const enrollmentWindow = parseInt(enrollmentWindowInput.value, 10) || 60;

  cleanupGameMetaCache();

  try {
    showNewGameStatus('Creating game...', 'info');
    const gameResponse = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        real_duration_seconds: gameDuration,
        enrollment_window_seconds: enrollmentWindow,
      }),
    });

    if (!gameResponse.ok) {
      const { detail } = await getErrorMessageFromResponse(
        gameResponse,
        `Game creation failed: ${gameResponse.status} ${gameResponse.statusText}`
      );
      throw new Error(detail);
    }

    const gameData = await gameResponse.json();
    const gameId = gameData.game_id;

    if (!gameId) {
      throw new Error('No game_id returned from server');
    }

    gameIdInput.value = gameId;

    showNewGameStatus('Joining game...', 'info');
    const joinResponse = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/join`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      }
    );

    if (!joinResponse.ok) {
      const { detail, code } = await getErrorMessageFromResponse(
        joinResponse,
        `Join failed: ${joinResponse.status} ${joinResponse.statusText}`
      );
      if (code) {
        console.debug('[join-policy] error code:', code);
      }
      throw new Error(detail);
    }

    const joinData = await joinResponse.json();
    const playerId = joinData.player_id;

    if (!playerId) {
      throw new Error('No player_id returned from server');
    }

    playerIdInput.value = playerId;

    // Store the player session token for authenticated requests (state, upgrade, SSE).
    if (joinData.player_token) {
      setStorageItem(
        getPlayerTokenStorageKey(gameId, playerId),
        joinData.player_token
      );
    }

    markGameMetaSeen(gameId);
    cleanupGameMetaCache();

    // Prime capabilities from /meta and /games/{game_id}/meta.
    await fetchMetaSnapshot(baseUrl, gameId);

    saveSettings();

    showNewGameStatus('Game created and joined. Starting stream...', 'success');
    stopBtn.disabled = false;
    ensureInputsEditable();
    startStream(gameId, playerId);
  } catch (error) {
    console.error('Error creating game and joining:', error);
    showNewGameStatus(`Error: ${escapeHtml(error.message)}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    newGameBtn.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = false;
    ensureInputsEditable();
  }
}

newGameBtn.addEventListener('click', createNewGameAndJoin);

baseUrlInput.addEventListener('change', saveSettings);
playerNameInput.addEventListener('change', saveSettings);
gameDurationInput.addEventListener('change', saveSettings);
enrollmentWindowInput.addEventListener('change', saveSettings);
gameIdInput.addEventListener('change', saveSettings);
playerIdInput.addEventListener('change', saveSettings);

document.addEventListener('DOMContentLoaded', async () => {
  ensureInputsEditable();
  loadSettings();
  cleanupGameMetaCache();
  markGameMetaSeen(gameIdInput.value || null);
  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    // Keep UI usable even if a previously stored URL is malformed.
    return;
  }
  try {
    await fetchMetaSnapshot(baseUrl, gameIdInput.value || null);
  } catch (e) {
    console.warn('Initial meta fetch failed:', e);
  }
});

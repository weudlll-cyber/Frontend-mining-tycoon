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
Last updated: 2026-03-12
Author/Owner: Frontend Team

Manual QA (P2 Seasonal Oracle)
1) Create game and join player.
2) Confirm 4 balances are visible (spring/summer/autumn/winter).
3) Confirm oracle prices are visible.
4) Select upgrade_type=efficiency, target_token=summer, pay_token=winter.
5) Submit upgrade; verify winter balance decreases and summer efficiency increases after refresh.
6) Switch pay_token and verify preview updates.
7) Force unsupported api_contract_version (> max) and verify upgrades are disabled with out-of-date message.
*/

import './style.css';
import {
  DEFAULT_TOKEN_NAMES,
  normalizeTokenNames,
  computePayCostPreview,
} from './utils/token-utils.js';
import { clearNode } from './utils/dom-utils.js';
import {
  STORAGE_KEYS,
  getPlayerTokenStorageKey,
  setStorageItem,
  getStorageItem,
  normalizeBaseUrl,
  getGameMetaHashStorageKey,
  markGameMetaSeen,
  cleanupGameMetaCache,
} from './utils/storage-utils.js';
import {
  computeTokenHalvingCount,
  computeCurrentHalvingMonth,
  computeMostRecentPastHalving,
  deriveLastHalvingNoticeUpdate,
  halvingKey,
  LAST_HALVING_NOTICE_SECONDS,
  shouldShowTokenHalvingIndicator,
} from './halving.js';
import { setBadgeStatus } from './ui/badge.js';
import {
  initCountdown,
  startCountdownTimer,
  startEnrollmentCountdown,
  stopCountdownTimer,
  clearCountdownInterval,
} from './ui/countdown.js';
import {
  initHalvingDisplay,
  handleLastHalvingStateUpdate,
  resetTransientHalvingState,
  stopNextHalvingCountdown,
  computeNextHalvingHint,
  resolveNextHalvingTarget,
  shouldResetNextHalvingCountdownTarget,
} from './ui/halving-display.js';
import {
  initMetaManager,
  getGameMeta,
  isContractVersionSupported,
  isActiveContractSupported,
  getActiveMetaHash,
  setActiveMetaHashFromStorage,
  getActiveContractVersion,
  getActiveUpgradeDefinitions,
  shortMetaHash,
  setActiveMeta as setActiveMetaState,
  fetchMetaSnapshot,
} from './meta/meta-manager.js';
import {
  initPlayerView,
  renderPlayerState,
} from './ui/player-view.js';
import {
  initUpgradePanel,
  renderUpgradeMetrics as renderUpgradePanelMetrics,
  getSelectedTokens,
} from './ui/upgrade-panel.js';

// DOM elements - inputs
const baseUrlInput = document.getElementById('base-url');
const playerNameInput = document.getElementById('player-name');
const durationPresetInput = document.getElementById('duration-preset');
const durationCustomInput = document.getElementById('duration-custom-input');
const durationCustomValueInput = document.getElementById(
  'duration-custom-value'
);
const durationCustomUnitInput = document.getElementById('duration-custom-unit');
const enrollmentWindowInput = document.getElementById('enrollment-window');
const gameIdInput = document.getElementById('game-id');
const playerIdInput = document.getElementById('player-id');

function setActiveMeta(meta) {
  initializeModules();
  setActiveMetaState(meta);
}
const showAdvancedCheckbox = document.getElementById('show-advanced-overrides');
const advancedOverridesDiv = document.getElementById('advanced-overrides');
const anchorTokenInput = document.getElementById('anchor-token');
const anchorRateInput = document.getElementById('anchor-rate');
const seasonCyclesInput = document.getElementById('season-cycles');
const derivedEmissionPreviewEl = document.getElementById(
  'derived-emission-preview'
);

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
const liveBoardEl = document.getElementById('live-board');

// DOM elements - player and leaderboard
const playerStateEl = document.getElementById('player-state');
const leaderboardEl = document.getElementById('leaderboard');
const upgradesEl = document.getElementById('upgrades');
const PLAYER_STATE_TOKENS = [...DEFAULT_TOKEN_NAMES];

let eventSource = null;
let waitingTimer = null;
let intentionalClose = false;
let payloadLogged = false;
let lastGameData = null;
let modulesInitialized = false;

// P2.4: Duration resolution helper
function resolveDurationSeconds() {
  const preset = durationPresetInput.value;
  if (preset === 'custom') {
    const customValue = parseInt(durationCustomValueInput.value, 10);
    const unit = durationCustomUnitInput.value || 'seconds';
    if (!Number.isFinite(customValue) || customValue <= 0) {
      throw new Error('Custom duration must be a positive number');
    }
    let seconds = customValue;
    if (unit === 'minutes') seconds = customValue * 60;
    else if (unit === 'hours') seconds = customValue * 3600;
    else if (unit === 'days') seconds = customValue * 86400;

    const MIN_SECONDS = 60;
    const MAX_SECONDS = 30 * 24 * 3600;
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      throw new Error(
        `Duration must be between ${MIN_SECONDS}s and ${MAX_SECONDS}s`
      );
    }
    return { mode: 'custom', customSeconds: seconds };
  }
  // Preset mode (including default)
  return { mode: 'preset', preset };
}

// P2.4: Collect optional overrides from advanced form
function collectAdvancedOverrides() {
  const overrides = {};
  const anchorToken = anchorTokenInput.value.trim();
  if (anchorToken) {
    overrides.emission_anchor_token = anchorToken;
  }
  const anchorRate = parseFloat(anchorRateInput.value);
  if (Number.isFinite(anchorRate) && anchorRate > 0) {
    overrides.emission_anchor_tokens_per_second = anchorRate;
  }
  const seasonCycles = parseInt(seasonCyclesInput.value, 10);
  if (Number.isFinite(seasonCycles) && seasonCycles > 0) {
    overrides.season_cycles_per_game = seasonCycles;
  }
  return overrides;
}

/*
Manual QA Checklist for P2.4 Duration Presets & Overrides:
1) Create game with preset "10m" → verify meta shows duration_preset=10m and game_duration_seconds=600
2) Create game with custom "120" minutes → verify duration_custom_seconds=7200 (= 2 hours)
3) Leave advanced overrides blank → backend chooses recommendations, meta shows them
4) Fill anchor_token="summer" and anchor_rate="8.5" → backend respects, meta shows them
5) Fill season_cycles="2" → meta shows the override applied
6) Verify meta info displays in debug line: "Duration: 10m | Emission: spring @ 5.0/s | Cycles: 1"
7) Ensure UI still works if meta fields absent (fallback gracefully)
8) Check localStorage persists duration preset/custom choices across page reload
9) Verify no innerHTML used in duration UI (all createElement/textContent)
*/

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

function renderMetaDebugLine() {
  if (!metaDebugEl) return;
  const activeContractVersion = getActiveContractVersion();
  const activeMetaHash = getActiveMetaHash();
  const versionText = Number.isInteger(activeContractVersion)
    ? `v${activeContractVersion}`
    : 'v-';

  let text = `contract ${versionText} | meta_hash ${shortMetaHash(activeMetaHash)}`;

  const gameId = gameIdInput?.value;
  if (gameId) {
    const gameMeta = getGameMeta(gameId);
    if (gameMeta && gameMeta.game_duration_seconds) {
      const durationSec = gameMeta.game_duration_seconds;
      let durationLabel = '';
      if (durationSec < 60) durationLabel = `${durationSec}s`;
      else if (durationSec < 3600)
        durationLabel = `${Math.round(durationSec / 60)}m`;
      else if (durationSec < 86400)
        durationLabel = `${Math.round(durationSec / 3600)}h`;
      else durationLabel = `${Math.round(durationSec / 86400)}d`;

      text += ` | Duration: ${durationLabel}`;

      if (gameMeta.emission_anchor_token) {
        const rate = gameMeta.emission_anchor_tokens_per_second || '?';
        text += ` | Emission: ${gameMeta.emission_anchor_token} @ ${rate}/s`;
      }

      if (gameMeta.season_cycles_per_game) {
        text += ` | Cycles: ${gameMeta.season_cycles_per_game}`;
      }
    }
  }

  metaDebugEl.textContent = text;
}

function renderDerivedEmissionPreview() {
  if (!derivedEmissionPreviewEl) return;

  const gameId = gameIdInput?.value;
  if (!gameId) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const gameMeta = getGameMeta(gameId);
  if (!gameMeta || !gameMeta.derived_emission_rates_per_second) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const rates = gameMeta.derived_emission_rates_per_second;
  const hasAllTokens = PLAYER_STATE_TOKENS.every((token) => token in rates);

  if (!hasAllTokens) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const ratesList = PLAYER_STATE_TOKENS.map((token) => {
    const rate = Number(rates[token]).toFixed(2);
    return `${token} ${rate}`;
  }).join(', ');

  derivedEmissionPreviewEl.textContent = `Derived Rates: ${ratesList} /s`;
  derivedEmissionPreviewEl.style.display = 'block';
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

function setLiveSessionActive(isActive) {
  document.body.classList.toggle('live-session', Boolean(isActive));
}

function scrollToLiveBoard() {
  if (!liveBoardEl) return;
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  liveBoardEl.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

function renderLeaderboard(data) {
  clearNode(leaderboardEl);

  if (!data) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Waiting for game data...';
    leaderboardEl.appendChild(placeholder);
    return;
  }

  const leaderboard = data.leaderboard_top_5 || data.leaderboard || [];
  if (!leaderboard.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Waiting for leaderboard data...';
    leaderboardEl.appendChild(placeholder);
    return;
  }

  const table = document.createElement('table');
  table.className = 'leaderboard-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Rank', 'Player', 'Mined'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (label === 'Mined') {
      th.style.textAlign = 'right';
    }
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  leaderboard.slice(0, 5).forEach((player, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${index + 1}`;
    rankCell.appendChild(rank);

    const playerCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = player.name || player.player_id || '-';
    playerCell.appendChild(name);

    const scoreCell = document.createElement('td');
    scoreCell.style.textAlign = 'right';
    const score = document.createElement('span');
    score.className = 'leaderboard-score';
    score.textContent = String(Math.floor(player.score || 0));
    scoreCell.appendChild(score);

    row.append(rankCell, playerCell, scoreCell);
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  leaderboardEl.appendChild(table);
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
    return { detail: fallbackMessage, code: null };
  }
}

async function performUpgrade(upgradeType, nextLevel) {
  if (!isActiveContractSupported()) {
    showToast(
      'Unsupported contract version. Upgrade actions are disabled.',
      'error'
    );
    return;
  }

  if (!lastGameData?.game_id || !lastGameData?.player_id) {
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
  const { targetToken, payToken } = getSelectedTokens();
  const headers = { 'Content-Type': 'application/json' };
  if (playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  try {
    const response = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/upgrade`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          upgrade_type: upgradeType,
          target_token: targetToken,
          pay_token: payToken,
        }),
      }
    );

    if (!response.ok) {
      const { detail } = await getErrorMessageFromResponse(
        response,
        `Upgrade failed: ${response.status} ${response.statusText}`
      );
      throw new Error(detail);
    }

    await response.json();
    showToast(
      `Upgraded ${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)} to level ${nextLevel}`,
      'success'
    );
  } catch (error) {
    console.error('Upgrade error:', error);
    showToast(`Upgrade failed: ${error.message}`, 'error');
  }
}

function showNewGameStatus(message, type = 'info') {
  newGameStatusEl.textContent = message;
  newGameStatusEl.className = `status-message ${type}`;
}

function clearNewGameStatus() {
  newGameStatusEl.textContent = '';
  newGameStatusEl.className = 'status-message empty';
}

function saveSettings() {
  setStorageItem(STORAGE_KEYS.baseUrl, baseUrlInput.value);
  setStorageItem(STORAGE_KEYS.playerName, playerNameInput.value);
  setStorageItem(STORAGE_KEYS.durationPreset, durationPresetInput.value);
  setStorageItem(
    STORAGE_KEYS.durationCustomValue,
    durationCustomValueInput.value
  );
  setStorageItem(
    STORAGE_KEYS.durationCustomUnit,
    durationCustomUnitInput.value
  );
  setStorageItem(STORAGE_KEYS.enrollmentWindow, enrollmentWindowInput.value);
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);
}

function initializeModules() {
  if (modulesInitialized) {
    return;
  }

  initCountdown(
    { countdownEl, countdownLabelEl },
    { get: () => lastGameData }
  );
  initHalvingDisplay({ getActiveGameMeta: getGameMeta });
  initMetaManager({
    onMetaChanged() {
      renderMetaDebugLine();
      renderDerivedEmissionPreview();
      if (lastGameData) {
        renderUpgradeMetrics(lastGameData);
      }
    },
    showToast,
  });
  initPlayerView({ playerStateEl, getActiveGameMeta: getGameMeta });
  initUpgradePanel({
    upgradesEl,
    getActiveGameMeta: getGameMeta,
    isActiveContractSupported,
    getActiveUpgradeDefinitions,
    performUpgrade,
  });

  modulesInitialized = true;
}

function renderUpgradeMetrics(data) {
  initializeModules();
  renderUpgradePanelMetrics(data, getGameMeta);
}




// Defensive UI guard: keep main form inputs editable even if browser/autofill
// or extension state accidentally toggles readOnly/disabled flags.
function ensureInputsEditable() {
  [
    baseUrlInput,
    playerNameInput,
    durationPresetInput,
    durationCustomValueInput,
    durationCustomUnitInput,
    enrollmentWindowInput,
    gameIdInput,
    playerIdInput,
    anchorTokenInput,
    anchorRateInput,
    seasonCyclesInput,
  ].forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

function loadSettings() {
  const savedBaseUrl = getStorageItem(STORAGE_KEYS.baseUrl);
  const savedPlayerName = getStorageItem(STORAGE_KEYS.playerName);
  const savedDurationPreset = getStorageItem(STORAGE_KEYS.durationPreset);
  const savedDurationCustomValue = getStorageItem(
    STORAGE_KEYS.durationCustomValue
  );
  const savedDurationCustomUnit = getStorageItem(
    STORAGE_KEYS.durationCustomUnit
  );
  const savedEnrollmentWindow = getStorageItem(STORAGE_KEYS.enrollmentWindow);
  const savedGameId = getStorageItem(STORAGE_KEYS.gameId);
  const savedPlayerId = getStorageItem(STORAGE_KEYS.playerId);

  if (savedBaseUrl) baseUrlInput.value = savedBaseUrl;
  if (savedPlayerName) playerNameInput.value = savedPlayerName;
  if (savedDurationPreset) durationPresetInput.value = savedDurationPreset;
  if (savedDurationCustomValue)
    durationCustomValueInput.value = savedDurationCustomValue;
  if (savedDurationCustomUnit)
    durationCustomUnitInput.value = savedDurationCustomUnit;
  if (savedEnrollmentWindow)
    enrollmentWindowInput.value = savedEnrollmentWindow;
  if (savedGameId) gameIdInput.value = savedGameId;
  if (savedPlayerId) playerIdInput.value = savedPlayerId;

  // Update visibility of custom duration input
  if (durationPresetInput.value === 'custom') {
    durationCustomInput.style.display = 'flex';
  }

  try {
    const loadedGameId = gameIdInput.value;
    const gameHash = loadedGameId
      ? getStorageItem(getGameMetaHashStorageKey(loadedGameId))
      : null;
    const globalHash = getStorageItem(STORAGE_KEYS.globalMetaHash);
    setActiveMetaHashFromStorage(gameHash || globalHash || null);
  } catch (e) {
    console.warn('localStorage meta_hash load failed:', e);
  }

  renderMetaDebugLine();
}

function updateUI(data) {
  lastGameData = data;
  lastGameData.timestamp = Date.now();
  setLiveSessionActive(true);
  handleLastHalvingStateUpdate(data);

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
      stopNextHalvingCountdown();
    }
  }

  renderPlayerState(data);
  renderUpgradeMetrics(data);
  renderLeaderboard(data);
}

function clearWaitingTimer() {
  if (waitingTimer) {
    clearTimeout(waitingTimer);
    waitingTimer = null;
  }
}

// resetTransientHalvingState is imported from ./ui/halving-display.js

function closeEventSourceIfOpen() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function stopLiveTimersAndHalving() {
  clearCountdownInterval();
  stopNextHalvingCountdown();
  clearWaitingTimer();
  resetTransientHalvingState();
}

function startStream(gameId, playerId) {
  console.log('Starting SSE stream...');

  if (eventSource) {
    intentionalClose = true;
    stopLiveTimersAndHalving();
    closeEventSourceIfOpen();
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
      clearWaitingTimer();

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
        closeEventSourceIfOpen();
        clearCountdownInterval();
        stopNextHalvingCountdown();
        clearWaitingTimer();
        startBtn.disabled = false;
      }
    };

    eventSource.onerror = () => {
      clearWaitingTimer();

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

if (startBtn) {
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
    scrollToLiveBoard();
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    intentionalClose = true;
    closeEventSourceIfOpen();
    stopLiveTimersAndHalving();
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
    setLiveSessionActive(false);
  });
}

async function createNewGameAndJoin() {
  if (eventSource) {
    intentionalClose = true;
    stopLiveTimersAndHalving();
    closeEventSourceIfOpen();
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
  const enrollmentWindow = parseInt(enrollmentWindowInput.value, 10) || 60;

  cleanupGameMetaCache();

  try {
    // P2.4: Resolve duration and collect overrides
    let durationPayload;
    try {
      const durationResolution = resolveDurationSeconds();
      if (durationResolution.mode === 'custom') {
        durationPayload = {
          duration_mode: 'custom',
          duration_custom_seconds: durationResolution.customSeconds,
        };
      } else {
        durationPayload = {
          duration_mode: 'preset',
          duration_preset: durationResolution.preset,
        };
      }
    } catch (e) {
      throw new Error(`Invalid duration: ${e.message}`);
    }

    const overrides = collectAdvancedOverrides();

    // Build game creation payload
    const gamePayload = {
      enrollment_window_seconds: enrollmentWindow,
      ...durationPayload,
      ...overrides,
    };

    showNewGameStatus('Creating game...', 'info');
    const gameResponse = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gamePayload),
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
    scrollToLiveBoard();
  } catch (error) {
    console.error('Error creating game and joining:', error);
    showNewGameStatus(`Error: ${error.message}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    newGameBtn.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = false;
    ensureInputsEditable();
  }
}

if (newGameBtn) {
  newGameBtn.addEventListener('click', createNewGameAndJoin);
}

// P2.4: Duration preset and advanced overrides event listeners
if (durationPresetInput) {
  durationPresetInput.addEventListener('change', () => {
    if (durationPresetInput.value === 'custom') {
      durationCustomInput.style.display = 'flex';
      durationCustomValueInput.focus();
    } else {
      durationCustomInput.style.display = 'none';
    }
    saveSettings();
  });
}

if (showAdvancedCheckbox) {
  showAdvancedCheckbox.addEventListener('change', () => {
    advancedOverridesDiv.style.display = showAdvancedCheckbox.checked
      ? 'block'
      : 'none';
  });
}

baseUrlInput?.addEventListener('change', saveSettings);
playerNameInput?.addEventListener('change', saveSettings);
durationPresetInput?.addEventListener('change', saveSettings);
durationCustomValueInput?.addEventListener('change', saveSettings);
durationCustomUnitInput?.addEventListener('change', saveSettings);
enrollmentWindowInput?.addEventListener('change', saveSettings);
gameIdInput?.addEventListener('change', saveSettings);
playerIdInput?.addEventListener('change', saveSettings);
anchorTokenInput?.addEventListener('change', saveSettings);
anchorRateInput?.addEventListener('change', saveSettings);
seasonCyclesInput?.addEventListener('change', saveSettings);

document.addEventListener('DOMContentLoaded', async () => {
  initializeModules();
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

export {
  computeNextHalvingHint,
  computeMostRecentPastHalving,
  deriveLastHalvingNoticeUpdate,
  halvingKey,
  LAST_HALVING_NOTICE_SECONDS,
  shouldResetNextHalvingCountdownTarget,
  computeCurrentHalvingMonth,
  computeTokenHalvingCount,
  shouldShowTokenHalvingIndicator,
  computePayCostPreview,
  resolveNextHalvingTarget,
  isContractVersionSupported,
  normalizeTokenNames,
  renderUpgradeMetrics,
  setActiveMeta,
};

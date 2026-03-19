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
  computePayCostPreview,
  formatCompactNumber,
  normalizeTokenNames,
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
  initEventDisplay,
  renderEventBanner,
  annotateAffectedValues,
} from './ui/event-display.js';
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
import { initPlayerView, renderPlayerState } from './ui/player-view.js';
import {
  initSetupShell,
  setSetupShellState,
  updateSetupActionsState as updateSetupShellActions,
  renderDebugContext as renderSetupDebugContext,
  setSetupCollapsed as setSetupShellCollapsed,
  toggleSetupCollapsed as toggleSetupShellCollapsed,
  autoCollapseSetupForLiveState as autoCollapseSetupShellForLiveState,
  scrollToLiveBoard as scrollSetupToLiveBoard,
  initializeHeaderInteractions as initializeSetupHeaderInteractions,
  ensureInputsEditable as ensureSetupInputsEditable,
} from './ui/setup-shell.js';
import {
  initLiveSummary,
  computePortfolioValue,
  renderQuickStats as renderLiveQuickStats,
  renderPortfolioValue as renderLivePortfolioValue,
} from './ui/live-summary.js';
import {
  initLeaderboard,
  renderLeaderboard as renderTopLeaderboard,
} from './ui/leaderboard.js';
import {
  initSeasonCards,
  formatRemainingMmSs,
  formatDurationCompact,
  classifyHalvingSeverity,
  applyHalvingTextAndSeverity,
  syncSeasonHalvingTicker,
  stopSeasonHalvingTimers,
  renderSeasonData as renderSeasonCardData,
} from './ui/season-cards.js';
import {
  initUpgradePanel,
  renderUpgradeMetrics as renderUpgradePanelMetrics,
  getSelectedTokens,
} from './ui/upgrade-panel.js';
import {
  initInlineUpgrades,
  renderAllSeasonUpgrades,
} from './ui/upgrade-panel-inline.js';
import { initChatPanel, connectChat, disconnectChat } from './ui/chat-panel.js';
import {
  initStreamController,
  startStream,
  stopLiveTimersAndHalving,
  closeEventSourceIfOpen,
  hasOpenStream,
} from './services/stream-controller.js';
import {
  initGameActions,
  performUpgrade,
  createNewGameAndJoin,
  startRoundSession,
} from './services/game-actions.js';

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
const startSessionBtn = document.getElementById('start-session-btn');
const stopBtn = document.getElementById('stop-btn');

// DOM elements - status displays
const connStatusEl = document.getElementById('conn-status');
const gameStatusEl = document.getElementById('game-status');
const countdownEl = document.getElementById('countdown');
const countdownLabelEl = document.getElementById('countdown-label');
const newGameStatusEl = document.getElementById('new-game-status');
const setupActionsNoteEl = document.getElementById('setup-actions-note');
const roundModeBadgeEl = document.getElementById('round-mode-badge');
const metaDebugEl = document.getElementById('meta-debug');
const liveBoardEl = document.getElementById('live-board');
const setupShellEl = document.getElementById('setup-shell');
const setupToggleBtnEl = document.getElementById('setup-toggle-btn');
const jumpLiveBtnEl = document.getElementById('jump-live-btn');
const jumpLiveBtnSetupEl = document.getElementById('jump-live-btn-setup');
const debugBackendUrlEl = document.getElementById('debug-backend-url');
const debugGameIdEl = document.getElementById('debug-game-id');
const debugPlayerIdEl = document.getElementById('debug-player-id');
const chatPanelEl = document.getElementById('chat-panel');
const chatToggleBtnEl = document.getElementById('chat-toggle-btn');
const chatMessagesEl = document.getElementById('chat-messages');
const chatFormEl = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');
const chatStatusEl = document.getElementById('chat-status');

// DOM elements - player and leaderboard
const playerStateEl = document.getElementById('player-state');
const leaderboardEl = document.getElementById('leaderboard');
const upgradesEl =
  document.getElementById('upgrades') || document.createElement('div'); // Fallback for safety
const seasonScrollEl = document.querySelector('.seasons-scroll');
const myScoreEl = document.getElementById('my-score');
const myRankEl = document.getElementById('my-rank');
const topScoreEl = document.getElementById('top-score');
const portfolioValueEl = document.getElementById('portfolio-value');
const PLAYER_STATE_TOKENS = [...DEFAULT_TOKEN_NAMES];
const editableInputs = [
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
];

let lastGameData = null;
let modulesInitialized = false;
let isStreamActive = false;
let isSetupBusy = false;
let latestGameStatus = null;
let sessionStartSupported = true;

function getRoundModeFromMeta(meta) {
  const raw = String(meta?.round_mode || meta?.round_type || '')
    .trim()
    .toLowerCase();
  return raw === 'async' ? 'async' : 'sync';
}

function getSessionSupportFromMeta(meta) {
  if (!meta) return null;
  if (
    meta.supports_round_sessions === true ||
    meta.supports_session_stream === true ||
    meta.supports_async_sessions === true
  ) {
    return true;
  }
  if (
    meta.supports_round_sessions === false ||
    meta.supports_session_stream === false
  ) {
    return false;
  }
  const capabilityLists = [];
  if (Array.isArray(meta.capabilities)) capabilityLists.push(meta.capabilities);
  if (Array.isArray(meta.features)) capabilityLists.push(meta.features);
  const capabilityMatch = capabilityLists
    .flat()
    .map((entry) => String(entry).toLowerCase())
    .some((entry) => entry.includes('session'));
  return capabilityMatch ? true : null;
}

function getCurrentRoundContext() {
  const gameMeta = getGameMeta(gameIdInput?.value);
  const roundMode = getRoundModeFromMeta(gameMeta);
  const supportFromMeta = getSessionSupportFromMeta(gameMeta);
  const supportsSessionStart =
    roundMode !== 'async'
      ? false
      : supportFromMeta === null
        ? sessionStartSupported
        : supportFromMeta;
  return {
    roundMode,
    supportsSessionStart,
  };
}

function syncSetupShellState() {
  const roundContext = getCurrentRoundContext();
  setSetupShellState({
    isStreamActive,
    isSetupBusy,
    latestGameStatus,
    roundMode: roundContext.roundMode,
    sessionStartSupported: roundContext.supportsSessionStart,
  });
}

function updateSetupActionsState() {
  initializeModules();
  syncSetupShellState();
  updateSetupShellActions();
}

function setSetupStateForTests({ streamActive, gameStatus, setupBusy } = {}) {
  if (typeof streamActive === 'boolean') {
    isStreamActive = streamActive;
  }
  if (typeof gameStatus === 'string' || gameStatus === null) {
    latestGameStatus = gameStatus;
  }
  if (typeof setupBusy === 'boolean') {
    isSetupBusy = setupBusy;
  }
  updateSetupActionsState();
}

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

function renderDebugContext() {
  initializeModules();
  renderSetupDebugContext();
}

function setSetupCollapsed(isCollapsed) {
  initializeModules();
  setSetupShellCollapsed(isCollapsed);
}

function toggleSetupCollapsed() {
  initializeModules();
  toggleSetupShellCollapsed();
}

function autoCollapseSetupForLiveState(gameStatus = null) {
  initializeModules();
  autoCollapseSetupShellForLiveState(gameStatus);
}

function scrollToLiveBoard() {
  initializeModules();
  scrollSetupToLiveBoard();
}

function initializeHeaderInteractions() {
  initializeModules();
  initializeSetupHeaderInteractions();
}

function renderQuickStats(data) {
  initializeModules();
  renderLiveQuickStats(data);
}

function renderPortfolioValue(data) {
  initializeModules();
  renderLivePortfolioValue(data);
}

function renderLeaderboard(data) {
  initializeModules();
  renderTopLeaderboard(data);
}

function renderSeasonData(data) {
  initializeModules();
  renderSeasonCardData(data);
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

  renderDebugContext();
  updateSetupActionsState();
}

function initializeModules() {
  if (modulesInitialized) {
    return;
  }

  initSetupShell({
    gameIdInput,
    playerIdInput,
    newGameBtn,
    startBtn,
    startSessionBtn,
    stopBtn,
    setupActionsNoteEl,
    roundModeBadgeEl,
    debugBackendUrlEl,
    debugGameIdEl,
    debugPlayerIdEl,
    setupShellEl,
    setupToggleBtnEl,
    jumpLiveBtnEl,
    jumpLiveBtnSetupEl,
    liveBoardEl,
    editableInputs,
  });
  initCountdown({ countdownEl, countdownLabelEl }, { get: () => lastGameData });
  initHalvingDisplay({ getActiveGameMeta: getGameMeta });
  initEventDisplay({ seasonScrollEl });
  initLiveSummary({
    myScoreEl,
    myRankEl,
    topScoreEl,
    portfolioValueEl,
    getGameMeta,
    defaultTokenNames: PLAYER_STATE_TOKENS,
  });
  initLeaderboard({ leaderboardEl });
  initSeasonCards({ getGameMeta });
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
  initInlineUpgrades({
    getActiveGameMeta: getGameMeta,
    isActiveContractSupported,
    getActiveUpgradeDefinitions,
    performUpgrade,
  });
  initChatPanel({
    panelEl: chatPanelEl,
    toggleBtnEl: chatToggleBtnEl,
    messagesEl: chatMessagesEl,
    formEl: chatFormEl,
    inputEl: chatInputEl,
    statusEl: chatStatusEl,
    getBaseUrl: () => getNormalizedBaseUrlOrNull({ notify: false }),
    getGameId: () => gameIdInput.value,
    getPlayerId: () => playerIdInput.value,
    getPlayerToken: (gameId, playerId) =>
      getStorageItem(getPlayerTokenStorageKey(gameId, playerId)),
    showToast,
  });
  initStreamController({
    clearCountdownInterval,
    stopNextHalvingCountdown,
    stopSeasonHalvingTimers,
    resetTransientHalvingState,
    onStreamStateChange(next) {
      isStreamActive = next;
    },
    updateSetupActionsState,
    getNormalizedBaseUrlOrNull,
    connectChat,
    getStorageItem,
    getPlayerTokenStorageKey,
    setBadgeStatus,
    connStatusEl,
    fetchMetaSnapshot,
    onData: updateUI,
    disconnectChat,
    onGameStatusChange(next) {
      latestGameStatus = next;
    },
  });
  initGameActions({
    isActiveContractSupported,
    showToast,
    getLastGameData: () => lastGameData,
    getNormalizedBaseUrlOrNull,
    getStorageItem,
    getPlayerTokenStorageKey,
    getSelectedTokens,
    disconnectChat,
    hasOpenStream,
    stopActiveStream() {
      closeEventSourceIfOpen();
      stopLiveTimersAndHalving();
      isStreamActive = false;
      latestGameStatus = null;
      updateSetupActionsState();
    },
    onSetupBusyChange(next) {
      isSetupBusy = next;
      updateSetupActionsState();
    },
    clearNewGameStatus,
    showNewGameStatus,
    getPlayerName: () => playerNameInput.value.trim() || 'Player',
    getEnrollmentWindow: () => parseInt(enrollmentWindowInput.value, 10) || 60,
    cleanupGameMetaCache,
    resolveDurationSeconds,
    collectAdvancedOverrides,
    setGameId(gameId) {
      gameIdInput.value = gameId;
    },
    setPlayerId(playerId) {
      playerIdInput.value = playerId;
    },
    setStorageItem,
    markGameMetaSeen,
    fetchMetaSnapshot,
    saveSettings,
    ensureInputsEditable,
    startLiveStream,
    setSetupCollapsed,
    scrollToLiveBoard,
  });

  modulesInitialized = true;
}

function renderUpgradeMetrics(data) {
  initializeModules();
  renderUpgradePanelMetrics(data, getGameMeta);
  renderAllSeasonUpgrades(data, getGameMeta);
}

function createPlaceholder(message) {
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = message;
  return placeholder;
}

function ensureInputsEditable() {
  initializeModules();
  ensureSetupInputsEditable();
}

function resetSectionPlaceholder(node, message) {
  if (!node) return;
  clearNode(node);
  node.appendChild(createPlaceholder(message));
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
  renderDebugContext();
  updateSetupActionsState();
}

function updateUI(data) {
  lastGameData = data;
  lastGameData.timestamp = Date.now();
  latestGameStatus = data?.game_status || null;
  setLiveSessionActive(true);
  handleLastHalvingStateUpdate(data);

  if (data.game_status) {
    setBadgeStatus(gameStatusEl, data.game_status);
    autoCollapseSetupForLiveState(data.game_status);

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

  renderSeasonData(data);
  renderPlayerState(data);
  renderUpgradeMetrics(data);
  renderLeaderboard(data);
  renderQuickStats(data);
  renderPortfolioValue(data);
  renderEventBanner(data);
  annotateAffectedValues(data);
  updateSetupActionsState();
}

async function startLiveStream(gameId, playerId, options = {}) {
  const roundContext = getCurrentRoundContext();
  let sessionId = null;
  if (roundContext.roundMode === 'async' && roundContext.supportsSessionStart) {
    const sessionResult = await startRoundSession(gameId, playerId);
    if (sessionResult.sessionId) {
      sessionId = sessionResult.sessionId;
      sessionStartSupported = true;
    } else if (sessionResult.unsupported) {
      sessionStartSupported = false;
      showToast(
        'Session start unavailable on this backend. Falling back to game stream.',
        'info'
      );
    }
  }

  startStream(gameId, playerId, {
    sessionId,
    roundMode: roundContext.roundMode,
    forceSessionAttempt: Boolean(options.forceSessionAttempt),
  });
}

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

    await startLiveStream(gameId, playerId, { forceSessionAttempt: false });
    setSetupCollapsed(true);
    scrollToLiveBoard();
  });
}

if (startSessionBtn) {
  startSessionBtn.addEventListener('click', async () => {
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
      console.warn('Initial meta fetch failed before session start:', e);
    }

    await startLiveStream(gameId, playerId, { forceSessionAttempt: true });
    setSetupCollapsed(true);
    scrollToLiveBoard();
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    isStreamActive = false;
    latestGameStatus = null;
    closeEventSourceIfOpen();
    stopLiveTimersAndHalving();
    disconnectChat();
    setBadgeStatus(connStatusEl, 'idle');
    setBadgeStatus(gameStatusEl, 'idle');
    stopCountdownTimer();
    lastGameData = null;
    resetSectionPlaceholder(playerStateEl, 'Waiting for game data...');
    resetSectionPlaceholder(leaderboardEl, 'Waiting for game data...');
    if (myScoreEl) myScoreEl.textContent = '—';
    if (myRankEl) myRankEl.textContent = '—';
    if (topScoreEl) topScoreEl.textContent = '—';
    resetSectionPlaceholder(upgradesEl, 'Waiting for upgrade data...');
    ensureInputsEditable();
    setLiveSessionActive(false);
    updateSetupActionsState();
  });
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
gameIdInput?.addEventListener('input', updateSetupActionsState);

document.addEventListener('DOMContentLoaded', async () => {
  initializeModules();
  initializeHeaderInteractions();
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
  updateSetupActionsState();
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
  formatCompactNumber,
  formatRemainingMmSs,
  formatDurationCompact,
  classifyHalvingSeverity,
  applyHalvingTextAndSeverity,
  syncSeasonHalvingTicker,
  stopSeasonHalvingTimers,
  renderSeasonData,
  computePortfolioValue,
  renderPortfolioValue,
  renderUpgradeMetrics,
  setActiveMeta,
  setSetupStateForTests,
  updateSetupActionsState,
  setSetupCollapsed,
  toggleSetupCollapsed,
  autoCollapseSetupForLiveState,
  scrollToLiveBoard,
};

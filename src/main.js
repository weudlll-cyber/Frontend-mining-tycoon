/**
File: src/main.js
Purpose: Browser dashboard client for Mining Tycoon (SSE updates, upgrades, capabilities metadata, and post-game return flow).
Key responsibilities:
- Manage SSE lifecycle and reconnect behavior.
- Fetch/cache meta contracts with ETag, dedupe/throttle, and retention cleanup.
- Render state/leaderboard/upgrades and enforce contract-version safety gates.
- Drive explicit async session creation and session-scoped stream orchestration.
Invariants:
- Frontend remains display/intent only; backend stays authoritative for deterministic session policy and timing.
- Core gameplay stays inline; only the end-of-game return overlay may block input after a round finishes.
- Desktop core view must avoid page scroll; only internal panels may scroll.
Security notes:
- Use safe DOM APIs only and never render untrusted HTML.
- Encode ids in URLs and never surface player tokens in UI.
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
import {
  initPlayerView,
  renderPlayerState,
  resetPlayerStateView,
} from './ui/player-view.js';
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
  renderAsyncSessionBadge,
} from './ui/live-summary.js';
import {
  initLeaderboard,
  renderLeaderboard as renderTopLeaderboard,
} from './ui/leaderboard.js';
import {
  initLastGameHighscores,
  buildLastGameSnapshot,
  renderLastGameHighscores,
} from './ui/last-game-highscores.js';
import {
  snapSelection,
  restoreSelectionIfValid,
} from './ui/selection-persist.js';
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
  syncSessionDurationOptions,
  getAsyncDurationPreset,
  presetToSeconds,
} from './ui/async-duration.js';
import {
  TRADE_COUNT_LIMITS,
  clampTradeCount,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from './config/trading-control-data.js';
import {
  SCORING_CONTROL,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_DEFAULT_PRESET,
} from './config/game-control-data.js';
import {
  resolveDurationSecondsFromInputs,
  collectAdvancedOverridesFromInputs,
} from './ui/setup-payload.js';
import {
  getRoundModeFromMeta,
  resolveAsyncWindowOpen,
  computeCurrentRoundContext,
} from './ui/round-context.js';
import {
  shouldResetAsyncDiagnostics,
  createAsyncDiagnosticsProbeKey,
  shouldSkipAsyncDiagnosticsProbe,
  resolveSessionSupportProbeValue,
  resolveRequirePlayerAuthValue,
} from './ui/async-diagnostics.js';
import {
  computeRoundRemainingSeconds,
  normalizeSessionTimerInputs,
  shouldReuseSessionElapsedTimer,
  computeElapsedSeconds,
  isSessionExpired,
  computeSessionLeftSeconds,
} from './ui/session-timers.js';
import {
  buildSetupShellState,
  buildStartSessionStatusClass,
} from './ui/setup-state.js';
import {
  deriveStreamSessionState,
  resolveCountdownMode,
  stampIncomingUiData,
  shouldScheduleUiRender,
} from './ui/ui-update-state.js';
import {
  normalizeAsyncSessionStartFailure,
  buildActiveSessionFromResult,
} from './ui/async-session-state.js';
import {
  initInlineUpgrades,
  renderAllSeasonUpgrades,
} from './ui/upgrade-panel-inline.js';
import {
  initChatPanel,
  connectChat,
  disconnectChat,
  setChatPanelOpen,
} from './ui/chat-panel.js';
import { initTradingPanel } from './ui/trading-panel.js';
import {
  initLiveDrawer,
  getLiveDrawerTab,
  isLiveDrawerOpen,
} from './ui/live-drawer.js';
import { initSeasonFocus } from './ui/season-focus.js';
import {
  initStreamController,
  startStream,
  stopLiveTimersAndHalving,
  closeEventSourceIfOpen,
  hasOpenStream,
} from './services/stream-controller.js';
import { initGameActions, performUpgrade } from './services/game-actions.js';
import {
  initSessionActions,
  createAsyncSession,
  getSessionStreamTicket,
  probeRequirePlayerAuth,
  probeSessionSupport,
} from './services/session-actions.js';
import { debugLog } from './utils/debug-log.js';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

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
const scoringModeStockpileInput = document.getElementById(
  'scoring-mode-stockpile'
);
const scoringModePowerInput = document.getElementById('scoring-mode-power');
const scoringModeMiningTimeInput = document.getElementById(
  'scoring-mode-mining-time'
);
const scoringModeEfficiencyInput = document.getElementById(
  'scoring-mode-efficiency'
);
const roundTypeSyncInput = document.getElementById('round-type-sync');
const roundTypeAsyncInput = document.getElementById('round-type-async');
const syncHostControlsEl = document.getElementById('sync-host-controls');
const asyncHostControlsEl = document.getElementById('async-host-controls');
const asyncHostDurationPresetInput = document.getElementById(
  'async-duration-preset'
);
const asyncSessionDurationPresetInput = document.getElementById(
  'async-session-duration-preset'
);
const asyncHostAutoStartCheckbox = document.getElementById('async-auto-start');
const tradeCountInput = document.getElementById('trade-count-input');
const tradeCountModeNoteEl = document.getElementById('trade-count-mode-note');
const tradeSchedulePreviewEl = document.getElementById(
  'trade-schedule-preview'
);
const gameIdInput = document.getElementById('game-id');
const playerIdInput = document.getElementById('player-id');
const activeGameSelectInput = document.getElementById('active-game-select');
const refreshActiveGamesBtn = document.getElementById(
  'refresh-active-games-btn'
);
const activeGameStatusEl = document.getElementById('active-game-status');
const playerReturnPanelEl = document.getElementById('player-return-panel');
const lastGameSummaryEl = document.getElementById('last-game-summary');
const lastGameHighscoresEl = document.getElementById('last-game-highscores');
const gameOverOverlayEl = document.getElementById('game-over-overlay');
const gameOverTitleEl = document.getElementById('game-over-title');
const gameOverMessageEl = document.getElementById('game-over-message');

initLastGameHighscores({
  summaryEl: lastGameSummaryEl,
  listEl: lastGameHighscoresEl,
});

function setActiveMeta(meta) {
  initializeModules();
  setActiveMetaState(meta);
  void refreshAsyncDiagnostics({ force: true });
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
const startBtn = document.getElementById('start-btn');
const startSessionBtn = document.getElementById('start-session-btn');
const stopBtn = document.getElementById('stop-btn');

// DOM elements - status displays
const connStatusEl = document.getElementById('conn-status');
const gameStatusEl = document.getElementById('game-status');
const countdownEl = document.getElementById('countdown');
const countdownLabelEl = document.getElementById('countdown-label');
const asyncSessionStatusEl = document.getElementById('async-session-status');
const scoringModeStatusEl = document.getElementById('scoring-mode-status');
const setupActionsNoteEl = document.getElementById('setup-actions-note');
const roundModeBadgeEl = document.getElementById('round-mode-badge');
const startSessionStatusEl = document.getElementById('start-session-status');
const metaDebugEl = document.getElementById('meta-debug');
const liveBoardEl = document.getElementById('live-board');
const setupShellEl = document.getElementById('setup-shell');
const setupToggleBtnEl = document.getElementById('setup-toggle-btn');
const jumpLiveBtnEl = document.getElementById('jump-live-btn');
const jumpLiveBtnSetupEl = document.getElementById('jump-live-btn-setup');
const debugToggleBtnEl = document.getElementById('debug-toggle-btn');
const debugPanelEl = document.getElementById('debug-panel');
const debugBackendUrlEl = document.getElementById('debug-backend-url');
const debugGameIdEl = document.getElementById('debug-game-id');
const debugPlayerIdEl = document.getElementById('debug-player-id');
const debugSessionIdEl = document.getElementById('debug-session-id');

// DOM elements - async session UX helpers
// roundRemainingHintEl: the <span> that wraps the "Round left: …" secondary
//   countdown shown while a session is active (index.html #round-remaining-hint).
// roundRemainingEl:     the inner <span> whose textContent we update with the
//   formatted round-remaining time (#round-remaining).
// sessionDurationWarningEl: small amber text shown below the Session Duration
//   dropdown when syncSessionDurationOptions() had to auto-clamp the value.
const roundRemainingHintEl = document.getElementById('round-remaining-hint');
const roundRemainingEl = document.getElementById('round-remaining');
const sessionDurationWarningEl = document.getElementById(
  'session-duration-warning'
);
const chatPanelEl = document.getElementById('chat-panel');
const chatToggleBtnEl = document.getElementById('chat-toggle-btn');
const chatMessagesEl = document.getElementById('chat-messages');
const chatFormEl = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');
const chatStatusEl = document.getElementById('chat-status');
const chatUnreadBadgeEl = document.getElementById('chat-unread-badge');
const chatDockBtnEl = document.getElementById('chat-dock-btn');
const chatDockPreviewEl = document.getElementById('chat-dock-preview');
const chatDockUnreadEl = document.getElementById('chat-dock-unread');

// DOM elements - trading panel
const tradingPanelEl = document.getElementById('trading-panel');
const tradingStatusEl = document.getElementById('trading-status');
const tradeDrawerBtnEl = document.getElementById('trade-drawer-btn');
const farmDrawerBtnEl = document.getElementById('farm-drawer-btn');
const liveDrawerEl = document.getElementById('live-drawer');
const liveDrawerBackdropEl = document.getElementById('live-drawer-backdrop');
const liveDrawerCloseBtnEl = document.getElementById('live-drawer-close-btn');
const liveDrawerTabTradeEl = document.getElementById('live-tab-trade');
const liveDrawerTabFarmEl = document.getElementById('live-tab-farm');
const liveDrawerTabChatEl = document.getElementById('live-tab-chat');
const liveDrawerPanelTradeEl = document.getElementById('live-panel-trade');
const liveDrawerPanelFarmEl = document.getElementById('live-panel-farm');
const liveDrawerPanelChatEl = document.getElementById('live-panel-chat');

// DOM elements - player and leaderboard
const playerStateEl = document.getElementById('player-state');
const leaderboardEl = document.getElementById('leaderboard');
const upgradesEl =
  document.getElementById('upgrades') || document.createElement('div'); // Fallback for safety
const seasonScrollEl = document.querySelector('.seasons-scroll');
const seasonFocusStripEl = document.getElementById('season-focus-strip');
const seasonFocusButtons = Array.from(
  document.querySelectorAll('[data-season-focus]')
);
const seasonCards = Array.from(document.querySelectorAll('.season-card'));
const myScoreEl = document.getElementById('my-score');
const myRankEl = document.getElementById('my-rank');
const topScoreEl = document.getElementById('top-score');
const portfolioValueEl = document.getElementById('portfolio-value');
const scoreContextLabelEl = document.getElementById('score-context-label');
const scoringModeInputs = [
  scoringModeStockpileInput,
  scoringModePowerInput,
  scoringModeMiningTimeInput,
  scoringModeEfficiencyInput,
].filter(Boolean);
const PLAYER_STATE_TOKENS = [...DEFAULT_TOKEN_NAMES];
const editableInputs = [
  baseUrlInput,
  playerNameInput,
  durationPresetInput,
  durationCustomValueInput,
  durationCustomUnitInput,
  enrollmentWindowInput,
  ...scoringModeInputs,
  roundTypeSyncInput,
  roundTypeAsyncInput,
  asyncHostDurationPresetInput,
  asyncSessionDurationPresetInput,
  asyncHostAutoStartCheckbox,
  activeGameSelectInput,
  gameIdInput,
  playerIdInput,
  anchorTokenInput,
  anchorRateInput,
  seasonCyclesInput,
];

let lastGameData = null;
let modulesInitialized = false;
let tradingPanelApi = null;
let isStreamActive = false;
let isSetupBusy = false;
let latestGameStatus = null;
let chatUnreadCount = 0;
let lastChatPreview = 'Chat is ready';
let sessionStartSupported = true;
let setupRoundModeOverride = null;
let activeSession = null;
let sessionElapsedInterval = null;
let sessionElapsedAnchorUnix = null;
let sessionElapsedSeedSeconds = 0;
let roundRemainingHintInterval = null;
let asyncWindowOpen = null;
let asyncRequirePlayerAuth = 'unknown';
let asyncSessionSupportProbe = null;
let asyncDiagnosticsProbeKey = '';
let asyncDiagnosticsProbeInFlight = null;
let selectedSetupRoundType = 'sync';
let tradeCountManuallyOverridden = false;
let pendingUiRenderFrame = null;
let pendingUiRenderData = null;

function renderChatPreviewState() {
  const unreadText = chatUnreadCount > 99 ? '99+' : String(chatUnreadCount);

  if (chatUnreadBadgeEl) {
    chatUnreadBadgeEl.hidden = chatUnreadCount <= 0;
    chatUnreadBadgeEl.textContent = unreadText;
  }

  if (chatDockUnreadEl) {
    chatDockUnreadEl.hidden = chatUnreadCount <= 0;
    chatDockUnreadEl.textContent = unreadText;
  }

  if (chatDockPreviewEl) {
    chatDockPreviewEl.textContent = lastChatPreview;
  }
}

function isChatTabVisible() {
  return isLiveDrawerOpen() && getLiveDrawerTab() === 'chat';
}

function markChatAsRead() {
  if (chatUnreadCount <= 0) return;
  chatUnreadCount = 0;
  renderChatPreviewState();
}

function handleChatMessagePreview(message) {
  const user = String(message?.user || 'player').trim() || 'player';
  const text = String(message?.text || '').trim();
  lastChatPreview = text ? `${user}: ${text}` : `${user}: (empty message)`;

  if (!isChatTabVisible()) {
    chatUnreadCount += 1;
  }

  renderChatPreviewState();
}

function handleLiveDrawerStateChange(nextState) {
  const chatVisible = Boolean(
    nextState?.isOpen && nextState?.activeTab === 'chat'
  );
  setChatPanelOpen(chatVisible);
  if (chatVisible) {
    markChatAsRead();
  }
}
let activeGamesById = new Map();
let activeGamesRefreshInterval = null;
let lastFinishedGameSnapshot = null;
let lastFinishedGameId = null;
let currentViewedGameId = '';
let _hasSeenPlayableStateForCurrentView = false;
let lastGameStatusForCurrentView = null;

const DEFAULT_SCORING_MODE = SCORING_CONTROL.DEFAULT_MODE;

function normalizeScoringMode(rawMode) {
  const mode = String(rawMode || '')
    .trim()
    .toLowerCase();
  if (!mode) return DEFAULT_SCORING_MODE;
  if (mode === 'stockpile_total_tokens' || mode === 'stockpile') {
    return 'stockpile_total_tokens';
  }
  if (
    mode === 'power_oracle_weighted' ||
    mode === 'power' ||
    mode === 'oracle_weighted'
  ) {
    return 'power_oracle_weighted';
  }
  if (mode === 'mining_time_equivalent' || mode === 'mining_time') {
    return 'mining_time_equivalent';
  }
  if (mode === 'efficiency_system_mastery' || mode === 'efficiency') {
    return 'efficiency_system_mastery';
  }
  return DEFAULT_SCORING_MODE;
}

function formatScoringModeName(mode) {
  const normalized = normalizeScoringMode(mode);
  if (normalized === 'power_oracle_weighted') return 'Power Mode';
  if (normalized === 'mining_time_equivalent') {
    return 'Mining Time Equivalent Mode';
  }
  if (normalized === 'efficiency_system_mastery') return 'Efficiency Mode';
  return 'Stockpile Mode';
}

function getScoringModeScoreLabel(mode) {
  const normalized = normalizeScoringMode(mode);
  if (normalized === 'power_oracle_weighted') return 'Weighted Score';
  if (normalized === 'mining_time_equivalent') return 'Mining-Time Equivalent';
  if (normalized === 'efficiency_system_mastery') return 'Efficiency Score';
  return 'Total Tokens';
}

function getSelectedScoringMode() {
  if (scoringModePowerInput?.checked) return 'power_oracle_weighted';
  if (scoringModeMiningTimeInput?.checked) return 'mining_time_equivalent';
  if (scoringModeEfficiencyInput?.checked) return 'efficiency_system_mastery';
  return DEFAULT_SCORING_MODE;
}

function setSelectedScoringMode(mode) {
  const normalized = normalizeScoringMode(mode);
  if (scoringModeStockpileInput) {
    scoringModeStockpileInput.checked = normalized === 'stockpile_total_tokens';
  }
  if (scoringModePowerInput) {
    scoringModePowerInput.checked = normalized === 'power_oracle_weighted';
  }
  if (scoringModeMiningTimeInput) {
    scoringModeMiningTimeInput.checked =
      normalized === 'mining_time_equivalent';
  }
  if (scoringModeEfficiencyInput) {
    scoringModeEfficiencyInput.checked =
      normalized === 'efficiency_system_mastery';
  }
}

function resolveActiveScoringMode(data = null) {
  const gameId = String(data?.game_id || gameIdInput?.value || '').trim();
  const gameMeta = gameId ? getGameMeta(gameId) : null;
  return normalizeScoringMode(
    data?.scoring_mode || gameMeta?.scoring_mode || getSelectedScoringMode()
  );
}

function updateScoringModeUi(data = null) {
  const mode = resolveActiveScoringMode(data);
  if (scoringModeStatusEl) {
    scoringModeStatusEl.textContent = formatScoringModeName(mode);
  }
  if (scoreContextLabelEl) {
    scoreContextLabelEl.textContent = getScoringModeScoreLabel(mode);
  }

  const status = String(
    data?.game_status || latestGameStatus || ''
  ).toLowerCase();
  const lockModeSelection = status === 'running' || status === 'finished';
  scoringModeInputs.forEach((input) => {
    input.disabled = lockModeSelection;
  });
}

function getSelectedRoundType() {
  if (selectedSetupRoundType === 'async' || selectedSetupRoundType === 'sync') {
    return selectedSetupRoundType;
  }
  return roundTypeAsyncInput?.checked ? 'async' : 'sync';
}

function formatOffsetLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 3600) {
    const mm = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(total % 60)
      .toString()
      .padStart(2, '0');
    return `${mm}:${ss}`;
  }
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${hh}:${mm}`;
}

function getSelectedRoundDurationSecondsForTradingDefaults() {
  if (getSelectedRoundType() === 'async') {
    return (
      presetToSeconds(getAsyncDurationPreset(asyncHostDurationPresetInput)) ||
      600
    );
  }
  let resolution;
  try {
    resolution = resolveDurationSeconds();
  } catch {
    return 600;
  }
  if (resolution.mode === 'custom') {
    return Number(resolution.customSeconds) || 600;
  }
  return presetToSeconds(resolution.preset) || 600;
}

function getSelectedTradeCount() {
  return clampTradeCount(Number(tradeCountInput?.value || 0));
}

function getTradeUnlockOffsets() {
  const durationSeconds = getSelectedRoundDurationSecondsForTradingDefaults();
  return computeTradeUnlockOffsetsSeconds(
    durationSeconds,
    getSelectedTradeCount()
  );
}

function renderTradeSchedulePreview() {
  if (!tradeSchedulePreviewEl) return;

  const gameId = String(gameIdInput?.value || '').trim();
  const gameMeta = gameId ? getGameMeta(gameId) : null;
  const metaRules = gameMeta?.trading_rules;

  let tradeCount;
  let offsets;
  let note;

  if (metaRules && Number.isFinite(Number(metaRules.trade_count))) {
    tradeCount = clampTradeCount(Number(metaRules.trade_count));
    if (tradeCountInput) {
      tradeCountInput.value = String(tradeCount);
      tradeCountInput.disabled = true;
    }
    offsets = Array.isArray(metaRules.unlock_offsets_seconds)
      ? metaRules.unlock_offsets_seconds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];
    note = 'Using backend-authoritative trading rules for this game.';
  } else {
    if (tradeCountInput) {
      tradeCountInput.disabled = false;
    }
    tradeCount = getSelectedTradeCount();
    offsets = getTradeUnlockOffsets();
    note = tradeCountManuallyOverridden
      ? 'Manual override active (clamped to allowed limits).'
      : 'Auto default from round duration.';
  }

  if (tradeCountModeNoteEl) {
    tradeCountModeNoteEl.textContent = note;
  }

  if (tradeCount <= 0 || !offsets.length) {
    tradeSchedulePreviewEl.textContent =
      'Trade schedule: no trades in this round.';
    return;
  }

  const lines = offsets.map(
    (offset, idx) =>
      `Trade ${idx + 1} available at ${formatOffsetLabel(offset)}`
  );
  tradeSchedulePreviewEl.textContent = lines.join(' | ');
}

function syncTradeCountWithDuration({ forceDefault = false } = {}) {
  if (!tradeCountInput) return;

  const durationSeconds = getSelectedRoundDurationSecondsForTradingDefaults();
  const recommended = getDefaultTradeCount(durationSeconds);
  if (forceDefault || !tradeCountManuallyOverridden) {
    tradeCountInput.value = String(recommended);
  } else {
    tradeCountInput.value = String(
      clampTradeCount(Number(tradeCountInput.value))
    );
  }
  renderTradeSchedulePreview();
}

function shouldAutoStartAsyncSession() {
  return Boolean(asyncHostAutoStartCheckbox?.checked);
}

function updateAsyncHostControlsVisibility() {
  const isAsyncHost = getSelectedRoundType() === 'async';
  if (syncHostControlsEl) {
    syncHostControlsEl.hidden = isAsyncHost;
  }
  if (asyncHostControlsEl) {
    asyncHostControlsEl.hidden = !isAsyncHost;
  }
}

function setSelectedRoundType(roundType) {
  selectedSetupRoundType = roundType === 'async' ? 'async' : 'sync';
  if (roundTypeSyncInput) {
    roundTypeSyncInput.checked = selectedSetupRoundType === 'sync';
  }
  if (roundTypeAsyncInput) {
    roundTypeAsyncInput.checked = selectedSetupRoundType === 'async';
  }
  updateAsyncHostControlsVisibility();
}

function getCurrentRoundContext() {
  const gameMeta = getGameMeta(gameIdInput?.value);
  return computeCurrentRoundContext({
    gameMeta,
    selectedRoundType: getSelectedRoundType(),
    isStreamActive,
    latestGameStatus,
    setupRoundModeOverride,
    asyncSessionSupportProbe,
    sessionStartSupported,
  });
}

async function refreshAsyncDiagnostics({ force = false } = {}) {
  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  const gameId = String(gameIdInput?.value || '').trim();
  const playerId = String(playerIdInput?.value || '').trim();
  const gameMeta = getGameMeta(gameId);
  const roundMode = getRoundModeFromMeta(gameMeta);

  asyncWindowOpen = resolveAsyncWindowOpen(gameMeta);

  if (shouldResetAsyncDiagnostics({ baseUrl, gameId, roundMode })) {
    asyncSessionSupportProbe = null;
    asyncRequirePlayerAuth = 'unknown';
    updateSetupActionsState();
    return;
  }

  const probeKey = createAsyncDiagnosticsProbeKey({
    baseUrl,
    gameId,
    playerId,
  });
  const shouldSkipProbe = shouldSkipAsyncDiagnosticsProbe({
    force,
    probeKey,
    previousProbeKey: asyncDiagnosticsProbeKey,
    inFlight: asyncDiagnosticsProbeInFlight,
  });
  if (shouldSkipProbe) {
    if (!asyncDiagnosticsProbeInFlight) {
      updateSetupActionsState();
    }
    return;
  }

  asyncDiagnosticsProbeKey = probeKey;
  asyncDiagnosticsProbeInFlight = (async () => {
    const [sessionSupportResult, authResult] = await Promise.all([
      probeSessionSupport({ gameId, playerId }),
      playerId
        ? probeRequirePlayerAuth({ gameId, playerId })
        : Promise.resolve({ value: 'unknown', reason: 'missing-player-id' }),
    ]);

    asyncSessionSupportProbe =
      resolveSessionSupportProbeValue(sessionSupportResult);
    asyncRequirePlayerAuth = resolveRequirePlayerAuthValue(authResult);

    debugLog('async-diagnostics', 'probe results', {
      gameId,
      roundMode,
      windowOpen: asyncWindowOpen,
      sessionApiSupported: asyncSessionSupportProbe,
      requirePlayerAuth: asyncRequirePlayerAuth,
      sessionProbeCode: sessionSupportResult?.code ?? null,
      authProbeCode: authResult?.code ?? null,
    });
  })()
    .catch(() => {
      asyncSessionSupportProbe = null;
      asyncRequirePlayerAuth = 'unknown';
    })
    .finally(() => {
      asyncDiagnosticsProbeInFlight = null;
      updateSetupActionsState();
    });
}

function syncSetupShellState() {
  const roundContext = getCurrentRoundContext();
  const nextSetupState = buildSetupShellState({
    isStreamActive,
    isSetupBusy,
    latestGameStatus,
    roundMode: roundContext.roundMode,
    sessionStartSupported: roundContext.supportsSessionStart,
    sessionApiSupported: asyncSessionSupportProbe,
    asyncWindowOpen,
    requirePlayerAuth: asyncRequirePlayerAuth,
    activeSession,
    hostRoundType: getSelectedRoundType(),
    asyncHostAutoStart: shouldAutoStartAsyncSession(),
  });
  setSetupShellState(nextSetupState);
}

function setStartSessionStatus(message = '', type = 'info') {
  if (!startSessionStatusEl) return;
  startSessionStatusEl.textContent = message;
  startSessionStatusEl.className = buildStartSessionStatusClass(message, type);
}

function handleActiveSessionExpired() {
  if (!activeSession?.sessionId) {
    return;
  }

  // Clear session context first so subsequent UI updates use non-session paths.
  activeSession = null;

  // Session lifespan is reached: stop receiving live updates for this session
  // so the player does not keep seeing halving ticks beyond configured duration.
  cancelPendingUiRender();
  closeEventSourceIfOpen();
  stopLiveTimersAndHalving();
  stopSessionElapsedTimer({ resetDisplay: false, hideRoundHint: false });
  disconnectChat();

  isStreamActive = false;
  setLiveSessionActive(false);
  setBadgeStatus(connStatusEl, 'idle');
  setStartSessionStatus(
    'Session duration reached. Start Async Session to continue.',
    'warning'
  );
  showToast('Session ended at configured duration.', 'info');

  // Freeze session clock at 00 once no active session exists.
  if (countdownLabelEl) {
    countdownLabelEl.textContent = 'Session Left';
    countdownLabelEl.hidden = false;
  }
  if (countdownEl) {
    countdownEl.textContent = formatDurationCompact(0);
  }

  // Keep round-left countdown running independently after session expiry.
  startRoundRemainingHintTimer();

  updateSetupActionsState();
  renderDebugContext();

  // Show game-over overlay so the player is prompted to return to the lobby.
  // This is the primary path for async session expiry — the client-side elapsed
  // timer fires here before (or instead of) the backend's final SSE packet.
  const expiredGameId = String(gameIdInput?.value || '').trim();
  showGameOverOverlay(expiredGameId, {
    title: 'Session Finished',
    message:
      'Your async session has ended. Click anywhere to return to the login lobby.',
  });
}

function updateRoundRemainingHint() {
  if (!roundRemainingHintEl || !roundRemainingEl) return;

  const roundLeft = computeRoundRemainingSeconds(lastGameData);
  if (!Number.isFinite(roundLeft)) {
    roundRemainingHintEl.hidden = true;
    return;
  }

  roundRemainingEl.textContent = formatDurationCompact(roundLeft);
  roundRemainingHintEl.hidden = false;
}

function startRoundRemainingHintTimer() {
  if (roundRemainingHintInterval) {
    clearInterval(roundRemainingHintInterval);
    roundRemainingHintInterval = null;
  }
  updateRoundRemainingHint();
  roundRemainingHintInterval = setInterval(updateRoundRemainingHint, 500);
}

function stopRoundRemainingHintTimer(hide = true) {
  if (roundRemainingHintInterval) {
    clearInterval(roundRemainingHintInterval);
    roundRemainingHintInterval = null;
  }
  if (hide && roundRemainingHintEl) {
    roundRemainingHintEl.hidden = true;
  }
}

function stopSessionElapsedTimer({
  resetDisplay = true,
  hideRoundHint = true,
} = {}) {
  if (sessionElapsedInterval) {
    clearInterval(sessionElapsedInterval);
    sessionElapsedInterval = null;
  }
  sessionElapsedAnchorUnix = null;
  sessionElapsedSeedSeconds = 0;

  if (resetDisplay) {
    if (countdownLabelEl) {
      countdownLabelEl.textContent = 'Time Remaining';
      countdownLabelEl.hidden = false;
    }
    if (countdownEl) countdownEl.textContent = '-';
  }

  if (hideRoundHint) {
    stopRoundRemainingHintTimer(true);
  }
}

function startSessionElapsedTimer(sessionStartUnix, initialElapsedSeconds = 0) {
  const normalizedInputs = normalizeSessionTimerInputs(
    sessionStartUnix,
    initialElapsedSeconds
  );
  if (!normalizedInputs) return;

  const { normalizedStartUnix, nextInitialElapsed } = normalizedInputs;

  if (
    shouldReuseSessionElapsedTimer({
      sessionElapsedInterval,
      sessionElapsedAnchorUnix,
      normalizedStartUnix,
    })
  ) {
    sessionElapsedSeedSeconds = Math.max(
      sessionElapsedSeedSeconds,
      nextInitialElapsed
    );
    return;
  }

  stopSessionElapsedTimer();
  clearCountdownInterval();
  stopRoundRemainingHintTimer(false);

  sessionElapsedAnchorUnix = normalizedStartUnix;
  sessionElapsedSeedSeconds = nextInitialElapsed;

  const update = () => {
    const elapsed = computeElapsedSeconds({
      sessionElapsedSeedSeconds,
      sessionElapsedAnchorUnix,
    });

    const sessionDurationSec = Number(activeSession?.sessionDurationSec);
    if (
      isSessionExpired({
        sessionDurationSec,
        elapsedSeconds: elapsed,
      })
    ) {
      handleActiveSessionExpired();
      return;
    }

    // ── Primary header counter ──────────────────────────────────────────────
    // WHY: Session timer should count down remaining session lifetime.
    // Keep it compact for long sessions (h/d formatting).
    if (countdownLabelEl) {
      countdownLabelEl.textContent = 'Session Left';
      countdownLabelEl.hidden = false;
    }
    const sessionLeft = computeSessionLeftSeconds({
      sessionDurationSec,
      elapsedSeconds: elapsed,
    });
    countdownEl.textContent = formatDurationCompact(sessionLeft);

    // ── Secondary "Round left" indicator ───────────────────────────────────
    // WHY: The round carries on beyond the session. Halvings, scoring, and
    // the leaderboard all run until the *round* ends, not the session.
    // Showing this number prevents confusion when halvings still fire after
    // the session duration has elapsed.
    //
    // We read seconds_remaining from the most-recent stream payload
    // (lastGameData) and subtract the time that has passed since that payload
    // arrived so the display stays fresh between stream ticks.
    updateRoundRemainingHint();
  };

  update();
  sessionElapsedInterval = setInterval(update, 500);
}

function updateSetupActionsState() {
  initializeModules();
  syncSetupShellState();
  updateSetupShellActions();
}

function setSetupStateForTests({
  streamActive,
  gameStatus,
  setupBusy,
  roundMode,
  hostRoundType,
  asyncAutoStart,
  supportsSessionStart,
  sessionId,
  windowOpen,
  sessionApiSupported,
  requirePlayerAuth,
} = {}) {
  if (typeof streamActive === 'boolean') {
    isStreamActive = streamActive;
  }
  if (typeof gameStatus === 'string' || gameStatus === null) {
    latestGameStatus = gameStatus;
  }
  if (typeof setupBusy === 'boolean') {
    isSetupBusy = setupBusy;
  }
  if (roundMode === 'sync' || roundMode === 'async') {
    setupRoundModeOverride = roundMode;
  } else {
    setupRoundModeOverride = null;
  }
  if (hostRoundType === 'sync' || hostRoundType === 'async') {
    setSelectedRoundType(hostRoundType);
  }
  if (typeof asyncAutoStart === 'boolean' && asyncHostAutoStartCheckbox) {
    asyncHostAutoStartCheckbox.checked = asyncAutoStart;
  }
  if (typeof supportsSessionStart === 'boolean') {
    sessionStartSupported = supportsSessionStart;
  }
  if (typeof windowOpen === 'boolean' || windowOpen === null) {
    asyncWindowOpen = windowOpen;
  }
  if (
    typeof sessionApiSupported === 'boolean' ||
    sessionApiSupported === null
  ) {
    asyncSessionSupportProbe = sessionApiSupported;
  }
  if (
    requirePlayerAuth === true ||
    requirePlayerAuth === false ||
    requirePlayerAuth === 'unknown'
  ) {
    asyncRequirePlayerAuth = requirePlayerAuth;
  }
  if (sessionId === null) {
    activeSession = null;
  } else if (sessionId !== undefined) {
    activeSession = {
      sessionId,
      sessionStartUnix: activeSession?.sessionStartUnix || null,
      sessionDurationSec: activeSession?.sessionDurationSec || null,
      requiresPlayerAuth: Boolean(activeSession?.requiresPlayerAuth),
    };
  }
  updateSetupActionsState();
}

// P2.4: Duration resolution helper
function resolveDurationSeconds() {
  return resolveDurationSecondsFromInputs({
    durationPresetInput,
    durationCustomValueInput,
    durationCustomUnitInput,
  });
}

// P2.4: Collect optional overrides from advanced form
function collectAdvancedOverrides() {
  return collectAdvancedOverridesFromInputs({
    showAdvancedCheckbox,
    anchorTokenInput,
    anchorRateInput,
    seasonCyclesInput,
  });
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
  const rawBaseUrl = String(baseUrlInput?.value || '').trim();
  if (!rawBaseUrl && baseUrlInput) {
    baseUrlInput.value = DEFAULT_BACKEND_URL;
  }

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

      if (gameMeta.scoring_mode) {
        text += ` | Scoring: ${formatScoringModeName(gameMeta.scoring_mode)}`;
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

function readStoredLastPlayedGameSnapshot() {
  const raw = getStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function storeLastPlayedGameSnapshot(snapshot) {
  if (!snapshot) {
    setStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot, '');
    return;
  }

  setStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot, JSON.stringify(snapshot));
}

function renderLastFinishedGameSnapshot(snapshot) {
  lastFinishedGameSnapshot = snapshot || null;
  renderLastGameHighscores(lastFinishedGameSnapshot);
}

function captureLastPlayedGameSnapshot(data) {
  const snapshot = buildLastGameSnapshot({
    data,
    gameId: data?.game_id || gameIdInput?.value,
    scoringModeLabel: formatScoringModeName(resolveActiveScoringMode(data)),
  });

  if (!snapshot) {
    return null;
  }

  lastFinishedGameId = snapshot.gameId;
  renderLastFinishedGameSnapshot(snapshot);
  storeLastPlayedGameSnapshot(snapshot);
  return snapshot;
}

function showGameOverOverlay(gameId = '', options = {}) {
  if (!gameOverOverlayEl) {
    console.warn('[Game Over] Overlay element not found in DOM');
    return;
  }

  const normalizedGameId = String(gameId || '').trim();
  const title = String(options?.title || 'Game Over').trim() || 'Game Over';
  const message = String(options?.message || '').trim();

  console.log(
    '[Game Over] Showing overlay for game:',
    normalizedGameId,
    'Title:',
    title
  );

  if (gameOverTitleEl) {
    gameOverTitleEl.textContent = title;
  }
  if (gameOverMessageEl) {
    gameOverMessageEl.textContent =
      message ||
      (normalizedGameId
        ? `Round ${normalizedGameId} finished. Click anywhere to return to the login lobby.`
        : 'Round finished. Click anywhere to return to the login lobby.');
  }

  gameOverOverlayEl.hidden = false;
  console.log('[Game Over] Overlay is now visible');
}

function isGameOverOverlayEligible({
  previousGameStatus,
  gameStatus,
  gameId,
  currentGameId,
} = {}) {
  const normalizedPreviousStatus = String(previousGameStatus || '')
    .trim()
    .toLowerCase();
  const normalizedCurrentStatus = String(gameStatus || '')
    .trim()
    .toLowerCase();
  const normalizedGameId = String(gameId || '').trim();
  const normalizedCurrentGameId = String(currentGameId || '').trim();

  return (
    normalizedPreviousStatus === 'running' &&
    normalizedCurrentStatus === 'finished' &&
    Boolean(normalizedGameId) &&
    normalizedGameId === normalizedCurrentGameId
  );
}

function hideGameOverOverlay() {
  if (!gameOverOverlayEl) {
    return;
  }
  gameOverOverlayEl.hidden = true;
}

function resetLiveBoardState({ clearPlayerContext = false } = {}) {
  try {
    cancelPendingUiRender();
  } catch (e) {
    console.error('[Reset] Error canceling pending UI render:', e);
  }
  isStreamActive = false;
  latestGameStatus = null;
  activeSession = null;
  currentViewedGameId = '';
  _hasSeenPlayableStateForCurrentView = false;
  lastGameStatusForCurrentView = null;
  try {
    closeEventSourceIfOpen();
  } catch (e) {
    console.error('[Reset] Error closing event source:', e);
  }
  try {
    stopLiveTimersAndHalving();
  } catch (e) {
    console.error('[Reset] Error stopping live timers:', e);
  }
  try {
    disconnectChat();
  } catch (e) {
    console.error('[Reset] Error disconnecting chat:', e);
  }
  try {
    stopSessionElapsedTimer();
  } catch (e) {
    console.error('[Reset] Error stopping session timer:', e);
  }
  setBadgeStatus(connStatusEl, 'idle');
  setBadgeStatus(gameStatusEl, 'idle');
  stopCountdownTimer();
  lastGameData = null;
  resetPlayerStateView();
  resetSectionPlaceholder(leaderboardEl, 'Waiting for game data...');
  if (myScoreEl) myScoreEl.textContent = '—';
  if (myRankEl) myRankEl.textContent = '—';
  if (topScoreEl) topScoreEl.textContent = '—';
  resetSectionPlaceholder(upgradesEl, 'Waiting for upgrade data...');
  ensureInputsEditable();
  setLiveSessionActive(false);
  setStartSessionStatus('', 'info');

  if (clearPlayerContext) {
    if (gameIdInput) gameIdInput.value = '';
    if (playerIdInput) playerIdInput.value = '';
    setStorageItem(STORAGE_KEYS.gameId, '');
    setStorageItem(STORAGE_KEYS.playerId, '');
    syncActiveGameSelectFromInput();
  }

  updateSetupActionsState();
}

function _returnToPlayerPanel({
  clearPlayerContext = true,
  statusMessage = '',
} = {}) {
  resetLiveBoardState({ clearPlayerContext });
  setSetupCollapsed(false);

  if (statusMessage) {
    setActiveGamesStatus(statusMessage);
  }

  const returnTarget = activeGameSelectInput || playerReturnPanelEl;
  if (returnTarget?.scrollIntoView) {
    returnTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (returnTarget?.focus) {
    returnTarget.focus();
  }

  void refreshActiveGames({ notifyOnError: false });
}

function acknowledgeGameOverOverlay() {
  try {
    hideGameOverOverlay();
    resetLiveBoardState({ clearPlayerContext: true });
  } catch (error) {
    console.error('[Game Over] Failed to reset live board state:', error);
    // Fallback: ensure overlay is hidden and navigate anyway
    try {
      gameOverOverlayEl.hidden = true;
    } catch {
      // Ignore
    }
  }
  // Always attempt navigation, even if reset failed
  try {
    window.location.assign('/index.html');
  } catch (error) {
    console.error('[Game Over] Navigation failed:', error);
    // Last resort: use href
    window.location.href = '/index.html';
  }
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
  renderLivePortfolioValue(data, resolveActiveScoringMode(data));
}

function renderLeaderboard(data) {
  initializeModules();
  renderTopLeaderboard(data);
}

function formatActiveGameOptionLabel(game = {}) {
  const gameId = String(game?.game_id || '').trim();
  if (!gameId) {
    return 'Unknown game';
  }

  const status = String(game?.game_status || '')
    .trim()
    .toLowerCase();
  const playersCount = Number(game?.players_count || 0);
  const playersText = `${playersCount} player${playersCount === 1 ? '' : 's'}`;

  if (status === 'enrolling') {
    const remaining = Number(game?.enrollment_remaining_seconds || 0);
    return `${gameId} • enrolling • starts in ${formatDurationCompact(Math.max(0, remaining))} • ${playersText}`;
  }

  if (status === 'running') {
    const remaining = Number(game?.run_remaining_seconds || 0);
    return `${gameId} • running • ${formatDurationCompact(Math.max(0, remaining))} left • ${playersText}`;
  }

  return `${gameId} • ${status || 'unknown'} • ${playersText}`;
}

function setActiveGamesStatus(message) {
  if (!activeGameStatusEl) return;
  activeGameStatusEl.textContent = message;
}

function normalizeJoinableActiveGames(games = []) {
  return games.filter((game) => {
    const gameId = String(game?.game_id || '').trim();
    const status = String(game?.game_status || '')
      .trim()
      .toLowerCase();

    if (!gameId) {
      return false;
    }

    return status === 'enrolling' || status === 'running';
  });
}

function syncActiveGameSelectFromInput(games = []) {
  if (!activeGameSelectInput) return;
  const currentGameId = String(gameIdInput?.value || '').trim();
  const availableIdsFromGames = games
    .map((game) => String(game?.game_id || '').trim())
    .filter(Boolean);
  const availableIdsFromSelect = Array.from(activeGameSelectInput.options)
    .map((option) => String(option?.value || '').trim())
    .filter(Boolean);
  const availableGameIds = availableIdsFromGames.length
    ? availableIdsFromGames
    : availableIdsFromSelect;

  if (!currentGameId) {
    const [firstAvailableGameId] = availableGameIds;
    const normalizedFirstAvailableGameId = String(
      firstAvailableGameId || ''
    ).trim();

    if (normalizedFirstAvailableGameId) {
      activeGameSelectInput.value = normalizedFirstAvailableGameId;
      applySelectedActiveGame(normalizedFirstAvailableGameId, {
        notifyOnPlayerReset: false,
      });
      return;
    }

    activeGameSelectInput.value = '';
    return;
  }

  if (
    activeGamesById.has(currentGameId) ||
    availableGameIds.includes(currentGameId)
  ) {
    activeGameSelectInput.value = currentGameId;
    return;
  }

  const [firstActiveGameId] = availableGameIds.length
    ? availableGameIds
    : activeGamesById.keys();
  const normalizedFirstActiveGameId = String(firstActiveGameId || '').trim();

  if (normalizedFirstActiveGameId) {
    activeGameSelectInput.value = normalizedFirstActiveGameId;
    applySelectedActiveGame(normalizedFirstActiveGameId, {
      notifyOnPlayerReset: false,
    });
    return;
  }

  activeGameSelectInput.value = '';
}

function renderActiveGameOptions(games = []) {
  if (!activeGameSelectInput) return;

  const joinableGames = normalizeJoinableActiveGames(games);

  clearNode(activeGameSelectInput);
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent =
    joinableGames.length > 0
      ? 'Choose an active game...'
      : 'No joinable games found';
  activeGameSelectInput.appendChild(placeholderOption);

  joinableGames.forEach((game) => {
    const option = document.createElement('option');
    option.value = String(game.game_id || '').trim();
    option.textContent = formatActiveGameOptionLabel(game);
    activeGameSelectInput.appendChild(option);
  });

  syncActiveGameSelectFromInput(joinableGames);
}

async function fetchActiveGames(baseUrl) {
  const response = await fetch(`${baseUrl}/games/active`, {
    method: 'GET',
  });

  if (!response.ok) {
    const detail = await getApiErrorDetail(
      response,
      `${response.status} ${response.statusText}`
    );
    throw new Error(`Failed to load active games: ${detail}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload;
}

async function refreshActiveGames({ notifyOnError = true } = {}) {
  if (!activeGameSelectInput) {
    return [];
  }

  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    activeGamesById = new Map();
    renderActiveGameOptions([]);
    setActiveGamesStatus('Enter a valid backend URL to load joinable games.');
    return [];
  }

  try {
    const games = normalizeJoinableActiveGames(await fetchActiveGames(baseUrl));
    activeGamesById = new Map(
      games.map((game) => [String(game?.game_id || '').trim(), game])
    );
    renderActiveGameOptions(games);

    if (!games.length) {
      setActiveGamesStatus('There are no joinable games right now.');
    } else {
      setActiveGamesStatus(
        `Loaded ${games.length} active game${games.length === 1 ? '' : 's'}.`
      );
    }

    return games;
  } catch (error) {
    activeGamesById = new Map();
    renderActiveGameOptions([]);
    setActiveGamesStatus('Could not load joinable games.');
    if (notifyOnError) {
      showToast(error.message, 'error');
    }
    return [];
  }
}

function startActiveGamesAutoRefresh() {
  if (!activeGameSelectInput) {
    return;
  }
  if (activeGamesRefreshInterval) {
    clearInterval(activeGamesRefreshInterval);
  }
  activeGamesRefreshInterval = setInterval(() => {
    void refreshActiveGames({ notifyOnError: false });
  }, 10000);
}

function getRoundModeHintFromActiveGames(gameId) {
  const normalizedGameId = String(gameId || '').trim();
  if (!normalizedGameId) return null;
  const game = activeGamesById.get(normalizedGameId);
  const roundType = String(game?.round_type || '')
    .trim()
    .toLowerCase();
  if (roundType === 'asynchronous' || roundType === 'async') {
    return 'async';
  }
  if (roundType === 'synchronous' || roundType === 'sync') {
    return 'sync';
  }
  return null;
}

function resolveRequestedGameId() {
  const inputGameId = String(gameIdInput?.value || '').trim();
  const selectedGameId = String(activeGameSelectInput?.value || '').trim();
  const inputIsJoinable = inputGameId && activeGamesById.has(inputGameId);
  const selectedIsJoinable =
    selectedGameId && activeGamesById.has(selectedGameId);

  if (selectedIsJoinable && (!inputGameId || !inputIsJoinable)) {
    applySelectedActiveGame(selectedGameId, {
      notifyOnPlayerReset: false,
    });
    return selectedGameId;
  }

  if (inputGameId) {
    return inputGameId;
  }

  if (selectedIsJoinable) {
    applySelectedActiveGame(selectedGameId, {
      notifyOnPlayerReset: false,
    });
    return selectedGameId;
  }

  return '';
}

function applySelectedActiveGame(
  nextGameId,
  { notifyOnPlayerReset = true } = {}
) {
  const selectedGameId = String(nextGameId || '').trim();
  if (!selectedGameId) {
    return;
  }

  const previousGameId = String(gameIdInput?.value || '').trim();
  gameIdInput.value = selectedGameId;

  if (previousGameId && previousGameId !== selectedGameId && playerIdInput) {
    playerIdInput.value = '';
    setStorageItem(STORAGE_KEYS.playerId, '');
    if (notifyOnPlayerReset) {
      showToast(
        'Selected game changed. Cleared Player ID to avoid mismatch.',
        'info'
      );
    }
  }

  saveSettings();
}

function renderSeasonData(data) {
  initializeModules();
  renderSeasonCardData(data);
}

function saveSettings() {
  const baseUrlValue = String(baseUrlInput?.value || '').trim();
  const effectiveBaseUrl = baseUrlValue || DEFAULT_BACKEND_URL;
  if (baseUrlInput && !baseUrlValue) {
    baseUrlInput.value = effectiveBaseUrl;
  }

  setStorageItem(STORAGE_KEYS.baseUrl, effectiveBaseUrl);
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
  setStorageItem(STORAGE_KEYS.scoringMode, getSelectedScoringMode());
  setStorageItem(STORAGE_KEYS.tradeCount, String(getSelectedTradeCount()));
  setStorageItem(
    STORAGE_KEYS.tradeCountOverride,
    tradeCountManuallyOverridden ? 'true' : 'false'
  );
  setStorageItem(STORAGE_KEYS.roundType, getSelectedRoundType());
  setStorageItem(
    STORAGE_KEYS.asyncDurationPreset,
    asyncHostDurationPresetInput?.value || ASYNC_ROUND_DEFAULT_PRESET
  );
  setStorageItem(
    STORAGE_KEYS.asyncDurationCustomMinutes,
    asyncSessionDurationPresetInput?.value || ASYNC_SESSION_DEFAULT_PRESET
  );
  setStorageItem(
    STORAGE_KEYS.asyncAutoStart,
    shouldAutoStartAsyncSession() ? 'true' : 'false'
  );
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);
  syncActiveGameSelectFromInput();

  renderDebugContext();
  updateScoringModeUi();
  renderTradeSchedulePreview();
  updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

function initializeModules() {
  if (modulesInitialized) {
    return;
  }

  initSetupShell({
    gameIdInput,
    playerIdInput,
    startBtn,
    startSessionBtn,
    stopBtn,
    setupActionsNoteEl,
    roundModeBadgeEl,
    asyncSessionStatusEl,
    renderAsyncSessionBadge,
    startSessionStatusEl,
    debugToggleBtnEl,
    debugPanelEl,
    debugBackendUrlEl,
    debugGameIdEl,
    debugPlayerIdEl,
    debugSessionIdEl,
    setupShellEl,
    setupToggleBtnEl,
    jumpLiveBtnEl,
    jumpLiveBtnSetupEl,
    onStartAsyncSession: handleStartAsyncSession,
    roundTypeSyncInput,
    roundTypeAsyncInput,
    syncHostControlsEl,
    asyncHostControlsEl,
    asyncHostDurationPresetInput,
    asyncSessionDurationPresetInput,
    asyncHostAutoStartCheckbox,
    onHostRoundTypeChanged(nextRoundType) {
      setSelectedRoundType(nextRoundType);
      syncSessionDurationOptions({
        roundDurationInput: asyncHostDurationPresetInput,
        sessionDurationInput: asyncSessionDurationPresetInput,
        warningEl: sessionDurationWarningEl,
        enforceLimit: getSelectedRoundType() === 'async',
      });
      syncTradeCountWithDuration();
      updateSetupActionsState();
      saveSettings();
    },
    onHostAsyncDurationChanged() {
      // Keep the session dropdown in sync whenever the round duration changes:
      // disable options that would exceed the round and auto-clamp if needed.
      syncSessionDurationOptions({
        roundDurationInput: asyncHostDurationPresetInput,
        sessionDurationInput: asyncSessionDurationPresetInput,
        warningEl: sessionDurationWarningEl,
        enforceLimit: getSelectedRoundType() === 'async',
      });
      syncTradeCountWithDuration();
      updateAsyncHostControlsVisibility();
      updateSetupActionsState();
      saveSettings();
    },
    onHostAutoStartChanged() {
      updateSetupActionsState();
      saveSettings();
    },
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
    asyncSessionStatusEl,
    getGameMeta,
    defaultTokenNames: PLAYER_STATE_TOKENS,
  });
  initLeaderboard({ leaderboardEl });
  initLastGameHighscores({
    summaryEl: lastGameSummaryEl,
    listEl: lastGameHighscoresEl,
  });
  initSeasonCards({ getGameMeta });
  initMetaManager({
    onMetaChanged() {
      renderMetaDebugLine();
      renderDerivedEmissionPreview();
      if (lastGameData) {
        renderUpgradeMetrics(lastGameData);
      }
      updateScoringModeUi(lastGameData);
      void refreshAsyncDiagnostics({ force: true });
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
  initSeasonFocus({
    stripEl: seasonFocusStripEl,
    buttons: seasonFocusButtons,
    cards: seasonCards,
    defaultSeason: 'spring',
  });
  initLiveDrawer({
    rootEl: liveDrawerEl,
    backdropEl: liveDrawerBackdropEl,
    closeBtnEl: liveDrawerCloseBtnEl,
    tabButtons: [
      liveDrawerTabTradeEl,
      liveDrawerTabFarmEl,
      liveDrawerTabChatEl,
    ],
    panels: [
      liveDrawerPanelTradeEl,
      liveDrawerPanelFarmEl,
      liveDrawerPanelChatEl,
    ],
    openButtons: [
      tradeDrawerBtnEl,
      farmDrawerBtnEl,
      chatToggleBtnEl,
      chatDockBtnEl,
    ],
    defaultTab: 'trade',
    onStateChanged: handleLiveDrawerStateChange,
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
    onMessage: handleChatMessagePreview,
    onPanelVisibilityChanged(isOpen) {
      if (isOpen) {
        markChatAsRead();
      }
    },
    manageToggleInternally: false,
  });
  renderChatPreviewState();
  tradingPanelApi = initTradingPanel({
    getGameMeta,
    getLastGameData: () => lastGameData,
    getActiveScoringMode: () => resolveActiveScoringMode(lastGameData),
    tradingPanelRef: tradingPanelEl,
    tradingStatusRef: tradingStatusEl,
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
    getSessionStreamTicket,
    setBadgeStatus,
    connStatusEl,
    fetchMetaSnapshot,
    onData: updateUI,
    onSessionStreamError(message) {
      setStartSessionStatus(message, 'error');
      showToast(message, 'error');
    },
    onSessionStreamFinished(data) {
      const sessionStatus = String(data?.session?.status || '')
        .trim()
        .toLowerCase();
      console.log(
        '[Async Session] Stream finished, sessionStatus:',
        sessionStatus
      );
      if (sessionStatus !== 'finished') {
        console.log(
          '[Async Session] Session status is not "finished", skipping overlay'
        );
        return;
      }

      const finishedGameId = String(
        data?.game_id || gameIdInput?.value || ''
      ).trim();
      if (finishedGameId && finishedGameId !== lastFinishedGameId) {
        captureLastPlayedGameSnapshot(data);
      }

      console.log(
        '[Async Session] Showing game over overlay for async game:',
        finishedGameId
      );
      showGameOverOverlay(finishedGameId, {
        title: 'Session Finished',
        message:
          'Your async session has finished. Click anywhere to return to the login lobby.',
      });
      setStartSessionStatus(
        'Async session ended. Start a new session to continue.',
        'info'
      );
    },
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
    getPlayerName: () => playerNameInput.value.trim() || 'Player',
  });
  initSessionActions({
    getNormalizedBaseUrlOrNull,
    getStorageItem,
    getPlayerTokenStorageKey,
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
  const savedScoringMode = getStorageItem(STORAGE_KEYS.scoringMode);
  const savedRoundType = getStorageItem(STORAGE_KEYS.roundType);
  const savedTradeCount = getStorageItem(STORAGE_KEYS.tradeCount);
  const savedTradeCountOverride = getStorageItem(
    STORAGE_KEYS.tradeCountOverride
  );
  const savedAsyncDurationPreset = getStorageItem(
    STORAGE_KEYS.asyncDurationPreset
  );
  const savedAsyncDurationCustomMinutes = getStorageItem(
    STORAGE_KEYS.asyncDurationCustomMinutes
  );
  const savedAsyncAutoStart = getStorageItem(STORAGE_KEYS.asyncAutoStart);
  const savedGameId = getStorageItem(STORAGE_KEYS.gameId);
  const savedPlayerId = getStorageItem(STORAGE_KEYS.playerId);

  if (savedBaseUrl && String(savedBaseUrl).trim()) {
    baseUrlInput.value = String(savedBaseUrl).trim();
  } else if (baseUrlInput && !String(baseUrlInput.value || '').trim()) {
    baseUrlInput.value = DEFAULT_BACKEND_URL;
  }
  if (savedPlayerName) playerNameInput.value = savedPlayerName;
  if (savedDurationPreset) durationPresetInput.value = savedDurationPreset;
  if (savedDurationCustomValue)
    durationCustomValueInput.value = savedDurationCustomValue;
  if (savedDurationCustomUnit)
    durationCustomUnitInput.value = savedDurationCustomUnit;
  if (savedEnrollmentWindow)
    enrollmentWindowInput.value = savedEnrollmentWindow;
  setSelectedScoringMode(savedScoringMode || DEFAULT_SCORING_MODE);
  tradeCountManuallyOverridden = savedTradeCountOverride === 'true';
  if (savedTradeCount && tradeCountInput) {
    tradeCountInput.value = String(clampTradeCount(Number(savedTradeCount)));
  }
  if (savedAsyncDurationPreset && asyncHostDurationPresetInput) {
    asyncHostDurationPresetInput.value = savedAsyncDurationPreset;
  }
  if (savedAsyncDurationCustomMinutes && asyncSessionDurationPresetInput) {
    asyncSessionDurationPresetInput.value = savedAsyncDurationCustomMinutes;
  }
  if (savedAsyncAutoStart !== null && asyncHostAutoStartCheckbox) {
    asyncHostAutoStartCheckbox.checked = savedAsyncAutoStart !== 'false';
  }
  if (savedGameId) gameIdInput.value = savedGameId;
  if (savedPlayerId) playerIdInput.value = savedPlayerId;
  syncActiveGameSelectFromInput();
  if (savedGameId && savedPlayerId) {
    // Keep setup out of the way once the player already joined a game.
    setSetupCollapsed(true);
  }

  setSelectedRoundType(savedRoundType === 'async' ? 'async' : 'sync');
  updateAsyncHostControlsVisibility();
  updateScoringModeUi();
  syncTradeCountWithDuration({ forceDefault: !savedTradeCount });

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
  renderLastFinishedGameSnapshot(readStoredLastPlayedGameSnapshot());
  renderDebugContext();
  renderTradeSchedulePreview();
  updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

function applyUIUpdate(data) {
  const normalizedGameStatus = String(data?.game_status || '')
    .trim()
    .toLowerCase();
  const normalizedDataGameId = String(data?.game_id || '').trim();
  const isCurrentViewedGame =
    Boolean(normalizedDataGameId) &&
    normalizedDataGameId === currentViewedGameId;
  const previousGameStatusForCurrentView = lastGameStatusForCurrentView;

  if (isCurrentViewedGame) {
    // WHY: Only 'running' counts as having actually played a game.
    // 'enrolling' is a waiting-room state — the player has not played at all.
    // If the game jumps from enrolling directly to finished (e.g. cancelled or
    // too few players), showing the Game Over overlay would be wrong.
    if (normalizedGameStatus === 'running') {
      _hasSeenPlayableStateForCurrentView = true;
    }

    if (normalizedGameStatus) {
      lastGameStatusForCurrentView = normalizedGameStatus;
    }
  }

  const streamSession = data?.session || null;
  const sessionRenderState = deriveStreamSessionState({
    activeSession,
    streamSession,
  });

  // Keep frontend session state aligned with backend-truth from stream payload.
  // Only clear activeSession if the backend EXPLICITLY confirms the session ended or
  // a different session has taken over. If the payload simply doesn't include session
  // data yet (e.g. first tick after session creation), keep the local session intact
  // to avoid a false drop on startup.
  if (sessionRenderState.shouldClearActiveSession) {
    const clearReason = String(sessionRenderState.clearReason || '');
    activeSession = null;
    stopSessionElapsedTimer();
    setStartSessionStatus(
      'Async session ended. Start a new session to continue.',
      'info'
    );

    if (clearReason === 'ended') {
      const finishedGameId = String(
        data?.game_id || gameIdInput?.value || ''
      ).trim();
      if (finishedGameId) {
        captureLastPlayedGameSnapshot(data);
      }
      showGameOverOverlay(finishedGameId, {
        title: 'Session Finished',
        message:
          'Your async session has finished. Click anywhere to return to the login lobby.',
      });
    }
  }

  const hasActiveSession = sessionRenderState.hasActiveSession;

  if (hasActiveSession) {
    startSessionElapsedTimer(
      Number(activeSession.sessionStartUnix),
      Number.isFinite(sessionRenderState.elapsedFromPayload)
        ? sessionRenderState.elapsedFromPayload
        : 0
    );
  } else {
    stopSessionElapsedTimer();
  }

  setLiveSessionActive(hasActiveSession);
  handleLastHalvingStateUpdate(data);

  if (data.game_status) {
    setBadgeStatus(gameStatusEl, data.game_status);
    autoCollapseSetupForLiveState(data.game_status);

    const countdownMode = resolveCountdownMode({
      gameStatus: data.game_status,
      hasActiveSession,
    });

    if (countdownMode === 'session') {
      // Session timer is already updated above (using payload elapsed when available).
      // Avoid starting a second interval here, which can cause visible header jitter.
    } else if (countdownMode === 'enrolling') {
      countdownLabelEl.textContent = 'Game starts in';
      startEnrollmentCountdown();
    } else if (countdownMode === 'running') {
      countdownLabelEl.textContent = 'Time Remaining';
      startCountdownTimer();
    } else if (countdownMode === 'finished') {
      countdownLabelEl.textContent = 'Time Remaining';
      stopCountdownTimer();
      stopNextHalvingCountdown();
      const finishedGameId = String(
        data?.game_id || gameIdInput?.value || ''
      ).trim();
      if (finishedGameId) {
        const shouldCaptureSnapshot = finishedGameId !== lastFinishedGameId;
        const shouldShowOverlay = isGameOverOverlayEligible({
          previousGameStatus: previousGameStatusForCurrentView,
          gameStatus: data.game_status,
          gameId: finishedGameId,
          currentGameId: currentViewedGameId,
        });

        if (shouldCaptureSnapshot) {
          captureLastPlayedGameSnapshot(data);
        }

        if (shouldShowOverlay) {
          showGameOverOverlay(finishedGameId);
        } else {
          hideGameOverOverlay();
        }
      }
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
  updateScoringModeUi(data);
  renderTradeSchedulePreview();
  if (tradingPanelApi?.renderTradingStatus) {
    tradingPanelApi.renderTradingStatus();
  }
  updateSetupActionsState();
}

function cancelPendingUiRender() {
  if (pendingUiRenderFrame !== null) {
    cancelAnimationFrame(pendingUiRenderFrame);
    pendingUiRenderFrame = null;
  }
  pendingUiRenderData = null;
}

function updateUI(data) {
  const { stampedData, latestGameStatus: nextGameStatus } =
    stampIncomingUiData(data);
  lastGameData = stampedData;
  latestGameStatus = nextGameStatus;
  void refreshAsyncDiagnostics();

  pendingUiRenderData = stampedData;
  if (!shouldScheduleUiRender(pendingUiRenderFrame)) {
    return;
  }

  // WHY: Coalescing bursty SSE updates into one frame reduces flicker and keeps selection restore scoped to one DOM patch pass.
  pendingUiRenderFrame = requestAnimationFrame(() => {
    pendingUiRenderFrame = null;
    const frameData = pendingUiRenderData;
    pendingUiRenderData = null;
    if (!frameData) return;

    const selectionSnapshot = snapSelection(document.body);
    applyUIUpdate(frameData);
    restoreSelectionIfValid(selectionSnapshot);
  });
}

async function startLiveStream(gameId, playerId, options = {}) {
  const normalizedGameId = String(gameId || '').trim();
  currentViewedGameId = normalizedGameId;
  _hasSeenPlayableStateForCurrentView = false;
  lastGameStatusForCurrentView = null;
  hideGameOverOverlay();

  const sessionId = activeSession?.sessionId || null;

  startStream(gameId, playerId, {
    sessionId,
    requiresPlayerAuth: Boolean(activeSession?.requiresPlayerAuth),
    roundMode: getCurrentRoundContext().roundMode,
    forceSessionAttempt: Boolean(options.forceSessionAttempt),
  });
}

async function getApiErrorDetail(response, fallback) {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload.detail === 'string' &&
      payload.detail.trim()
    ) {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parse errors and keep fallback.
  }
  return fallback;
}

async function canReusePlayerForGame({ baseUrl, gameId, playerId }) {
  const normalizedGameId = String(gameId || '').trim();
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedGameId || !normalizedPlayerId) {
    return false;
  }

  const headers = {};
  const storedToken = getStorageItem(
    getPlayerTokenStorageKey(normalizedGameId, normalizedPlayerId)
  );
  if (storedToken) {
    headers['X-Player-Token'] = storedToken;
  }

  try {
    const response = await fetch(
      `${baseUrl}/games/${encodeURIComponent(normalizedGameId)}/state?player_id=${encodeURIComponent(normalizedPlayerId)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return (
      String(payload?.game_id || '') === normalizedGameId &&
      String(payload?.player_id || '') === normalizedPlayerId
    );
  } catch {
    return false;
  }
}

async function ensurePlayerJoinedForStream({ baseUrl, gameId, playerId }) {
  const normalizedGameId = String(gameId || '').trim();
  const existingPlayerId = String(playerId || '').trim();

  if (!normalizedGameId) {
    throw new Error('Enter a game ID before starting the stream.');
  }

  if (existingPlayerId) {
    const canReuse = await canReusePlayerForGame({
      baseUrl,
      gameId: normalizedGameId,
      playerId: existingPlayerId,
    });
    if (canReuse) {
      return existingPlayerId;
    }

    // Existing player id does not belong to the selected game anymore.
    playerIdInput.value = '';
    setStorageItem(STORAGE_KEYS.playerId, '');
  }

  const playerName = String(playerNameInput?.value || '').trim() || 'Player';
  const joinResponse = await fetch(
    `${baseUrl}/games/${encodeURIComponent(normalizedGameId)}/join`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playerName }),
    }
  );

  if (!joinResponse.ok) {
    const detail = await getApiErrorDetail(
      joinResponse,
      `${joinResponse.status} ${joinResponse.statusText}`
    );
    throw new Error(`Join failed: ${detail}`);
  }

  const joinData = await joinResponse.json();
  const joinedPlayerId = String(joinData?.player_id || '').trim();
  if (!joinedPlayerId) {
    throw new Error('Join succeeded but no player_id was returned.');
  }

  playerIdInput.value = joinedPlayerId;
  if (joinData.player_token) {
    setStorageItem(
      getPlayerTokenStorageKey(normalizedGameId, joinedPlayerId),
      joinData.player_token
    );
  }
  setStorageItem(STORAGE_KEYS.gameId, normalizedGameId);
  setStorageItem(STORAGE_KEYS.playerId, joinedPlayerId);
  setSetupCollapsed(true);

  return joinedPlayerId;
}

async function startAsyncSessionForGame({ gameId, playerId }) {
  setStartSessionStatus('Starting async session...', 'info');
  isSetupBusy = true;
  updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });

  // WHY: Session creation is explicit and backend-authoritative; stream transport must only switch after valid session metadata.
  const result = await createAsyncSession({ gameId, playerId });
  if (!result.ok) {
    isSetupBusy = false;

    const normalizedFailure = normalizeAsyncSessionStartFailure(result);
    setStartSessionStatus(
      normalizedFailure.message,
      normalizedFailure.statusType
    );
    if (normalizedFailure.nextLatestGameStatus) {
      latestGameStatus = normalizedFailure.nextLatestGameStatus;
    }
    updateSetupActionsState();
    return normalizedFailure.response;
  }

  activeSession = buildActiveSessionFromResult(result);
  sessionStartSupported = true;
  renderDebugContext();
  setStartSessionStatus('Async session started.', 'success');

  isSetupBusy = false;
  updateSetupActionsState();

  await startLiveStream(gameId, playerId, { forceSessionAttempt: true });
  setSetupCollapsed(true);
  return { ok: true, sessionId: result.sessionId };
}

async function handleStartAsyncSession() {
  const gameId = resolveRequestedGameId();
  const existingPlayerId = playerIdInput.value;
  const baseUrl = getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }

  if (!gameId) {
    setStartSessionStatus(
      'Choose an active game before starting a session.',
      'error'
    );
    return;
  }

  let playerId;
  try {
    playerId = await ensurePlayerJoinedForStream({
      baseUrl,
      gameId,
      playerId: existingPlayerId,
    });
  } catch (error) {
    showToast(error.message, 'error');
    setStartSessionStatus(error.message, 'error');
    return;
  }

  await startAsyncSessionForGame({ gameId, playerId });
}

async function handleStartGameFlow() {
  const gameId = resolveRequestedGameId();
  const existingPlayerId = playerIdInput.value;
  const baseUrl = getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }

  if (!gameId) {
    showToast('Choose an active game before entering the game.', 'error');
    return;
  }

  let playerId;
  try {
    playerId = await ensurePlayerJoinedForStream({
      baseUrl,
      gameId,
      playerId: existingPlayerId,
    });
  } catch (error) {
    showToast(error.message, 'error');
    return;
  }

  cleanupGameMetaCache();
  markGameMetaSeen(gameId);

  try {
    await fetchMetaSnapshot(baseUrl, gameId);
  } catch (e) {
    console.warn('Initial meta fetch failed before stream start:', e);
  }

  const roundMode =
    getRoundModeHintFromActiveGames(gameId) ||
    getCurrentRoundContext().roundMode;
  if (roundMode === 'async' && !activeSession?.sessionId) {
    await startAsyncSessionForGame({ gameId, playerId });
    return;
  }

  await startLiveStream(gameId, playerId, { forceSessionAttempt: false });
  setSetupCollapsed(true);
}

async function runStartGameFlowSafely({ source = 'manual' } = {}) {
  try {
    await handleStartGameFlow();
  } catch (error) {
    const detail = String(error?.message || error || 'Unknown error');
    console.error(`[Start Flow][${source}] Unhandled error:`, error);
    showToast(`Could not start game: ${detail}`, 'error');
    isSetupBusy = false;
    updateSetupActionsState();
  }
}

if (startBtn) {
  startBtn.addEventListener('click', async () => {
    await runStartGameFlowSafely({ source: 'start-button' });
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    hideGameOverOverlay();
    resetLiveBoardState();
  });
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
    syncTradeCountWithDuration();
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

baseUrlInput?.addEventListener('change', () => {
  saveSettings();
  void refreshActiveGames({ notifyOnError: false });
});
playerNameInput?.addEventListener('change', saveSettings);
durationCustomValueInput?.addEventListener('change', () => {
  syncTradeCountWithDuration();
  saveSettings();
});
durationCustomUnitInput?.addEventListener('change', () => {
  syncTradeCountWithDuration();
  saveSettings();
});
enrollmentWindowInput?.addEventListener('change', saveSettings);
tradeCountInput?.setAttribute('min', String(TRADE_COUNT_LIMITS.min));
tradeCountInput?.setAttribute('max', String(TRADE_COUNT_LIMITS.max));
tradeCountInput?.addEventListener('change', () => {
  tradeCountManuallyOverridden = true;
  if (tradeCountInput) {
    tradeCountInput.value = String(
      clampTradeCount(Number(tradeCountInput.value))
    );
  }
  renderTradeSchedulePreview();
  saveSettings();
});
gameIdInput?.addEventListener('change', saveSettings);
activeGameSelectInput?.addEventListener('change', () => {
  hideGameOverOverlay();
  applySelectedActiveGame(activeGameSelectInput.value);
});
refreshActiveGamesBtn?.addEventListener('click', () => {
  void refreshActiveGames({ notifyOnError: true });
});

gameOverOverlayEl?.addEventListener('click', () => {
  acknowledgeGameOverOverlay();
});

gameOverOverlayEl?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    acknowledgeGameOverOverlay();
  }
});
playerIdInput?.addEventListener('change', saveSettings);
anchorTokenInput?.addEventListener('change', saveSettings);
anchorRateInput?.addEventListener('change', saveSettings);
seasonCyclesInput?.addEventListener('change', saveSettings);
scoringModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    updateScoringModeUi();
    saveSettings();
  });
});
gameIdInput?.addEventListener('input', updateSetupActionsState);

document.addEventListener('DOMContentLoaded', async () => {
  initializeModules();
  initializeHeaderInteractions();
  ensureInputsEditable();
  loadSettings();
  // Apply the session-duration guard immediately after settings are restored
  // so the dropdown reflects the saved round duration on first render.
  syncSessionDurationOptions({
    roundDurationInput: asyncHostDurationPresetInput,
    sessionDurationInput: asyncSessionDurationPresetInput,
    warningEl: sessionDurationWarningEl,
    enforceLimit: getSelectedRoundType() === 'async',
  });
  syncTradeCountWithDuration({ forceDefault: !tradeCountManuallyOverridden });
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
  await refreshActiveGames({ notifyOnError: false });
  startActiveGamesAutoRefresh();
  updateScoringModeUi();
  void refreshAsyncDiagnostics({ force: true });
  updateSetupActionsState();

  const params = new URLSearchParams(window.location.search);
  const shouldAutostart = params.get('autostart') === '1';
  if (shouldAutostart && String(gameIdInput?.value || '').trim()) {
    await runStartGameFlowSafely({ source: 'autostart' });
    params.delete('autostart');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }
});

export {
  collectAdvancedOverrides,
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
  formatActiveGameOptionLabel,
  normalizeJoinableActiveGames,
  renderActiveGameOptions,
  resolveRequestedGameId,
  renderSeasonData,
  computePortfolioValue,
  renderPortfolioValue,
  renderUpgradeMetrics,
  setActiveMeta,
  setSetupStateForTests,
  updateSetupActionsState,
  ensurePlayerJoinedForStream,
  handleStartAsyncSession,
  setSetupCollapsed,
  toggleSetupCollapsed,
  autoCollapseSetupForLiveState,
  scrollToLiveBoard,
  captureLastPlayedGameSnapshot,
  showGameOverOverlay,
  hideGameOverOverlay,
  acknowledgeGameOverOverlay,
  isGameOverOverlayEligible,
};

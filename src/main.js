/**
File: src/main.js
Purpose: Composition root of the player board (player.html): looks up the DOM,
  wires the player-board modules together and runs the page bootstrap.
Key responsibilities:
- Initialize the board modules (state application, setup flow, game-over,
  session clock, chat preview, settings) with their DOM elements and
  callbacks, and lazily initialize the render modules (initializeModules).
- Connect the stream controller, game actions and session actions to the
  board, and handle DOMContentLoaded (settings, meta fetch, autostart).
- Re-export the symbols the page-level tests import from './main.js'.
Module map (details in CODE_ORGANIZATION.md):
- board-dom.js (element lookup), board-state.js (shared mutable state),
  board-update.js (stream payload -> UI), setup-controller.js / setup-settings.js
  / setup-host-controls.js (setup shell, persistence, legacy host controls),
  start-flow.js + services/player-join.js (enter game / start session),
  session-clock.js, live-board-lifecycle.js, game-over.js, chat-preview.js,
  meta-debug.js, scoring-mode-ui.js.
Invariants:
- Frontend remains display/intent only; backend stays authoritative for deterministic session policy and timing.
- Core gameplay stays inline; only the end-of-game return overlay may block input after a round finishes.
- Desktop core view must avoid page scroll; only internal panels may scroll.
Security notes:
- Use safe DOM APIs only and never render untrusted HTML.
- Encode ids in URLs and never surface player tokens in UI.
Dependencies:
- Browser fetch/EventSource/localStorage APIs and backend HTTP endpoints.
Last updated: 2026-10-08
Author/Owner: Frontend Team

Manual QA (P2 Seasonal Oracle)
1) Create game and join player.
2) Confirm 4 balances are visible (spring/summer/autumn/winter).
3) Confirm oracle prices are visible.
4) Select upgrade_type=efficiency, target_token=summer, pay_token=winter.
5) Submit upgrade; verify winter balance decreases and summer efficiency increases after refresh.
6) Switch pay_token and verify preview updates.
7) Force unsupported api_contract_version (> max) and verify upgrades are disabled with out-of-date message.

Manual QA (P2.4 Duration Presets & Overrides)
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

import './style.css';
import {
  DEFAULT_TOKEN_NAMES,
  computePayCostPreview,
  formatCompactNumber,
  normalizeTokenNames,
} from './utils/token-utils.js';
import {
  getPlayerTokenStorageKey,
  getStorageItem,
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
import { initCountdown, clearCountdownInterval } from './ui/countdown.js';
import {
  initHalvingDisplay,
  resetTransientHalvingState,
  stopNextHalvingCountdown,
  computeNextHalvingHint,
  resolveNextHalvingTarget,
  shouldResetNextHalvingCountdownTarget,
} from './ui/halving-display.js';
import { initEventDisplay } from './ui/event-display.js';
import {
  initMetaManager,
  getGameMeta,
  isContractVersionSupported,
  isActiveContractSupported,
  getActiveUpgradeDefinitions,
  setActiveMeta as setActiveMetaState,
  fetchMetaSnapshot,
} from './meta/meta-manager.js';
import { initPlayerView } from './ui/player-view.js';
import {
  initSetupShell,
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
import { ensureToastRegions, showToast } from './ui/toast.js';
import { initStandingsStatus } from './ui/standings-status.js';
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
  initInlineUpgrades,
  renderAllSeasonUpgrades,
} from './ui/upgrade-panel-inline.js';
import {
  initChatPanel,
  connectChat,
  disconnectChat,
  isChatEnabledForRound,
} from './ui/chat-panel.js';
import { initTradingPanel } from './ui/trading-panel.js';
import { initFarmingPanel } from './ui/farming-panel.js';
import { initLiveDrawer } from './ui/live-drawer.js';
import { initSeasonFocus } from './ui/season-focus.js';
import { initStreamController } from './services/stream-controller.js';
import {
  initGameActions,
  performFarmDeposit,
  performFarmWithdraw,
  performTrade,
  performUpgrade,
} from './services/game-actions.js';
import {
  initSessionActions,
  getStreamTicket,
} from './services/session-actions.js';
import {
  initPlayerJoin,
  ensurePlayerJoinedForStream,
} from './services/player-join.js';
import { queryPlayerBoardDom } from './ui/board-dom.js';
import { boardState } from './ui/board-state.js';
import {
  initBoardUpdate,
  applyFarmUpdated,
  applyTradeExecuted,
  cancelPendingUiRender,
  showSessionFinishedOverlay,
  updateUI,
} from './ui/board-update.js';
import {
  initChatPreview,
  handleChatAvailabilityChange,
  handleChatMessagePreview,
  handleLiveDrawerStateChange,
  markChatAsRead,
  renderChatPreviewState,
} from './ui/chat-preview.js';
import {
  initGameOver,
  acknowledgeGameOverOverlay,
  captureLastPlayedGameSnapshot,
  hideGameOverOverlay,
  isGameOverOverlayEligible,
  showGameOverOverlay,
  wireGameOverOverlayEvents,
} from './ui/game-over.js';
import {
  initLiveBoardLifecycle,
  getPlayerActionAvailability,
  handleActiveSessionExpired,
  resetLiveBoardState,
} from './ui/live-board-lifecycle.js';
import {
  initMetaDebug,
  renderDerivedEmissionPreview,
  renderMetaDebugLine,
} from './ui/meta-debug.js';
import {
  initScoringModeUi,
  resolveActiveScoringMode,
  updateScoringModeUi,
} from './ui/scoring-mode-ui.js';
import { initSessionClock } from './ui/session-clock.js';
import {
  initSetupController,
  getNormalizedBaseUrlOrNull,
  refreshAsyncDiagnostics,
  setSetupStateForTests,
  setStartSessionStatus,
  syncSetupShellState,
} from './ui/setup-controller.js';
import {
  initSetupHostControls,
  applyGameConfigToHostControls,
  collectAdvancedOverrides,
  isTradeCountManuallyOverridden,
  setSelectedRoundType,
  syncHostSessionDurationOptions,
  syncTradeCountWithDuration,
  updateAsyncHostControlsVisibility,
  wireHostControlEvents,
} from './ui/setup-host-controls.js';
import {
  initSetupSettings,
  loadSettings,
  saveSettings,
  wireSettingsPersistence,
} from './ui/setup-settings.js';
import {
  initStartFlow,
  handleStartAsyncSession,
  resolveRequestedGameId,
  runAutostartIfRequested,
  runStartGameFlowSafely,
} from './ui/start-flow.js';

const dom = queryPlayerBoardDom();
const {
  gameIdInput,
  playerIdInput,
  playerNameInput,
  startBtn,
  stopBtn,
  connStatusEl,
} = dom;
const PLAYER_STATE_TOKENS = [...DEFAULT_TOKEN_NAMES];

let modulesInitialized = false;
let tradingPanelApi = null;
let farmingPanelApi = null;

// ── Lazy-init wrappers ─────────────────────────────────────────────────────
// WHY: tests (and early callbacks) may call these before DOMContentLoaded, so
// each one makes sure the render modules are initialized first.

function setActiveMeta(meta) {
  initializeModules();
  setActiveMetaState(meta);
  void refreshAsyncDiagnostics({ force: true });
}

function updateSetupActionsState() {
  initializeModules();
  syncSetupShellState();
  updateSetupShellActions();
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

function renderSeasonData(data) {
  initializeModules();
  renderSeasonCardData(data);
}

function renderUpgradeMetrics(data) {
  initializeModules();
  renderAllSeasonUpgrades(data, getGameMeta);
}

function ensureInputsEditable() {
  initializeModules();
  ensureSetupInputsEditable();
}

// ── Board modules (wired at import time, like the former inline code) ──────

initScoringModeUi(dom);
initSetupHostControls(dom);
initChatPreview(dom);
initMetaDebug({ ...dom, tokens: PLAYER_STATE_TOKENS });
initSetupController({ ...dom, updateSetupActionsState });
initSetupSettings({
  ...dom,
  renderDebugContext,
  updateSetupActionsState,
  setSetupCollapsed,
});
initSessionClock({ ...dom, onSessionExpired: handleActiveSessionExpired });
initGameOver({ ...dom, resetLiveBoardState });
initLiveBoardLifecycle({
  ...dom,
  cancelPendingUiRender,
  renderLeaderboard,
  ensureInputsEditable,
  updateSetupActionsState,
  renderDebugContext,
  getPanelApis: () => ({ tradingPanelApi, farmingPanelApi }),
});
initBoardUpdate({
  ...dom,
  renderSeasonData,
  renderUpgradeMetrics,
  renderLeaderboard,
  renderQuickStats,
  renderPortfolioValue,
  autoCollapseSetupForLiveState,
  updateSetupActionsState,
});
initPlayerJoin({
  getPlayerName: () => playerNameInput?.value,
  setPlayerId: (playerId) => {
    playerIdInput.value = playerId;
  },
  onJoined: () => setSetupCollapsed(true),
});
initStartFlow({
  ...dom,
  updateSetupActionsState,
  renderDebugContext,
  setSetupCollapsed,
});

/** Host-control callbacks of the setup shell (legacy, hidden on player.html). */
function handleHostRoundTypeChanged(nextRoundType) {
  setSelectedRoundType(nextRoundType);
  syncHostSessionDurationOptions();
  syncTradeCountWithDuration();
  updateSetupActionsState();
  saveSettings();
}

function handleHostAsyncDurationChanged() {
  // Keep the session dropdown in sync whenever the round duration changes:
  // disable options that would exceed the round and auto-clamp if needed.
  syncHostSessionDurationOptions();
  syncTradeCountWithDuration();
  updateAsyncHostControlsVisibility();
  updateSetupActionsState();
  saveSettings();
}

function initLiveToolsWindow() {
  initLiveDrawer({
    rootEl: dom.liveDrawerEl,
    backdropEl: dom.liveDrawerBackdropEl,
    closeBtnEl: dom.liveDrawerCloseBtnEl,
    tabButtons: [
      dom.liveDrawerTabTradeEl,
      dom.liveDrawerTabFarmEl,
      dom.liveDrawerTabChatEl,
      dom.liveDrawerTabLeaderboardEl,
    ],
    panels: [
      dom.liveDrawerPanelTradeEl,
      dom.liveDrawerPanelFarmEl,
      dom.liveDrawerPanelChatEl,
      dom.liveDrawerPanelLeaderboardEl,
    ],
    openButtons: [
      dom.tradeDrawerBtnEl,
      dom.farmDrawerBtnEl,
      dom.chatToggleBtnEl,
      dom.chatDockBtnEl,
      dom.leaderboardDrawerBtnEl,
    ],
    defaultTab: 'trade',
    onStateChanged: handleLiveDrawerStateChange,
  });
  initChatPanel({
    panelEl: dom.chatPanelEl,
    toggleBtnEl: dom.chatToggleBtnEl,
    messagesEl: dom.chatMessagesEl,
    formEl: dom.chatFormEl,
    inputEl: dom.chatInputEl,
    statusEl: dom.chatStatusEl,
    disabledNoteEl: dom.chatDisabledNoteEl,
    // `chat_enabled` from the round's game meta (fetched before the stream
    // starts); missing = enabled, as with older backends.
    isChatEnabled: () => isChatEnabledForRound(getGameMeta(gameIdInput?.value)),
    onAvailabilityChange: handleChatAvailabilityChange,
    getBaseUrl: () => getNormalizedBaseUrlOrNull({ notify: false }),
    getGameId: () => gameIdInput.value,
    getPlayerId: () => playerIdInput.value,
    getPlayerName: () => playerNameInput.value,
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
    // Bind current gameId so the panel resolves the correct meta object.
    getGameMeta: () => getGameMeta(gameIdInput?.value),
    getLastGameData: () => boardState.lastGameData,
    getActiveScoringMode: () =>
      resolveActiveScoringMode(boardState.lastGameData),
    executeTrade: async ({ fromToken, toToken, amount }) =>
      performTrade(fromToken, toToken, amount),
    showToast,
    getActionAvailability: getPlayerActionAvailability,
    tradingPanelRef: dom.tradingPanelEl,
    tradingStatusRef: dom.tradingStatusEl,
  });
  farmingPanelApi = initFarmingPanel({
    getGameMeta: () => getGameMeta(gameIdInput?.value),
    getLastGameData: () => boardState.lastGameData,
    getActionAvailability: getPlayerActionAvailability,
    depositFarm: async ({ token, amount }) => performFarmDeposit(token, amount),
    withdrawFarm: async ({ token, amount }) =>
      performFarmWithdraw(token, amount),
    showToast,
    farmingPanelRef: dom.farmingPanelEl,
    farmingStatusRef: dom.farmingStatusEl,
  });
}

function handleSessionStreamFinished(data) {
  const sessionStatus = String(data?.session?.status || '')
    .trim()
    .toLowerCase();
  if (sessionStatus !== 'finished') {
    return;
  }

  const finishedGameId = String(
    data?.game_id || gameIdInput?.value || ''
  ).trim();
  if (finishedGameId && finishedGameId !== boardState.lastFinishedGameId) {
    captureLastPlayedGameSnapshot(data);
  }

  showSessionFinishedOverlay(finishedGameId);
  setStartSessionStatus(
    'Async session ended. Start a new session to continue.',
    'info'
  );
}

function initNetworkServices() {
  initStreamController({
    clearCountdownInterval,
    stopNextHalvingCountdown,
    stopSeasonHalvingTimers,
    resetTransientHalvingState,
    onStreamStateChange(next) {
      boardState.isStreamActive = next;
    },
    updateSetupActionsState,
    getNormalizedBaseUrlOrNull,
    connectChat,
    getStorageItem,
    getPlayerTokenStorageKey,
    getStreamTicket,
    setBadgeStatus,
    connStatusEl,
    fetchMetaSnapshot,
    onData: updateUI,
    onSessionStreamError(message) {
      setStartSessionStatus(message, 'error');
      showToast(message, 'error');
    },
    onSessionStreamFinished: handleSessionStreamFinished,
    disconnectChat,
    onGameStatusChange(next) {
      boardState.latestGameStatus = next;
    },
  });
  initGameActions({
    isActiveContractSupported,
    showToast,
    getLastGameData: () => boardState.lastGameData,
    getNormalizedBaseUrlOrNull,
    getStorageItem,
    getPlayerTokenStorageKey,
    onTradeExecuted: applyTradeExecuted,
    onFarmUpdated: applyFarmUpdated,
  });
  initSessionActions({
    getNormalizedBaseUrlOrNull,
    getStorageItem,
    getPlayerTokenStorageKey,
  });
}

function initializeModules() {
  if (modulesInitialized) {
    return;
  }

  initSetupShell({
    gameIdInput,
    playerIdInput,
    startBtn,
    startSessionBtn: dom.startSessionBtn,
    stopBtn,
    setupActionsNoteEl: dom.setupActionsNoteEl,
    roundModeBadgeEl: dom.roundModeBadgeEl,
    asyncSessionStatusEl: dom.asyncSessionStatusEl,
    renderAsyncSessionBadge,
    startSessionStatusEl: dom.startSessionStatusEl,
    debugToggleBtnEl: dom.debugToggleBtnEl,
    debugPanelEl: dom.debugPanelEl,
    debugBackendUrlEl: dom.debugBackendUrlEl,
    debugGameIdEl: dom.debugGameIdEl,
    debugPlayerIdEl: dom.debugPlayerIdEl,
    debugSessionIdEl: dom.debugSessionIdEl,
    setupShellEl: dom.setupShellEl,
    setupToggleBtnEl: dom.setupToggleBtnEl,
    jumpLiveBtnEl: dom.jumpLiveBtnEl,
    jumpLiveBtnSetupEl: dom.jumpLiveBtnSetupEl,
    onStartAsyncSession: handleStartAsyncSession,
    roundTypeSyncInput: dom.roundTypeSyncInput,
    roundTypeAsyncInput: dom.roundTypeAsyncInput,
    syncHostControlsEl: dom.syncHostControlsEl,
    asyncHostControlsEl: dom.asyncHostControlsEl,
    asyncHostDurationPresetInput: dom.asyncHostDurationPresetInput,
    asyncSessionDurationPresetInput: dom.asyncSessionDurationPresetInput,
    asyncHostAutoStartCheckbox: dom.asyncHostAutoStartCheckbox,
    onHostRoundTypeChanged: handleHostRoundTypeChanged,
    onHostAsyncDurationChanged: handleHostAsyncDurationChanged,
    onHostAutoStartChanged() {
      updateSetupActionsState();
      saveSettings();
    },
    liveBoardEl: dom.liveBoardEl,
    editableInputs: dom.editableInputs,
  });
  initCountdown(
    { countdownEl: dom.countdownEl, countdownLabelEl: dom.countdownLabelEl },
    { get: () => boardState.lastGameData }
  );
  initHalvingDisplay({ getActiveGameMeta: getGameMeta });
  initEventDisplay({
    seasonScrollEl: dom.seasonScrollEl,
    getActiveGameMeta: getGameMeta,
  });
  initLiveSummary({
    myScoreEl: dom.myScoreEl,
    myRankEl: dom.myRankEl,
    topScoreEl: dom.topScoreEl,
    portfolioValueEl: dom.portfolioValueEl,
    asyncSessionStatusEl: dom.asyncSessionStatusEl,
    getGameMeta,
    defaultTokenNames: PLAYER_STATE_TOKENS,
  });
  initLeaderboard({ leaderboardEl: dom.leaderboardEl });
  initStandingsStatus({
    headerTagEl: dom.standingsStatusEl,
    panelNoteEl: dom.leaderboardStandingsStatusEl,
  });
  // Live regions must exist before the first toast so it is announced.
  ensureToastRegions();
  initSeasonCards({ getGameMeta });
  initMetaManager({
    onMetaChanged() {
      renderMetaDebugLine();
      renderDerivedEmissionPreview();
      if (boardState.lastGameData) {
        renderUpgradeMetrics(boardState.lastGameData);
      }
      updateScoringModeUi(boardState.lastGameData);
      // Round meta carries the farming rules (enabled, cycle, reward).
      farmingPanelApi?.renderFarmingStatus?.();
      void refreshAsyncDiagnostics({ force: true });
    },
    showToast,
  });
  initPlayerView({
    playerStateEl: dom.playerStateEl,
    getActiveGameMeta: getGameMeta,
  });
  initInlineUpgrades({
    getActiveGameMeta: getGameMeta,
    isActiveContractSupported,
    getActiveUpgradeDefinitions,
    performUpgrade,
    getActionAvailability: getPlayerActionAvailability,
  });
  initSeasonFocus({
    stripEl: dom.seasonFocusStripEl,
    buttons: dom.seasonFocusButtons,
    cards: dom.seasonCards,
    defaultSeason: 'spring',
  });
  initLiveToolsWindow();
  initNetworkServices();

  modulesInitialized = true;
}

// ── Event wiring (at import time, before DOMContentLoaded) ─────────────────

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

wireHostControlEvents({ onSettingsChanged: saveSettings });
wireSettingsPersistence();
wireGameOverOverlayEvents();

document.addEventListener('DOMContentLoaded', async () => {
  initializeModules();
  initializeHeaderInteractions();
  ensureInputsEditable();
  applyGameConfigToHostControls();
  loadSettings();
  // Apply the session-duration guard immediately after settings are restored
  // so the dropdown reflects the saved round duration on first render.
  syncHostSessionDurationOptions();
  syncTradeCountWithDuration({
    forceDefault: !isTradeCountManuallyOverridden(),
  });
  cleanupGameMetaCache();
  markGameMetaSeen(gameIdInput.value || null);
  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    // Keep UI usable even if a previously stored URL is malformed.
    return;
  }
  try {
    await fetchMetaSnapshot(baseUrl, gameIdInput.value || null);
    // /meta may carry an admin-edited game_config; refresh the host controls.
    applyGameConfigToHostControls();
  } catch (e) {
    console.warn('Initial meta fetch failed:', e);
  }
  updateScoringModeUi();
  void refreshAsyncDiagnostics({ force: true });
  updateSetupActionsState();

  await runAutostartIfRequested();
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
  handleChatMessagePreview,
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

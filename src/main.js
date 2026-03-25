/**
File: src/main.js
Purpose: Browser dashboard client for Mining Tycoon (SSE updates, upgrades, and capabilities metadata).
Key responsibilities:
- Manage SSE lifecycle and reconnect behavior.
- Fetch/cache meta contracts with ETag, dedupe/throttle, and retention cleanup.
- Render state/leaderboard/upgrades and enforce contract-version safety gates.
- Drive explicit async session creation and session-scoped stream orchestration.
Invariants:
- Frontend remains display/intent only; backend stays authoritative for deterministic session policy and timing.
- No overlays/modals for core gameplay; inline status only.
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
  getAsyncSessionDurationSeconds,
} from './ui/async-duration.js';
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
} from './services/game-actions.js';
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
const gameIdInput = document.getElementById('game-id');
const playerIdInput = document.getElementById('player-id');

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
const newGameBtn = document.getElementById('new-game-btn');
const startBtn = document.getElementById('start-btn');
const startSessionBtn = document.getElementById('start-session-btn');
const stopBtn = document.getElementById('stop-btn');

// DOM elements - status displays
const connStatusEl = document.getElementById('conn-status');
const gameStatusEl = document.getElementById('game-status');
const countdownEl = document.getElementById('countdown');
const countdownLabelEl = document.getElementById('countdown-label');
const asyncSessionStatusEl = document.getElementById('async-session-status');
const newGameStatusEl = document.getElementById('new-game-status');
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
  roundTypeSyncInput,
  roundTypeAsyncInput,
  asyncHostDurationPresetInput,
  asyncSessionDurationPresetInput,
  asyncHostAutoStartCheckbox,
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
let pendingUiRenderFrame = null;
let pendingUiRenderData = null;

function getSelectedRoundType() {
  if (selectedSetupRoundType === 'async' || selectedSetupRoundType === 'sync') {
    return selectedSetupRoundType;
  }
  return roundTypeAsyncInput?.checked ? 'async' : 'sync';
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
  setStorageItem(STORAGE_KEYS.roundType, getSelectedRoundType());
  setStorageItem(
    STORAGE_KEYS.asyncDurationPreset,
    asyncHostDurationPresetInput?.value || '10m'
  );
  setStorageItem(
    STORAGE_KEYS.asyncDurationCustomMinutes,
    asyncSessionDurationPresetInput?.value || '24h'
  );
  setStorageItem(
    STORAGE_KEYS.asyncAutoStart,
    shouldAutoStartAsyncSession() ? 'true' : 'false'
  );
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);

  renderDebugContext();
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
    newGameBtn,
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
  initSeasonCards({ getGameMeta });
  initMetaManager({
    onMetaChanged() {
      renderMetaDebugLine();
      renderDerivedEmissionPreview();
      if (lastGameData) {
        renderUpgradeMetrics(lastGameData);
      }
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
    getSessionStreamTicket,
    setBadgeStatus,
    connStatusEl,
    fetchMetaSnapshot,
    onData: updateUI,
    onSessionStreamError(message) {
      setStartSessionStatus(message, 'error');
      showToast(message, 'error');
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
    clearNewGameStatus,
    showNewGameStatus,
    getPlayerName: () => playerNameInput.value.trim() || 'Player',
    getEnrollmentWindow: () =>
      parseInt(enrollmentWindowInput?.value || '0', 10) || 0,
    getSelectedRoundType,
    getAsyncDurationPreset: () =>
      getAsyncDurationPreset(asyncHostDurationPresetInput),
    getAsyncSessionDurationSeconds: () =>
      getAsyncSessionDurationSeconds(asyncSessionDurationPresetInput),
    shouldAutoStartAsyncSession,
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
    autoStartAsyncSession: startAsyncSessionForGame,
    setSetupCollapsed,
    scrollToLiveBoard,
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
  const savedRoundType = getStorageItem(STORAGE_KEYS.roundType);
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

  setSelectedRoundType(savedRoundType === 'async' ? 'async' : 'sync');
  updateAsyncHostControlsVisibility();

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
  void refreshAsyncDiagnostics({ force: true });
}

function applyUIUpdate(data) {
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
    activeSession = null;
    stopSessionElapsedTimer();
    setStartSessionStatus(
      'Async session ended. Start a new session to continue.',
      'info'
    );
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
  const sessionId = activeSession?.sessionId || null;

  startStream(gameId, playerId, {
    sessionId,
    requiresPlayerAuth: Boolean(activeSession?.requiresPlayerAuth),
    roundMode: getCurrentRoundContext().roundMode,
    forceSessionAttempt: Boolean(options.forceSessionAttempt),
  });
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
  scrollToLiveBoard();
  return { ok: true, sessionId: result.sessionId };
}

async function handleStartAsyncSession() {
  const gameId = gameIdInput.value;
  const playerId = playerIdInput.value;
  const baseUrl = getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }

  await startAsyncSessionForGame({ gameId, playerId });
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

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    cancelPendingUiRender();
    isStreamActive = false;
    latestGameStatus = null;
    closeEventSourceIfOpen();
    stopLiveTimersAndHalving();
    disconnectChat();
    stopSessionElapsedTimer();
    setBadgeStatus(connStatusEl, 'idle');
    setBadgeStatus(gameStatusEl, 'idle');
    stopCountdownTimer();
    lastGameData = null;
    // Reset player-view module state so cached text-node refs do not point to
    // detached nodes after manual stop/start stream cycles.
    resetPlayerStateView();
    resetSectionPlaceholder(leaderboardEl, 'Waiting for game data...');
    if (myScoreEl) myScoreEl.textContent = '—';
    if (myRankEl) myRankEl.textContent = '—';
    if (topScoreEl) topScoreEl.textContent = '—';
    resetSectionPlaceholder(upgradesEl, 'Waiting for upgrade data...');
    ensureInputsEditable();
    setLiveSessionActive(false);
    setStartSessionStatus('', 'info');
    updateSetupActionsState();
  });
}

if (newGameBtn) {
  newGameBtn.addEventListener('click', async () => {
    try {
      initializeModules();
      showNewGameStatus('Starting new game...', 'info');

      // Clear stale identifiers first so follow-up actions cannot target an old finished game.
      gameIdInput.value = '';
      playerIdInput.value = '';

      activeSession = null;
      latestGameStatus = null;
      setBadgeStatus(gameStatusEl, 'idle');
      setStartSessionStatus('', 'info');
      stopSessionElapsedTimer();
      saveSettings();
      updateSetupActionsState();

      await createNewGameAndJoin();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected New Game error.';
      showNewGameStatus(`Error: ${message}`, 'error');
      showToast(`Error: ${message}`, 'error');
      isSetupBusy = false;
      updateSetupActionsState();
    }
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
  // Apply the session-duration guard immediately after settings are restored
  // so the dropdown reflects the saved round duration on first render.
  syncSessionDurationOptions({
    roundDurationInput: asyncHostDurationPresetInput,
    sessionDurationInput: asyncSessionDurationPresetInput,
    warningEl: sessionDurationWarningEl,
    enforceLimit: getSelectedRoundType() === 'async',
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
  } catch (e) {
    console.warn('Initial meta fetch failed:', e);
  }
  void refreshAsyncDiagnostics({ force: true });
  updateSetupActionsState();
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
  renderSeasonData,
  computePortfolioValue,
  renderPortfolioValue,
  renderUpgradeMetrics,
  setActiveMeta,
  setSetupStateForTests,
  updateSetupActionsState,
  handleStartAsyncSession,
  setSetupCollapsed,
  toggleSetupCollapsed,
  autoCollapseSetupForLiveState,
  scrollToLiveBoard,
};

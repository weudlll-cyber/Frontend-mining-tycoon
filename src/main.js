/*
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
let asyncWindowOpen = null;
let asyncRequirePlayerAuth = 'unknown';
let asyncSessionSupportProbe = null;
let asyncDiagnosticsProbeKey = '';
let asyncDiagnosticsProbeInFlight = null;
let selectedSetupRoundType = 'sync';
let pendingUiRenderFrame = null;
let pendingUiRenderData = null;

function getRoundModeFromMeta(meta) {
  const raw = String(meta?.round_mode || meta?.round_type || '')
    .trim()
    .toLowerCase();
  if (raw === 'async' || raw === 'asynchronous') return 'async';
  return 'sync';
}

function getSelectedRoundType() {
  if (selectedSetupRoundType === 'async' || selectedSetupRoundType === 'sync') {
    return selectedSetupRoundType;
  }
  return roundTypeAsyncInput?.checked ? 'async' : 'sync';
}

// ---------------------------------------------------------------------------
// Async session-duration guard helpers
// ---------------------------------------------------------------------------

/**
 * Converts a preset label (e.g. "5m", "3h", "7d") to seconds.
 * Covers every option that exists in either the Round Duration or the
 * Session Duration dropdown so we can compare them numerically.
 *
 * Returns null for unknown labels so callers can decide how to handle missing
 * mappings rather than silently treating them as 0.
 */
function presetToSeconds(preset) {
  const map = {
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '60m': 3600,
    '3h': 10800,
    '6h': 21600,
    '12h': 43200,
    '24h': 86400,
    '3d': 259200,
    '7d': 604800,
    // Session-only aliases (the session dropdown uses "30m" which round doesn't)
    '30m': 1800,
  };
  return Object.prototype.hasOwnProperty.call(map, preset) ? map[preset] : null;
}

/**
 * Enforces the invariant: session duration ≤ round duration.
 *
 * Called whenever either the Round Duration or the Session Duration dropdown
 * changes, and once on page load after settings are restored.
 *
 * What it does:
 *  1. Reads the currently selected round duration in seconds.
 *  2. Disables every <option> in the session dropdown whose duration would
 *     exceed the round.
 *  3. If the currently selected session option is now disabled (was already
 *     set to an invalid value), auto-selects the largest still-valid option.
 *  4. Shows a small amber warning message below the session dropdown when
 *     auto-clamping occurred so the user knows their choice was adjusted,
 *     and hides it otherwise.
 */
function syncSessionDurationOptions() {
  // Guard: both dropdowns must be present in the DOM.
  if (!asyncHostDurationPresetInput || !asyncSessionDurationPresetInput) return;

  const roundSeconds = presetToSeconds(asyncHostDurationPresetInput.value);

  // If the round preset is not in our map (e.g. future preset added to HTML
  // without updating presetToSeconds), leave the session dropdown untouched.
  if (roundSeconds === null) return;

  let lastValidValue = null; // highest session preset that is still valid

  // Pass 1 — enable/disable each option in the session dropdown.
  for (const opt of asyncSessionDurationPresetInput.options) {
    const optSec = presetToSeconds(opt.value);
    // An option with an unknown preset value is left enabled (safe default).
    const tooLong = optSec !== null && optSec > roundSeconds;
    opt.disabled = tooLong;
    if (!tooLong) lastValidValue = opt.value;
  }

  // Pass 2 — if the current selection is now disabled, clamp to the largest
  // valid option.
  const currentOpt = asyncSessionDurationPresetInput.selectedOptions[0];
  const hadToClamp = Boolean(currentOpt?.disabled) && lastValidValue !== null;
  if (hadToClamp) {
    asyncSessionDurationPresetInput.value = lastValidValue;
  }

  // Show / hide the inline warning beneath the dropdown.
  if (sessionDurationWarningEl) {
    if (hadToClamp) {
      // Tell the user what happened and what the new value is.
      const roundLabel = asyncHostDurationPresetInput.value;
      const newLabel = asyncSessionDurationPresetInput.value;
      sessionDurationWarningEl.textContent = `Session clamped to ${newLabel} — must be ≤ round (${roundLabel})`;
      sessionDurationWarningEl.hidden = false;
    } else {
      // Everything is fine — no need to display anything.
      sessionDurationWarningEl.textContent = '';
      sessionDurationWarningEl.hidden = true;
    }
  }
}

function getAsyncDurationPreset() {
  const selectedPreset = String(asyncHostDurationPresetInput?.value || '10m');
  const allowed = new Set([
    '5m',
    '10m',
    '15m',
    '60m',
    '3h',
    '6h',
    '12h',
    '24h',
    '3d',
    '7d',
  ]);
  return allowed.has(selectedPreset) ? selectedPreset : '10m';
}

function getAsyncSessionDurationSeconds() {
  const selected = String(asyncSessionDurationPresetInput?.value || '24h');
  const presetSeconds = {
    '5m': 300,
    '10m': 600,
    '30m': 1800,
    '60m': 3600,
    '6h': 21600,
    '12h': 43200,
    '24h': 86400,
  };
  return presetSeconds[selected] || 86400;
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
  const selectedRoundType = getSelectedRoundType();
  const metaRoundMode = getRoundModeFromMeta(gameMeta);
  const shouldPreferHostSelection =
    selectedRoundType === 'async' &&
    !isStreamActive &&
    (latestGameStatus === null ||
      latestGameStatus === 'idle' ||
      latestGameStatus === 'enrolling');
  const roundMode =
    setupRoundModeOverride === 'async' || setupRoundModeOverride === 'sync'
      ? setupRoundModeOverride
      : shouldPreferHostSelection
        ? 'async'
        : gameMeta
          ? metaRoundMode
          : selectedRoundType;
  const supportFromMeta = getSessionSupportFromMeta(gameMeta);
  const supportFromProbe =
    typeof asyncSessionSupportProbe === 'boolean'
      ? asyncSessionSupportProbe
      : null;
  const supportsSessionStart =
    roundMode !== 'async'
      ? false
      : supportFromMeta === null
        ? supportFromProbe === null
          ? sessionStartSupported
          : supportFromProbe
        : supportFromMeta;
  return {
    roundMode,
    supportsSessionStart,
  };
}

function resolveAsyncWindowOpen(meta) {
  if (getRoundModeFromMeta(meta) === 'async') {
    return true;
  }
  if (typeof meta?.window_open === 'boolean') {
    return meta.window_open;
  }
  return null;
}

async function refreshAsyncDiagnostics({ force = false } = {}) {
  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  const gameId = String(gameIdInput?.value || '').trim();
  const playerId = String(playerIdInput?.value || '').trim();
  const gameMeta = getGameMeta(gameId);
  const roundMode = getRoundModeFromMeta(gameMeta);

  asyncWindowOpen = resolveAsyncWindowOpen(gameMeta);

  if (!baseUrl || !gameId || roundMode !== 'async') {
    asyncSessionSupportProbe = null;
    asyncRequirePlayerAuth = 'unknown';
    updateSetupActionsState();
    return;
  }

  const probeKey = `${baseUrl}|${gameId}|${playerId}`;
  if (
    !force &&
    probeKey === asyncDiagnosticsProbeKey &&
    !asyncDiagnosticsProbeInFlight
  ) {
    updateSetupActionsState();
    return;
  }

  if (asyncDiagnosticsProbeInFlight && !force) {
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
      typeof sessionSupportResult?.supported === 'boolean'
        ? sessionSupportResult.supported
        : null;
    asyncRequirePlayerAuth =
      authResult?.value === true || authResult?.value === false
        ? authResult.value
        : 'unknown';

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
  setSetupShellState({
    isStreamActive,
    isSetupBusy,
    latestGameStatus,
    roundMode: roundContext.roundMode,
    sessionStartSupported: roundContext.supportsSessionStart,
    sessionApiSupported: asyncSessionSupportProbe,
    asyncWindowOpen,
    requirePlayerAuth: asyncRequirePlayerAuth,
    sessionActive: Boolean(activeSession?.sessionId),
    sessionId: activeSession?.sessionId || null,
    hostRoundType: getSelectedRoundType(),
    asyncHostAutoStart: shouldAutoStartAsyncSession(),
  });
}

function setStartSessionStatus(message = '', type = 'info') {
  if (!startSessionStatusEl) return;
  startSessionStatusEl.textContent = message;
  startSessionStatusEl.className = message
    ? `setup-session-status setup-session-status--${type}`
    : 'setup-session-status';
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
  stopSessionElapsedTimer();
  disconnectChat();

  isStreamActive = false;
  setLiveSessionActive(false);
  setBadgeStatus(connStatusEl, 'idle');
  setStartSessionStatus(
    'Session duration reached. Start Async Session to continue.',
    'warning'
  );
  showToast('Session ended at configured duration.', 'info');

  updateSetupActionsState();
  renderDebugContext();
}

function stopSessionElapsedTimer() {
  if (sessionElapsedInterval) {
    clearInterval(sessionElapsedInterval);
    sessionElapsedInterval = null;
  }
  // Hide the secondary "Round left" display — it is only meaningful while a
  // session is running and would show stale data once the session ends.
  if (roundRemainingHintEl) roundRemainingHintEl.hidden = true;
}

function startSessionElapsedTimer(sessionStartUnix, initialElapsedSeconds = 0) {
  if (!Number.isFinite(sessionStartUnix)) return;
  stopSessionElapsedTimer();

  const update = () => {
    const nowSeconds = Date.now() / 1000;
    const elapsed = Math.max(
      Number(initialElapsedSeconds) || 0,
      nowSeconds - Number(sessionStartUnix)
    );

    const sessionDurationSec = Number(activeSession?.sessionDurationSec);
    if (
      Number.isFinite(sessionDurationSec) &&
      sessionDurationSec > 0 &&
      elapsed >= sessionDurationSec
    ) {
      handleActiveSessionExpired();
      return;
    }

    // ── Primary header counter ──────────────────────────────────────────────
    // WHY: Once the backend session exists, the primary timer shows how long
    // the player has been in *this session*, not how long the round runs.
    countdownLabelEl.textContent = 'Session Elapsed';
    countdownEl.textContent = formatRemainingMmSs(elapsed);

    // ── Secondary "Round left" indicator ───────────────────────────────────
    // WHY: The round carries on beyond the session. Halvings, scoring, and
    // the leaderboard all run until the *round* ends, not the session.
    // Showing this number prevents confusion when halvings still fire after
    // the session duration has elapsed.
    //
    // We read seconds_remaining from the most-recent stream payload
    // (lastGameData) and subtract the time that has passed since that payload
    // arrived so the display stays fresh between stream ticks.
    if (roundRemainingHintEl && roundRemainingEl) {
      const remaining = lastGameData?.seconds_remaining;
      if (remaining != null && Number.isFinite(Number(remaining))) {
        // Drift-correct: the payload was received some milliseconds ago.
        const streamAge = (Date.now() - (lastGameData.timestamp ?? Date.now())) / 1000;
        const roundLeft = Math.max(0, Number(remaining) - streamAge);
        roundRemainingEl.textContent = formatDurationCompact(roundLeft);
        roundRemainingHintEl.hidden = false;
      } else {
        // No stream data yet (session just started) — keep hint hidden to
        // avoid showing a stale or misleading "—".
        roundRemainingHintEl.hidden = true;
      }
    }
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
      updateSetupActionsState();
      saveSettings();
    },
    onHostAsyncDurationChanged() {
      // Keep the session dropdown in sync whenever the round duration changes:
      // disable options that would exceed the round and auto-clamp if needed.
      syncSessionDurationOptions();
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
    getAsyncDurationPreset,
    getAsyncSessionDurationSeconds,
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

  if (savedBaseUrl) baseUrlInput.value = savedBaseUrl;
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
  const streamSessionStatus = String(streamSession?.status || '').toLowerCase();
  const streamSessionIdRaw = streamSession?.session_id;
  const streamSessionId =
    streamSessionIdRaw === null || streamSessionIdRaw === undefined
      ? ''
      : String(streamSessionIdRaw).trim();
  const streamSessionRunning =
    streamSessionStatus === 'running' && streamSessionId.length > 0;

  // Keep frontend session state aligned with backend-truth from stream payload.
  // If backend no longer reports this session as running, drop local session.
  if (activeSession?.sessionId) {
    const localSessionId = String(activeSession.sessionId);
    const sameSession = streamSessionId.length > 0 && streamSessionId === localSessionId;
    if (!streamSessionRunning || !sameSession) {
      activeSession = null;
      stopSessionElapsedTimer();
      setStartSessionStatus('Async session ended. Start a new session to continue.', 'info');
    }
  }

  const hasActiveSession =
    Boolean(activeSession?.sessionId) &&
    Number.isFinite(activeSession?.sessionStartUnix) &&
    streamSessionRunning;

  if (hasActiveSession) {
    const elapsedFromPayload = Number(streamSession?.session_elapsed_seconds);
    startSessionElapsedTimer(
      Number(activeSession.sessionStartUnix),
      Number.isFinite(elapsedFromPayload) ? elapsedFromPayload : 0
    );
  } else {
    stopSessionElapsedTimer();
  }

  setLiveSessionActive(hasActiveSession);
  handleLastHalvingStateUpdate(data);

  if (data.game_status) {
    setBadgeStatus(gameStatusEl, data.game_status);
    autoCollapseSetupForLiveState(data.game_status);

    if (hasActiveSession) {
      // WHY: Once session-active, the user-visible primary timer reflects session age.
      startSessionElapsedTimer(Number(activeSession.sessionStartUnix), 0);
    } else if (data.game_status === 'enrolling') {
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

function cancelPendingUiRender() {
  if (pendingUiRenderFrame !== null) {
    cancelAnimationFrame(pendingUiRenderFrame);
    pendingUiRenderFrame = null;
  }
  pendingUiRenderData = null;
}

function updateUI(data) {
  lastGameData = data;
  lastGameData.timestamp = Date.now();
  latestGameStatus = data?.game_status || null;
  void refreshAsyncDiagnostics();

  pendingUiRenderData = data;
  if (pendingUiRenderFrame !== null) {
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
    updateSetupActionsState();

    if (result.code === 'MALFORMED_SESSION_RESPONSE') {
      const malformedMessage =
        'Session could not be started (malformed response).';
      setStartSessionStatus(malformedMessage, 'error');
      return {
        ok: false,
        code: result.code,
        message: malformedMessage,
      };
    }

    if (result.kind === 'policy-closed') {
      setStartSessionStatus(result.message, 'warning');
      return { ok: false, kind: result.kind, message: result.message };
    }

    setStartSessionStatus(result.message, 'error');
    return { ok: false, kind: result.kind, message: result.message };
  }

  activeSession = {
    sessionId: result.sessionId,
    sessionStartUnix: Number(result.sessionStartUnix) || null,
    sessionDurationSec: Number(result.sessionDurationSec) || null,
    requiresPlayerAuth: Boolean(result.requiresPlayerAuth),
  };
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
    resetSectionPlaceholder(playerStateEl, 'Waiting for game data...');
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
  newGameBtn.addEventListener('click', () => {
    activeSession = null;
    setStartSessionStatus('', 'info');
    stopSessionElapsedTimer();
    createNewGameAndJoin();
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
  // Apply the session-duration guard immediately after settings are restored
  // so the dropdown reflects the saved round duration on first render.
  syncSessionDurationOptions();
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

/**
File: src/ui/board-update.js
Purpose: Apply stream/state payloads to the player board.
Role in system:
- Upstream: `onData` of the stream controller (src/services/stream-controller.js,
  wired in src/main.js) delivers every SSE/state payload to `updateUI`.
- Downstream: board-state.js (latest payload, game status, session), the
  session clock, game-over overlay and last-game snapshot, and all board
  renderers (season cards, player state, upgrades, leaderboard, standings,
  quick stats, events, trade/farm panels, setup shell).
Constraints:
- Bursty SSE updates are coalesced into one animation frame; text selection
  is preserved across the patch unless the user is typing in a field.
- Backend payloads are the truth for session state: a local session is only
  dropped when the backend explicitly reports it ended or replaced.
- The game-over overlay only appears for a running -> finished transition of
  the viewed round (an enrolling round that is cancelled shows nothing).
- A scheduled sync round (`game_status: scheduled`, before its enrollment
  window opens) shows "Scheduled — opens at <time>" in the phase badge and
  standings label; the action gate keeps upgrades/trades/farming disabled.
  `showScheduledRoundStatus` does the same when the join itself is refused
  with 409 JOIN_NOT_ALLOWED_SCHEDULED (no payload to render yet).
Security notes: renderers use safe DOM APIs (textContent/createElement).
*/

import { setBadgeStatus } from './badge.js';
import { boardState } from './board-state.js';
import {
  showScheduledOpening,
  startCountdownTimer,
  startEnrollmentCountdown,
  stopCountdownTimer,
} from './countdown.js';
import { annotateAffectedValues, renderEventBanner } from './event-display.js';
import {
  captureLastPlayedGameSnapshot,
  hideGameOverOverlay,
  isGameOverOverlayEligible,
  showGameOverOverlay,
} from './game-over.js';
import {
  handleLastHalvingStateUpdate,
  stopNextHalvingCountdown,
} from './halving-display.js';
import {
  refreshPanelStatus,
  setLiveSessionActive,
} from './live-board-lifecycle.js';
import { normalizeUnixSeconds } from '../utils/schedule-time.js';
import { mergeFarmUpdatedState } from './farming-state.js';
import { renderPlayerState } from './player-view.js';
import { updateScoringModeUi } from './scoring-mode-ui.js';
import { restoreSelectionIfValid, snapSelection } from './selection-persist.js';
import {
  startSessionElapsedTimer,
  stopSessionElapsedTimer,
} from './session-clock.js';
import {
  getCurrentRoundContext,
  refreshAsyncDiagnostics,
  setStartSessionStatus,
} from './setup-controller.js';
import { renderTradeSchedulePreview } from './setup-host-controls.js';
import {
  renderStandingsStatus,
  resolveStandingsStatus,
} from './standings-status.js';
import {
  deriveStreamSessionState,
  resolveCountdownMode,
  shouldScheduleUiRender,
  stampIncomingUiData,
} from './ui-update-state.js';

let _deps = {};
let pendingUiRenderFrame = null;
let pendingUiRenderData = null;

/**
 * Renderers that need lazy module init are injected from src/main.js.
 * @param {{ gameStatusEl, countdownLabelEl, gameIdInput,
 *   renderSeasonData, renderUpgradeMetrics, renderLeaderboard,
 *   renderQuickStats, renderPortfolioValue, autoCollapseSetupForLiveState,
 *   updateSetupActionsState }} deps
 */
export function initBoardUpdate(deps) {
  _deps = deps || {};
}

function resolveFinishedGameId(data) {
  return String(data?.game_id || _deps.gameIdInput?.value || '').trim();
}

const SESSION_FINISHED_OVERLAY = {
  title: 'Session Finished',
  message:
    'Your async session has finished. Click anywhere to return to the login lobby.',
};

/**
 * Overlay for a finished async session reported by the stream (shared by the
 * payload path below and `onSessionStreamFinished` in src/main.js).
 */
export function showSessionFinishedOverlay(gameId) {
  showGameOverOverlay(gameId, SESSION_FINISHED_OVERLAY);
}

function trackViewedGameStatus(data, normalizedGameStatus) {
  const normalizedDataGameId = String(data?.game_id || '').trim();
  const isCurrentViewedGame =
    Boolean(normalizedDataGameId) &&
    normalizedDataGameId === boardState.currentViewedGameId;

  if (isCurrentViewedGame) {
    // WHY: Only 'running' counts as having actually played a game.
    // 'enrolling' is a waiting-room state — the player has not played at all.
    // If the game jumps from enrolling directly to finished (e.g. cancelled or
    // too few players), showing the Game Over overlay would be wrong.
    if (normalizedGameStatus === 'running') {
      boardState.hasSeenPlayableStateForCurrentView = true;
    }

    if (normalizedGameStatus) {
      boardState.lastGameStatusForCurrentView = normalizedGameStatus;
    }
  }
}

function applySessionState(data) {
  const streamSession = data?.session || null;
  const sessionRenderState = deriveStreamSessionState({
    activeSession: boardState.activeSession,
    streamSession,
  });

  // Keep frontend session state aligned with backend-truth from stream payload.
  // Only clear activeSession if the backend EXPLICITLY confirms the session ended or
  // a different session has taken over. If the payload simply doesn't include session
  // data yet (e.g. first tick after session creation), keep the local session intact
  // to avoid a false drop on startup.
  if (sessionRenderState.shouldClearActiveSession) {
    const clearReason = String(sessionRenderState.clearReason || '');
    boardState.activeSession = null;
    stopSessionElapsedTimer();
    setStartSessionStatus(
      'Async session ended. Start a new session to continue.',
      'info'
    );

    if (clearReason === 'ended') {
      const finishedGameId = resolveFinishedGameId(data);
      if (finishedGameId) {
        captureLastPlayedGameSnapshot(data);
      }
      showSessionFinishedOverlay(finishedGameId);
    }
  }

  const hasActiveSession = sessionRenderState.hasActiveSession;

  if (hasActiveSession) {
    startSessionElapsedTimer(
      Number(boardState.activeSession.sessionStartUnix),
      Number.isFinite(sessionRenderState.elapsedFromPayload)
        ? sessionRenderState.elapsedFromPayload
        : 0
    );
  } else {
    stopSessionElapsedTimer();
  }

  setLiveSessionActive(hasActiveSession);
  // WHY: the stream is player-scoped, so a running session in the payload is
  // backend truth even before the local session record catches up.
  boardState.playerHasActiveSession =
    hasActiveSession || sessionRenderState.streamSessionRunning;
  return hasActiveSession;
}

/** Opening time (unix seconds) of a scheduled round from a payload, or null. */
function readScheduledStartAt(data) {
  return normalizeUnixSeconds(data?.scheduled_start_at);
}

/**
 * Show a scheduled round without a state payload (the join was refused with
 * 409 JOIN_NOT_ALLOWED_SCHEDULED, e.g. on `?autostart=1`): phase badge,
 * standings label and the action gate ("The round has not opened yet.").
 */
export function showScheduledRoundStatus(opensAt = null) {
  boardState.latestGameStatus = 'scheduled';
  setBadgeStatus(_deps.gameStatusEl, 'scheduled', { opensAt });
  showScheduledOpening(opensAt);
  renderStandingsStatus(
    resolveStandingsStatus({
      roundMode: getCurrentRoundContext().roundMode,
      gameStatus: 'scheduled',
      scheduledStartAt: opensAt,
    })
  );
  refreshPanelStatus();
  _deps.updateSetupActionsState?.();
}

function applyGameStatus(data, hasActiveSession, previousGameStatus) {
  const { countdownLabelEl } = _deps;
  setBadgeStatus(_deps.gameStatusEl, data.game_status, {
    opensAt: readScheduledStartAt(data),
  });
  _deps.autoCollapseSetupForLiveState(data.game_status);

  const countdownMode = resolveCountdownMode({
    gameStatus: data.game_status,
    hasActiveSession,
  });

  if (countdownMode === 'scheduled') {
    // Before the enrollment window opens: show the local opening time.
    showScheduledOpening(readScheduledStartAt(data));
  } else if (countdownMode === 'session') {
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
    const finishedGameId = resolveFinishedGameId(data);
    if (finishedGameId) {
      const shouldCaptureSnapshot =
        finishedGameId !== boardState.lastFinishedGameId;
      const shouldShowOverlay = isGameOverOverlayEligible({
        previousGameStatus,
        gameStatus: data.game_status,
        gameId: finishedGameId,
        currentGameId: boardState.currentViewedGameId,
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

function applyUIUpdate(data) {
  const normalizedGameStatus = String(data?.game_status || '')
    .trim()
    .toLowerCase();
  const previousGameStatusForCurrentView =
    boardState.lastGameStatusForCurrentView;
  trackViewedGameStatus(data, normalizedGameStatus);

  const hasActiveSession = applySessionState(data);
  handleLastHalvingStateUpdate(data);

  if (data.game_status) {
    applyGameStatus(data, hasActiveSession, previousGameStatusForCurrentView);
  }

  _deps.renderSeasonData(data);
  renderPlayerState(data);
  _deps.renderUpgradeMetrics(data);
  _deps.renderLeaderboard(data);
  // Live (sync) / Provisional (async, round open) / Final (round finished).
  renderStandingsStatus(
    resolveStandingsStatus({
      roundMode: getCurrentRoundContext().roundMode,
      gameStatus: data?.game_status || boardState.latestGameStatus,
      scheduledStartAt: readScheduledStartAt(data),
    })
  );
  _deps.renderQuickStats(data);
  _deps.renderPortfolioValue(data);
  renderEventBanner(data);
  annotateAffectedValues(data);
  updateScoringModeUi(data);
  renderTradeSchedulePreview();
  refreshPanelStatus();
  _deps.updateSetupActionsState();
}

function renderAfterActionResult() {
  renderPlayerState(boardState.lastGameData);
  _deps.renderQuickStats(boardState.lastGameData);
  _deps.renderPortfolioValue(boardState.lastGameData);
  refreshPanelStatus();
}

/** `onTradeExecuted` of game-actions.js: merge the returned player state. */
export function applyTradeExecuted(payload) {
  if (!payload || typeof payload !== 'object') return;
  const updatedState = payload.updated_state;
  if (!updatedState || typeof updatedState !== 'object') return;

  const tradeResult = payload.trade_result || {};
  boardState.lastGameData = {
    ...(boardState.lastGameData || {}),
    player_state: updatedState,
    trades_used: Number.isFinite(Number(tradeResult.trades_used))
      ? Number(tradeResult.trades_used)
      : Number(updatedState.trades_used || updatedState.trade_count_used || 0),
  };
  renderAfterActionResult();
}

/** `onFarmUpdated` of game-actions.js (deposit/withdraw). */
export function applyFarmUpdated(payload) {
  // Same flow as trades: the backend returns the new state, the board
  // re-renders balances, farmed amounts and holdings from it.
  const updatedState = payload?.updated_state;
  if (!updatedState || typeof updatedState !== 'object') return;
  boardState.lastGameData = mergeFarmUpdatedState(
    boardState.lastGameData,
    updatedState
  );
  renderAfterActionResult();
}

export function cancelPendingUiRender() {
  if (pendingUiRenderFrame !== null) {
    cancelAnimationFrame(pendingUiRenderFrame);
    pendingUiRenderFrame = null;
  }
  pendingUiRenderData = null;
}

export function updateUI(data) {
  const { stampedData, latestGameStatus: nextGameStatus } =
    stampIncomingUiData(data);
  boardState.lastGameData = stampedData;
  boardState.latestGameStatus = nextGameStatus;
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

    const activeEl = document.activeElement;
    const shouldSkipSelectionPersistence =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl instanceof HTMLSelectElement ||
      activeEl?.isContentEditable === true;
    const selectionSnapshot = shouldSkipSelectionPersistence
      ? null
      : snapSelection(document.body);
    applyUIUpdate(frameData);
    restoreSelectionIfValid(selectionSnapshot);
  });
}

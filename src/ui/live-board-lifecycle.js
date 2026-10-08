/**
File: src/ui/live-board-lifecycle.js
Purpose: Live-board lifecycle of the player board: play-window gate for the
  action controls, client-side async session expiry and the full board reset.
Role in system:
- Upstream: board-state.js (status, session), the session clock
  (session-clock.js calls `handleActiveSessionExpired`), the stop button and
  the game-over acknowledgement (game-over.js via src/main.js).
- Downstream: stream/timer/chat shutdown, the header badges and score
  summary, the setup shell and the upgrade/trade/farm controls.
Constraints:
- Backend stays authoritative: the play-window gate only mirrors known state;
  a 409 from the backend remains the fallback.
- Every shutdown step in the reset is isolated so one failure cannot block
  the rest (the game-over acknowledgement must always navigate).
Security notes: text via textContent only; player tokens are never shown.
*/

import { getGameMeta } from '../meta/meta-manager.js';
import {
  closeEventSourceIfOpen,
  stopLiveTimersAndHalving,
} from '../services/stream-controller.js';
import { STORAGE_KEYS, setStorageItem } from '../utils/storage-utils.js';
import { resolvePlayerActionAvailability } from './action-availability.js';
import { setBadgeStatus } from './badge.js';
import { boardState } from './board-state.js';
import { disconnectChat } from './chat-panel.js';
import { stopCountdownTimer } from './countdown.js';
import { showGameOverOverlay } from './game-over.js';
import { resetPlayerStateView } from './player-view.js';
import { formatDurationCompact } from './season-cards.js';
import {
  startRoundRemainingHintTimer,
  stopSessionElapsedTimer,
} from './session-clock.js';
import {
  getCurrentRoundContext,
  setStartSessionStatus,
} from './setup-controller.js';
import { renderStandingsStatus } from './standings-status.js';
import { showToast } from './toast.js';
import { renderAllSeasonUpgrades } from './upgrade-panel-inline.js';

let _deps = {};

/**
 * @param {{ connStatusEl, gameStatusEl, countdownEl, countdownLabelEl,
 *   myScoreEl, myRankEl, topScoreEl, gameIdInput, playerIdInput,
 *   cancelPendingUiRender: () => void, renderLeaderboard: (data) => void,
 *   ensureInputsEditable: () => void, updateSetupActionsState: () => void,
 *   renderDebugContext: () => void,
 *   getPanelApis: () => { tradingPanelApi, farmingPanelApi } }} deps
 */
export function initLiveBoardLifecycle(deps) {
  _deps = deps || {};
}

export function setLiveSessionActive(isActive) {
  boardState.playerHasActiveSession = Boolean(isActive);
  document.body.classList.toggle('live-session', Boolean(isActive));
}

/** Re-render trade and farm panels against the current gate. */
export function refreshPanelStatus() {
  const { tradingPanelApi, farmingPanelApi } = _deps.getPanelApis();
  tradingPanelApi?.renderTradingStatus?.();
  farmingPanelApi?.renderFarmingStatus?.();
}

/** Re-render upgrade lanes, trade and farm panels against the current gate. */
function refreshPlayerActionControls() {
  if (boardState.lastGameData) {
    renderAllSeasonUpgrades(boardState.lastGameData, getGameMeta);
  }
  refreshPanelStatus();
}

/**
 * Play-window gate for upgrade/trade buttons, derived from state the board
 * already tracks. Backend stays authoritative (409 toast remains the fallback).
 */
export function getPlayerActionAvailability() {
  return resolvePlayerActionAvailability({
    gameStatus: boardState.latestGameStatus,
    roundMode: getCurrentRoundContext().roundMode,
    hasActiveSession: boardState.playerHasActiveSession,
  });
}

export function handleActiveSessionExpired() {
  if (!boardState.activeSession?.sessionId) {
    return;
  }
  const { countdownEl, countdownLabelEl } = _deps;

  // Clear session context first so subsequent UI updates use non-session paths.
  boardState.activeSession = null;

  // Session lifespan is reached: stop receiving live updates for this session
  // so the player does not keep seeing halving ticks beyond configured duration.
  _deps.cancelPendingUiRender();
  closeEventSourceIfOpen();
  stopLiveTimersAndHalving();
  stopSessionElapsedTimer({ resetDisplay: false, hideRoundHint: false });
  disconnectChat();

  boardState.isStreamActive = false;
  setLiveSessionActive(false);
  // The stream is closed, so no further payload would re-render the action
  // buttons: re-apply the play-window gate now.
  refreshPlayerActionControls();
  setBadgeStatus(_deps.connStatusEl, 'idle');
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

  _deps.updateSetupActionsState();
  _deps.renderDebugContext();

  // Show game-over overlay so the player is prompted to return to the lobby.
  // This is the primary path for async session expiry — the client-side elapsed
  // timer fires here before (or instead of) the backend's final SSE packet.
  const expiredGameId = String(_deps.gameIdInput?.value || '').trim();
  showGameOverOverlay(expiredGameId, {
    title: 'Session Finished',
    message:
      'Your async session has ended. Click anywhere to return to the login lobby.',
  });
}

export function resetLiveBoardState({ clearPlayerContext = false } = {}) {
  const { gameIdInput, playerIdInput, myScoreEl, myRankEl, topScoreEl } = _deps;
  try {
    _deps.cancelPendingUiRender();
  } catch (e) {
    console.error('[Reset] Error canceling pending UI render:', e);
  }
  boardState.isStreamActive = false;
  boardState.latestGameStatus = null;
  boardState.activeSession = null;
  boardState.currentViewedGameId = '';
  boardState.hasSeenPlayableStateForCurrentView = false;
  boardState.lastGameStatusForCurrentView = null;
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
  setBadgeStatus(_deps.connStatusEl, 'idle');
  setBadgeStatus(_deps.gameStatusEl, 'idle');
  stopCountdownTimer();
  boardState.lastGameData = null;
  resetPlayerStateView();
  _deps.renderLeaderboard(null);
  renderStandingsStatus();
  if (myScoreEl) myScoreEl.textContent = '—';
  if (myRankEl) myRankEl.textContent = '—';
  if (topScoreEl) topScoreEl.textContent = '—';
  _deps.ensureInputsEditable();
  setLiveSessionActive(false);
  setStartSessionStatus('', 'info');

  if (clearPlayerContext) {
    if (gameIdInput) gameIdInput.value = '';
    if (playerIdInput) playerIdInput.value = '';
    setStorageItem(STORAGE_KEYS.gameId, '');
    setStorageItem(STORAGE_KEYS.playerId, '');
  }

  _deps.updateSetupActionsState();
}

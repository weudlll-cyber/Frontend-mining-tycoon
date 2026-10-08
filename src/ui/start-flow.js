/**
File: src/ui/start-flow.js
Purpose: Enter-game and async-session start flow of the player board
  (Start button, Start Async Session button and `?autostart=1` from the lobby).
Role in system:
- Upstream: the game id chosen in the lobby (stored game id), the stored
  player id and the round mode from game meta.
- Downstream: player-join.js (reuse or join), the meta snapshot fetch,
  POST /games/{id}/sessions (session-actions.js) and the SSE stream
  (stream-controller.js); status goes to the setup shell and toasts.
Constraints:
- Session creation is explicit and backend-authoritative; the stream only
  switches to session transport after valid session metadata.
- Async rounds without an active session start one before streaming.
- Errors never escape: the safe wrapper reports them and releases the setup
  busy state.
Security notes: no token handling here; messages are shown as plain text.
*/

import { fetchMetaSnapshot } from '../meta/meta-manager.js';
import { ensurePlayerJoinedForStream } from '../services/player-join.js';
import { createAsyncSession } from '../services/session-actions.js';
import { startStream } from '../services/stream-controller.js';
import {
  cleanupGameMetaCache,
  markGameMetaSeen,
} from '../utils/storage-utils.js';
import {
  buildActiveSessionFromResult,
  normalizeAsyncSessionStartFailure,
} from './async-session-state.js';
import { boardState } from './board-state.js';
import { hideGameOverOverlay } from './game-over.js';
import {
  getCurrentRoundContext,
  getNormalizedBaseUrlOrNull,
  refreshAsyncDiagnostics,
  setStartSessionStatus,
} from './setup-controller.js';
import { showToast } from './toast.js';

let _deps = {};

/**
 * @param {{ gameIdInput, playerIdInput, updateSetupActionsState: () => void,
 *   renderDebugContext: () => void,
 *   setSetupCollapsed: (collapsed: boolean) => void }} deps
 */
export function initStartFlow(deps) {
  _deps = deps || {};
}

// The player board joins exactly the game chosen in the lobby (stored game id);
// game selection lives in index.html, not here.
export function resolveRequestedGameId() {
  return String(_deps.gameIdInput?.value || '').trim();
}

async function startLiveStream(gameId, playerId, options = {}) {
  const normalizedGameId = String(gameId || '').trim();
  boardState.currentViewedGameId = normalizedGameId;
  boardState.hasSeenPlayableStateForCurrentView = false;
  boardState.lastGameStatusForCurrentView = null;
  hideGameOverOverlay();

  const sessionId = boardState.activeSession?.sessionId || null;

  startStream(gameId, playerId, {
    sessionId,
    requiresPlayerAuth: Boolean(boardState.activeSession?.requiresPlayerAuth),
    roundMode: getCurrentRoundContext().roundMode,
    forceSessionAttempt: Boolean(options.forceSessionAttempt),
  });
}

async function startAsyncSessionForGame({ gameId, playerId }) {
  const { updateSetupActionsState } = _deps;
  setStartSessionStatus('Starting async session...', 'info');
  boardState.isSetupBusy = true;
  updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });

  // WHY: Session creation is explicit and backend-authoritative; stream transport must only switch after valid session metadata.
  const result = await createAsyncSession({ gameId, playerId });
  if (!result.ok) {
    boardState.isSetupBusy = false;

    const normalizedFailure = normalizeAsyncSessionStartFailure(result);
    setStartSessionStatus(
      normalizedFailure.message,
      normalizedFailure.statusType
    );
    if (normalizedFailure.nextLatestGameStatus) {
      boardState.latestGameStatus = normalizedFailure.nextLatestGameStatus;
    }
    updateSetupActionsState();
    return normalizedFailure.response;
  }

  boardState.activeSession = buildActiveSessionFromResult(result);
  boardState.sessionStartSupported = true;
  _deps.renderDebugContext();
  setStartSessionStatus('Async session started.', 'success');

  boardState.isSetupBusy = false;
  updateSetupActionsState();

  await startLiveStream(gameId, playerId, { forceSessionAttempt: true });
  _deps.setSetupCollapsed(true);
  return { ok: true, sessionId: result.sessionId };
}

export async function handleStartAsyncSession() {
  const gameId = resolveRequestedGameId();
  const existingPlayerId = _deps.playerIdInput.value;
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
  const existingPlayerId = _deps.playerIdInput.value;
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

  const roundMode = getCurrentRoundContext().roundMode;
  if (roundMode === 'async' && !boardState.activeSession?.sessionId) {
    await startAsyncSessionForGame({ gameId, playerId });
    return;
  }

  await startLiveStream(gameId, playerId, { forceSessionAttempt: false });
  _deps.setSetupCollapsed(true);
}

export async function runStartGameFlowSafely({ source = 'manual' } = {}) {
  try {
    await handleStartGameFlow();
  } catch (error) {
    const detail = String(error?.message || error || 'Unknown error');
    console.error(`[Start Flow][${source}] Unhandled error:`, error);
    showToast(`Could not start game: ${detail}`, 'error');
    boardState.isSetupBusy = false;
    _deps.updateSetupActionsState();
  }
}

/**
 * `?autostart=1` (set by the lobby join) enters the stored game once, then
 * drops the flag from the URL so a reload does not join again.
 */
export async function runAutostartIfRequested() {
  const params = new URLSearchParams(window.location.search);
  const shouldAutostart = params.get('autostart') === '1';
  if (shouldAutostart && resolveRequestedGameId()) {
    await runStartGameFlowSafely({ source: 'autostart' });
    params.delete('autostart');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }
}

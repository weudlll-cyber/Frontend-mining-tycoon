/**
File: src/ui/game-over.js
Purpose: Post-game "Game Over" / "Session Finished" overlay of the player
  board and the last-played-game snapshot for the lobby.
Role in system:
- Upstream: finished rounds/sessions detected by board-update.js, the
  client-side session expiry (live-board-lifecycle.js) and
  `onSessionStreamFinished` of the stream controller (src/main.js).
- Downstream: the overlay elements, the "View full results" deep link into
  the lobby (index.html?results=<gameId>&player=<playerId>) and the
  `lastPlayedGameSnapshot` storage key the lobby renders as "last game
  highscores".
Constraints:
- This overlay is the only full-screen overlay and is shown only after the
  round or session has ended (LOCKED_DECISIONS §C).
- Acknowledging resets the board through the injected `resetLiveBoardState`
  and always navigates, even if the reset throws.
Security notes: text via textContent; ids are URL-encoded by URLSearchParams.
*/

import { STORAGE_KEYS, setStorageItem } from '../utils/storage-utils.js';
import { boardState } from './board-state.js';
import { buildLastGameSnapshot } from './last-game-highscores.js';
import { resolveActiveScoringMode } from './scoring-mode-ui.js';
import { formatScoringModeName } from './trading-panel-formatters.js';

let _deps = {};

/**
 * @param {{ gameOverOverlayEl, gameOverTitleEl, gameOverMessageEl,
 *   gameOverResultsLinkEl, gameOverResultsNoteEl, gameIdInput, playerIdInput,
 *   resetLiveBoardState: (options?: object) => void }} deps
 */
export function initGameOver(deps) {
  _deps = deps || {};
}

function storeLastPlayedGameSnapshot(snapshot) {
  if (!snapshot) {
    setStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot, '');
    return;
  }

  setStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot, JSON.stringify(snapshot));
}

export function captureLastPlayedGameSnapshot(data) {
  const snapshot = buildLastGameSnapshot({
    data,
    gameId: data?.game_id || _deps.gameIdInput?.value,
    scoringModeLabel: formatScoringModeName(resolveActiveScoringMode(data)),
  });

  if (!snapshot) {
    return null;
  }

  boardState.lastFinishedGameId = snapshot.gameId;
  // The lobby (index.html) renders this snapshot as "last game highscores".
  storeLastPlayedGameSnapshot(snapshot);
  return snapshot;
}

export function showGameOverOverlay(gameId = '', options = {}) {
  const { gameOverOverlayEl, gameOverTitleEl, gameOverMessageEl } = _deps;
  if (!gameOverOverlayEl) {
    console.warn('[Game Over] Overlay element not found in DOM');
    return;
  }

  const normalizedGameId = String(gameId || '').trim();
  const title = String(options?.title || 'Game Over').trim() || 'Game Over';
  const message = String(options?.message || '').trim();

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
  updateGameOverResultsLink(normalizedGameId, title === 'Session Finished');

  gameOverOverlayEl.hidden = false;
}

/**
 * "View full results" deep link into the lobby results view
 * (index.html?results=<gameId>&player=<playerId>, the player id lets the lobby
 * highlight the own row). An ended async session usually finishes before the
 * round does, so the note explains when the final results exist.
 */
function updateGameOverResultsLink(gameId, isSessionEnd) {
  const { gameOverResultsLinkEl, gameOverResultsNoteEl } = _deps;
  if (gameOverResultsNoteEl) {
    gameOverResultsNoteEl.hidden = !(gameId && isSessionEnd);
  }
  if (!gameOverResultsLinkEl) return;
  gameOverResultsLinkEl.hidden = !gameId;
  const query = new URLSearchParams({ results: gameId });
  const playerId = String(_deps.playerIdInput?.value || '').trim();
  if (playerId) query.set('player', playerId);
  gameOverResultsLinkEl.href = gameId ? `/index.html?${query}` : '/index.html';
}

/** Show the overlay only for a running -> finished transition of this game. */
export function isGameOverOverlayEligible({
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

export function hideGameOverOverlay() {
  if (!_deps.gameOverOverlayEl) {
    return;
  }
  _deps.gameOverOverlayEl.hidden = true;
}

export function acknowledgeGameOverOverlay(targetUrl = '/index.html') {
  try {
    hideGameOverOverlay();
    _deps.resetLiveBoardState({ clearPlayerContext: true });
  } catch (error) {
    console.error('[Game Over] Failed to reset live board state:', error);
    // Fallback: ensure overlay is hidden and navigate anyway
    try {
      _deps.gameOverOverlayEl.hidden = true;
    } catch {
      // Ignore
    }
  }
  // Always attempt navigation, even if reset failed
  try {
    window.location.assign(targetUrl);
  } catch (error) {
    console.error('[Game Over] Navigation failed:', error);
    // Last resort: use href
    window.location.href = targetUrl;
  }
}

/** Click / Enter / Space anywhere on the overlay acknowledges it. */
export function wireGameOverOverlayEvents() {
  const { gameOverOverlayEl, gameOverResultsLinkEl } = _deps;

  gameOverOverlayEl?.addEventListener('click', () => {
    acknowledgeGameOverOverlay();
  });

  // The results link resets the board like any acknowledgement, then opens the
  // lobby results view instead of the plain lobby.
  gameOverResultsLinkEl?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    acknowledgeGameOverOverlay(gameOverResultsLinkEl.getAttribute('href'));
  });

  gameOverOverlayEl?.addEventListener('keydown', (event) => {
    // Enter on the focused results link is handled by the link's own click.
    if (event.target === gameOverResultsLinkEl) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      acknowledgeGameOverOverlay();
    }
  });
}

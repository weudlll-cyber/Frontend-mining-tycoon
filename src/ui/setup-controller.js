/**
File: src/ui/setup-controller.js
Purpose: Setup-shell state of the player board: base URL resolution, round
  context, async-session diagnostics probe and the start-session status line.
Role in system:
- Upstream: board-state.js (stream/session flags), round game meta
  (src/meta/meta-manager.js), legacy host controls (setup-host-controls.js)
  and the player-auth probe (src/services/session-actions.js).
- Downstream: setup-shell.js receives the derived setup state; the injected
  `updateSetupActionsState` (src/main.js) re-renders the setup actions.
Constraints:
- Frontend is display/intent only: the probe results are hints for the setup
  UI, the backend decides whether a session may start.
- The async capability signal is the round type from meta; no OPTIONS or
  dry-run requests (CORS rejected them and a dry-run POST created sessions).
Security notes: status text via textContent; ids are never logged with tokens.
*/

import { DEFAULT_BACKEND_URL } from '../config/backend-url.js';
import { getGameMeta } from '../meta/meta-manager.js';
import { probeRequirePlayerAuth } from '../services/session-actions.js';
import { debugLog } from '../utils/debug-log.js';
import { normalizeBaseUrl } from '../utils/storage-utils.js';
import {
  createAsyncDiagnosticsProbeKey,
  resolveRequirePlayerAuthValue,
  shouldResetAsyncDiagnostics,
  shouldSkipAsyncDiagnosticsProbe,
} from './async-diagnostics.js';
import { boardState } from './board-state.js';
import {
  computeCurrentRoundContext,
  getRoundModeFromMeta,
  resolveAsyncWindowOpen,
} from './round-context.js';
import {
  getSelectedRoundType,
  setSelectedRoundType,
  shouldAutoStartAsyncSession,
} from './setup-host-controls.js';
import { setSetupShellState } from './setup-shell.js';
import {
  buildSetupShellState,
  buildStartSessionStatusClass,
} from './setup-state.js';
import { showToast } from './toast.js';

let _deps = {};
let asyncDiagnosticsProbeKey = '';
let asyncDiagnosticsProbeInFlight = null;

/**
 * @param {{ baseUrlInput, gameIdInput, playerIdInput, startSessionStatusEl,
 *   asyncHostAutoStartCheckbox, updateSetupActionsState: () => void }} deps
 */
export function initSetupController(deps) {
  _deps = deps || {};
}

export function getNormalizedBaseUrlOrNull({ notify = true } = {}) {
  const { baseUrlInput } = _deps;
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

export function getCurrentRoundContext() {
  const gameMeta = getGameMeta(_deps.gameIdInput?.value);
  return computeCurrentRoundContext({
    gameMeta,
    selectedRoundType: getSelectedRoundType(),
    isStreamActive: boardState.isStreamActive,
    latestGameStatus: boardState.latestGameStatus,
    setupRoundModeOverride: boardState.setupRoundModeOverride,
    asyncSessionSupportProbe: boardState.asyncSessionSupportProbe,
    sessionStartSupported: boardState.sessionStartSupported,
  });
}

export async function refreshAsyncDiagnostics({ force = false } = {}) {
  const { updateSetupActionsState } = _deps;
  const baseUrl = getNormalizedBaseUrlOrNull({ notify: false });
  const gameId = String(_deps.gameIdInput?.value || '').trim();
  const playerId = String(_deps.playerIdInput?.value || '').trim();
  const gameMeta = getGameMeta(gameId);
  const roundMode = getRoundModeFromMeta(gameMeta);

  boardState.asyncWindowOpen = resolveAsyncWindowOpen(gameMeta);

  if (shouldResetAsyncDiagnostics({ baseUrl, gameId, roundMode })) {
    boardState.asyncSessionSupportProbe = null;
    boardState.asyncRequirePlayerAuth = 'unknown';
    updateSetupActionsState();
    return;
  }

  // WHY: the backend meta exposes no explicit session capability and the old
  // OPTIONS / X-Dry-Run probe was rejected by CORS (and a dry-run POST would
  // create a real session). Async rounds always support POST /games/{id}/sessions,
  // so the round type from meta is the capability signal.
  boardState.asyncSessionSupportProbe = true;

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
    const authResult = playerId
      ? await probeRequirePlayerAuth({ gameId, playerId })
      : { value: 'unknown', reason: 'missing-player-id' };

    boardState.asyncRequirePlayerAuth =
      resolveRequirePlayerAuthValue(authResult);

    debugLog('async-diagnostics', 'probe results', {
      gameId,
      roundMode,
      windowOpen: boardState.asyncWindowOpen,
      sessionApiSupported: boardState.asyncSessionSupportProbe,
      requirePlayerAuth: boardState.asyncRequirePlayerAuth,
      authProbeCode: authResult?.code ?? null,
    });
  })()
    .catch(() => {
      boardState.asyncRequirePlayerAuth = 'unknown';
    })
    .finally(() => {
      asyncDiagnosticsProbeInFlight = null;
      updateSetupActionsState();
    });
}

/** Push the derived setup state into setup-shell.js. */
export function syncSetupShellState() {
  const roundContext = getCurrentRoundContext();
  const nextSetupState = buildSetupShellState({
    isStreamActive: boardState.isStreamActive,
    isSetupBusy: boardState.isSetupBusy,
    latestGameStatus: boardState.latestGameStatus,
    roundMode: roundContext.roundMode,
    sessionStartSupported: roundContext.supportsSessionStart,
    sessionApiSupported: boardState.asyncSessionSupportProbe,
    asyncWindowOpen: boardState.asyncWindowOpen,
    requirePlayerAuth: boardState.asyncRequirePlayerAuth,
    activeSession: boardState.activeSession,
    hostRoundType: getSelectedRoundType(),
    asyncHostAutoStart: shouldAutoStartAsyncSession(),
  });
  setSetupShellState(nextSetupState);
}

export function setStartSessionStatus(message = '', type = 'info') {
  const { startSessionStatusEl } = _deps;
  if (!startSessionStatusEl) return;
  startSessionStatusEl.textContent = message;
  startSessionStatusEl.className = buildStartSessionStatusClass(message, type);
}

/** Test hook (re-exported by src/main.js): force setup-relevant state. */
export function setSetupStateForTests({
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
  const { asyncHostAutoStartCheckbox } = _deps;
  if (typeof streamActive === 'boolean') {
    boardState.isStreamActive = streamActive;
  }
  if (typeof gameStatus === 'string' || gameStatus === null) {
    boardState.latestGameStatus = gameStatus;
  }
  if (typeof setupBusy === 'boolean') {
    boardState.isSetupBusy = setupBusy;
  }
  if (roundMode === 'sync' || roundMode === 'async') {
    boardState.setupRoundModeOverride = roundMode;
  } else {
    boardState.setupRoundModeOverride = null;
  }
  if (hostRoundType === 'sync' || hostRoundType === 'async') {
    setSelectedRoundType(hostRoundType);
  }
  if (typeof asyncAutoStart === 'boolean' && asyncHostAutoStartCheckbox) {
    asyncHostAutoStartCheckbox.checked = asyncAutoStart;
  }
  if (typeof supportsSessionStart === 'boolean') {
    boardState.sessionStartSupported = supportsSessionStart;
  }
  if (typeof windowOpen === 'boolean' || windowOpen === null) {
    boardState.asyncWindowOpen = windowOpen;
  }
  if (
    typeof sessionApiSupported === 'boolean' ||
    sessionApiSupported === null
  ) {
    boardState.asyncSessionSupportProbe = sessionApiSupported;
  }
  if (
    requirePlayerAuth === true ||
    requirePlayerAuth === false ||
    requirePlayerAuth === 'unknown'
  ) {
    boardState.asyncRequirePlayerAuth = requirePlayerAuth;
  }
  if (sessionId === null) {
    boardState.activeSession = null;
  } else if (sessionId !== undefined) {
    const { activeSession } = boardState;
    boardState.activeSession = {
      sessionId,
      sessionStartUnix: activeSession?.sessionStartUnix || null,
      sessionDurationSec: activeSession?.sessionDurationSec || null,
      requiresPlayerAuth: Boolean(activeSession?.requiresPlayerAuth),
    };
  }
  _deps.updateSetupActionsState();
}

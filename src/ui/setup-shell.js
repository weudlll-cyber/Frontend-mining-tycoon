/**
File: src/ui/setup-shell.js
Purpose: Manage setup-shell visibility and setup action state while preserving user intent.
Role in system:
- Keeps setup actions explicit while leaving all session policy enforcement to the backend.
- Owns inline header interactions, including the non-modal debug panel toggle.
Constraints:
- Setup must not flicker-close from repeated SSE updates once the user re-opens it.
- Async session discoverability must remain explicit with non-blocking status messaging.
- Frontend remains intent/display only; server policy decides session eligibility.
Security notes:
- Render status via textContent only.
*/

import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';

let _refs = null;
let _state = {
  isStreamActive: false,
  isSetupBusy: false,
  latestGameStatus: null,
  roundMode: 'sync',
  sessionStartSupported: true,
  sessionApiSupported: null,
  asyncWindowOpen: null,
  requirePlayerAuth: 'unknown',
  sessionActive: false,
  sessionId: null,
  userOpenedSetup: false,
  didAutoCloseAtPlayStart: false,
  previousGameStatus: null,
  hostRoundType: 'sync',
  asyncHostAutoStart: true,
};

const ASYNC_DIAGNOSTIC_CHIPS = [
  {
    key: 'isAsyncRound',
    label: 'Async',
    meaning: 'Round mode is asynchronous.',
  },
  {
    key: 'isWindowOpen',
    label: 'Window',
    meaning: 'Session start window is open for this round.',
  },
  {
    key: 'isJoined',
    label: 'Joined',
    meaning: 'A player is joined for this game (Player ID present).',
  },
  {
    key: 'backendSessionSupport',
    label: 'SessionAPI',
    meaning: 'Backend supports async session creation and tickets.',
  },
  {
    key: 'hasNoActiveSession',
    label: 'NoSession',
    meaning: 'No active async session currently exists for this player.',
  },
  {
    key: 'requireAuth',
    label: 'Auth',
    meaning: 'Backend requires player auth token for session endpoints.',
  },
];

function formatAsyncChipTitle(chipConfig, chipValue) {
  const valueText = chipValue === null ? 'unknown' : String(chipValue);
  if (chipConfig.key === 'requireAuth') {
    if (chipValue === true) {
      return `${chipConfig.meaning} Current: required.`;
    }
    if (chipValue === false) {
      return `${chipConfig.meaning} Current: not required (backend auth disabled).`;
    }
    return `${chipConfig.meaning} Current: unknown. This is checked only after async diagnostics can probe with Backend URL, Game ID, and Player ID.`;
  }
  return `${chipConfig.meaning} Current: ${valueText}.`;
}

export function initSetupShell(deps) {
  _refs = deps;
  applyStoredDebugPanelState();
}

export function setSetupShellState(partial = {}) {
  _state = {
    ..._state,
    ...partial,
  };
}

function hasActiveGame() {
  return Boolean(_refs?.gameIdInput?.value && _refs.gameIdInput.value.trim());
}

function hasActivePlayer() {
  return Boolean(
    _refs?.playerIdInput?.value && _refs.playerIdInput.value.trim()
  );
}

function updateRoundModeBadge() {
  if (!_refs?.roundModeBadgeEl) return;
  const roundMode = _state.roundMode === 'async' ? 'async' : 'sync';
  const badge = _refs.roundModeBadgeEl;
  badge.textContent = roundMode === 'async' ? 'Round: Async' : 'Round: Sync';
  badge.classList.toggle('round-mode-badge--async', roundMode === 'async');
  badge.classList.toggle('round-mode-badge--sync', roundMode !== 'async');
}

function updateAsyncSessionStatusBadge() {
  if (typeof _refs?.renderAsyncSessionBadge !== 'function') return;
  const availability = getAsyncAvailability();
  const isAsyncReady =
    availability.isAsyncRound &&
    availability.isJoined &&
    availability.backendSessionSupport === true &&
    availability.hasNoActiveSession;

  _refs.renderAsyncSessionBadge({
    roundMode: _state.roundMode,
    sessionActive: _state.sessionActive,
    sessionSupported: _state.sessionStartSupported,
    asyncReady: isAsyncReady,
    asyncAvailability: availability,
  });
}

function getAsyncAvailability() {
  const isAsyncRound = _state.roundMode === 'async';
  return {
    isAsyncRound,
    // WHY: Backend async model has no enrollment window; keep this diagnostic predicate always satisfied in async mode.
    isWindowOpen: isAsyncRound ? true : null,
    isJoined: hasActivePlayer(),
    backendSessionSupport:
      typeof _state.sessionApiSupported === 'boolean'
        ? _state.sessionApiSupported
        : _state.sessionStartSupported === true
          ? true
          : null,
    hasNoActiveSession: !_state.sessionActive && !_state.sessionId,
    requireAuth:
      _state.requirePlayerAuth === true || _state.requirePlayerAuth === false
        ? _state.requirePlayerAuth
        : 'unknown',
  };
}

function ensureAsyncDiagnosticsContainer() {
  if (_refs?.asyncDiagnosticsEl) {
    return _refs.asyncDiagnosticsEl;
  }
  const host = _refs?.roundModeBadgeEl?.parentElement;
  if (!host || !_refs?.roundModeBadgeEl) {
    return null;
  }

  const container = document.createElement('span');
  container.className = 'async-diagnostics-chips';
  container.setAttribute('aria-label', 'Async availability diagnostics');
  host.appendChild(container);
  _refs.asyncDiagnosticsEl = container;
  return container;
}

function renderAsyncAvailabilityChips() {
  const container = ensureAsyncDiagnosticsContainer();
  if (!container) return;

  const availability = getAsyncAvailability();
  container.textContent = '';

  ASYNC_DIAGNOSTIC_CHIPS.forEach((chipConfig) => {
    const chip = document.createElement('span');
    const chipValue = availability[chipConfig.key];
    const isSatisfied =
      chipConfig.key === 'requireAuth'
        ? chipValue === true
        : chipValue === true;
    const icon = isSatisfied ? '✔' : '○';

    chip.className = isSatisfied
      ? 'async-diagnostic-chip async-diagnostic-chip--ok'
      : 'async-diagnostic-chip async-diagnostic-chip--dim';
    chip.textContent = `${icon} ${chipConfig.label}`;
    chip.title = formatAsyncChipTitle(chipConfig, chipValue);
    container.appendChild(chip);
  });
}

export function updateSetupActionsState() {
  if (!_refs) return;

  const hostRoundType = _state.hostRoundType === 'async' ? 'async' : 'sync';
  const showAsyncHostControls = hostRoundType === 'async';
  const showSyncHostControls = !showAsyncHostControls;

  if (_refs.syncHostControlsEl) {
    _refs.syncHostControlsEl.hidden = !showSyncHostControls;
  }

  if (_refs.asyncHostControlsEl) {
    _refs.asyncHostControlsEl.hidden = !showAsyncHostControls;
  }
  if (_refs.asyncHostAutoStartCheckbox) {
    _refs.asyncHostAutoStartCheckbox.checked =
      _state.asyncHostAutoStart !== false;
  }

  const gameRunning = _state.latestGameStatus === 'running';
  const gameFinished = _state.latestGameStatus === 'finished';
  const hasKnownGameStatus = ['enrolling', 'running', 'finished'].includes(
    String(_state.latestGameStatus || '').toLowerCase()
  );
  const gameExists = hasActiveGame();
  const availability = getAsyncAvailability();
  const isAsyncRound = availability.isAsyncRound;
  const isSessionReady =
    availability.isAsyncRound &&
    availability.isJoined &&
    availability.backendSessionSupport === true &&
    availability.hasNoActiveSession;
  const isSessionApiBlocked =
    availability.backendSessionSupport === false ||
    !_state.sessionStartSupported;

  updateRoundModeBadge();
  updateAsyncSessionStatusBadge();
  renderAsyncAvailabilityChips();

  if (_refs.newGameBtn) {
    _refs.newGameBtn.disabled = _state.isSetupBusy || gameRunning;
  }

  if (_refs.startBtn) {
    // WHY: Async rounds must always open a session-scoped stream and cannot use the legacy game stream.
    const requiresSessionStart = isAsyncRound && !_state.sessionActive;
    _refs.startBtn.disabled =
      _state.isSetupBusy ||
      !gameExists ||
      gameFinished ||
      _state.isStreamActive ||
      requiresSessionStart;
  }

  if (_refs.startSessionBtn) {
    _refs.startSessionBtn.hidden = !isAsyncRound;
    _refs.startSessionBtn.disabled =
      _state.isSetupBusy ||
      !isAsyncRound ||
      !gameExists ||
      gameFinished ||
      !availability.isJoined ||
      !availability.hasNoActiveSession ||
      _state.isStreamActive ||
      isSessionApiBlocked;
    _refs.startSessionBtn.title = !_state.sessionStartSupported
      ? 'Async session endpoint is unavailable on backend.'
      : '';
  }

  if (_refs.stopBtn) {
    _refs.stopBtn.disabled = _state.isSetupBusy || !_state.isStreamActive;
  }

  if (!_refs.setupActionsNoteEl) return;

  if (_state.isSetupBusy) {
    _refs.setupActionsNoteEl.textContent = 'Working... please wait.';
    return;
  }

  if (gameRunning) {
    _refs.setupActionsNoteEl.textContent =
      'A game is currently running. Stop the stream to create a new game.';
    return;
  }

  if (gameFinished) {
    _refs.setupActionsNoteEl.textContent =
      'This game is finished. Create a new game to start another async session.';
    return;
  }

  if (!gameExists) {
    _refs.setupActionsNoteEl.textContent =
      'Create a game first, then Start Stream to join the live board.';
    return;
  }

  const sessionStatusText = String(
    _refs.startSessionStatusEl?.textContent || ''
  ).trim();
  const sessionStatusClass = String(
    _refs.startSessionStatusEl?.className || ''
  );
  const hasSessionStartWarning =
    sessionStatusText.length > 0 &&
    (sessionStatusClass.includes('setup-session-status--warning') ||
      sessionStatusClass.includes('setup-session-status--error'));

  if (isAsyncRound && hasSessionStartWarning) {
    _refs.setupActionsNoteEl.textContent =
      'Session start failed. Check the message above and retry.';
    return;
  }

  if (isAsyncRound && !_state.sessionStartSupported) {
    _refs.setupActionsNoteEl.textContent =
      'Async session endpoint is unavailable on backend.';
    return;
  }

  if (isAsyncRound && _state.sessionActive) {
    _refs.setupActionsNoteEl.textContent =
      'Async session active. Use Start Stream to reconnect the session view.';
    return;
  }

  if (isAsyncRound && _state.sessionStartSupported) {
    if (!isSessionReady) {
      _refs.setupActionsNoteEl.textContent =
        'Async session gating active. Check header chips (gray chips show blocking predicates).';
      return;
    }

    if (!hasKnownGameStatus) {
      _refs.setupActionsNoteEl.textContent =
        'Optional: Start Session (Async) to reconnect this game, or click + New Game for a fresh round.';
      return;
    }

    _refs.setupActionsNoteEl.textContent =
      'Start Session (Async) first, then stream uses the session-scoped channel.';
    return;
  }

  if (_state.isStreamActive) {
    _refs.setupActionsNoteEl.textContent =
      'Stream is active. Use Stop Stream to disconnect safely.';
    return;
  }

  _refs.setupActionsNoteEl.textContent = isAsyncRound
    ? 'Ready: start a session for async round streaming.'
    : 'Ready: start stream or create a new game.';
}

export function setSetupStateForTests(partial = {}) {
  setSetupShellState(partial);
  updateSetupActionsState();
}

export function renderDebugContext() {
  if (!_refs) return;

  if (_refs.debugBackendUrlEl) {
    _refs.debugBackendUrlEl.textContent = _refs.baseUrlInput?.value || '—';
  }
  if (_refs.debugGameIdEl) {
    _refs.debugGameIdEl.textContent = _refs.gameIdInput?.value || '—';
  }
  if (_refs.debugPlayerIdEl) {
    _refs.debugPlayerIdEl.textContent = _refs.playerIdInput?.value || '—';
  }
  if (_refs.debugSessionIdEl) {
    const debugOpen = isDebugPanelExpanded();
    _refs.debugSessionIdEl.textContent =
      debugOpen && _state.sessionId ? String(_state.sessionId) : '—';
  }
}

function isDebugPanelExpanded() {
  return Boolean(_refs?.debugPanelEl && !_refs.debugPanelEl.hidden);
}

function setDebugToggleExpandedAttribute(isExpanded) {
  if (!_refs?.debugToggleBtnEl) return;
  _refs.debugToggleBtnEl.setAttribute(
    'aria-expanded',
    isExpanded ? 'true' : 'false'
  );
  _refs.debugToggleBtnEl.setAttribute(
    'aria-label',
    isExpanded ? 'Collapse debug panel' : 'Expand debug panel'
  );
}

function setDebugPanelExpanded(isExpanded, { persist = true } = {}) {
  if (!_refs?.debugPanelEl) return;

  _refs.debugPanelEl.hidden = !isExpanded;
  _refs.debugPanelEl.classList.toggle('debug-panel-open', isExpanded);
  setDebugToggleExpandedAttribute(isExpanded);

  // WHY: Persisting explicit user intent keeps SSE refreshes from resetting panel visibility.
  if (persist) {
    setStorageItem(STORAGE_KEYS.debugPanelOpen, isExpanded ? 'true' : 'false');
  }

  renderDebugContext();
}

function toggleDebugPanel() {
  setDebugPanelExpanded(!isDebugPanelExpanded());
}

function applyStoredDebugPanelState() {
  const stored = getStorageItem(STORAGE_KEYS.debugPanelOpen);
  const shouldExpand = stored === 'true';
  setDebugPanelExpanded(shouldExpand, { persist: false });
}

export function setSetupCollapsed(isCollapsed) {
  return setSetupCollapsedWithSource(isCollapsed, 'system');
}

function setSetupCollapsedWithSource(isCollapsed, source = 'system') {
  if (!_refs?.setupShellEl) return;

  // Preserve user preference so SSE updates do not repeatedly override explicit opens.
  if (source === 'user') {
    _state.userOpenedSetup = !isCollapsed;
  }

  _refs.setupShellEl.classList.toggle('setup-collapsed', isCollapsed);
  _refs.setupShellEl.classList.toggle('setup-open', !isCollapsed);

  if (_refs.setupToggleBtnEl) {
    _refs.setupToggleBtnEl.setAttribute(
      'aria-expanded',
      isCollapsed ? 'false' : 'true'
    );
    _refs.setupToggleBtnEl.textContent = isCollapsed
      ? 'Menu / Setup'
      : 'Hide Setup';
  }
}

export function toggleSetupCollapsed() {
  const shouldCollapse = Boolean(
    !_refs?.setupShellEl ||
    !_refs.setupShellEl.classList.contains('setup-collapsed')
  );
  setSetupCollapsedWithSource(shouldCollapse, 'user');
}

export function autoCollapseSetupForLiveState(
  gameStatus = _state.latestGameStatus
) {
  const previous = _state.previousGameStatus;
  _state.previousGameStatus = gameStatus;

  if (gameStatus !== 'running') {
    _state.didAutoCloseAtPlayStart = false;
    return;
  }

  const enteredRunning = previous !== 'running';
  if (!enteredRunning || _state.didAutoCloseAtPlayStart) {
    return;
  }

  // Auto-close only once at pre-play -> running transition, unless user explicitly opened setup.
  if (_state.userOpenedSetup) {
    _state.didAutoCloseAtPlayStart = true;
    return;
  }

  setSetupCollapsedWithSource(true, 'system');
  _state.didAutoCloseAtPlayStart = true;
}

export function scrollToLiveBoard() {
  if (!_refs?.liveBoardEl) return;

  setSetupCollapsed(true);

  if (!_refs.liveBoardEl.hasAttribute('tabindex')) {
    _refs.liveBoardEl.setAttribute('tabindex', '-1');
  }

  try {
    _refs.liveBoardEl.focus({ preventScroll: true });
  } catch {
    _refs.liveBoardEl.focus();
  }

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  _refs.liveBoardEl.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

export function initializeHeaderInteractions() {
  if (!_refs) return;
  _refs.setupToggleBtnEl?.addEventListener('click', toggleSetupCollapsed);
  _refs.jumpLiveBtnEl?.addEventListener('click', scrollToLiveBoard);
  _refs.jumpLiveBtnSetupEl?.addEventListener('click', scrollToLiveBoard);
  _refs.startSessionBtn?.addEventListener('click', () => {
    if (_refs.startSessionBtn.disabled) return;
    _refs.onStartAsyncSession?.();
  });
  _refs.roundTypeSyncInput?.addEventListener('change', () => {
    if (!_refs.roundTypeSyncInput.checked) return;
    // WHY: Keep host round-type selection explicit in setup so create payload stays user-driven.
    _refs.onHostRoundTypeChanged?.('sync');
  });
  _refs.roundTypeAsyncInput?.addEventListener('change', () => {
    if (!_refs.roundTypeAsyncInput.checked) return;
    _refs.onHostRoundTypeChanged?.('async');
  });
  _refs.asyncHostDurationPresetInput?.addEventListener('change', () => {
    _refs.onHostAsyncDurationChanged?.(
      _refs.asyncHostDurationPresetInput.value || '5m'
    );
  });
  _refs.asyncSessionDurationPresetInput?.addEventListener('change', () => {
    _refs.onHostAsyncDurationChanged?.('custom');
  });
  _refs.asyncHostAutoStartCheckbox?.addEventListener('change', () => {
    _refs.onHostAutoStartChanged?.(
      Boolean(_refs.asyncHostAutoStartCheckbox.checked)
    );
  });
  _refs.debugToggleBtnEl?.addEventListener('click', toggleDebugPanel);
}

export function ensureInputsEditable() {
  if (!_refs?.editableInputs) return;

  _refs.editableInputs.forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

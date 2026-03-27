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
  applyStoredDebugPanelState as applyStoredDebugPanelStateManaged,
  renderDebugContext as renderDebugContextManaged,
  toggleDebugPanel as toggleDebugPanelManaged,
} from './debug-panel-manager.js';
import {
  getAsyncAvailability,
  renderAsyncAvailabilityChips as renderAsyncAvailabilityChipsManaged,
  renderAsyncSessionStatusBadge,
} from './setup-async-diagnostics.js';

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

export function initSetupShell(deps) {
  _refs = deps;
  applyStoredDebugPanelStateManaged(_refs, _state);
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
  const availability = getCurrentAsyncAvailability();
  renderAsyncSessionStatusBadge(_refs, _state, availability);
}

function getCurrentAsyncAvailability() {
  return getAsyncAvailability(_state, hasActivePlayer());
}

function renderAsyncAvailabilityChips() {
  const availability = getCurrentAsyncAvailability();
  renderAsyncAvailabilityChipsManaged(_refs, availability);
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
  const availability = getCurrentAsyncAvailability();
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
      'Enter a game ID from Admin Setup, then Start Stream to join the live board.';
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
        'Optional: Start Session (Async) to reconnect this game.';
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
    : 'Ready: start stream for this game.';
}

export function setSetupStateForTests(partial = {}) {
  setSetupShellState(partial);
  updateSetupActionsState();
}

export function renderDebugContext() {
  renderDebugContextManaged(_refs, _state);
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
  _refs.debugToggleBtnEl?.addEventListener('click', () =>
    toggleDebugPanelManaged(_refs, _state)
  );
}

export function ensureInputsEditable() {
  if (!_refs?.editableInputs) return;

  _refs.editableInputs.forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

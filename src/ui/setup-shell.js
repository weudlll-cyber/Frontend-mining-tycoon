/*
File: src/ui/setup-shell.js
Purpose: Manage setup-shell visibility and setup action state while preserving user intent.
Constraints:
- Setup must not flicker-close from repeated SSE updates once the user re-opens it.
- Async session discoverability must remain explicit with non-blocking status messaging.
*/

let _refs = null;
let _state = {
  isStreamActive: false,
  isSetupBusy: false,
  latestGameStatus: null,
  roundMode: 'sync',
  sessionStartSupported: true,
  userOpenedSetup: false,
  didAutoCloseAtPlayStart: false,
  previousGameStatus: null,
};

export function initSetupShell(deps) {
  _refs = deps;
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
  if (!_refs?.asyncSessionStatusEl) return;

  const isAsyncRound = _state.roundMode === 'async';
  const badge = _refs.asyncSessionStatusEl;
  if (!isAsyncRound) {
    badge.hidden = true;
    badge.textContent = 'Async: n/a';
    badge.classList.remove('badge-yellow', 'badge-blue');
    badge.classList.add('badge-gray');
    return;
  }

  badge.hidden = false;
  badge.classList.remove('badge-gray', 'badge-blue', 'badge-yellow');
  if (_state.sessionStartSupported) {
    badge.textContent = 'Async: Session Ready';
    badge.classList.add('badge-blue');
  } else {
    badge.textContent = 'Async: Legacy View';
    badge.classList.add('badge-yellow');
  }
}

export function updateSetupActionsState() {
  if (!_refs) return;

  const gameRunning = _state.latestGameStatus === 'running';
  const gameExists = hasActiveGame();
  const playerExists = hasActivePlayer();
  const isAsyncRound = _state.roundMode === 'async';
  const isRoundWindowOpen =
    !_state.isStreamActive &&
    (_state.latestGameStatus === 'idle' ||
      _state.latestGameStatus === 'enrolling' ||
      _state.latestGameStatus === null);

  updateRoundModeBadge();
  updateAsyncSessionStatusBadge();

  if (_refs.newGameBtn) {
    _refs.newGameBtn.disabled = _state.isSetupBusy || gameRunning;
  }

  if (_refs.startBtn) {
    _refs.startBtn.disabled =
      _state.isSetupBusy || !gameExists || _state.isStreamActive;
  }

  if (_refs.startSessionBtn) {
    _refs.startSessionBtn.hidden = !isAsyncRound;
    _refs.startSessionBtn.disabled =
      _state.isSetupBusy ||
      !isAsyncRound ||
      !isRoundWindowOpen ||
      !gameExists ||
      !playerExists ||
      _state.isStreamActive ||
      !_state.sessionStartSupported;
    _refs.startSessionBtn.title = !_state.sessionStartSupported
      ? 'Async sessions not supported by backend (using legacy live view).'
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

  if (isAsyncRound && !_state.sessionStartSupported) {
    _refs.setupActionsNoteEl.textContent =
      'Async sessions not supported by backend (using legacy live view).';
    return;
  }

  if (!gameExists) {
    _refs.setupActionsNoteEl.textContent =
      'Create a game first, then Start Stream to join the live board.';
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
}

export function ensureInputsEditable() {
  if (!_refs?.editableInputs) return;

  _refs.editableInputs.forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

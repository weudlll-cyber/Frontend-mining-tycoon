/*
File: src/ui/setup-shell.js
Purpose: Manage setup-shell visibility, setup action button state, and header navigation.
*/

let _refs = null;
let _state = {
  isStreamActive: false,
  isSetupBusy: false,
  latestGameStatus: null,
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

export function updateSetupActionsState() {
  if (!_refs) return;

  const gameRunning = _state.latestGameStatus === 'running';
  const gameExists = hasActiveGame();

  if (_refs.newGameBtn) {
    _refs.newGameBtn.disabled = _state.isSetupBusy || gameRunning;
  }

  if (_refs.startBtn) {
    _refs.startBtn.disabled =
      _state.isSetupBusy || !gameExists || _state.isStreamActive;
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

  _refs.setupActionsNoteEl.textContent =
    'Ready: start stream or create a new game.';
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
  if (!_refs?.setupShellEl) return;

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
  const shouldCollapse =
    !_refs?.setupShellEl ||
    !_refs.setupShellEl.classList.contains('setup-collapsed');
  setSetupCollapsed(shouldCollapse);
}

export function autoCollapseSetupForLiveState(
  gameStatus = _state.latestGameStatus
) {
  if (gameStatus === 'running' || gameStatus === 'finished') {
    setSetupCollapsed(true);
  }
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

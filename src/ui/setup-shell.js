/*
File: src/ui/setup-shell.js
Purpose: Manage setup-shell visibility and setup action state while preserving user intent.
Role in system:
- Keeps setup actions explicit while leaving all session policy enforcement to the backend.
Constraints:
- Setup must not flicker-close from repeated SSE updates once the user re-opens it.
- Async session discoverability must remain explicit with non-blocking status messaging.
- Frontend remains intent/display only; server policy decides session eligibility.
Security notes:
- Render status via textContent only.
*/

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
  { key: 'isAsyncRound', label: 'Async' },
  { key: 'isWindowOpen', label: 'Window' },
  { key: 'isJoined', label: 'Joined' },
  { key: 'backendSessionSupport', label: 'SessionAPI' },
  { key: 'hasNoActiveSession', label: 'NoSession' },
  { key: 'requireAuth', label: 'Auth' },
];

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
  if (typeof _refs?.renderAsyncSessionBadge !== 'function') return;
  const availability = getAsyncAvailability();
  const isAsyncReady =
    availability.isAsyncRound &&
    availability.isWindowOpen === true &&
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
  return {
    isAsyncRound: _state.roundMode === 'async',
    isWindowOpen:
      typeof _state.asyncWindowOpen === 'boolean'
        ? _state.asyncWindowOpen
        : null,
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
    chip.title = isSatisfied
      ? `${chipConfig.key}: true`
      : `${chipConfig.key}: ${chipValue === null ? 'unknown' : String(chipValue)}`;
    container.appendChild(chip);
  });
}

export function updateSetupActionsState() {
  if (!_refs) return;

  const hostRoundType = _state.hostRoundType === 'async' ? 'async' : 'sync';
  const showAsyncHostControls = hostRoundType === 'async';

  if (_refs.asyncHostControlsEl) {
    _refs.asyncHostControlsEl.hidden = !showAsyncHostControls;
  }
  if (_refs.asyncHostAutoStartCheckbox) {
    _refs.asyncHostAutoStartCheckbox.checked =
      _state.asyncHostAutoStart !== false;
  }
  if (_refs.asyncHostDurationPresetInput && _refs.asyncHostDurationCustomEl) {
    _refs.asyncHostDurationCustomEl.hidden =
      _refs.asyncHostDurationPresetInput.value !== 'custom';
  }

  const gameRunning = _state.latestGameStatus === 'running';
  const gameExists = hasActiveGame();
  const availability = getAsyncAvailability();
  const isAsyncRound = availability.isAsyncRound;
  const isSessionReady =
    availability.isAsyncRound &&
    availability.isWindowOpen === true &&
    availability.isJoined &&
    availability.backendSessionSupport === true &&
    availability.hasNoActiveSession;
  const isWindowBlocked = availability.isWindowOpen === false;
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
    const requiresSessionStart =
      isAsyncRound && _state.sessionStartSupported && !_state.sessionActive;
    // WHY: Async rounds must complete the explicit session-start step before the stream transport can open.
    _refs.startBtn.disabled =
      _state.isSetupBusy ||
      !gameExists ||
      _state.isStreamActive ||
      requiresSessionStart;
  }

  if (_refs.startSessionBtn) {
    _refs.startSessionBtn.hidden = !isAsyncRound;
    _refs.startSessionBtn.disabled =
      _state.isSetupBusy ||
      !isAsyncRound ||
      !gameExists ||
      !availability.isJoined ||
      !availability.hasNoActiveSession ||
      isWindowBlocked ||
      _state.isStreamActive ||
      isSessionApiBlocked;
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

    _refs.setupActionsNoteEl.textContent =
      'Start Session (Async) first, then stream uses the session-scoped channel.';
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
  if (_refs.debugSessionIdEl) {
    const debugOpen = Boolean(_refs.debugDetailsEl?.open);
    _refs.debugSessionIdEl.textContent =
      debugOpen && _state.sessionId ? String(_state.sessionId) : '—';
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
  _refs.asyncHostDurationCustomMinutesInput?.addEventListener('change', () => {
    _refs.onHostAsyncDurationChanged?.('custom');
  });
  _refs.asyncHostAutoStartCheckbox?.addEventListener('change', () => {
    _refs.onHostAutoStartChanged?.(
      Boolean(_refs.asyncHostAutoStartCheckbox.checked)
    );
  });
  _refs.debugDetailsEl?.addEventListener('toggle', renderDebugContext);
}

export function ensureInputsEditable() {
  if (!_refs?.editableInputs) return;

  _refs.editableInputs.forEach((el) => {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
  });
}

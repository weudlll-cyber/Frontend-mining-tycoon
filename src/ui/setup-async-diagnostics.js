/**
File: src/ui/setup-async-diagnostics.js
Purpose: Provide async availability diagnostics for the setup shell.
*/

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

export function getAsyncAvailability(state, hasActivePlayer) {
  const isAsyncRound = state.roundMode === 'async';
  return {
    isAsyncRound,
    // WHY: Backend async model has no enrollment window; keep this diagnostic predicate always satisfied in async mode.
    isWindowOpen: isAsyncRound ? true : null,
    isJoined: hasActivePlayer,
    backendSessionSupport:
      typeof state.sessionApiSupported === 'boolean'
        ? state.sessionApiSupported
        : state.sessionStartSupported === true
          ? true
          : null,
    hasNoActiveSession: !state.sessionActive && !state.sessionId,
    requireAuth:
      state.requirePlayerAuth === true || state.requirePlayerAuth === false
        ? state.requirePlayerAuth
        : 'unknown',
  };
}

export function renderAsyncSessionStatusBadge(refs, state, availability) {
  if (typeof refs?.renderAsyncSessionBadge !== 'function') return;
  const isAsyncReady =
    availability.isAsyncRound &&
    availability.isJoined &&
    availability.backendSessionSupport === true &&
    availability.hasNoActiveSession;

  refs.renderAsyncSessionBadge({
    roundMode: state.roundMode,
    sessionActive: state.sessionActive,
    sessionSupported: state.sessionStartSupported,
    asyncReady: isAsyncReady,
    asyncAvailability: availability,
  });
}

export function renderAsyncAvailabilityChips(refs, availability) {
  const container = ensureAsyncDiagnosticsContainer(refs);
  if (!container) return;

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

function ensureAsyncDiagnosticsContainer(refs) {
  if (refs?.asyncDiagnosticsEl) {
    return refs.asyncDiagnosticsEl;
  }
  const host = refs?.roundModeBadgeEl?.parentElement;
  if (!host || !refs?.roundModeBadgeEl) {
    return null;
  }

  const container = document.createElement('span');
  container.className = 'async-diagnostics-chips';
  container.setAttribute('aria-label', 'Async availability diagnostics');
  host.appendChild(container);
  refs.asyncDiagnosticsEl = container;
  return container;
}

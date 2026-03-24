/*
File: src/ui/setup-state.js
Purpose: Pure setup-shell state builders used by main orchestration.
*/

export function buildSetupShellState({
  isStreamActive,
  isSetupBusy,
  latestGameStatus,
  roundMode,
  sessionStartSupported,
  sessionApiSupported,
  asyncWindowOpen,
  requirePlayerAuth,
  activeSession,
  hostRoundType,
  asyncHostAutoStart,
}) {
  return {
    isStreamActive,
    isSetupBusy,
    latestGameStatus,
    roundMode,
    sessionStartSupported,
    sessionApiSupported,
    asyncWindowOpen,
    requirePlayerAuth,
    sessionActive: Boolean(activeSession?.sessionId),
    sessionId: activeSession?.sessionId || null,
    hostRoundType,
    asyncHostAutoStart,
  };
}

export function buildStartSessionStatusClass(message = '', type = 'info') {
  return message
    ? `setup-session-status setup-session-status--${type}`
    : 'setup-session-status';
}

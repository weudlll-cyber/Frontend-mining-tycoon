/*
File: src/ui/ui-update-state.js
Purpose: Pure state helpers for UI update/render orchestration.
*/

export function deriveStreamSessionState({ activeSession, streamSession }) {
  const streamSessionStatus = String(streamSession?.status || '').toLowerCase();
  const streamSessionIdRaw = streamSession?.session_id;
  const streamSessionId =
    streamSessionIdRaw === null || streamSessionIdRaw === undefined
      ? ''
      : String(streamSessionIdRaw).trim();
  const streamSessionRunning =
    streamSessionStatus === 'running' && streamSessionId.length > 0;
  const hasExplicitSessionSignal =
    streamSessionId.length > 0 || streamSessionStatus.length > 0;

  let shouldClearActiveSession = false;
  if (activeSession?.sessionId) {
    const localSessionId = String(activeSession.sessionId);
    const thisSessionEndedExplicitly =
      streamSessionId === localSessionId && !streamSessionRunning;
    const differentSessionTookOver =
      streamSessionId.length > 0 &&
      streamSessionId !== localSessionId &&
      streamSessionRunning;
    shouldClearActiveSession =
      thisSessionEndedExplicitly || differentSessionTookOver;
  }

  const hasActiveSession =
    Boolean(activeSession?.sessionId) &&
    Number.isFinite(activeSession?.sessionStartUnix) &&
    (streamSessionRunning || !hasExplicitSessionSignal);

  return {
    streamSessionRunning,
    hasExplicitSessionSignal,
    shouldClearActiveSession,
    hasActiveSession,
    elapsedFromPayload: Number(streamSession?.session_elapsed_seconds),
  };
}

export function resolveCountdownMode({ gameStatus, hasActiveSession }) {
  if (hasActiveSession) return 'session';
  if (gameStatus === 'enrolling') return 'enrolling';
  if (gameStatus === 'running') return 'running';
  if (gameStatus === 'finished') return 'finished';
  return null;
}

export function stampIncomingUiData(data, nowMs = Date.now()) {
  if (!data || typeof data !== 'object') {
    return {
      stampedData: data,
      latestGameStatus: null,
    };
  }

  const stampedData = {
    ...data,
    timestamp: nowMs,
  };

  return {
    stampedData,
    latestGameStatus: stampedData?.game_status || null,
  };
}

export function shouldScheduleUiRender(pendingUiRenderFrame) {
  return pendingUiRenderFrame === null;
}

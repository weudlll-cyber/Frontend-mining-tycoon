/*
File: src/ui/session-timers.js
Purpose: Pure calculations used by async session and round hint timer orchestration.
*/

export function computeRoundRemainingSeconds(lastGameData, nowMs = Date.now()) {
  const remaining = Number(lastGameData?.seconds_remaining);
  if (!Number.isFinite(remaining)) {
    return null;
  }

  const streamAge = (nowMs - (lastGameData?.timestamp ?? nowMs)) / 1000;
  return Math.max(0, remaining - streamAge);
}

export function normalizeSessionTimerInputs(sessionStartUnix, initialElapsedSeconds) {
  if (!Number.isFinite(sessionStartUnix)) {
    return null;
  }

  const normalizedStartUnix = Number(sessionStartUnix);
  const normalizedInitialElapsed = Number(initialElapsedSeconds);
  return {
    normalizedStartUnix,
    nextInitialElapsed: Number.isFinite(normalizedInitialElapsed)
      ? normalizedInitialElapsed
      : 0,
  };
}

export function shouldReuseSessionElapsedTimer({
  sessionElapsedInterval,
  sessionElapsedAnchorUnix,
  normalizedStartUnix,
}) {
  return Boolean(sessionElapsedInterval) && sessionElapsedAnchorUnix === normalizedStartUnix;
}

export function computeElapsedSeconds({
  sessionElapsedSeedSeconds,
  sessionElapsedAnchorUnix,
  nowSeconds = Date.now() / 1000,
}) {
  return Math.max(
    Number(sessionElapsedSeedSeconds) || 0,
    nowSeconds - Number(sessionElapsedAnchorUnix)
  );
}

export function isSessionExpired({ sessionDurationSec, elapsedSeconds }) {
  return (
    Number.isFinite(sessionDurationSec) &&
    sessionDurationSec > 0 &&
    elapsedSeconds >= sessionDurationSec
  );
}

export function computeSessionLeftSeconds({ sessionDurationSec, elapsedSeconds }) {
  if (Number.isFinite(sessionDurationSec) && sessionDurationSec > 0) {
    return Math.max(0, sessionDurationSec - elapsedSeconds);
  }
  return elapsedSeconds;
}

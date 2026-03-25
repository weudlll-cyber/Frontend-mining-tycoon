/**
File: src/ui/player-view-score.js
Purpose: Resolve and format session score values for player-view rendering.
*/

function firstFiniteNumber(candidates) {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function normalizeSessionId(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

export function formatScoreLineValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { display: '—', exact: '—' };
  }
  const floored = Math.floor(numeric);
  return {
    display: floored.toLocaleString(),
    exact: floored.toLocaleString(),
  };
}

export function resolveDisplayedSessionScore(
  data,
  playerState,
  sessionScoreState
) {
  const backendScore = firstFiniteNumber([
    data?.current_session_score,
    data?.session?.current_session_score,
    data?.session?.score,
    data?.session?.session_score,
    playerState?.current_session_score,
    playerState?.session_score,
  ]);

  const sessionId = normalizeSessionId(data?.session?.session_id);
  const cumulativeMined = Number(playerState?.cumulative_mined);

  let derivedScore = null;
  if (sessionId && Number.isFinite(cumulativeMined)) {
    const switchedSession = sessionScoreState.sessionId !== sessionId;
    if (switchedSession) {
      sessionScoreState.sessionId = sessionId;
      sessionScoreState.baselineCumulativeMined = cumulativeMined;
    }
    if (!Number.isFinite(sessionScoreState.baselineCumulativeMined)) {
      sessionScoreState.baselineCumulativeMined = cumulativeMined;
    }
    derivedScore = Math.max(
      0,
      cumulativeMined - Number(sessionScoreState.baselineCumulativeMined)
    );
  }

  if (Number.isFinite(backendScore) && backendScore > 0) {
    return backendScore;
  }
  if (Number.isFinite(derivedScore) && derivedScore > 0) {
    return derivedScore;
  }
  if (Number.isFinite(backendScore)) {
    return backendScore;
  }
  return derivedScore;
}

export function resolveDisplayedBestRoundScore(data, playerState) {
  return firstFiniteNumber([
    data?.player_best_of_score,
    data?.best_this_round_score,
    data?.best_round_score,
    playerState?.player_best_of_score,
    playerState?.best_this_round_score,
    playerState?.best_round_score,
  ]);
}

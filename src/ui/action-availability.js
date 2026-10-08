/**
File: src/ui/action-availability.js
Purpose: Pure helper that decides whether player upgrade/trade/farm intents can be
  sent right now, mirroring the backend play-window rule.
Role in system:
- main.js feeds it state it already tracks (game status from /state or SSE, the
  round mode and whether the async player has an active session).
- upgrade-panel-inline.js, trading-panel.js and farming-panel.js use the result to
  disable their action buttons and show a short reason as the button tooltip
  (blocked results also carry `farmReason`, the same rule worded for farming).
Constraints:
- Display convenience only: the backend stays authoritative and answers 409
  ACTION_NOT_ALLOWED_GAME_NOT_RUNNING / ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION,
  which game-actions.js still shows as a toast fallback.
- Unknown status (no payload yet) keeps actions enabled so a missing field never
  locks a player out; the backend rejects the request if it is really closed.
*/

export const ACTION_BLOCK_CODES = Object.freeze({
  GAME_NOT_RUNNING: 'ACTION_NOT_ALLOWED_GAME_NOT_RUNNING',
  NO_ACTIVE_SESSION: 'ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION',
});

const ALLOWED = Object.freeze({ allowed: true, code: null, reason: '' });

/**
 * @param {{ gameStatus?: string|null, roundMode?: string, hasActiveSession?: boolean }} input
 * @returns {{ allowed: boolean, code: string|null, reason: string, farmReason?: string }}
 */
export function resolvePlayerActionAvailability({
  gameStatus,
  roundMode,
  hasActiveSession,
} = {}) {
  const status = String(gameStatus || '')
    .trim()
    .toLowerCase();

  // Scheduled sync round: the enrollment window has not even opened yet.
  if (status === 'scheduled') {
    return {
      allowed: false,
      code: ACTION_BLOCK_CODES.GAME_NOT_RUNNING,
      reason: 'The round has not opened yet.',
      farmReason: 'The round has not opened yet. Farming opens when it starts.',
    };
  }
  if (status === 'enrolling') {
    return {
      allowed: false,
      code: ACTION_BLOCK_CODES.GAME_NOT_RUNNING,
      reason: 'Upgrades and trades unlock when the round starts.',
      farmReason: 'Farming opens when the round starts.',
    };
  }
  if (status === 'finished') {
    return {
      allowed: false,
      code: ACTION_BLOCK_CODES.GAME_NOT_RUNNING,
      reason: 'The round has finished. Upgrades and trades are closed.',
      farmReason: 'The round has finished. Farming is closed.',
    };
  }
  // Async rounds run on per-player sessions: the round can be running while
  // this player has no session, in which case the backend rejects actions.
  if (status === 'running' && roundMode === 'async' && !hasActiveSession) {
    return {
      allowed: false,
      code: ACTION_BLOCK_CODES.NO_ACTIVE_SESSION,
      reason: 'Start a session to upgrade or trade.',
      farmReason: 'Start a session to deposit or withdraw.',
    };
  }
  return ALLOWED;
}

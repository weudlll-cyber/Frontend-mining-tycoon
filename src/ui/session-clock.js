/**
File: src/ui/session-clock.js
Purpose: Async-session header clock ("Session Left") and the secondary
  "Round left" hint of the player board.
Role in system:
- Upstream: the active session (board-state.js, from POST /sessions or the
  stream payload) and the latest stream payload for the round countdown.
- Downstream: the header countdown elements; when the session duration is
  reached it calls the injected `onSessionExpired` (live-board-lifecycle.js).
Constraints:
- Backend stays authoritative: the clock only ticks locally between stream
  payloads and is re-seeded from payload elapsed time.
- The round carries on beyond a session, so the "Round left" hint keeps
  running after the session ends.
Security notes: text is written via textContent only.
*/

import { boardState } from './board-state.js';
import { clearCountdownInterval } from './countdown.js';
import { formatDurationCompact } from './season-cards.js';
import {
  computeElapsedSeconds,
  computeRoundRemainingSeconds,
  computeSessionLeftSeconds,
  isSessionExpired,
  normalizeSessionTimerInputs,
  shouldReuseSessionElapsedTimer,
} from './session-timers.js';

let _deps = {};
let sessionElapsedInterval = null;
let sessionElapsedAnchorUnix = null;
let sessionElapsedSeedSeconds = 0;
let roundRemainingHintInterval = null;

/**
 * @param {{ countdownEl, countdownLabelEl, roundRemainingHintEl,
 *   roundRemainingEl, onSessionExpired: () => void }} deps
 */
export function initSessionClock(deps) {
  _deps = deps || {};
}

function updateRoundRemainingHint() {
  const { roundRemainingHintEl, roundRemainingEl } = _deps;
  if (!roundRemainingHintEl || !roundRemainingEl) return;

  const roundLeft = computeRoundRemainingSeconds(boardState.lastGameData);
  if (!Number.isFinite(roundLeft)) {
    roundRemainingHintEl.hidden = true;
    return;
  }

  roundRemainingEl.textContent = formatDurationCompact(roundLeft);
  roundRemainingHintEl.hidden = false;
}

export function startRoundRemainingHintTimer() {
  if (roundRemainingHintInterval) {
    clearInterval(roundRemainingHintInterval);
    roundRemainingHintInterval = null;
  }
  updateRoundRemainingHint();
  roundRemainingHintInterval = setInterval(updateRoundRemainingHint, 500);
}

function stopRoundRemainingHintTimer(hide = true) {
  if (roundRemainingHintInterval) {
    clearInterval(roundRemainingHintInterval);
    roundRemainingHintInterval = null;
  }
  if (hide && _deps.roundRemainingHintEl) {
    _deps.roundRemainingHintEl.hidden = true;
  }
}

export function stopSessionElapsedTimer({
  resetDisplay = true,
  hideRoundHint = true,
} = {}) {
  const { countdownEl, countdownLabelEl } = _deps;
  if (sessionElapsedInterval) {
    clearInterval(sessionElapsedInterval);
    sessionElapsedInterval = null;
  }
  sessionElapsedAnchorUnix = null;
  sessionElapsedSeedSeconds = 0;

  if (resetDisplay) {
    if (countdownLabelEl) {
      countdownLabelEl.textContent = 'Time Remaining';
      countdownLabelEl.hidden = false;
    }
    if (countdownEl) countdownEl.textContent = '-';
  }

  if (hideRoundHint) {
    stopRoundRemainingHintTimer(true);
  }
}

export function startSessionElapsedTimer(
  sessionStartUnix,
  initialElapsedSeconds = 0
) {
  const normalizedInputs = normalizeSessionTimerInputs(
    sessionStartUnix,
    initialElapsedSeconds
  );
  if (!normalizedInputs) return;

  const { normalizedStartUnix, nextInitialElapsed } = normalizedInputs;

  if (
    shouldReuseSessionElapsedTimer({
      sessionElapsedInterval,
      sessionElapsedAnchorUnix,
      normalizedStartUnix,
    })
  ) {
    sessionElapsedSeedSeconds = Math.max(
      sessionElapsedSeedSeconds,
      nextInitialElapsed
    );
    return;
  }

  stopSessionElapsedTimer();
  clearCountdownInterval();
  stopRoundRemainingHintTimer(false);

  sessionElapsedAnchorUnix = normalizedStartUnix;
  sessionElapsedSeedSeconds = nextInitialElapsed;

  const update = () => {
    const { countdownEl, countdownLabelEl } = _deps;
    const elapsed = computeElapsedSeconds({
      sessionElapsedSeedSeconds,
      sessionElapsedAnchorUnix,
    });

    const sessionDurationSec = Number(
      boardState.activeSession?.sessionDurationSec
    );
    if (
      isSessionExpired({
        sessionDurationSec,
        elapsedSeconds: elapsed,
      })
    ) {
      _deps.onSessionExpired();
      return;
    }

    // ── Primary header counter ──────────────────────────────────────────────
    // WHY: Session timer should count down remaining session lifetime.
    // Keep it compact for long sessions (h/d formatting).
    if (countdownLabelEl) {
      countdownLabelEl.textContent = 'Session Left';
      countdownLabelEl.hidden = false;
    }
    const sessionLeft = computeSessionLeftSeconds({
      sessionDurationSec,
      elapsedSeconds: elapsed,
    });
    countdownEl.textContent = formatDurationCompact(sessionLeft);

    // ── Secondary "Round left" indicator ───────────────────────────────────
    // WHY: The round carries on beyond the session. Halvings, scoring, and
    // the leaderboard all run until the *round* ends, not the session.
    // Showing this number prevents confusion when halvings still fire after
    // the session duration has elapsed.
    //
    // We read seconds_remaining from the most-recent stream payload
    // (lastGameData) and subtract the time that has passed since that payload
    // arrived so the display stays fresh between stream ticks.
    updateRoundRemainingHint();
  };

  update();
  sessionElapsedInterval = setInterval(update, 500);
}

/**
File: src/ui/board-state.js
Purpose: Shared mutable state of the player board (player.html).
Role in system:
- Single home for the values that several player-board modules read and write
  (stream flags, latest game status, active async session, game-over view
  tracking). Before the main.js split these were module-level `let`s in
  src/main.js; they keep the same names and initial values here.
- Writers: src/main.js (stream callbacks), board-update.js (stream payloads),
  start-flow.js and setup-controller.js (session/setup flow),
  live-board-lifecycle.js (reset/expiry), game-over.js (last finished game).
Constraints:
- Plain data only: no DOM access, no imports, so every module can import it
  without creating import cycles.
- One instance per page load. Tests that re-import src/main.js after
  `vi.resetModules()` get a fresh copy, exactly like the former module-level
  variables.
- Module-private state (timers, chat unread counter, render frame handles,
  probe bookkeeping) stays inside the module that owns it.
*/

export const boardState = {
  // Most recent stream/state payload, stamped with its arrival time.
  lastGameData: null,
  isStreamActive: false,
  isSetupBusy: false,
  latestGameStatus: null,
  sessionStartSupported: true,
  // Test-only round mode override (setSetupStateForTests).
  setupRoundModeOverride: null,
  activeSession: null,
  // Whether the backend currently runs a session for this player (async
  // rounds). Drives the play-window gate for upgrade/trade buttons.
  playerHasActiveSession: false,
  asyncWindowOpen: null,
  asyncRequirePlayerAuth: 'unknown',
  asyncSessionSupportProbe: null,
  // Game-over tracking for the round currently shown on the board.
  lastFinishedGameId: null,
  currentViewedGameId: '',
  hasSeenPlayableStateForCurrentView: false,
  lastGameStatusForCurrentView: null,
};

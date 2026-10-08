/**
File: src/ui/standings-status.js
Purpose: Label leaderboard values as Live / Provisional / Final in the header and the Top 5 tab.
Role in system:
- Display-only helper fed by the SSE/state payload (`game_status`) and the
  round mode from game meta; it never derives standings itself.
Invariants:
- Async rounds: values are "Provisional" while the round is still open and
  "Final" once the backend reports the round as finished.
- Sync rounds: values are "Live" while running and "Final" when finished.
- Scheduled sync rounds (status `scheduled`, before the enrollment window
  opens) read "Scheduled" with "Scheduled — opens at <time>" as the full
  sentence (local time from `scheduled_start_at`).
- The header tag keeps its box (visibility only) so the summary line does not
  shift when the label appears, changes or clears.
Security notes:
- Text-only updates via textContent; no HTML injection.
*/

import { setElementTextValue } from '../utils/dom-utils.js';
import {
  formatLocalDateTime,
  normalizeUnixSeconds,
} from '../utils/schedule-time.js';

const STANDINGS_STATES = {
  final: {
    state: 'final',
    label: 'Final',
    description: 'Final — the round is finished.',
  },
  provisional: {
    state: 'provisional',
    label: 'Provisional',
    description: 'Provisional — the round is still open.',
  },
  live: {
    state: 'live',
    label: 'Live',
    description: 'Live — standings update while the round runs.',
  },
  none: { state: 'none', label: '', description: '' },
};

let _refs = { headerTagEl: null, panelNoteEl: null };

/**
 * Map backend round state to the standings label.
 * Async rounds stay provisional for every non-finished status (the round
 * window is still open, other players can still finish their sessions).
 */
export function resolveStandingsStatus({
  roundMode,
  gameStatus,
  scheduledStartAt = null,
} = {}) {
  const status = String(gameStatus || '')
    .trim()
    .toLowerCase();
  if (!status) return STANDINGS_STATES.none;
  if (status === 'scheduled') {
    const opensAt = normalizeUnixSeconds(scheduledStartAt);
    return {
      state: 'scheduled',
      label: 'Scheduled',
      description:
        opensAt === null
          ? 'Scheduled — the round has not opened yet.'
          : `Scheduled — opens at ${formatLocalDateTime(opensAt)}.`,
    };
  }
  if (status === 'finished') return STANDINGS_STATES.final;
  if (roundMode === 'async') return STANDINGS_STATES.provisional;
  if (status === 'running') return STANDINGS_STATES.live;
  return STANDINGS_STATES.none;
}

export function initStandingsStatus({ headerTagEl, panelNoteEl } = {}) {
  _refs = {
    headerTagEl: headerTagEl || null,
    panelNoteEl: panelNoteEl || null,
  };
  renderStandingsStatus(STANDINGS_STATES.none);
}

function applyStatus(el, text, status) {
  if (!el) return;
  el.dataset.standingsState = status.state;
  setElementTextValue(el, text);
  if (status.description) {
    el.title = status.description;
  } else {
    el.removeAttribute('title');
  }
}

export function renderStandingsStatus(status = STANDINGS_STATES.none) {
  // Header: short tag (full sentence in the title tooltip).
  applyStatus(_refs.headerTagEl, status.label, status);
  // Top 5 tab: full sentence, room is available there.
  applyStatus(_refs.panelNoteEl, status.description, status);
}

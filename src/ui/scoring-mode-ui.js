/**
File: src/ui/scoring-mode-ui.js
Purpose: Scoring-mode resolution and display on the player board.
Role in system:
- Upstream: `scoring_mode` from the stream payload or the round's game meta
  (snapshot-locked at round creation), else the configured default.
- Downstream: the scoring-mode status chip, the score context label and the
  "last game" snapshot label (game-over.js).
Constraints:
- The mode is fixed per round (SCORING_MODES.md) and chosen on admin.html.
- Mode normalization is shared with the trading panel
  (trading-panel-formatters.js), so both always agree on the canonical name.
Security notes: text is written via textContent only.
*/

import { SCORING_CONTROL } from '../config/index.js';
import { getGameMeta } from '../meta/meta-manager.js';
import {
  formatScoringModeName,
  normalizeScoringMode,
} from './trading-panel-formatters.js';

const DEFAULT_SCORING_MODE = SCORING_CONTROL.DEFAULT_MODE;

let _els = {};

/**
 * @param {{ scoringModeStatusEl, scoreContextLabelEl, gameIdInput }} els
 */
export function initScoringModeUi(els) {
  _els = els || {};
}

function getScoringModeScoreLabel(mode) {
  const normalized = normalizeScoringMode(mode);
  if (normalized === 'power_oracle_weighted') return 'Weighted Score';
  if (normalized === 'mining_time_equivalent') return 'Mining-Time Equivalent';
  if (normalized === 'efficiency_system_mastery') return 'Efficiency Score';
  return 'Total Tokens';
}

/** Payload mode first, then the round's game meta, then the default. */
export function resolveActiveScoringMode(data = null) {
  const gameId = String(data?.game_id || _els.gameIdInput?.value || '').trim();
  const gameMeta = gameId ? getGameMeta(gameId) : null;
  return normalizeScoringMode(
    data?.scoring_mode || gameMeta?.scoring_mode || DEFAULT_SCORING_MODE
  );
}

export function updateScoringModeUi(data = null) {
  const mode = resolveActiveScoringMode(data);
  if (_els.scoringModeStatusEl) {
    _els.scoringModeStatusEl.textContent = formatScoringModeName(mode);
  }
  if (_els.scoreContextLabelEl) {
    _els.scoreContextLabelEl.textContent = getScoringModeScoreLabel(mode);
  }
}

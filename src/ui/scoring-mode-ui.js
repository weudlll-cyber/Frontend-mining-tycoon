/**
File: src/ui/scoring-mode-ui.js
Purpose: Scoring-mode resolution and display on the player board.
Role in system:
- Upstream: `scoring_mode` from the stream payload or the round's game meta
  (snapshot-locked at round creation), else the hidden legacy host radios.
- Downstream: the scoring-mode status chip, the score context label and the
  "last game" snapshot label (game-over.js).
Constraints:
- The mode is fixed per round (SCORING_MODES.md); the legacy radios are
  locked once the round runs or is finished.
- Mode normalization is shared with the trading panel
  (trading-panel-formatters.js), so both always agree on the canonical name.
Security notes: text is written via textContent only.
*/

import { SCORING_CONTROL } from '../config/index.js';
import { getGameMeta } from '../meta/meta-manager.js';
import { boardState } from './board-state.js';
import {
  formatScoringModeName,
  normalizeScoringMode,
} from './trading-panel-formatters.js';

export const DEFAULT_SCORING_MODE = SCORING_CONTROL.DEFAULT_MODE;

let _els = {};

/**
 * @param {{ scoringModeStockpileInput, scoringModePowerInput,
 *   scoringModeMiningTimeInput, scoringModeEfficiencyInput,
 *   scoringModeInputs: HTMLInputElement[], scoringModeStatusEl,
 *   scoreContextLabelEl, gameIdInput }} els
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

export function getSelectedScoringMode() {
  if (_els.scoringModePowerInput?.checked) return 'power_oracle_weighted';
  if (_els.scoringModeMiningTimeInput?.checked) return 'mining_time_equivalent';
  if (_els.scoringModeEfficiencyInput?.checked) {
    return 'efficiency_system_mastery';
  }
  return DEFAULT_SCORING_MODE;
}

export function setSelectedScoringMode(mode) {
  const normalized = normalizeScoringMode(mode);
  if (_els.scoringModeStockpileInput) {
    _els.scoringModeStockpileInput.checked =
      normalized === 'stockpile_total_tokens';
  }
  if (_els.scoringModePowerInput) {
    _els.scoringModePowerInput.checked = normalized === 'power_oracle_weighted';
  }
  if (_els.scoringModeMiningTimeInput) {
    _els.scoringModeMiningTimeInput.checked =
      normalized === 'mining_time_equivalent';
  }
  if (_els.scoringModeEfficiencyInput) {
    _els.scoringModeEfficiencyInput.checked =
      normalized === 'efficiency_system_mastery';
  }
}

/** Payload mode first, then the round's game meta, then the legacy radios. */
export function resolveActiveScoringMode(data = null) {
  const gameId = String(data?.game_id || _els.gameIdInput?.value || '').trim();
  const gameMeta = gameId ? getGameMeta(gameId) : null;
  return normalizeScoringMode(
    data?.scoring_mode || gameMeta?.scoring_mode || getSelectedScoringMode()
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

  // WHY: the mode is snapshot-locked once the round runs.
  const status = String(
    data?.game_status || boardState.latestGameStatus || ''
  ).toLowerCase();
  const lockModeSelection = status === 'running' || status === 'finished';
  (_els.scoringModeInputs || []).forEach((input) => {
    input.disabled = lockModeSelection;
  });
}

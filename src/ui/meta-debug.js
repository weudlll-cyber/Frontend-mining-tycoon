/**
File: src/ui/meta-debug.js
Purpose: Meta debug line of the player board.
Role in system:
- Upstream: active contract version / meta hash and the round's game meta
  (src/meta/meta-manager.js).
- Downstream: the `#meta-debug` line ("contract v… | meta_hash … | Duration …").
Constraints:
- Display only; missing meta fields are skipped instead of guessed.
Security notes: text is written via textContent only.
*/

import {
  getActiveContractVersion,
  getActiveMetaHash,
  getGameMeta,
  shortMetaHash,
} from '../meta/meta-manager.js';
import { formatScoringModeName } from './trading-panel-formatters.js';
import { formatDuration } from '../utils/duration-format.js';

let _deps = {};

/**
 * @param {{ metaDebugEl, gameIdInput }} deps
 */
export function initMetaDebug(deps) {
  _deps = deps || {};
}

export function renderMetaDebugLine() {
  const { metaDebugEl, gameIdInput } = _deps;
  if (!metaDebugEl) return;
  const activeContractVersion = getActiveContractVersion();
  const activeMetaHash = getActiveMetaHash();
  const versionText = Number.isInteger(activeContractVersion)
    ? `v${activeContractVersion}`
    : 'v-';

  let text = `contract ${versionText} | meta_hash ${shortMetaHash(activeMetaHash)}`;

  const gameId = gameIdInput?.value;
  if (gameId) {
    const gameMeta = getGameMeta(gameId);
    if (gameMeta && gameMeta.game_duration_seconds) {
      text += ` | Duration: ${formatDuration(gameMeta.game_duration_seconds, { parts: 1, round: 'round' })}`;

      if (gameMeta.emission_anchor_token) {
        const rate = gameMeta.emission_anchor_tokens_per_second || '?';
        text += ` | Emission: ${gameMeta.emission_anchor_token} @ ${rate}/s`;
      }

      if (gameMeta.season_cycles_per_game) {
        text += ` | Cycles: ${gameMeta.season_cycles_per_game}`;
      }

      if (gameMeta.scoring_mode) {
        text += ` | Scoring: ${formatScoringModeName(gameMeta.scoring_mode)}`;
      }
    }
  }

  metaDebugEl.textContent = text;
}

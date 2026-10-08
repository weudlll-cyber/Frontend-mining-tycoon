/**
File: src/ui/meta-debug.js
Purpose: Meta debug line and derived-emission preview of the player board.
Role in system:
- Upstream: active contract version / meta hash and the round's game meta
  (src/meta/meta-manager.js).
- Downstream: the `#meta-debug` line ("contract v… | meta_hash … | Duration …")
  and the hidden `#derived-emission-preview` of the legacy host controls.
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

let _deps = {};

/**
 * @param {{ metaDebugEl, derivedEmissionPreviewEl, gameIdInput,
 *   tokens: string[] }} deps
 */
export function initMetaDebug(deps) {
  _deps = deps || {};
}

/** Round duration as one compact unit: 45s, 10m, 2h, 3d. */
function formatMetaDurationLabel(durationSec) {
  if (durationSec < 60) return `${durationSec}s`;
  if (durationSec < 3600) return `${Math.round(durationSec / 60)}m`;
  if (durationSec < 86400) return `${Math.round(durationSec / 3600)}h`;
  return `${Math.round(durationSec / 86400)}d`;
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
      text += ` | Duration: ${formatMetaDurationLabel(gameMeta.game_duration_seconds)}`;

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

export function renderDerivedEmissionPreview() {
  const { derivedEmissionPreviewEl, gameIdInput, tokens = [] } = _deps;
  if (!derivedEmissionPreviewEl) return;

  const gameId = gameIdInput?.value;
  if (!gameId) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const gameMeta = getGameMeta(gameId);
  if (!gameMeta || !gameMeta.derived_emission_rates_per_second) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const rates = gameMeta.derived_emission_rates_per_second;
  const hasAllTokens = tokens.every((token) => token in rates);

  if (!hasAllTokens) {
    derivedEmissionPreviewEl.style.display = 'none';
    return;
  }

  const ratesList = tokens
    .map((token) => {
      const rate = Number(rates[token]).toFixed(2);
      return `${token} ${rate}`;
    })
    .join(', ');

  derivedEmissionPreviewEl.textContent = `Derived Rates: ${ratesList} /s`;
  derivedEmissionPreviewEl.style.display = 'block';
}

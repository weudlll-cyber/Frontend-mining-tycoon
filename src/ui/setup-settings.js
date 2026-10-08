/**
File: src/ui/setup-settings.js
Purpose: Persist and restore the player-board setup form (localStorage) and
  wire the change listeners that save it.
Role in system:
- Upstream: setup-shell inputs (backend URL, player name, game/player id) and
  the hidden legacy host controls (setup-host-controls.js, scoring-mode-ui.js).
- Downstream: STORAGE_KEYS in localStorage (shared with the lobby, which
  writes the game/player id before opening player.html), the active meta hash,
  the meta debug line and the setup-shell state (injected callbacks from
  src/main.js).
Constraints:
- An empty backend URL falls back to DEFAULT_BACKEND_URL (config), never to a
  hard-coded value.
- Tunable defaults come from the effective game config (src/config).
Security notes: only non-secret setup values are stored here; player tokens
  are handled by player-join.js.
*/

import { DEFAULT_BACKEND_URL } from '../config/backend-url.js';
import { clampTradeCount, getEffectiveGameConfig } from '../config/index.js';
import { setActiveMetaHashFromStorage } from '../meta/meta-manager.js';
import {
  STORAGE_KEYS,
  getGameMetaHashStorageKey,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';
import { renderMetaDebugLine } from './meta-debug.js';
import {
  DEFAULT_SCORING_MODE,
  getSelectedScoringMode,
  setSelectedScoringMode,
  updateScoringModeUi,
} from './scoring-mode-ui.js';
import { refreshAsyncDiagnostics } from './setup-controller.js';
import {
  getSelectedRoundType,
  getSelectedTradeCount,
  isTradeCountManuallyOverridden,
  renderTradeSchedulePreview,
  setSelectedRoundType,
  setTradeCountManuallyOverridden,
  shouldAutoStartAsyncSession,
  syncTradeCountWithDuration,
  updateAsyncHostControlsVisibility,
} from './setup-host-controls.js';

let _deps = {};

/**
 * @param {object} deps Element map from board-dom.js plus
 *   `renderDebugContext`, `updateSetupActionsState` and `setSetupCollapsed`
 *   (lazy-init wrappers from src/main.js).
 */
export function initSetupSettings(deps) {
  _deps = deps || {};
}

export function saveSettings() {
  const {
    baseUrlInput,
    playerNameInput,
    durationPresetInput,
    durationCustomValueInput,
    durationCustomUnitInput,
    enrollmentWindowInput,
    asyncHostDurationPresetInput,
    asyncSessionDurationPresetInput,
    gameIdInput,
    playerIdInput,
  } = _deps;
  const baseUrlValue = String(baseUrlInput?.value || '').trim();
  const effectiveBaseUrl = baseUrlValue || DEFAULT_BACKEND_URL;
  if (baseUrlInput && !baseUrlValue) {
    baseUrlInput.value = effectiveBaseUrl;
  }

  setStorageItem(STORAGE_KEYS.baseUrl, effectiveBaseUrl);
  setStorageItem(STORAGE_KEYS.playerName, playerNameInput.value);
  setStorageItem(STORAGE_KEYS.durationPreset, durationPresetInput.value);
  setStorageItem(
    STORAGE_KEYS.durationCustomValue,
    durationCustomValueInput.value
  );
  setStorageItem(
    STORAGE_KEYS.durationCustomUnit,
    durationCustomUnitInput.value
  );
  setStorageItem(STORAGE_KEYS.enrollmentWindow, enrollmentWindowInput.value);
  setStorageItem(STORAGE_KEYS.scoringMode, getSelectedScoringMode());
  setStorageItem(STORAGE_KEYS.tradeCount, String(getSelectedTradeCount()));
  setStorageItem(
    STORAGE_KEYS.tradeCountOverride,
    isTradeCountManuallyOverridden() ? 'true' : 'false'
  );
  setStorageItem(STORAGE_KEYS.roundType, getSelectedRoundType());
  setStorageItem(
    STORAGE_KEYS.asyncDurationPreset,
    asyncHostDurationPresetInput?.value ||
      getEffectiveGameConfig().defaults.async_round_preset
  );
  setStorageItem(
    STORAGE_KEYS.asyncDurationCustomMinutes,
    asyncSessionDurationPresetInput?.value ||
      getEffectiveGameConfig().defaults.async_session_preset
  );
  setStorageItem(
    STORAGE_KEYS.asyncAutoStart,
    shouldAutoStartAsyncSession() ? 'true' : 'false'
  );
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);

  _deps.renderDebugContext();
  updateScoringModeUi();
  renderTradeSchedulePreview();
  _deps.updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

function restoreFormValues() {
  const {
    baseUrlInput,
    playerNameInput,
    durationPresetInput,
    durationCustomValueInput,
    durationCustomUnitInput,
    enrollmentWindowInput,
    tradeCountInput,
    asyncHostDurationPresetInput,
    asyncSessionDurationPresetInput,
    asyncHostAutoStartCheckbox,
    gameIdInput,
    playerIdInput,
  } = _deps;
  const savedBaseUrl = getStorageItem(STORAGE_KEYS.baseUrl);
  const savedPlayerName = getStorageItem(STORAGE_KEYS.playerName);
  const savedDurationPreset = getStorageItem(STORAGE_KEYS.durationPreset);
  const savedDurationCustomValue = getStorageItem(
    STORAGE_KEYS.durationCustomValue
  );
  const savedDurationCustomUnit = getStorageItem(
    STORAGE_KEYS.durationCustomUnit
  );
  const savedEnrollmentWindow = getStorageItem(STORAGE_KEYS.enrollmentWindow);
  const savedScoringMode = getStorageItem(STORAGE_KEYS.scoringMode);
  const savedTradeCount = getStorageItem(STORAGE_KEYS.tradeCount);
  const savedTradeCountOverride = getStorageItem(
    STORAGE_KEYS.tradeCountOverride
  );
  const savedAsyncDurationPreset = getStorageItem(
    STORAGE_KEYS.asyncDurationPreset
  );
  const savedAsyncDurationCustomMinutes = getStorageItem(
    STORAGE_KEYS.asyncDurationCustomMinutes
  );
  const savedAsyncAutoStart = getStorageItem(STORAGE_KEYS.asyncAutoStart);
  const savedGameId = getStorageItem(STORAGE_KEYS.gameId);
  const savedPlayerId = getStorageItem(STORAGE_KEYS.playerId);

  if (savedBaseUrl && String(savedBaseUrl).trim()) {
    baseUrlInput.value = String(savedBaseUrl).trim();
  } else if (baseUrlInput && !String(baseUrlInput.value || '').trim()) {
    baseUrlInput.value = DEFAULT_BACKEND_URL;
  }
  if (savedPlayerName) playerNameInput.value = savedPlayerName;
  if (savedDurationPreset) durationPresetInput.value = savedDurationPreset;
  if (savedDurationCustomValue)
    durationCustomValueInput.value = savedDurationCustomValue;
  if (savedDurationCustomUnit)
    durationCustomUnitInput.value = savedDurationCustomUnit;
  if (savedEnrollmentWindow)
    enrollmentWindowInput.value = savedEnrollmentWindow;
  setSelectedScoringMode(savedScoringMode || DEFAULT_SCORING_MODE);
  setTradeCountManuallyOverridden(savedTradeCountOverride === 'true');
  if (savedTradeCount && tradeCountInput) {
    tradeCountInput.value = String(clampTradeCount(Number(savedTradeCount)));
  }
  if (savedAsyncDurationPreset && asyncHostDurationPresetInput) {
    asyncHostDurationPresetInput.value = savedAsyncDurationPreset;
  }
  if (savedAsyncDurationCustomMinutes && asyncSessionDurationPresetInput) {
    asyncSessionDurationPresetInput.value = savedAsyncDurationCustomMinutes;
  }
  if (savedAsyncAutoStart !== null && asyncHostAutoStartCheckbox) {
    asyncHostAutoStartCheckbox.checked = savedAsyncAutoStart !== 'false';
  }
  if (savedGameId) gameIdInput.value = savedGameId;
  if (savedPlayerId) playerIdInput.value = savedPlayerId;
  return { savedGameId, savedPlayerId, savedTradeCount };
}

export function loadSettings() {
  const { durationPresetInput, durationCustomInput, gameIdInput } = _deps;
  const savedRoundType = getStorageItem(STORAGE_KEYS.roundType);
  const { savedGameId, savedPlayerId, savedTradeCount } = restoreFormValues();
  if (savedGameId && savedPlayerId) {
    // Keep setup out of the way once the player already joined a game.
    _deps.setSetupCollapsed(true);
  }

  setSelectedRoundType(savedRoundType === 'async' ? 'async' : 'sync');
  updateAsyncHostControlsVisibility();
  updateScoringModeUi();
  syncTradeCountWithDuration({ forceDefault: !savedTradeCount });

  // Update visibility of custom duration input
  if (durationPresetInput.value === 'custom') {
    durationCustomInput.style.display = 'flex';
  }

  try {
    const loadedGameId = gameIdInput.value;
    const gameHash = loadedGameId
      ? getStorageItem(getGameMetaHashStorageKey(loadedGameId))
      : null;
    const globalHash = getStorageItem(STORAGE_KEYS.globalMetaHash);
    setActiveMetaHashFromStorage(gameHash || globalHash || null);
  } catch (e) {
    console.warn('localStorage meta_hash load failed:', e);
  }

  renderMetaDebugLine();
  _deps.renderDebugContext();
  renderTradeSchedulePreview();
  _deps.updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

/** Save the form whenever one of the plain setup inputs changes. */
export function wireSettingsPersistence() {
  const {
    baseUrlInput,
    playerNameInput,
    enrollmentWindowInput,
    gameIdInput,
    playerIdInput,
    anchorTokenInput,
    anchorRateInput,
    seasonCyclesInput,
    scoringModeInputs = [],
  } = _deps;
  baseUrlInput?.addEventListener('change', saveSettings);
  playerNameInput?.addEventListener('change', saveSettings);
  enrollmentWindowInput?.addEventListener('change', saveSettings);
  gameIdInput?.addEventListener('change', saveSettings);
  playerIdInput?.addEventListener('change', saveSettings);
  anchorTokenInput?.addEventListener('change', saveSettings);
  anchorRateInput?.addEventListener('change', saveSettings);
  seasonCyclesInput?.addEventListener('change', saveSettings);
  scoringModeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      updateScoringModeUi();
      saveSettings();
    });
  });
  gameIdInput?.addEventListener('input', _deps.updateSetupActionsState);
}

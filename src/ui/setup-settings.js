/**
File: src/ui/setup-settings.js
Purpose: Persist and restore the player-board setup form (localStorage) and
  wire the change listeners that save it.
Role in system:
- Upstream: setup-shell inputs (backend URL, player name, game/player id).
- Downstream: STORAGE_KEYS in localStorage (shared with the lobby, which
  writes the game/player id before opening player.html), the active meta hash,
  the meta debug line and the setup-shell state (injected callbacks from
  src/main.js).
Constraints:
- An empty backend URL falls back to DEFAULT_BACKEND_URL (config), never to a
  hard-coded value.
- Round settings (type, duration, scoring, trades) are chosen on admin.html;
  the board reads them from the round's game meta, never from this form.
Security notes: only non-secret setup values are stored here; player tokens
  are handled by player-join.js.
*/

import { DEFAULT_BACKEND_URL } from '../config/backend-url.js';
import { setActiveMetaHashFromStorage } from '../meta/meta-manager.js';
import {
  STORAGE_KEYS,
  getGameMetaHashStorageKey,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';
import { renderMetaDebugLine } from './meta-debug.js';
import { updateScoringModeUi } from './scoring-mode-ui.js';
import { refreshAsyncDiagnostics } from './setup-controller.js';

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
  const { baseUrlInput, playerNameInput, gameIdInput, playerIdInput } = _deps;
  const baseUrlValue = String(baseUrlInput?.value || '').trim();
  const effectiveBaseUrl = baseUrlValue || DEFAULT_BACKEND_URL;
  if (baseUrlInput && !baseUrlValue) {
    baseUrlInput.value = effectiveBaseUrl;
  }

  setStorageItem(STORAGE_KEYS.baseUrl, effectiveBaseUrl);
  setStorageItem(STORAGE_KEYS.playerName, playerNameInput.value);
  setStorageItem(STORAGE_KEYS.gameId, gameIdInput.value);
  setStorageItem(STORAGE_KEYS.playerId, playerIdInput.value);

  _deps.renderDebugContext();
  updateScoringModeUi();
  _deps.updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

function restoreFormValues() {
  const { baseUrlInput, playerNameInput, gameIdInput, playerIdInput } = _deps;
  const savedBaseUrl = getStorageItem(STORAGE_KEYS.baseUrl);
  const savedPlayerName = getStorageItem(STORAGE_KEYS.playerName);
  const savedGameId = getStorageItem(STORAGE_KEYS.gameId);
  const savedPlayerId = getStorageItem(STORAGE_KEYS.playerId);

  if (savedBaseUrl && String(savedBaseUrl).trim()) {
    baseUrlInput.value = String(savedBaseUrl).trim();
  } else if (baseUrlInput && !String(baseUrlInput.value || '').trim()) {
    baseUrlInput.value = DEFAULT_BACKEND_URL;
  }
  if (savedPlayerName) playerNameInput.value = savedPlayerName;
  if (savedGameId) gameIdInput.value = savedGameId;
  if (savedPlayerId) playerIdInput.value = savedPlayerId;
  return { savedGameId, savedPlayerId };
}

export function loadSettings() {
  const { gameIdInput } = _deps;
  const { savedGameId, savedPlayerId } = restoreFormValues();
  if (savedGameId && savedPlayerId) {
    // Keep setup out of the way once the player already joined a game.
    _deps.setSetupCollapsed(true);
  }

  updateScoringModeUi();

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
  _deps.updateSetupActionsState();
  void refreshAsyncDiagnostics({ force: true });
}

/** Save the form whenever one of the setup inputs changes. */
export function wireSettingsPersistence() {
  const { baseUrlInput, playerNameInput, gameIdInput, playerIdInput } = _deps;
  baseUrlInput?.addEventListener('change', saveSettings);
  playerNameInput?.addEventListener('change', saveSettings);
  gameIdInput?.addEventListener('change', saveSettings);
  playerIdInput?.addEventListener('change', saveSettings);
  gameIdInput?.addEventListener('input', _deps.updateSetupActionsState);
}

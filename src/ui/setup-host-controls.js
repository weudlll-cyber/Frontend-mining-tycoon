/**
File: src/ui/setup-host-controls.js
Purpose: Legacy host controls of player.html: round type, durations, trade
  count with its unlock schedule preview, and advanced overrides.
Role in system:
- The controls carry `.admin-only` and are always hidden on player.html
  (rounds are created on admin.html), but their values still feed the setup
  state (round type, async auto start) and the persisted settings.
- Upstream: effective game config (src/config, backend `/meta` game_config)
  and the round's backend `trading_rules` from game meta.
- Downstream: setup-controller.js (round type, auto start), setup-settings.js
  (persistence) and the trade schedule preview text.
Constraints:
- Tunables come from src/config only; backend trading rules win over the
  local defaults once a game meta is known.
Security notes: text is written via textContent only.
*/

import {
  clampTradeCount,
  computeTradeUnlockOffsetsSeconds,
  getDefaultTradeCount,
  getEffectiveGameConfig,
} from '../config/index.js';
import { getGameMeta } from '../meta/meta-manager.js';
import {
  getAsyncDurationPreset,
  populateHostPresetSelects,
  presetToSeconds,
  syncSessionDurationOptions,
} from './async-duration.js';
import {
  collectAdvancedOverridesFromInputs,
  resolveDurationSecondsFromInputs,
} from './setup-payload.js';

let _els = {};
let selectedSetupRoundType = 'sync';
let tradeCountManuallyOverridden = false;

/** @param {object} els Element map from board-dom.js (host control inputs). */
export function initSetupHostControls(els) {
  _els = els || {};
}

export function isTradeCountManuallyOverridden() {
  return tradeCountManuallyOverridden;
}

export function setTradeCountManuallyOverridden(value) {
  tradeCountManuallyOverridden = Boolean(value);
}

// setSelectedRoundType() only ever stores 'sync' or 'async'.
export function getSelectedRoundType() {
  return selectedSetupRoundType;
}

/** Offset since round/session start: mm:ss below one hour, else hh:mm. */
function formatOffsetLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 3600) {
    const mm = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(total % 60)
      .toString()
      .padStart(2, '0');
    return `${mm}:${ss}`;
  }
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${hh}:${mm}`;
}

// P2.4: Duration resolution helper
function resolveDurationSeconds() {
  return resolveDurationSecondsFromInputs({
    durationPresetInput: _els.durationPresetInput,
    durationCustomValueInput: _els.durationCustomValueInput,
    durationCustomUnitInput: _els.durationCustomUnitInput,
  });
}

// P2.4: Collect optional overrides from advanced form
export function collectAdvancedOverrides() {
  return collectAdvancedOverridesFromInputs({
    showAdvancedCheckbox: _els.showAdvancedCheckbox,
    anchorTokenInput: _els.anchorTokenInput,
    anchorRateInput: _els.anchorRateInput,
    seasonCyclesInput: _els.seasonCyclesInput,
  });
}

function getSelectedRoundDurationSecondsForTradingDefaults() {
  if (getSelectedRoundType() === 'async') {
    // Async trade offsets count from session start and must fit inside the
    // session (backend validation), so the session length is the window.
    return (
      presetToSeconds(_els.asyncSessionDurationPresetInput?.value) ||
      presetToSeconds(
        getAsyncDurationPreset(_els.asyncHostDurationPresetInput)
      ) ||
      600
    );
  }
  let resolution;
  try {
    resolution = resolveDurationSeconds();
  } catch {
    return 600;
  }
  if (resolution.mode === 'custom') {
    return Number(resolution.customSeconds) || 600;
  }
  return presetToSeconds(resolution.preset) || 600;
}

export function getSelectedTradeCount() {
  return clampTradeCount(Number(_els.tradeCountInput?.value || 0));
}

function getTradeUnlockOffsets() {
  const durationSeconds = getSelectedRoundDurationSecondsForTradingDefaults();
  return computeTradeUnlockOffsetsSeconds(
    durationSeconds,
    getSelectedTradeCount()
  );
}

export function renderTradeSchedulePreview() {
  const { tradeSchedulePreviewEl, tradeCountInput, tradeCountModeNoteEl } =
    _els;
  if (!tradeSchedulePreviewEl) return;

  const gameId = String(_els.gameIdInput?.value || '').trim();
  const gameMeta = gameId ? getGameMeta(gameId) : null;
  const metaRules = gameMeta?.trading_rules;

  let tradeCount;
  let offsets;
  let note;

  if (metaRules && Number.isFinite(Number(metaRules.trade_count))) {
    tradeCount = clampTradeCount(Number(metaRules.trade_count));
    if (tradeCountInput) {
      tradeCountInput.value = String(tradeCount);
      tradeCountInput.disabled = true;
    }
    offsets = Array.isArray(metaRules.unlock_offsets_seconds)
      ? metaRules.unlock_offsets_seconds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];
    note = 'Using backend-authoritative trading rules for this game.';
  } else {
    if (tradeCountInput) {
      tradeCountInput.disabled = false;
    }
    tradeCount = getSelectedTradeCount();
    offsets = getTradeUnlockOffsets();
    note = tradeCountManuallyOverridden
      ? 'Manual override active (clamped to allowed limits).'
      : 'Auto default from round duration.';
  }

  if (tradeCountModeNoteEl) {
    tradeCountModeNoteEl.textContent = note;
  }

  if (tradeCount <= 0 || !offsets.length) {
    tradeSchedulePreviewEl.textContent =
      'Trade schedule: no trades in this round.';
    return;
  }

  const lines = offsets.map(
    (offset, idx) =>
      `Trade ${idx + 1} available at ${formatOffsetLabel(offset)}`
  );
  tradeSchedulePreviewEl.textContent = lines.join(' | ');
}

export function syncTradeCountWithDuration({ forceDefault = false } = {}) {
  const { tradeCountInput } = _els;
  if (!tradeCountInput) return;

  const durationSeconds = getSelectedRoundDurationSecondsForTradingDefaults();
  const recommended = getDefaultTradeCount(durationSeconds);
  if (forceDefault || !tradeCountManuallyOverridden) {
    tradeCountInput.value = String(recommended);
  } else {
    tradeCountInput.value = String(
      clampTradeCount(Number(tradeCountInput.value))
    );
  }
  renderTradeSchedulePreview();
}

export function shouldAutoStartAsyncSession() {
  return Boolean(_els.asyncHostAutoStartCheckbox?.checked);
}

export function updateAsyncHostControlsVisibility() {
  const isAsyncHost = getSelectedRoundType() === 'async';
  if (_els.syncHostControlsEl) {
    _els.syncHostControlsEl.hidden = isAsyncHost;
  }
  if (_els.asyncHostControlsEl) {
    _els.asyncHostControlsEl.hidden = !isAsyncHost;
  }
}

export function setSelectedRoundType(roundType) {
  selectedSetupRoundType = roundType === 'async' ? 'async' : 'sync';
  if (_els.roundTypeSyncInput) {
    _els.roundTypeSyncInput.checked = selectedSetupRoundType === 'sync';
  }
  if (_els.roundTypeAsyncInput) {
    _els.roundTypeAsyncInput.checked = selectedSetupRoundType === 'async';
  }
  updateAsyncHostControlsVisibility();
}

/**
 * Keep the session dropdown in line with the round duration: disable options
 * that would exceed the round and auto-clamp (with a warning) if needed.
 */
export function syncHostSessionDurationOptions() {
  syncSessionDurationOptions({
    roundDurationInput: _els.asyncHostDurationPresetInput,
    sessionDurationInput: _els.asyncSessionDurationPresetInput,
    warningEl: _els.sessionDurationWarningEl,
    enforceLimit: getSelectedRoundType() === 'async',
  });
}

export function applyGameConfigToHostControls() {
  // Legacy host controls on player.html are always hidden (.admin-only), but
  // keep their options and limits in line with the effective game config.
  populateHostPresetSelects({
    durationPresetInput: _els.durationPresetInput,
    asyncDurationPresetInput: _els.asyncHostDurationPresetInput,
    asyncSessionPresetInput: _els.asyncSessionDurationPresetInput,
  });
  const { min, max } = getEffectiveGameConfig().trade_count_limits;
  _els.tradeCountInput?.setAttribute('min', String(min));
  _els.tradeCountInput?.setAttribute('max', String(max));
}

/**
 * Change listeners of the duration, advanced-override and trade-count
 * controls. `onSettingsChanged` persists the form (setup-settings.js).
 */
export function wireHostControlEvents({ onSettingsChanged }) {
  const {
    durationPresetInput,
    durationCustomInput,
    durationCustomValueInput,
    durationCustomUnitInput,
    showAdvancedCheckbox,
    advancedOverridesDiv,
    tradeCountInput,
  } = _els;

  // P2.4: Duration preset and advanced overrides event listeners
  if (durationPresetInput) {
    durationPresetInput.addEventListener('change', () => {
      if (durationPresetInput.value === 'custom') {
        durationCustomInput.style.display = 'flex';
        durationCustomValueInput.focus();
      } else {
        durationCustomInput.style.display = 'none';
      }
      syncTradeCountWithDuration();
      onSettingsChanged();
    });
  }

  if (showAdvancedCheckbox) {
    showAdvancedCheckbox.addEventListener('change', () => {
      advancedOverridesDiv.style.display = showAdvancedCheckbox.checked
        ? 'block'
        : 'none';
    });
  }

  durationCustomValueInput?.addEventListener('change', () => {
    syncTradeCountWithDuration();
    onSettingsChanged();
  });
  durationCustomUnitInput?.addEventListener('change', () => {
    syncTradeCountWithDuration();
    onSettingsChanged();
  });

  tradeCountInput?.addEventListener('change', () => {
    tradeCountManuallyOverridden = true;
    if (tradeCountInput) {
      tradeCountInput.value = String(
        clampTradeCount(Number(tradeCountInput.value))
      );
    }
    renderTradeSchedulePreview();
    onSettingsChanged();
  });
}

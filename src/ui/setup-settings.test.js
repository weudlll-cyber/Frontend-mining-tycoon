// Tests persisting and restoring the player-board setup form via localStorage.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./setup-controller.js', () => ({
  refreshAsyncDiagnostics: vi.fn(),
}));

let settings;
let storage;
let els;
let deps;

function buildForm() {
  document.body.innerHTML = `
    <input id="base-url" value="" />
    <input id="player-name" value="Alice" />
    <select id="duration-preset">
      <option value="10m" selected>10m</option>
      <option value="custom">custom</option>
    </select>
    <div id="duration-custom-input" style="display:none"></div>
    <input id="duration-custom-value" value="15" />
    <select id="duration-custom-unit"><option value="minutes" selected>minutes</option></select>
    <input id="enrollment-window" value="60" />
    <input id="scoring-mode-stockpile" type="radio" name="sm" checked />
    <input id="scoring-mode-power" type="radio" name="sm" />
    <input id="round-type-sync" type="radio" name="rt" checked />
    <input id="round-type-async" type="radio" name="rt" />
    <select id="async-duration-preset"><option value="30m" selected>30m</option></select>
    <select id="async-session-duration-preset"><option value="5m" selected>5m</option></select>
    <input id="async-auto-start" type="checkbox" checked />
    <input id="trade-count-input" value="3" />
    <span id="trade-schedule-preview"></span>
    <input id="game-id" value="g-1" />
    <input id="player-id" value="p-1" />
    <input id="anchor-token" value="" />
    <input id="anchor-rate" value="" />
    <input id="season-cycles" value="" />
  `;
  const byId = (id) => document.getElementById(id);
  return {
    baseUrlInput: byId('base-url'),
    playerNameInput: byId('player-name'),
    durationPresetInput: byId('duration-preset'),
    durationCustomInput: byId('duration-custom-input'),
    durationCustomValueInput: byId('duration-custom-value'),
    durationCustomUnitInput: byId('duration-custom-unit'),
    enrollmentWindowInput: byId('enrollment-window'),
    scoringModeStockpileInput: byId('scoring-mode-stockpile'),
    scoringModePowerInput: byId('scoring-mode-power'),
    scoringModeInputs: [
      byId('scoring-mode-stockpile'),
      byId('scoring-mode-power'),
    ],
    roundTypeSyncInput: byId('round-type-sync'),
    roundTypeAsyncInput: byId('round-type-async'),
    asyncHostDurationPresetInput: byId('async-duration-preset'),
    asyncSessionDurationPresetInput: byId('async-session-duration-preset'),
    asyncHostAutoStartCheckbox: byId('async-auto-start'),
    tradeCountInput: byId('trade-count-input'),
    tradeSchedulePreviewEl: byId('trade-schedule-preview'),
    gameIdInput: byId('game-id'),
    playerIdInput: byId('player-id'),
    anchorTokenInput: byId('anchor-token'),
    anchorRateInput: byId('anchor-rate'),
    seasonCyclesInput: byId('season-cycles'),
  };
}

async function loadModules() {
  vi.resetModules();
  els = buildForm();
  deps = {
    ...els,
    renderDebugContext: vi.fn(),
    updateSetupActionsState: vi.fn(),
    setSetupCollapsed: vi.fn(),
  };
  storage = await import('../utils/storage-utils.js');
  const host = await import('./setup-host-controls.js');
  const scoring = await import('./scoring-mode-ui.js');
  host.initSetupHostControls(els);
  scoring.initScoringModeUi(els);
  settings = await import('./setup-settings.js');
  settings.initSetupSettings(deps);
}

beforeEach(async () => {
  localStorage.clear();
  await loadModules();
});

describe('saveSettings', () => {
  it('stores the form and falls back to the default backend URL', async () => {
    const { DEFAULT_BACKEND_URL } = await import('../config/backend-url.js');
    els.scoringModePowerInput.checked = true;
    settings.saveSettings();

    const { STORAGE_KEYS, getStorageItem } = storage;
    expect(els.baseUrlInput.value).toBe(DEFAULT_BACKEND_URL);
    expect(getStorageItem(STORAGE_KEYS.baseUrl)).toBe(DEFAULT_BACKEND_URL);
    expect(getStorageItem(STORAGE_KEYS.playerName)).toBe('Alice');
    expect(getStorageItem(STORAGE_KEYS.scoringMode)).toBe(
      'power_oracle_weighted'
    );
    expect(getStorageItem(STORAGE_KEYS.roundType)).toBe('sync');
    expect(getStorageItem(STORAGE_KEYS.asyncAutoStart)).toBe('true');
    expect(getStorageItem(STORAGE_KEYS.tradeCountOverride)).toBe('false');
    expect(getStorageItem(STORAGE_KEYS.gameId)).toBe('g-1');
    expect(getStorageItem(STORAGE_KEYS.playerId)).toBe('p-1');
    expect(deps.renderDebugContext).toHaveBeenCalled();
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
  });

  it('is triggered by the wired setup inputs', () => {
    settings.wireSettingsPersistence();
    els.playerNameInput.value = 'Bob';
    els.playerNameInput.dispatchEvent(new Event('change'));
    expect(storage.getStorageItem(storage.STORAGE_KEYS.playerName)).toBe('Bob');

    els.scoringModePowerInput.checked = true;
    els.scoringModePowerInput.dispatchEvent(new Event('change'));
    expect(storage.getStorageItem(storage.STORAGE_KEYS.scoringMode)).toBe(
      'power_oracle_weighted'
    );

    els.gameIdInput.dispatchEvent(new Event('input'));
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
  });
});

describe('loadSettings', () => {
  it('restores saved values and collapses setup for a joined game', async () => {
    const { STORAGE_KEYS, setStorageItem } = storage;
    setStorageItem(STORAGE_KEYS.baseUrl, ' http://example.test:8000 ');
    setStorageItem(STORAGE_KEYS.playerName, 'Carol');
    setStorageItem(STORAGE_KEYS.durationPreset, 'custom');
    setStorageItem(STORAGE_KEYS.durationCustomValue, '20');
    setStorageItem(STORAGE_KEYS.enrollmentWindow, '90');
    setStorageItem(STORAGE_KEYS.roundType, 'async');
    setStorageItem(STORAGE_KEYS.tradeCount, '2');
    setStorageItem(STORAGE_KEYS.tradeCountOverride, 'true');
    setStorageItem(STORAGE_KEYS.asyncAutoStart, 'false');
    setStorageItem(STORAGE_KEYS.gameId, 'g-9');
    setStorageItem(STORAGE_KEYS.playerId, 'p-9');
    await loadModules();

    settings.loadSettings();

    expect(els.baseUrlInput.value).toBe('http://example.test:8000');
    expect(els.playerNameInput.value).toBe('Carol');
    expect(els.durationCustomInput.style.display).toBe('flex');
    expect(els.enrollmentWindowInput.value).toBe('90');
    expect(els.roundTypeAsyncInput.checked).toBe(true);
    expect(els.asyncHostAutoStartCheckbox.checked).toBe(false);
    expect(els.gameIdInput.value).toBe('g-9');
    expect(els.playerIdInput.value).toBe('p-9');
    expect(deps.setSetupCollapsed).toHaveBeenCalledWith(true);
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
  });

  it('keeps the form defaults when nothing is stored', async () => {
    const { DEFAULT_BACKEND_URL } = await import('../config/backend-url.js');
    settings.loadSettings();
    expect(els.baseUrlInput.value).toBe(DEFAULT_BACKEND_URL);
    expect(els.playerNameInput.value).toBe('Alice');
    expect(els.scoringModeStockpileInput.checked).toBe(true);
    expect(deps.setSetupCollapsed).not.toHaveBeenCalled();
  });
});

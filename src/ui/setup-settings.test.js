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
    <input id="game-id" value="g-1" />
    <input id="player-id" value="p-1" />
    <span id="scoring-mode-status"></span>
  `;
  const byId = (id) => document.getElementById(id);
  return {
    baseUrlInput: byId('base-url'),
    playerNameInput: byId('player-name'),
    gameIdInput: byId('game-id'),
    playerIdInput: byId('player-id'),
    scoringModeStatusEl: byId('scoring-mode-status'),
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
  const scoring = await import('./scoring-mode-ui.js');
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
    settings.saveSettings();

    const { STORAGE_KEYS, getStorageItem } = storage;
    expect(els.baseUrlInput.value).toBe(DEFAULT_BACKEND_URL);
    expect(getStorageItem(STORAGE_KEYS.baseUrl)).toBe(DEFAULT_BACKEND_URL);
    expect(getStorageItem(STORAGE_KEYS.playerName)).toBe('Alice');
    expect(getStorageItem(STORAGE_KEYS.gameId)).toBe('g-1');
    expect(getStorageItem(STORAGE_KEYS.playerId)).toBe('p-1');
    expect(els.scoringModeStatusEl.textContent).toBe('Stockpile Mode');
    expect(deps.renderDebugContext).toHaveBeenCalled();
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
  });

  it('is triggered by the wired setup inputs', () => {
    settings.wireSettingsPersistence();
    els.playerNameInput.value = 'Bob';
    els.playerNameInput.dispatchEvent(new Event('change'));
    expect(storage.getStorageItem(storage.STORAGE_KEYS.playerName)).toBe('Bob');

    els.playerIdInput.value = 'p-2';
    els.playerIdInput.dispatchEvent(new Event('change'));
    expect(storage.getStorageItem(storage.STORAGE_KEYS.playerId)).toBe('p-2');

    els.gameIdInput.dispatchEvent(new Event('input'));
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
  });
});

describe('loadSettings', () => {
  it('restores saved values and collapses setup for a joined game', async () => {
    const { STORAGE_KEYS, setStorageItem } = storage;
    setStorageItem(STORAGE_KEYS.baseUrl, ' http://example.test:8000 ');
    setStorageItem(STORAGE_KEYS.playerName, 'Carol');
    setStorageItem(STORAGE_KEYS.gameId, 'g-9');
    setStorageItem(STORAGE_KEYS.playerId, 'p-9');
    await loadModules();

    settings.loadSettings();

    expect(els.baseUrlInput.value).toBe('http://example.test:8000');
    expect(els.playerNameInput.value).toBe('Carol');
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
    expect(deps.setSetupCollapsed).not.toHaveBeenCalled();
  });
});

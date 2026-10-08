// Tests the legacy host controls: trade schedule preview, trade count sync and round type.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const metaState = vi.hoisted(() => ({ gameMeta: null }));

vi.mock('../meta/meta-manager.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getGameMeta: () => metaState.gameMeta,
}));

let host;
let els;

beforeEach(async () => {
  vi.resetModules();
  metaState.gameMeta = null;
  document.body.innerHTML = `
    <input id="game-id" value="7" />
    <select id="duration-preset"><option value="10m" selected>10m</option></select>
    <div id="duration-custom-input" style="display:none"></div>
    <input id="duration-custom-value" value="" />
    <select id="duration-custom-unit"><option value="minutes" selected>minutes</option></select>
    <input id="round-type-sync" type="radio" checked />
    <input id="round-type-async" type="radio" />
    <div id="sync-host-controls"></div>
    <div id="async-host-controls"></div>
    <input id="trade-count-input" value="3" />
    <span id="trade-count-mode-note"></span>
    <span id="trade-schedule-preview"></span>
    <input id="show-advanced-overrides" type="checkbox" />
    <div id="advanced-overrides" style="display:none"></div>
  `;
  const byId = (id) => document.getElementById(id);
  els = {
    gameIdInput: byId('game-id'),
    durationPresetInput: byId('duration-preset'),
    durationCustomInput: byId('duration-custom-input'),
    durationCustomValueInput: byId('duration-custom-value'),
    durationCustomUnitInput: byId('duration-custom-unit'),
    roundTypeSyncInput: byId('round-type-sync'),
    roundTypeAsyncInput: byId('round-type-async'),
    syncHostControlsEl: byId('sync-host-controls'),
    asyncHostControlsEl: byId('async-host-controls'),
    tradeCountInput: byId('trade-count-input'),
    tradeCountModeNoteEl: byId('trade-count-mode-note'),
    tradeSchedulePreviewEl: byId('trade-schedule-preview'),
    showAdvancedCheckbox: byId('show-advanced-overrides'),
    advancedOverridesDiv: byId('advanced-overrides'),
  };
  host = await import('./setup-host-controls.js');
  host.initSetupHostControls(els);
});

describe('trade schedule preview', () => {
  it('uses backend trading rules and formats offsets as mm:ss / hh:mm', () => {
    metaState.gameMeta = {
      trading_rules: {
        trade_count: 2,
        unlock_offsets_seconds: [90, 3720, 'x'],
      },
    };
    host.renderTradeSchedulePreview();

    expect(els.tradeSchedulePreviewEl.textContent).toBe(
      'Trade 1 available at 01:30 | Trade 2 available at 01:02'
    );
    expect(els.tradeCountInput.disabled).toBe(true);
    expect(els.tradeCountModeNoteEl.textContent).toBe(
      'Using backend-authoritative trading rules for this game.'
    );
  });

  it('reports a round without trades', () => {
    metaState.gameMeta = { trading_rules: { trade_count: 0 } };
    host.renderTradeSchedulePreview();
    expect(els.tradeSchedulePreviewEl.textContent).toBe(
      'Trade schedule: no trades in this round.'
    );
  });

  it('derives the default schedule from the duration without game meta', () => {
    host.syncTradeCountWithDuration({ forceDefault: true });
    expect(els.tradeCountInput.disabled).toBe(false);
    expect(els.tradeCountModeNoteEl.textContent).toBe(
      'Auto default from round duration.'
    );
    expect(els.tradeSchedulePreviewEl.textContent).not.toBe('');
  });
});

describe('host control events', () => {
  it('marks a manual trade count override and saves', () => {
    const onSettingsChanged = vi.fn();
    host.wireHostControlEvents({ onSettingsChanged });

    els.tradeCountInput.value = '2';
    els.tradeCountInput.dispatchEvent(new Event('change'));

    expect(host.isTradeCountManuallyOverridden()).toBe(true);
    expect(els.tradeCountModeNoteEl.textContent).toBe(
      'Manual override active (clamped to allowed limits).'
    );
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);

    // A manual override survives a duration sync (clamped, not reset).
    host.syncTradeCountWithDuration();
    expect(els.tradeCountInput.value).toBe('2');
  });

  it('toggles the advanced overrides block', () => {
    host.wireHostControlEvents({ onSettingsChanged: vi.fn() });
    els.showAdvancedCheckbox.checked = true;
    els.showAdvancedCheckbox.dispatchEvent(new Event('change'));
    expect(els.advancedOverridesDiv.style.display).toBe('block');

    els.showAdvancedCheckbox.checked = false;
    els.showAdvancedCheckbox.dispatchEvent(new Event('change'));
    expect(els.advancedOverridesDiv.style.display).toBe('none');
  });

  it('shows the custom duration input for the custom preset', () => {
    const onSettingsChanged = vi.fn();
    host.wireHostControlEvents({ onSettingsChanged });
    const custom = document.createElement('option');
    custom.value = 'custom';
    els.durationPresetInput.appendChild(custom);

    els.durationPresetInput.value = 'custom';
    els.durationPresetInput.dispatchEvent(new Event('change'));
    expect(els.durationCustomInput.style.display).toBe('flex');

    els.durationPresetInput.value = '10m';
    els.durationPresetInput.dispatchEvent(new Event('change'));
    expect(els.durationCustomInput.style.display).toBe('none');

    els.durationCustomValueInput.dispatchEvent(new Event('change'));
    els.durationCustomUnitInput.dispatchEvent(new Event('change'));
    expect(onSettingsChanged).toHaveBeenCalledTimes(4);
  });
});

describe('round type', () => {
  it('switches the visible host controls with the round type', () => {
    host.setSelectedRoundType('async');
    expect(host.getSelectedRoundType()).toBe('async');
    expect(els.roundTypeAsyncInput.checked).toBe(true);
    expect(els.syncHostControlsEl.hidden).toBe(true);
    expect(els.asyncHostControlsEl.hidden).toBe(false);

    host.setSelectedRoundType('anything');
    expect(host.getSelectedRoundType()).toBe('sync');
    expect(els.syncHostControlsEl.hidden).toBe(false);
  });
});

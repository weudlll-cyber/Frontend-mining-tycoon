/**
 * File: src\ui\async-duration.test.js
 * Purpose: Regression tests for async-duration.test.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  fillPresetSelect,
  getAsyncDurationPreset,
  getAsyncSessionDurationSeconds,
  populateHostPresetSelects,
  presetToSeconds,
  syncSessionDurationOptions,
} from './async-duration.js';
import { setGameConfigDocument } from '../config/game-config.js';

afterEach(() => setGameConfigDocument(null));

const BACKEND_DOC = {
  version: 5,
  config: {
    duration_presets: { '2m': 120, '5m': 300, '30m': 1800, '6h': 21600 },
    sync_round_preset_ids: ['2m', '5m'],
    async_round_preset_ids: ['30m', '6h'],
    async_session_preset_ids: ['2m', '5m'],
    defaults: {
      sync_round_preset: '2m',
      async_round_preset: '6h',
      async_session_preset: '2m',
    },
  },
};

function createSelect(id, values, selectedValue) {
  const select = document.createElement('select');
  select.id = id;
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  return select;
}

describe('async-duration helpers', () => {
  it('clamps invalid async session option to largest valid value', () => {
    const roundDurationInput = createSelect(
      'async-duration-preset',
      ['5m', '10m', '6h'],
      '10m'
    );
    const sessionDurationInput = createSelect(
      'async-session-duration-preset',
      ['5m', '10m', '30m', '60m'],
      '60m'
    );
    const warningEl = document.createElement('span');

    syncSessionDurationOptions({
      roundDurationInput,
      sessionDurationInput,
      warningEl,
      enforceLimit: true,
    });

    expect(sessionDurationInput.value).toBe('10m');
    expect(
      Array.from(sessionDurationInput.options)
        .filter((opt) => opt.disabled)
        .map((opt) => opt.value)
    ).toEqual(['30m', '60m']);
    expect(warningEl.hidden).toBe(false);
  });

  it('keeps all session options enabled when async guard is disabled', () => {
    const roundDurationInput = createSelect(
      'async-duration-preset',
      ['5m', '10m', '6h'],
      '5m'
    );
    const sessionDurationInput = createSelect(
      'async-session-duration-preset',
      ['5m', '10m', '30m', '60m'],
      '60m'
    );
    const warningEl = document.createElement('span');

    syncSessionDurationOptions({
      roundDurationInput,
      sessionDurationInput,
      warningEl,
      enforceLimit: false,
    });

    expect(sessionDurationInput.value).toBe('60m');
    expect(
      Array.from(sessionDurationInput.options).every((opt) => !opt.disabled)
    ).toBe(true);
    expect(warningEl.hidden).toBe(true);
    expect(warningEl.textContent).toBe('');
  });
});

describe('async-duration with the effective game config', () => {
  it('fills preset selects with derived labels and keeps a still-offered value', () => {
    const select = createSelect('s', ['10m', '30m'], '30m');
    fillPresetSelect(select, ['5m', '30m', '6h'], '5m', { customOption: true });
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '5m',
      '30m',
      '6h',
      'custom',
    ]);
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      '5m',
      '30m',
      '6h',
      'Custom…',
    ]);
    expect(select.value).toBe('30m');

    fillPresetSelect(select, ['5m', '6h'], '6h');
    expect(select.value).toBe('6h');
    fillPresetSelect(select, ['5m', '6h'], '5m', { keepCurrent: false });
    expect(select.value).toBe('5m');
    expect(() => fillPresetSelect(null, ['5m'], '5m')).not.toThrow();
  });

  it('populates the hidden host controls from the backend game config', () => {
    setGameConfigDocument(BACKEND_DOC);
    const durationPresetInput = createSelect('d', ['30m'], '30m');
    const asyncDurationPresetInput = createSelect('a', ['3d'], '3d');
    const asyncSessionPresetInput = createSelect('s', ['24h'], '24h');
    populateHostPresetSelects({
      durationPresetInput,
      asyncDurationPresetInput,
      asyncSessionPresetInput,
    });
    expect(durationPresetInput.value).toBe('2m');
    expect(durationPresetInput.options).toHaveLength(3);
    expect(asyncDurationPresetInput.value).toBe('6h');
    expect(asyncSessionPresetInput.value).toBe('2m');
    expect(presetToSeconds('2m')).toBe(120);
  });

  it('resolves async presets against the offered lists and defaults', () => {
    setGameConfigDocument(BACKEND_DOC);
    expect(getAsyncDurationPreset({ value: '30m' })).toBe('30m');
    expect(getAsyncDurationPreset({ value: '3d' })).toBe('6h');
    expect(getAsyncDurationPreset(null)).toBe('6h');
    expect(getAsyncSessionDurationSeconds({ value: '5m' })).toBe(300);
    expect(getAsyncSessionDurationSeconds({ value: '6h' })).toBe(120);
    expect(getAsyncSessionDurationSeconds(null)).toBe(120);
  });
});

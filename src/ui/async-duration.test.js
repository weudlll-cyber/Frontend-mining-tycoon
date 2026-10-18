/**
 * File: src\ui\async-duration.test.js
 * Purpose: Regression tests for async-duration.test.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { fillPresetSelect } from './async-duration.js';
import { setGameConfigDocument } from '../config/game-config.js';

afterEach(() => setGameConfigDocument(null));

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

describe('fillPresetSelect', () => {
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
});

import { describe, expect, it } from 'vitest';
import { syncSessionDurationOptions } from './async-duration.js';

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

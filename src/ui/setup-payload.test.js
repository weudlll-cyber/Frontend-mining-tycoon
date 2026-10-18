/**
 * File: src\ui\setup-payload.test.js
 * Purpose: Regression tests for setup-payload.test.
 */

import { collectAdvancedOverridesFromInputs } from './setup-payload.js';
import { afterEach, describe, expect, it } from 'vitest';
import { setGameConfigDocument } from '../config/game-config.js';

afterEach(() => setGameConfigDocument(null));

describe('setup-payload helpers', () => {
  it('collects advanced overrides only when enabled', () => {
    const disabled = collectAdvancedOverridesFromInputs({
      showAdvancedCheckbox: { checked: false },
      anchorTokenInput: { value: 'summer' },
      anchorRateInput: { value: '8.5' },
      seasonCyclesInput: { value: '2' },
    });

    expect(disabled).toEqual({});

    const enabled = collectAdvancedOverridesFromInputs({
      showAdvancedCheckbox: { checked: true },
      anchorTokenInput: { value: 'summer' },
      anchorRateInput: { value: '8.5' },
      seasonCyclesInput: { value: '2' },
    });

    expect(enabled).toEqual({
      emission_anchor_token: 'summer',
      emission_anchor_tokens_per_second: 8.5,
      season_cycles_per_game: 2,
    });
  });
});

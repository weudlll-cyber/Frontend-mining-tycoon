/**
 * File: src\ui\setup-payload.test.js
 * Purpose: Regression tests for setup-payload.test.
 */

import {
  resolveDurationSecondsFromInputs,
  collectAdvancedOverridesFromInputs,
} from './setup-payload.js';
import { afterEach, describe, expect, it } from 'vitest';
import { setGameConfigDocument } from '../config/game-config.js';

afterEach(() => setGameConfigDocument(null));

describe('setup-payload helpers', () => {
  it('returns preset duration payload in preset mode', () => {
    const payload = resolveDurationSecondsFromInputs({
      durationPresetInput: { value: '10m' },
      durationCustomValueInput: { value: '120' },
      durationCustomUnitInput: { value: 'minutes' },
    });

    expect(payload).toEqual({ mode: 'preset', preset: '10m' });
  });

  it('returns custom duration payload in custom mode', () => {
    const payload = resolveDurationSecondsFromInputs({
      durationPresetInput: { value: 'custom' },
      durationCustomValueInput: { value: '2' },
      durationCustomUnitInput: { value: 'hours' },
    });

    expect(payload).toEqual({ mode: 'custom', customSeconds: 7200 });
  });

  it('throws for invalid custom duration values', () => {
    expect(() =>
      resolveDurationSecondsFromInputs({
        durationPresetInput: { value: 'custom' },
        durationCustomValueInput: { value: '0' },
        durationCustomUnitInput: { value: 'seconds' },
      })
    ).toThrow('Custom duration must be a positive number');
  });

  it('validates custom durations against the effective duration limits', () => {
    const custom = (value) =>
      resolveDurationSecondsFromInputs({
        durationPresetInput: { value: 'custom' },
        durationCustomValueInput: { value },
        durationCustomUnitInput: { value: 'seconds' },
      });
    expect(() => custom('30')).toThrow('Duration must be between 60s and');
    setGameConfigDocument({
      version: 2,
      config: { duration_limits: { min_seconds: 30, max_seconds: 120 } },
    });
    expect(custom('30')).toEqual({ mode: 'custom', customSeconds: 30 });
    expect(() => custom('121')).toThrow(
      'Duration must be between 30s and 120s'
    );
  });

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

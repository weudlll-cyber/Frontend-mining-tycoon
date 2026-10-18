/**
File: src/main.halving-passthrough.test.js
Purpose: Small passthrough checks for main halving helpers.
*/

import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('main halving helper passthroughs', () => {
  it('resets next-halving target only when hash changed', async () => {
    const module = await loadMainModule();

    expect(module.shouldResetNextHalvingCountdownTarget(null, null)).toBe(true);
    expect(
      module.shouldResetNextHalvingCountdownTarget(
        { token: 'spring', halvingMonth: 3 },
        { token: 'spring', halvingMonth: 3 }
      )
    ).toBe(false);
    expect(
      module.shouldResetNextHalvingCountdownTarget(
        { token: 'spring', halvingMonth: 3 },
        { token: 'summer', halvingMonth: 3 }
      )
    ).toBe(true);
  });

  it('returns null target when no future halving exists', async () => {
    const module = await loadMainModule();

    const target = module.resolveNextHalvingTarget({
      game_id: 'g1',
      phase: 'running',
      server_time_seconds: 500,
      cycle_seconds: 300,
      emission: {
        current_cycle_elapsed_seconds: 200,
      },
      global_events: {
        halving: {
          occurred_count: 4,
          max_count: 4,
          interval_cycles: 2,
        },
      },
    });

    expect(target).toBeNull();
  });
});

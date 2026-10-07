/**
File: src/ui/farming-state.test.js
Purpose: Verify the pure Farming Stage 1 helpers: contract normalization,
  holdings, farm action state merging and formatting.
Role in system: Guards the frontend side of the farming contract
  (`farming` in meta / state / SSE, `updated_state` of farm actions).
*/

import { describe, expect, it } from 'vitest';

import {
  formatFarmDuration,
  formatRewardPercent,
  getFarmPosition,
  mergeFarmUpdatedState,
  normalizeFarming,
  resolveFarmTokens,
  resolveFarmedAmounts,
  resolveHoldings,
  resolveRawFarming,
} from './farming-state.js';

const STATE_FARMING = {
  enabled: true,
  min_duration_seconds: 300,
  reward_rate: 0.05,
  positions: {
    Spring: { amount: 12.5, next_reward_in_seconds: 42.4, cycles_completed: 2 },
    summer: { amount: 0, next_reward_in_seconds: null, cycles_completed: 0 },
    winter: { amount: 'bad', next_reward_in_seconds: -3 },
  },
};

describe('normalizeFarming', () => {
  it('treats a payload without farming (older backend) as not enabled', () => {
    expect(normalizeFarming(null, null)).toEqual({
      enabled: false,
      min_duration_seconds: null,
      reward_rate: null,
      positions: {},
    });
    expect(
      normalizeFarming({}, { player_state: { balances: {} } }).enabled
    ).toBe(false);
  });

  it('uses meta rules when the state has no farming block', () => {
    const farming = normalizeFarming(
      {
        farming: { enabled: true, min_duration_seconds: 60, reward_rate: 0.1 },
      },
      {}
    );
    expect(farming).toMatchObject({
      enabled: true,
      min_duration_seconds: 60,
      reward_rate: 0.1,
    });
  });

  it('prefers the state block and normalizes positions', () => {
    const farming = normalizeFarming(
      { farming: { enabled: false, min_duration_seconds: 10 } },
      { farming: STATE_FARMING }
    );
    expect(farming.enabled).toBe(true);
    expect(farming.min_duration_seconds).toBe(300);
    expect(farming.positions.spring).toEqual({
      amount: 12.5,
      next_reward_in_seconds: 42,
      cycles_completed: 2,
    });
    expect(farming.positions.winter).toEqual({
      amount: 0,
      next_reward_in_seconds: 0,
      cycles_completed: 0,
    });
    expect(getFarmPosition(farming, 'autumn')).toEqual({
      amount: 0,
      next_reward_in_seconds: null,
      cycles_completed: 0,
    });
  });

  it('rejects invalid rule values', () => {
    const farming = normalizeFarming(null, {
      farming: { enabled: 'yes', min_duration_seconds: 0, reward_rate: -1 },
    });
    expect(farming).toMatchObject({
      enabled: false,
      min_duration_seconds: null,
      reward_rate: null,
    });
  });

  it('falls back to a farming block inside player_state', () => {
    const state = { player_state: { farming: STATE_FARMING } };
    expect(resolveRawFarming(state)).toBe(STATE_FARMING);
    expect(normalizeFarming(null, state).enabled).toBe(true);
  });
});

describe('holdings', () => {
  it('lists farmed amounts above zero only', () => {
    expect(resolveFarmedAmounts({ farming: STATE_FARMING })).toEqual({
      spring: 12.5,
    });
    expect(resolveFarmedAmounts({})).toEqual({});
  });

  it('adds farmed amounts to spendable balances', () => {
    const balances = { spring: 10, summer: 1 };
    expect(
      resolveHoldings({ player_state: { balances }, farming: STATE_FARMING })
    ).toEqual({ spring: 22.5, summer: 1 });
    // Without farming the balances object is returned unchanged.
    expect(resolveHoldings({ player_state: { balances } })).toBe(balances);
    expect(resolveHoldings({ player_state: {} })).toBeNull();
    expect(
      resolveHoldings({
        player_state: { tokens: {} },
        farming: { positions: { autumn: { amount: 3 } } },
      })
    ).toEqual({ autumn: 3 });
  });
});

describe('mergeFarmUpdatedState', () => {
  const previous = {
    game_id: 'g',
    player_state: { balances: { spring: 50 } },
    farming: { enabled: true, min_duration_seconds: 300, reward_rate: 0.05 },
  };

  it('stores a player-state shaped update and merges its farming block', () => {
    const next = mergeFarmUpdatedState(previous, {
      balances: { spring: 40 },
      farming: { positions: { spring: { amount: 10 } } },
    });
    expect(next.game_id).toBe('g');
    expect(next.player_state.balances.spring).toBe(40);
    expect(next.farming).toMatchObject({
      enabled: true,
      reward_rate: 0.05,
      positions: { spring: { amount: 10 } },
    });
  });

  it('keeps the previous farming block when the update has none', () => {
    const next = mergeFarmUpdatedState(previous, { balances: { spring: 1 } });
    expect(next.farming).toBe(previous.farming);
  });

  it('merges a full state update over the previous state', () => {
    const next = mergeFarmUpdatedState(previous, {
      player_state: { balances: { spring: 2 } },
      farming: { enabled: true, positions: {} },
    });
    expect(next.player_state.balances.spring).toBe(2);
    expect(next.farming.positions).toEqual({});
    expect(next.game_id).toBe('g');
  });

  it('ignores invalid updates', () => {
    expect(mergeFarmUpdatedState(previous, null)).toBe(previous);
    expect(mergeFarmUpdatedState(null, null)).toEqual({});
  });
});

describe('formatting', () => {
  it('formats durations compactly', () => {
    expect(formatFarmDuration(45)).toBe('45s');
    expect(formatFarmDuration(300)).toBe('5m');
    expect(formatFarmDuration(90)).toBe('1m 30s');
    expect(formatFarmDuration(8100)).toBe('2h 15m');
    expect(formatFarmDuration(3600)).toBe('1h');
    expect(formatFarmDuration(273600)).toBe('3d 4h');
    expect(formatFarmDuration(-5)).toBe('0s');
    expect(formatFarmDuration(null)).toBe('--');
  });

  it('formats reward rates as percent', () => {
    expect(formatRewardPercent(0.05)).toBe('5%');
    expect(formatRewardPercent(0.0001)).toBe('0.01%');
    expect(formatRewardPercent(0.07)).toBe('7%');
    expect(formatRewardPercent(undefined)).toBe('--');
  });

  it('resolves farm tokens from balances with a canonical fallback', () => {
    expect(
      resolveFarmTokens({
        player_state: { balances: { Spring: 1, winter: 2 } },
      })
    ).toEqual(['spring', 'winter']);
    expect(resolveFarmTokens(null)).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
    ]);
  });
});

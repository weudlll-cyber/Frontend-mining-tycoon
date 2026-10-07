/**
File: src/services/game-actions.test.js
Purpose: Validate upgrade/trade request shaping and backend error surfacing.
Role in system:
- Proves frontend request shaping stays intent-only while backend remains authoritative.
Invariants:
- Errors remain inline through the existing toast rather than modal UX.
Security notes:
- Tests verify payload/headers only and never expose token content.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as gameActions from './game-actions.js';
import {
  initGameActions,
  performTrade,
  performUpgrade,
} from './game-actions.js';

function buildDeps(overrides = {}) {
  return {
    isActiveContractSupported: vi.fn(() => true),
    showToast: vi.fn(),
    getLastGameData: vi.fn(() => null),
    getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
    getStorageItem: vi.fn(() => null),
    getPlayerTokenStorageKey: vi.fn(() => 'player-token-key'),
    ...overrides,
  };
}

describe('performUpgrade pay-token wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends explicit target_token and pay_token from inline intent', async () => {
    const deps = buildDeps({
      getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
    });
    initGameActions(deps);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    globalThis.fetch = fetchMock;

    await performUpgrade('hashrate', 1, 'summer', 'winter');

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.upgrade_type).toBe('hashrate');
    expect(requestBody.target_token).toBe('summer');
    expect(requestBody.pay_token).toBe('winter');
  });

  it('defaults pay_token to the target token when none is given', async () => {
    initGameActions(
      buildDeps({
        getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
      })
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    globalThis.fetch = fetchMock;

    await performUpgrade('cooling', 1, 'autumn');

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.target_token).toBe('autumn');
    expect(requestBody.pay_token).toBe('autumn');
  });
});

describe('performTrade wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts canonical trade payload and invokes onTradeExecuted callback', async () => {
    const onTradeExecuted = vi.fn();
    const deps = buildDeps({
      getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
      onTradeExecuted,
    });
    initGameActions(deps);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        updated_state: { balances: { spring: 900, summer: 1090 } },
        trade_result: { trades_used: 1 },
      }),
    });
    globalThis.fetch = fetchMock;

    await performTrade('spring', 'summer', 100);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/games/g-1/players/p-1/trade');
    expect(JSON.parse(options.body)).toEqual({
      from_token: 'spring',
      to_token: 'summer',
      amount: 100,
    });
    expect(onTradeExecuted).toHaveBeenCalledTimes(1);
  });
});

describe('backend error surfacing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the backend 409 message verbatim when upgrading outside an active round', async () => {
    const deps = buildDeps({
      getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
    });
    initGameActions(deps);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ detail: 'Round is not running.' }),
    });

    await performUpgrade('hashrate', 2, 'spring', 'spring');

    expect(deps.showToast).toHaveBeenCalledWith(
      'Round is not running.',
      'error'
    );
  });

  it('prefixes other upgrade failures and supports structured detail', async () => {
    const deps = buildDeps({
      getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
    });
    initGameActions(deps);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        detail: { code: 'INSUFFICIENT_FUNDS', message: 'Not enough spring.' },
      }),
    });

    await performUpgrade('hashrate', 2, 'spring', 'spring');

    expect(deps.showToast).toHaveBeenCalledWith(
      'Upgrade failed: Not enough spring.',
      'error'
    );
  });

  it('rejects trades with the backend 409 message and status', async () => {
    const deps = buildDeps({
      getLastGameData: vi.fn(() => ({ game_id: 'g-1', player_id: 'p-1' })),
    });
    initGameActions(deps);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ detail: 'No active session for this player.' }),
    });

    await expect(performTrade('spring', 'summer', 5)).rejects.toMatchObject({
      message: 'No active session for this player.',
      status: 409,
    });
  });

  it('no longer exposes the dead player-side create-game flow', () => {
    expect(gameActions.createNewGameAndJoin).toBeUndefined();
    expect(gameActions.startRoundSession).toBeUndefined();
  });
});

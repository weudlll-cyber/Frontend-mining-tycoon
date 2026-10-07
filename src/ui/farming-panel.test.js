/**
File: src/ui/farming-panel.test.js
Purpose: Verify the Farm tab (Farming Stage 1) and the action-bar pill:
  status text when disabled, rule summary, per-token rows, the play-window
  gate, deposit/withdraw intents, error toasts and the local countdown tick.
Role in system: UI contract tests for src/ui/farming-panel.js with mocked
  dependencies (no network).
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FARMING_DISABLED_TEXT,
  formatFarmingPillText,
  formatNextReward,
  initFarmingPanel,
  resolveFarmActionState,
} from './farming-panel.js';

const ENABLED_FARMING = {
  enabled: true,
  min_duration_seconds: 300,
  reward_rate: 0.05,
  positions: {
    spring: { amount: 20, next_reward_in_seconds: 65, cycles_completed: 3 },
  },
};

function buildState(farming = ENABLED_FARMING) {
  return {
    game_id: 'g-1',
    player_id: 'p-1',
    player_state: {
      balances: { spring: 100, summer: 5, autumn: 0, winter: 1 },
    },
    ...(farming ? { farming } : {}),
  };
}

function setup(overrides = {}) {
  const panelEl = document.createElement('div');
  const statusEl = document.createElement('span');
  statusEl.className = 'bottom-bar-value';
  document.body.append(panelEl, statusEl);
  let state = 'state' in overrides ? overrides.state : buildState();
  let nowMs = 1_000_000;
  const deps = {
    getGameMeta: vi.fn(() => overrides.meta ?? null),
    getLastGameData: vi.fn(() => state),
    getActionAvailability: vi.fn(
      () => overrides.availability ?? { allowed: true, code: null, reason: '' }
    ),
    depositFarm:
      'depositFarm' in overrides
        ? overrides.depositFarm
        : vi.fn(async () => ({})),
    withdrawFarm: overrides.withdrawFarm ?? vi.fn(async () => ({})),
    showToast: vi.fn(),
    farmingPanelRef: panelEl,
    farmingStatusRef: statusEl,
    now: () => nowMs,
    tickMs: 1000,
  };
  const api = initFarmingPanel(deps);
  return {
    api,
    deps,
    panelEl,
    statusEl,
    setState(next) {
      state = next;
    },
    advance(ms) {
      nowMs += ms;
    },
  };
}

function row(panelEl, token) {
  return panelEl.querySelector(`.farming-row[data-token="${token}"]`);
}

function button(panelEl, token, action) {
  return panelEl.querySelector(
    `button[data-farm-action="${action}"][data-token="${token}"]`
  );
}

function typeAmount(panelEl, token, value) {
  const input = panelEl.querySelector(
    `input[data-field="farm-amount"][data-token="${token}"]`
  );
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('resolveFarmActionState', () => {
  const base = {
    farming: { enabled: true },
    availability: { allowed: true },
    balance: 10,
    farmed: 4,
  };

  it('blocks while submitting, when disabled and outside the play window', () => {
    expect(
      resolveFarmActionState({ ...base, action: 'deposit', isSubmitting: true })
        .enabled
    ).toBe(false);
    expect(
      resolveFarmActionState({
        ...base,
        action: 'deposit',
        farming: { enabled: false },
      }).reason
    ).toBe(FARMING_DISABLED_TEXT);
    expect(
      resolveFarmActionState({
        ...base,
        action: 'withdraw-all',
        availability: {
          allowed: false,
          reason: 'Upgrades and trades unlock when the round starts.',
          farmReason: 'Farming opens when the round starts.',
        },
      })
    ).toEqual({
      enabled: false,
      reason: 'Farming opens when the round starts.',
    });
    expect(
      resolveFarmActionState({
        ...base,
        action: 'deposit',
        availability: { allowed: false, reason: 'Closed.' },
      }).reason
    ).toBe('Closed.');
  });

  it('validates amounts against balance and farmed amount', () => {
    const state = (action, amountText) =>
      resolveFarmActionState({ ...base, action, amountText });
    expect(state('deposit', '').reason).toMatch(/greater than 0/);
    expect(state('deposit', '-1').enabled).toBe(false);
    expect(state('deposit', '11').reason).toMatch(/available balance/);
    expect(state('deposit', '10').enabled).toBe(true);
    expect(state('withdraw', '5').reason).toMatch(/farmed amount/);
    expect(state('withdraw', '4').enabled).toBe(true);
    expect(state('withdraw-all', '').enabled).toBe(true);
    expect(
      resolveFarmActionState({ ...base, action: 'withdraw-all', farmed: 0 })
        .enabled
    ).toBe(false);
  });
});

describe('formatting helpers', () => {
  it('formats the pill text', () => {
    expect(formatFarmingPillText({ enabled: false })).toBe('Not enabled');
    expect(
      formatFarmingPillText({
        enabled: true,
        reward_rate: 0.05,
        min_duration_seconds: 300,
      })
    ).toBe('Enabled (5% / 5m)');
    expect(
      formatFarmingPillText({
        enabled: true,
        reward_rate: null,
        min_duration_seconds: null,
      })
    ).toBe('Enabled');
  });

  it('formats the next reward countdown', () => {
    const position = { amount: 1, next_reward_in_seconds: 65 };
    expect(formatNextReward(position)).toBe('1m 5s');
    expect(formatNextReward(position, 5)).toBe('1m');
    expect(formatNextReward(position, 100)).toBe('Due now');
    expect(formatNextReward({ amount: 0, next_reward_in_seconds: 3 })).toBe(
      '—'
    );
    expect(formatNextReward({ amount: 2, next_reward_in_seconds: null })).toBe(
      '—'
    );
    expect(formatNextReward(null)).toBe('—');
  });
});

describe('initFarmingPanel', () => {
  it('returns null without any target element', () => {
    expect(initFarmingPanel({})).toBeNull();
    expect(initFarmingPanel()).toBeNull();
  });

  it('shows explicit status text when farming is not in the payload', () => {
    const { panelEl, statusEl, api } = setup({ state: buildState(null) });
    expect(panelEl.querySelector('.farming-status-line').textContent).toBe(
      FARMING_DISABLED_TEXT
    );
    expect(panelEl.querySelector('.farming-rows').hidden).toBe(true);
    expect(panelEl.querySelector('.farming-rules').hidden).toBe(true);
    expect(statusEl.textContent).toBe('Not enabled');
    expect(statusEl.classList.contains('farming-status-disabled')).toBe(true);
    expect(statusEl.classList.contains('bottom-bar-value')).toBe(true);
    api.dispose();
  });

  it('renders rules, rows and the pill when farming is enabled', () => {
    const { panelEl, statusEl, api } = setup();
    expect(
      panelEl.querySelector('.farming-status-line').dataset.farmingState
    ).toBe('enabled');
    expect(
      panelEl.querySelector('.farming-rule-summary').textContent
    ).toContain('5% of the farmed amount per completed 5m cycle');
    expect(panelEl.querySelectorAll('.farming-rule-list li')).toHaveLength(5);
    expect(panelEl.querySelectorAll('.farming-row')).toHaveLength(4);
    const spring = row(panelEl, 'spring');
    expect(spring.textContent).toContain('Spring');
    const values = [...spring.querySelectorAll('.farming-stat-value')].map(
      (node) => node.textContent
    );
    expect(values).toEqual(['100', '20', '3', '1m 5s']);
    expect(statusEl.textContent).toBe('Enabled (5% / 5m)');
    expect(statusEl.classList.contains('farming-status-enabled')).toBe(true);
    expect(button(panelEl, 'spring', 'withdraw-all').disabled).toBe(false);
    expect(button(panelEl, 'summer', 'withdraw-all').disabled).toBe(true);
    expect(button(panelEl, 'spring', 'deposit').title).toMatch(
      /greater than 0/
    );
    api.dispose();
  });

  it('uses round meta rules before the first state arrives', () => {
    const { statusEl, api } = setup({
      state: null,
      meta: {
        farming: { enabled: true, min_duration_seconds: 60, reward_rate: 0.1 },
      },
    });
    expect(statusEl.textContent).toBe('Enabled (10% / 1m)');
    api.dispose();
  });

  it('disables actions with the farm reason outside the play window', () => {
    const { panelEl, api } = setup({
      availability: {
        allowed: false,
        code: 'ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION',
        reason: 'Start a session to upgrade or trade.',
        farmReason: 'Start a session to deposit or withdraw.',
      },
    });
    const note = panelEl.querySelector('.farming-availability-note');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Start a session to deposit or withdraw.');
    const withdrawAll = button(panelEl, 'spring', 'withdraw-all');
    expect(withdrawAll.disabled).toBe(true);
    expect(withdrawAll.title).toBe('Start a session to deposit or withdraw.');
    api.dispose();
  });

  it('deposits the typed amount and clears the field on success', async () => {
    const { panelEl, deps, api } = setup();
    const input = typeAmount(panelEl, 'spring', '25');
    const deposit = button(panelEl, 'spring', 'deposit');
    expect(deposit.disabled).toBe(false);
    deposit.click();
    await vi.waitFor(() =>
      expect(deps.depositFarm).toHaveBeenCalledWith({
        token: 'spring',
        amount: 25,
      })
    );
    await vi.waitFor(() => expect(input.value).toBe(''));
    api.dispose();
  });

  it('withdraws a partial amount and withdraws all with amount null', async () => {
    const { panelEl, deps, api } = setup();
    typeAmount(panelEl, 'spring', '5');
    button(panelEl, 'spring', 'withdraw').click();
    await vi.waitFor(() =>
      expect(deps.withdrawFarm).toHaveBeenCalledWith({
        token: 'spring',
        amount: 5,
      })
    );
    await vi.waitFor(() =>
      expect(button(panelEl, 'spring', 'withdraw-all').disabled).toBe(false)
    );
    button(panelEl, 'spring', 'withdraw-all').click();
    await vi.waitFor(() =>
      expect(deps.withdrawFarm).toHaveBeenLastCalledWith({
        token: 'spring',
        amount: null,
      })
    );
    api.dispose();
  });

  it('shows the backend message when an action fails', async () => {
    const error = Object.assign(new Error('Insufficient spring balance.'), {
      status: 400,
    });
    const { panelEl, deps, api } = setup({
      depositFarm: vi.fn(async () => {
        throw error;
      }),
    });
    typeAmount(panelEl, 'spring', '1');
    button(panelEl, 'spring', 'deposit').click();
    await vi.waitFor(() =>
      expect(deps.showToast).toHaveBeenCalledWith(
        'Deposit failed: Insufficient spring balance.',
        'error'
      )
    );
    // The typed amount is kept so the player can correct it.
    expect(panelEl.querySelector('input[data-token="spring"]').value).toBe('1');
    api.dispose();
  });

  it('marks the running action while it is submitted', async () => {
    let resolve;
    const { panelEl, api } = setup({
      withdrawFarm: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      ),
    });
    const withdrawAll = button(panelEl, 'spring', 'withdraw-all');
    withdrawAll.click();
    await vi.waitFor(() => expect(withdrawAll.textContent).toBe('Working...'));
    expect(button(panelEl, 'spring', 'deposit').disabled).toBe(true);
    resolve({});
    await vi.waitFor(() =>
      expect(withdrawAll.textContent).toBe('Withdraw all')
    );
    api.dispose();
  });

  it('toasts the reason instead of sending a blocked action', async () => {
    const { panelEl, deps, api } = setup();
    const withdraw = button(panelEl, 'spring', 'withdraw');
    // Force a click on a disabled-state action via dispatch on the element.
    withdraw.disabled = false;
    withdraw.click();
    await vi.waitFor(() =>
      expect(deps.showToast).toHaveBeenCalledWith(
        'Enter an amount greater than 0.',
        'info'
      )
    );
    expect(deps.withdrawFarm).not.toHaveBeenCalled();
    api.dispose();
  });

  it('reports a missing action handler', async () => {
    const { panelEl, deps, api } = setup({ depositFarm: null });
    typeAmount(panelEl, 'spring', '1');
    button(panelEl, 'spring', 'deposit').click();
    await vi.waitFor(() =>
      expect(deps.showToast).toHaveBeenCalledWith(
        'Farm action handler is unavailable.',
        'error'
      )
    );
    api.dispose();
  });

  it('ticks the countdown locally and re-bases it on a new payload', () => {
    vi.useFakeTimers();
    const ctx = setup();
    const next = () =>
      row(ctx.panelEl, 'spring').querySelectorAll('.farming-stat-value')[3]
        .textContent;
    expect(next()).toBe('1m 5s');
    ctx.advance(5000);
    vi.advanceTimersByTime(1000);
    expect(next()).toBe('1m');
    ctx.advance(120000);
    vi.advanceTimersByTime(1000);
    expect(next()).toBe('Due now');

    ctx.setState(
      buildState({
        ...ENABLED_FARMING,
        positions: {
          spring: {
            amount: 21,
            next_reward_in_seconds: 300,
            cycles_completed: 4,
          },
        },
      })
    );
    ctx.api.renderFarmingStatus();
    expect(next()).toBe('5m');
    ctx.api.dispose();
  });

  it('keeps the field the player is typing in', () => {
    const { panelEl, api } = setup();
    const input = typeAmount(panelEl, 'spring', '7');
    input.focus();
    input.value = '7.5';
    api.renderFarmingStatus();
    expect(input.value).toBe('7.5');
    api.dispose();
  });

  it('survives throwing dependencies', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const panelEl = document.createElement('div');
    const api = initFarmingPanel({
      getGameMeta: () => {
        throw new Error('boom');
      },
      getLastGameData: () => null,
      farmingPanelRef: panelEl,
    });
    expect(panelEl.textContent).toContain(FARMING_DISABLED_TEXT);
    api.dispose();
    errorSpy.mockRestore();
  });
});

describe('initFarmingPanel status pill only', () => {
  let statusEl;
  beforeEach(() => {
    statusEl = document.createElement('span');
  });

  it('renders the pill without a panel', () => {
    const api = initFarmingPanel({
      getLastGameData: () => buildState(),
      farmingStatusRef: statusEl,
    });
    expect(statusEl.textContent).toBe('Enabled (5% / 5m)');
    api.dispose();
  });
});

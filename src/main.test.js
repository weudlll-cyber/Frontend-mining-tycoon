import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-duration" value="300" />
      <input id="enrollment-window" value="60" />
      <input id="game-id" value="1" />
      <input id="player-id" value="1" />
      <button id="new-game-btn"></button>
      <button id="start-btn"></button>
      <button id="stop-btn"></button>
      <div id="conn-status"></div>
      <div id="game-status"></div>
      <div id="countdown"></div>
      <div id="countdown-label"></div>
      <div id="new-game-status"></div>
      <div id="meta-debug"></div>
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="upgrades"></div>
    </div>
  `;
}

let mainModule;

async function loadMainModule() {
  mainModule = await import('./main.js');
  return mainModule;
}

beforeEach(() => {
  vi.resetModules();
  buildDomFixture();
});

describe('Seasonal Oracle frontend helpers', () => {
  it('accepts contract version 2 and rejects unsupported versions', async () => {
    const module = await loadMainModule();

    expect(module.isContractVersionSupported(2)).toBe(true);
    expect(module.isContractVersionSupported(3)).toBe(false);
    expect(module.isContractVersionSupported(0)).toBe(false);
  });

  it('normalizes token names with safe fallback to defaults', async () => {
    const module = await loadMainModule();

    expect(module.normalizeTokenNames(['spring', 'winter'])).toEqual([
      'spring',
      'winter',
    ]);
    expect(module.normalizeTokenNames(['spring', 'bogus'])).toEqual(['spring']);
    expect(module.normalizeTokenNames(['bogus'])).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
    ]);
    expect(module.normalizeTokenNames(null)).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
    ]);
  });

  it('computes cross-token pay preview with fee and spread', async () => {
    const module = await loadMainModule();
    const preview = module.computePayCostPreview({
      baseCostTarget: 50,
      targetToken: 'summer',
      payToken: 'winter',
      oraclePrices: {
        summer: 1.2,
        winter: 0.8,
      },
      feeRate: 0.02,
      spreadRate: 0.01,
    });

    expect(preview.baseCost).toBe(50);
    expect(preview.payCost).toBe(78);
    expect(preview.ratio).toBeCloseTo(1.5, 8);
  });

  it('applies upgrade cost multiplier before FX preview conversion', async () => {
    const module = await loadMainModule();
    const preview = module.computePayCostPreview({
      baseCostTarget: 50,
      targetToken: 'summer',
      payToken: 'winter',
      oraclePrices: {
        summer: 1.2,
        winter: 0.8,
      },
      feeRate: 0.02,
      spreadRate: 0.01,
      upgradeCostMultiplier: 1.25,
    });

    expect(preview.baseCost).toBe(63);
    expect(preview.payCost).toBe(97);
    expect(preview.ratio).toBeCloseTo(1.5, 8);
  });

  it('returns null preview when oracle prices are missing', async () => {
    const module = await loadMainModule();

    expect(
      module.computePayCostPreview({
        baseCostTarget: 50,
        targetToken: 'summer',
        payToken: 'winter',
        oraclePrices: null,
        feeRate: 0.02,
        spreadRate: 0.01,
      })
    ).toBeNull();
  });

  it('ignores stale state next_halving and uses computed strict-future selection', async () => {
    const module = await loadMainModule();
    const result = module.resolveNextHalvingTarget({
      data: {
        current_sim_month: 8.9,
        next_halving: {
          token: 'winter',
          halving_at_unix: 1890000000,
        },
      },
      activeGameMeta: {
        sim_months_per_real_second: 1,
        season_cycles_per_game: 1,
      },
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(result).not.toBeNull();
    expect(result.token).toBe('summer');
  });

  it('derives next_halving absolute unix target when state field is missing', async () => {
    const module = await loadMainModule();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const result = module.resolveNextHalvingTarget({
      data: {
        current_sim_month: 8,
      },
      activeGameMeta: {
        sim_months_per_real_second: 1,
      },
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(result).not.toBeNull();
    expect(result.token).toBe('summer');
    expect(result.halvingAtUnix).toBeCloseTo(1_700_000_001, 6);
  });

  it('detects post-halving window per token from sim month', async () => {
    const module = await loadMainModule();

    expect(module.computeTokenHalvingCount('spring', 8.9999)).toBe(1);
    expect(module.computeTokenHalvingCount('summer', 8.9999)).toBe(0);
    expect(module.computeTokenHalvingCount('summer', 9.0001)).toBe(1);
    expect(module.computeTokenHalvingCount('autumn', 18.0001)).toBe(1);
  });

  it('returns zero halving count for invalid token or month', async () => {
    const module = await loadMainModule();

    expect(module.computeTokenHalvingCount('invalid', 10)).toBe(0);
    expect(module.computeTokenHalvingCount('spring', Number.NaN)).toBe(0);
  });

  it('shows halving indicator only inside narrow current halving window', async () => {
    const module = await loadMainModule();

    expect(module.shouldShowTokenHalvingIndicator('summer', 9.2)).toBe(true);
    expect(module.shouldShowTokenHalvingIndicator('summer', 10.1)).toBe(false);
  });

  it('after second token halves, first token no longer shows halving indicator', async () => {
    const module = await loadMainModule();

    // Around summer first halving window, spring's earlier halving indicator must be gone.
    expect(module.shouldShowTokenHalvingIndicator('summer', 9.2)).toBe(true);
    expect(module.shouldShowTokenHalvingIndicator('spring', 9.2)).toBe(false);
  });

  it('selects only the smallest strictly-future halving across tokens', async () => {
    const module = await loadMainModule();

    const hint = module.computeNextHalvingHint({
      currentSimMonth: 8.9,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(hint).not.toBeNull();
    expect(hint.token).toBe('summer');
    expect(hint.halvingMonth).toBe(9);
    expect(hint.deltaSeconds).toBeCloseTo(0.1, 6);
  });

  it('switches next halving from token A to token B after passing A boundary', async () => {
    const module = await loadMainModule();

    const before = module.computeNextHalvingHint({
      currentSimMonth: 8.9,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });
    const after = module.computeNextHalvingHint({
      currentSimMonth: 9.1,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(before.token).toBe('summer');
    expect(after.token).toBe('autumn');
    expect(after.halvingMonth).toBe(18);
  });

  it('does not reset countdown target for same token and halving month', async () => {
    const module = await loadMainModule();

    const prev = { token: 'summer', halvingMonth: 9, halvingAtUnix: 1000 };
    const next = { token: 'summer', halvingMonth: 9, halvingAtUnix: 2000 };

    expect(module.shouldResetNextHalvingCountdownTarget(prev, next)).toBe(
      false
    );
  });

  it('resets countdown target when token or halving month changes', async () => {
    const module = await loadMainModule();

    const prev = { token: 'summer', halvingMonth: 9, halvingAtUnix: 1000 };
    const nextTokenChanged = {
      token: 'autumn',
      halvingMonth: 18,
      halvingAtUnix: 2000,
    };
    const nextMonthChanged = {
      token: 'summer',
      halvingMonth: 45,
      halvingAtUnix: 3000,
    };

    expect(
      module.shouldResetNextHalvingCountdownTarget(prev, nextTokenChanged)
    ).toBe(true);
    expect(
      module.shouldResetNextHalvingCountdownTarget(prev, nextMonthChanged)
    ).toBe(true);
  });

  it('last halving notice appears right after boundary crossing', async () => {
    const module = await loadMainModule();

    const before = module.computeMostRecentPastHalving({
      currentSimMonth: 8.9,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
      simMonthsTotal: 36,
    });
    const after = module.computeMostRecentPastHalving({
      currentSimMonth: 9.1,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
      simMonthsTotal: 36,
    });

    const updateBefore = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: null,
      previousNotice: null,
      mostRecentPastHalving: before,
      nowUnix: 100,
    });
    const updateAfter = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: updateBefore.seenKey,
      previousNotice: updateBefore.notice,
      mostRecentPastHalving: after,
      nowUnix: 101,
    });

    expect(updateAfter.changed).toBe(true);
    expect(updateAfter.notice.token).toBe('summer');
    expect(updateAfter.notice.halvingMonth).toBe(9);
  });

  it('last halving notice reducer keeps notice stable during repeated refreshes', async () => {
    const module = await loadMainModule();

    const mostRecent = { token: 'summer', halvingMonth: 9 };
    const first = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: null,
      previousNotice: null,
      mostRecentPastHalving: mostRecent,
      nowUnix: 100,
    });

    const refresh1 = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: first.seenKey,
      previousNotice: first.notice,
      mostRecentPastHalving: mostRecent,
      nowUnix: 102,
    });
    const refresh2 = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: refresh1.seenKey,
      previousNotice: refresh1.notice,
      mostRecentPastHalving: mostRecent,
      nowUnix: 106,
    });

    expect(first.changed).toBe(true);
    expect(refresh1.changed).toBe(false);
    expect(refresh2.changed).toBe(false);
    expect(refresh1.notice).toBe(first.notice);
    expect(refresh2.notice).toBe(first.notice);
  });

  it('last halving notice timeout threshold is fixed and short-lived', async () => {
    const module = await loadMainModule();

    expect(module.LAST_HALVING_NOTICE_SECONDS).toBe(8);
  });
});

describe('Seasonal Oracle upgrade rendering', () => {
  it('renders token selectors and updates numeric preview when pay token changes', async () => {
    const module = await loadMainModule();
    const upgradesEl = document.getElementById('upgrades');

    module.renderUpgradeMetrics({
      game_id: 42,
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      oracle_prices: {
        spring: 1,
        summer: 1.2,
        autumn: 0.9,
        winter: 0.8,
      },
      player_state: {
        upgrade_levels: { hashrate: 0, efficiency: 0, cooling: 0 },
        upgrades_by_token: {
          spring: { hashrate: 0, efficiency: 0, cooling: 0 },
          summer: { hashrate: 0, efficiency: 0, cooling: 0 },
          autumn: { hashrate: 0, efficiency: 0, cooling: 0 },
          winter: { hashrate: 0, efficiency: 0, cooling: 0 },
        },
      },
      upgrade_metrics: {
        spring: {
          output_per_second: 10,
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              output_after: 11,
              breakeven_seconds: 50,
            },
            efficiency: {
              cost_to_next: 50,
              delta_output: 1,
              output_after: 11,
              breakeven_seconds: 50,
            },
            cooling: {
              cost_to_next: 50,
              delta_output: 1,
              output_after: 11,
              breakeven_seconds: 50,
            },
          },
        },
      },
    });

    expect(upgradesEl.querySelector('#upgrade-target-token')).not.toBeNull();
    expect(upgradesEl.querySelector('#upgrade-pay-token')).not.toBeNull();
    expect(upgradesEl.textContent).toContain('Cost: 50 SPRING (~50 SPRING)');

    const paySelect = upgradesEl.querySelector('#upgrade-pay-token');
    paySelect.value = 'winter';
    paySelect.dispatchEvent(new Event('change'));

    expect(document.getElementById('upgrades').textContent).toContain(
      'Cost: 50 SPRING (~65 WINTER)'
    );
  });

  it('keeps select DOM nodes stable across repeated upgrade refreshes', async () => {
    const module = await loadMainModule();
    const baseMeta = {
      api_contract_version: 2,
      meta_hash: 'stable-controls-test',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      upgrade_definitions: {
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 50 },
        cooling: { base_cost: 50 },
      },
      effective_upgrade_cost_multiplier: {
        spring: 1,
        summer: 1,
        autumn: 1,
        winter: 1,
      },
    };
    module.setActiveMeta(baseMeta);

    const firstState = {
      game_id: 42,
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      oracle_prices: {
        spring: 1,
        summer: 1.2,
        autumn: 0.9,
        winter: 0.8,
      },
      player_state: {
        upgrade_levels: { hashrate: 0, efficiency: 0, cooling: 0 },
        upgrades_by_token: {
          spring: { hashrate: 0, efficiency: 0, cooling: 0 },
          summer: { hashrate: 0, efficiency: 0, cooling: 0 },
          autumn: { hashrate: 0, efficiency: 0, cooling: 0 },
          winter: { hashrate: 0, efficiency: 0, cooling: 0 },
        },
      },
      upgrade_metrics: {
        spring: {
          output_per_second: 10,
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              output_after: 11,
              breakeven_seconds: 50,
            },
          },
        },
      },
    };

    const secondState = {
      ...firstState,
      upgrade_metrics: {
        spring: {
          output_per_second: 12,
          upgrades: {
            hashrate: {
              cost_to_next: 55,
              delta_output: 1.5,
              output_after: 13.5,
              breakeven_seconds: 40,
            },
          },
        },
      },
    };

    module.renderUpgradeMetrics(firstState);
    const targetSelectBefore = document.getElementById('upgrade-target-token');
    const paySelectBefore = document.getElementById('upgrade-pay-token');

    paySelectBefore.value = 'winter';
    paySelectBefore.dispatchEvent(new Event('change'));

    module.renderUpgradeMetrics(secondState);
    const targetSelectAfter = document.getElementById('upgrade-target-token');
    const paySelectAfter = document.getElementById('upgrade-pay-token');

    expect(targetSelectAfter).toBe(targetSelectBefore);
    expect(paySelectAfter).toBe(paySelectBefore);
    expect(paySelectAfter.value).toBe('winter');
    expect(document.getElementById('upgrades').textContent).toContain(
      'Cost: 55 SPRING (~71 WINTER)'
    );
  });

  it('disables upgrade actions and shows unsupported contract metadata for newer versions', async () => {
    const module = await loadMainModule();

    module.setActiveMeta({
      api_contract_version: 3,
      meta_hash: 'deadbeefcafebabe',
      upgrade_definitions: {
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 50 },
        cooling: { base_cost: 50 },
      },
    });

    module.renderUpgradeMetrics({
      game_id: 42,
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      oracle_prices: {
        spring: 1,
        summer: 1.2,
        autumn: 0.9,
        winter: 0.8,
      },
      player_state: {
        upgrade_levels: { hashrate: 0, efficiency: 0, cooling: 0 },
        upgrades_by_token: {
          spring: { hashrate: 0, efficiency: 0, cooling: 0 },
          summer: { hashrate: 0, efficiency: 0, cooling: 0 },
          autumn: { hashrate: 0, efficiency: 0, cooling: 0 },
          winter: { hashrate: 0, efficiency: 0, cooling: 0 },
        },
      },
      upgrade_metrics: {
        spring: {
          output_per_second: 10,
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              output_after: 11,
              breakeven_seconds: 50,
            },
          },
        },
      },
    });

    const upgradeButton = document.querySelector('.btn-upgrade');
    expect(upgradeButton).not.toBeNull();
    expect(upgradeButton.disabled).toBe(true);
    expect(upgradeButton.title).toContain('Unsupported API contract version');
    expect(document.getElementById('meta-debug').textContent).toContain(
      'contract v3'
    );
    expect(document.body.textContent).toContain(
      'Unsupported contract version v3. Upgrades are disabled.'
    );
  });
});

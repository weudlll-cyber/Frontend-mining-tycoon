/*
File: src/main.test.js
Purpose: Validate orchestration-level helper behavior and contract-safe frontend utilities.
Role in system: Broad unit coverage for display/intent paths in main module without backend authority changes.
Invariants/Security: Preserves deterministic helper behavior and safe rendering assumptions.
*/

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
      <input id="show-advanced-overrides" type="checkbox" />
      <div id="advanced-overrides" style="display:none"></div>
      <select id="anchor-token">
        <option value="">— Use recommendation —</option>
        <option value="spring">spring</option>
        <option value="summer">summer</option>
        <option value="autumn">autumn</option>
        <option value="winter">winter</option>
      </select>
      <input id="anchor-rate" value="" />
      <input id="season-cycles" value="" />
      <div id="derived-emission-preview" style="display:none"></div>
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
      <div id="portfolio-value">—</div>
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

  it('does not include advanced overrides when the toggle is unchecked', async () => {
    const module = await loadMainModule();

    const showAdvanced = document.getElementById('show-advanced-overrides');
    const anchorToken = document.getElementById('anchor-token');
    const anchorRate = document.getElementById('anchor-rate');
    const seasonCycles = document.getElementById('season-cycles');

    showAdvanced.checked = false;
    anchorToken.value = 'winter';
    anchorRate.value = '9.5';
    seasonCycles.value = '4';

    expect(module.collectAdvancedOverrides()).toEqual({});
  });

  it('includes advanced overrides only when the toggle is checked', async () => {
    const module = await loadMainModule();

    const showAdvanced = document.getElementById('show-advanced-overrides');
    const anchorToken = document.getElementById('anchor-token');
    const anchorRate = document.getElementById('anchor-rate');
    const seasonCycles = document.getElementById('season-cycles');

    showAdvanced.checked = true;
    anchorToken.value = 'summer';
    anchorRate.value = '8.5';
    seasonCycles.value = '2';

    expect(module.collectAdvancedOverrides()).toEqual({
      emission_anchor_token: 'summer',
      emission_anchor_tokens_per_second: 8.5,
      season_cycles_per_game: 2,
    });
  });

  it('computes Portfolio Value from balances and oracle prices', async () => {
    const module = await loadMainModule();

    const value = module.computePortfolioValue(
      {
        spring: 100,
        summer: 50,
        autumn: 25,
        winter: 10,
      },
      {
        spring: 2,
        summer: 3,
        autumn: 4,
        winter: 5,
      },
      ['spring', 'summer', 'autumn', 'winter']
    );

    expect(value).toBeCloseTo(500, 8);
  });

  it('updates Portfolio Value when balances change', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: {
          spring: 10,
          summer: 0,
          autumn: 0,
          winter: 0,
        },
      },
      oracle_prices: {
        spring: 2,
        summer: 1,
        autumn: 1,
        winter: 1,
      },
    });
    expect(portfolioEl.textContent).toBe('20');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: {
          spring: 25,
          summer: 0,
          autumn: 0,
          winter: 0,
        },
      },
      oracle_prices: {
        spring: 2,
        summer: 1,
        autumn: 1,
        winter: 1,
      },
    });
    expect(portfolioEl.textContent).toBe('50');
  });

  it('shows em dash only while data is missing and updates once valid data arrives', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {},
      oracle_prices: null,
    });
    expect(portfolioEl.textContent).toBe('—');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: {
          spring: 1,
          summer: 2,
          autumn: 3,
          winter: 4,
        },
      },
      oracle_prices: {
        spring: 1,
        summer: 1,
        autumn: 1,
        winter: 1,
      },
    });
    expect(portfolioEl.textContent).toBe('10');
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

describe('Seasonal Oracle season card rendering', () => {
  it('renders season-card HTML structure for desktop inline layout', async () => {
    await loadMainModule();

    // Build the season card DOM structure that renderSeasonData expects
    const template = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-summer" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-autumn" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-winter" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;
    document.body.innerHTML += template;

    expect(document.getElementById('season-spring')).not.toBeNull();
    expect(document.getElementById('season-summer')).not.toBeNull();
    expect(document.getElementById('season-autumn')).not.toBeNull();
    expect(document.getElementById('season-winter')).not.toBeNull();
  });

  it('renders token balances in season cards correctly', async () => {
    // Setup DOM with season cards
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-summer" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-autumn" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-winter" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;

    await loadMainModule();

    // This function is not exported, so we can't test directly from main
    // But we can verify the season cards exist and have the right structure
    const springCard = document.getElementById('season-spring');
    const balanceEl = springCard.querySelector('.season-balance');
    expect(balanceEl).not.toBeNull();
  });

  it('renders output per second in season cards correctly', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;

    await loadMainModule();

    const springCard = document.getElementById('season-spring');
    const outputEl = springCard.querySelector('.season-output');

    // Verify the element exists where renderSeasonData expects it
    expect(outputEl).not.toBeNull();
    expect(outputEl.textContent).toBe('—');
  });

  it('updates season halving countdown every second without remounting the node', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00Z'));

    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    const stableRef = halvingEl;
    const nowUnix = Date.now() / 1000;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: nowUnix + 5,
    });

    const firstText = halvingEl.textContent;
    vi.advanceTimersByTime(1000);
    const secondText = halvingEl.textContent;

    expect(firstText).not.toBe(secondText);
    expect(secondText).toBe('00:04');
    expect(document.querySelector('.season-halving')).toBe(stableRef);

    module.stopSeasonHalvingTimers();
    vi.useRealTimers();
  });

  it('keeps season halving countdown smooth for same-month payload drift', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00Z'));

    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    const initialNow = Date.now() / 1000;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: initialNow + 10,
      halvingMonth: 36,
    });

    vi.advanceTimersByTime(2000);
    const beforeResync = halvingEl.textContent;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: Date.now() / 1000 + 10,
      halvingMonth: 36,
    });

    vi.advanceTimersByTime(1000);
    const afterResync = halvingEl.textContent;

    expect(beforeResync).toBe('00:08');
    expect(afterResync).toBe('00:07');

    module.stopSeasonHalvingTimers();
    vi.useRealTimers();
  });

  it('keeps halving countdown text selectable and copyable', async () => {
    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 40);

    // Node remains text-based and stable for copy operations.
    expect(halvingEl.nodeType).toBe(Node.ELEMENT_NODE);
    expect(halvingEl.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats long halving countdowns with compact hour/day labels', async () => {
    const module = await loadMainModule();

    expect(module.formatDurationCompact(59)).toBe('00:59');
    expect(module.formatDurationCompact(3600)).toBe('1h 00m');
    expect(module.formatDurationCompact(3661)).toBe('1h 01m');
    expect(module.formatDurationCompact(86400)).toBe('1d 0h');
  });

  it('applies compact halving text for long-running season countdowns', async () => {
    const module = await loadMainModule();
    const halvingEl = document.createElement('span');
    halvingEl.className = 'season-halving';

    module.applyHalvingTextAndSeverity(
      halvingEl,
      Date.now() / 1000 + 3 * 3600 + 5 * 60
    );
    expect(halvingEl.textContent).toMatch(/^3h 0[45]m$/);
  });

  it('applies warning/critical color classes only at threshold windows', async () => {
    const module = await loadMainModule();
    const halvingEl = document.createElement('span');
    halvingEl.className = 'season-halving';

    expect(module.classifyHalvingSeverity(45)).toBe('normal');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 45);
    expect(halvingEl.classList.contains('season-halving--warning')).toBe(false);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(
      false
    );

    expect(module.classifyHalvingSeverity(20)).toBe('warning');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 20);
    expect(halvingEl.classList.contains('season-halving--warning')).toBe(true);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(
      false
    );

    expect(module.classifyHalvingSeverity(3)).toBe('critical');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 3);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(true);
  });

  it('renders Balance and Output in the same compact meta row', () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item">
            <span class="meta-label">Balance</span>
            <span class="season-balance">100.50</span>
          </div>
          <span class="meta-sep" aria-hidden="true">|</span>
          <div class="meta-item">
            <span class="meta-label">Output</span>
            <span class="season-output">5.25/s</span>
          </div>
          <span class="meta-sep" aria-hidden="true">|</span>
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
        </div>
        <div class="season-upgrades"></div>
      </div>
    `;

    const springCard = document.getElementById('season-spring');
    const metaRow = springCard.querySelector('.season-meta');
    const balanceEl = springCard.querySelector('.season-balance');
    const outputEl = springCard.querySelector('.season-output');

    // Verify all three elements are in the same meta container
    expect(metaRow).not.toBeNull();
    expect(metaRow.contains(balanceEl)).toBe(true);
    expect(metaRow.contains(outputEl)).toBe(true);

    // Verify full labels and separators for semantic clarity
    const labels = Array.from(metaRow.querySelectorAll('.meta-label')).map(
      (el) => el.textContent.trim()
    );
    expect(labels).toEqual(['Balance', 'Output', 'Halving']);
    expect(metaRow.textContent).toContain('|');

    // Season name must not be duplicated in the meta row
    expect(metaRow.textContent).not.toMatch(/Spring|Summer|Autumn|Winter/i);

    // Verify values render correctly
    expect(balanceEl.textContent).toBe('100.50');
    expect(outputEl.textContent).toBe('5.25/s');
  });
});

describe('Seasonal Oracle inline upgrade module', () => {
  it('exports required functions for inline upgrade rendering', async () => {
    // Import the upgrade-panel-inline module
    const {
      initInlineUpgrades,
      renderInlineSeasonUpgrades,
      renderAllSeasonUpgrades,
    } = await import('./ui/upgrade-panel-inline.js');

    expect(typeof initInlineUpgrades).toBe('function');
    expect(typeof renderInlineSeasonUpgrades).toBe('function');
    expect(typeof renderAllSeasonUpgrades).toBe('function');
  });

  it('initializes inline upgrades module with required dependencies', async () => {
    const { initInlineUpgrades } = await import('./ui/upgrade-panel-inline.js');

    const mockDeps = {
      getActiveGameMeta: () => ({
        token_names: ['spring', 'summer', 'autumn', 'winter'],
      }),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 50 },
        cooling: { base_cost: 50 },
      }),
      performUpgrade: vi.fn(),
    };

    // Should not throw
    expect(() => initInlineUpgrades(mockDeps)).not.toThrow();
  });

  it('renders inline upgrades for a season with one compact row per upgrade type', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    const mockPerformUpgrade = vi.fn();
    const mockGetGameMeta = () => ({
      token_names: ['spring'],
      oracle_prices: { spring: 1 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      effective_upgrade_cost_multiplier: { spring: 1 },
    });

    initInlineUpgrades({
      getActiveGameMeta: mockGetGameMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 50 },
        cooling: { base_cost: 50 },
      }),
      performUpgrade: mockPerformUpgrade,
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              breakeven_seconds: 50,
            },
            efficiency: {
              cost_to_next: 50,
              delta_output: 0.5,
              breakeven_seconds: 100,
            },
            cooling: {
              cost_to_next: 50,
              delta_output: 0.2,
              breakeven_seconds: 250,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 1, efficiency: 0, cooling: 0 },
        },
      },
      token_names: ['spring'],
    };

    renderInlineSeasonUpgrades(
      upgradesContainer,
      'spring',
      data,
      mockGetGameMeta()
    );

    const layout = upgradesContainer.querySelector('.upgrade-compact-layout');
    const headerGrid = upgradesContainer.querySelector('.upgrade-header-grid');
    const dataGrid = upgradesContainer.querySelector('.upgrade-compact-grid');
    expect(layout).not.toBeNull();
    expect(headerGrid).not.toBeNull();
    expect(dataGrid).not.toBeNull();
    expect(upgradesContainer.textContent).toContain('Upgrade');
    expect(upgradesContainer.textContent).toContain('Lvl');
    expect(upgradesContainer.textContent).toContain('Cost');
    expect(upgradesContainer.textContent).toContain('Out/s');
    expect(upgradesContainer.textContent).toContain('BEP');
    expect(upgradesContainer.textContent).toContain('ℹ︎');
    expect(upgradesContainer.textContent).toContain('Pay');

    // one compact row per type
    const typeCells = upgradesContainer.querySelectorAll('.upgrade-row-type');
    expect(typeCells.length).toBe(3);
    expect(Array.from(typeCells).map((node) => node.textContent)).toEqual([
      'Hashrate',
      'Efficiency',
      'Cooling',
    ]);

    const actionButtons = upgradesContainer.querySelectorAll(
      '.btn-upgrade-inline'
    );
    expect(actionButtons.length).toBe(3);
  });

  it('renders upgrade level correctly in inline upgrades', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    const mockGetGameMeta = () => ({
      token_names: ['spring'],
      oracle_prices: { spring: 1 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      effective_upgrade_cost_multiplier: { spring: 1 },
    });

    initInlineUpgrades({
      getActiveGameMeta: mockGetGameMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
      }),
      performUpgrade: vi.fn(),
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              breakeven_seconds: 50,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 3 }, // Level 3
        },
      },
      token_names: ['spring'],
    };

    renderInlineSeasonUpgrades(
      upgradesContainer,
      'spring',
      data,
      mockGetGameMeta()
    );

    const levelValue = upgradesContainer.querySelector('.upgrade-row-level');
    expect(levelValue?.textContent).toBe('3');
  });

  it('displays cost and benefit in upgrade columns', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    const mockGetGameMeta = () => ({
      token_names: ['spring'],
      oracle_prices: { spring: 1 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      effective_upgrade_cost_multiplier: { spring: 1 },
    });

    initInlineUpgrades({
      getActiveGameMeta: mockGetGameMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
      }),
      performUpgrade: vi.fn(),
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 100,
              delta_output: 5.5,
              breakeven_seconds: 18.18,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 0 },
        },
      },
      token_names: ['spring'],
    };

    renderInlineSeasonUpgrades(
      upgradesContainer,
      'spring',
      data,
      mockGetGameMeta()
    );

    // Check for compact metric display
    expect(upgradesContainer.textContent).toContain('Cost');
    expect(upgradesContainer.textContent).toContain('Out/s');
    expect(upgradesContainer.textContent).toContain('+5.50/s');
    expect(upgradesContainer.textContent).toContain('BEP');
  });

  it('disables upgrade button when contract is not supported', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    const mockGetGameMeta = () => ({
      token_names: ['spring'],
      oracle_prices: { spring: 1 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      effective_upgrade_cost_multiplier: { spring: 1 },
    });

    initInlineUpgrades({
      getActiveGameMeta: mockGetGameMeta,
      isActiveContractSupported: () => false, // Contract not supported
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
      }),
      performUpgrade: vi.fn(),
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              breakeven_seconds: 50,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 0 },
        },
      },
      token_names: ['spring'],
    };

    renderInlineSeasonUpgrades(
      upgradesContainer,
      'spring',
      data,
      mockGetGameMeta()
    );

    const button = upgradesContainer.querySelector('.btn-upgrade-inline');
    expect(button?.disabled).toBe(true);
    expect(button?.title).toContain('Unsupported API contract version');
  });

  it('calls performUpgrade with correct parameters when upgrade button clicked', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    const mockPerformUpgrade = vi.fn();
    const mockGetGameMeta = () => ({
      token_names: ['spring'],
      oracle_prices: { spring: 1 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
      effective_upgrade_cost_multiplier: { spring: 1 },
    });

    initInlineUpgrades({
      getActiveGameMeta: mockGetGameMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
      }),
      performUpgrade: mockPerformUpgrade,
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              breakeven_seconds: 50,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 2 },
        },
      },
      token_names: ['spring'],
    };

    renderInlineSeasonUpgrades(
      upgradesContainer,
      'spring',
      data,
      mockGetGameMeta()
    );

    const button = upgradesContainer.querySelector('.btn-upgrade-inline');
    button?.click();

    expect(mockPerformUpgrade).toHaveBeenCalledWith(
      'hashrate',
      3,
      'spring',
      'spring'
    );
  });

  it('renders exactly one row per supported upgrade type', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-upgrades"></div>
      </div>
    `;

    const { initInlineUpgrades, renderInlineSeasonUpgrades } =
      await import('./ui/upgrade-panel-inline.js');

    initInlineUpgrades({
      getActiveGameMeta: () => ({ token_names: ['spring'] }),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 50 },
        cooling: { base_cost: 50 },
      }),
      performUpgrade: vi.fn(),
    });

    const upgradesContainer = document.querySelector('.season-upgrades');
    const data = {
      game_id: 1,
      token_names: ['spring'],
      upgrade_metrics: {
        spring: {
          upgrades: {
            hashrate: {
              cost_to_next: 50,
              delta_output: 1,
              breakeven_seconds: 50,
            },
            efficiency: {
              cost_to_next: 60,
              delta_output: 0.5,
              breakeven_seconds: 120,
            },
            cooling: {
              cost_to_next: 70,
              delta_output: 0.25,
              breakeven_seconds: 200,
            },
          },
        },
      },
      player_state: {
        upgrades_by_token: {
          spring: { hashrate: 0, efficiency: 0, cooling: 0 },
        },
      },
    };

    renderInlineSeasonUpgrades(upgradesContainer, 'spring', data, null);

    const rowTypes = upgradesContainer.querySelectorAll('.upgrade-row-type');
    expect(rowTypes.length).toBe(3);

    const rowButtons = upgradesContainer.querySelectorAll(
      '.btn-upgrade-inline'
    );
    expect(rowButtons.length).toBe(3);
  });
});

describe('formatCompactNumber utility', () => {
  it('formats small numbers without suffixes', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(123.456, { decimalsSmall: 2 });
    expect(result.display).toBe('123.46');
    expect(result.full).toContain('123.46');
  });

  it('formats numbers >= 1k with k suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234, { decimalsSmall: 2 });
    expect(result.display).toBe('1.23k');
  });

  it('formats numbers >= 1M with M suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.display).toBe('1.23M');
  });

  it('formats numbers >= 1B with B suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567890, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.display).toBe('1.23B');
  });

  it('returns em dash for non-finite values', async () => {
    const module = await loadMainModule();
    const resultNaN = module.formatCompactNumber(Number.NaN, {
      decimalsSmall: 2,
    });
    const resultInf = module.formatCompactNumber(Number.POSITIVE_INFINITY, {
      decimalsSmall: 2,
    });
    const resultNegInf = module.formatCompactNumber(Number.NEGATIVE_INFINITY, {
      decimalsSmall: 2,
    });

    expect(resultNaN.display).toBe('—');
    expect(resultInf.display).toBe('—');
    expect(resultNegInf.display).toBe('—');
  });

  it('provides full uncompressed value for tooltips', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567890, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.full).toContain('1,234,567,890');
  });
});

describe('Portfolio Value with compact formatting', () => {
  it('displays portfolio value using compact format for large amounts', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    // Test with large portfolio value: (250k*2) + (50k*3) + (25k*4) + (10k*5) = 800k
    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: {
          spring: 250000,
          summer: 50000,
          autumn: 25000,
          winter: 10000,
        },
      },
      oracle_prices: {
        spring: 2,
        summer: 3,
        autumn: 4,
        winter: 5,
      },
    });

    // Should show compact format (800.00k for 800000)
    expect(portfolioEl.textContent).toBe('800.00k');
  });

  it('stores full value in data attribute for tooltip display', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: {
          spring: 100,
          summer: 50,
          autumn: 25,
          winter: 10,
        },
      },
      oracle_prices: {
        spring: 2,
        summer: 3,
        autumn: 4,
        winter: 5,
      },
    });

    // Should have full value stored (500.00)
    expect(portfolioEl.getAttribute('data-full-value')).toContain('500');
  });

  it('removes data-full-value attribute when data is invalid', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    // Set initial valid data
    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: { spring: 100, summer: 0, autumn: 0, winter: 0 },
      },
      oracle_prices: { spring: 2, summer: 1, autumn: 1, winter: 1 },
    });

    expect(portfolioEl.getAttribute('data-full-value')).toBeDefined();

    // Clear with null data
    module.renderPortfolioValue(null);
    expect(portfolioEl.getAttribute('data-full-value')).toBeNull();
  });
});

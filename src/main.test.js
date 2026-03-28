/**
File: src/main.test.js
Purpose: Validate orchestration-level helper behavior and contract-safe frontend utilities.
Role in system:
- Broad unit coverage for display and intent paths in main module without backend authority changes.
Invariants:
- Helper behavior remains deterministic for supported payload shapes.
Security notes:
- Assertions validate safe rendering assumptions and avoid HTML-injection behavior.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  getPlayerTokenStorageKey,
  getStorageItem,
} from './utils/storage-utils.js';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-duration" value="300" />
      <input id="enrollment-window" value="60" />
      <input id="game-id" value="1" />
      <select id="active-game-select">
        <option value="">No enrolling/running games</option>
      </select>
      <button id="refresh-active-games-btn" type="button"></button>
      <div id="active-game-status"></div>
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
  vi.unstubAllGlobals();
  buildDomFixture();
});

describe('stream start join behavior', () => {
  it('auto-joins and persists player context when player id is missing', async () => {
    const module = await loadMainModule();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ player_id: 42, player_token: 'token-42' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '',
    });

    expect(playerId).toBe('42');
    expect(document.getElementById('player-id').value).toBe('42');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/join');
    expect(getStorageItem(STORAGE_KEYS.gameId)).toBe('game-7');
    expect(getStorageItem(STORAGE_KEYS.playerId)).toBe('42');
    expect(getStorageItem(getPlayerTokenStorageKey('game-7', '42'))).toBe(
      'token-42'
    );
  });

  it('does not call join endpoint when player id is already present', async () => {
    const module = await loadMainModule();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ game_id: 'game-7', player_id: '77' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '77',
    });

    expect(playerId).toBe('77');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/state');
  });

  it('re-joins when existing player id does not belong to selected game', async () => {
    const module = await loadMainModule();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ player_id: 88, player_token: 'token-88' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '77',
    });

    expect(playerId).toBe('88');
    expect(document.getElementById('player-id').value).toBe('88');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/state');
    expect(fetchMock.mock.calls[1][0]).toContain('/games/game-7/join');
  });
});

describe('Seasonal Oracle frontend helpers', () => {
  it('accepts contract version 2 and rejects unsupported versions', async () => {
    const module = await loadMainModule();

    expect(module.isContractVersionSupported(2)).toBe(true);
    expect(module.isContractVersionSupported(3)).toBe(false);
    expect(module.isContractVersionSupported(0)).toBe(false);
  });

  it('formats active-game labels for enrolling and running states', async () => {
    const module = await loadMainModule();

    expect(
      module.formatActiveGameOptionLabel({
        game_id: 12,
        game_status: 'enrolling',
        enrollment_remaining_seconds: 9,
        players_count: 1,
      })
    ).toContain('starts in 00:09');

    expect(
      module.formatActiveGameOptionLabel({
        game_id: 21,
        game_status: 'running',
        run_remaining_seconds: 125,
        players_count: 3,
      })
    ).toContain('02:05 left');
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

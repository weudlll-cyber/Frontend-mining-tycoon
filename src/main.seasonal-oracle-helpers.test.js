// Tests helper functions used by the seasonal oracle main UI.
import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('Seasonal Oracle frontend helpers', () => {
  it('accepts contract version 2 and rejects unsupported versions', async () => {
    const module = await loadMainModule();

    expect(module.isContractVersionSupported(2)).toBe(true);
    expect(module.isContractVersionSupported(3)).toBe(false);
    expect(module.isContractVersionSupported(0)).toBe(false);
  });

  it('uses the lobby-selected game id without a player-side game picker', async () => {
    localStorage.clear();
    const module = await loadMainModule();

    document.getElementById('game-id').value = ' game-open ';
    expect(module.resolveRequestedGameId()).toBe('game-open');
    expect(document.getElementById('active-game-select')).toBeNull();
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

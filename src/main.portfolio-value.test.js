// Tests portfolio value display formatting and tooltip metadata.
import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('Portfolio Value with compact formatting', () => {
  it('displays portfolio value using compact format for large amounts', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

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

    expect(portfolioEl.getAttribute('data-full-value')).toContain('500');
  });

  it('removes data-full-value attribute when data is invalid', async () => {
    const module = await loadMainModule();
    const portfolioEl = document.getElementById('portfolio-value');

    module.renderPortfolioValue({
      game_id: 'g1',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        balances: { spring: 100, summer: 0, autumn: 0, winter: 0 },
      },
      oracle_prices: { spring: 2, summer: 1, autumn: 1, winter: 1 },
    });

    expect(portfolioEl.getAttribute('data-full-value')).toBeDefined();

    module.renderPortfolioValue(null);
    expect(portfolioEl.getAttribute('data-full-value')).toBeNull();
  });
});

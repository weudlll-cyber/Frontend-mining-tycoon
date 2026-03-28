import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

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

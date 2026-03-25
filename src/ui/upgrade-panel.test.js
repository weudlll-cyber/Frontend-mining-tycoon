/**
File: src/ui/upgrade-panel.test.js
Purpose: Verify the legacy upgrade panel keeps stable DOM nodes during live refreshes.
Role in system: Regression coverage for SSE-safe upgrade panel rendering and action wiring.
Invariants/Security: Confirms text-only updates, no destructive section rebuilds, and backend-authoritative actions.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initUpgradePanel,
  renderUpgradeMetrics,
  updateUpgradePanelDynamic,
} from './upgrade-panel.js';

function createActiveMeta() {
  return {
    token_names: ['spring', 'summer', 'autumn', 'winter'],
    conversion_fee_rate: 0.02,
    oracle_spread: 0.01,
    oracle_prices: {
      spring: 1,
      summer: 1.2,
      autumn: 0.9,
      winter: 0.8,
    },
    effective_upgrade_cost_multiplier: {
      spring: 1,
      summer: 1,
      autumn: 1,
      winter: 1,
    },
  };
}

function createUpgradeState({
  outputPerSecond = 10,
  level = 0,
  costToNext = 50,
  deltaOutput = 1,
  outputAfter = 11,
  breakevenSeconds = 50,
} = {}) {
  return {
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
      upgrade_levels: { hashrate: level, efficiency: 0, cooling: 0 },
      upgrades_by_token: {
        spring: { hashrate: level, efficiency: 0, cooling: 0 },
        summer: { hashrate: 0, efficiency: 0, cooling: 0 },
        autumn: { hashrate: 0, efficiency: 0, cooling: 0 },
        winter: { hashrate: 0, efficiency: 0, cooling: 0 },
      },
    },
    upgrade_metrics: {
      spring: {
        output_per_second: outputPerSecond,
        upgrades: {
          hashrate: {
            cost_to_next: costToNext,
            delta_output: deltaOutput,
            output_after: outputAfter,
            breakeven_seconds: breakevenSeconds,
          },
        },
      },
    },
  };
}

describe('upgrade panel rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="upgrades"></section>';
  });

  it('reuses select options, section nodes, and buttons across repeated refreshes', () => {
    const performUpgrade = vi.fn();
    const activeMeta = createActiveMeta();
    const definitions = {
      hashrate: { base_cost: 50 },
      efficiency: { base_cost: 50 },
      cooling: { base_cost: 50 },
    };

    initUpgradePanel({
      upgradesEl: document.getElementById('upgrades'),
      getActiveGameMeta: () => activeMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => definitions,
      performUpgrade,
    });

    renderUpgradeMetrics(createUpgradeState(), () => activeMeta);

    const targetSelectBefore = document.getElementById('upgrade-target-token');
    const paySelectBefore = document.getElementById('upgrade-pay-token');
    const targetOptionBefore = targetSelectBefore.options[0];
    const payOptionBefore = paySelectBefore.options[3];
    const sectionBefore = document.querySelector('.upgrade-section');
    const levelBefore = sectionBefore.querySelector('.upgrade-level');
    const buttonBefore = sectionBefore.querySelector('.btn-upgrade');

    paySelectBefore.value = 'winter';
    paySelectBefore.dispatchEvent(new Event('change'));

    renderUpgradeMetrics(
      createUpgradeState({
        outputPerSecond: 12,
        level: 1,
        costToNext: 55,
        deltaOutput: 1.5,
        outputAfter: 13.5,
        breakevenSeconds: 40,
      }),
      () => activeMeta
    );

    const targetSelectAfter = document.getElementById('upgrade-target-token');
    const paySelectAfter = document.getElementById('upgrade-pay-token');
    const sectionAfter = document.querySelector('.upgrade-section');
    const levelAfter = sectionAfter.querySelector('.upgrade-level');
    const buttonAfter = sectionAfter.querySelector('.btn-upgrade');

    expect(targetSelectAfter).toBe(targetSelectBefore);
    expect(paySelectAfter).toBe(paySelectBefore);
    expect(targetSelectAfter.options[0]).toBe(targetOptionBefore);
    expect(paySelectAfter.options[3]).toBe(payOptionBefore);
    expect(paySelectAfter.value).toBe('winter');
    expect(sectionAfter).toBe(sectionBefore);
    expect(levelAfter).toBe(levelBefore);
    expect(buttonAfter).toBe(buttonBefore);
    expect(sectionAfter.textContent).toContain('Level 1');
    expect(sectionAfter.textContent).toContain('Cost: 55 SPRING (~71 WINTER)');
    expect(buttonAfter.textContent).toBe('Upgrade -> Level 2');

    buttonAfter.click();
    expect(performUpgrade).toHaveBeenCalledWith('hashrate', 2);
  });

  it('revives an existing section when definitions return after a hidden render', () => {
    const activeMeta = createActiveMeta();
    let definitions = {
      hashrate: { base_cost: 50 },
    };

    initUpgradePanel({
      upgradesEl: document.getElementById('upgrades'),
      getActiveGameMeta: () => activeMeta,
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => definitions,
      performUpgrade: vi.fn(),
    });

    updateUpgradePanelDynamic(createUpgradeState(), activeMeta);
    const sectionBefore = document.querySelector('.upgrade-section');

    definitions = {};
    updateUpgradePanelDynamic(
      {
        ...createUpgradeState(),
        upgrade_metrics: {
          spring: {
            output_per_second: 9,
            upgrades: {},
          },
        },
      },
      activeMeta
    );

    expect(sectionBefore.style.display).toBe('none');
    expect(document.getElementById('upgrades').textContent).toContain(
      'No upgrade data available'
    );

    definitions = {
      hashrate: { base_cost: 50 },
    };
    updateUpgradePanelDynamic(
      createUpgradeState({
        outputPerSecond: 14,
        level: 2,
        costToNext: 70,
        deltaOutput: 2.5,
        outputAfter: 16.5,
        breakevenSeconds: 28,
      }),
      activeMeta
    );

    const sectionAfter = document.querySelector('.upgrade-section');
    expect(sectionAfter).toBe(sectionBefore);
    expect(sectionAfter.style.display).toBe('');
    expect(sectionAfter.textContent).toContain('Level 2');
    expect(sectionAfter.textContent).toContain('70');
  });
});

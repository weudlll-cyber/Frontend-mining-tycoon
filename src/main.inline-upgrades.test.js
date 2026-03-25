/**
File: src/main.inline-upgrades.test.js
Purpose: Inline-upgrade rendering tests split out of main.test.js.
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
      <select id="anchor-token"></select>
      <input id="anchor-rate" value="" />
      <input id="season-cycles" value="" />
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

beforeEach(() => {
  vi.resetModules();
  buildDomFixture();
});

describe('Seasonal Oracle inline upgrade module', () => {
  it('exports required functions for inline upgrade rendering', async () => {
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
          spring: { hashrate: 3 },
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
      isActiveContractSupported: () => false,
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

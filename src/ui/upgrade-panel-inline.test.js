/*
File: src/ui/upgrade-panel-inline.test.js
Purpose: Verify inline upgrade lanes keep stable nodes and support per-lane pay-token previews.
Role in system: Coverage for display-only cross-token preview behavior and upgrade intent payload wiring.
Invariants/Security: Ensures backend-authoritative submit intent while using safe inline DOM updates.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initInlineUpgrades,
  renderInlineSeasonUpgrades,
} from './upgrade-panel-inline.js';

function createMeta() {
  return {
    token_names: ['spring', 'summer', 'autumn', 'winter'],
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
    conversion_fee_rate: 0.02,
    oracle_spread: 0.01,
  };
}

function createData(costToNext = 50) {
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
      upgrades_by_token: {
        spring: { hashrate: 0, efficiency: 0, cooling: 0 },
      },
    },
    upgrade_metrics: {
      spring: {
        upgrades: {
          hashrate: {
            cost_to_next: costToNext,
            delta_output: 1,
            breakeven_seconds: 50,
          },
          efficiency: {
            cost_to_next: 60,
            delta_output: 1.2,
            breakeven_seconds: 45,
          },
          cooling: {
            cost_to_next: 70,
            delta_output: 1.4,
            breakeven_seconds: 40,
          },
        },
      },
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="tooltip-layer" class="tooltip-layer"></div>
    <div class="season-upgrades"></div>
  `;
});

describe('inline upgrade lanes pay token', () => {
  it('persists pay token selection and keeps row nodes stable across SSE refreshes', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const hashrateRowBefore = container.querySelector(
      '.upgrade-lane-row[data-upgrade-type="hashrate"]'
    );
    const paySelectBefore = hashrateRowBefore.querySelector(
      '.upgrade-pay-select'
    );
    const actionButtonBefore = hashrateRowBefore.querySelector(
      '.btn-upgrade-inline'
    );

    const payLabels = Array.from(paySelectBefore.options).map(
      (opt) => opt.textContent
    );
    expect(payLabels).toEqual(['SPR', 'SUM', 'AUT', 'WIN']);

    paySelectBefore.value = 'winter';
    paySelectBefore.dispatchEvent(new Event('change'));

    renderInlineSeasonUpgrades(container, 'spring', createData(55));

    const hashrateRowAfter = container.querySelector(
      '.upgrade-lane-row[data-upgrade-type="hashrate"]'
    );
    const paySelectAfter = hashrateRowAfter.querySelector(
      '.upgrade-pay-select'
    );
    const actionButtonAfter = hashrateRowAfter.querySelector(
      '.btn-upgrade-inline'
    );

    expect(hashrateRowAfter).toBe(hashrateRowBefore);
    expect(paySelectAfter).toBe(paySelectBefore);
    expect(actionButtonAfter).toBe(actionButtonBefore);
    expect(paySelectAfter.value).toBe('winter');

    actionButtonAfter.click();
    expect(performUpgrade).toHaveBeenCalledWith(
      'hashrate',
      1,
      'spring',
      'winter'
    );
  });

  it('passes same-token pay selection explicitly for non-spring lanes', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    const summerData = createData(50);
    summerData.player_state.upgrades_by_token.summer = {
      hashrate: 0,
      efficiency: 0,
      cooling: 0,
    };
    summerData.upgrade_metrics.summer = {
      upgrades: {
        hashrate: {
          cost_to_next: 50,
          delta_output: 1,
          breakeven_seconds: 50,
        },
        efficiency: {
          cost_to_next: 60,
          delta_output: 1.2,
          breakeven_seconds: 45,
        },
        cooling: {
          cost_to_next: 70,
          delta_output: 1.4,
          breakeven_seconds: 40,
        },
      },
    };

    renderInlineSeasonUpgrades(container, 'summer', summerData);

    const hashrateRow = container.querySelector(
      '.upgrade-lane-row[data-upgrade-type="hashrate"]'
    );
    const paySelect = hashrateRow?.querySelector('.upgrade-pay-select');
    const actionButton = hashrateRow?.querySelector('.btn-upgrade-inline');

    expect(paySelect?.value).toBe('summer');
    actionButton?.click();

    expect(performUpgrade).toHaveBeenCalledWith(
      'hashrate',
      1,
      'summer',
      'summer'
    );
  });
});

describe('inline upgrade header tooltip', () => {
  it('renders info trigger at end of header and tooltip uses shared micro-tooltip', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const headerTrigger = container.querySelector(
      '.upgrade-header-info-trigger'
    );
    expect(headerTrigger).not.toBeNull();
    expect(headerTrigger.textContent).toBe('ℹ︎');

    const bubbleId = headerTrigger?.getAttribute('aria-describedby');
    const bubble = bubbleId ? document.getElementById(bubbleId) : null;
    expect(bubble).not.toBeNull();
    expect(bubble?.className).toContain('ps-tip-bubble');
    expect(bubble?.textContent).toContain('Lvl:');
  });

  it('upgrade header tooltip is stable and persists across SSE ticks', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const headerTriggerBefore = container.querySelector(
      '.upgrade-header-info-trigger'
    );
    const bubbleIdBefore =
      headerTriggerBefore?.getAttribute('aria-describedby');
    const bubbleBefore =
      bubbleIdBefore && document.getElementById(bubbleIdBefore);

    renderInlineSeasonUpgrades(container, 'spring', createData(55));
    renderInlineSeasonUpgrades(container, 'spring', createData(60));

    const headerTriggerAfter = container.querySelector(
      '.upgrade-header-info-trigger'
    );
    const bubbleIdAfter = headerTriggerAfter?.getAttribute('aria-describedby');
    const bubbleAfter = bubbleIdAfter && document.getElementById(bubbleIdAfter);

    expect(headerTriggerAfter).toBe(headerTriggerBefore);
    expect(bubbleAfter).toBe(bubbleBefore);
  });
});

describe('inline upgrade lane layout', () => {
  it('renders exactly 3 lane rows each as a direct child of the lane list', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const laneList = container.querySelector('.upgrade-lane-list');
    const laneRows = container.querySelectorAll('.upgrade-lane-row');

    expect(laneRows.length).toBe(3);
    laneRows.forEach((row) => {
      expect(row.parentNode).toBe(laneList);
    });
  });

  it('lane rows remain separate and stacked after multiple SSE ticks', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const rowBefore = container.querySelector(
      '.upgrade-lane-row[data-upgrade-type="hashrate"]'
    );

    // Second and third SSE ticks
    renderInlineSeasonUpgrades(container, 'spring', createData(55));
    renderInlineSeasonUpgrades(container, 'spring', createData(60));

    const laneRows = container.querySelectorAll('.upgrade-lane-row');
    const laneList = container.querySelector('.upgrade-lane-list');

    expect(laneRows.length).toBe(3);
    // No collapse: each row is still a direct child of the list
    laneRows.forEach((row) => {
      expect(row.parentNode).toBe(laneList);
    });
    // Stable nodes: hashrate row is same element
    expect(
      container.querySelector('.upgrade-lane-row[data-upgrade-type="hashrate"]')
    ).toBe(rowBefore);
  });
});

describe('inline upgrade grid alignment', () => {
  it('header and lane rows share the same parent container for column alignment', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const header = container.querySelector('.upgrade-lane-header');
    const laneList = container.querySelector('.upgrade-lane-list');
    const rows = container.querySelectorAll('.upgrade-lane-row');

    // Header and lane-list are siblings inside the same upgrade-table container
    expect(header).not.toBeNull();
    expect(laneList).not.toBeNull();
    expect(header.parentNode).toBe(laneList.parentNode);

    // Rows are children of the lane-list
    rows.forEach((row) => {
      expect(row.parentNode).toBe(laneList);
    });
  });

  it('action column header has no column title text and upgrade buttons have aria-label', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    renderInlineSeasonUpgrades(container, 'spring', createData(50));

    const headerCells = Array.from(
      container.querySelectorAll('.upgrade-lane-header .upgrade-header-cell')
    );
    // First 6 cells carry the column labels
    const dataLabels = headerCells.slice(0, 6).map((c) => c.textContent.trim());
    expect(dataLabels).toEqual([
      'Upgrade',
      'Lvl',
      'Cost',
      'Pay',
      'Out/s',
      'BEP',
    ]);

    // Last header cell is the info trigger (no column label text, just \u24d8)
    const lastHeaderCell = headerCells[headerCells.length - 1];
    expect(
      lastHeaderCell.querySelector('.upgrade-header-info-trigger')
    ).not.toBeNull();

    // Every upgrade button must have an accessible aria-label
    const actionButtons = container.querySelectorAll('.btn-upgrade-inline');
    expect(actionButtons.length).toBe(3);
    actionButtons.forEach((btn) => {
      const ariaLabel = btn.getAttribute('aria-label');
      expect(ariaLabel).not.toBeNull();
      expect(ariaLabel).toMatch(/upgrade/i);
    });
  });

  it('renders large level and cost values in compact form with exact value on hover', () => {
    const performUpgrade = vi.fn();

    initInlineUpgrades({
      getActiveGameMeta: () => createMeta(),
      isActiveContractSupported: () => true,
      getActiveUpgradeDefinitions: () => ({
        hashrate: { base_cost: 50 },
        efficiency: { base_cost: 60 },
        cooling: { base_cost: 70 },
      }),
      performUpgrade,
    });

    const container = document.querySelector('.season-upgrades');
    const data = createData(12500);
    data.player_state.upgrades_by_token.spring.hashrate = 12345;
    renderInlineSeasonUpgrades(container, 'spring', data);

    const row = container.querySelector(
      '.upgrade-lane-row[data-upgrade-type="hashrate"]'
    );
    const levelCell = row?.querySelector('.upgrade-row-level');
    const costCell = row?.querySelector('.upgrade-row-cost');

    expect(levelCell?.textContent).toContain('k');
    expect(costCell?.textContent).toContain('k');
    expect(levelCell?.getAttribute('title')).toContain('12,345');
    expect(costCell?.getAttribute('title')).toContain('12,500');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  initPlayerView,
  renderPlayerState,
  resetPlayerStateView,
} from './player-view.js';

function buildFixture() {
  document.body.innerHTML = `
    <div id="tooltip-layer" class="tooltip-layer"></div>
    <div id="player-state"></div>
  `;
}

function getMeta() {
  return {
    token_names: ['spring', 'summer', 'autumn', 'winter'],
    oracle_prices: {
      spring: 1.2345,
      summer: 2.3456,
      autumn: 3.4567,
      winter: 4.5678,
    },
    sim_months_per_real_second: 1,
    season_cycles_per_game: 1,
  };
}

beforeEach(() => {
  buildFixture();
  initPlayerView({
    playerStateEl: document.getElementById('player-state'),
    getActiveGameMeta: () => getMeta(),
  });
  resetPlayerStateView();
});

describe('player state matrix', () => {
  it('renders matrix headers SPR/SUM/AUT/WIN/Σ', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const heads = Array.from(document.querySelectorAll('.ps-head-token')).map(
      (el) => el.textContent.trim()
    );

    expect(heads).toEqual(['SPR', 'SUM', 'AUT', 'WIN', 'Σ']);
  });

  it('renders Out/s, Bal, Price rows with values', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 99.1234,
        balances: {
          spring: 11.11,
          summer: 22.22,
          autumn: 33.33,
          winter: 44.44,
        },
      },
      output_rate_per_token: {
        spring: 1.11,
        summer: 2.22,
        autumn: 3.33,
        winter: 4.44,
      },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const labels = Array.from(document.querySelectorAll('.ps-row-label')).map(
      (el) => el.dataset.row
    );
    expect(labels).toContain('output');
    expect(labels).toContain('balance');
    expect(labels).toContain('price');

    expect(
      document
        .querySelector('.ps-cell[data-row="output"][data-token="spring"]')
        .textContent.trim()
    ).toBe('1.11');
    expect(
      document
        .querySelector('.ps-cell[data-row="balance"][data-token="winter"]')
        .textContent.trim()
    ).toBe('44.44');
    expect(
      document
        .querySelector('.ps-cell[data-row="price"][data-token="autumn"]')
        .textContent.trim()
    ).toBe('3.46');
  });

  it('renders icon column for each matrix row', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const icons = Array.from(document.querySelectorAll('.ps-icon-cell'));
    expect(icons.length).toBeGreaterThanOrEqual(3); // output, balance, price + footer

    const iconRows = icons.map((icon) => icon.dataset.row);
    expect(iconRows).toContain('output');
    expect(iconRows).toContain('balance');
    expect(iconRows).toContain('price');
  });

  it('renders footer with Next H, Mined, and fee/spread on one line', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 123.45,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.0234,
      oracle_spread: 0.0123,
    });

    const footer = document.querySelector('.ps-footer');
    expect(footer).not.toBeNull();

    // Check for single-line footer content
    const footerContent = footer.querySelector('.ps-footer-content');
    expect(footerContent).not.toBeNull();

    const footerText = footerContent.textContent;
    expect(footerText).toContain('No further halvings');
    expect(footerText).toContain('Mined 123.45');
    expect(footerText).toMatch(/fee 0\.0(23|24)|0\.02/);
    expect(footerText).toMatch(/spread 0\.0(12|13)|0\.01/);
  });

  it('renders tooltip triggers with aria-describedby and tooltip role', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const triggers = Array.from(document.querySelectorAll('.ps-tip-trigger'));
    expect(triggers.length).toBeGreaterThanOrEqual(4); // output, balance, price, footer

    triggers.forEach((trigger) => {
      const describedBy = trigger.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const tooltip = document.getElementById(describedBy);
      expect(tooltip).not.toBeNull();
      expect(tooltip.getAttribute('role')).toBe('tooltip');
    });
  });

  it('renders tooltips in tooltip-layer, not in clipping container', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'idle',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const tooltipLayer = document.getElementById('tooltip-layer');
    const tooltips = Array.from(document.querySelectorAll('.ps-tip-bubble'));

    tooltips.forEach((tooltip) => {
      expect(tooltipLayer.contains(tooltip)).toBe(true);
    });
  });

  it('does not have overflow:hidden on analytics panel container', () => {
    const playerStateEl = document.getElementById('player-state');
    const style = window.getComputedStyle(playerStateEl);
    expect(style.overflow).not.toBe('hidden');
  });

  it('renders Price row with oracle prices for all tokens', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'running',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    // Verify Price row exists
    const priceRow = Array.from(document.querySelectorAll('.ps-cell')).find(
      (el) => el.dataset.row === 'price' && el.dataset.token === 'spring'
    );
    expect(priceRow).toBeDefined();

    // Verify prices are displayed (from getMeta oracle_prices)
    const springPrice = document.querySelector(
      '.ps-cell[data-row="price"][data-token="spring"]'
    );
    const winterPrice = document.querySelector(
      '.ps-cell[data-row="price"][data-token="winter"]'
    );

    expect(springPrice?.textContent).not.toBe('-');
    expect(winterPrice?.textContent).not.toBe('-');
  });

  it('renders numeric cells with compact format for large values', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'running',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        // Use large balance values
        balances: {
          spring: 1250000,
          summer: 2000000,
          autumn: 3500000,
          winter: 4750000,
        },
      },
      output_rate_per_token: {
        spring: 100000,
        summer: 200000,
        autumn: 300000,
        winter: 400000,
      },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const springBalance = document.querySelector(
      '.ps-cell[data-row="balance"][data-token="spring"]'
    );
    const springOutput = document.querySelector(
      '.ps-cell[data-row="output"][data-token="spring"]'
    );

    // Should show compact format (e.g., 1.25M, 100.00k)
    expect(springBalance?.textContent).toContain('M');
    expect(springOutput?.textContent).toContain('k');
  });

  it('stores full value in data-full-value for tooltip extraction', () => {
    renderPlayerState({
      game_id: 'g1',
      game_status: 'running',
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      player_state: {
        cumulative_mined: 10,
        balances: { spring: 1250000, summer: 2, autumn: 3, winter: 4 },
      },
      output_rate_per_token: { spring: 1, summer: 2, autumn: 3, winter: 4 },
      conversion_fee_rate: 0.02,
      oracle_spread: 0.01,
    });

    const springBalance = document.querySelector(
      '.ps-cell[data-row="balance"][data-token="spring"]'
    );
    const fullValue = springBalance?.getAttribute('data-full-value');

    // Full value should be present for tooltip
    expect(fullValue).toBeDefined();
    expect(fullValue).toContain('1,250,000');
  });
});

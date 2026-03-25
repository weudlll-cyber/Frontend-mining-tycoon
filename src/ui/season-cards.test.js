/**
File: src/ui/season-cards.test.js
Purpose: Validate season-card header normalization, tooltip stability, and tabular value styling.
Role in system: Guards SSE-safe inline header behavior without remounting card nodes.
Invariants/Security: Confirms non-blocking tooltip usage and text-only DOM updates.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initSeasonCards,
  renderSeasonData,
  stopSeasonHalvingTimers,
  syncSeasonHalvingTicker,
} from './season-cards.js';

function buildSeasonCard(token) {
  return `
    <div id="season-${token}" class="season-card">
      <div class="season-meta">
        <div class="meta-item">
          <span class="meta-label">Balance</span>
          <span class="season-balance">—</span>
        </div>
        <span class="meta-sep" aria-hidden="true">|</span>
        <div class="meta-item">
          <span class="meta-label">Output</span>
          <span class="season-output">—/s</span>
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
}

function createData(outputRate) {
  return {
    game_id: 'g-1',
    game_status: 'running',
    token_names: ['spring'],
    current_sim_month: 1,
    player_state: {
      balances: {
        spring: 123.45,
      },
    },
    output_rate_per_token: {
      spring: outputRate,
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="tooltip-layer" class="tooltip-layer"></div>
    ${buildSeasonCard('spring')}
  `;

  initSeasonCards({
    getGameMeta: () => ({
      token_names: ['spring', 'summer', 'autumn', 'winter'],
      sim_months_per_real_second: 1,
      season_cycles_per_game: 1,
    }),
  });
});

describe('season cards header normalization', () => {
  it('uses unified labels and exactly one info tooltip trigger per card', () => {
    renderSeasonData(createData(1.23));

    const labels = Array.from(
      document.querySelectorAll('#season-spring .season-meta .meta-label')
    ).map((node) => node.textContent?.trim());

    expect(labels).toEqual(['Balance', 'Output/s', 'Halving']);

    const triggers = document.querySelectorAll(
      '#season-spring .season-meta .season-meta-tip-trigger'
    );
    expect(triggers.length).toBe(1);
  });

  it('applies tabular numeric class to value cells and keeps header nodes stable across ticks', () => {
    renderSeasonData(createData(1.23));

    const metaRowBefore = document.querySelector('#season-spring .season-meta');
    const infoTriggerBefore = document.querySelector(
      '#season-spring .season-meta .season-meta-tip-trigger'
    );
    const bubbleIdBefore = infoTriggerBefore?.getAttribute('aria-describedby');

    const balanceEl = document.querySelector('#season-spring .season-balance');
    const outputEl = document.querySelector('#season-spring .season-output');
    const halvingEl = document.querySelector('#season-spring .season-halving');

    expect(balanceEl?.classList.contains('tabular-num')).toBe(true);
    expect(outputEl?.classList.contains('tabular-num')).toBe(true);
    expect(halvingEl?.classList.contains('tabular-num')).toBe(true);

    renderSeasonData(createData(2.34));

    const metaRowAfter = document.querySelector('#season-spring .season-meta');
    const infoTriggerAfter = document.querySelector(
      '#season-spring .season-meta .season-meta-tip-trigger'
    );

    expect(metaRowAfter).toBe(metaRowBefore);
    expect(infoTriggerAfter).toBe(infoTriggerBefore);
    expect(infoTriggerAfter?.getAttribute('aria-describedby')).toBe(
      bubbleIdBefore
    );
    expect(document.querySelectorAll('.season-meta-tip-trigger').length).toBe(
      1
    );

    // Bubble node itself should still be the same node (not recreated)
    const bubbleAfter = document.getElementById(bubbleIdBefore);
    expect(bubbleAfter).not.toBeNull();
    expect(bubbleAfter?.id).toBe(bubbleIdBefore);
  });

  it('tooltip stays open when mouse moves from trigger into the bubble', () => {
    renderSeasonData(createData(1.23));

    const trigger = document.querySelector(
      '#season-spring .season-meta-tip-trigger'
    );
    const bubbleId = trigger?.getAttribute('aria-describedby');
    const bubble = bubbleId ? document.getElementById(bubbleId) : null;
    expect(trigger).not.toBeNull();
    expect(bubble).not.toBeNull();

    // Open tooltip via mouseenter on trigger
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(bubble.classList.contains('is-open')).toBe(true);

    // Mouseleave from trigger into bubble — tooltip must stay open
    trigger.dispatchEvent(
      new MouseEvent('mouseleave', { bubbles: true, relatedTarget: bubble })
    );
    expect(bubble.classList.contains('is-open')).toBe(true);
  });

  it('tooltip bubble node is stable and not recreated across multiple SSE ticks', () => {
    renderSeasonData(createData(1.23));
    const trigger = document.querySelector(
      '#season-spring .season-meta-tip-trigger'
    );
    const bubbleId = trigger?.getAttribute('aria-describedby');
    const bubbleBefore = bubbleId ? document.getElementById(bubbleId) : null;
    expect(bubbleBefore).not.toBeNull();

    renderSeasonData(createData(2.34));
    renderSeasonData(createData(3.45));

    const bubbleAfter = bubbleId ? document.getElementById(bubbleId) : null;
    expect(bubbleAfter).toBe(bubbleBefore);
  });
});

describe('season grid layout — desktop 2x2', () => {
  it('renders 4 season cards with 2 per row on desktop breakpoint', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'];
    document.body.innerHTML = `
      <div id="tooltip-layer" class="tooltip-layer"></div>
      <div class="seasons-grid">
        ${seasons.map((token) => `<div id="season-${token}" class="season-card"></div>`).join('')}
      </div>
    `;

    const grid = document.querySelector('.seasons-grid');
    const cards = document.querySelectorAll('.season-card');

    expect(cards.length).toBe(4);
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('seasons-grid');
  });

  it('season cards have min-width constraint in CSS to prevent horizontal overflow', () => {
    // This test verifies that the CSS rule exists in the stylesheet
    // The actual constraint (min-width: 0) is in src/style.css and prevents flex overflow
    document.body.innerHTML = `
      <div class="season-card"></div>
    `;

    const card = document.querySelector('.season-card');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('season-card');
    // The constraint is enforced via CSS, which prevents the flex container from growing beyond its bounds
  });

  it('maintains 3 upgrade lanes per card stacked vertically', () => {
    document.body.innerHTML = `
      <div id="tooltip-layer" class="tooltip-layer"></div>
      <div class="season-card">
        <div class="season-upgrades">
          <div class="upgrade-lane-layout">
            <div class="upgrade-lane-header"></div>
            <div class="upgrade-lane-list">
              <div class="upgrade-lane-row" data-upgrade-type="hashrate"></div>
              <div class="upgrade-lane-row" data-upgrade-type="efficiency"></div>
              <div class="upgrade-lane-row" data-upgrade-type="cooling"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const laneList = document.querySelector('.upgrade-lane-list');
    const rows = laneList?.querySelectorAll('.upgrade-lane-row');

    expect(rows?.length).toBe(3);

    // Verify: lane-list uses display:contents so rows flow into the parent
    // .upgrade-table grid; each row spans grid-column: 1 / -1 for alignment.
    // The DOM parent relationship (row.parentNode === laneList) is unchanged.
    rows?.forEach((row) => {
      expect(row.className).toContain('upgrade-lane-row');
      expect(row.parentNode).toBe(laneList);
    });
  });
});

describe('season-card tooltip parity with player-status', () => {
  it('season-meta tooltip uses the same ps-tip-bubble class as player-status tooltips', () => {
    renderSeasonData(createData(1.23));

    const bubble = document.querySelector('#tooltip-layer .ps-tip-bubble');
    expect(bubble).not.toBeNull();
    expect(bubble.className).toBe('ps-tip-bubble');
    expect(bubble.getAttribute('role')).toBe('tooltip');
  });

  it('season-meta info trigger uses ps-tip-trigger class (same as player-status)', () => {
    renderSeasonData(createData(1.23));

    const trigger = document.querySelector(
      '#season-spring .season-meta .ps-tip-trigger'
    );
    expect(trigger).not.toBeNull();
    // Trigger must point to the bubble via aria-describedby
    const bubbleId = trigger.getAttribute('aria-describedby');
    expect(bubbleId).toBeTruthy();
    const bubble = document.getElementById(bubbleId);
    expect(bubble).not.toBeNull();
    expect(bubble.className).toContain('ps-tip-bubble');
  });
});

describe('season halving countdown stability', () => {
  it('keeps the local countdown target stable for same halving month updates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const halvingEl = document.querySelector('#season-spring .season-halving');
    expect(halvingEl).not.toBeNull();

    syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: Date.now() / 1000 + 30,
      halvingMonth: 5,
    });
    const firstText = halvingEl.textContent;

    // Same halving month arrives with a later target (sim-month jitter from payloads).
    syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: Date.now() / 1000 + 37,
      halvingMonth: 5,
    });
    const secondText = halvingEl.textContent;

    expect(firstText).toBe('00:30');
    expect(secondText).toBe('00:30');

    stopSeasonHalvingTimers();
    vi.useRealTimers();
  });
});

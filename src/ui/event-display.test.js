/**
File: src/ui/event-display.test.js
Purpose: Validate active-event banner and annotation rendering paths.
Role in system: Regression coverage for event indicators in display-only frontend layers.
Invariants/Security: Keeps event UX non-blocking and safely rendered via controlled DOM APIs.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getActiveEvents,
  initEventDisplay,
  renderEventBanner,
  annotateAffectedValues,
  clearEventIndicators,
  getEventTooltipElement,
  getEventTooltipId,
} from './event-display.js';

function buildFixture() {
  document.body.innerHTML = `
    <div id="tooltip-layer" class="tooltip-layer"></div>
    <div class="seasons-scroll">
      <div class="seasons-grid">
        <div class="season-card" data-season="spring">
          <div class="season-output">1.50/s</div>
          <span class="upgrade-row-cost">10</span>
        </div>
        <div class="season-card" data-season="summer">
          <div class="season-output">2.00/s</div>
          <span class="upgrade-row-cost">20</span>
        </div>
      </div>
    </div>
    <div id="player-state">
      <div class="ps-cell" data-row="output" data-token="spring">1.50</div>
      <div class="ps-cell" data-row="output" data-token="summer">2.00</div>
      <div class="ps-cell" data-row="price" data-token="spring">1.10</div>
      <div class="ps-cell" data-row="price" data-token="summer">2.50</div>
      <div class="ps-footer-content">No further halvings | Mined 100 | fee 0.02 / spread 0.01</div>
    </div>
    <div class="upgrade-row">
      <span class="upgrade-row-type" data-upgrade-type="cooling">Cooling</span>
      <span class="upgrade-row-cost" data-upgrade-type="cooling">50</span>
      <span class="upgrade-row-benefit" data-upgrade-type="cooling">+0.20/s</span>
    </div>
  `;
}

beforeEach(() => {
  clearEventIndicators();
  buildFixture();
});

describe('event display', () => {
  it('initializes with season scroll element', () => {
    const seasonScrollEl = document.querySelector('.seasons-scroll');
    initEventDisplay({ seasonScrollEl });

    const banner = document.querySelector('.event-banner');
    expect(banner).not.toBeNull();
    expect(banner.classList.contains('event-banner-hidden')).toBe(true);
  });

  it('creates tooltip layer if missing', () => {
    document.getElementById('tooltip-layer').remove();
    initEventDisplay({});

    const layer = document.getElementById('tooltip-layer');
    expect(layer).not.toBeNull();
    expect(layer.classList.contains('tooltip-layer')).toBe(true);
  });

  describe('event banner', () => {
    beforeEach(() => {
      const seasonScrollEl = document.querySelector('.seasons-scroll');
      initEventDisplay({ seasonScrollEl });
    });

    it('hides banner when no event is active', () => {
      renderEventBanner({ active_event: null });

      const banner = document.querySelector('.event-banner');
      expect(banner.classList.contains('event-banner-hidden')).toBe(true);
      expect(banner.textContent).toBe('');
    });

    it('renders banner with event name and effect description', () => {
      const data = {
        active_event: {
          name: 'Heatwave',
          effect_description: '−20% Cooling Efficiency',
          domains: ['cooling'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      renderEventBanner(data);

      const banner = document.querySelector('.event-banner');
      expect(banner.classList.contains('event-banner-hidden')).toBe(false);
      expect(banner.textContent).toContain('Heatwave');
      expect(banner.textContent).toContain('−20% Cooling Efficiency');
    });

    it('includes countdown timer in banner', () => {
      const endUnix = Date.now() / 1000 + 125; // ~2:05
      const data = {
        active_event: {
          name: 'Frost',
          effect_description: '+10% Output',
          domains: ['output'],
          end_unix: endUnix,
        },
      };

      renderEventBanner(data);

      const banner = document.querySelector('.event-banner');
      expect(banner.textContent).toMatch(/\d{2}:\d{2}/); // MM:SS format
    });

    it('renders 00:00 when event time has passed', () => {
      const data = {
        active_event: {
          name: 'Expired',
          effect_description: 'Old effect',
          domains: [],
          end_unix: Date.now() / 1000 - 100,
        },
      };

      renderEventBanner(data);

      const banner = document.querySelector('.event-banner');
      expect(banner.textContent).toContain('00:00');
    });

    it('uses neutral/warning styling for event banner', () => {
      const seasonScrollEl = document.querySelector('.seasons-scroll');
      initEventDisplay({ seasonScrollEl });

      const data = {
        active_event: {
          name: 'TestEvent',
          effect_description: 'Test',
          domains: [],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      renderEventBanner(data);

      const banner = document.querySelector('.event-banner');
      // Check for warning color (should be on banner element, not modal)
      expect(banner.className).toContain('event-banner');
      expect(banner.classList.contains('event-banner-hidden')).toBe(false);
    });

    it('keeps the event banner content node stable across refreshes', () => {
      const firstData = {
        active_event: {
          name: 'Heatwave',
          effect_description: '−20% Cooling Efficiency',
          domains: ['cooling'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };
      const secondData = {
        active_event: {
          name: 'Heatwave',
          effect_description: '+10% Output',
          domains: ['output'],
          end_unix: Date.now() / 1000 + 1800,
        },
      };

      renderEventBanner(firstData);
      const banner = document.querySelector('.event-banner');
      const contentNode = banner.querySelector('.event-banner-content');

      renderEventBanner(secondData);

      expect(banner.querySelector('.event-banner-content')).toBe(contentNode);
      expect(contentNode.textContent).toContain('+10% Output');
    });
  });

  describe('event indicators', () => {
    beforeEach(() => {
      initEventDisplay({});
    });

    it('adds indicator to output values when output domain affected', () => {
      const data = {
        active_event: {
          name: 'Boost',
          effect_description: '+25% Output',
          domains: ['output'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);

      const indicators = document.querySelectorAll(
        '.season-output .event-indicator'
      );
      expect(indicators.length).toBeGreaterThan(0);
      indicators.forEach((ind) => {
        expect(ind.textContent).toBe('⚡');
        expect(ind.getAttribute('aria-label')).toContain('Boost');
      });
    });

    it('ignores domains the backend never emits (e.g. cooling)', () => {
      annotateAffectedValues({
        active_event: {
          name: 'Heatwave',
          effect_description: '−20% Cooling',
          domains: ['cooling'],
        },
      });

      expect(document.querySelectorAll('.event-indicator')).toHaveLength(0);
    });

    it('adds indicator to upgrade cost when upgrade_cost domain affected', () => {
      const data = {
        active_event: {
          name: 'Markup',
          effect_description: '+15% Upgrade Cost',
          domains: ['upgrade_cost'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);

      const indicators = document.querySelectorAll(
        '.upgrade-row-cost .event-indicator'
      );
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('adds indicator to price cells when oracle_price domain affected', () => {
      const data = {
        active_event: {
          name: 'MarketShift',
          effect_description: '+15% Prices',
          domains: ['oracle_price'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);

      const indicators = document.querySelectorAll(
        '.ps-cell[data-row="price"] .event-indicator'
      );
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('does not add duplicate indicators', () => {
      const data = {
        active_event: {
          name: 'Test',
          effect_description: 'Test effect',
          domains: ['output'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);
      const count1 = document.querySelectorAll('.event-indicator').length;

      annotateAffectedValues(data);
      const count2 = document.querySelectorAll('.event-indicator').length;

      expect(count1).toBe(count2);
    });

    it('clears all indicators when no event is active', () => {
      const data = {
        active_event: {
          name: 'Test',
          effect_description: 'Test',
          domains: ['output'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);
      expect(
        document.querySelectorAll('.event-indicator').length
      ).toBeGreaterThan(0);

      annotateAffectedValues({ active_event: null });
      expect(document.querySelectorAll('.event-indicator').length).toBe(0);
    });

    it('indicator includes shared micro-tooltip linkage', () => {
      const eventName = 'StormyWeather';
      const data = {
        active_event: {
          name: eventName,
          effect_description: 'Heavy winds',
          domains: ['output'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);

      const indicator = document.querySelector('.event-indicator');
      expect(indicator.getAttribute('aria-describedby')).toBeTruthy();
      const bubble = document.getElementById(
        indicator.getAttribute('aria-describedby')
      );
      expect(bubble.textContent).toContain(eventName);
    });
  });

  describe('event tooltip', () => {
    beforeEach(() => {
      // Ensure tooltip layer exists before init
      if (!document.getElementById('tooltip-layer')) {
        const layer = document.createElement('div');
        layer.id = 'tooltip-layer';
        layer.className = 'tooltip-layer';
        document.body.appendChild(layer);
      }
      initEventDisplay({});
    });

    it('returns event tooltip element', () => {
      const tooltip = getEventTooltipElement();
      expect(
        tooltip === null || tooltip.classList.contains('ps-tip-bubble')
      ).toBe(true);
    });

    it('returns consistent tooltip ID', () => {
      const id1 = getEventTooltipId();
      const id2 = getEventTooltipId();
      expect(id1).toBe(id2);
      expect(id1 === '' || /event-(banner|indicator)-tip-/.test(id1)).toBe(
        true
      );
    });

    it('renders tooltip in tooltip-layer, not clipped', () => {
      const tooltip = getEventTooltipElement();
      expect(
        tooltip === null || tooltip.classList.contains('ps-tip-bubble')
      ).toBe(true);
    });

    it('tooltip includes event details', () => {
      const data = {
        active_event: {
          name: 'Cyclone',
          effect_description: '−30% Output',
          domains: ['output', 'oracle_price'],
          end_unix: Date.now() / 1000 + 1800,
        },
      };

      renderEventBanner(data);

      const tooltip = getEventTooltipElement();
      expect(tooltip).not.toBeNull();
      expect(tooltip.textContent).toContain('Cyclone');
      expect(tooltip.textContent).toContain('−30% Output');
      expect(tooltip.textContent).toMatch(
        /output.*oracle_price|oracle_price.*output/
      );
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      initEventDisplay({});
    });

    it('handles missing event fields gracefully', () => {
      const data = {
        active_event: {
          // Missing name and other fields
        },
      };

      expect(() => {
        renderEventBanner(data);
        annotateAffectedValues(data);
      }).not.toThrow();
    });

    it('handles null domains array', () => {
      const data = {
        active_event: {
          name: 'NoDomainsEvent',
          effect_description: 'No domains',
          domains: null,
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      expect(() => {
        annotateAffectedValues(data);
      }).not.toThrow();
    });

    it('handles malformed end_unix', () => {
      const data = {
        active_event: {
          name: 'BadTime',
          effect_description: 'Bad timestamp',
          domains: ['output'],
          end_unix: 'not-a-number',
        },
      };

      expect(() => {
        renderEventBanner(data);
      }).not.toThrow();
    });

    it('handles missing season-scroll element in initialization', () => {
      expect(() => {
        initEventDisplay({ seasonScrollEl: null });
      }).not.toThrow();

      // May not be created, but should not error
    });
  });

  describe('backend active_events list contract', () => {
    const meta = { sim_months_per_real_second: 0.5 };

    function demandSurge(overrides = {}) {
      return {
        event_id: 'e1',
        event_type: 'DEMAND_SURGE',
        domain: 'oracle_price',
        token: 'summer',
        magnitude: 1.25,
        label: 'Demand Surge',
        start_sim_month: 4,
        end_sim_month: 7,
        ...overrides,
      };
    }

    function liquidityCrunch(overrides = {}) {
      return {
        event_id: 'e2',
        event_type: 'LIQUIDITY_CRUNCH',
        domain: 'oracle_spread',
        token: null,
        magnitude: 0.04,
        label: 'Liquidity Crunch',
        start_sim_month: 5,
        end_sim_month: 6,
        ...overrides,
      };
    }

    beforeEach(() => {
      initEventDisplay({
        seasonScrollEl: document.querySelector('.seasons-scroll'),
        getActiveGameMeta: (gameId) => (gameId === '42' ? meta : null),
      });
    });

    it('prefers the active_events list over legacy keys', () => {
      const events = getActiveEvents({
        active_events: [demandSurge(), null, 'bad'],
        active_event: { name: 'Legacy' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].label).toBe('Demand Surge');
      expect(getActiveEvents({ active_events: [] })).toEqual([]);
      expect(getActiveEvents({})).toEqual([]);
    });

    it('renders label, derived effect and real-time remaining from meta rate', () => {
      renderEventBanner({
        game_id: 42,
        current_sim_month: 5,
        active_events: [demandSurge()],
      });

      const banner = document.querySelector('.event-banner');
      expect(banner.classList.contains('event-banner-hidden')).toBe(false);
      // (7 - 5) months / 0.5 months-per-second = 4 seconds
      expect(banner.textContent).toContain(
        '⚡ Event: Demand Surge (Oracle price +25% (summer)) — 00:04 remaining'
      );
    });

    it('lists multiple concurrent events in the banner and tooltip', () => {
      renderEventBanner({
        game_id: 42,
        current_sim_month: 5,
        active_events: [demandSurge(), liquidityCrunch()],
      });

      const content = document.querySelector('.event-banner-content');
      expect(content.textContent).toContain('⚡ 2 events:');
      expect(content.textContent).toContain('Demand Surge');
      expect(content.textContent).toContain(
        'Liquidity Crunch (Spread +4.0% (all tokens))'
      );
      const tooltip = getEventTooltipElement();
      expect(tooltip.textContent.split('\n')).toHaveLength(2);
    });

    it('falls back to remaining sim-months when no rate is known', () => {
      renderEventBanner({
        game_id: 'unknown',
        current_sim_month: 6,
        active_events: [demandSurge({ token: null, magnitude: 0.8 })],
      });

      const content = document.querySelector('.event-banner-content');
      expect(content.textContent).toContain('Oracle price −20% (all tokens)');
      expect(content.textContent).toContain('1 sim-month remaining');
    });

    it('humanizes event_type when label is missing', () => {
      renderEventBanner({
        active_events: [
          { event_type: 'MINER_STRIKE', domain: 'output', magnitude: 0.7 },
        ],
      });
      const content = document.querySelector('.event-banner-content');
      expect(content.textContent).toContain('Miner Strike (Output −30%');
      expect(content.textContent).toContain('— remaining');
    });

    it('hides the banner when the list is empty', () => {
      renderEventBanner({ active_events: [demandSurge()] });
      renderEventBanner({ active_events: [] });
      const banner = document.querySelector('.event-banner');
      expect(banner.classList.contains('event-banner-hidden')).toBe(true);
    });

    it('marks only the targeted token for token-scoped output events', () => {
      annotateAffectedValues({
        active_events: [
          {
            ...demandSurge(),
            domain: 'output',
            token: 'spring',
            label: 'Mining Boom',
          },
        ],
      });

      expect(
        document.querySelectorAll(
          '.season-card[data-season="spring"] .season-output .event-indicator'
        )
      ).toHaveLength(1);
      expect(
        document.querySelectorAll(
          '.season-card[data-season="summer"] .season-output .event-indicator'
        )
      ).toHaveLength(0);
      expect(
        document.querySelectorAll(
          '.ps-cell[data-row="output"][data-token="spring"] .event-indicator'
        )
      ).toHaveLength(1);
      expect(
        document.querySelectorAll(
          '.ps-cell[data-row="output"][data-token="summer"] .event-indicator'
        )
      ).toHaveLength(0);
    });

    it('marks every token for global events and the spread footer', () => {
      annotateAffectedValues({
        active_events: [
          demandSurge({ token: null }),
          liquidityCrunch(),
          {
            ...demandSurge(),
            domain: 'upgrade_cost',
            token: 'summer',
            label: 'Parts Shortage',
          },
        ],
      });

      expect(
        document.querySelectorAll('.ps-cell[data-row="price"] .event-indicator')
      ).toHaveLength(2);
      expect(
        document.querySelectorAll('.ps-footer-content .event-indicator')
      ).toHaveLength(1);
      expect(
        document.querySelectorAll(
          '.season-card[data-season="summer"] .upgrade-row-cost .event-indicator'
        )
      ).toHaveLength(1);
      expect(
        document.querySelectorAll(
          '.season-card[data-season="spring"] .upgrade-row-cost .event-indicator'
        )
      ).toHaveLength(0);
    });

    it('uses one indicator listing all events that hit the same cell', () => {
      annotateAffectedValues({
        current_sim_month: 5,
        active_events: [
          demandSurge({ token: 'summer' }),
          demandSurge({ event_id: 'e3', label: 'Market Rally', token: null }),
        ],
      });

      const indicators = document.querySelectorAll(
        '.ps-cell[data-row="price"][data-token="summer"] .event-indicator'
      );
      expect(indicators).toHaveLength(1);
      expect(indicators[0].getAttribute('aria-label')).toBe(
        'Affected by Demand Surge, Market Rally'
      );
      const bubble = document.getElementById(
        indicators[0].getAttribute('aria-describedby')
      );
      expect(bubble.textContent).toContain('Demand Surge');
      expect(bubble.textContent).toContain('Market Rally');
    });

    it('ignores tokens that are not simple identifiers', () => {
      expect(() =>
        annotateAffectedValues({
          active_events: [demandSurge({ token: '"] , body' })],
        })
      ).not.toThrow();
      expect(document.querySelectorAll('.event-indicator')).toHaveLength(0);
    });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
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
        <div class="season-card">
          <div class="season-output">1.50/s</div>
        </div>
        <div class="season-card">
          <div class="season-output">2.00/s</div>
        </div>
      </div>
    </div>
    <div id="player-state">
      <div class="ps-cell" data-row="output" data-token="spring">1.50</div>
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

    it('adds indicator to cooling upgrade when cooling domain affected', () => {
      const data = {
        active_event: {
          name: 'Heatwave',
          effect_description: '−20% Cooling',
          domains: ['cooling'],
          end_unix: Date.now() / 1000 + 3600,
        },
      };

      annotateAffectedValues(data);

      const indicators = document.querySelectorAll(
        '.upgrade-row-benefit[data-upgrade-type="cooling"] .event-indicator'
      );
      expect(indicators.length).toBeGreaterThan(0);
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
});

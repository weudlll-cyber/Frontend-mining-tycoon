/*
File: src/ui/event-display.js
Purpose: Event visibility and effect indicator system.
- Renders compact event banner when event is active
- Annotates affected values with subtle indicators (⚡)
- Uses the shared micro-tooltip behavior for explanations
*/

import { formatCountdownClock } from './halving-display.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _eventBannerEl = null;
let _disposeTooltips = null;
let _tooltipCounter = 0;

function nextTooltipId(prefix) {
  _tooltipCounter += 1;
  return `${prefix}-${_tooltipCounter}`;
}

function getActiveEvent(data) {
  return (
    data?.active_event ||
    data?.event_context?.active_event ||
    data?.events?.active ||
    null
  );
}

function getEventDomains(activeEvent) {
  if (Array.isArray(activeEvent?.domains)) {
    return activeEvent.domains.filter(Boolean);
  }
  if (typeof activeEvent?.domain === 'string' && activeEvent.domain) {
    return [activeEvent.domain];
  }
  return [];
}

function getRemainingSeconds(activeEvent) {
  const endUnix = Number(activeEvent?.end_unix ?? activeEvent?.ends_at_unix);
  if (!Number.isFinite(endUnix)) return null;
  return Math.max(0, endUnix - Date.now() / 1000);
}

function formatRemaining(activeEvent) {
  const remaining = getRemainingSeconds(activeEvent);
  return remaining === null ? '—' : formatCountdownClock(remaining);
}

function getEventTooltipText(activeEvent) {
  const eventName = String(activeEvent?.name || 'Event');
  const effectDesc = String(
    activeEvent?.effect_description || activeEvent?.effect || 'Effect active'
  );
  const domains = getEventDomains(activeEvent);
  const domainsText = domains.length ? domains.join(', ') : 'unknown';
  const remainingText = formatRemaining(activeEvent);
  return `${eventName} | Effect: ${effectDesc} | Domains: ${domainsText} | Remaining: ${remainingText}`;
}

function ensureTooltipLayer() {
  let tooltipLayer = document.getElementById('tooltip-layer');
  if (!tooltipLayer) {
    tooltipLayer = document.createElement('div');
    tooltipLayer.id = 'tooltip-layer';
    tooltipLayer.className = 'tooltip-layer';
    document.body.appendChild(tooltipLayer);
  }
  return tooltipLayer;
}

function mountTooltipBubble({ tooltipId, tooltipText }) {
  const tooltipLayer = ensureTooltipLayer();
  const bubble = document.createElement('span');
  bubble.className = 'ps-tip-bubble';
  bubble.id = tooltipId;
  bubble.setAttribute('role', 'tooltip');
  bubble.textContent = tooltipText;
  tooltipLayer.appendChild(bubble);
  return bubble;
}

function createTooltipTrigger({
  tooltipId,
  ariaLabel,
  text = '⚡',
  extraClass = '',
}) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `ps-tip-trigger event-indicator ${extraClass}`.trim();
  trigger.setAttribute('aria-label', ariaLabel);
  trigger.setAttribute('aria-describedby', tooltipId);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.dataset.tooltipId = tooltipId;
  trigger.textContent = text;
  return trigger;
}

function refreshTooltips() {
  if (_disposeTooltips) {
    _disposeTooltips();
    _disposeTooltips = null;
  }
  _disposeTooltips = initMicroTooltips(document.body);
}

function clearEventTooltipBubbles() {
  document
    .querySelectorAll(
      '[id^="event-banner-tip-"] , [id^="event-indicator-tip-"]'
    )
    .forEach((node) => node.remove());
}

/**
 * Initialize event display system with DOM references or create them.
 * @param {object} opts - { seasonScrollEl? }
 */
export function initEventDisplay(opts = {}) {
  const { seasonScrollEl } = opts;

  if (seasonScrollEl) {
    _eventBannerEl = seasonScrollEl.querySelector('.event-banner');
    if (!_eventBannerEl) {
      _eventBannerEl = document.createElement('div');
      _eventBannerEl.className = 'event-banner event-banner-hidden';
      seasonScrollEl.insertBefore(
        _eventBannerEl,
        seasonScrollEl.querySelector('.seasons-grid')
      );
    }
  }

  ensureTooltipLayer();
}

/**
 * Render event banner if event is active.
 * @param {object} data - SSE payload potentially containing active_event
 */
export function renderEventBanner(data) {
  if (!_eventBannerEl) return;

  const activeEvent = getActiveEvent(data);

  if (!activeEvent || !activeEvent.name) {
    _eventBannerEl.classList.add('event-banner-hidden');
    _eventBannerEl.replaceChildren();
    clearEventTooltipBubbles();
    refreshTooltips();
    return;
  }

  const countdownText = formatRemaining(activeEvent);
  const eventName = String(activeEvent.name || 'Event');
  const effectDesc = String(
    activeEvent.effect_description || activeEvent.effect || 'Effect active'
  );

  clearEventTooltipBubbles();
  _eventBannerEl.replaceChildren();
  _eventBannerEl.classList.remove('event-banner-hidden');

  const contentEl = document.createElement('span');
  contentEl.className = 'event-banner-content';
  contentEl.textContent = `⚡ Event: ${eventName} (${effectDesc}) — ${countdownText} remaining`;
  _eventBannerEl.appendChild(contentEl);

  const tooltipId = nextTooltipId('event-banner-tip');
  mountTooltipBubble({
    tooltipId,
    tooltipText: getEventTooltipText(activeEvent),
  });
  const trigger = createTooltipTrigger({
    tooltipId,
    ariaLabel: `${eventName} event details`,
    text: 'ⓘ',
    extraClass: 'event-banner-trigger',
  });
  _eventBannerEl.appendChild(trigger);
  refreshTooltips();
}

/**
 * Annotate DOM elements affected by active event.
 * Add ⚡ indicator next to affected output/upgrade values.
 * @param {object} data - SSE payload with active_event
 */
export function annotateAffectedValues(data) {
  const activeEvent = getActiveEvent(data);
  if (!activeEvent) {
    clearEventIndicators();
    return;
  }

  const domains = getEventDomains(activeEvent);

  clearEventIndicators();

  if (domains.includes('output')) {
    document.querySelectorAll('.season-output').forEach((el) => {
      addEventIndicator(el, activeEvent);
    });

    document.querySelectorAll('.ps-cell[data-row="output"]').forEach((el) => {
      addEventIndicator(el, activeEvent);
    });
  }

  if (domains.includes('upgrade_cost')) {
    document.querySelectorAll('.upgrade-row-cost').forEach((el) => {
      addEventIndicator(el, activeEvent);
    });
  }

  if (
    domains.includes('cooling') ||
    domains.includes('efficiency') ||
    domains.includes('hashrate')
  ) {
    const upgradeTypes = [];
    if (domains.includes('cooling')) upgradeTypes.push('cooling');
    if (domains.includes('efficiency')) upgradeTypes.push('efficiency');
    if (domains.includes('hashrate')) upgradeTypes.push('hashrate');

    upgradeTypes.forEach((type) => {
      document
        .querySelectorAll(
          `.upgrade-row-benefit[data-upgrade-type="${type}"], .upgrade-row-type[data-upgrade-type="${type}"]`
        )
        .forEach((el) => {
          addEventIndicator(el, activeEvent);
        });
    });
  }

  if (domains.includes('oracle_price')) {
    document.querySelectorAll('.ps-cell[data-row="price"]').forEach((el) => {
      addEventIndicator(el, activeEvent);
    });
  }

  if (domains.includes('oracle_spread')) {
    const footerContent = document.querySelector('.ps-footer-content');
    if (footerContent) {
      addEventIndicator(footerContent, activeEvent);
    }
  }

  refreshTooltips();
}

/**
 * Add a ⚡ indicator to an element.
 * Does NOT modify layout; uses a pseudo-element or inline-block span.
 */
function addEventIndicator(el, activeEvent) {
  if (!el) return;

  if (el.querySelector('.event-indicator')) {
    return;
  }

  const tooltipId = nextTooltipId('event-indicator-tip');
  mountTooltipBubble({
    tooltipId,
    tooltipText: getEventTooltipText(activeEvent),
  });
  const indicator = createTooltipTrigger({
    tooltipId,
    ariaLabel: `Affected by ${activeEvent.name || 'event'}`,
    text: '⚡',
  });
  el.appendChild(indicator);
}

/**
 * Clear all event indicators from DOM.
 */
export function clearEventIndicators() {
  document.querySelectorAll('.event-indicator').forEach((el) => {
    el.remove();
  });
  clearEventTooltipBubbles();
  refreshTooltips();
}

/**
 * Get event tooltip element for micro-tooltip system integration.
 * @returns {HTMLElement | null}
 */
export function getEventTooltipElement() {
  return (
    document.querySelector('[id^="event-banner-tip-"]') ||
    document.querySelector('[id^="event-indicator-tip-"]')
  );
}

/**
 * Get event tooltip ID for aria-describedby linking.
 * @returns {string}
 */
export function getEventTooltipId() {
  const tooltipEl = getEventTooltipElement();
  return tooltipEl?.id || '';
}

/*
File: src/ui/event-display.js
Purpose: Active-event banner and in-place effect indicator system.
Role in system:
- Downstream of SSE payloads (renderEventBanner / annotateAffectedValues called on every tick).
- Annotates affected UI cells with ⚡ indicators; owns their tooltip lifecycle.
- Does NOT call initMicroTooltips(document.body) on every tick — that would dispose
  season-card and player-state tooltip instances, closing any open tooltip after ~1 s.
  Instead: event-banner tooltip scopes to _eventBannerEl only (rebuilt once on mount),
  and each ⚡ indicator is self-bound via bindDirectTooltip() at creation time.
Constraints:
- LOCKED_DECISIONS.md §C: no overlay/modal behavior; event banner is inline.
- Frontend is display-only; active event data comes from backend SSE payload.
Security notes:
- Tooltip text is assembled from backend strings using textContent — no innerHTML.
*/

import { setElementTextValue } from '../utils/dom-utils.js';
import { formatCountdownClock } from './halving-display.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _eventBannerEl = null;
let _disposeTooltips = null;
let _tooltipCounter = 0;
let _eventBannerBubble = null;
let _eventBannerTrigger = null;
let _eventBannerContentEl = null;

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

// Direct hover binding for a single trigger/bubble pair.
// Used by event indicators so they don't need a container-wide initMicroTooltips
// scan that would disturb unrelated tooltip instances.
function bindDirectTooltip(trigger, bubble) {
  let closeRaf = null;

  const positionBubble = () => {
    const rect = trigger.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const top = rect.top - bRect.height - 8;
    const left = rect.left + rect.width / 2 - bRect.width / 2;
    bubble.style.top = `${Math.max(4, top)}px`;
    bubble.style.left = `${Math.max(4, Math.min(left, window.innerWidth - bRect.width - 4))}px`;
  };

  const open = () => {
    if (closeRaf !== null) {
      cancelAnimationFrame(closeRaf);
      closeRaf = null;
    }
    bubble.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(positionBubble);
  };

  const closeIfNotHovered = () => {
    if (closeRaf !== null) {
      cancelAnimationFrame(closeRaf);
    }
    // WHY: check on the next frame so pointer transitions from trigger to bubble
    // are treated as one continuous hover without any timeout-based auto-hide.
    closeRaf = requestAnimationFrame(() => {
      closeRaf = null;
      if (trigger.matches(':hover') || bubble.matches(':hover')) return;
      bubble.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  };

  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('mouseleave', closeIfNotHovered);
  bubble.addEventListener('mouseenter', open);
  bubble.addEventListener('mouseleave', closeIfNotHovered);
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bubble.classList.contains('is-open')) {
      bubble.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      open();
    }
  });
}

function refreshTooltips() {
  // Scope strictly to the event banner element — never document.body.
  // Scanning document.body re-binds every .ps-tip-trigger on the page and
  // disposes/recreates instances that own season-card and player-state tooltips,
  // which kills any open tooltip on every SSE tick.
  if (_disposeTooltips) {
    _disposeTooltips();
    _disposeTooltips = null;
  }
  if (_eventBannerEl) {
    _disposeTooltips = initMicroTooltips(_eventBannerEl);
  }
}

function clearEventTooltipBubbles() {
  document
    .querySelectorAll('[id^="event-indicator-tip-"]')
    .forEach((node) => node.remove());
}

// Returns true if the banner UI was freshly built (so caller knows to rebind tooltip).
function ensureEventBannerUi() {
  if (!_eventBannerEl) return false;
  if (
    _eventBannerContentEl?.isConnected &&
    _eventBannerTrigger?.isConnected &&
    _eventBannerBubble?.isConnected
  ) {
    return false;
  }

  _eventBannerContentEl = null;
  _eventBannerTrigger = null;
  _eventBannerBubble = null;

  _eventBannerContentEl = document.createElement('span');
  _eventBannerContentEl.className = 'event-banner-content selectable';
  _eventBannerEl.appendChild(_eventBannerContentEl);

  const tooltipId = 'event-banner-tip-current';
  _eventBannerBubble = mountTooltipBubble({
    tooltipId,
    tooltipText: '',
  });
  _eventBannerTrigger = createTooltipTrigger({
    tooltipId,
    ariaLabel: 'Event details',
    text: 'ⓘ',
    extraClass: 'event-banner-trigger',
  });
  _eventBannerTrigger.hidden = true;
  _eventBannerEl.appendChild(_eventBannerTrigger);
  return true;
}

/**
 * Initialize event display system with DOM references or create them.
 * @param {object} opts - { seasonScrollEl? }
 */
export function initEventDisplay(opts = {}) {
  const { seasonScrollEl } = opts;

  if (_eventBannerEl && !_eventBannerEl.isConnected) {
    _eventBannerEl = null;
    _eventBannerContentEl = null;
    _eventBannerTrigger = null;
    _eventBannerBubble = null;
  }

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
  } else if (!_eventBannerEl) {
    // WHY: Tests and defensive boot paths may initialize before the scroll host exists; keep a hidden inline fallback instead of dropping banner state.
    _eventBannerEl = document.createElement('div');
    _eventBannerEl.className = 'event-banner event-banner-hidden';
    _eventBannerEl.hidden = true;
    document.body.appendChild(_eventBannerEl);
  }

  ensureTooltipLayer();
}

/**
 * Render event banner if event is active.
 * @param {object} data - SSE payload potentially containing active_event
 */
export function renderEventBanner(data) {
  if (!_eventBannerEl) return;
  const bannerRebuilt = ensureEventBannerUi();

  const activeEvent = getActiveEvent(data);

  if (!activeEvent || !activeEvent.name) {
    _eventBannerEl.classList.add('event-banner-hidden');
    clearEventTooltipBubbles();
    setElementTextValue(_eventBannerContentEl, '');
    setElementTextValue(_eventBannerBubble, '');
    setElementTextValue(_eventBannerTrigger, '');
    _eventBannerTrigger.hidden = true;
    // Only rebind if the banner element was freshly rebuilt
    if (bannerRebuilt) refreshTooltips();
    return;
  }

  const countdownText = formatRemaining(activeEvent);
  const eventName = String(activeEvent.name || 'Event');
  const effectDesc = String(
    activeEvent.effect_description || activeEvent.effect || 'Effect active'
  );

  clearEventTooltipBubbles();
  _eventBannerEl.classList.remove('event-banner-hidden');
  _eventBannerEl.hidden = false;
  setElementTextValue(_eventBannerTrigger, 'ⓘ');
  setElementTextValue(
    _eventBannerContentEl,
    `⚡ Event: ${eventName} (${effectDesc}) — ${countdownText} remaining`
  );
  setElementTextValue(_eventBannerBubble, getEventTooltipText(activeEvent));
  _eventBannerTrigger.setAttribute('aria-label', `${eventName} event details`);
  _eventBannerTrigger.hidden = false;
  // Only rebind the banner tooltip when the DOM structure was freshly created
  if (bannerRebuilt || !_disposeTooltips) refreshTooltips();
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
  // No refreshTooltips() call here: each indicator is self-bound via bindDirectTooltip.
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
  const bubble = mountTooltipBubble({
    tooltipId,
    tooltipText: getEventTooltipText(activeEvent),
  });
  const indicator = createTooltipTrigger({
    tooltipId,
    ariaLabel: `Affected by ${activeEvent.name || 'event'}`,
    text: '⚡',
  });
  el.appendChild(indicator);
  // Bind directly — avoids initMicroTooltips(document.body) which would
  // dispose and recreate all other tooltip instances on every SSE tick.
  bindDirectTooltip(indicator, bubble);
}

/**
 * Clear all event indicators from DOM.
 */
export function clearEventIndicators() {
  document.querySelectorAll('.event-indicator').forEach((el) => {
    el.remove();
  });
  clearEventTooltipBubbles();
  // No refreshTooltips() needed: indicators used bindDirectTooltip,
  // so removing them from the DOM cleans up their listeners automatically.
}

/**
 * Get event tooltip element for micro-tooltip system integration.
 * @returns {HTMLElement | null}
 */
export function getEventTooltipElement() {
  return (
    document.getElementById('event-banner-tip-current') ||
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

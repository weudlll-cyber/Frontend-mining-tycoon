/**
File: src/ui/event-display.js
Purpose: Active-event banner and in-place effect indicator system.
Role in system:
- Downstream of SSE payloads (renderEventBanner / annotateAffectedValues called on every tick).
- Annotates affected UI cells with ⚡ indicators; owns their tooltip lifecycle.
- Does NOT call initMicroTooltips(document.body) on every tick — that would dispose
  season-card and player-state tooltip instances, closing any open tooltip after ~1 s.
  Instead: event-banner tooltip scopes to _eventBannerEl only (rebuilt once on mount),
  and each ⚡ indicator is self-bound via bindDirectTooltip() at creation time.
Backend contract (P2.3 events, app/core/events.py summarize_active_events):
- `active_events`: LIST of { event_id, event_type, domain, token, magnitude, label,
  start_sim_month, end_sim_month } on SSE and /state payloads; several may be active.
- domain ∈ oracle_price | oracle_spread | output | upgrade_cost; token null = all tokens.
- magnitude is a multiplier for oracle_price/output/upgrade_cost and an additive
  spread delta (fraction) for oracle_spread.
- Remaining real time is derived from (end_sim_month - current_sim_month) divided by
  the game's sim_months_per_real_second (from game meta); without a rate the banner
  falls back to remaining sim-months.
- Legacy single-object shapes (active_event / event_context.active_event /
  events.active with name/effect_description/end_unix) are still tolerated.
Constraints:
- LOCKED_DECISIONS.md §C: no overlay/modal behavior; event banner is inline.
- Frontend is display-only; active event data comes from backend payloads.
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

const DOMAIN_LABELS = {
  output: 'Output',
  upgrade_cost: 'Upgrade cost',
  oracle_price: 'Oracle price',
  oracle_spread: 'Spread',
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Return all currently active events as an array.
 * Prefers the backend list `active_events`; falls back to legacy single-object keys.
 */
export function getActiveEvents(data) {
  if (Array.isArray(data?.active_events)) {
    return data.active_events.filter(isPlainObject);
  }
  const legacy =
    data?.active_event ||
    data?.event_context?.active_event ||
    data?.events?.active ||
    null;
  return isPlainObject(legacy) ? [legacy] : [];
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

function getEventToken(activeEvent) {
  const token = String(activeEvent?.token || '')
    .trim()
    .toLowerCase();
  return token || null;
}

function humanizeEventType(eventType) {
  const raw = String(eventType || '').trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getEventName(activeEvent) {
  return (
    String(activeEvent?.label || activeEvent?.name || '').trim() ||
    humanizeEventType(activeEvent?.event_type) ||
    'Event'
  );
}

function formatSignedPercent(fraction, digits = 0) {
  const pct = fraction * 100;
  const rounded = Number(pct.toFixed(digits));
  if (rounded === 0) return '±0%';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`;
}

/**
 * Human-readable effect text, e.g. "Output +25% (spring)" or "Spread +4.0% (all tokens)".
 * Legacy payloads may carry a ready-made effect_description which wins.
 */
function getEffectDescription(activeEvent) {
  const legacy = activeEvent?.effect_description || activeEvent?.effect;
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }

  const domain = String(activeEvent?.domain || '').trim();
  const magnitude = Number(activeEvent?.magnitude);
  const domainLabel = DOMAIN_LABELS[domain] || humanizeEventType(domain);
  if (!domainLabel) {
    return 'Effect active';
  }

  let change = '';
  if (Number.isFinite(magnitude)) {
    // WHY: oracle_spread magnitude is an additive fraction; all other domains are multipliers.
    change =
      domain === 'oracle_spread'
        ? formatSignedPercent(magnitude, 1)
        : formatSignedPercent(magnitude - 1);
  }
  const token = getEventToken(activeEvent);
  const scope = token || 'all tokens';
  return `${domainLabel}${change ? ` ${change}` : ''} (${scope})`;
}

let _getActiveGameMeta = null;

function getSimMonthsPerRealSecond(data) {
  const meta = _getActiveGameMeta
    ? _getActiveGameMeta(String(data?.game_id || ''))
    : null;
  const rate = Number(
    meta?.sim_months_per_real_second ?? data?.sim_months_per_real_second
  );
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Remaining time of an event.
 * Returns { seconds } when a real-time estimate exists, { simMonths } when only
 * the sim-month bounds are known, or null when nothing can be derived.
 */
function getRemaining(activeEvent, data) {
  const endUnix = Number(activeEvent?.end_unix ?? activeEvent?.ends_at_unix);
  if (Number.isFinite(endUnix)) {
    return { seconds: Math.max(0, endUnix - Date.now() / 1000) };
  }

  const endMonth = Number(activeEvent?.end_sim_month);
  const currentMonth = Number(data?.current_sim_month);
  if (!Number.isFinite(endMonth) || !Number.isFinite(currentMonth)) {
    return null;
  }
  const monthsLeft = Math.max(0, endMonth - currentMonth);
  const rate = getSimMonthsPerRealSecond(data);
  if (rate) {
    return { seconds: monthsLeft / rate };
  }
  return { simMonths: monthsLeft };
}

function formatRemaining(activeEvent, data) {
  const remaining = getRemaining(activeEvent, data);
  if (!remaining) return '—';
  if (Number.isFinite(remaining.seconds)) {
    return formatCountdownClock(remaining.seconds);
  }
  const months = remaining.simMonths;
  return `${months} sim-month${months === 1 ? '' : 's'}`;
}

function getEventTooltipText(activeEvent, data) {
  const eventName = getEventName(activeEvent);
  const effectDesc = getEffectDescription(activeEvent);
  const domains = getEventDomains(activeEvent);
  const domainsText = domains.length ? domains.join(', ') : 'unknown';
  const remainingText = formatRemaining(activeEvent, data);
  const description = String(activeEvent?.description || '').trim();
  const base = `${eventName} | Effect: ${effectDesc} | Domains: ${domainsText} | Remaining: ${remainingText}`;
  return description ? `${base} | ${description}` : base;
}

function getEventsTooltipText(events, data) {
  return events.map((event) => getEventTooltipText(event, data)).join('\n');
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
  // One line per concurrent event.
  _eventBannerBubble.style.whiteSpace = 'pre-line';
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
  const { seasonScrollEl, getActiveGameMeta } = opts;
  if (typeof getActiveGameMeta === 'function') {
    _getActiveGameMeta = getActiveGameMeta;
  }

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
 * Render the inline event banner for all active events.
 * @param {object} data - SSE / state payload containing active_events
 */
export function renderEventBanner(data) {
  if (!_eventBannerEl) return;
  const bannerRebuilt = ensureEventBannerUi();

  const events = getActiveEvents(data);

  if (!events.length) {
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

  const segments = events.map(
    (event) =>
      `${getEventName(event)} (${getEffectDescription(event)}) — ${formatRemaining(event, data)} remaining`
  );
  const prefix =
    events.length === 1 ? '⚡ Event:' : `⚡ ${events.length} events:`;
  const ariaName =
    events.length === 1 ? getEventName(events[0]) : `${events.length} active`;

  clearEventTooltipBubbles();
  _eventBannerEl.classList.remove('event-banner-hidden');
  _eventBannerEl.hidden = false;
  setElementTextValue(_eventBannerTrigger, 'ⓘ');
  setElementTextValue(
    _eventBannerContentEl,
    `${prefix} ${segments.join(' · ')}`
  );
  setElementTextValue(_eventBannerBubble, getEventsTooltipText(events, data));
  _eventBannerTrigger.setAttribute('aria-label', `${ariaName} event details`);
  _eventBannerTrigger.hidden = false;
  // Only rebind the banner tooltip when the DOM structure was freshly created
  if (bannerRebuilt || !_disposeTooltips) refreshTooltips();
}

function tokenScopedSelector(selector, token, tokenSelector) {
  return token ? tokenSelector(token) : selector;
}

// Map an event to the DOM cells it affects. Token-scoped events only mark the
// matching token's cells; global events (token null) mark every token.
function collectAffectedElements(event) {
  const domains = getEventDomains(event);
  const token = getEventToken(event);
  // Token names are simple identifiers (spring/summer/...); anything else is
  // ignored rather than interpolated into a selector.
  if (token && !/^[a-z0-9_-]+$/.test(token)) {
    return [];
  }
  const safeToken = token;
  const selectors = [];

  if (domains.includes('output')) {
    selectors.push(
      tokenScopedSelector(
        '.season-output',
        safeToken,
        (t) => `.season-card[data-season="${t}"] .season-output`
      ),
      tokenScopedSelector(
        '.ps-cell[data-row="output"]',
        safeToken,
        (t) => `.ps-cell[data-row="output"][data-token="${t}"]`
      )
    );
  }

  if (domains.includes('upgrade_cost')) {
    // Backend applies upgrade-cost events to the upgrade's target token,
    // i.e. the season card the upgrade lane lives in.
    selectors.push(
      tokenScopedSelector(
        '.upgrade-row-cost',
        safeToken,
        (t) => `.season-card[data-season="${t}"] .upgrade-row-cost`
      )
    );
  }

  if (domains.includes('oracle_price')) {
    selectors.push(
      tokenScopedSelector(
        '.ps-cell[data-row="price"]',
        safeToken,
        (t) => `.ps-cell[data-row="price"][data-token="${t}"]`
      )
    );
  }

  if (domains.includes('oracle_spread')) {
    selectors.push('.ps-footer-content');
  }

  if (!selectors.length) return [];
  return Array.from(document.querySelectorAll(selectors.join(', ')));
}

/**
 * Annotate DOM elements affected by active events with a ⚡ indicator.
 * When several events hit the same cell, one indicator lists all of them.
 * @param {object} data - SSE / state payload with active_events
 */
export function annotateAffectedValues(data) {
  const events = getActiveEvents(data);
  clearEventIndicators();
  if (!events.length) {
    return;
  }

  const eventsByElement = new Map();
  events.forEach((event) => {
    collectAffectedElements(event).forEach((el) => {
      if (!eventsByElement.has(el)) eventsByElement.set(el, []);
      eventsByElement.get(el).push(event);
    });
  });

  eventsByElement.forEach((elementEvents, el) => {
    addEventIndicator(el, elementEvents, data);
  });
  // No refreshTooltips() call here: each indicator is self-bound via bindDirectTooltip.
}

/**
 * Add a ⚡ indicator to an element.
 * Does NOT modify layout; uses an inline-block trigger button.
 */
function addEventIndicator(el, events, data) {
  if (!el) return;

  if (el.querySelector('.event-indicator')) {
    return;
  }

  const tooltipId = nextTooltipId('event-indicator-tip');
  const bubble = mountTooltipBubble({
    tooltipId,
    tooltipText: getEventsTooltipText(events, data),
  });
  bubble.style.whiteSpace = 'pre-line';
  const indicator = createTooltipTrigger({
    tooltipId,
    ariaLabel: `Affected by ${events.map(getEventName).join(', ')}`,
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

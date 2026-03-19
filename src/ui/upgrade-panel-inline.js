/*
File: src/ui/upgrade-panel-inline.js
Purpose: Inline upgrade rendering for season cards in a compact row-based layout.
Context: Header uses compact one-line labels with micro-tooltips so data remains visible without horizontal card scrollbars.
Constraints: Must remain display-only and use safe DOM APIs (textContent/createElement).
Call initInlineUpgrades() once with required dependencies before use.
Renders upgrades directly into season .season-upgrades containers.
*/

import { clearElementChildren, formatCost } from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _getActiveGameMeta = null;
let _isActiveContractSupported = null;
let _getActiveUpgradeDefinitions = null;
let _performUpgrade = null;
const _inlineTooltipStateByContainer = new WeakMap();

function cleanupHeaderTooltipsForContainer(containerEl) {
  const previous = _inlineTooltipStateByContainer.get(containerEl);
  if (!previous) return;

  previous.dispose?.();
  const tooltipLayer = document.getElementById('tooltip-layer');
  if (tooltipLayer) {
    previous.bubbleIds.forEach((id) => {
      const bubble = document.getElementById(id);
      if (bubble && tooltipLayer.contains(bubble)) {
        bubble.remove();
      }
    });
  }

  _inlineTooltipStateByContainer.delete(containerEl);
}

function createHeaderCell({ label, tooltip, uniquePrefix }) {
  const cell = document.createElement('div');
  cell.className = 'upgrade-header-cell';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'upgrade-header-text';
  labelSpan.textContent = label;
  cell.appendChild(labelSpan);

  if (!tooltip) {
    return { cell, bubbleId: null };
  }

  const tooltipLayer = document.getElementById('tooltip-layer');
  if (!tooltipLayer) {
    labelSpan.title = tooltip;
    return { cell, bubbleId: null };
  }

  const tipId = `ps-tip-upgrade-${uniquePrefix}-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ps-tip-trigger upgrade-header-tip-trigger';
  trigger.setAttribute('aria-label', tooltip);
  trigger.setAttribute('aria-describedby', tipId);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.dataset.tooltipId = tipId;
  trigger.textContent = 'ⓘ';
  cell.appendChild(trigger);

  const bubble = document.createElement('span');
  bubble.className = 'ps-tip-bubble';
  bubble.id = tipId;
  bubble.setAttribute('role', 'tooltip');
  bubble.textContent = tooltip;

  tooltipLayer.appendChild(bubble);

  return { cell, bubbleId: tipId };
}

/**
 * @param {{
 *   getActiveGameMeta: (gameId: string) => object|null,
 *   isActiveContractSupported: () => boolean,
 *   getActiveUpgradeDefinitions: () => object|null,
 *   performUpgrade: (type: string, nextLevel: number, targetToken: string) => void,
 * }} deps
 */
export function initInlineUpgrades(deps) {
  _getActiveGameMeta = deps.getActiveGameMeta;
  _isActiveContractSupported = deps.isActiveContractSupported;
  _getActiveUpgradeDefinitions = deps.getActiveUpgradeDefinitions;
  _performUpgrade = deps.performUpgrade;
}

/**
 * Render inline upgrades for a specific season into its .season-upgrades container.
 * @param {HTMLElement} upgradesContainer - the .season-upgrades element in the season card
 * @param {string} seasonToken - the season token name (spring, summer, autumn, winter)
 * @param {object} data - the SSE data payload
 * @param {object|null} activeGameMeta - the meta for this game
 */
export function renderInlineSeasonUpgrades(
  upgradesContainer,
  seasonToken,
  data
) {
  if (!upgradesContainer) return;
  cleanupHeaderTooltipsForContainer(upgradesContainer);

  const metrics = data?.upgrade_metrics || {};
  const playerState = data?.player_state || {};

  const perTokenMetrics = metrics[seasonToken] || {};
  const upgrades = perTokenMetrics.upgrades || metrics.upgrades || {};
  const upgradeLevelsByToken = playerState.upgrades_by_token || {};
  const selectedTokenLevels =
    upgradeLevelsByToken[seasonToken] || playerState.upgrade_levels || {};

  const activeUpgradeDefinitions = _getActiveUpgradeDefinitions?.();
  const contractSupported = _isActiveContractSupported?.() ?? true;

  const defaultUpgradeOrder = ['hashrate', 'efficiency', 'cooling'];
  const supportedUpgradeTypes = defaultUpgradeOrder.filter((type) =>
    activeUpgradeDefinitions
      ? Object.prototype.hasOwnProperty.call(activeUpgradeDefinitions, type)
      : true
  );

  // Compact one-line header preserves horizontal space without truncating numeric columns.
  const layout = document.createElement('div');
  layout.className = 'upgrade-compact-layout';

  const headerGrid = document.createElement('div');
  headerGrid.className = 'upgrade-header-grid';

  const dataGrid = document.createElement('div');
  dataGrid.className = 'upgrade-compact-grid';

  // Abbreviations keep the header single-line; tooltips preserve clarity without widening columns.
  const headers = [
    { label: 'Upgrade', tooltip: null },
    { label: 'Lvl', tooltip: 'Lvl = Level' },
    { label: 'Cost', tooltip: null },
    { label: 'Out/s', tooltip: 'Out/s = Output per second (delta)' },
    { label: 'BEP', tooltip: 'BEP = Breakeven Period' },
    { label: 'Act', tooltip: 'Act = Action' },
  ];

  const bubbleIds = [];

  headers.forEach((header, index) => {
    const { cell, bubbleId } = createHeaderCell({
      ...header,
      uniquePrefix: `${seasonToken}-${index}`,
    });
    if (bubbleId) {
      bubbleIds.push(bubbleId);
    }
    headerGrid.appendChild(cell);
  });

  supportedUpgradeTypes.forEach((type) => {
    const info = upgrades[type];
    const definition = activeUpgradeDefinitions?.[type];
    if (!info && !definition) return;

    const level = selectedTokenLevels[type] || 0;
    const title = type.charAt(0).toUpperCase() + type.slice(1);

    const typeCell = document.createElement('div');
    typeCell.className = 'upgrade-row-cell upgrade-row-type';
    typeCell.dataset.upgradeType = type;
    typeCell.textContent = title;
    dataGrid.appendChild(typeCell);

    const levelCell = document.createElement('div');
    levelCell.className = 'upgrade-row-cell upgrade-row-level';
    levelCell.textContent = String(level);
    dataGrid.appendChild(levelCell);

    const costCell = document.createElement('div');
    costCell.className = 'upgrade-row-cell upgrade-row-cost';
    costCell.dataset.upgradeType = type;
    costCell.textContent =
      info?.cost_to_next !== undefined ? formatCost(info.cost_to_next) : '—';
    dataGrid.appendChild(costCell);

    const outputCell = document.createElement('div');
    outputCell.className = 'upgrade-row-cell upgrade-row-benefit';
    outputCell.dataset.upgradeType = type;
    outputCell.textContent =
      info?.delta_output !== undefined
        ? `+${info.delta_output.toFixed(2)}/s`
        : '—';
    dataGrid.appendChild(outputCell);

    const breakevenCell = document.createElement('div');
    breakevenCell.className = 'upgrade-row-cell upgrade-row-breakeven';
    breakevenCell.textContent =
      info?.breakeven_seconds !== undefined
        ? `${info.breakeven_seconds.toFixed(1)}s`
        : '—';
    dataGrid.appendChild(breakevenCell);

    // Upgrade button
    const button = document.createElement('button');
    button.className = 'btn-upgrade-inline upgrade-row-action';
    button.dataset.upgrade = type;
    button.dataset.level = String(level);
    button.dataset.token = seasonToken;
    button.textContent = 'Upgrade';
    if (!contractSupported) {
      button.disabled = true;
      button.title = 'Unsupported API contract version. Upgrades disabled.';
    }
    button.addEventListener('click', () => {
      const nextLevel = parseInt(button.dataset.level, 10) + 1;
      const upgradeType = button.dataset.upgrade;
      const token = button.dataset.token;
      _performUpgrade?.(upgradeType, nextLevel, token);
    });
    dataGrid.appendChild(button);
  });

  layout.appendChild(headerGrid);
  layout.appendChild(dataGrid);

  // Clear and populate container
  clearElementChildren(upgradesContainer);
  if (supportedUpgradeTypes.length > 0) {
    upgradesContainer.appendChild(layout);
    const dispose = initMicroTooltips(upgradesContainer);
    _inlineTooltipStateByContainer.set(upgradesContainer, { dispose, bubbleIds });
  } else {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'No upgrades available';
    upgradesContainer.appendChild(placeholder);
  }
}

/**
 * Render all season upgrades from the live data payload.
 * @param {object} data - the SSE data payload
 * @param {Function} getActiveGameMetaFn - function to get game meta by ID
 */
export function renderAllSeasonUpgrades(
  data,
  getActiveGameMetaFn = _getActiveGameMeta
) {
  if (!data?.game_id) return;

  const activeGameMeta =
    (getActiveGameMetaFn ?? _getActiveGameMeta)?.(String(data.game_id)) || null;

  const tokenNames = normalizeTokenNames(
    Array.isArray(data.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );

  // Render upgrades for each season
  tokenNames.forEach((token) => {
    const seasonCardEl = document.getElementById(`season-${token}`);
    if (seasonCardEl) {
      const upgradesEl = seasonCardEl.querySelector('.season-upgrades');
      if (upgradesEl) {
        renderInlineSeasonUpgrades(upgradesEl, token, data, activeGameMeta);
      }
    }
  });
}

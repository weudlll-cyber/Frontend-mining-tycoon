/*
File: src/ui/upgrade-panel-inline.js
Purpose: Inline upgrade rendering for season cards in a compact row-based layout.
Call initInlineUpgrades() once with required dependencies before use.
Renders upgrades directly into season .season-upgrades containers.
*/

import { clearElementChildren, formatCost } from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';

let _getActiveGameMeta = null;
let _isActiveContractSupported = null;
let _getActiveUpgradeDefinitions = null;
let _performUpgrade = null;

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

  // Build compact row-based layout
  const grid = document.createElement('div');
  grid.className = 'upgrade-compact-grid';

  // Build headers with optional tooltips
  const headers = [
    { label: 'Upgrade', tooltip: null },
    { label: 'Level', tooltip: 'Current upgrade level for this type' },
    { label: 'Cost', tooltip: null },
    { label: 'Δ Output/s', tooltip: 'Incremental output increase per second' },
    {
      label: 'Breakeven',
      tooltip: 'Seconds until upgrade pays back via increased output',
    },
    { label: 'Action', tooltip: null },
  ];

  headers.forEach((header) => {
    const headerCell = document.createElement('div');
    headerCell.className = 'upgrade-header-cell';
    headerCell.title = header.tooltip || '';
    headerCell.textContent = header.label;
    if (header.tooltip) {
      headerCell.setAttribute(
        'aria-label',
        `${header.label}: ${header.tooltip}`
      );
    }
    grid.appendChild(headerCell);
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
    grid.appendChild(typeCell);

    const levelCell = document.createElement('div');
    levelCell.className = 'upgrade-row-cell upgrade-row-level';
    levelCell.textContent = String(level);
    grid.appendChild(levelCell);

    const costCell = document.createElement('div');
    costCell.className = 'upgrade-row-cell upgrade-row-cost';
    costCell.dataset.upgradeType = type;
    costCell.textContent =
      info?.cost_to_next !== undefined ? formatCost(info.cost_to_next) : '—';
    grid.appendChild(costCell);

    const outputCell = document.createElement('div');
    outputCell.className = 'upgrade-row-cell upgrade-row-benefit';
    outputCell.dataset.upgradeType = type;
    outputCell.textContent =
      info?.delta_output !== undefined
        ? `+${info.delta_output.toFixed(2)}/s`
        : '—';
    grid.appendChild(outputCell);

    const breakevenCell = document.createElement('div');
    breakevenCell.className = 'upgrade-row-cell upgrade-row-breakeven';
    breakevenCell.textContent =
      info?.breakeven_seconds !== undefined
        ? `${info.breakeven_seconds.toFixed(1)}s`
        : '—';
    grid.appendChild(breakevenCell);

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
    grid.appendChild(button);
  });

  // Clear and populate container
  clearElementChildren(upgradesContainer);
  if (supportedUpgradeTypes.length > 0) {
    upgradesContainer.appendChild(grid);
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

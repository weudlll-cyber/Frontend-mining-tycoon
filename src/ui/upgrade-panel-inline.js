/**
File: src/ui/upgrade-panel-inline.js
Purpose: Inline upgrade rendering for season cards in a compact row-based layout.
Context: Displays upgrade options inline in each season card; pay-token is selected per lane
  and sent with the submit intent so the backend can authoritative-resolve the cost.
Constraints: Must remain display-only and use safe DOM APIs (textContent/createElement).
Call initInlineUpgrades() once with required dependencies before use.
Renders upgrades directly into season .season-upgrades containers.
*/

import {
  clearElementChildren,
  setElementTextValue,
} from '../utils/dom-utils.js';
import {
  formatCompactNumber,
  normalizeTokenNames,
} from '../utils/token-utils.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _getActiveGameMeta = null;
let _isActiveContractSupported = null;
let _getActiveUpgradeDefinitions = null;
let _performUpgrade = null;
let _getActionAvailability = null;
const _inlineStateByContainer = new WeakMap();

const DEFAULT_UPGRADE_ORDER = ['hashrate', 'efficiency', 'cooling'];

const UPGRADE_LANES_LEGEND =
  "Upgrade: name | Lvl: level | Cost: target-token | Pay: spend-token (auto-converts) | Out/s: per-second gain | BEP: break-even time | Dots after the name: this round's profile (● small steps, ●● steady, ●●● big step; dealt out at random per round) | ×N: buy several levels at once (as many as you can afford)";

// Profile names by rank of the per-level increment within this round
// (1 = smallest). Names match the how-to-play guide.
const PROFILE_LABELS = Object.freeze({
  1: 'Small steps',
  2: 'Steady',
  3: 'Big step',
});

function formatProfileNumber(value) {
  return Number(value.toFixed(4)).toString();
}

/**
 * Rank the upgrades of this round by their per-level increment so players can
 * tell the (randomly dealt) profiles apart. Values come from the game-scoped
 * meta, never from hardcoded defaults. Returns null when the increments are
 * missing or not all different (no meaningful ranking).
 * @param {Record<string, {increment?: number, base_cost?: number, cost_scaling?: number}>|null} definitions
 * @returns {Record<string, {rank: number, label: string, detail: string}>|null}
 */
export function describeUpgradeProfiles(definitions) {
  if (!definitions || typeof definitions !== 'object') return null;
  const entries = Object.entries(definitions).filter(([, def]) =>
    Number.isFinite(def?.increment)
  );
  if (entries.length !== 3) return null;
  const increments = new Set(entries.map(([, def]) => def.increment));
  if (increments.size !== entries.length) return null;

  const sorted = [...entries].sort((a, b) => a[1].increment - b[1].increment);
  const result = {};
  sorted.forEach(([type, def], index) => {
    const rank = index + 1;
    const parts = [`+${formatProfileNumber(def.increment)} per level`];
    if (Number.isFinite(def.base_cost)) {
      parts.push(`first level ${formatProfileNumber(def.base_cost)}`);
    }
    if (Number.isFinite(def.cost_scaling)) {
      parts.push(`cost ×${formatProfileNumber(def.cost_scaling)} per level`);
    }
    result[type] = {
      rank,
      label: PROFILE_LABELS[rank],
      detail: `${PROFILE_LABELS[rank]} this round: ${parts.join(', ')}.`,
    };
  });
  return result;
}

function formatInlineLevel(value) {
  const { display, full } = formatCompactNumber(value, {
    decimalsSmall: 0,
    decimalsLarge: 0,
  });
  return { display, full };
}

function formatInlineCost(value) {
  const { display, full } = formatCompactNumber(value, {
    decimalsSmall: 1,
    decimalsLarge: 1,
  });
  return { display, full };
}

function toTokenCode(token) {
  return String(token || '')
    .slice(0, 3)
    .toUpperCase();
}

function syncSelectOptions(selectEl, tokenNames) {
  const previousValue = selectEl.value;

  tokenNames.forEach((token, index) => {
    let option = selectEl.options[index];
    if (!option) {
      option = document.createElement('option');
      selectEl.appendChild(option);
    }
    option.value = token;
    setElementTextValue(option, toTokenCode(token));
  });

  while (selectEl.options.length > tokenNames.length) {
    selectEl.remove(selectEl.options.length - 1);
  }

  if (tokenNames.includes(previousValue)) {
    selectEl.value = previousValue;
  } else {
    selectEl.value = tokenNames[0] || '';
  }
}

function createUpgradeHeaderTooltip(trigger) {
  const tooltipLayer = document.getElementById('tooltip-layer');
  if (!tooltipLayer) {
    // Fallback only when micro-tooltip layer is unavailable.
    trigger.title = UPGRADE_LANES_LEGEND;
    return null;
  }

  const bubbleId = 'ps-tip-upgrade-lanes';
  let bubble = document.getElementById(bubbleId);
  if (!bubble) {
    bubble = document.createElement('span');
    bubble.id = bubbleId;
    bubble.className = 'ps-tip-bubble';
    bubble.setAttribute('role', 'tooltip');
    bubble.textContent = UPGRADE_LANES_LEGEND;
    tooltipLayer.appendChild(bubble);
  }

  trigger.setAttribute('aria-describedby', bubbleId);
  trigger.dataset.tooltipId = bubbleId;
  trigger.removeAttribute('title');
  return bubbleId;
}

function createHeader() {
  const header = document.createElement('div');
  header.className = 'upgrade-lane-header upgrade-header-grid';

  // Header labels; data-col drives alignment in CSS (independent of nth-child position)
  const headerCols = [
    ['Upgrade', 'upgrade'],
    ['Lvl', 'lvl'],
    ['Cost', 'cost'],
    ['Pay', 'pay'],
    ['Out/s', 'output'],
    ['BEP', 'bep'],
  ];
  headerCols.forEach(([label, colKey]) => {
    const cell = document.createElement('span');
    cell.className = 'upgrade-header-cell';
    cell.dataset.col = colKey;
    cell.appendChild(document.createTextNode(label));
    header.appendChild(cell);
  });

  // Info trigger for upgrade lanes legend (replaces 'Act' label)
  const infoCell = document.createElement('span');
  infoCell.className = 'upgrade-header-cell upgrade-header-info';
  const infoTrigger = document.createElement('button');
  infoTrigger.type = 'button';
  infoTrigger.className = 'ps-tip-trigger upgrade-header-info-trigger';
  infoTrigger.setAttribute('aria-label', 'Upgrade lanes legend');
  infoTrigger.setAttribute('aria-expanded', 'false');
  infoTrigger.appendChild(document.createTextNode('ℹ︎'));
  infoCell.appendChild(infoTrigger);
  header.appendChild(infoCell);

  createUpgradeHeaderTooltip(infoTrigger);
  return header;
}

/**
 * Most levels one upgrade request may buy, from the game meta
 * (`max_upgrade_levels_per_action`); 1 (no extra button) when unknown.
 */
export function resolveMaxLevelsPerAction(gameMeta) {
  const value = Number(gameMeta?.max_upgrade_levels_per_action);
  return Number.isInteger(value) && value > 1 ? value : 1;
}

function renderMultiButton(rowRefs, type, maxLevels) {
  const multi = rowRefs.multiButton;
  if (!multi) return;
  multi.hidden = maxLevels < 2;
  if (multi.hidden) return;
  const label = `×${maxLevels}`;
  if (multi.textContent !== label) multi.textContent = label;
  multi.dataset.levels = String(maxLevels);
  multi.disabled = rowRefs.button.disabled;
  multi.setAttribute('aria-label', `Upgrade ${type} up to ${maxLevels} levels`);
  multi.title = rowRefs.button.disabled
    ? rowRefs.button.title
    : `Buy up to ${maxLevels} levels at once (as many as you can afford)`;
}

function buildLaneRow(type, seasonToken) {
  const row = document.createElement('div');
  row.className = 'upgrade-lane-row';
  row.dataset.upgradeType = type;

  const nameCell = document.createElement('span');
  nameCell.className = 'upgrade-row-cell upgrade-row-type';
  nameCell.dataset.col = 'upgrade';
  const nameText = document.createElement('span');
  nameText.className = 'upgrade-row-name';
  const profilePips = document.createElement('span');
  profilePips.className = 'upgrade-profile-pips';
  profilePips.setAttribute('aria-hidden', 'true');
  profilePips.hidden = true;
  nameCell.append(nameText, profilePips);

  const levelCell = document.createElement('span');
  levelCell.className = 'upgrade-row-cell upgrade-row-level tabular-num';
  levelCell.dataset.col = 'lvl';

  const costCell = document.createElement('span');
  costCell.className = 'upgrade-row-cell upgrade-row-cost tabular-num';
  costCell.dataset.col = 'cost';

  const payCell = document.createElement('span');
  payCell.className = 'upgrade-row-cell upgrade-row-pay';
  payCell.dataset.col = 'pay';
  const paySelect = document.createElement('select');
  paySelect.className = 'upgrade-pay-select';
  paySelect.dataset.upgradeType = type;
  payCell.appendChild(paySelect);

  const outputCell = document.createElement('span');
  outputCell.className = 'upgrade-row-cell upgrade-row-benefit tabular-num';
  outputCell.dataset.col = 'output';

  const breakevenCell = document.createElement('span');
  breakevenCell.className =
    'upgrade-row-cell upgrade-row-breakeven tabular-num';
  breakevenCell.dataset.col = 'bep';

  const actionCell = document.createElement('span');
  actionCell.className = 'upgrade-row-cell upgrade-row-action';
  const button = document.createElement('button');
  button.className = 'btn-upgrade-inline upgrade-row-action';
  button.type = 'button';
  button.dataset.upgrade = type;
  button.dataset.token = seasonToken;
  button.setAttribute('aria-label', `Upgrade ${type}`);
  button.appendChild(document.createTextNode('Upgrade'));
  // "Buy several levels": shown when the backend publishes a limit > 1.
  const multiButton = document.createElement('button');
  multiButton.className = 'btn-upgrade-multi';
  multiButton.type = 'button';
  multiButton.dataset.upgrade = type;
  multiButton.dataset.token = seasonToken;
  multiButton.hidden = true;
  actionCell.append(button, multiButton);

  row.append(
    nameCell,
    levelCell,
    costCell,
    payCell,
    outputCell,
    breakevenCell,
    actionCell
  );

  return {
    row,
    nameCell,
    nameText,
    profilePips,
    levelCell,
    costCell,
    paySelect,
    outputCell,
    breakevenCell,
    button,
    multiButton,
  };
}

function createInlineState(upgradesContainer) {
  const layout = document.createElement('div');
  layout.className = 'upgrade-table upgrade-compact-layout';

  const header = createHeader();
  const laneList = document.createElement('div');
  laneList.className = 'upgrade-lane-list upgrade-compact-grid';

  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.hidden = true;
  placeholder.appendChild(document.createTextNode('No upgrades available'));

  layout.append(header, laneList);

  clearElementChildren(upgradesContainer);
  upgradesContainer.append(layout, placeholder);

  // Initialize tooltip for upgrade header info trigger
  const dispose = initMicroTooltips(header);

  const state = {
    layout,
    laneList,
    placeholder,
    rowsByType: new Map(),
    payTokenByType: new Map(),
    context: null,
    dispose,
  };
  _inlineStateByContainer.set(upgradesContainer, state);
  return state;
}

function ensureInlineState(upgradesContainer) {
  return (
    _inlineStateByContainer.get(upgradesContainer) ||
    createInlineState(upgradesContainer)
  );
}

function ensureLaneRow(type, seasonToken, state) {
  const existing = state.rowsByType.get(type);
  if (existing) {
    return existing;
  }

  const rowRefs = buildLaneRow(type, seasonToken);
  // Persist the user’s pay-token selection across SSE ticks
  rowRefs.paySelect.addEventListener('change', () => {
    state.payTokenByType.set(type, rowRefs.paySelect.value);
  });
  rowRefs.button.addEventListener('click', () => {
    const nextLevel = parseInt(rowRefs.button.dataset.level, 10) + 1;
    const payToken = rowRefs.paySelect.value || seasonToken;
    // Always pass payToken explicitly so service-layer fallbacks cannot
    // accidentally reuse stale panel selections from another token lane.
    _performUpgrade?.(type, nextLevel, seasonToken, payToken);
  });
  rowRefs.multiButton.addEventListener('click', () => {
    const nextLevel = parseInt(rowRefs.button.dataset.level, 10) + 1;
    const payToken = rowRefs.paySelect.value || seasonToken;
    const levels = parseInt(rowRefs.multiButton.dataset.levels, 10) || 1;
    _performUpgrade?.(type, nextLevel, seasonToken, payToken, levels);
  });

  state.laneList.appendChild(rowRefs.row);
  state.rowsByType.set(type, rowRefs);
  return rowRefs;
}

/**
 * @param {{
 *   getActiveGameMeta: (gameId: string) => object|null,
 *   isActiveContractSupported: () => boolean,
 *   getActiveUpgradeDefinitions: () => object|null,
 *   performUpgrade: (type: string, nextLevel: number, targetToken: string) => void,
 *   getActionAvailability?: () => { allowed: boolean, reason: string },
 * }} deps
 */
export function initInlineUpgrades(deps) {
  _getActiveGameMeta = deps.getActiveGameMeta;
  _isActiveContractSupported = deps.isActiveContractSupported;
  _getActiveUpgradeDefinitions = deps.getActiveUpgradeDefinitions;
  _performUpgrade = deps.performUpgrade;
  _getActionAvailability = deps.getActionAvailability || null;
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

  const state = ensureInlineState(upgradesContainer);

  const metrics = data?.upgrade_metrics || {};
  const playerState = data?.player_state || {};

  const perTokenMetrics = metrics[seasonToken] || {};
  const upgrades = perTokenMetrics.upgrades || metrics.upgrades || {};
  const upgradeLevelsByToken = playerState.upgrades_by_token || {};
  const selectedTokenLevels =
    upgradeLevelsByToken[seasonToken] || playerState.upgrade_levels || {};

  const activeUpgradeDefinitions = _getActiveUpgradeDefinitions?.();
  const contractSupported = _isActiveContractSupported?.() ?? true;
  // Play-window gate (enrolling/finished round, async without session); the
  // backend still rejects with 409 if the client view is stale.
  const actionAvailability = _getActionAvailability?.() ?? { allowed: true };
  const profiles = describeUpgradeProfiles(activeUpgradeDefinitions);

  const activeGameMeta =
    _getActiveGameMeta?.(String(data?.game_id || '')) || null;
  const maxLevelsPerAction = resolveMaxLevelsPerAction(activeGameMeta);
  const tokenNames = normalizeTokenNames(
    Array.isArray(data?.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );
  const supportedUpgradeTypes = DEFAULT_UPGRADE_ORDER.filter((type) =>
    activeUpgradeDefinitions
      ? Object.prototype.hasOwnProperty.call(activeUpgradeDefinitions, type)
      : true
  );

  state.context = {
    seasonToken,
    upgrades,
    activeUpgradeDefinitions,
  };

  if (!supportedUpgradeTypes.length) {
    state.layout.hidden = true;
    state.placeholder.hidden = false;
    return;
  }

  state.layout.hidden = false;
  state.placeholder.hidden = true;

  supportedUpgradeTypes.forEach((type) => {
    const rowRefs = ensureLaneRow(type, seasonToken, state);
    rowRefs.row.hidden = false;

    const info = upgrades[type];
    const definition = activeUpgradeDefinitions?.[type];
    if (!info && !definition) {
      rowRefs.row.hidden = true;
      return;
    }

    const title = type.charAt(0).toUpperCase() + type.slice(1);
    const level = selectedTokenLevels[type] || 0;
    const formattedLevel = formatInlineLevel(level);
    const formattedCost = formatInlineCost(info?.cost_to_next);

    setElementTextValue(rowRefs.nameText, title);
    const profile = profiles?.[type] || null;
    if (profile) {
      setElementTextValue(rowRefs.profilePips, '●'.repeat(profile.rank));
      rowRefs.profilePips.hidden = false;
      rowRefs.row.dataset.profileRank = String(profile.rank);
      rowRefs.nameCell.title = `${title} — ${profile.detail}`;
      rowRefs.button.setAttribute(
        'aria-label',
        `Upgrade ${type} (${profile.label})`
      );
    } else {
      rowRefs.profilePips.hidden = true;
      delete rowRefs.row.dataset.profileRank;
      rowRefs.nameCell.title = title;
      rowRefs.button.setAttribute('aria-label', `Upgrade ${type}`);
    }
    setElementTextValue(rowRefs.levelCell, formattedLevel.display);
    rowRefs.levelCell.title = formattedLevel.full;
    setElementTextValue(rowRefs.costCell, formattedCost.display);
    rowRefs.costCell.title = formattedCost.full;
    setElementTextValue(
      rowRefs.outputCell,
      info?.delta_output !== undefined
        ? `+${info.delta_output.toFixed(2)}/s`
        : '—'
    );
    setElementTextValue(
      rowRefs.breakevenCell,
      info?.breakeven_seconds !== undefined
        ? `${info.breakeven_seconds.toFixed(1)}s`
        : '—'
    );

    syncSelectOptions(rowRefs.paySelect, tokenNames);
    const storedPayToken = state.payTokenByType.get(type);
    const resolvedPayToken =
      storedPayToken && tokenNames.includes(storedPayToken)
        ? storedPayToken
        : tokenNames.includes(seasonToken)
          ? seasonToken
          : tokenNames[0] || '';
    rowRefs.paySelect.value = resolvedPayToken;
    state.payTokenByType.set(type, resolvedPayToken);

    rowRefs.button.dataset.level = String(level);
    if (!contractSupported) {
      rowRefs.button.disabled = true;
      rowRefs.button.title =
        'Unsupported API contract version. Upgrades disabled.';
    } else if (!actionAvailability.allowed) {
      rowRefs.button.disabled = true;
      rowRefs.button.title = actionAvailability.reason;
    } else {
      rowRefs.button.disabled = false;
      rowRefs.button.title = '';
    }
    renderMultiButton(rowRefs, type, maxLevelsPerAction);
  });

  state.rowsByType.forEach((rowRefs, type) => {
    if (!supportedUpgradeTypes.includes(type)) {
      rowRefs.row.hidden = true;
    }
  });
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

/*
File: src/ui/upgrade-panel.js
Purpose: Upgrade panel UI — builds the controls/select elements once, then updates dynamically on each SSE tick.
Call initUpgradePanel() once with required dependencies before use.
*/

import {
  clearElementChildren,
  formatCost,
} from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';
import { computePayCostPreview } from '../utils/token-utils.js';

let _upgradesEl = null;
let _getActiveGameMeta = null;
let _isActiveContractSupported = null;
let _getActiveUpgradeDefinitions = null;
let _performUpgrade = null;

const _uiRefs = {
  built: false,
  placeholder: null,
  controls: null,
  dynamicContent: null,
  targetSelect: null,
  paySelect: null,
};

let _lastUpgradePanelData = null;
let _selectedTargetToken = 'spring';
let _selectedPayToken = 'spring';

/**
 * @param {{
 *   upgradesEl: HTMLElement,
 *   getActiveGameMeta: (gameId: string) => object|null,
 *   isActiveContractSupported: () => boolean,
 *   getActiveUpgradeDefinitions: () => object|null,
 *   performUpgrade: (type: string, nextLevel: number) => void,
 * }} deps
 */
export function initUpgradePanel(deps) {
  _upgradesEl = deps.upgradesEl;
  _getActiveGameMeta = deps.getActiveGameMeta;
  _isActiveContractSupported = deps.isActiveContractSupported;
  _getActiveUpgradeDefinitions = deps.getActiveUpgradeDefinitions;
  _performUpgrade = deps.performUpgrade;
}

export function getLastUpgradePanelData() {
  return _lastUpgradePanelData;
}

export function getSelectedTokens() {
  return {
    targetToken: _selectedTargetToken,
    payToken: _selectedPayToken,
  };
}

function syncSelectOptions(selectEl, values, getLabel = (value) => String(value)) {
  if (!selectEl) return;
  const previousValue = selectEl.value;
  clearElementChildren(selectEl);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = getLabel(value);
    selectEl.appendChild(option);
  });
  if (values.includes(previousValue)) {
    selectEl.value = previousValue;
  }
}

function createUpgradeStat(labelText, valueText, extraClass = '') {
  const row = document.createElement('div');
  row.className = 'state-stat';

  const label = document.createElement('span');
  label.className = 'state-stat-label';
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = extraClass
    ? `state-stat-value ${extraClass}`
    : 'state-stat-value';
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  return row;
}

export function ensureUpgradePanelBuiltOnce() {
  if (_uiRefs.built) {
    return _uiRefs;
  }

  clearElementChildren(_upgradesEl);

  const controls = document.createElement('div');
  controls.className = 'upgrade-controls';
  controls.style.display = 'none';

  const targetWrap = document.createElement('label');
  targetWrap.className = 'upgrade-select';
  targetWrap.textContent = 'Target ';
  const targetSelect = document.createElement('select');
  targetSelect.id = 'upgrade-target-token';
  targetWrap.appendChild(targetSelect);

  const payWrap = document.createElement('label');
  payWrap.className = 'upgrade-select';
  payWrap.textContent = 'Pay ';
  const paySelect = document.createElement('select');
  paySelect.id = 'upgrade-pay-token';
  payWrap.appendChild(paySelect);

  controls.appendChild(targetWrap);
  controls.appendChild(payWrap);

  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = 'Waiting for upgrade data...';

  const dynamicContent = document.createElement('div');
  dynamicContent.className = 'upgrade-dynamic-content';

  _upgradesEl.appendChild(controls);
  _upgradesEl.appendChild(placeholder);
  _upgradesEl.appendChild(dynamicContent);

  targetSelect.addEventListener('change', () => {
    _selectedTargetToken = targetSelect.value;
    if (!_lastUpgradePanelData) return;
    const activeGameMeta =
      _getActiveGameMeta?.(String(_lastUpgradePanelData.game_id || '')) || null;
    updateUpgradePanelDynamic(_lastUpgradePanelData, activeGameMeta);
  });

  paySelect.addEventListener('change', () => {
    _selectedPayToken = paySelect.value;
    if (!_lastUpgradePanelData) return;
    const activeGameMeta =
      _getActiveGameMeta?.(String(_lastUpgradePanelData.game_id || '')) || null;
    updateUpgradePanelDynamic(_lastUpgradePanelData, activeGameMeta);
  });

  _uiRefs.built = true;
  _uiRefs.placeholder = placeholder;
  _uiRefs.controls = controls;
  _uiRefs.dynamicContent = dynamicContent;
  _uiRefs.targetSelect = targetSelect;
  _uiRefs.paySelect = paySelect;

  return _uiRefs;
}

export function updateUpgradePanelDynamic(data, activeGameMeta) {
  const refs = ensureUpgradePanelBuiltOnce();
  _lastUpgradePanelData = data;
  if (!data || !data.upgrade_metrics) {
    refs.placeholder.style.display = '';
    refs.controls.style.display = 'none';
    clearElementChildren(refs.dynamicContent);
    refs.placeholder.textContent = 'Waiting for upgrade data...';
    return;
  }

  const metrics = data.upgrade_metrics || {};
  const playerState = data.player_state || {};
  const tokenNames = normalizeTokenNames(
    Array.isArray(data.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );
  if (!tokenNames.includes(_selectedTargetToken)) {
    _selectedTargetToken = tokenNames[0] || 'spring';
  }
  if (!tokenNames.includes(_selectedPayToken)) {
    _selectedPayToken = _selectedTargetToken;
  }

  syncSelectOptions(refs.targetSelect, tokenNames, (token) =>
    token.toUpperCase()
  );
  syncSelectOptions(refs.paySelect, tokenNames, (token) => token.toUpperCase());
  refs.targetSelect.value = _selectedTargetToken;
  refs.paySelect.value = _selectedPayToken;

  const perTokenMetrics = metrics[_selectedTargetToken] || {};
  const upgrades = perTokenMetrics.upgrades || metrics.upgrades || {};
  const upgradeLevelsByToken = playerState.upgrades_by_token || {};
  const selectedTokenLevels =
    upgradeLevelsByToken[_selectedTargetToken] ||
    playerState.upgrade_levels ||
    {};
  const oraclePrices =
    activeGameMeta?.oracle_prices || data.oracle_prices || null;
  const feeRate = Number.isFinite(Number(data.conversion_fee_rate))
    ? Number(data.conversion_fee_rate)
    : Number(activeGameMeta?.conversion_fee_rate || 0);
  const spreadRate = Number.isFinite(Number(data.oracle_spread))
    ? Number(data.oracle_spread)
    : Number(activeGameMeta?.oracle_spread || 0);
  const effectiveUpgradeCostMultiplier = Number(
    activeGameMeta?.effective_upgrade_cost_multiplier?.[_selectedTargetToken] ||
      1
  );

  const activeUpgradeDefinitions = _getActiveUpgradeDefinitions?.();

  refs.placeholder.style.display = 'none';
  refs.controls.style.display = '';
  clearElementChildren(refs.dynamicContent);

  if (typeof perTokenMetrics.output_per_second === 'number') {
    const stateStat = document.createElement('div');
    stateStat.className = 'state-stat';

    const label = document.createElement('span');
    label.className = 'state-stat-label';
    label.textContent = 'Current Output';

    const value = document.createElement('span');
    value.className = 'state-stat-value highlight';
    value.textContent = `${perTokenMetrics.output_per_second.toFixed(2)} tokens/s`;

    stateStat.append(label, value);
    refs.dynamicContent.appendChild(stateStat);
  }

  const defaultUpgradeOrder = ['hashrate', 'efficiency', 'cooling'];
  const supportedUpgradeTypes = defaultUpgradeOrder.filter((type) =>
    activeUpgradeDefinitions
      ? Object.prototype.hasOwnProperty.call(activeUpgradeDefinitions, type)
      : true
  );

  let renderedCount = 0;
  supportedUpgradeTypes.forEach((type) => {
    const info = upgrades[type];
    const definition = activeUpgradeDefinitions?.[type];
    if (!info && !definition) return;
    renderedCount += 1;

    const level = selectedTokenLevels[type] || 0;
    const title = type.charAt(0).toUpperCase() + type.slice(1);
    const section = document.createElement('div');
    section.className = 'upgrade-section';

    const heading = document.createElement('h3');
    heading.textContent = `${title} Upgrade `;
    const levelSpan = document.createElement('span');
    levelSpan.className = 'upgrade-level';
    levelSpan.textContent = `Level ${level}`;
    heading.appendChild(levelSpan);
    section.appendChild(heading);

    section.appendChild(
      createUpgradeStat(
        `Cost (${_selectedTargetToken.toUpperCase()}):`,
        formatCost(info?.cost_to_next),
        'upgrade-cost'
      )
    );

    const preview = computePayCostPreview({
      baseCostTarget:
        typeof info?.cost_to_next === 'number'
          ? info.cost_to_next
          : Number(definition?.base_cost),
      targetToken: _selectedTargetToken,
      payToken: _selectedPayToken,
      oraclePrices,
      feeRate,
      spreadRate,
      upgradeCostMultiplier: effectiveUpgradeCostMultiplier,
    });

    if (preview) {
      section.appendChild(
        createUpgradeStat(
          'Preview:',
          `Cost: ${preview.baseCost} ${_selectedTargetToken.toUpperCase()} (~${preview.payCost} ${_selectedPayToken.toUpperCase()})`,
          'upgrade-current'
        )
      );
    } else if (
      oraclePrices?.[_selectedTargetToken] &&
      oraclePrices?.[_selectedPayToken]
    ) {
      const ratio =
        Number(oraclePrices[_selectedTargetToken]) /
        Number(oraclePrices[_selectedPayToken]);
      section.appendChild(
        createUpgradeStat(
          'Preview:',
          `ratio P_target/P_pay = ${Number.isFinite(ratio) ? ratio.toFixed(4) : '-'}`,
          'upgrade-current'
        )
      );
    }

    if (info && info.delta_output !== undefined) {
      section.appendChild(
        createUpgradeStat(
          'Output Increase:',
          `+${info.delta_output.toFixed(2)} tokens/s`,
          'upgrade-benefit'
        )
      );
    }
    if (info && info.output_after !== undefined) {
      section.appendChild(
        createUpgradeStat(
          'Output After:',
          `${info.output_after.toFixed(2)} tokens/s`,
          'upgrade-current'
        )
      );
    }
    if (info && info.breakeven_seconds !== undefined) {
      section.appendChild(
        createUpgradeStat(
          'Breakeven:',
          `${info.breakeven_seconds.toFixed(1)}s`,
          'upgrade-roi'
        )
      );
    }

    const contractSupported = _isActiveContractSupported?.() ?? true;
    const button = document.createElement('button');
    button.className = 'btn-upgrade';
    button.dataset.upgrade = type;
    button.dataset.level = String(level);
    button.textContent = `Upgrade -> Level ${level + 1}`;
    if (!contractSupported) {
      button.disabled = true;
      button.title = 'Unsupported API contract version. Upgrades disabled.';
    }
    button.addEventListener('click', () => {
      const nextLevel = parseInt(button.dataset.level, 10) + 1;
      _performUpgrade?.(type, nextLevel);
    });
    section.appendChild(button);

    refs.dynamicContent.appendChild(section);
  });

  if (renderedCount === 0) {
    refs.placeholder.style.display = '';
    refs.placeholder.textContent = 'No upgrade data available';
  }
}

export function renderUpgradeMetrics(data, getActiveGameMetaFn) {
  const activeGameMeta = (getActiveGameMetaFn ?? _getActiveGameMeta)?.(
    String(data?.game_id || '')
  ) || null;
  updateUpgradePanelDynamic(data, activeGameMeta);
}

/**
File: src/ui/upgrade-panel.js
Purpose: Render the legacy upgrade analytics panel with stable DOM nodes during SSE refreshes.
Role in system:
- Preserves the backward-compatible upgrade panel while inline season upgrades remain the primary gameplay surface.
Constraints:
- Frontend stays display/intent only; all upgrade costs and outcomes remain backend-authoritative.
- Live refreshes must avoid destructive subtree rebuilds so user selections and focus remain stable.
Security notes:
- Uses safe DOM APIs only; no untrusted HTML or overlay behavior.
*/

import {
  clearElementChildren,
  formatCost,
  setElementTextValue,
  setTextNodeValue,
} from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';
import { computePayCostPreview } from '../utils/token-utils.js';
import {
  ensureCurrentOutputRow,
  ensureUpgradeSection,
  hideUpgradeSection,
  setStatRowContent,
} from './upgrade-section-builder.js';

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
  currentOutput: null,
  upgradeSections: new Map(),
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

  _uiRefs.built = false;
  _uiRefs.placeholder = null;
  _uiRefs.controls = null;
  _uiRefs.dynamicContent = null;
  _uiRefs.targetSelect = null;
  _uiRefs.paySelect = null;
  _uiRefs.currentOutput = null;
  _uiRefs.upgradeSections = new Map();
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

function syncSelectOptions(
  selectEl,
  values,
  getLabel = (value) => String(value)
) {
  if (!selectEl) return;
  const previousValue = selectEl.value;

  // WHY: Reusing option nodes keeps the select stable across frequent SSE refreshes.
  values.forEach((value, index) => {
    let option = selectEl.options[index];
    if (!option) {
      option = document.createElement('option');
      selectEl.appendChild(option);
    }
    if (option.value !== value) {
      option.value = value;
    }
    setElementTextValue(option, getLabel(value));
  });

  while (selectEl.options.length > values.length) {
    selectEl.remove(selectEl.options.length - 1);
  }

  selectEl.value = values.includes(previousValue)
    ? previousValue
    : values[0] || '';
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
    setElementTextValue(refs.placeholder, 'Waiting for upgrade data...');
    if (refs.currentOutput) {
      refs.currentOutput.row.style.display = 'none';
    }
    refs.upgradeSections.forEach(hideUpgradeSection);
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

  if (typeof perTokenMetrics.output_per_second === 'number') {
    const currentOutput = ensureCurrentOutputRow(refs);
    setStatRowContent(
      currentOutput,
      'Current Output',
      `${perTokenMetrics.output_per_second.toFixed(2)} tokens/s`
    );
  } else if (refs.currentOutput) {
    refs.currentOutput.row.style.display = 'none';
  }

  const defaultUpgradeOrder = ['hashrate', 'efficiency', 'cooling'];
  const supportedUpgradeTypes = defaultUpgradeOrder.filter((type) =>
    activeUpgradeDefinitions
      ? Object.prototype.hasOwnProperty.call(activeUpgradeDefinitions, type)
      : true
  );

  let renderedCount = 0;
  const renderedTypes = new Set();
  supportedUpgradeTypes.forEach((type) => {
    const info = upgrades[type];
    const definition = activeUpgradeDefinitions?.[type];
    if (!info && !definition) return;
    renderedCount += 1;
    renderedTypes.add(type);

    const level = selectedTokenLevels[type] || 0;
    const sectionRefs = ensureUpgradeSection(refs, type, (upgradeType, nextLevel) => {
      _performUpgrade?.(upgradeType, nextLevel);
    });
    sectionRefs.section.style.display = '';
    setTextNodeValue(sectionRefs.levelNode, `Level ${level}`);

    setStatRowContent(
      sectionRefs.costStat,
      `Cost (${_selectedTargetToken.toUpperCase()}):`,
      formatCost(info?.cost_to_next)
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
      setStatRowContent(
        sectionRefs.previewStat,
        'Preview:',
        `Cost: ${preview.baseCost} ${_selectedTargetToken.toUpperCase()} (~${preview.payCost} ${_selectedPayToken.toUpperCase()})`
      );
    } else if (
      oraclePrices?.[_selectedTargetToken] &&
      oraclePrices?.[_selectedPayToken]
    ) {
      const ratio =
        Number(oraclePrices[_selectedTargetToken]) /
        Number(oraclePrices[_selectedPayToken]);
      setStatRowContent(
        sectionRefs.previewStat,
        'Preview:',
        `ratio P_target/P_pay = ${Number.isFinite(ratio) ? ratio.toFixed(4) : '-'}`
      );
    } else {
      sectionRefs.previewStat.row.style.display = 'none';
    }

    if (info && info.delta_output !== undefined) {
      setStatRowContent(
        sectionRefs.outputIncreaseStat,
        'Output Increase:',
        `+${info.delta_output.toFixed(2)} tokens/s`
      );
    } else {
      sectionRefs.outputIncreaseStat.row.style.display = 'none';
    }
    if (info && info.output_after !== undefined) {
      setStatRowContent(
        sectionRefs.outputAfterStat,
        'Output After:',
        `${info.output_after.toFixed(2)} tokens/s`
      );
    } else {
      sectionRefs.outputAfterStat.row.style.display = 'none';
    }
    if (info && info.breakeven_seconds !== undefined) {
      setStatRowContent(
        sectionRefs.breakevenStat,
        'Breakeven:',
        `${info.breakeven_seconds.toFixed(1)}s`
      );
    } else {
      sectionRefs.breakevenStat.row.style.display = 'none';
    }

    const contractSupported = _isActiveContractSupported?.() ?? true;
    const button = sectionRefs.button;
    button.dataset.level = String(level);
    setElementTextValue(button, `Upgrade -> Level ${level + 1}`);
    if (!contractSupported) {
      button.disabled = true;
      button.title = 'Unsupported API contract version. Upgrades disabled.';
    } else {
      button.disabled = false;
      button.title = '';
    }
  });

  refs.upgradeSections.forEach((sectionRefs, type) => {
    if (!renderedTypes.has(type)) {
      hideUpgradeSection(sectionRefs);
    }
  });

  if (renderedCount === 0) {
    refs.placeholder.style.display = '';
    setElementTextValue(refs.placeholder, 'No upgrade data available');
  } else {
    refs.placeholder.style.display = 'none';
  }
}

export function renderUpgradeMetrics(data, getActiveGameMetaFn) {
  const activeGameMeta =
    (getActiveGameMetaFn ?? _getActiveGameMeta)?.(
      String(data?.game_id || '')
    ) || null;
  updateUpgradePanelDynamic(data, activeGameMeta);
}

/*
File: src/ui/player-view.js
Purpose: Player state panel — builds the per-token output grid, balances block, and oracle-prices block.
All functions that write to the playerStateEl container live here.
Call initPlayerView() once with required dependencies before use.
*/

import {
  createStaticValueRow,
  setTextNodeValue,
  formatTokenAmount,
} from '../utils/dom-utils.js';
import { clearNode } from '../utils/dom-utils.js';
import { normalizeTokenNames } from '../utils/token-utils.js';
import { shouldShowTokenHalvingIndicator } from '../halving.js';
import {
  resolveNextHalvingTarget,
  shouldResetNextHalvingCountdownTarget,
  startNextHalvingCountdown,
  stopNextHalvingCountdown,
  getHalvingCountdownTarget,
  setHalvingCountdownTextNode,
  getLastHalvingNotice,
} from './halving-display.js';

let _playerStateEl = null;
let _getActiveGameMeta = null;

/** @param {{ playerStateEl: HTMLElement, getActiveGameMeta: (gameId: string) => object|null }} deps */
export function initPlayerView(deps) {
  _playerStateEl = deps.playerStateEl;
  _getActiveGameMeta = deps.getActiveGameMeta;
}

// DOM ref cache for the current player panel build
const _uiRefs = {
  built: false,
  tokenNamesKey: '',
  outputRateNodes: {},
  outputHalvingNodes: {},
  outputTotalNode: null,
  outputTotalSuffixNode: null,
  nextHalvingNode: null,
  lastHalvingNode: null,
  lastHalvingLine: null,
  cumulativeMinedNode: null,
  balanceNodes: {},
  oraclePriceNodes: {},
  oracleFeeNode: null,
  oracleSpreadNode: null,
};

export function calculateCurrentMiningRate(playerState) {
  if (!playerState) return 0;
  const mining = playerState.mining || {};
  const baseRate = 1.0;
  const hashrate = mining.hashrate || 1.0;
  const efficiency = mining.efficiency || 1.0;
  return baseRate * hashrate * efficiency;
}

export function resetPlayerStateView() {
  _uiRefs.built = false;
  _uiRefs.tokenNamesKey = '';
  _uiRefs.outputRateNodes = {};
  _uiRefs.outputHalvingNodes = {};
  _uiRefs.outputTotalNode = null;
  _uiRefs.outputTotalSuffixNode = null;
  _uiRefs.nextHalvingNode = null;
  _uiRefs.lastHalvingNode = null;
  _uiRefs.cumulativeMinedNode = null;
  _uiRefs.balanceNodes = {};
  _uiRefs.oraclePriceNodes = {};
  _uiRefs.oracleFeeNode = null;
  _uiRefs.oracleSpreadNode = null;
  clearNode(_playerStateEl);
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = 'Waiting for game data...';
  _playerStateEl.appendChild(placeholder);
}

function ensurePlayerStateView(tokenNames) {
  const key = tokenNames.join('|');
  if (_uiRefs.built && _uiRefs.tokenNamesKey === key) {
    return _uiRefs;
  }

  clearNode(_playerStateEl);

  const outputBlock = document.createElement('div');
  outputBlock.className = 'oracle-block';
  const outputTitle = document.createElement('h3');
  outputTitle.textContent = 'Per-Token Output';
  outputBlock.appendChild(outputTitle);

  const outputGrid = document.createElement('div');
  outputGrid.className = 'output-token-grid';
  const outputRateNodes = {};
  const outputHalvingNodes = {};
  tokenNames.forEach((token) => {
    const line = document.createElement('div');
    line.className = 'output-token-line';

    const name = document.createElement('span');
    name.className = 'state-stat-label';
    name.textContent = token.toUpperCase();

    const val = document.createElement('span');
    val.className = 'state-stat-value highlight';

    const rateSpan = document.createElement('span');
    rateSpan.id = `output-rate-${token}`;
    const rateTextNode = document.createTextNode('-');
    rateSpan.appendChild(rateTextNode);

    const unit = document.createTextNode(' /s');

    const halvingSpan = document.createElement('span');
    halvingSpan.className = 'output-halving-indicator';
    halvingSpan.id = `output-halving-${token}`;
    const halvingTextNode = document.createTextNode('');
    halvingSpan.appendChild(halvingTextNode);

    val.appendChild(rateSpan);
    val.appendChild(unit);
    val.appendChild(halvingSpan);

    line.appendChild(name);
    line.appendChild(val);
    outputGrid.appendChild(line);

    outputRateNodes[token] = rateTextNode;
    outputHalvingNodes[token] = halvingTextNode;
  });
  outputBlock.appendChild(outputGrid);

  const totalLine = document.createElement('div');
  totalLine.className = 'oracle-hint output-total-line';
  totalLine.appendChild(document.createTextNode('Total: '));
  const totalSpan = document.createElement('span');
  totalSpan.id = 'output-total-value';
  const totalTextNode = document.createTextNode('-');
  totalSpan.appendChild(totalTextNode);
  totalLine.appendChild(totalSpan);
  totalLine.appendChild(document.createTextNode(' /s'));
  const totalSuffix = document.createElement('span');
  totalSuffix.id = 'output-total-suffix';
  const totalSuffixNode = document.createTextNode('');
  totalSuffix.appendChild(totalSuffixNode);
  totalLine.appendChild(totalSuffix);
  outputBlock.appendChild(totalLine);

  const nextHalvingLine = document.createElement('div');
  nextHalvingLine.className = 'oracle-hint';
  const nextHalvingSpan = document.createElement('span');
  nextHalvingSpan.id = 'next-halving-value';
  const nextHalvingNode = document.createTextNode('No further halvings');
  nextHalvingSpan.appendChild(nextHalvingNode);
  nextHalvingLine.appendChild(nextHalvingSpan);
  outputBlock.appendChild(nextHalvingLine);

  const lastHalvingLine = document.createElement('div');
  lastHalvingLine.className = 'oracle-hint';
  const lastHalvingSpan = document.createElement('span');
  lastHalvingSpan.id = 'last-halving-value';
  const lastHalvingNode = document.createTextNode('');
  lastHalvingSpan.appendChild(lastHalvingNode);
  lastHalvingLine.appendChild(lastHalvingSpan);
  lastHalvingLine.style.display = 'none';
  outputBlock.appendChild(lastHalvingLine);

  _playerStateEl.appendChild(outputBlock);

  const cumulative = createStaticValueRow('Cumulative Mined', 'state-stat-value');
  cumulative.value.id = 'cumulative-mined-value';
  _playerStateEl.appendChild(cumulative.row);

  const balanceBlock = document.createElement('div');
  balanceBlock.className = 'oracle-block';
  const balanceTitle = document.createElement('h3');
  balanceTitle.textContent = 'Seasonal Balances';
  balanceBlock.appendChild(balanceTitle);
  const balanceNodes = {};
  tokenNames.forEach((token) => {
    const row = createStaticValueRow(token.toUpperCase(), 'state-stat-value');
    row.value.id = `balance-${token}-value`;
    balanceNodes[token] = row.valueTextNode;
    balanceBlock.appendChild(row.row);
  });
  _playerStateEl.appendChild(balanceBlock);

  const oracleBlock = document.createElement('div');
  oracleBlock.className = 'oracle-block';
  const oracleTitle = document.createElement('h3');
  oracleTitle.textContent = 'Oracle Prices';
  oracleBlock.appendChild(oracleTitle);
  const oraclePriceNodes = {};
  tokenNames.forEach((token) => {
    const row = createStaticValueRow(`P_${token}`, 'state-stat-value');
    row.value.id = `oracle-price-${token}-value`;
    oraclePriceNodes[token] = row.valueTextNode;
    oracleBlock.appendChild(row.row);
  });

  const hint = document.createElement('div');
  hint.className = 'oracle-hint';
  hint.appendChild(document.createTextNode('fee='));
  const feeSpan = document.createElement('span');
  feeSpan.id = 'oracle-fee-value';
  const feeNode = document.createTextNode('-');
  feeSpan.appendChild(feeNode);
  hint.appendChild(feeSpan);
  hint.appendChild(document.createTextNode(' | spread='));
  const spreadSpan = document.createElement('span');
  spreadSpan.id = 'oracle-spread-value';
  const spreadNode = document.createTextNode('-');
  spreadSpan.appendChild(spreadNode);
  hint.appendChild(spreadSpan);
  oracleBlock.appendChild(hint);
  _playerStateEl.appendChild(oracleBlock);

  _uiRefs.built = true;
  _uiRefs.tokenNamesKey = key;
  _uiRefs.outputRateNodes = outputRateNodes;
  _uiRefs.outputHalvingNodes = outputHalvingNodes;
  _uiRefs.outputTotalNode = totalTextNode;
  _uiRefs.outputTotalSuffixNode = totalSuffixNode;
  _uiRefs.nextHalvingNode = nextHalvingNode;
  _uiRefs.lastHalvingNode = lastHalvingNode;
  _uiRefs.lastHalvingLine = lastHalvingLine;
  _uiRefs.cumulativeMinedNode = cumulative.valueTextNode;
  _uiRefs.balanceNodes = balanceNodes;
  _uiRefs.oraclePriceNodes = oraclePriceNodes;
  _uiRefs.oracleFeeNode = feeNode;
  _uiRefs.oracleSpreadNode = spreadNode;

  return _uiRefs;
}

export function renderPlayerState(data) {
  if (!data) {
    resetPlayerStateView();
    return;
  }

  const playerState = data.player_state || {};
  const activeGameMeta = _getActiveGameMeta
    ? _getActiveGameMeta(String(data.game_id || ''))
    : null;
  const tokenNames = normalizeTokenNames(
    Array.isArray(data.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );
  const refs = ensurePlayerStateView(tokenNames);
  const balances = playerState.balances || playerState.tokens || {};
  const oraclePrices =
    activeGameMeta?.oracle_prices || data.oracle_prices || null;
  const metrics = data.upgrade_metrics || {};
  const currentRate =
    typeof metrics.output_per_second === 'number'
      ? metrics.output_per_second
      : calculateCurrentMiningRate(playerState);
  const outputRatePerToken = data.output_rate_per_token || null;

  let hasPerTokenRates = false;
  tokenNames.forEach((token) => {
    const rawRate = Number(outputRatePerToken?.[token]);
    if (Number.isFinite(rawRate)) {
      hasPerTokenRates = true;
      setTextNodeValue(refs.outputRateNodes[token], rawRate.toFixed(2));
    } else {
      setTextNodeValue(refs.outputRateNodes[token], '-');
    }

    const isPostHalvingWindow =
      Number.isFinite(rawRate) &&
      shouldShowTokenHalvingIndicator(token, data.current_sim_month);
    if (isPostHalvingWindow) {
      const prevRate = rawRate * 2;
      setTextNodeValue(
        refs.outputHalvingNodes[token],
        ` \u219350% (was ${prevRate.toFixed(2)} /s)`
      );
    } else {
      setTextNodeValue(refs.outputHalvingNodes[token], '');
    }
  });

  if (hasPerTokenRates) {
    const total = tokenNames.reduce(
      (sum, token) => sum + Number(outputRatePerToken?.[token] || 0),
      0
    );
    setTextNodeValue(refs.outputTotalNode, total.toFixed(2));
    setTextNodeValue(refs.outputTotalSuffixNode, '');
  } else {
    setTextNodeValue(refs.outputTotalNode, currentRate.toFixed(2));
    setTextNodeValue(refs.outputTotalSuffixNode, ' (fallback)');
  }

  const nextHalvingTarget = resolveNextHalvingTarget({
    data,
    activeGameMeta,
    tokenNames,
  });
  if (nextHalvingTarget && data?.game_status === 'running') {
    const prev = getHalvingCountdownTarget();
    const shouldReset = shouldResetNextHalvingCountdownTarget(
      prev,
      nextHalvingTarget
    );

    if (shouldReset) {
      startNextHalvingCountdown({
        token: nextHalvingTarget.token,
        halvingMonth: nextHalvingTarget.halvingMonth,
        halvingAtUnix: nextHalvingTarget.halvingAtUnix,
        textNode: refs.nextHalvingNode,
      });
    } else {
      setHalvingCountdownTextNode(refs.nextHalvingNode);
    }
  } else {
    stopNextHalvingCountdown();
    setTextNodeValue(refs.nextHalvingNode, 'No further halvings');
  }

  const lastHalvingNotice = getLastHalvingNotice();
  if (lastHalvingNotice) {
    setTextNodeValue(
      refs.lastHalvingNode,
      `Last halving: ${lastHalvingNotice.token.toUpperCase()} (-50% production)`
    );
    refs.lastHalvingLine.style.display = '';
  } else {
    setTextNodeValue(refs.lastHalvingNode, '');
    refs.lastHalvingLine.style.display = 'none';
  }

  setTextNodeValue(
    refs.cumulativeMinedNode,
    playerState.cumulative_mined !== undefined
      ? formatTokenAmount(playerState.cumulative_mined)
      : '-'
  );

  tokenNames.forEach((token) => {
    setTextNodeValue(
      refs.balanceNodes[token],
      formatTokenAmount(balances[token])
    );
  });

  tokenNames.forEach((token) => {
    const oracleValue =
      oraclePrices && typeof oraclePrices === 'object'
        ? formatTokenAmount(oraclePrices[token])
        : '-';
    setTextNodeValue(refs.oraclePriceNodes[token], oracleValue);
  });

  const fee = data.conversion_fee_rate;
  const spread = data.oracle_spread;
  setTextNodeValue(
    refs.oracleFeeNode,
    Number.isFinite(Number(fee)) ? Number(fee).toFixed(4) : '-'
  );
  setTextNodeValue(
    refs.oracleSpreadNode,
    Number.isFinite(Number(spread)) ? Number(spread).toFixed(4) : '-'
  );
}

/*
File: src/ui/player-view.js
Purpose: Compact player-state matrix renderer with optional non-blocking micro-tooltips.
*/

import { setTextNodeValue } from '../utils/dom-utils.js';
import { clearNode } from '../utils/dom-utils.js';
import {
  normalizeTokenNames,
  formatCompactNumber,
} from '../utils/token-utils.js';
import {
  resolveNextHalvingTarget,
  shouldResetNextHalvingCountdownTarget,
  startNextHalvingCountdown,
  stopNextHalvingCountdown,
  getHalvingCountdownTarget,
  getLastHalvingNotice,
  formatCountdownClock,
} from './halving-display.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _playerStateEl = null;
let _getActiveGameMeta = null;
let _disposeTooltips = null;

const TOKEN_LABELS = {
  spring: 'SPR',
  summer: 'SUM',
  autumn: 'AUT',
  winter: 'WIN',
};

function format2(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '-';
}

function format4(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(4) : '-';
}

/**
 * Format a number compactly (k/M/B) for display, keeping full value for tooltip.
 * Returns { display, full } for use in cells with tooltip support.
 */
function formatCompactDisplay(value) {
  return formatCompactNumber(value, { decimalsSmall: 2, decimalsLarge: 2 });
}

/**
 * Update a text node with compact display format.
 * Stores full value in data attribute for tooltip extraction.
 */
function setCompactNodeValue(textNode, cell, value) {
  const { display, full } = formatCompactDisplay(value);
  setTextNodeValue(textNode, display);
  if (cell && full !== '—') {
    cell.dataset.fullValue = full;
  }
}

function toTokenLabel(token) {
  return (
    TOKEN_LABELS[token] ||
    String(token || '')
      .slice(0, 3)
      .toUpperCase()
  );
}

/** @param {{ playerStateEl: HTMLElement, getActiveGameMeta: (gameId: string) => object|null }} deps */
export function initPlayerView(deps) {
  _playerStateEl = deps.playerStateEl;
  _getActiveGameMeta = deps.getActiveGameMeta;
}

const _uiRefs = {
  built: false,
  tokenNamesKey: '',
  outputRateNodes: {},
  balanceNodes: {},
  oraclePriceNodes: {},
  outputCells: {},
  balanceCells: {},
  priceCells: {},
  outputTotalNode: null,
  balanceTotalNode: null,
  oracleTotalNode: null,
  outputTotalCell: null,
  balanceTotalCell: null,
  oracleTotalCell: null,
  footerContentNode: null,
  tooltipNodes: {
    output: null,
    balance: null,
    price: null,
    footer: null,
  },
};

export function calculateCurrentMiningRate(playerState) {
  if (!playerState) return 0;
  const mining = playerState.mining || {};
  const baseRate = 1.0;
  const hashrate = mining.hashrate || 1.0;
  const efficiency = mining.efficiency || 1.0;
  return baseRate * hashrate * efficiency;
}

/**
 * Creates a label cell (left-aligned, no icon) for matrix rows.
 * Icon is placed in a separate cell at the end of the row.
 */
function createLabelCell({ rowKey, labelText }) {
  const labelCell = document.createElement('div');
  labelCell.className = 'ps-cell ps-label-cell ps-row-label';
  labelCell.dataset.row = rowKey;

  const text = document.createElement('span');
  text.className = 'ps-label-text';
  text.textContent = labelText;

  labelCell.appendChild(text);
  return labelCell;
}

/**
 * Creates an icon cell with tooltip trigger for placement at end of row/footer.
 * Returns { iconCell, trigger, bubbleNode } for external positioning.
 */
function createIconCell({ rowKey, tooltipId, tooltipText }) {
  const iconCell = document.createElement('div');
  iconCell.className = 'ps-cell ps-icon-cell';
  iconCell.dataset.row = rowKey;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ps-tip-trigger';
  trigger.setAttribute('aria-label', `${rowKey} info`);
  trigger.setAttribute('aria-describedby', tooltipId);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = 'ⓘ';
  trigger.dataset.tooltipId = tooltipId;

  const bubble = document.createElement('span');
  bubble.className = 'ps-tip-bubble';
  bubble.id = tooltipId;
  bubble.setAttribute('role', 'tooltip');
  const bubbleNode = document.createTextNode(tooltipText);
  bubble.appendChild(bubbleNode);

  iconCell.appendChild(trigger);
  iconCell.dataset.bubbleId = tooltipId;

  return { iconCell, trigger, bubble, bubbleNode };
}

export function resetPlayerStateView() {
  _uiRefs.built = false;
  _uiRefs.tokenNamesKey = '';
  _uiRefs.outputRateNodes = {};
  _uiRefs.balanceNodes = {};
  _uiRefs.oraclePriceNodes = {};
  _uiRefs.outputCells = {};
  _uiRefs.balanceCells = {};
  _uiRefs.priceCells = {};
  _uiRefs.outputTotalNode = null;
  _uiRefs.balanceTotalNode = null;
  _uiRefs.oracleTotalNode = null;
  _uiRefs.outputTotalCell = null;
  _uiRefs.balanceTotalCell = null;
  _uiRefs.oracleTotalCell = null;
  _uiRefs.footerContentNode = null;
  _uiRefs.tooltipNodes = {
    output: null,
    balance: null,
    price: null,
    footer: null,
  };

  if (_disposeTooltips) {
    _disposeTooltips();
    _disposeTooltips = null;
  }

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

  if (_disposeTooltips) {
    _disposeTooltips();
    _disposeTooltips = null;
  }

  clearNode(_playerStateEl);

  const matrix = document.createElement('div');
  matrix.className = 'ps-matrix';

  // Header row: Metric | SPR | SUM | AUT | WIN | Σ | Icon
  const headLabel = document.createElement('div');
  headLabel.className = 'ps-cell ps-head-label';
  headLabel.textContent = 'Metric';
  matrix.appendChild(headLabel);

  tokenNames.forEach((token) => {
    const head = document.createElement('div');
    head.className = 'ps-cell ps-head-token';
    head.dataset.token = token;
    head.textContent = toTokenLabel(token);
    matrix.appendChild(head);
  });

  const sigmaHead = document.createElement('div');
  sigmaHead.className = 'ps-cell ps-head-token ps-head-sigma';
  sigmaHead.dataset.token = 'sigma';
  sigmaHead.textContent = 'Σ';
  matrix.appendChild(sigmaHead);

  // Icon column header (empty)
  const headIcon = document.createElement('div');
  headIcon.className = 'ps-cell ps-head-icon';
  matrix.appendChild(headIcon);

  // OUTPUT ROW
  const outputLabelCell = createLabelCell({
    rowKey: 'output',
    labelText: 'Out/s',
  });
  matrix.appendChild(outputLabelCell);

  const outputRateNodes = {};
  const outputCells = {};
  tokenNames.forEach((token) => {
    const cell = document.createElement('div');
    cell.className = 'ps-cell ps-value';
    cell.dataset.row = 'output';
    cell.dataset.token = token;
    const node = document.createTextNode('-');
    cell.appendChild(node);
    matrix.appendChild(cell);
    outputRateNodes[token] = node;
    outputCells[token] = cell;
  });

  const outputTotalCell = document.createElement('div');
  outputTotalCell.className = 'ps-cell ps-value ps-cell-total';
  outputTotalCell.dataset.row = 'output';
  const outputTotalNode = document.createTextNode('-');
  outputTotalCell.appendChild(outputTotalNode);
  matrix.appendChild(outputTotalCell);

  const outputIcon = createIconCell({
    rowKey: 'output',
    tooltipId: 'ps-tip-output',
    tooltipText:
      'Mining output rate per token from tracks/events/halvings. Precision: pending.',
  });
  matrix.appendChild(outputIcon.iconCell);
  let tooltipsToMount = [outputIcon];

  // BALANCE ROW
  const balanceLabelCell = createLabelCell({
    rowKey: 'balance',
    labelText: 'Bal',
  });
  matrix.appendChild(balanceLabelCell);

  const balanceNodes = {};
  const balanceCells = {};
  tokenNames.forEach((token) => {
    const cell = document.createElement('div');
    cell.className = 'ps-cell ps-value';
    cell.dataset.row = 'balance';
    cell.dataset.token = token;
    const node = document.createTextNode('-');
    cell.appendChild(node);
    matrix.appendChild(cell);
    balanceNodes[token] = node;
    balanceCells[token] = cell;
  });

  const balanceTotalCell = document.createElement('div');
  balanceTotalCell.className = 'ps-cell ps-value ps-cell-total';
  balanceTotalCell.dataset.row = 'balance';
  const balanceTotalNode = document.createTextNode('-');
  balanceTotalCell.appendChild(balanceTotalNode);
  matrix.appendChild(balanceTotalCell);

  const balanceIcon = createIconCell({
    rowKey: 'balance',
    tooltipId: 'ps-tip-balance',
    tooltipText: 'Current seasonal balances. Precision: pending.',
  });
  matrix.appendChild(balanceIcon.iconCell);
  tooltipsToMount.push(balanceIcon);

  // PRICE ROW
  const priceLabelCell = createLabelCell({
    rowKey: 'price',
    labelText: 'Price',
  });
  matrix.appendChild(priceLabelCell);

  const oraclePriceNodes = {};
  const priceCells = {};
  tokenNames.forEach((token) => {
    const cell = document.createElement('div');
    cell.className = 'ps-cell ps-value';
    cell.dataset.row = 'price';
    cell.dataset.token = token;
    const node = document.createTextNode('-');
    cell.appendChild(node);
    matrix.appendChild(cell);
    oraclePriceNodes[token] = node;
    priceCells[token] = cell;
  });

  const oracleTotalCell = document.createElement('div');
  oracleTotalCell.className = 'ps-cell ps-value ps-cell-total';
  oracleTotalCell.dataset.row = 'price';
  const oracleTotalNode = document.createTextNode('-');
  oracleTotalCell.appendChild(oracleTotalNode);
  matrix.appendChild(oracleTotalCell);

  const priceIcon = createIconCell({
    rowKey: 'price',
    tooltipId: 'ps-tip-price',
    tooltipText:
      'Oracle prices used for conversion and scoring. Precision: pending.',
  });
  matrix.appendChild(priceIcon.iconCell);
  tooltipsToMount.push(priceIcon);

  // FOOTER (single line: "Next halving HH:MM (TOKEN) | Mined XXX | fee X / spread Y" or "No further halvings | Mined XXX | fee X / spread Y")
  const footer = document.createElement('div');
  footer.className = 'ps-footer';

  // Single footer content node
  const footerContentSpan = document.createElement('span');
  footerContentSpan.className = 'ps-footer-content';
  const footerContentNode = document.createTextNode(
    'No further halvings | Mined — | fee — / spread —'
  );
  footerContentSpan.appendChild(footerContentNode);
  footer.appendChild(footerContentSpan);

  const footerIcon = createIconCell({
    rowKey: 'footer',
    tooltipId: 'ps-tip-footer',
    tooltipText:
      'Next Halving: when the next mining reward halves. Mined: total tokens earned so far. Fee: transaction cost to convert between tokens (%). Spread: price gap between oracle buy/sell rates (%).',
  });
  footer.appendChild(footerIcon.iconCell);
  tooltipsToMount.push(footerIcon);

  _playerStateEl.append(matrix, footer);

  // Mount all tooltip bubbles to tooltip-layer for clipping prevention
  const tooltipLayer = document.getElementById('tooltip-layer');
  if (tooltipLayer) {
    tooltipsToMount.forEach((tooltip) => {
      tooltipLayer.appendChild(tooltip.bubble);
    });
  }

  _disposeTooltips = initMicroTooltips(_playerStateEl);

  _disposeTooltips = initMicroTooltips(_playerStateEl);

  _uiRefs.built = true;
  _uiRefs.tokenNamesKey = key;
  _uiRefs.outputRateNodes = outputRateNodes;
  _uiRefs.balanceNodes = balanceNodes;
  _uiRefs.oraclePriceNodes = oraclePriceNodes;
  _uiRefs.outputCells = outputCells;
  _uiRefs.balanceCells = balanceCells;
  _uiRefs.priceCells = priceCells;
  _uiRefs.outputTotalNode = outputTotalNode;
  _uiRefs.balanceTotalNode = balanceTotalNode;
  _uiRefs.oracleTotalNode = oracleTotalNode;
  _uiRefs.outputTotalCell = outputTotalCell;
  _uiRefs.balanceTotalCell = balanceTotalCell;
  _uiRefs.oracleTotalCell = oracleTotalCell;
  _uiRefs.footerContentNode = footerContentNode;
  _uiRefs.tooltipNodes = {
    output: outputIcon.bubbleNode,
    balance: balanceIcon.bubbleNode,
    price: priceIcon.bubbleNode,
    footer: footerIcon.bubbleNode,
  };

  return _uiRefs;
}

function updatePrecisionTooltip(node, label, tokenNames, values) {
  if (!node) return;
  const details = tokenNames
    .map((token) => `${toTokenLabel(token)} ${format4(values?.[token])}`)
    .join(' | ');
  setTextNodeValue(node, `${label} Precision: ${details || 'unavailable'}.`);
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
  const outputRatePerToken = data.output_rate_per_token || null;
  const fallbackRate =
    typeof metrics.output_per_second === 'number'
      ? Number(metrics.output_per_second)
      : calculateCurrentMiningRate(playerState);

  let outputTotal = 0;
  let hasOutput = false;
  tokenNames.forEach((token) => {
    const rawRate = Number(outputRatePerToken?.[token]);
    if (Number.isFinite(rawRate)) {
      hasOutput = true;
      outputTotal += rawRate;
      setCompactNodeValue(
        refs.outputRateNodes[token],
        refs.outputCells[token],
        rawRate
      );
    } else {
      setTextNodeValue(refs.outputRateNodes[token], '-');
    }
  });
  setCompactNodeValue(
    refs.outputTotalNode,
    refs.outputTotalCell,
    hasOutput ? outputTotal : fallbackRate
  );

  let balanceTotal = 0;
  tokenNames.forEach((token) => {
    const rawBalance = Number(balances[token]);
    if (Number.isFinite(rawBalance)) {
      balanceTotal += rawBalance;
      setCompactNodeValue(
        refs.balanceNodes[token],
        refs.balanceCells[token],
        rawBalance
      );
    } else {
      setTextNodeValue(refs.balanceNodes[token], '-');
    }
  });
  setCompactNodeValue(
    refs.balanceTotalNode,
    refs.balanceTotalCell,
    balanceTotal
  );

  let priceTotal = 0;
  let priceCount = 0;
  tokenNames.forEach((token) => {
    const rawPrice = Number(oraclePrices?.[token]);
    if (Number.isFinite(rawPrice)) {
      priceTotal += rawPrice;
      priceCount += 1;
      setCompactNodeValue(
        refs.oraclePriceNodes[token],
        refs.priceCells[token],
        rawPrice
      );
    } else {
      setTextNodeValue(refs.oraclePriceNodes[token], '-');
    }
  });
  const avgPrice = priceCount ? priceTotal / priceCount : null;
  setCompactNodeValue(refs.oracleTotalNode, refs.oracleTotalCell, avgPrice);

  const nextHalvingTarget = resolveNextHalvingTarget({
    data,
    activeGameMeta,
    tokenNames,
  });
  // Build footer content as single line
  let halvinPart = 'No further halvings';
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
        textNode: null, // No separate text node; footer handles halving display
      });
    }
    const nowUnix = Date.now() / 1000;
    const remainingSeconds = Math.max(
      0,
      nextHalvingTarget.halvingAtUnix - nowUnix
    );
    const countdownText = formatCountdownClock(remainingSeconds);
    halvinPart = `Next halving ${countdownText} (${nextHalvingTarget.token.toUpperCase()})`;
  } else {
    stopNextHalvingCountdown();
  }

  const minedPart =
    playerState.cumulative_mined !== undefined
      ? format2(playerState.cumulative_mined)
      : '—';

  const fee = Number(data.conversion_fee_rate);
  const spread = Number(data.oracle_spread);
  const feeSpreadPart = `${format2(fee)} / ${format2(spread)}`;

  // Combine into single footer string
  const footerText = `${halvinPart} | Mined ${minedPart} | fee ${feeSpreadPart}`;
  setTextNodeValue(refs.footerContentNode, footerText);

  const lastHalvingNotice = getLastHalvingNotice();
  if (lastHalvingNotice) {
    setTextNodeValue(
      refs.tooltipNodes.output,
      `Mining output rate per token. Last halving: ${lastHalvingNotice.token.toUpperCase()} halved. Precision: pending.`
    );
  }

  // Update precision tooltips for matrix rows
  updatePrecisionTooltip(
    refs.tooltipNodes.output,
    'Mining output rate per token from tracks/events/halvings.',
    tokenNames,
    outputRatePerToken
  );
  updatePrecisionTooltip(
    refs.tooltipNodes.balance,
    'Current seasonal balances.',
    tokenNames,
    balances
  );
  updatePrecisionTooltip(
    refs.tooltipNodes.price,
    'Oracle prices used for conversion and scoring.',
    tokenNames,
    oraclePrices
  );

  // Update footer tooltip with all details
  setTextNodeValue(
    refs.tooltipNodes.footer,
    `Halving: next mining reward halve | Mined: cumulative tokens earned | Fee: conversion cost (${format4(fee)}%) | Spread: oracle bid-ask gap (${format4(spread)}%)`
  );
}

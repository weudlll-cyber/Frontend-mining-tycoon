/*
File: src/ui/player-view.js
Purpose: Compact player-state matrix renderer with optional non-blocking micro-tooltips.
Constraints: Display-only analytics; backend remains source-of-truth for prices/balances/output.
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
  if (cell) {
    if (full !== '—') {
      cell.dataset.fullValue = full;
      cell.title = full;
    } else {
      delete cell.dataset.fullValue;
      cell.removeAttribute('title');
    }
  }
}

function clearCompactCellValue(textNode, cell) {
  setTextNodeValue(textNode, '-');
  if (cell) {
    delete cell.dataset.fullValue;
    cell.removeAttribute('title');
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
  footerLine1Node: null,
  footerLine2Node: null,
  tooltipNodes: {
    output: null,
    balance: null,
    price: null,
    footer: null,
  },
  thisSessionNode: null,
  bestRoundNode: null,
  thisSessionEl: null,
  bestRoundEl: null,
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
  trigger.textContent = 'ℹ︎';
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
  _uiRefs.footerLine1Node = null;
  _uiRefs.footerLine2Node = null;
  _uiRefs.tooltipNodes = {
    output: null,
    balance: null,
    price: null,
    footer: null,
  };
  _uiRefs.thisSessionNode = null;
  _uiRefs.bestRoundNode = null;
  _uiRefs.thisSessionEl = null;
  _uiRefs.bestRoundEl = null;

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
  outputTotalCell.dataset.token = 'sigma';
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
  balanceTotalCell.dataset.token = 'sigma';
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
  priceLabelCell.classList.add('ps-row-price-label');
  matrix.appendChild(priceLabelCell);

  const oraclePriceNodes = {};
  const priceCells = {};
  tokenNames.forEach((token) => {
    const cell = document.createElement('div');
    cell.className = 'ps-cell ps-value ps-value-price';
    cell.dataset.row = 'price';
    cell.dataset.token = token;
    const node = document.createTextNode('-');
    cell.appendChild(node);
    matrix.appendChild(cell);
    oraclePriceNodes[token] = node;
    priceCells[token] = cell;
  });

  const oracleTotalCell = document.createElement('div');
  oracleTotalCell.className = 'ps-cell ps-value ps-cell-total ps-value-price';
  oracleTotalCell.dataset.row = 'price';
  oracleTotalCell.dataset.token = 'sigma';
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

  // Footer intentionally uses two rows so fee/spread tooltip does not drift onto a wrapped orphan line.
  const footer = document.createElement('div');
  footer.className = 'ps-footer';

  const footerLine1 = document.createElement('div');
  footerLine1.className = 'ps-footer-line ps-footer-line-1';
  const footerLine1Node = document.createTextNode(
    'No further halvings | Mined —'
  );
  footerLine1.appendChild(footerLine1Node);

  const footerLine2 = document.createElement('div');
  footerLine2.className = 'ps-footer-line ps-footer-line-2';
  const footerLine2Node = document.createTextNode('Fee — / —');
  footerLine2.appendChild(footerLine2Node);

  const footerIcon = createIconCell({
    rowKey: 'footer',
    tooltipId: 'ps-tip-footer',
    tooltipText:
      'Next Halving: when the next mining reward halves. Mined: total tokens earned so far. Fee: transaction cost to convert between tokens (%). Spread: price gap between oracle buy/sell rates (%).',
  });
  footerLine2.appendChild(footerIcon.iconCell);
  footer.append(footerLine1, footerLine2);
  tooltipsToMount.push(footerIcon);

  const sessionScores = document.createElement('div');
  sessionScores.className = 'ps-session-scores';

  const thisSessionLine = document.createElement('div');
  thisSessionLine.className = 'ps-session-score-line';
  const thisSessionNode = document.createTextNode('This session: —');
  thisSessionLine.appendChild(thisSessionNode);

  const bestRoundLine = document.createElement('div');
  bestRoundLine.className = 'ps-session-score-line';
  const bestRoundNode = document.createTextNode('Best this round: —');
  bestRoundLine.appendChild(bestRoundNode);

  sessionScores.append(thisSessionLine, bestRoundLine);

  _playerStateEl.append(matrix, sessionScores, footer);

  // Mount all tooltip bubbles to tooltip-layer for clipping prevention
  const tooltipLayer = document.getElementById('tooltip-layer');
  if (tooltipLayer) {
    tooltipsToMount.forEach((tooltip) => {
      tooltipLayer.appendChild(tooltip.bubble);
    });
  }

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
  _uiRefs.footerLine1Node = footerLine1Node;
  _uiRefs.footerLine2Node = footerLine2Node;
  _uiRefs.tooltipNodes = {
    output: outputIcon.bubbleNode,
    balance: balanceIcon.bubbleNode,
    price: priceIcon.bubbleNode,
    footer: footerIcon.bubbleNode,
  };
  _uiRefs.thisSessionNode = thisSessionNode;
  _uiRefs.bestRoundNode = bestRoundNode;
  _uiRefs.thisSessionEl = thisSessionLine;
  _uiRefs.bestRoundEl = bestRoundLine;

  return _uiRefs;
}

function updatePrecisionTooltip(node, label, tokenNames, values) {
  if (!node) return;
  const details = tokenNames
    .map((token) => `${toTokenLabel(token)} ${format4(values?.[token])}`)
    .join(' | ');
  setTextNodeValue(node, `${label} Precision: ${details || 'unavailable'}.`);
}

function formatScoreLineValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { display: '—', exact: '—' };
  }
  const floored = Math.floor(numeric);
  return {
    display: floored.toLocaleString(),
    exact: floored.toLocaleString(),
  };
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
  // Fallback order preserves fresh payload values first, then contract meta defaults, then player-state legacy fields.
  const oraclePrices =
    data.oracle_prices ||
    activeGameMeta?.oracle_prices ||
    playerState.oracle_prices ||
    null;
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
      clearCompactCellValue(
        refs.outputRateNodes[token],
        refs.outputCells[token]
      );
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
      clearCompactCellValue(refs.balanceNodes[token], refs.balanceCells[token]);
    }
  });
  setCompactNodeValue(
    refs.balanceTotalNode,
    refs.balanceTotalCell,
    balanceTotal
  );

  tokenNames.forEach((token) => {
    const rawPrice = Number(oraclePrices?.[token]);
    if (Number.isFinite(rawPrice)) {
      setCompactNodeValue(
        refs.oraclePriceNodes[token],
        refs.priceCells[token],
        rawPrice
      );
    } else {
      clearCompactCellValue(
        refs.oraclePriceNodes[token],
        refs.priceCells[token]
      );
    }
  });
  setTextNodeValue(refs.oracleTotalNode, '—');
  delete refs.oracleTotalCell.dataset.fullValue;
  refs.oracleTotalCell.removeAttribute('title');

  const nextHalvingTarget = resolveNextHalvingTarget({
    data,
    activeGameMeta,
    tokenNames,
  });
  // Build footer content across two deliberate lines to avoid accidental wrapping behavior.
  let halvinPart = 'No further halvings';
  let halvingTooltipPart = 'No further halvings in this round.';
  if (nextHalvingTarget && data?.game_status === 'running') {
    const prev = getHalvingCountdownTarget();
    const shouldReset = shouldResetNextHalvingCountdownTarget(
      prev,
      nextHalvingTarget
    );
    let countdownTarget = nextHalvingTarget;
    if (shouldReset) {
      startNextHalvingCountdown({
        token: nextHalvingTarget.token,
        halvingMonth: nextHalvingTarget.halvingMonth,
        halvingAtUnix: nextHalvingTarget.halvingAtUnix,
        textNode: null, // No separate text node; footer handles halving display
      });
    } else if (prev) {
      // Keep a stable target between payloads so the countdown does not jump.
      countdownTarget = prev;
    }
    const nowUnix = Date.now() / 1000;
    const remainingSeconds = Math.max(
      0,
      countdownTarget.halvingAtUnix - nowUnix
    );
    const countdownText = formatCountdownClock(remainingSeconds);
    halvinPart = `Next halving ${countdownText} (${countdownTarget.token.toUpperCase()})`;
    halvingTooltipPart = `Next halving in ~${countdownText} for ${countdownTarget.token.toUpperCase()} (month ${countdownTarget.halvingMonth}).`;
  } else {
    stopNextHalvingCountdown();

    const lastHalvingNotice = getLastHalvingNotice();
    if (lastHalvingNotice) {
      halvingTooltipPart = `Last halving: ${lastHalvingNotice.token.toUpperCase()} at month ${lastHalvingNotice.halvingMonth}.`;
    }
  }

  const minedPart =
    playerState.cumulative_mined !== undefined
      ? format2(playerState.cumulative_mined)
      : '—';

  const fee = Number(data.conversion_fee_rate);
  const spread = Number(data.oracle_spread);
  const feeSpreadPart = `${format2(fee)} / ${format2(spread)}`;

  const thisSessionScore = formatScoreLineValue(data?.current_session_score);
  const bestRoundScore = formatScoreLineValue(data?.player_best_of_score);
  setTextNodeValue(
    refs.thisSessionNode,
    `This session: ${thisSessionScore.display}`
  );
  setTextNodeValue(
    refs.bestRoundNode,
    `Best this round: ${bestRoundScore.display}`
  );
  refs.thisSessionEl.title = `Exact value: ${thisSessionScore.exact}`;
  refs.bestRoundEl.title = `Exact value: ${bestRoundScore.exact}`;

  setTextNodeValue(refs.footerLine1Node, `${halvinPart} | Mined ${minedPart}`);
  setTextNodeValue(refs.footerLine2Node, `Fee ${feeSpreadPart}`);

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
    `Halving: ${halvingTooltipPart} | Mined: cumulative tokens earned | Fee: conversion cost (${format4(fee)}%) | Spread: oracle bid-ask gap (${format4(spread)}%)`
  );
}

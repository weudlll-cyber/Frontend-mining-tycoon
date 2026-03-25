/**
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
  subscribeHalvingClock,
} from './halving-display.js';
import { initMicroTooltips } from './micro-tooltip.js';

let _playerStateEl = null;
let _getActiveGameMeta = null;
let _disposeTooltips = null;
let _disposeHalvingClock = null;
let _footerClockState = null;
const _sessionScoreState = {
  sessionId: null,
  baselineCumulativeMined: null,
};

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

/** Creates a label cell (left-aligned) for matrix rows. */
function createLabelCell({ rowKey, labelText }) {
  const labelCell = document.createElement('div');
  labelCell.className = 'ps-cell ps-label-cell ps-row-label';
  labelCell.dataset.row = rowKey;

  const text = document.createElement('span');
  text.className = 'ps-label-text';
  text.textContent = labelText;

  labelCell.appendChild(text);

  return {
    labelCell,
    bubble: null,
    bubbleNode: null,
  };
}

function createLabelCellWithTooltip({
  rowKey,
  labelText,
  tooltipId,
  tooltipText,
}) {
  const labelCellState = createLabelCell({ rowKey, labelText });
  const { labelCell } = labelCellState;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ps-tip-trigger ps-row-tip-trigger';
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

  labelCell.appendChild(trigger);

  return {
    labelCell,
    bubble,
    bubbleNode,
  };
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
  _sessionScoreState.sessionId = null;
  _sessionScoreState.baselineCumulativeMined = null;
  _footerClockState = null;

  if (_disposeTooltips) {
    _disposeTooltips();
    _disposeTooltips = null;
  }

  if (_disposeHalvingClock) {
    _disposeHalvingClock();
    _disposeHalvingClock = null;
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

  // Header row: Metric | SPR | SUM | AUT | WIN
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

  // OUTPUT ROW
  const outputLabelState = createLabelCellWithTooltip({
    rowKey: 'output',
    labelText: 'Out/s',
    tooltipId: 'ps-tip-output',
    tooltipText:
      'Mining output rate per token from tracks/events/halvings. Precision: pending.',
  });
  matrix.appendChild(outputLabelState.labelCell);

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

  let tooltipsToMount = [outputLabelState];

  // BALANCE ROW
  const balanceLabelState = createLabelCellWithTooltip({
    rowKey: 'balance',
    labelText: 'Bal',
    tooltipId: 'ps-tip-balance',
    tooltipText: 'Current seasonal balances. Precision: pending.',
  });
  matrix.appendChild(balanceLabelState.labelCell);

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
  tooltipsToMount.push(balanceLabelState);

  // PRICE ROW
  const priceLabelState = createLabelCellWithTooltip({
    rowKey: 'price',
    labelText: 'Price',
    tooltipId: 'ps-tip-price',
    tooltipText:
      'Oracle prices used for conversion and scoring. Precision: pending.',
  });
  priceLabelState.labelCell.classList.add('ps-row-price-label');
  matrix.appendChild(priceLabelState.labelCell);

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
  tooltipsToMount.push(priceLabelState);

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
  thisSessionLine.hidden = true;
  const thisSessionNode = document.createTextNode('This session: —');
  thisSessionLine.appendChild(thisSessionNode);

  const bestRoundLine = document.createElement('div');
  bestRoundLine.className = 'ps-session-score-line';
  bestRoundLine.hidden = true;
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
  _uiRefs.footerLine1Node = footerLine1Node;
  _uiRefs.footerLine2Node = footerLine2Node;
  _uiRefs.tooltipNodes = {
    output: outputLabelState.bubbleNode,
    balance: balanceLabelState.bubbleNode,
    price: priceLabelState.bubbleNode,
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

function normalizeSessionId(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function firstFiniteNumber(candidates) {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function resolveDisplayedSessionScore(data, playerState) {
  const backendScore = firstFiniteNumber([
    data?.current_session_score,
    data?.session?.current_session_score,
    data?.session?.score,
    data?.session?.session_score,
    playerState?.current_session_score,
    playerState?.session_score,
  ]);

  const sessionId = normalizeSessionId(data?.session?.session_id);
  const cumulativeMined = Number(playerState?.cumulative_mined);

  let derivedScore = null;
  if (sessionId && Number.isFinite(cumulativeMined)) {
    const switchedSession = _sessionScoreState.sessionId !== sessionId;
    if (switchedSession) {
      _sessionScoreState.sessionId = sessionId;
      _sessionScoreState.baselineCumulativeMined = cumulativeMined;
    }
    if (!Number.isFinite(_sessionScoreState.baselineCumulativeMined)) {
      _sessionScoreState.baselineCumulativeMined = cumulativeMined;
    }
    derivedScore = Math.max(
      0,
      cumulativeMined - Number(_sessionScoreState.baselineCumulativeMined)
    );
  }

  if (Number.isFinite(backendScore) && backendScore > 0) {
    return backendScore;
  }
  if (Number.isFinite(derivedScore) && derivedScore > 0) {
    return derivedScore;
  }
  if (Number.isFinite(backendScore)) {
    return backendScore;
  }
  return derivedScore;
}

function resolveDisplayedBestRoundScore(data, playerState) {
  return firstFiniteNumber([
    data?.player_best_of_score,
    data?.best_this_round_score,
    data?.best_round_score,
    playerState?.player_best_of_score,
    playerState?.best_this_round_score,
    playerState?.best_round_score,
  ]);
}

function renderFooterHalvingState() {
  if (!_footerClockState) return;

  const { refs, minedPart, fee, spread, lastHalvingNotice } = _footerClockState;
  const countdownTarget = getHalvingCountdownTarget();

  let halvinPart = 'No further halvings';
  let halvingTooltipPart = 'No further halvings in this round.';

  if (countdownTarget) {
    const nowUnix = Date.now() / 1000;
    const remainingSeconds = Math.max(
      0,
      countdownTarget.halvingAtUnix - nowUnix
    );
    const countdownText = formatCountdownClock(remainingSeconds);
    halvinPart = `Next halving ${countdownText} (${countdownTarget.token.toUpperCase()})`;
    halvingTooltipPart = `Next halving in ~${countdownText} for ${countdownTarget.token.toUpperCase()} (month ${countdownTarget.halvingMonth}).`;
  } else if (lastHalvingNotice) {
    halvingTooltipPart = `Last halving: ${lastHalvingNotice.token.toUpperCase()} at month ${lastHalvingNotice.halvingMonth}.`;
  }

  setTextNodeValue(refs.footerLine1Node, `${halvinPart} | Mined ${minedPart}`);
  setTextNodeValue(
    refs.tooltipNodes.footer,
    `Halving: ${halvingTooltipPart} | Mined: cumulative tokens earned | Fee: conversion cost (${format4(fee)}%) | Spread: oracle bid-ask gap (${format4(spread)}%)`
  );
}

function ensurePlayerHalvingClockSubscription() {
  if (_disposeHalvingClock) return;
  _disposeHalvingClock = subscribeHalvingClock(() => {
    renderFooterHalvingState();
  });
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

  tokenNames.forEach((token) => {
    const rawRate = Number(outputRatePerToken?.[token]);
    if (Number.isFinite(rawRate)) {
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

  tokenNames.forEach((token) => {
    const rawBalance = Number(balances[token]);
    if (Number.isFinite(rawBalance)) {
      setCompactNodeValue(
        refs.balanceNodes[token],
        refs.balanceCells[token],
        rawBalance
      );
    } else {
      clearCompactCellValue(refs.balanceNodes[token], refs.balanceCells[token]);
    }
  });

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
        textNode: null, // No separate text node; footer handles halving display
      });
    }
    ensurePlayerHalvingClockSubscription();
  } else {
    stopNextHalvingCountdown();

    if (_disposeHalvingClock) {
      _disposeHalvingClock();
      _disposeHalvingClock = null;
    }
  }

  const minedPart =
    playerState.cumulative_mined !== undefined
      ? format2(playerState.cumulative_mined)
      : '—';

  const fee = Number(data.conversion_fee_rate);
  const spread = Number(data.oracle_spread);
  const feeSpreadPart = `${format2(fee)} / ${format2(spread)}`;

  const isAsyncMode =
    String(data?.scoring_aggregate || '').toLowerCase() === 'best_of';
  if (isAsyncMode) {
    const thisSessionScore = formatScoreLineValue(
      resolveDisplayedSessionScore(data, playerState)
    );
    const bestRoundScore = formatScoreLineValue(
      resolveDisplayedBestRoundScore(data, playerState)
    );
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
    refs.thisSessionEl.hidden = false;
    refs.bestRoundEl.hidden = false;
  } else {
    refs.thisSessionEl.hidden = true;
    refs.bestRoundEl.hidden = true;
  }

  setTextNodeValue(refs.footerLine2Node, `Fee ${feeSpreadPart}`);

  // Update precision tooltips for matrix rows
  updatePrecisionTooltip(
    refs.tooltipNodes.output,
    `Mining output rate per token from tracks/events/halvings. Aggregate fallback: ${format4(fallbackRate)}.`,
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

  _footerClockState = {
    refs,
    minedPart,
    fee,
    spread,
    lastHalvingNotice: getLastHalvingNotice(),
  };
  renderFooterHalvingState();
}

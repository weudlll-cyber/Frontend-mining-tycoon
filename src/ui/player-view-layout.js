/**
File: src/ui/player-view-layout.js
Purpose: Build and mount the player-state matrix layout with stable DOM references.
*/

import { clearNode } from '../utils/dom-utils.js';
import { initMicroTooltips } from './micro-tooltip.js';

const TOKEN_LABELS = {
  spring: 'SPR',
  summer: 'SUM',
  autumn: 'AUT',
  winter: 'WIN',
};

export function toTokenLabel(token) {
  return (
    TOKEN_LABELS[token] ||
    String(token || '')
      .slice(0, 3)
      .toUpperCase()
  );
}

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

export function ensurePlayerStateViewLayout({
  playerStateEl,
  tokenNames,
  uiRefs,
  disposeTooltips,
}) {
  const key = tokenNames.join('|');
  if (uiRefs.built && uiRefs.tokenNamesKey === key) {
    return { refs: uiRefs, disposeTooltips };
  }

  if (disposeTooltips) {
    disposeTooltips();
    disposeTooltips = null;
  }

  clearNode(playerStateEl);

  const matrix = document.createElement('div');
  matrix.className = 'ps-matrix';

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

  playerStateEl.append(matrix, sessionScores, footer);

  const tooltipLayer = document.getElementById('tooltip-layer');
  if (tooltipLayer) {
    tooltipsToMount.forEach((tooltip) => {
      tooltipLayer.appendChild(tooltip.bubble);
    });
  }

  disposeTooltips = initMicroTooltips(playerStateEl);

  uiRefs.built = true;
  uiRefs.tokenNamesKey = key;
  uiRefs.outputRateNodes = outputRateNodes;
  uiRefs.balanceNodes = balanceNodes;
  uiRefs.oraclePriceNodes = oraclePriceNodes;
  uiRefs.outputCells = outputCells;
  uiRefs.balanceCells = balanceCells;
  uiRefs.priceCells = priceCells;
  uiRefs.footerLine1Node = footerLine1Node;
  uiRefs.footerLine2Node = footerLine2Node;
  uiRefs.tooltipNodes = {
    output: outputLabelState.bubbleNode,
    balance: balanceLabelState.bubbleNode,
    price: priceLabelState.bubbleNode,
    footer: footerIcon.bubbleNode,
  };
  uiRefs.thisSessionNode = thisSessionNode;
  uiRefs.bestRoundNode = bestRoundNode;
  uiRefs.thisSessionEl = thisSessionLine;
  uiRefs.bestRoundEl = bestRoundLine;

  return { refs: uiRefs, disposeTooltips };
}

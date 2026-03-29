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
import {
  ensurePlayerStateViewLayout,
  toTokenLabel,
} from './player-view-layout.js';
import {
  formatScoreLineValue,
  resolveDisplayedBestRoundScore,
  resolveDisplayedSessionScore,
} from './player-view-score.js';

let _playerStateEl = null;
let _getActiveGameMeta = null;
let _disposeTooltips = null;
let _disposeHalvingClock = null;
let _footerClockState = null;
const _sessionScoreState = {
  sessionId: null,
  baselineCumulativeMined: null,
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

  if (!_playerStateEl) {
    return;
  }

  clearNode(_playerStateEl);
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = 'Waiting for game data...';
  _playerStateEl.appendChild(placeholder);
}

function ensurePlayerStateView(tokenNames) {
  const { refs, disposeTooltips } = ensurePlayerStateViewLayout({
    playerStateEl: _playerStateEl,
    tokenNames,
    uiRefs: _uiRefs,
    disposeTooltips: _disposeTooltips,
  });
  _disposeTooltips = disposeTooltips;
  return refs;
}

function updatePrecisionTooltip(node, label, tokenNames, values) {
  if (!node) return;
  const details = tokenNames
    .map((token) => `${toTokenLabel(token)} ${format4(values?.[token])}`)
    .join(' | ');
  setTextNodeValue(node, `${label} Precision: ${details || 'unavailable'}.`);
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
      resolveDisplayedSessionScore(data, playerState, _sessionScoreState)
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

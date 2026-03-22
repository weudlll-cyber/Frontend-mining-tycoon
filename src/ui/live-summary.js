/*
File: src/ui/live-summary.js
Purpose: Render top-line score stats and bottom-bar portfolio value.
Role in system:
- Renders compact read-only summary values and session status without changing gameplay state.
Invariants:
- Summary remains backend-driven and display-only.
- Async session state is displayed inline only; no popup affordances.
Security notes:
- Render text only; no untrusted HTML.
Session model relation:
- Renders the visible async session badge in the header summary line.
*/

import {
  normalizeTokenNames,
  formatCompactNumber,
} from '../utils/token-utils.js';
import { setElementTextValue } from '../utils/dom-utils.js';
import { debugLog } from '../utils/debug-log.js';

let _refs = null;
let _getGameMeta = null;
let _defaultTokenNames = [];
let _lastAsyncBadgeStateKey = '';

export function initLiveSummary(deps) {
  _refs = deps;
  _getGameMeta = deps.getGameMeta;
  _defaultTokenNames = Array.isArray(deps.defaultTokenNames)
    ? deps.defaultTokenNames
    : [];

  [
    deps.myScoreEl,
    deps.myRankEl,
    deps.topScoreEl,
    deps.portfolioValueEl,
    deps.thisSessionScoreEl,
    deps.bestRoundScoreEl,
    deps.asyncSessionStatusEl,
  ]
    .filter(Boolean)
    .forEach((element) => element.classList.add('selectable'));
}

function formatScore(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.floor(value).toLocaleString();
}

function formatPortfolioValue(value) {
  if (!Number.isFinite(value)) return '—';
  const { display } = formatCompactNumber(value, {
    decimalsSmall: 2,
    decimalsLarge: 2,
  });
  return display;
}

function formatExactScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return Math.floor(numeric).toLocaleString();
}

export function renderAsyncSessionBadge({
  roundMode = 'sync',
  sessionActive = false,
  sessionSupported = true,
  asyncReady = false,
  asyncAvailability = null,
} = {}) {
  const badgeEl = _refs?.asyncSessionStatusEl;
  if (!badgeEl) return;

  const isAsyncRound = roundMode === 'async';
  if (!isAsyncRound) {
    badgeEl.hidden = true;
    setElementTextValue(badgeEl, 'Async: n/a');
    badgeEl.classList.remove('badge-blue', 'badge-yellow', 'badge-green');
    badgeEl.classList.add('badge-gray');
    const stateKey = 'sync-hidden';
    if (_lastAsyncBadgeStateKey !== stateKey) {
      _lastAsyncBadgeStateKey = stateKey;
      debugLog('async-badge', 'hidden for sync round');
    }
    return;
  }

  badgeEl.hidden = false;
  badgeEl.classList.remove(
    'badge-gray',
    'badge-blue',
    'badge-yellow',
    'badge-green'
  );

  if (sessionActive) {
    setElementTextValue(badgeEl, 'Async: Session Active');
    badgeEl.classList.add('badge-green');
    const stateKey = 'async-active';
    if (_lastAsyncBadgeStateKey !== stateKey) {
      _lastAsyncBadgeStateKey = stateKey;
      debugLog('async-badge', 'rendered active badge', {
        roundMode,
        sessionActive,
      });
    }
    return;
  }

  setElementTextValue(badgeEl, 'Async: Ready');
  badgeEl.classList.add(asyncReady ? 'badge-blue' : 'badge-gray');
  badgeEl.title = sessionSupported
    ? asyncReady
      ? 'Ready to start an async session.'
      : 'Not ready yet. Check async diagnostics chips in setup.'
    : 'Backend session endpoint unavailable.';
  const stateKey = `async-ready-${asyncReady ? 'true' : 'false'}-${JSON.stringify(asyncAvailability || {})}`;
  if (_lastAsyncBadgeStateKey !== stateKey) {
    _lastAsyncBadgeStateKey = stateKey;
    debugLog('async-badge', 'rendered ready badge', {
      asyncReady,
      sessionSupported,
      asyncAvailability,
    });
  }
}

export function renderAsyncScoreLines(data) {
  const thisSessionEl = _refs?.thisSessionScoreEl;
  const bestRoundEl = _refs?.bestRoundScoreEl;
  const wrapperEl = _refs?.asyncScoreLinesEl;
  if (!thisSessionEl || !bestRoundEl || !wrapperEl) return;

  const isAsync =
    String(data?.scoring_aggregate || '').toLowerCase() === 'best_of';
  wrapperEl.hidden = !isAsync;
  if (!isAsync) {
    setElementTextValue(thisSessionEl, 'This session: —');
    setElementTextValue(bestRoundEl, 'Best this round: —');
    thisSessionEl.removeAttribute('title');
    bestRoundEl.removeAttribute('title');
    return;
  }

  const thisSession = Number(data?.current_session_score);
  const bestRound = Number(data?.player_best_of_score);

  setElementTextValue(
    thisSessionEl,
    `This session: ${formatScore(thisSession)}`
  );
  setElementTextValue(
    bestRoundEl,
    `Best this round: ${formatScore(bestRound)}`
  );
  thisSessionEl.title = `Exact value: ${formatExactScore(thisSession)}`;
  bestRoundEl.title = `Exact value: ${formatExactScore(bestRound)}`;
}

export function computePortfolioValue(
  balances,
  oraclePrices,
  tokenNames = _defaultTokenNames
) {
  if (!balances || !oraclePrices) return null;

  const tokens = normalizeTokenNames(tokenNames);
  let total = 0;
  let hasAny = false;

  tokens.forEach((token) => {
    const balance = Number(balances[token]);
    const price = Number(oraclePrices[token]);
    if (!Number.isFinite(balance) || !Number.isFinite(price)) return;
    hasAny = true;
    total += balance * price;
  });

  return hasAny ? total : null;
}

function extractOwnScore(data) {
  const candidates = [
    data?.player_state?.score,
    data?.player_state?.mined,
    data?.player_state?.mined_total,
    data?.player_state?.total_mined,
    data?.score,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

export function renderQuickStats(data) {
  if (!_refs?.myScoreEl || !_refs?.myRankEl || !_refs?.topScoreEl) return;

  const leaderboard = data?.leaderboard_top_5 || data?.leaderboard || [];
  const topScore = leaderboard.length
    ? Number(leaderboard[0]?.score)
    : Number.NaN;

  let ownScore = extractOwnScore(data);
  let ownRank = null;
  if (Array.isArray(leaderboard) && data?.player_id) {
    const ownIndex = leaderboard.findIndex(
      (entry) => String(entry?.player_id || '') === String(data.player_id)
    );
    if (ownIndex >= 0) {
      ownRank = ownIndex + 1;
      const rankedScore = Number(leaderboard[ownIndex]?.score);
      if (!Number.isFinite(ownScore) && Number.isFinite(rankedScore)) {
        ownScore = rankedScore;
      }
    }
  }

  setElementTextValue(_refs.myScoreEl, formatScore(ownScore));
  setElementTextValue(_refs.myRankEl, ownRank ? `#${ownRank}` : '—');
  setElementTextValue(_refs.topScoreEl, formatScore(topScore));
}

export function renderPortfolioValue(data) {
  if (!_refs?.portfolioValueEl) return;
  if (!data) {
    setElementTextValue(_refs.portfolioValueEl, '—');
    _refs.portfolioValueEl.removeAttribute('data-full-value');
    return;
  }

  const activeGameMeta = _getGameMeta?.(String(data.game_id || ''));
  const tokenNames = normalizeTokenNames(
    Array.isArray(data.token_names)
      ? data.token_names
      : activeGameMeta?.token_names
  );
  const balances =
    data?.player_state?.balances || data?.player_state?.tokens || null;
  const oraclePrices =
    activeGameMeta?.oracle_prices || data?.oracle_prices || null;
  const computed = computePortfolioValue(balances, oraclePrices, tokenNames);

  setElementTextValue(_refs.portfolioValueEl, formatPortfolioValue(computed));

  if (Number.isFinite(computed)) {
    const fullFormatted = Number(computed).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    _refs.portfolioValueEl.setAttribute('data-full-value', fullFormatted);
  } else {
    _refs.portfolioValueEl.removeAttribute('data-full-value');
  }
}

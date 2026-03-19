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

let _refs = null;
let _getGameMeta = null;
let _defaultTokenNames = [];

export function initLiveSummary(deps) {
  _refs = deps;
  _getGameMeta = deps.getGameMeta;
  _defaultTokenNames = Array.isArray(deps.defaultTokenNames)
    ? deps.defaultTokenNames
    : [];
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

export function renderAsyncSessionBadge({
  roundMode = 'sync',
  sessionActive = false,
  sessionSupported = true,
} = {}) {
  const badgeEl = _refs?.asyncSessionStatusEl;
  if (!badgeEl) return;

  const isAsyncRound = roundMode === 'async';
  if (!isAsyncRound) {
    badgeEl.hidden = true;
    badgeEl.textContent = 'Async: n/a';
    badgeEl.classList.remove('badge-blue', 'badge-yellow', 'badge-green');
    badgeEl.classList.add('badge-gray');
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
    badgeEl.textContent = 'Async: Session Active';
    badgeEl.classList.add('badge-green');
    return;
  }

  if (!sessionSupported) {
    badgeEl.textContent = 'Async: Legacy View';
    badgeEl.classList.add('badge-yellow');
    return;
  }

  badgeEl.textContent = 'Async: Session Ready';
  badgeEl.classList.add('badge-blue');
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

  _refs.myScoreEl.textContent = formatScore(ownScore);
  _refs.myRankEl.textContent = ownRank ? `#${ownRank}` : '—';
  _refs.topScoreEl.textContent = formatScore(topScore);
}

export function renderPortfolioValue(data) {
  if (!_refs?.portfolioValueEl) return;
  if (!data) {
    _refs.portfolioValueEl.textContent = '—';
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

  _refs.portfolioValueEl.textContent = formatPortfolioValue(computed);

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

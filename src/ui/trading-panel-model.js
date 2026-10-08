/**
 * File: src/ui/trading-panel-model.js
 * Purpose: Pure view-model helpers of the trading panel (trading-panel.js):
 *   token list and labels, balances, conversion preview lookup and the
 *   scoring-mode-aware result section, trading rules and unlock schedule.
 * Role: No DOM access; inputs are the round meta and the board state
 *   (both backend authoritative), outputs are plain values for rendering.
 */

import {
  asNumber,
  formatDurationAbsolute,
  formatDurationCompact,
  formatSignedPercent,
  formatSignedTokens,
  formatTokenName,
  formatTokenUnits,
  normalizeScoringMode,
} from './trading-panel-formatters.js';

export const FALLBACK_TOKENS = ['spring', 'summer', 'autumn', 'winter'];

export function resolveActiveScoringMode(meta, state, getActiveScoringMode) {
  if (typeof getActiveScoringMode === 'function') {
    return normalizeScoringMode(getActiveScoringMode());
  }
  return normalizeScoringMode(state?.scoring_mode || meta?.scoring_mode);
}

export function resolveBalances(state) {
  if (
    state?.player_state?.balances &&
    typeof state.player_state.balances === 'object'
  ) {
    return state.player_state.balances;
  }
  if (state?.balances && typeof state.balances === 'object') {
    return state.balances;
  }
  return null;
}

export function resolveTokenList(meta, state) {
  const balances = resolveBalances(state);
  const balanceKeys = balances
    ? Object.keys(balances)
        .map((token) =>
          String(token || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    : [];
  const hasCanonicalBalanceKeys =
    balanceKeys.length > 0 &&
    balanceKeys.every((token) => FALLBACK_TOKENS.includes(token));

  if (hasCanonicalBalanceKeys) {
    return balanceKeys;
  }

  const candidates = [...balanceKeys];
  if (Array.isArray(meta?.token_names)) {
    candidates.push(...meta.token_names.map((_, index) => String(index)));
  } else if (meta?.token_names && typeof meta.token_names === 'object') {
    candidates.push(...Object.keys(meta.token_names));
  }
  if (!candidates.length) {
    return [...FALLBACK_TOKENS];
  }
  const deduped = [];
  candidates.forEach((token) => {
    const normalized = String(token || '')
      .trim()
      .toLowerCase();
    if (!normalized || deduped.includes(normalized)) return;
    deduped.push(normalized);
  });
  return deduped.length ? deduped : [...FALLBACK_TOKENS];
}

export function resolveTokenLabel(token, meta) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return 'Unknown';

  const tokenNames = meta?.token_names;
  if (Array.isArray(tokenNames)) {
    const index = Number(rawToken);
    if (Number.isInteger(index) && index >= 0 && index < tokenNames.length) {
      return formatTokenName(tokenNames[index]);
    }
  } else if (tokenNames && typeof tokenNames === 'object') {
    const mapped = tokenNames[rawToken];
    if (typeof mapped === 'string' && mapped.trim()) {
      return formatTokenName(mapped);
    }
  }

  return formatTokenName(rawToken);
}

function buildInformationalStockpilePreview(amountInputValue, feeRate) {
  const amount = asNumber(amountInputValue);
  if (amount === null || amount <= 0) {
    return null;
  }

  const safeFeeRate = Math.max(0, asNumber(feeRate) ?? 0);
  const unitsGiven = amount;
  const unitsReceived = amount * (1 - safeFeeRate);
  const feeUnits = unitsGiven - unitsReceived;

  return {
    units_given: unitsGiven,
    units_received: unitsReceived,
    total_tokens_change: -feeUnits,
  };
}

function buildStockpilePreviewFromPairRate(previewData, amountInputValue) {
  const amount = asNumber(amountInputValue);
  if (amount === null || amount <= 0) {
    return null;
  }

  const netToPerFrom = asNumber(previewData?.net_to_per_from);
  if (netToPerFrom === null || netToPerFrom < 0) {
    return null;
  }

  const unitsGiven = amount;
  const unitsReceived = amount * netToPerFrom;
  return {
    units_given: unitsGiven,
    units_received: unitsReceived,
    total_tokens_change: unitsReceived - unitsGiven,
  };
}

export function resolveResultPreview(
  mode,
  previewData,
  amountInputValue,
  feeRate
) {
  if (normalizeScoringMode(mode) !== 'stockpile_total_tokens') {
    return previewData;
  }
  const backendAmountPreview = buildStockpilePreviewFromPairRate(
    previewData,
    amountInputValue
  );
  if (backendAmountPreview) {
    return backendAmountPreview;
  }
  const hasConcreteUnits =
    asNumber(previewData?.units_given) !== null ||
    asNumber(previewData?.units_received) !== null;
  if (hasConcreteUnits) {
    return previewData;
  }
  // In stockpile mode, keep preview responsive to the typed amount.
  return (
    buildInformationalStockpilePreview(amountInputValue, feeRate) || previewData
  );
}

export function resolvePreviewRoot(meta, state, trading) {
  const candidates = [
    state?.conversion_preview,
    state?.trade_preview,
    state?.trading_preview,
    meta?.conversion_preview,
    meta?.trade_preview,
    trading?.preview,
  ];
  return candidates.find((item) => item && typeof item === 'object') || null;
}

export function resolvePreviewForSelection(previewRoot, fromToken, toToken) {
  if (!previewRoot || typeof previewRoot !== 'object') return null;

  const pairKey = `${fromToken}:${toToken}`;
  if (previewRoot.pairs && typeof previewRoot.pairs === 'object') {
    return (
      previewRoot.pairs[pairKey] ||
      previewRoot.pairs[`${fromToken}->${toToken}`] ||
      null
    );
  }
  if (previewRoot.by_pair && typeof previewRoot.by_pair === 'object') {
    return (
      previewRoot.by_pair[pairKey] ||
      previewRoot.by_pair[`${fromToken}->${toToken}`] ||
      null
    );
  }

  return previewRoot;
}

export function buildResultSection(mode, preview) {
  const normalizedMode = normalizeScoringMode(mode);
  const data = preview || {};

  if (normalizedMode === 'power_oracle_weighted') {
    const before = asNumber(data.weighted_score_before);
    const after = asNumber(data.weighted_score_after);
    return {
      primaryLabel: 'Weighted Score Change',
      primaryValue: formatSignedPercent(data.weighted_score_change_pct, 1),
      secondary:
        before !== null && after !== null
          ? `Score: ${before.toFixed(2)} -> ${after.toFixed(2)}`
          : 'Score: -- -> --',
      hint: null,
    };
  }

  if (normalizedMode === 'mining_time_equivalent') {
    const before = asNumber(data.mining_time_before_seconds);
    const after = asNumber(data.mining_time_after_seconds);
    return {
      primaryLabel: 'Mining Time Equivalent Change',
      primaryValue: formatDurationCompact(data.mining_time_change_seconds),
      secondary:
        before !== null && after !== null
          ? `Total: ${formatDurationAbsolute(before)} -> ${formatDurationAbsolute(after)}`
          : 'Total: -- -> --',
      hint: 'Represents how long it would take to mine these holdings from scratch using baseline mining rates.',
    };
  }

  if (normalizedMode === 'efficiency_system_mastery') {
    const before = asNumber(data.efficiency_before);
    const after = asNumber(data.efficiency_after);
    return {
      primaryLabel: 'Efficiency Impact',
      primaryValue: formatSignedPercent(data.efficiency_change_pct, 1),
      secondary:
        before !== null && after !== null
          ? `Score: ${before.toFixed(2)} -> ${after.toFixed(2)}`
          : 'Score: -- -> --',
      hint: 'Efficiency measures improvement quality under the round rules, not asset possession.',
    };
  }

  return {
    primaryLabel: 'Total Tokens Change',
    primaryValue: formatSignedTokens(data.total_tokens_change),
    secondary:
      asNumber(data.units_given) !== null ||
      asNumber(data.units_received) !== null
        ? `Units: -${formatTokenUnits(data.units_given)} -> +${formatTokenUnits(data.units_received)}`
        : 'Units: -- -> --',
    hint: null,
  };
}

export function resolveTradingRules(meta, state) {
  const raw = state?.trading_rules || meta?.trading_rules || null;
  if (!raw || typeof raw !== 'object') {
    return { trade_count: 0, unlock_offsets_seconds: [] };
  }
  const tradeCount = Math.max(0, Math.round(Number(raw.trade_count) || 0));
  const offsets = Array.isArray(raw.unlock_offsets_seconds)
    ? raw.unlock_offsets_seconds
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return {
    trade_count: tradeCount,
    unlock_offsets_seconds: offsets,
  };
}

export function resolveRoundElapsedSeconds(meta, state) {
  const gameDuration = asNumber(meta?.game_duration_seconds);
  const secondsRemaining = asNumber(state?.seconds_remaining);
  if (gameDuration === null || secondsRemaining === null) {
    return 0;
  }
  return Math.max(0, Math.round(gameDuration - secondsRemaining));
}

export function getScheduleStatus(
  index,
  unlockOffset,
  tradesUsed,
  elapsedSeconds
) {
  if (index < tradesUsed) {
    return 'Used';
  }
  if (elapsedSeconds >= unlockOffset) {
    return 'Available now';
  }
  return `Available in ${formatDurationAbsolute(unlockOffset - elapsedSeconds)}`;
}

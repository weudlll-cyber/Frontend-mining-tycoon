/*
File: src/utils/token-utils.js
Purpose: Shared token and pricing helpers for frontend game UI.
Key responsibilities:
- Normalize/validate token name lists to the supported seasonal set.
- Compute cross-token preview costs using oracle ratio, fee, and spread.
Entry points / public functions:
- DEFAULT_TOKEN_NAMES, normalizeTokenNames, computePayCostPreview.
Dependencies:
- None (pure helpers).
Last updated: 2026-03-12
Author/Owner: Frontend Team
*/

export const DEFAULT_TOKEN_NAMES = ['spring', 'summer', 'autumn', 'winter'];

export function normalizeTokenNames(rawTokenNames) {
  if (!Array.isArray(rawTokenNames)) {
    return [...DEFAULT_TOKEN_NAMES];
  }

  const allowed = new Set(DEFAULT_TOKEN_NAMES);
  const seen = new Set();
  const normalized = [];
  rawTokenNames.forEach((token) => {
    if (typeof token !== 'string') return;
    const key = token.trim().toLowerCase();
    if (!allowed.has(key) || seen.has(key)) return;
    normalized.push(key);
    seen.add(key);
  });

  return normalized.length > 0 ? normalized : [...DEFAULT_TOKEN_NAMES];
}

export function computePayCostPreview({
  baseCostTarget,
  targetToken,
  payToken,
  oraclePrices,
  feeRate,
  spreadRate,
  upgradeCostMultiplier,
}) {
  if (!Number.isFinite(baseCostTarget) || baseCostTarget < 0) {
    return null;
  }

  const costMultiplier =
    Number.isFinite(Number(upgradeCostMultiplier)) &&
    Number(upgradeCostMultiplier) > 0
      ? Number(upgradeCostMultiplier)
      : 1;
  const effectiveBaseCostTarget = baseCostTarget * costMultiplier;

  if (targetToken === payToken) {
    return {
      baseCost: Math.ceil(effectiveBaseCostTarget),
      payCost: Math.ceil(effectiveBaseCostTarget),
      ratio: 1,
    };
  }

  const pTarget = Number(oraclePrices?.[targetToken]);
  const pPay = Number(oraclePrices?.[payToken]);
  if (
    !Number.isFinite(pTarget) ||
    !Number.isFinite(pPay) ||
    pTarget <= 0 ||
    pPay <= 0
  ) {
    return null;
  }

  const fee = Number.isFinite(Number(feeRate)) ? Number(feeRate) : 0;
  const spread = Number.isFinite(Number(spreadRate)) ? Number(spreadRate) : 0;
  const ratio = pTarget / pPay;
  const payCost = Math.ceil(
    effectiveBaseCostTarget * ratio * (1 + fee + spread)
  );

  return {
    baseCost: Math.ceil(effectiveBaseCostTarget),
    payCost,
    ratio,
  };
}

/**
 * Format a number for compact display with k/M/B suffixes.
 * Returns { display, full } where display is the compact format and full is the uncompressed value.
 *
 * @param {number} value - The number to format
 * @param {object} options - Formatting options
 * @param {number} options.decimalsSmall - Decimals for values < 1M (default: 2)
 * @param {number} options.decimalsLarge - Decimals for values >= 1M (default: 2)
 * @returns {{ display: string, full: string }} - Object with display (compact) and full (uncompressed) strings
 */
export function formatCompactNumber(
  value,
  { decimalsSmall = 2, decimalsLarge = 2 } = {}
) {
  const num = Number(value);

  // Handle invalid/edge cases
  if (!Number.isFinite(num)) {
    return { display: '—', full: '—' };
  }

  const abs = Math.abs(num);
  const isNegative = num < 0 ? '-' : '';

  // Format full value with locale
  const fullFormatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(decimalsSmall, decimalsLarge),
  });

  // Below 1000, show as-is with decimalsSmall precision
  if (abs < 1000) {
    const display = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimalsSmall,
    });
    return { display, full: fullFormatted };
  }

  // 1000 to 999,999 -> k
  if (abs < 1_000_000) {
    const compact = (num / 1000).toFixed(decimalsSmall);
    return {
      display: `${isNegative}${compact}k`,
      full: fullFormatted,
    };
  }

  // 1M to 999M -> M
  if (abs < 1_000_000_000) {
    const compact = (num / 1_000_000).toFixed(decimalsLarge);
    return {
      display: `${isNegative}${compact}M`,
      full: fullFormatted,
    };
  }

  // 1B to 999B -> B
  if (abs < 1_000_000_000_000) {
    const compact = (num / 1_000_000_000).toFixed(decimalsLarge);
    return {
      display: `${isNegative}${compact}B`,
      full: fullFormatted,
    };
  }

  // 1T+ -> T
  const compact = (num / 1_000_000_000_000).toFixed(decimalsLarge);
  return {
    display: `${isNegative}${compact}T`,
    full: fullFormatted,
  };
}

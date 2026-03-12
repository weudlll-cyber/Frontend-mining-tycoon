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

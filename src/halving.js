/*
File: src/halving.js
Purpose: Pure halving timeline helpers shared by frontend rendering and tests.
Key responsibilities:
- Define deterministic halving constants and token offsets.
- Compute current/next halving boundaries and display windows.
- Derive short-lived last-halving notice updates without side effects.
Entry points / public functions:
- computeTokenHalvingCount, computeCurrentHalvingMonth, shouldShowTokenHalvingIndicator,
  computeMostRecentPastHalving, halvingKey, deriveLastHalvingNoticeUpdate.
Dependencies:
- None (pure module).
Last updated: 2026-03-12
Author/Owner: Frontend Team
*/

export const HALVING_INTERVAL_MONTHS = 36;
export const HALVING_DISPLAY_WINDOW_MONTHS = 1;
export const HALVING_BASE_OFFSETS = {
  spring: 0,
  summer: 9,
  autumn: 18,
  winter: 27,
};
export const LAST_HALVING_NOTICE_SECONDS = 8;

export function computeTokenHalvingCount(token, currentSimMonth) {
  const month = Number(currentSimMonth);
  const offset = HALVING_BASE_OFFSETS[token];
  if (!Number.isFinite(month) || offset === undefined) return 0;
  if (month <= offset) return 0;

  const epsilon = 0.0000001;
  const halvingCount =
    Math.floor((month - offset - epsilon) / HALVING_INTERVAL_MONTHS) + 1;
  return Math.max(0, halvingCount);
}

export function computeCurrentHalvingMonth(token, currentSimMonth) {
  const offset = HALVING_BASE_OFFSETS[token];
  if (offset === undefined) return null;

  const halvingCount = computeTokenHalvingCount(token, currentSimMonth);
  if (halvingCount <= 0) return null;

  // halvingCount is one-based, so the currently active halving month uses (count - 1).
  return offset + (halvingCount - 1) * HALVING_INTERVAL_MONTHS;
}

export function shouldShowTokenHalvingIndicator(token, currentSimMonth) {
  const month = Number(currentSimMonth);
  if (!Number.isFinite(month)) return false;

  const halvingMonth = computeCurrentHalvingMonth(token, month);
  if (!Number.isFinite(halvingMonth)) return false;

  return (
    month >= halvingMonth &&
    month < halvingMonth + HALVING_DISPLAY_WINDOW_MONTHS
  );
}

export function computeMostRecentPastHalving({
  currentSimMonth,
  tokenNames,
  simMonthsTotal,
}) {
  const month = Number(currentSimMonth);
  if (!Number.isFinite(month)) return null;
  const totalMonths =
    Number.isFinite(Number(simMonthsTotal)) && Number(simMonthsTotal) > 0
      ? Number(simMonthsTotal)
      : null;

  const candidates = [];
  tokenNames.forEach((token) => {
    const offset = HALVING_BASE_OFFSETS[token];
    if (offset === undefined) return;
    if (month < offset) return;

    const n = Math.floor((month - offset) / HALVING_INTERVAL_MONTHS);
    const halvingMonth = offset + n * HALVING_INTERVAL_MONTHS;

    if (halvingMonth > month) return;
    if (totalMonths !== null && halvingMonth >= totalMonths) return;

    candidates.push({ token, halvingMonth });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.halvingMonth - a.halvingMonth);
  return candidates[0];
}

export function halvingKey(halving) {
  if (!halving) return null;
  return `${halving.token}:${halving.halvingMonth}`;
}

export function deriveLastHalvingNoticeUpdate({
  previousSeenKey,
  previousNotice,
  mostRecentPastHalving,
  nowUnix,
}) {
  const nextKey = halvingKey(mostRecentPastHalving);
  if (!nextKey || nextKey === previousSeenKey) {
    return {
      seenKey: previousSeenKey,
      notice: previousNotice,
      changed: false,
    };
  }

  return {
    seenKey: nextKey,
    notice: {
      token: mostRecentPastHalving.token,
      halvingMonth: mostRecentPastHalving.halvingMonth,
      detectedAtUnix: nowUnix,
    },
    changed: true,
  };
}

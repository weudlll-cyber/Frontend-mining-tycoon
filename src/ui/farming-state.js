/**
File: src/ui/farming-state.js
Purpose: Pure helpers for Farming Stage 1 (passive farming): normalize the
  backend `farming` block, format its rule values, merge farm action results
  into the board state and compute holdings (spendable + farmed).
Role in system:
- Upstream: `/games/{id}/meta` `farming: {enabled, min_duration_seconds,
  reward_rate}` and the `/state` / SSE player payload `farming` block (same
  fields plus `positions` per token), and the `updated_state` returned by
  POST .../farm/deposit and .../farm/withdraw.
- Downstream: src/ui/farming-panel.js (Farm tab + action-bar pill),
  src/ui/player-view.js (farmed line) and src/ui/live-summary.js (holdings
  value), wired in src/main.js.
Constraints:
- Display only: rewards, cycles and countdowns come from the backend; the
  frontend never computes rewards (LOCKED_DECISIONS §A).
- Backward-safe: a payload without `farming` (older backend) normalizes to
  "not enabled" with no positions, so the Farm tab shows its status text.
Security notes: pure data handling, no DOM or network access.
*/

const FARMING_TOKENS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePosition(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const amount = toFiniteNumber(source.amount);
  const next = toFiniteNumber(source.next_reward_in_seconds);
  const cycles = toFiniteNumber(source.cycles_completed);
  return {
    amount: amount !== null && amount > 0 ? amount : 0,
    // null = no running cycle (nothing farmed for this token).
    next_reward_in_seconds:
      next !== null ? Math.max(0, Math.round(next)) : null,
    cycles_completed: cycles !== null ? Math.max(0, Math.round(cycles)) : 0,
  };
}

/**
 * Raw `farming` block of a board state: top-level first (contract), then the
 * player_state copy some payloads (farm action `updated_state`) carry.
 */
export function resolveRawFarming(state) {
  if (isPlainObject(state?.farming)) return state.farming;
  if (isPlainObject(state?.player_state?.farming)) {
    return state.player_state.farming;
  }
  return null;
}

/**
 * Effective farming capability for the board: the live state block wins
 * (it carries positions), the round meta fills missing rule fields.
 * @returns {{ enabled: boolean, min_duration_seconds: number|null,
 *   reward_rate: number|null, positions: Record<string, object> }}
 */
export function normalizeFarming(meta, state) {
  const fromState = resolveRawFarming(state);
  const fromMeta = isPlainObject(meta?.farming) ? meta.farming : null;
  const pick = (key) => {
    if (fromState && fromState[key] !== undefined) return fromState[key];
    return fromMeta ? fromMeta[key] : undefined;
  };

  const minDuration = toFiniteNumber(pick('min_duration_seconds'));
  const rewardRate = toFiniteNumber(pick('reward_rate'));
  const rawPositions = isPlainObject(fromState?.positions)
    ? fromState.positions
    : {};
  const positions = {};
  Object.entries(rawPositions).forEach(([token, raw]) => {
    const key = String(token || '')
      .trim()
      .toLowerCase();
    if (key) positions[key] = normalizePosition(raw);
  });

  return {
    enabled: pick('enabled') === true,
    min_duration_seconds:
      minDuration !== null && minDuration > 0 ? Math.round(minDuration) : null,
    reward_rate: rewardRate !== null && rewardRate >= 0 ? rewardRate : null,
    positions,
  };
}

/** Position for a token, or an empty position when nothing is farmed. */
export function getFarmPosition(farming, token) {
  return farming?.positions?.[token] || normalizePosition(null);
}

/** Farmed amount per token from a board state (empty object without farming). */
export function resolveFarmedAmounts(state) {
  const raw = resolveRawFarming(state);
  const result = {};
  if (!isPlainObject(raw?.positions)) return result;
  Object.entries(raw.positions).forEach(([token, position]) => {
    const amount = normalizePosition(position).amount;
    if (amount > 0) result[String(token).toLowerCase()] = amount;
  });
  return result;
}

/**
 * Holdings per token = spendable balance + farmed amount. Farmed tokens still
 * belong to the player and count toward stockpile/power/mining-time scores,
 * so any "holdings" value must include them. Returns null without balances.
 */
export function resolveHoldings(state) {
  const balances =
    state?.player_state?.balances || state?.player_state?.tokens || null;
  if (!isPlainObject(balances)) return null;
  const farmed = resolveFarmedAmounts(state);
  if (!Object.keys(farmed).length) return balances;
  const holdings = { ...balances };
  Object.entries(farmed).forEach(([token, amount]) => {
    const base = toFiniteNumber(holdings[token]) ?? 0;
    holdings[token] = base + amount;
  });
  return holdings;
}

/**
 * Merge a farm action response (`updated_state`) into the board state.
 * Accepts either a full state (has `player_state`) or a player state like the
 * trade endpoint returns; a `farming` block in it replaces the positions while
 * the round rules already on the board are kept.
 */
export function mergeFarmUpdatedState(previous, updatedState) {
  const prev = isPlainObject(previous) ? previous : {};
  if (!isPlainObject(updatedState)) return prev;

  if (isPlainObject(updatedState.player_state)) {
    return { ...prev, ...updatedState };
  }

  const next = { ...prev, player_state: updatedState };
  if (isPlainObject(updatedState.farming)) {
    next.farming = {
      ...(isPlainObject(prev.farming) ? prev.farming : {}),
      ...updatedState.farming,
    };
  }
  return next;
}

/** Compact human duration: 45s, 5m, 1m 30s, 2h 15m, 3d 4h. */
export function formatFarmDuration(seconds) {
  const numeric = toFiniteNumber(seconds);
  if (numeric === null) return '--';
  const total = Math.max(0, Math.round(numeric));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const join = (major, majorUnit, minor, minorUnit) =>
    minor > 0
      ? `${major}${majorUnit} ${minor}${minorUnit}`
      : `${major}${majorUnit}`;
  if (days > 0) return join(days, 'd', hours, 'h');
  if (hours > 0) return join(hours, 'h', minutes, 'm');
  if (minutes > 0) return join(minutes, 'm', secs, 's');
  return `${secs}s`;
}

/** Reward rate as percent text without float noise (0.05 -> "5%"). */
export function formatRewardPercent(rate) {
  const numeric = toFiniteNumber(rate);
  if (numeric === null) return '--';
  return `${Number((numeric * 100).toFixed(4))}%`;
}

/** Token keys to show in the Farm tab: balances first, canonical fallback. */
export function resolveFarmTokens(state) {
  const balances = state?.player_state?.balances;
  const keys = isPlainObject(balances)
    ? Object.keys(balances).map((key) => key.toLowerCase())
    : [];
  return keys.length ? keys : [...FARMING_TOKENS];
}

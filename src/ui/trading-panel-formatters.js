// Pure formatting and normalization helpers for the trading panel UI.
import { formatDuration } from '../utils/duration-format.js';

const DEFAULT_SCORING_MODE = 'stockpile_total_tokens';

export function normalizeScoringMode(rawMode) {
  const mode = String(rawMode || '')
    .trim()
    .toLowerCase();
  if (!mode) return DEFAULT_SCORING_MODE;
  if (mode === 'stockpile_total_tokens' || mode === 'stockpile') {
    return 'stockpile_total_tokens';
  }
  if (
    mode === 'power_oracle_weighted' ||
    mode === 'power' ||
    mode === 'oracle_weighted'
  ) {
    return 'power_oracle_weighted';
  }
  if (mode === 'mining_time_equivalent' || mode === 'mining_time') {
    return 'mining_time_equivalent';
  }
  if (mode === 'efficiency_system_mastery' || mode === 'efficiency') {
    return 'efficiency_system_mastery';
  }
  return DEFAULT_SCORING_MODE;
}

export function formatScoringModeName(mode) {
  const normalized = normalizeScoringMode(mode);
  if (normalized === 'power_oracle_weighted') return 'Power Mode';
  if (normalized === 'mining_time_equivalent') {
    return 'Mining Time Equivalent Mode';
  }
  if (normalized === 'efficiency_system_mastery') return 'Efficiency Mode';
  return 'Stockpile Mode';
}

export function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedNumber(value, decimals = 2) {
  const numeric = asNumber(value);
  if (numeric === null) return '--';
  const abs = Math.abs(numeric).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '+/-';
  return `${sign}${abs}`;
}

export function formatSignedPercent(value, decimals = 1) {
  const numeric = asNumber(value);
  if (numeric === null) return '--';
  return `${formatSignedNumber(numeric, decimals)}%`;
}

export function formatTokenUnits(value) {
  const numeric = asNumber(value);
  if (numeric === null) return '--';
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatSignedTokens(value) {
  const numeric = asNumber(value);
  if (numeric === null) return '--';
  return `${formatSignedNumber(numeric, 0)} tokens`;
}

// Trading durations always show two units: "1h 5m" or "0m 42s".
const TRADING_DURATION = Object.freeze({
  largest: 'h',
  minLeading: 'm',
  round: 'round',
  fallback: '--',
});

/** Signed duration change: "+1h 5m", "-0m 42s". */
export function formatDurationCompact(seconds) {
  return formatDuration(seconds, { ...TRADING_DURATION, signed: true });
}

export function formatDurationAbsolute(seconds) {
  return formatDuration(seconds, TRADING_DURATION);
}

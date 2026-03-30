// Pure formatting and normalization helpers for the trading panel UI.
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

export function formatTokenName(token) {
  const text = String(token || '').trim();
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatSignedNumber(value, decimals = 2) {
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

export function formatDurationCompact(seconds) {
  const numeric = asNumber(seconds);
  if (numeric === null) return '--';
  const sign = numeric < 0 ? '-' : '+';
  const total = Math.max(0, Math.round(Math.abs(numeric)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${sign}${hours}h ${minutes}m`;
  }
  return `${sign}${minutes}m ${secs}s`;
}

export function formatDurationAbsolute(seconds) {
  const numeric = asNumber(seconds);
  if (numeric === null) return '--';
  const total = Math.max(0, Math.round(numeric));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

/**
File: src/utils/score-format.js
Purpose: Format backend-authoritative scores per scoring mode.
Backend contract:
- Scores (leaderboard `score`, SSE `leaderboard_top_5[].score`, `player_best_of_score`,
  `current_session_score`) are integers, except in Efficiency mode where they are
  floats with 4 decimals relative to baseline (1.0 = baseline).
- A missing scoring_mode means Stockpile.
Notes: Display-only; never recomputes scores.
*/

const EFFICIENCY_MODES = new Set(['efficiency', 'efficiency_system_mastery']);

export function isEfficiencyScoringMode(scoringMode) {
  return EFFICIENCY_MODES.has(
    String(scoringMode || '')
      .trim()
      .toLowerCase()
  );
}

/**
 * @param {unknown} value - backend score
 * @param {string | null | undefined} scoringMode - backend or canonical mode name
 * @param {{ grouping?: boolean }} [options] - thousands separators for integers
 * @returns {string} "1.2345×" for efficiency, integer text otherwise, "—" when missing
 */
export function formatBackendScore(
  value,
  scoringMode,
  { grouping = true } = {}
) {
  const numeric = Number(value);
  if (value === null || value === undefined || !Number.isFinite(numeric)) {
    return '—';
  }
  if (isEfficiencyScoringMode(scoringMode)) {
    return `${numeric.toFixed(4)}×`;
  }
  const integer = Math.floor(numeric);
  return grouping ? integer.toLocaleString('en-US') : String(integer);
}

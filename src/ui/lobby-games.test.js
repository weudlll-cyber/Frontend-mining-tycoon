import { describe, expect, it } from 'vitest';
import {
  buildGameStatusBadge,
  formatDurationLabel,
  normalizeGameItem,
} from './lobby-games.js';

describe('lobby-games helpers', () => {
  it('formats short durations', () => {
    expect(formatDurationLabel(43)).toBe('43s');
    expect(formatDurationLabel(125)).toBe('2m 05s');
  });

  it('formats long durations', () => {
    expect(formatDurationLabel(3700)).toBe('1h 01m');
  });

  it('normalizes enrolling game payloads', () => {
    const normalized = normalizeGameItem({
      game_id: 'game-1',
      game_status: 'enrolling',
      round_type: 'asynchronous',
      scoring_mode: 'stockpile',
      trade_count: 4,
      players_count: 3,
      enrollment_remaining_seconds: 100,
    });

    expect(normalized.gameId).toBe('game-1');
    expect(normalized.status).toBe('enrolling');
    expect(normalized.roundTypeLabel).toBe('Async');
    expect(normalized.scoringModeLabel).toBe('Scoring stockpile');
    expect(normalized.tradeCountLabel).toBe('Trades 4');
    expect(normalized.playersCount).toBe(3);
    expect(normalized.remainingLabel).toContain('Starts in');
  });

  it('returns robust fallback badge for unknown statuses', () => {
    expect(buildGameStatusBadge('mystery')).toEqual({
      text: 'Unknown',
      className: 'game-badge badge-unknown',
    });
  });
});

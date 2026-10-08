import { describe, expect, it } from 'vitest';
import {
  buildGameStatusBadge,
  formatDurationLabel,
  formatOpensInLabel,
  normalizeGameItem,
  readGameStatus,
  resolveOpensAtMs,
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
    // Older backends (or anonymous calls) send no my_player_id.
    expect(normalized.myPlayerId).toBe('');
  });

  it('keeps the linked player id from my_player_id', () => {
    expect(
      normalizeGameItem({ game_id: 'g', my_player_id: 12 }).myPlayerId
    ).toBe('12');
    expect(
      normalizeGameItem({ game_id: 'g', my_player_id: null }).myPlayerId
    ).toBe('');
  });

  it('returns robust fallback badge for unknown statuses', () => {
    expect(buildGameStatusBadge('mystery')).toEqual({
      text: 'Unknown',
      className: 'game-badge badge-unknown',
    });
  });

  it('normalizes scheduled rounds (status field, opening time, labels)', () => {
    const nowMs = 1_800_000_000_000;
    const game = normalizeGameItem(
      {
        game_id: 's1',
        status: 'scheduled',
        scheduled_start_at: 1_800_003_900,
        opens_in_seconds: 3900,
      },
      nowMs
    );
    expect(game.status).toBe('scheduled');
    expect(game.isScheduled).toBe(true);
    expect(game.opensAtMs).toBe(nowMs + 3_900_000);
    expect(game.remainingLabel).toBe('opens in 1 h 05 min');
    expect(game.startLabel).toMatch(/^Starts /);
    expect(buildGameStatusBadge('scheduled')).toEqual({
      text: 'Scheduled',
      className: 'game-badge badge-scheduled',
    });

    // Only scheduled_start_at: the start time is still shown.
    const fromStart = normalizeGameItem(
      {
        game_id: 's2',
        game_status: 'scheduled',
        scheduled_start_at: 1_800_000_600,
      },
      nowMs
    );
    expect(fromStart.opensAtMs).toBe(1_800_000_600_000);
    expect(fromStart.remainingLabel).toBe('opens in 10 min');

    // Only opens_in_seconds: the start time is derived from it.
    const fromOpensIn = normalizeGameItem(
      { game_id: 's3', status: 'scheduled', opens_in_seconds: 60 },
      nowMs
    );
    expect(fromOpensIn.startLabel).toMatch(/^Starts /);

    // Neither: still listed, without a countdown.
    const unknown = normalizeGameItem({ game_id: 's4', status: 'scheduled' });
    expect(unknown.opensAtMs).toBeNull();
    expect(unknown.startLabel).toBe('');
    expect(unknown.remainingLabel).toBe('Opens soon');

    // Today's rounds are unaffected.
    expect(
      normalizeGameItem({ game_id: 'x', game_status: 'running' })
    ).toMatchObject({
      isScheduled: false,
      opensAtMs: null,
      startLabel: '',
    });
  });

  it('reads game_status first and falls back to status', () => {
    expect(
      readGameStatus({ game_status: 'running', status: 'scheduled' })
    ).toBe('running');
    expect(readGameStatus({ status: 'SCHEDULED' })).toBe('scheduled');
    expect(readGameStatus({})).toBe('unknown');
  });

  it('resolves the opening time and the countdown label', () => {
    expect(resolveOpensAtMs({ opens_in_seconds: -5 }, 1000)).toBe(1000);
    expect(resolveOpensAtMs({ opens_in_seconds: null }, 1000)).toBeNull();
    expect(resolveOpensAtMs({ opens_in_seconds: 'x' }, 1000)).toBeNull();
    expect(formatOpensInLabel(5000, 1000)).toBe('opens in 4 s');
    expect(formatOpensInLabel(1000, 5000)).toBe('opening now');
  });
});

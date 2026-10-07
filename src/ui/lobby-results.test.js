/**
 * File: src/ui/lobby-results.test.js
 * Purpose: Verify the pure history/results formatters and DOM builders used by
 *          the lobby "My results" dialog and the server-backed last-game panel.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildHistoryItem,
  buildResultsList,
  buildServerLastGameSnapshot,
  findOwnResultIndex,
  formatFinishedAt,
  formatResultsSummary,
  formatRoundTypeLabel,
  formatScoringModeLabel,
} from './lobby-results.js';

const RESULTS = {
  game_id: 42,
  finished_at: 1760000000,
  scoring_mode: 'efficiency',
  round_type: 'synchronous',
  participants: 3,
  results: [
    { rank: 1, player_id: 7, player_name: 'Alice', score: 1.23456 },
    { rank: 2, player_id: 8, player_name: 'Weudl', score: 1.1 },
    { rank: 3, player_id: 9, player_name: 'Bob', score: 0.9 },
  ],
};

describe('lobby results formatters', () => {
  it('labels scoring modes (short, canonical, missing, unknown)', () => {
    expect(formatScoringModeLabel('power')).toBe('Power');
    expect(formatScoringModeLabel('mining_time_equivalent')).toBe(
      'Mining Time'
    );
    expect(formatScoringModeLabel(undefined)).toBe('Stockpile');
    expect(formatScoringModeLabel('custom')).toBe('custom');
  });

  it('labels round types', () => {
    expect(formatRoundTypeLabel('asynchronous')).toBe('Async round');
    expect(formatRoundTypeLabel('sync')).toBe('Sync round');
    expect(formatRoundTypeLabel(null)).toBe('Round');
  });

  it('formats unix seconds and guards missing values', () => {
    expect(formatFinishedAt(1760000000)).toContain('2025');
    expect(formatFinishedAt(null)).toBe('—');
    expect(formatFinishedAt('x')).toBe('—');
  });

  it('summarizes a results payload', () => {
    const summary = formatResultsSummary(RESULTS);
    expect(summary).toContain('Sync round • Efficiency • 3 players');
    expect(formatResultsSummary({ participants: 1 })).toContain('1 player');
    expect(formatResultsSummary({})).not.toContain('player');
  });
});

describe('history rows', () => {
  it('renders rank of participants, name, score and meta as text', () => {
    const onFullResults = vi.fn();
    const item = {
      game_id: 42,
      finished_at: 1760000000,
      round_type: 'asynchronous',
      scoring_mode: 'stockpile',
      rank: 2,
      participants: 5,
      score: 12345,
      player_name: '<img src=x onerror=alert(1)>',
    };
    const row = buildHistoryItem(item, { onFullResults });

    expect(row.dataset.gameId).toBe('42');
    expect(row.querySelector('.history-rank').textContent).toBe('#2 of 5');
    expect(row.querySelector('.history-score').textContent).toBe('12,345');
    expect(row.querySelector('.history-name').textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(row.querySelector('img')).toBeNull();
    expect(row.querySelector('.history-meta').textContent).toContain(
      'Async round • Stockpile'
    );

    row.querySelector('.history-full-results-btn').click();
    expect(onFullResults).toHaveBeenCalledWith(item);
  });

  it('falls back for missing fields', () => {
    const row = buildHistoryItem({ rank: 'x' });
    expect(row.dataset.gameId).toBe('');
    expect(row.querySelector('.history-rank').textContent).toBe('#?');
    expect(row.querySelector('.history-name').textContent).toBe('Player');
    expect(row.querySelector('.history-score').textContent).toBe('—');
    // No callback: clicking must not throw.
    row.querySelector('button').click();
  });
});

describe('full results list', () => {
  it('finds the own row by player id, else by name + rank', () => {
    const rows = RESULTS.results;
    expect(findOwnResultIndex(rows, { playerId: 9 })).toBe(2);
    expect(findOwnResultIndex(rows, { playerName: 'Weudl', rank: 2 })).toBe(1);
    expect(findOwnResultIndex(rows, { playerName: 'Weudl', rank: 1 })).toBe(-1);
    expect(findOwnResultIndex(rows, {})).toBe(-1);
    expect(findOwnResultIndex(null)).toBe(-1);
  });

  it('renders every row with efficiency scores and highlights the own row', () => {
    const list = buildResultsList(RESULTS, { playerId: '8' });
    const items = list.querySelectorAll('.results-item');
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('.results-score').textContent).toBe(
      '1.2346×'
    );
    expect(items[1].classList.contains('is-own')).toBe(true);
    expect(items[1].getAttribute('aria-current')).toBe('true');
    expect(list.querySelectorAll('.is-own')).toHaveLength(1);
  });

  it('tolerates a payload without results or names', () => {
    expect(buildResultsList({}).children).toHaveLength(0);
    const list = buildResultsList({ results: [{ score: 5 }] });
    expect(list.querySelector('.results-rank').textContent).toBe('#1');
    expect(list.querySelector('.results-name').textContent).toBe('Player');
  });
});

describe('server last-game snapshot', () => {
  it('keeps the top 5 in the local snapshot shape', () => {
    const results = Array.from({ length: 7 }, (_, index) => ({
      rank: index + 1,
      player_name: `P${index + 1}`,
      score: 100 - index,
    }));
    const snapshot = buildServerLastGameSnapshot({
      game_id: 3,
      scoring_mode: 'power',
      results,
    });
    expect(snapshot.gameId).toBe('3');
    expect(snapshot.scoringModeLabel).toBe('Power Mode');
    expect(snapshot.leaderboard).toHaveLength(5);
    expect(snapshot.leaderboard[0]).toEqual({
      rank: 1,
      name: 'P1',
      score: '100',
    });
  });

  it('returns null without a game id and fills missing row fields', () => {
    expect(buildServerLastGameSnapshot({ results: [] })).toBeNull();
    const snapshot = buildServerLastGameSnapshot({
      game_id: 'g',
      results: [{}],
    });
    expect(snapshot.leaderboard[0]).toEqual({
      rank: 1,
      name: 'Player',
      score: '—',
    });
    expect(buildServerLastGameSnapshot({ game_id: 'g' }).leaderboard).toEqual(
      []
    );
  });
});

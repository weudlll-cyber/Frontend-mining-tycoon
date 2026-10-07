/**
File: src/ui/leaderboard.test.js
Purpose: Verify leaderboard rendering uses backend-authoritative score values.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import { initLeaderboard, renderLeaderboard } from './leaderboard.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="leaderboard"></div>';
  initLeaderboard({ leaderboardEl: document.getElementById('leaderboard') });
});

describe('leaderboard renderer', () => {
  it('renders backend score values without client-side aggregation', () => {
    renderLeaderboard({
      leaderboard: [
        { player_id: 2, name: 'B', score: 1500 },
        { player_id: 1, name: 'A', score: 2000 },
      ],
    });

    const rows = Array.from(document.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.leaderboard-score')?.textContent).toBe(
      '1500'
    );
    expect(rows[1].querySelector('.leaderboard-score')?.textContent).toBe(
      '2000'
    );
  });

  it('shows Score column header', () => {
    renderLeaderboard({ leaderboard: [{ player_id: 1, name: 'A', score: 7 }] });

    const headers = Array.from(document.querySelectorAll('th')).map((el) =>
      el.textContent?.trim()
    );
    expect(headers).toEqual(['Rank', 'Player', 'Score']);
  });

  it('keeps existing leaderboard row nodes stable across live updates', () => {
    renderLeaderboard({ leaderboard: [{ player_id: 1, name: 'A', score: 7 }] });

    const firstRow = document.querySelector('tbody tr');
    const firstScore = firstRow.querySelector('.leaderboard-score');

    renderLeaderboard({ leaderboard: [{ player_id: 1, name: 'A', score: 9 }] });

    const secondRow = document.querySelector('tbody tr');
    expect(secondRow).toBe(firstRow);
    expect(secondRow.querySelector('.leaderboard-score')).toBe(firstScore);
    expect(secondRow.querySelector('.leaderboard-score')?.textContent).toBe(
      '9'
    );
  });
});

describe('leaderboard score formatting per scoring mode', () => {
  it('shows efficiency scores as 4-decimal ratios', () => {
    renderLeaderboard({
      scoring_mode: 'efficiency',
      leaderboard_top_5: [
        { player_id: 1, name: 'A', score: 1.2345 },
        { player_id: 2, name: 'B', score: 0.9876 },
      ],
    });
    const scores = Array.from(
      document.querySelectorAll('.leaderboard-score')
    ).map((node) => node.textContent);
    expect(scores).toEqual(['1.2345×', '0.9876×']);
  });

  it('shows integers when scoring_mode is missing (stockpile)', () => {
    renderLeaderboard({
      leaderboard_top_5: [{ player_id: 1, name: 'A', score: 12000 }],
    });
    expect(document.querySelector('.leaderboard-score').textContent).toBe(
      '12000'
    );
  });
});

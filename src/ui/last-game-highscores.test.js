import { beforeEach, describe, expect, it } from 'vitest';
import {
  initLastGameHighscores,
  buildLastGameSnapshot,
  renderLastGameHighscores,
} from './last-game-highscores.js';

beforeEach(() => {
  document.body.innerHTML = `
    <p id="last-game-summary"></p>
    <div id="last-game-highscores"></div>
  `;

  initLastGameHighscores({
    summaryEl: document.getElementById('last-game-summary'),
    listEl: document.getElementById('last-game-highscores'),
  });
});

describe('last game highscores', () => {
  it('renders a placeholder before any game has finished', () => {
    renderLastGameHighscores(null);

    expect(document.getElementById('last-game-summary')?.textContent).toContain(
      'No finished game recorded yet.'
    );
    expect(
      document.getElementById('last-game-highscores')?.textContent
    ).toContain('Finish a round');
  });

  it('builds and renders a top-five snapshot from backend leaderboard data', () => {
    const snapshot = buildLastGameSnapshot({
      gameId: 'game-7',
      scoringModeLabel: 'Power Mode',
      data: {
        leaderboard_top_5: [
          { name: 'Alice', score: 120.8 },
          { player_id: 'p2', score: 99.2 },
        ],
      },
    });

    renderLastGameHighscores(snapshot);

    const items = Array.from(document.querySelectorAll('.last-game-score-item'));
    expect(snapshot?.leaderboard).toEqual([
      { rank: 1, name: 'Alice', score: '120' },
      { rank: 2, name: 'p2', score: '99' },
    ]);
    expect(document.getElementById('last-game-summary')?.textContent).toContain(
      'game-7'
    );
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Alice');
    expect(items[1].textContent).toContain('99');
  });
});
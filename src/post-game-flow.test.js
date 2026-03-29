import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function loadPlayerFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'player.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
  document.body.className = /class="([^"]+)"/.exec(match?.[1] || '')?.[1] || '';
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  loadPlayerFixture();

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });

  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
  }
  if (!globalThis.cancelAnimationFrame) {
    globalThis.cancelAnimationFrame = () => {};
  }

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('post-game flow', () => {
  it('only shows the game-over overlay on a running-to-finished transition for the viewed game', async () => {
    const main = await import('./main.js');

    // enrolling -> finished is NOT enough
    expect(
      main.isGameOverOverlayEligible({
        previousGameStatus: 'enrolling',
        gameStatus: 'finished',
        gameId: 'game-1',
        currentGameId: 'game-1',
      })
    ).toBe(false);

    // running -> finished on the same viewed game IS eligible
    expect(
      main.isGameOverOverlayEligible({
        previousGameStatus: 'running',
        gameStatus: 'finished',
        gameId: 'game-1',
        currentGameId: 'game-1',
      })
    ).toBe(true);

    // finished for a different game must never trigger the overlay
    expect(
      main.isGameOverOverlayEligible({
        previousGameStatus: 'running',
        gameStatus: 'finished',
        gameId: 'game-2',
        currentGameId: 'game-1',
      })
    ).toBe(false);
  });

  it('stores the last finished game highscores snapshot for the lobby view', async () => {
    const main = await import('./main.js');

    const snapshot = main.captureLastPlayedGameSnapshot({
      game_id: 'game-77',
      scoring_mode: 'power_oracle_weighted',
      leaderboard_top_5: [
        { name: 'Alice', score: 321.9 },
        { name: 'Bob', score: 210.4 },
      ],
    });

    expect(snapshot?.gameId).toBe('game-77');

    const stored = JSON.parse(
      localStorage.getItem('mining-tycoon:lastPlayedGameSnapshot')
    );
    expect(stored.gameId).toBe('game-77');
    expect(stored.leaderboard).toHaveLength(2);
  });

  it('returns the player to setup state when the overlay is acknowledged', async () => {
    const main = await import('./main.js');
    const gameIdInput = document.getElementById('game-id');
    const playerIdInput = document.getElementById('player-id');
    const overlay = document.getElementById('game-over-overlay');
    const setupShell = document.getElementById('setup-shell');

    gameIdInput.value = 'game-42';
    playerIdInput.value = 'player-9';

    main.showGameOverOverlay('game-42');
    expect(overlay.hidden).toBe(false);

    main.acknowledgeGameOverOverlay();

    expect(overlay.hidden).toBe(true);
    expect(gameIdInput.value).toBe('');
    expect(playerIdInput.value).toBe('');
    expect(setupShell.classList.contains('setup-collapsed')).toBe(false);
  });
});

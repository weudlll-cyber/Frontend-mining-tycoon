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

  it('offers a "View full results" deep link into the lobby results view', async () => {
    const main = await import('./main.js');
    const link = document.getElementById('game-over-results-link');
    const note = document.getElementById('game-over-results-note');
    document.getElementById('player-id').value = '9';

    main.showGameOverOverlay('game 42');
    expect(link.hidden).toBe(false);
    expect(link.getAttribute('href')).toBe(
      '/index.html?results=game+42&player=9'
    );
    // Sync round over: results are final, no note.
    expect(note.hidden).toBe(true);

    document.getElementById('player-id').value = '';
    main.showGameOverOverlay('7', { title: 'Session Finished' });
    expect(link.getAttribute('href')).toBe('/index.html?results=7');
    // Async session over: the round may still run, results come later.
    expect(note.hidden).toBe(false);

    main.showGameOverOverlay('');
    expect(link.hidden).toBe(true);
    expect(note.hidden).toBe(true);
    expect(link.getAttribute('href')).toBe('/index.html');
  });

  it('resets the board when the results link is used, without the overlay handler', async () => {
    const main = await import('./main.js');
    const overlay = document.getElementById('game-over-overlay');
    const link = document.getElementById('game-over-results-link');
    const gameIdInput = document.getElementById('game-id');
    gameIdInput.value = 'game-42';
    main.showGameOverOverlay('game-42');

    // Enter on the focused link is left to the link's own click.
    link.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(overlay.hidden).toBe(false);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(overlay.hidden).toBe(true);
    expect(gameIdInput.value).toBe('');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

vi.mock('./services/auth-client.js', () => ({
  fetchOpenGames: vi.fn().mockResolvedValue([]),
  joinGame: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
}));

function loadLobbyFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'index.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
  document.body.className = /class="([^"]+)"/.exec(match?.[1] || '')?.[1] || '';
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  loadLobbyFixture();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lobby last game highscores', () => {
  it('renders the saved last played game snapshot on the login screen', async () => {
    localStorage.setItem(
      'mining-tycoon:lastPlayedGameSnapshot',
      JSON.stringify({
        gameId: 'game-900',
        scoringModeLabel: 'Power Oracle',
        leaderboard: [
          { rank: 1, name: 'Alice', score: '501' },
          { rank: 2, name: 'Bob', score: '404' },
        ],
      })
    );

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(document.getElementById('last-game-summary')?.textContent).toContain(
      'game-900'
    );
    expect(document.querySelectorAll('.last-game-score-item')).toHaveLength(2);
  });

  it('refreshes open games when page becomes visible again', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-visible',
        game_status: 'enrolling',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
        enrollment_remaining_seconds: 25,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    fetchOpenGamesMock.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(fetchOpenGamesMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(1);
  });

  it('updates loaded count when games become unjoinable', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-open',
        game_status: 'enrolling',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
        enrollment_remaining_seconds: 10,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-open',
        game_status: 'finished',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
      },
    ]);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    const lobbyMessage = document.getElementById('lobby-message');
    expect(lobbyMessage?.textContent).toContain('Loaded 0 open games');
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(0);
  });

  it('filters out async games when session duration is equal or longer than available game time', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-hidden',
        game_status: 'running',
        round_type: 'asynchronous',
        scoring_mode: 'mining_time',
        trade_count: 0,
        players_count: 1,
        run_remaining_seconds: 315,
        session_duration_seconds: 600,
      },
      {
        game_id: 'game-visible',
        game_status: 'running',
        round_type: 'asynchronous',
        scoring_mode: 'stockpile',
        trade_count: 1,
        players_count: 2,
        run_remaining_seconds: 900,
        session_duration_seconds: 300,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    const rows = document.querySelectorAll('.game-list-item');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-game-id')).toBe('game-visible');
  });
});

/**
 * File: src/admin/game-management.test.js
 * Purpose: Verify admin game-list row actions: Metrics, Reset (clone with
 *          confirm step) and Delete wiring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initGameManagement, resetGame } from './game-management.js';

const GAMES = {
  games: [
    {
      game_id: 7,
      status: 'running',
      round_type: 'synchronous',
      players_count: 2,
      real_duration_seconds: 600,
    },
    { game_id: 8, status: 'finished', players_count: 0 },
  ],
};

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function buildDom() {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="http://127.0.0.1:8000" />
    <input id="admin-token" value="tok" />
    <button id="admin-refresh-games-btn" type="button"></button>
    <div id="admin-games-loading"></div>
    <div id="admin-games-error"></div>
    <div id="admin-games-list-container"></div>
    <div id="admin-games-empty"></div>
    <table><tbody id="admin-games-tbody"></tbody></table>
    <div id="admin-delete-result" class="result-box"></div>
    <div id="admin-game-metrics" hidden>
      <h3 id="admin-game-metrics-title"></h3>
      <div id="admin-game-metrics-body"></div>
    </div>
    <div id="admin-metrics-error" class="result-box"></div>
  `;
}

function rowButtonLabels() {
  return Array.from(
    document.querySelectorAll('#admin-games-tbody tr button')
  ).map((b) => b.textContent);
}

beforeEach(() => {
  buildDom();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('game list row actions', () => {
  it('renders Metrics, Reset and Delete for each active game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(GAMES)));
    initGameManagement();
    await flush();

    expect(document.querySelectorAll('#admin-games-tbody tr')).toHaveLength(1);
    expect(rowButtonLabels()).toEqual(['📊 Metrics', '♻ Reset', '🗑 Delete']);
  });

  it('opens per-game metrics from the row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(GAMES))
      .mockResolvedValueOnce(
        okResponse({ game_id: 7, counters: { joins_total: 2 } })
      );
    vi.stubGlobal('fetch', fetchMock);
    initGameManagement();
    await flush();

    document.querySelector('#admin-games-tbody .admin-row-btn').click();
    await flush();

    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://127.0.0.1:8000/admin/games/7/metrics'
    );
    expect(
      document.getElementById('admin-game-metrics-title').textContent
    ).toBe('Game 7 metrics');
  });

  it('resets a game from the row after confirmation and shows the new id', async () => {
    vi.useFakeTimers();
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(GAMES))
      .mockResolvedValueOnce(okResponse({ old_game_id: 7, new_game_id: 12 }))
      .mockResolvedValue(okResponse(GAMES));
    vi.stubGlobal('fetch', fetchMock);
    initGameManagement();
    await flush();

    const resetBtn = document.querySelectorAll(
      '#admin-games-tbody .admin-row-btn'
    )[1];
    resetBtn.click();
    await flush();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining('Reset game 7?')
    );
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://127.0.0.1:8000/admin/games/7/reset');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Admin-Token']).toBe('tok');

    const result = document.getElementById('admin-delete-result');
    expect(result.className).toBe('result-box success');
    expect(result.style.display).toBe('block');
    expect(result.querySelector('.game-id-display').textContent).toBe('12');
    expect(resetBtn.disabled).toBe(false);
    expect(resetBtn.textContent).toBe('♻ Reset');

    // The list refreshes shortly after a successful reset.
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('resetGame', () => {
  it('does nothing when the confirm step is cancelled', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resetGame(7, document.createElement('button'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows backend errors and restores the button', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Game 7 not found' }),
      })
    );
    const button = document.createElement('button');

    await resetGame(7, button);

    const result = document.getElementById('admin-delete-result');
    expect(result.className).toBe('result-box error');
    expect(result.textContent).toBe(
      '❌ Failed to reset game: Game 7 not found'
    );
    expect(button.disabled).toBe(false);
  });

  it('falls back to a placeholder id when the response has none', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({})));

    await resetGame(7, document.createElement('button'));

    expect(
      document.querySelector('#admin-delete-result .game-id-display')
        .textContent
    ).toBe('?');
  });

  it('is a no-op without a result box', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    document.getElementById('admin-delete-result').remove();

    await resetGame(7, document.createElement('button'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

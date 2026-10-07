/**
 * File: src/ui/lobby-results-dialog.test.js
 * Purpose: Verify the lobby "My results" dialog controller against mocked
 *          GET /auth/me/history and GET /games/{id}/results: pagination,
 *          empty state, full results with own-row highlight, 401 / 404 / 409
 *          handling and stale-response protection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

vi.mock('../services/auth-client.js', () => ({
  fetchMyHistory: vi.fn(),
  fetchGameResults: vi.fn(),
}));

const BASE = 'http://127.0.0.1:8000';

function loadLobbyFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'index.html'),
    'utf8'
  );
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
}

function historyItem(gameId, rank = 1) {
  return {
    game_id: gameId,
    finished_at: 1760000000,
    round_type: 'synchronous',
    scoring_mode: 'stockpile',
    rank,
    participants: 4,
    score: 100,
    player_name: 'Weudl',
  };
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

const $ = (id) => document.getElementById(id);

let client;
let dialogModule;
let context;
let onAuthInvalid;

beforeEach(async () => {
  vi.resetModules();
  loadLobbyFixture();
  const dialog = $('results-dialog');
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
  });
  client = await import('../services/auth-client.js');
  vi.mocked(client.fetchMyHistory).mockReset();
  vi.mocked(client.fetchGameResults).mockReset();
  dialogModule = await import('./lobby-results-dialog.js');
  context = { baseUrl: BASE, authToken: 'jwt' };
  onAuthInvalid = vi.fn();
  expect(
    dialogModule.initLobbyResults({ getContext: () => context, onAuthInvalid })
  ).toBe(true);
});

describe('history view', () => {
  it('shows the empty state when the account has no finished rounds', async () => {
    vi.mocked(client.fetchMyHistory).mockResolvedValue({ items: [], total: 0 });

    await dialogModule.openMyResults();

    expect($('results-dialog').showModal).toHaveBeenCalled();
    expect($('history-view').hidden).toBe(false);
    expect($('game-results-view').hidden).toBe(true);
    expect($('history-message').textContent).toBe('No finished rounds yet.');
    expect($('history-load-more').hidden).toBe(true);
    expect(client.fetchMyHistory).toHaveBeenCalledWith(BASE, {
      authToken: 'jwt',
      limit: 20,
      offset: 0,
    });
  });

  it('paginates with "Load more" until all rounds are shown', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => historyItem(i + 1));
    vi.mocked(client.fetchMyHistory)
      .mockResolvedValueOnce({ items: firstPage, total: 21 })
      .mockResolvedValueOnce({ items: [historyItem(21)], total: 21 });

    await dialogModule.openMyResults();
    expect($('history-list').children).toHaveLength(20);
    expect($('history-load-more').hidden).toBe(false);
    expect($('history-message').textContent).toBe(
      'Showing 20 of 21 finished rounds.'
    );

    $('history-load-more').click();
    await flush();

    expect(client.fetchMyHistory).toHaveBeenLastCalledWith(BASE, {
      authToken: 'jwt',
      limit: 20,
      offset: 20,
    });
    expect($('history-list').children).toHaveLength(21);
    expect($('history-load-more').hidden).toBe(true);
    expect($('history-load-more').disabled).toBe(false);
  });

  it('asks for a sign-in without a token', async () => {
    context.authToken = '';
    await dialogModule.openMyResults();
    expect(client.fetchMyHistory).not.toHaveBeenCalled();
    expect($('history-message').textContent).toBe(
      'Sign in to see your results.'
    );
  });

  it('expires the session on 401 and shows other errors', async () => {
    vi.mocked(client.fetchMyHistory).mockRejectedValueOnce(
      Object.assign(new Error('Authentication required'), { status: 401 })
    );
    await dialogModule.openMyResults();
    expect(onAuthInvalid).toHaveBeenCalledTimes(1);
    expect($('results-dialog').close).toHaveBeenCalled();

    vi.mocked(client.fetchMyHistory).mockRejectedValueOnce(
      new Error('Failed to fetch')
    );
    await dialogModule.openMyResults();
    expect($('history-message').textContent).toBe('Failed to fetch');
    expect($('history-message').dataset.kind).toBe('error');

    vi.mocked(client.fetchMyHistory).mockRejectedValueOnce({});
    await dialogModule.openMyResults();
    expect($('history-message').textContent).toBe(
      'Could not load your results.'
    );
  });

  it('drops a history response that arrives after a reset (logout)', async () => {
    let resolvePage;
    vi.mocked(client.fetchMyHistory).mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      })
    );
    const pending = dialogModule.openMyResults();
    dialogModule.resetLobbyResults();
    resolvePage({ items: [historyItem(1)], total: 1 });
    await pending;
    expect($('history-list').children).toHaveLength(0);
  });

  it('drops a failed history response after a reset', async () => {
    let rejectPage;
    vi.mocked(client.fetchMyHistory).mockReturnValue(
      new Promise((_, reject) => {
        rejectPage = reject;
      })
    );
    const pending = dialogModule.openMyResults();
    dialogModule.resetLobbyResults();
    rejectPage(Object.assign(new Error('gone'), { status: 401 }));
    await pending;
    expect(onAuthInvalid).not.toHaveBeenCalled();
  });
});

describe('full results view', () => {
  const RESULTS = {
    game_id: 5,
    finished_at: 1760000000,
    scoring_mode: 'stockpile',
    round_type: 'synchronous',
    participants: 2,
    results: [
      { rank: 1, player_id: 1, player_name: 'Alice', score: 300 },
      { rank: 2, player_id: 2, player_name: 'Weudl', score: 100 },
    ],
  };

  it('opens from a history row, highlights the own row and goes back', async () => {
    vi.mocked(client.fetchMyHistory).mockResolvedValue({
      items: [historyItem(5, 2)],
      total: 1,
    });
    vi.mocked(client.fetchGameResults).mockResolvedValue(RESULTS);
    await dialogModule.openMyResults();

    document.querySelector('.history-full-results-btn').click();
    await flush();

    expect(client.fetchGameResults).toHaveBeenCalledWith(BASE, '5');
    expect($('game-results-view').hidden).toBe(false);
    expect($('history-view').hidden).toBe(true);
    expect($('game-results-title').textContent).toBe('Full results • Round 5');
    expect($('game-results-summary').textContent).toContain('2 players');
    const own = document.querySelector('.results-item.is-own');
    expect(own.querySelector('.results-name').textContent).toBe('Weudl');
    expect($('game-results-message').textContent).toBe('');

    expect($('game-results-back').hidden).toBe(false);
    $('game-results-back').click();
    expect($('history-view').hidden).toBe(false);
    expect($('history-list').children).toHaveLength(1);

    $('close-results-dialog').click();
    expect($('results-dialog').close).toHaveBeenCalled();
  });

  it('opens directly (deep link) and highlights by player id', async () => {
    vi.mocked(client.fetchGameResults).mockResolvedValue(RESULTS);
    await dialogModule.openGameResults('5', { highlight: { playerId: '1' } });

    expect($('game-results-back').hidden).toBe(true);
    expect(
      document
        .querySelector('.results-item.is-own .results-name')
        .textContent.trim()
    ).toBe('Alice');
  });

  it('explains when nobody finished the round', async () => {
    vi.mocked(client.fetchGameResults).mockResolvedValue({
      ...RESULTS,
      results: [],
    });
    await dialogModule.openGameResults(5);
    expect($('game-results-message').textContent).toBe(
      'No players finished this round.'
    );
  });

  it('maps 409, 404 and other errors to messages', async () => {
    vi.mocked(client.fetchGameResults).mockRejectedValueOnce(
      Object.assign(new Error('not finished'), {
        status: 409,
        code: 'GAME_NOT_FINISHED',
      })
    );
    await dialogModule.openGameResults('5');
    expect($('game-results-message').textContent).toBe(
      dialogModule.RESULTS_NOT_FINAL_MESSAGE
    );
    expect($('game-results-message').dataset.kind).toBe('info');

    vi.mocked(client.fetchGameResults).mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 })
    );
    await dialogModule.openGameResults('99');
    expect($('game-results-message').textContent).toBe(
      'Round 99 was not found.'
    );
    expect($('game-results-message').dataset.kind).toBe('error');

    vi.mocked(client.fetchGameResults).mockRejectedValueOnce({ status: 500 });
    await dialogModule.openGameResults('5');
    expect($('game-results-message').textContent).toBe(
      'Could not load results.'
    );
  });

  it('ignores an empty game id and stale responses', async () => {
    await dialogModule.openGameResults('  ');
    expect(client.fetchGameResults).not.toHaveBeenCalled();

    let resolveResults;
    vi.mocked(client.fetchGameResults).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResults = resolve;
      })
    );
    const pending = dialogModule.openGameResults('5');
    dialogModule.resetLobbyResults();
    resolveResults(RESULTS);
    await pending;
    expect(document.querySelectorAll('.results-item')).toHaveLength(0);

    let rejectResults;
    vi.mocked(client.fetchGameResults).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectResults = reject;
      })
    );
    const failing = dialogModule.openGameResults('5');
    dialogModule.resetLobbyResults();
    rejectResults(new Error('late'));
    await failing;
    expect($('game-results-message').textContent).toBe('Loading results...');
  });
});

describe('init without markup', () => {
  it('returns false when the dialog is missing', () => {
    document.body.replaceChildren();
    expect(dialogModule.initLobbyResults()).toBe(false);
  });
});

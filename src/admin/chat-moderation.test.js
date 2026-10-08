/**
 * File: src/admin/chat-moderation.test.js
 * Purpose: Verify the admin Chat Moderation panel: opening from a game,
 *          mutes list with Unmute, mute form (player picker from the
 *          leaderboard or a player ID fallback, duration options incl. "until
 *          the round ends"), Clear chat with confirm, and backend errors for
 *          backends without the moderation endpoints.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMutedUntil,
  initChatModeration,
  parseMuteMinutes,
  showChatModeration,
} from './chat-moderation.js';

const BASE = 'http://127.0.0.1:8000';

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

function fail(status, detail) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({ detail }),
  };
}

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function buildDom() {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="${BASE}" />
    <input id="admin-token" value="tok" />
    <p id="admin-chat-gate"></p>
    <div id="admin-chat-panel" hidden>
      <h3 id="admin-chat-title"></h3>
      <p id="admin-chat-mutes-empty" hidden></p>
      <table id="admin-chat-mutes-table" hidden>
        <tbody id="admin-chat-mutes-tbody"></tbody>
      </table>
      <form id="admin-chat-mute-form">
        <select id="admin-chat-mute-player" hidden></select>
        <input id="admin-chat-mute-player-id" type="number" />
        <select id="admin-chat-mute-duration">
          <option value="15">15 minutes</option>
          <option value="60">1 hour</option>
          <option value="1440">24 hours</option>
          <option value="round">Until the round ends</option>
        </select>
        <button id="admin-chat-mute-btn" type="submit">Mute</button>
      </form>
      <button id="admin-chat-clear-btn" type="button">Clear</button>
    </div>
    <div id="admin-chat-result" class="result-box"></div>
  `;
}

/** Route fetch calls by method + path; unknown routes fail with 404. */
function stubRoutes(routes) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method || 'GET'} ${url.replace(BASE, '')}`;
    const handler = routes[key];
    if (!handler) return fail(404, 'Not Found');
    return typeof handler === 'function' ? handler(init) : handler;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const MUTES = {
  mutes: [
    { player_id: 3, player_name: '<b>Bob</b>', muted_until: null },
    { player_id: 4, player_name: '', muted_until: 1_900_000_000 },
  ],
};

const LEADERBOARD = [
  { player_id: 4, name: 'Dora', score: 1 },
  { player_id: 3, name: 'Bob', score: 5 },
  { player_id: 'x', name: 'bad', score: 0 },
];

function result() {
  return document.getElementById('admin-chat-result');
}

function submitMute() {
  document
    .getElementById('admin-chat-mute-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  buildDom();
  initChatModeration();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('helpers', () => {
  it('formats mute ends and parses durations', () => {
    expect(formatMutedUntil(null)).toBe('Until the round ends');
    expect(formatMutedUntil(0)).toBe('Until the round ends');
    expect(formatMutedUntil(1_900_000_000)).toBe(
      new Date(1_900_000_000_000).toLocaleString([], {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    );
    expect(parseMuteMinutes('15')).toBe(15);
    expect(parseMuteMinutes('1440')).toBe(1440);
    expect(parseMuteMinutes('round')).toBeNull();
    expect(parseMuteMinutes('9999')).toBeNull();
  });

  it('ignores init and open without the section markup', async () => {
    document.body.innerHTML = '';
    expect(() => initChatModeration()).not.toThrow();
    await expect(showChatModeration(7)).resolves.toBeUndefined();
  });
});

describe('opening the panel for a game', () => {
  it('lists mutes safely and fills the player picker from the leaderboard', async () => {
    const fetchMock = stubRoutes({
      'GET /admin/games/7/chat/mutes': ok(MUTES),
      'GET /games/7/leaderboard': ok(LEADERBOARD),
    });

    await showChatModeration(7);

    expect(document.getElementById('admin-chat-panel').hidden).toBe(false);
    expect(document.getElementById('admin-chat-gate').hidden).toBe(true);
    expect(document.getElementById('admin-chat-title').textContent).toBe(
      'Game 7 chat'
    );
    const rows = document.querySelectorAll('#admin-chat-mutes-tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('b')).toBeNull();
    expect(rows[0].textContent).toContain('<b>Bob</b>');
    expect(rows[0].textContent).toContain('Until the round ends');
    expect(rows[1].textContent).toContain('—');
    expect(rows[1].querySelector('button').getAttribute('aria-label')).toBe(
      'Unmute player 4'
    );
    expect(document.getElementById('admin-chat-mutes-table').hidden).toBe(
      false
    );

    const select = document.getElementById('admin-chat-mute-player');
    expect(select.hidden).toBe(false);
    expect(document.getElementById('admin-chat-mute-player-id').hidden).toBe(
      true
    );
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Bob (#3)',
      'Dora (#4)',
    ]);
    expect(fetchMock.mock.calls[0][1].headers['X-Admin-Token']).toBe('tok');
  });

  it('shows the empty note and the player ID input without players', async () => {
    stubRoutes({
      'GET /admin/games/8/chat/mutes': ok({ mutes: [] }),
      'GET /games/8/leaderboard': ok([{ player_id: 1, name: '' }]),
    });
    await showChatModeration(8);
    expect(document.getElementById('admin-chat-mutes-empty').hidden).toBe(
      false
    );
    expect(
      document.getElementById('admin-chat-mute-player').options[0].textContent
    ).toBe('Player (#1)');

    stubRoutes({ 'GET /admin/games/8/chat/mutes': ok({}) });
    await showChatModeration(8);
    expect(document.getElementById('admin-chat-mute-player').hidden).toBe(true);
    expect(document.getElementById('admin-chat-mute-player-id').hidden).toBe(
      false
    );

    stubRoutes({
      'GET /admin/games/8/chat/mutes': ok({}),
      'GET /games/8/leaderboard': ok({ unexpected: true }),
    });
    await showChatModeration(8);
    expect(document.getElementById('admin-chat-mute-player').hidden).toBe(true);
  });

  it('shows the backend error when the moderation endpoints are missing', async () => {
    stubRoutes({ 'GET /games/9/leaderboard': ok(LEADERBOARD) });
    await showChatModeration(9);
    expect(result().textContent).toBe(
      '❌ Could not load mutes for game 9: Not Found'
    );
    expect(result().className).toContain('error');
    expect(document.getElementById('admin-chat-mutes-table').hidden).toBe(true);
  });

  it('drops stale responses when another game is opened meanwhile', async () => {
    let releaseFirst;
    stubRoutes({
      'GET /admin/games/1/chat/mutes': () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(fail(500, 'late'));
        }),
      'GET /games/1/leaderboard': ok(LEADERBOARD),
      'GET /admin/games/2/chat/mutes': ok({ mutes: [] }),
      'GET /games/2/leaderboard': ok([]),
    });
    const first = showChatModeration(1);
    await flush();
    await showChatModeration(2);
    releaseFirst();
    await first;
    expect(document.getElementById('admin-chat-title').textContent).toBe(
      'Game 2 chat'
    );
    expect(result().textContent).toBe('');
    expect(document.getElementById('admin-chat-mute-player').hidden).toBe(true);

    stubRoutes({
      'GET /admin/games/1/chat/mutes': ok(MUTES),
      'GET /games/1/leaderboard': () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(ok(LEADERBOARD));
        }),
      'GET /admin/games/2/chat/mutes': ok({ mutes: [] }),
      'GET /games/2/leaderboard': ok([]),
    });
    const second = showChatModeration(1);
    await flush();
    const staleMutes = showChatModeration(2);
    releaseFirst();
    await Promise.all([second, staleMutes]);
    expect(document.getElementById('admin-chat-mute-player').hidden).toBe(true);
  });
});

describe('mute, unmute and clear', () => {
  it('mutes the picked player for the chosen duration and reloads mutes', async () => {
    const mutes = { mutes: [] };
    const fetchMock = stubRoutes({
      'GET /admin/games/7/chat/mutes': () => ok(mutes),
      'GET /games/7/leaderboard': ok(LEADERBOARD),
      'POST /admin/games/7/chat/mute': (init) => {
        const body = JSON.parse(init.body);
        mutes.mutes = [
          { player_id: body.player_id, player_name: 'Dora', muted_until: null },
        ];
        return ok({
          game_id: 7,
          player_id: body.player_id,
          muted_until: body.minutes ? 1_900_000_000 : null,
        });
      },
    });
    await showChatModeration(7);

    document.getElementById('admin-chat-mute-player').value = '4';
    document.getElementById('admin-chat-mute-duration').value = '60';
    submitMute();
    await flush();

    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST'
    );
    expect(JSON.parse(post[1].body)).toEqual({ player_id: 4, minutes: 60 });
    expect(result().textContent).toBe(
      `✅ Player 4 muted until ${formatMutedUntil(1_900_000_000)}.`
    );
    expect(
      document.querySelectorAll('#admin-chat-mutes-tbody tr')
    ).toHaveLength(1);
    expect(document.getElementById('admin-chat-mute-btn').disabled).toBe(false);

    document.getElementById('admin-chat-mute-duration').value = 'round';
    submitMute();
    await flush();
    const posts = fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST');
    expect(JSON.parse(posts[1][1].body)).toEqual({
      player_id: 4,
      minutes: null,
    });
    expect(result().textContent).toBe(
      '✅ Player 4 muted until the round ends.'
    );
  });

  it('uses the player ID input as fallback and validates it', async () => {
    stubRoutes({
      'GET /admin/games/7/chat/mutes': ok({ mutes: [] }),
      'POST /admin/games/7/chat/mute': fail(404, 'PLAYER_NOT_FOUND'),
    });
    await showChatModeration(7);

    submitMute();
    await flush();
    expect(result().textContent).toBe(
      '❌ Choose a player or enter a valid player ID.'
    );

    document.getElementById('admin-chat-mute-player-id').value = '12';
    submitMute();
    await flush();
    expect(result().textContent).toBe(
      '❌ Could not mute player 12: PLAYER_NOT_FOUND'
    );
  });

  it('unmutes from the list and reports failures', async () => {
    let unmuteResponse = ok({ game_id: 7, player_id: 3 });
    const fetchMock = stubRoutes({
      'GET /admin/games/7/chat/mutes': ok(MUTES),
      'GET /games/7/leaderboard': ok([]),
      'DELETE /admin/games/7/chat/mute/3': () => unmuteResponse,
    });
    await showChatModeration(7);

    document.querySelector('#admin-chat-mutes-tbody button').click();
    await flush();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')
    ).toBe(true);
    expect(result().textContent).toBe('✅ Player 3 unmuted.');

    unmuteResponse = fail(403, 'Forbidden');
    const button = document.querySelector('#admin-chat-mutes-tbody button');
    button.click();
    await flush();
    expect(result().textContent).toBe(
      '❌ Could not unmute player 3: Forbidden'
    );
    expect(button.disabled).toBe(false);
  });

  it('clears the chat only after confirmation', async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    let clearResponse = ok({ game_id: 7, cleared: true });
    const fetchMock = stubRoutes({
      'GET /admin/games/7/chat/mutes': ok({ mutes: [] }),
      'GET /games/7/leaderboard': ok([]),
      'POST /admin/games/7/chat/clear': () => clearResponse,
    });
    await showChatModeration(7);
    const clearBtn = document.getElementById('admin-chat-clear-btn');

    clearBtn.click();
    await flush();
    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining('Clear the chat of game 7?')
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => init?.method === 'POST' && url.endsWith('/clear')
      )
    ).toBe(false);

    confirmMock.mockReturnValue(true);
    clearBtn.click();
    await flush();
    expect(result().textContent).toBe('✅ Chat of game 7 was cleared.');

    clearResponse = fail(404, 'Not Found');
    clearBtn.click();
    await flush();
    expect(result().textContent).toBe('❌ Could not clear chat: Not Found');
    expect(clearBtn.disabled).toBe(false);
  });
});

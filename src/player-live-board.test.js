/**
File: src/player-live-board.test.js
Purpose: Integration checks for player.html + main.js against the real backend payload shape.
Covers:
- Compact top-5 leaderboard (SSE leaderboard_top_5) mounted in the live tools window.
- Event banner rendering from the backend `active_events` list.
- Backend URL seeded from src/config/backend-url.js instead of hard-coded HTML.
- Farm tab (Farming Stage 1): status from SSE `farming`, deposit `updated_state` merge.
- No stray console.log calls in the main entry point.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function loadPlayerFixture() {
  const html = readRepoFile('player.html');
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
}

async function bootMainWithCapturedStream() {
  let streamDeps = null;
  vi.doMock('./services/stream-controller.js', () => ({
    initStreamController: (deps) => {
      streamDeps = deps;
    },
    startStream: vi.fn(),
    stopLiveTimersAndHalving: vi.fn(),
    closeEventSourceIfOpen: vi.fn(),
  }));
  const main = await import('./main.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await Promise.resolve();
  return { main, getStreamDeps: () => streamDeps };
}

beforeEach(() => {
  // Booting main.js can show toasts whose 3 s hide timers outlive the test;
  // fake timers (advancing with real time) let afterEach drop them so they
  // never run after the jsdom environment is torn down.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetModules();
  vi.doUnmock('./services/stream-controller.js');
  localStorage.clear();
  loadPlayerFixture();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({}),
  });
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('player live board wiring', () => {
  it('mounts the top-5 leaderboard in the live tools window', () => {
    const panel = document.getElementById('live-panel-leaderboard');
    expect(panel).not.toBeNull();
    expect(panel.closest('#live-drawer')).not.toBeNull();
    expect(panel.querySelector('#leaderboard')).not.toBeNull();
    expect(
      document.getElementById('leaderboard-drawer-btn')?.dataset.liveTab
    ).toBe('leaderboard');
  });

  it('renders SSE leaderboard_top_5 and active_events into the live board', async () => {
    const { getStreamDeps } = await bootMainWithCapturedStream();
    const deps = getStreamDeps();
    expect(deps).not.toBeNull();

    deps.onData({
      game_id: 7,
      player_id: 3,
      game_status: 'running',
      current_sim_month: 2,
      leaderboard_top_5: [
        { player_id: 3, name: 'Alice', score: 120.9 },
        { player_id: 4, name: '<b>Bob</b>', score: 80 },
      ],
      active_events: [
        {
          event_id: 'e1',
          event_type: 'LIQUIDITY_CRUNCH',
          domain: 'oracle_spread',
          token: null,
          magnitude: 0.03,
          label: 'Liquidity Crunch',
          start_sim_month: 1,
          end_sim_month: 4,
        },
      ],
    });

    const rows = document.querySelectorAll('#leaderboard tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toContain('120');
    // Player names are rendered as text, never as markup.
    expect(rows[1].querySelector('b')).toBeNull();
    expect(rows[1].textContent).toContain('<b>Bob</b>');

    const banner = document.querySelector('.event-banner');
    expect(banner).not.toBeNull();
    expect(banner.classList.contains('event-banner-hidden')).toBe(false);
    expect(banner.textContent).toContain('Liquidity Crunch');
    expect(banner.textContent).toContain('Spread +3.0% (all tokens)');
  });

  it('shows "Chat is disabled for this round." and opens no socket when game meta disables chat', async () => {
    const sockets = [];
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function FakeSocket(url) {
        sockets.push(url);
      })
    );
    globalThis.fetch = vi.fn().mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () =>
        String(url).includes('/games/7/meta')
          ? { meta_hash: 'game-7', chat_enabled: false }
          : { meta_hash: 'global' },
    }));
    const { getStreamDeps } = await bootMainWithCapturedStream();
    const deps = getStreamDeps();
    document.getElementById('game-id').value = '7';
    document.getElementById('player-id').value = '3';
    await deps.fetchMetaSnapshot('http://127.0.0.1:8000', '7');

    await deps.connectChat();

    expect(sockets).toEqual([]);
    const note = document.getElementById('chat-disabled-note');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Chat is disabled for this round.');
    expect(document.getElementById('chat-dock-preview').textContent).toBe(
      'Chat is disabled for this round.'
    );
    // The Chat tab itself stays in the live tools window.
    expect(document.getElementById('live-tab-chat')).not.toBeNull();

    // A round without chat_enabled (older backend) chats as before.
    document.getElementById('game-id').value = '8';
    await deps.connectChat();
    expect(sockets).toHaveLength(1);
    expect(note.hidden).toBe(true);
    expect(document.getElementById('chat-dock-preview').textContent).toBe(
      'Chat is ready'
    );
    vi.unstubAllGlobals();
  });

  it('renders the Farm tab from SSE farming and applies a deposit updated_state', async () => {
    const { getStreamDeps } = await bootMainWithCapturedStream();
    const deps = getStreamDeps();
    const panel = document.getElementById('farming-panel');
    const pill = document.getElementById('farming-status');

    // Before any farming data (older backend): explicit status text.
    expect(panel.textContent).toContain(
      'Farming is not enabled for this round.'
    );
    expect(pill.textContent).toBe('Not enabled');

    deps.onData({
      game_id: 7,
      player_id: 3,
      game_status: 'running',
      player_state: {
        balances: { spring: 100, summer: 0, autumn: 0, winter: 0 },
      },
      farming: {
        enabled: true,
        min_duration_seconds: 300,
        reward_rate: 0.05,
        positions: {
          spring: {
            amount: 0,
            next_reward_in_seconds: null,
            cycles_completed: 0,
          },
        },
      },
    });
    expect(pill.textContent).toBe('Enabled (5% / 5m)');
    expect(panel.querySelector('.farming-status-line').textContent).toBe(
      'Farming is enabled for this round.'
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        updated_state: {
          balances: { spring: 60, summer: 0, autumn: 0, winter: 0 },
          farming: {
            positions: {
              spring: {
                amount: 40,
                next_reward_in_seconds: 300,
                cycles_completed: 0,
              },
            },
          },
        },
      }),
    });
    const input = panel.querySelector('input[data-token="spring"]');
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    panel
      .querySelector('button[data-farm-action="deposit"][data-token="spring"]')
      .click();

    await vi.waitFor(() => {
      const values = [
        ...panel.querySelectorAll(
          '.farming-row[data-token="spring"] .farming-stat-value'
        ),
      ].map((node) => node.textContent);
      expect(values).toEqual(['60', '40', '0', '5m']);
    });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/games\/7\/players\/3\/farm\/deposit$/);
    expect(JSON.parse(init.body)).toEqual({ token: 'spring', amount: 40 });
    expect(document.querySelector('.ps-farmed-line').textContent).toContain(
      'SPR 40'
    );
  });

  it('seeds the backend URL field from the shared config module', async () => {
    expect(document.getElementById('base-url').value).toBe('');
    const { DEFAULT_BACKEND_URL } = await import('./config/backend-url.js');
    await bootMainWithCapturedStream();
    expect(document.getElementById('base-url').value).toBe(DEFAULT_BACKEND_URL);
  });

  it('keeps a user-overridden backend URL from localStorage', async () => {
    localStorage.setItem('mining-tycoon:baseUrl', 'https://api.example.test');
    await bootMainWithCapturedStream();
    expect(document.getElementById('base-url').value).toBe(
      'https://api.example.test'
    );
  });
});

describe('static guardrails', () => {
  it('has no hard-coded backend URL in the HTML entry points', () => {
    for (const file of [
      'index.html',
      'player.html',
      'admin.html',
      'how-to-play.html',
    ]) {
      expect(readRepoFile(file)).not.toContain('127.0.0.1:8000');
    }
  });

  it('has no stray console.log calls in the main entry point', () => {
    expect(readRepoFile(path.join('src', 'main.js'))).not.toMatch(
      /console\.log\(/
    );
  });

  it('documents VITE_API_BASE_URL in .env.example', () => {
    expect(readRepoFile('.env.example')).toMatch(/^VITE_API_BASE_URL=/m);
  });
});

/**
 * File: src/admin/admin-metrics.test.js
 * Purpose: Verify the admin Metrics section (summary + per-game counters).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatCounterValue,
  initAdminMetrics,
  loadMetricsSummary,
  showGameMetrics,
} from './admin-metrics.js';

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="http://127.0.0.1:8000" />
    <input id="admin-token" value="tok" />
    <button id="admin-metrics-refresh-btn" type="button"></button>
    <div id="admin-metrics-summary" hidden></div>
    <div id="admin-game-metrics" hidden>
      <h3 id="admin-game-metrics-title"></h3>
      <div id="admin-game-metrics-body"></div>
    </div>
    <div id="admin-metrics-error" class="result-box"></div>
  `;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function definitionRows(container) {
  return Array.from(container.querySelectorAll('dt')).map((dt) => [
    dt.textContent,
    dt.nextElementSibling.textContent,
  ]);
}

describe('formatCounterValue', () => {
  it('formats scalars, nested maps, empty maps and missing values', () => {
    expect(formatCounterValue(3)).toBe('3');
    expect(formatCounterValue({ hashrate: 2, cooling: 0 })).toBe(
      'hashrate: 2, cooling: 0'
    );
    expect(formatCounterValue({})).toBe('none');
    expect(formatCounterValue(null)).toBe('—');
  });
});

describe('metrics summary', () => {
  it('loads the summary from the refresh button', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        games_total: 5,
        games_by_status: { running: 2, finished: 3 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    initAdminMetrics();

    document.getElementById('admin-metrics-refresh-btn').click();
    await flush();

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/admin/metrics'
    );
    const summaryEl = document.getElementById('admin-metrics-summary');
    expect(summaryEl.hidden).toBe(false);
    expect(definitionRows(summaryEl)).toEqual([
      ['Games total', '5'],
      ['Games running', '2'],
      ['Games finished', '3'],
    ]);
  });

  it('shows summary errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Invalid admin token' }),
      })
    );
    await loadMetricsSummary();

    const errorEl = document.getElementById('admin-metrics-error');
    expect(errorEl.textContent).toBe(
      '❌ Could not load metrics summary: Invalid admin token'
    );
    expect(errorEl.className).toBe('result-box error');
  });

  it('init is a no-op without the section', () => {
    document.body.innerHTML = '';
    expect(() => initAdminMetrics()).not.toThrow();
  });
});

describe('per-game metrics', () => {
  it('renders the counters of one game', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        game_id: 7,
        counters: {
          joins_total: 4,
          upgrades_by_type: { hashrate: 2, efficiency: 1, cooling: 0 },
          error_counts_by_code: {},
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await showGameMetrics(7);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/admin/games/7/metrics'
    );
    expect(document.getElementById('admin-game-metrics').hidden).toBe(false);
    expect(
      document.getElementById('admin-game-metrics-title').textContent
    ).toBe('Game 7 metrics');
    expect(
      definitionRows(document.getElementById('admin-game-metrics-body'))
    ).toEqual([
      ['Joins total', '4'],
      ['Upgrades by type', 'hashrate: 2, efficiency: 1, cooling: 0'],
      ['Error counts by code', 'none'],
    ]);
  });

  it('shows a placeholder when no counters exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ game_id: 7 }))
    );
    await showGameMetrics(7);
    expect(document.getElementById('admin-game-metrics-body').textContent).toBe(
      'No counters recorded yet.'
    );
  });

  it('shows per-game errors (e.g. 404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Game 9 not found' }),
      })
    );
    await showGameMetrics(9);

    expect(document.getElementById('admin-metrics-error').textContent).toBe(
      '❌ Could not load metrics for game 9: Game 9 not found'
    );
    expect(document.getElementById('admin-game-metrics-body').textContent).toBe(
      ''
    );
  });

  it('does nothing without the per-game panel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    document.getElementById('admin-game-metrics').remove();
    await showGameMetrics(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

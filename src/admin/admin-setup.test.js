/**
 * File: src/admin/admin-setup.test.js
 * Purpose: Unit tests for the admin-setup module.
 *
 * Tests verify:
 *  - buildReviewSummary() produces the correct keys for sync and async rounds
 *  - buildGamePayload() produces the correct POST /games payload shape
 *  - Control-data constants (limits, defaults) are wired into the DOM
 *    correctly after init
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  ROUND_DURATION_PRESETS,
  ENROLLMENT_WINDOW_DEFAULT_SECONDS,
  ENROLLMENT_WINDOW_LIMITS,
  SCORING_CONTROL,
  TRADE_COUNT_LIMITS,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_DEFAULT_PRESET,
} from '../config/index.js';

// ── Minimal DOM scaffold matching admin.html ─────────────────────────────────
//   Each test builds the DOM fresh to isolate state.

function buildDom({
  roundType = 'sync',
  scoringAlias = 'stockpile',
  tradeCount = 0,
} = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <input id="admin-backend-url" value="http://127.0.0.1:8000" />
    <input id="admin-token" value="" />

    <input id="admin-round-type-sync" type="radio" name="admin-round-type" value="sync"
      ${roundType === 'sync' ? 'checked' : ''} />
    <input id="admin-round-type-async" type="radio" name="admin-round-type" value="async"
      ${roundType === 'async' ? 'checked' : ''} />

    <input id="admin-enrollment-window" type="number"
      value="${ENROLLMENT_WINDOW_DEFAULT_SECONDS}"
      min="${ENROLLMENT_WINDOW_LIMITS.min}" max="${ENROLLMENT_WINDOW_LIMITS.max}" />

    <select id="admin-duration-preset">
      <option value="5m" selected>5m</option>
      <option value="10m">10m</option>
      <option value="30m">30m</option>
      <option value="60m">60m</option>
      <option value="custom">Custom…</option>
    </select>
    <input id="admin-duration-custom-value" type="number" value="" />
    <select id="admin-duration-custom-unit">
      <option value="seconds">seconds</option>
      <option value="minutes" selected>minutes</option>
      <option value="hours">hours</option>
      <option value="days">days</option>
    </select>
    <div id="admin-duration-custom-row"></div>

    <select id="admin-async-duration-preset">
      <option value="5m">5m</option>
      <option value="10m">10m</option>
      <option value="30m" ${roundType === 'async' ? 'selected' : ''}>30m</option>
      <option value="3d">3d</option>
    </select>
    <select id="admin-async-session-preset">
      <option value="5m" selected>5m</option>
      <option value="24h">24h</option>
    </select>

    <div id="admin-scoring-mode-group">
      <input id="admin-scoring-stockpile" type="radio" name="admin-scoring-mode"
        value="stockpile_total_tokens" ${scoringAlias === 'stockpile' ? 'checked' : ''} />
      <input id="admin-scoring-power" type="radio" name="admin-scoring-mode"
        value="power_oracle_weighted" ${scoringAlias === 'power' ? 'checked' : ''} />
      <input id="admin-scoring-mining_time" type="radio" name="admin-scoring-mode"
        value="mining_time_equivalent" ${scoringAlias === 'mining_time' ? 'checked' : ''} />
      <input id="admin-scoring-efficiency" type="radio" name="admin-scoring-mode"
        value="efficiency_system_mastery" ${scoringAlias === 'efficiency' ? 'checked' : ''} />
    </div>

    <input id="admin-trade-count" type="number" value="${tradeCount}"
      min="${TRADE_COUNT_LIMITS.min}" max="${TRADE_COUNT_LIMITS.max}" />
    <p id="admin-trade-count-note"></p>
    <div id="admin-trade-schedule-preview"></div>

    <select id="admin-anchor-token"><option value="">—</option></select>
    <input id="admin-anchor-rate" type="number" value="" />
    <input id="admin-season-cycles" type="number" value="" />

    <div id="admin-sync-fields"></div>
    <div id="admin-async-fields" class="hidden-section"></div>
    <dl id="admin-review-dl"></dl>
    <div id="admin-result-box"></div>
    <button id="admin-create-btn">Create Round</button>
  </body></html>`);

  // Expose DOM globally so the module's el() helper works
  // eslint-disable-next-line no-undef
  global.document = dom.window.document;
  // eslint-disable-next-line no-undef
  global.window = dom.window;
  return dom;
}

// ── Import module after DOM is set —
//   We import buildReviewSummary and buildGamePayload which read the global document.
import {
  buildReviewSummary,
  buildGamePayload,
  createRound,
  init,
  initBackendUrlField,
  renderCreateSuccess,
  resolveTradeWindowSeconds,
  syncDefaultTradeCount,
  updateReview,
} from './admin-setup.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildReviewSummary — sync round', () => {
  beforeEach(() => {
    buildDom({ roundType: 'sync', scoringAlias: 'stockpile', tradeCount: 0 });
  });

  it('includes "Round type" as Sync', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Round type');
    expect(row).toBeDefined();
    expect(row[1]).toBe('Sync');
  });

  it('includes "Scoring mode" row', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Scoring mode');
    expect(row).toBeDefined();
    expect(row[1]).toBe('stockpile');
  });

  it('includes "Enrollment window" for sync round', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Enrollment window');
    expect(row).toBeDefined();
    expect(row[1]).toBe(`${ENROLLMENT_WINDOW_DEFAULT_SECONDS}s`);
  });

  it('does not include "Session duration" for sync round', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Session duration');
    expect(row).toBeUndefined();
  });
});

describe('buildReviewSummary — async round', () => {
  beforeEach(() => {
    buildDom({ roundType: 'async', tradeCount: 2 });
  });

  it('includes "Round type" as Async', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Round type');
    expect(row[1]).toBe('Async (host)');
  });

  it('includes "Session duration" for async round', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Session duration');
    expect(row).toBeDefined();
  });

  it('does not include "Enrollment window" for async round', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Enrollment window');
    expect(row).toBeUndefined();
  });

  it('includes trade count', () => {
    const rows = buildReviewSummary();
    const row = rows.find(([k]) => k === 'Trade count');
    expect(row).toBeDefined();
    expect(row[1]).toBe('2');
  });
});

describe('buildGamePayload — sync round', () => {
  beforeEach(() => {
    buildDom({ roundType: 'sync', scoringAlias: 'stockpile', tradeCount: 0 });
  });

  it('sets duration_mode to preset', () => {
    const payload = buildGamePayload();
    expect(payload.duration_mode).toBe('preset');
    expect(payload.duration_preset).toBe('5m');
  });

  it('sets scoring_mode to backend alias value', () => {
    const payload = buildGamePayload();
    expect(payload.scoring_mode).toBe('stockpile');
  });

  it('includes enrollment_window_seconds', () => {
    const payload = buildGamePayload();
    expect(typeof payload.enrollment_window_seconds).toBe('number');
    expect(payload.enrollment_window_seconds).toBeGreaterThanOrEqual(
      ENROLLMENT_WINDOW_LIMITS.min
    );
  });

  it('does not include round_type key for sync', () => {
    const payload = buildGamePayload();
    expect(payload.round_type).toBeUndefined();
  });

  it('trade_count is 0 and offsets is empty array', () => {
    const payload = buildGamePayload();
    expect(payload.trade_count).toBe(0);
    expect(payload.trade_unlock_offsets_seconds).toEqual([]);
  });
});

describe('buildGamePayload — async round', () => {
  beforeEach(() => {
    buildDom({ roundType: 'async', tradeCount: 2 });
  });

  it('sets round_type to asynchronous', () => {
    const payload = buildGamePayload();
    expect(payload.round_type).toBe('asynchronous');
  });

  it('sets enrollment_window_seconds to 0 for async', () => {
    const payload = buildGamePayload();
    expect(payload.enrollment_window_seconds).toBe(0);
  });

  it('includes session_duration_seconds', () => {
    const payload = buildGamePayload();
    expect(typeof payload.session_duration_seconds).toBe('number');
    expect(payload.session_duration_seconds).toBeGreaterThan(0);
  });

  it('trade count is clamped to TRADE_COUNT_LIMITS', () => {
    const payload = buildGamePayload();
    expect(payload.trade_count).toBeGreaterThanOrEqual(TRADE_COUNT_LIMITS.min);
    expect(payload.trade_count).toBeLessThanOrEqual(TRADE_COUNT_LIMITS.max);
  });
});

describe('buildGamePayload — custom duration sync', () => {
  beforeEach(() => {
    const dom = buildDom({ roundType: 'sync' });
    // Switch preset to 'custom'
    dom.window.document.getElementById('admin-duration-preset').value =
      'custom';
    dom.window.document.getElementById('admin-duration-custom-value').value =
      '90';
    dom.window.document.getElementById('admin-duration-custom-unit').value =
      'minutes';
  });

  it('uses duration_mode custom with computed seconds', () => {
    const payload = buildGamePayload();
    expect(payload.duration_mode).toBe('custom');
    expect(payload.duration_custom_seconds).toBe(90 * 60);
  });
});

describe('buildGamePayload — advanced overrides excluded when blank', () => {
  beforeEach(() => {
    buildDom({ roundType: 'sync' });
  });

  it('does not include emission_anchor_token when empty', () => {
    const payload = buildGamePayload();
    expect(payload.emission_anchor_token).toBeUndefined();
  });

  it('does not include emission_anchor_tokens_per_second when blank', () => {
    const payload = buildGamePayload();
    expect(payload.emission_anchor_tokens_per_second).toBeUndefined();
  });

  it('does not include season_cycles_per_game when blank', () => {
    const payload = buildGamePayload();
    expect(payload.season_cycles_per_game).toBeUndefined();
  });
});

describe('buildGamePayload — advanced overrides included when set', () => {
  beforeEach(() => {
    const dom = buildDom({ roundType: 'sync' });
    dom.window.document.getElementById('admin-anchor-token').innerHTML =
      '<option value="spring">spring</option>';
    dom.window.document.getElementById('admin-anchor-token').value = 'spring';
    dom.window.document.getElementById('admin-anchor-rate').value = '5.0';
    dom.window.document.getElementById('admin-season-cycles').value = '2';
  });

  it('includes emission_anchor_token (backend contract name)', () => {
    const payload = buildGamePayload();
    expect(payload.emission_anchor_token).toBe('spring');
  });

  it('includes emission_anchor_tokens_per_second as number', () => {
    const payload = buildGamePayload();
    expect(payload.emission_anchor_tokens_per_second).toBe(5.0);
  });

  it('includes season_cycles_per_game as number', () => {
    const payload = buildGamePayload();
    expect(payload.season_cycles_per_game).toBe(2);
  });

  it('never sends the legacy field names the backend ignores', () => {
    const payload = buildGamePayload();
    expect(payload).not.toHaveProperty('anchor_token');
    expect(payload).not.toHaveProperty('anchor_rate');
    expect(payload).not.toHaveProperty('season_cycles');
  });
});

describe('renderCreateSuccess — safe DOM rendering', () => {
  beforeEach(() => {
    buildDom({ roundType: 'sync' });
  });

  it('renders backend game_id as text, never as markup', () => {
    const box = document.getElementById('admin-result-box');
    renderCreateSuccess(box, {
      gameId: '<img src=x onerror="alert(1)">',
      joinUrl: 'http://localhost:5173/index.html',
    });

    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('#new-game-id-display')?.textContent).toBe(
      'Game ID: <img src=x onerror="alert(1)">'
    );
    const link = box.querySelector('a.join-link');
    expect(link?.getAttribute('href')).toBe('http://localhost:5173/index.html');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(box.className).toBe('result-box success');
  });

  it('does not set an href for non-http join URLs', () => {
    const box = document.getElementById('admin-result-box');
    renderCreateSuccess(box, {
      gameId: 7,
      joinUrl: 'javascript:alert(1)',
    });
    const link = box.querySelector('a.join-link');
    expect(link?.hasAttribute('href')).toBe(false);
    expect(link?.textContent).toBe('javascript:alert(1)');
  });
});

describe('control-data wiring — SCORING_CONTROL', () => {
  it('SCORING_CONTROL has the four expected canonical modes', () => {
    const canonical = Object.values(SCORING_CONTROL.CANONICAL_MODES);
    expect(canonical).toContain('stockpile_total_tokens');
    expect(canonical).toContain('power_oracle_weighted');
    expect(canonical).toContain('mining_time_equivalent');
    expect(canonical).toContain('efficiency_system_mastery');
  });
});

describe('control-data wiring — ROUND_DURATION_PRESETS', () => {
  it('30m preset is 1800 seconds', () => {
    expect(ROUND_DURATION_PRESETS['30m']).toBe(1800);
  });

  it('ASYNC_ROUND_DEFAULT_PRESET exists in ROUND_DURATION_PRESETS', () => {
    expect(ROUND_DURATION_PRESETS[ASYNC_ROUND_DEFAULT_PRESET]).toBeDefined();
  });

  it('ASYNC_SESSION_DEFAULT_PRESET exists in ROUND_DURATION_PRESETS', () => {
    expect(ROUND_DURATION_PRESETS[ASYNC_SESSION_DEFAULT_PRESET]).toBeDefined();
  });
});

describe('trade window — async rounds use the session duration', () => {
  it('derives offsets from the session length so they fit inside the session', () => {
    const dom = buildDom({ roundType: 'async', tradeCount: 2 });
    // 30m round, 24h session is clamped elsewhere; pick the 5m session preset.
    dom.window.document.getElementById('admin-async-session-preset').value =
      '5m';
    const payload = buildGamePayload();
    expect(resolveTradeWindowSeconds()).toBe(300);
    expect(payload.trade_unlock_offsets_seconds).toHaveLength(2);
    payload.trade_unlock_offsets_seconds.forEach((offset) => {
      expect(offset).toBeLessThan(300);
    });
  });

  it('uses the round duration for sync rounds', () => {
    buildDom({ roundType: 'sync', tradeCount: 0 });
    expect(resolveTradeWindowSeconds()).toBe(ROUND_DURATION_PRESETS['5m']);
  });
});

describe('review panel and backend URL field', () => {
  it('rebuilds the review list without innerHTML', () => {
    buildDom({ roundType: 'sync' });
    const dl = document.getElementById('admin-review-dl');
    dl.appendChild(document.createElement('dt'));
    updateReview();
    const terms = Array.from(dl.querySelectorAll('dt')).map(
      (node) => node.textContent
    );
    expect(terms[0]).toBe('Round type');
    expect(terms).not.toContain('');
  });

  it('seeds an empty URL field from storage or the shared default and persists edits', () => {
    const dom = buildDom({ roundType: 'sync' });
    const input = dom.window.document.getElementById('admin-backend-url');
    input.value = '';
    localStorage.removeItem('mining-tycoon:baseUrl');
    initBackendUrlField();
    expect(input.value).toBe('http://127.0.0.1:8000');

    input.value = 'https://api.example.test/';
    input.dispatchEvent(new dom.window.Event('change'));
    expect(localStorage.getItem('mining-tycoon:baseUrl')).toBe(
      'https://api.example.test'
    );

    input.value = 'not a url';
    input.dispatchEvent(new dom.window.Event('change'));
    expect(localStorage.getItem('mining-tycoon:baseUrl')).toBe(
      'https://api.example.test'
    );

    const dom2 = buildDom({ roundType: 'sync' });
    const input2 = dom2.window.document.getElementById('admin-backend-url');
    input2.value = '';
    initBackendUrlField();
    expect(input2.value).toBe('https://api.example.test');
    localStorage.removeItem('mining-tycoon:baseUrl');
  });
});

describe('createRound', () => {
  it('renders the created game id safely on success', async () => {
    buildDom({ roundType: 'sync' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ game_id: '<i>12</i>' }),
    });

    await createRound();

    const box = document.getElementById('admin-result-box');
    expect(box.className).toBe('result-box success');
    expect(box.querySelector('i')).toBeNull();
    expect(box.textContent).toContain('Game ID: <i>12</i>');
    expect(document.getElementById('admin-create-btn').disabled).toBe(false);
  });

  it('shows backend validation detail on failure', async () => {
    buildDom({ roundType: 'sync' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({
        detail: [{ loc: ['body', 'trade_count'], msg: 'too many' }],
      }),
    });

    await createRound();

    const box = document.getElementById('admin-result-box');
    expect(box.className).toBe('result-box error');
    expect(box.textContent).toContain('body.trade_count: too many');
  });

  it('explains missing admin permission on 403', async () => {
    buildDom({ roundType: 'sync' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Admin token required' }),
    });

    await createRound();

    expect(document.getElementById('admin-result-box').textContent).toContain(
      'Admin permission required to create rounds. Admin token required'
    );
  });
});

describe('async trade defaults and init', () => {
  it('defaults the trade count from the session length (5m session = 0 trades)', () => {
    const dom = buildDom({ roundType: 'async', tradeCount: 3 });
    const doc = dom.window.document;
    doc.getElementById('admin-async-session-preset').value = '5m';
    syncDefaultTradeCount();
    expect(doc.getElementById('admin-trade-count').value).toBe('0');
    expect(doc.getElementById('admin-trade-count-note').textContent).toBe(
      'Trading disabled for this round.'
    );
  });

  it('labels async trade schedules as per session', () => {
    const dom = buildDom({ roundType: 'async', tradeCount: 2 });
    dom.window.document.getElementById('admin-async-session-preset').value =
      '24h';
    updateReview();
    expect(
      dom.window.document.getElementById('admin-trade-count-note').textContent
    ).toBe('2 trades scheduled per session.');
  });

  it('initializes the console without throwing and seeds the backend URL', async () => {
    const dom = buildDom({ roundType: 'sync' });
    dom.window.document.getElementById('admin-backend-url').value = '';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    localStorage.removeItem('mining-tycoon:baseUrl');

    expect(() => init()).not.toThrow();
    await Promise.resolve();

    expect(dom.window.document.getElementById('admin-backend-url').value).toBe(
      'http://127.0.0.1:8000'
    );
    const presetValues = Array.from(
      dom.window.document.getElementById('admin-duration-preset').options
    ).map((option) => option.value);
    expect(presetValues).toContain('3h');
  });
});

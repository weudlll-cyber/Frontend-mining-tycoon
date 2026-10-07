/**
 * File: src/admin/economy-settings.test.js
 * Purpose: Verify the admin Global Economy section: load + render, diff-only
 *          PATCH payloads, client input checks and backend error display.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ECONOMY_FIELDS,
  buildEconomyPatch,
  initEconomySettings,
  loadEconomySettings,
  saveEconomySettings,
} from './economy-settings.js';

const CONFIG = {
  base_mining_rate: 1,
  upgrade_base_cost: 10,
  upgrade_cost_growth: 1.5,
  hashrate_increment: 0.1,
  efficiency_increment: 0.05,
  cooling_increment: 0.02,
  conversion_fee_rate: 0.02,
  oracle_spread: 0.01,
  rotation_period_months: 3,
};

function settings(overrides = {}, version = 4) {
  return {
    version,
    snapshot_hash: 'abcdef0123456789',
    config: { ...CONFIG, ...overrides },
  };
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function buildDom() {
  document.body.innerHTML = `
    <input id="admin-backend-url" value="http://127.0.0.1:8000" />
    <input id="admin-token" value="tok" />
    <button id="admin-economy-load-btn" type="button"></button>
    <p id="admin-economy-version"></p>
    <div id="admin-economy-fields" hidden></div>
    <button id="admin-economy-save-btn" type="button"></button>
    <div id="admin-economy-result" class="result-box"></div>
  `;
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

function input(key) {
  return document.getElementById(`admin-economy-${key.replaceAll('_', '-')}`);
}

beforeEach(() => {
  buildDom();
  initEconomySettings();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildEconomyPatch', () => {
  const raw = Object.fromEntries(
    Object.entries(CONFIG).map(([k, v]) => [k, String(v)])
  );

  it('returns only changed fields', () => {
    const { patch, errors } = buildEconomyPatch(
      { ...raw, oracle_spread: '0.03', rotation_period_months: '6' },
      CONFIG
    );
    expect(errors).toEqual([]);
    expect(patch).toEqual({ oracle_spread: 0.03, rotation_period_months: 6 });
  });

  it('reports empty, non-numeric and non-integer input', () => {
    const { errors } = buildEconomyPatch(
      {
        ...raw,
        base_mining_rate: '',
        oracle_spread: 'abc',
        rotation_period_months: '2.5',
      },
      CONFIG
    );
    expect(errors).toEqual([
      'Base mining rate is required.',
      'Oracle spread must be a number.',
      'Rotation period (months) must be a whole number.',
    ]);
  });
});

describe('economy settings section', () => {
  it('renders one input per backend field and starts hidden', () => {
    expect(document.querySelectorAll('[data-economy-field]').length).toBe(
      ECONOMY_FIELDS.length
    );
    expect(document.getElementById('admin-economy-fields').hidden).toBe(true);
    expect(document.getElementById('admin-economy-save-btn').disabled).toBe(
      true
    );
  });

  it('loads and shows current values, version and snapshot hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(settings()));
    vi.stubGlobal('fetch', fetchMock);

    document.getElementById('admin-economy-load-btn').click();
    await flush();

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/admin/economy'
    );
    expect(fetchMock.mock.calls[0][1].headers['X-Admin-Token']).toBe('tok');
    expect(input('upgrade_cost_growth').value).toBe('1.5');
    expect(document.getElementById('admin-economy-version').textContent).toBe(
      'Version 4 · snapshot abcdef012345'
    );
    expect(document.getElementById('admin-economy-fields').hidden).toBe(false);
    expect(document.getElementById('admin-economy-save-btn').disabled).toBe(
      false
    );
  });

  it('renders blanks and placeholders for missing values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ config: { oracle_spread: null } }))
    );
    await loadEconomySettings();

    expect(input('oracle_spread').value).toBe('');
    expect(document.getElementById('admin-economy-version').textContent).toBe(
      'Version ? · snapshot n/a'
    );
  });

  it('shows load failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Invalid admin token' }),
      })
    );
    await loadEconomySettings();

    const result = document.getElementById('admin-economy-result');
    expect(result.textContent).toBe(
      '❌ Could not load economy settings: Invalid admin token'
    );
    expect(result.className).toBe('result-box error');
  });

  it('asks to load before saving', async () => {
    await saveEconomySettings();
    expect(document.getElementById('admin-economy-result').textContent).toBe(
      'Load the current economy settings first.'
    );
  });

  it('PATCHes only the changed fields and explains the new-games-only scope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(settings()))
      .mockResolvedValueOnce(okResponse(settings({ oracle_spread: 0.05 }, 5)));
    vi.stubGlobal('fetch', fetchMock);
    await loadEconomySettings();

    input('oracle_spread').value = '0.05';
    document.getElementById('admin-economy-save-btn').click();
    await flush();

    const [, options] = fetchMock.mock.calls[1];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ oracle_spread: 0.05 });
    const result = document.getElementById('admin-economy-result');
    expect(result.className).toBe('result-box success');
    expect(result.textContent).toContain('Version 5');
    expect(result.textContent).toContain('existing games are unchanged');
    expect(document.getElementById('admin-economy-version').textContent).toBe(
      'Version 5 · snapshot abcdef012345'
    );
    expect(document.getElementById('admin-economy-save-btn').disabled).toBe(
      false
    );
  });

  it('does not call the backend when nothing changed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(settings()));
    vi.stubGlobal('fetch', fetchMock);
    await loadEconomySettings();

    await saveEconomySettings();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById('admin-economy-result').textContent).toBe(
      'No changes to save.'
    );
  });

  it('blocks invalid input before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(settings()));
    vi.stubGlobal('fetch', fetchMock);
    await loadEconomySettings();

    input('base_mining_rate').value = '';
    await saveEconomySettings();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById('admin-economy-result').textContent).toBe(
      '❌ Base mining rate is required.'
    );
  });

  it('shows backend validation errors (400/422)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(settings()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'base_mining_rate must be > 0' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'rotation_period_months'],
              msg: 'Input should be a valid integer',
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await loadEconomySettings();
    const result = document.getElementById('admin-economy-result');

    input('base_mining_rate').value = '-1';
    await saveEconomySettings();
    expect(result.textContent).toBe(
      '❌ Save rejected: base_mining_rate must be > 0'
    );

    await saveEconomySettings();
    expect(result.textContent).toBe(
      '❌ Save rejected: Input should be a valid integer'
    );
    expect(result.className).toBe('result-box error');
  });
});

describe('initEconomySettings', () => {
  it('is a no-op when the section is absent', () => {
    document.body.innerHTML = '';
    expect(() => initEconomySettings()).not.toThrow();
  });
});

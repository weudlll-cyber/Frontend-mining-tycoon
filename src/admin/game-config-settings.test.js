/**
 * File: src/admin/game-config-settings.test.js
 * Purpose: Verify the admin "Game Settings" section (admin.html section 11):
 *          load + render from GET /admin/game-config, row/checklist editing,
 *          diff-only PATCH payloads (defaults as partial), client sanity
 *          checks, backend error display and the hand-off to the config
 *          resolver after a save.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildGameConfigPatch,
  initGameConfigSettings,
  loadGameConfigSettings,
  orderSelection,
  readGameConfigDraft,
  saveGameConfigSettings,
  validateGameConfigDraft,
} from './game-config-settings.js';
import {
  getActiveGameConfigDocument,
  normalizeGameConfig,
  setGameConfigDocument,
} from '../config/index.js';

const CONFIG = {
  duration_presets: { '1m': 60, '5m': 300, '30m': 1800, '24h': 86400 },
  sync_round_preset_ids: ['1m', '5m', '30m'],
  async_round_preset_ids: ['30m', '24h'],
  async_session_preset_ids: ['1m', '5m'],
  defaults: {
    round_type: 'synchronous',
    sync_round_preset: '5m',
    async_round_preset: '30m',
    async_session_preset: '5m',
    enrollment_window_seconds: 10,
    scoring_mode: 'stockpile',
  },
  duration_limits: { min_seconds: 60, max_seconds: 2592000 },
  enrollment_window_limits: { min_seconds: 5, max_seconds: 3600 },
  trade_count_limits: { min: 0, max: 10 },
  trade_defaults: [
    { max_duration_seconds: 600, trade_count: 0 },
    { max_duration_seconds: null, trade_count: 6 },
  ],
  trade_unlock: { first_unlock_fraction: 0.2, remaining_window_fraction: 0.8 },
  account_policy: { require_account_to_join: false },
};

function documentFor(config = CONFIG, version = 1) {
  return {
    version,
    updated_at: '2026-10-07T20:00:00Z',
    config_hash: 'abc123def456789',
    config: structuredClone(config),
  };
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function loadAdminFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'admin.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
  document.getElementById('admin-backend-url').value = 'http://127.0.0.1:8000';
  document.getElementById('admin-token').value = 'tok';
}

const $ = (id) => document.getElementById(`admin-gameconfig-${id}`);
const resultText = () => $('result').textContent;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

function change(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

function presetRows() {
  return Array.from($('presets-body').rows);
}

function tradeRows() {
  return Array.from($('trade-body').rows);
}

function checklistValues(id, { checkedOnly = false } = {}) {
  const selector = checkedOnly ? 'input:checked' : 'input';
  return Array.from($(id).querySelectorAll(selector)).map((box) => box.value);
}

function tick(listId, presetId, checked = true) {
  const box = Array.from($(listId).querySelectorAll('input')).find(
    (input) => input.value === presetId
  );
  box.checked = checked;
}

async function loadWith(doc = documentFor(), onSaved) {
  const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(doc));
  vi.stubGlobal('fetch', fetchMock);
  initGameConfigSettings({ onSaved });
  $('load-btn').click();
  await flush();
  return fetchMock;
}

beforeEach(() => {
  loadAdminFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setGameConfigDocument(null);
});

describe('init and load', () => {
  it('starts hidden with a scoring dropdown and refuses to save before load', async () => {
    initGameConfigSettings();
    expect($('editor').hidden).toBe(true);
    expect($('save-btn').disabled).toBe(true);
    expect(
      Array.from($('default-scoring-mode').options).map((o) => o.value)
    ).toEqual(['stockpile', 'power', 'mining_time', 'efficiency']);

    await saveGameConfigSettings();
    expect(resultText()).toBe('Load the current game settings first.');
  });

  it('does nothing without the section markup', () => {
    document.body.innerHTML = '';
    expect(() => initGameConfigSettings()).not.toThrow();
  });

  it('loads and renders every editor with version and hash', async () => {
    const fetchMock = await loadWith();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8000/admin/game-config'
    );
    expect(fetchMock.mock.calls[0][1].headers['X-Admin-Token']).toBe('tok');
    expect($('version').textContent).toBe(
      'Version 1 · hash abc123def456 · updated 2026-10-07T20:00:00Z'
    );
    expect($('editor').hidden).toBe(false);
    expect($('save-btn').disabled).toBe(false);
    expect(presetRows()).toHaveLength(4);
    expect(checklistValues('offer-sync', { checkedOnly: true })).toEqual([
      '1m',
      '5m',
      '30m',
    ]);
    expect(checklistValues('offer-async-round', { checkedOnly: true })).toEqual(
      ['30m', '24h']
    );
    expect($('default-async-round-preset').value).toBe('30m');
    expect($('default-round-type').value).toBe('synchronous');
    expect($('default-enrollment').value).toBe('10');
    expect($('duration-max').value).toBe('2592000');
    expect($('trade-max').value).toBe('10');
    expect(tradeRows()).toHaveLength(2);
    expect(tradeRows()[1].querySelector('input').value).toBe('');
    expect($('first-unlock').value).toBe('0.2');
    // Labels come from data and must never be parsed as markup.
    expect(
      $('presets-body').querySelector('input').getAttribute('aria-label')
    ).toBe('Preset id');
  });

  it('maps the short round-type alias and shows placeholders for missing metadata', async () => {
    await loadWith({
      config: { ...structuredClone(CONFIG), defaults: { round_type: 'async' } },
    });
    expect($('default-round-type').value).toBe('asynchronous');
    expect($('version').textContent).toBe('Version ? · hash n/a');
  });

  it('renders preset ids from the backend as text, never as markup', async () => {
    const config = structuredClone(CONFIG);
    config.duration_presets = { '<img src=x onerror=alert(1)>': 60 };
    config.sync_round_preset_ids = ['<img src=x onerror=alert(1)>'];
    await loadWith(documentFor(config));
    const section = $('editor');
    expect(section.querySelector('img')).toBeNull();
    expect(checklistValues('offer-sync')).toEqual([
      '<img src=x onerror=alert(1)>',
    ]);
    expect($('offer-sync').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('shows the backend message when loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Admin token required' }),
      })
    );
    initGameConfigSettings();
    await loadGameConfigSettings();
    expect(resultText()).toBe(
      '❌ Could not load game settings: Admin token required'
    );
  });
});

describe('editing and saving', () => {
  it('reports no changes for an untouched form', async () => {
    const fetchMock = await loadWith();
    await saveGameConfigSettings();
    expect(resultText()).toBe('No changes to save.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adds a 2m test preset, offers it for sync rounds and saves only changed keys', async () => {
    const onSaved = vi.fn();
    const fetchMock = await loadWith(documentFor(), onSaved);

    $('add-preset-btn').click();
    const [idInput, secondsInput] = presetRows()
      .at(-1)
      .querySelectorAll('input');
    change(idInput, '2m');
    change(secondsInput, '120');
    expect(checklistValues('offer-sync')).toContain('2m');
    expect(
      Array.from($('default-sync-round-preset').options).map((o) => o.value)
    ).toContain('2m');

    tick('offer-sync', '2m');
    $('default-sync-round-preset').value = '2m';

    const savedDoc = documentFor(
      {
        ...CONFIG,
        duration_presets: { ...CONFIG.duration_presets, '2m': 120 },
      },
      2
    );
    fetchMock.mockResolvedValueOnce(okResponse(savedDoc));
    $('save-btn').click();
    await flush();

    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe('http://127.0.0.1:8000/admin/game-config');
    expect(request.method).toBe('PATCH');
    expect(JSON.parse(request.body)).toEqual({
      duration_presets: {
        '1m': 60,
        '5m': 300,
        '30m': 1800,
        '24h': 86400,
        '2m': 120,
      },
      sync_round_preset_ids: ['1m', '2m', '5m', '30m'],
      defaults: { sync_round_preset: '2m' },
    });
    expect(resultText()).toBe(
      '✅ Saved duration_presets, sync_round_preset_ids, defaults. Version 2 applies to rounds created from now on; existing rounds keep their settings.'
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(getActiveGameConfigDocument()).toEqual(savedDoc);
    expect($('version').textContent).toContain('Version 2');
  });

  it('saves "Require sign-in to join" as account_policy only when changed', async () => {
    const fetchMock = await loadWith();
    expect($('require-account').checked).toBe(false);

    $('require-account').checked = true;
    fetchMock.mockResolvedValueOnce(
      okResponse(
        documentFor(
          { ...CONFIG, account_policy: { require_account_to_join: true } },
          2
        )
      )
    );
    $('save-btn').click();
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      account_policy: { require_account_to_join: true },
    });
    expect($('require-account').checked).toBe(true);
    expect(resultText()).toContain('Saved account_policy.');
  });

  it('treats a backend without account_policy as "not required"', async () => {
    const legacyConfig = structuredClone(CONFIG);
    delete legacyConfig.account_policy;
    const fetchMock = await loadWith(documentFor(legacyConfig));
    expect($('require-account').checked).toBe(false);

    await saveGameConfigSettings();

    expect(resultText()).toBe('No changes to save.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('saves "Chat enabled by default" as defaults.chat_enabled only when changed', async () => {
    // CONFIG has no defaults.chat_enabled (older backend): read as enabled.
    const fetchMock = await loadWith();
    expect($('default-chat-enabled').checked).toBe(true);

    await saveGameConfigSettings();
    expect(resultText()).toBe('No changes to save.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    $('default-chat-enabled').checked = false;
    fetchMock.mockResolvedValueOnce(
      okResponse(
        documentFor(
          { ...CONFIG, defaults: { ...CONFIG.defaults, chat_enabled: false } },
          2
        )
      )
    );
    $('save-btn').click();
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      defaults: { chat_enabled: false },
    });
    expect($('default-chat-enabled').checked).toBe(false);
    expect(resultText()).toContain('Saved defaults.');
  });

  it('compares chat_enabled against an explicit backend value', () => {
    const baseline = structuredClone(CONFIG);
    baseline.defaults.chat_enabled = false;
    const draft = structuredClone(baseline);
    expect(buildGameConfigPatch(draft, baseline)).toEqual({});
    draft.defaults.chat_enabled = true;
    expect(buildGameConfigPatch(draft, baseline)).toEqual({
      defaults: { chat_enabled: true },
    });
  });

  it('removes presets from the checklists and default dropdowns', async () => {
    await loadWith();
    const row = presetRows().find(
      (tr) => tr.querySelector('input').value === '1m'
    );
    row.querySelector('button').click();
    expect(presetRows()).toHaveLength(3);
    expect(checklistValues('offer-sync')).not.toContain('1m');
    expect(checklistValues('offer-sync', { checkedOnly: true })).toEqual([
      '5m',
      '30m',
    ]);
    expect(
      Array.from($('default-async-session-preset').options).map((o) => o.value)
    ).not.toContain('1m');
  });

  it('edits trade default rows: new rows go before the open-ended last row', async () => {
    const fetchMock = await loadWith();
    $('add-trade-row-btn').click();
    const rows = tradeRows();
    expect(rows).toHaveLength(3);
    const [maxInput, countInput] = rows[1].querySelectorAll('input');
    maxInput.value = '3600';
    countInput.value = '3';
    // Remove the first row so the new one becomes the first bucket.
    rows[0].querySelector('button').click();

    fetchMock.mockResolvedValueOnce(okResponse(documentFor(CONFIG, 2)));
    await saveGameConfigSettings();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      trade_defaults: [
        { max_duration_seconds: 3600, trade_count: 3 },
        { max_duration_seconds: null, trade_count: 6 },
      ],
    });
  });

  it('shows parse errors for empty, duplicate and non-numeric input', async () => {
    const fetchMock = await loadWith();
    $('add-preset-btn').click();
    $('add-preset-btn').click();
    const [, dupRow] = presetRows().slice(-2);
    dupRow.querySelector('input').value = '5m';
    $('first-unlock').value = 'abc';
    $('default-enrollment').value = '2.5';

    await saveGameConfigSettings();
    expect(resultText()).toBe(
      '❌ Every preset needs an id. Preset id 5m is used twice. Default enrollment window must be a whole number. First unlock fraction must be a number.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows sanity-check errors such as an empty offered list', async () => {
    await loadWith();
    ['1m', '5m', '30m'].forEach((id) => tick('offer-sync', id, false));
    await saveGameConfigSettings();
    expect(resultText()).toBe(
      '❌ Offer at least one preset for sync rounds. Default sync round duration must be one of the offered presets.'
    );
  });

  it('renders the backend 422 detail when the save is rejected', async () => {
    const fetchMock = await loadWith();
    $('trade-max').value = '12';
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          {
            loc: ['body', 'trade_count_limits'],
            msg: 'Value error, max must be <= 10',
          },
        ],
      }),
    });
    await saveGameConfigSettings();
    expect(resultText()).toBe('❌ Save rejected: max must be <= 10');
    expect($('save-btn').disabled).toBe(false);
    expect(getActiveGameConfigDocument()).toBeNull();
  });

  it('reads the loaded form back into the same config', async () => {
    await loadWith();
    const { config, errors } = readGameConfigDraft();
    expect(errors).toEqual([]);
    // The legacy CONFIG has no chat or farming keys; the editor reads the
    // fallbacks (chat on, farming off / 300 s / 5 %, seed limits).
    expect(config).toEqual({
      ...CONFIG,
      defaults: {
        ...CONFIG.defaults,
        chat_enabled: true,
        farming_enabled: false,
        farming_min_duration_seconds: 300,
        farming_reward_rate: 0.05,
      },
      farming_min_duration_limits: { min_seconds: 10, max_seconds: 604800 },
      farming_reward_rate_limits: { min: 0.0001, max: 1 },
    });
    // ...and an unchanged legacy form sends nothing (no farming keys either).
    expect(buildGameConfigPatch(config, CONFIG)).toEqual({});
  });
});

describe('farming settings (Stage 1)', () => {
  const FARMING_CONFIG = {
    ...CONFIG,
    defaults: {
      ...CONFIG.defaults,
      farming_enabled: true,
      farming_min_duration_seconds: 600,
      farming_reward_rate: 0.1,
    },
    farming_min_duration_limits: { min_seconds: 30, max_seconds: 86400 },
    farming_reward_rate_limits: { min: 0.01, max: 0.5 },
  };

  it('renders farming defaults and limits (rewards in percent)', async () => {
    await loadWith(documentFor(FARMING_CONFIG));
    expect($('default-farming-enabled').checked).toBe(true);
    expect($('default-farming-min-duration').value).toBe('600');
    expect($('default-farming-reward').value).toBe('10');
    expect($('farming-duration-min').value).toBe('30');
    expect($('farming-duration-max').value).toBe('86400');
    expect($('farming-reward-min').value).toBe('1');
    expect($('farming-reward-max').value).toBe('50');
  });

  it('saves only the changed farming values', async () => {
    const fetchMock = await loadWith(documentFor(FARMING_CONFIG));
    $('default-farming-enabled').checked = false;
    $('default-farming-reward').value = '7';
    $('farming-reward-max').value = '60';
    fetchMock.mockResolvedValueOnce(okResponse(documentFor(FARMING_CONFIG, 2)));
    $('save-btn').click();
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      defaults: { farming_enabled: false, farming_reward_rate: 0.07 },
      farming_reward_rate_limits: { min: 0.01, max: 0.6 },
    });
  });

  it('rejects farming values outside their limits before saving', async () => {
    const fetchMock = await loadWith(documentFor(FARMING_CONFIG));
    $('default-farming-min-duration').value = '5';
    $('farming-reward-min').value = '0';
    $('save-btn').click();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultText()).toContain(
      'Default farming minimum duration must be within the farming duration limits.'
    );
    expect(resultText()).toContain('Farming reward limits');
  });

  it('reports unparsable farming inputs', async () => {
    await loadWith(documentFor(FARMING_CONFIG));
    $('default-farming-min-duration').value = '1.5';
    $('farming-reward-max').value = '';
    const { errors } = readGameConfigDraft();
    expect(errors).toEqual([
      'Default farming minimum duration must be a whole number.',
      'Farming reward limits max must be a number.',
    ]);
  });

  it('validates farming limit ranges', () => {
    const draft = structuredClone(FARMING_CONFIG);
    draft.farming_min_duration_limits = { min_seconds: 100, max_seconds: 50 };
    draft.farming_reward_rate_limits = { min: 0.2, max: 1.5 };
    draft.defaults.farming_reward_rate = 0.1;
    expect(validateGameConfigDraft(draft)).toEqual([
      'Farming duration limits: min must be >= 1 and <= max.',
      'Farming reward limits: min must be > 0% and <= max, max <= 100%.',
      'Default farming minimum duration must be within the farming duration limits.',
      'Default farming reward must be within the farming reward limits.',
    ]);
  });
});

describe('pure helpers', () => {
  const presets = { '1m': 60, '2m': 120, '5m': 300, '1h': 3600 };

  it('orders selections by duration when the loaded list is ascending', () => {
    expect(orderSelection(['5m', '2m', '1m'], ['1m', '5m'], presets)).toEqual([
      '1m',
      '2m',
      '5m',
    ]);
  });

  it('keeps a custom loaded order and appends new presets by duration', () => {
    expect(
      orderSelection(['1h', '5m', '2m', '1m'], ['5m', '1m'], presets)
    ).toEqual(['5m', '1m', '2m', '1h']);
    expect(orderSelection(['2m'], undefined, presets)).toEqual(['2m']);
  });

  it('builds a patch with whole top-level keys and partial defaults', () => {
    const draft = structuredClone(CONFIG);
    draft.trade_unlock.first_unlock_fraction = 0.25;
    draft.defaults.scoring_mode = 'power';
    expect(buildGameConfigPatch(draft, CONFIG)).toEqual({
      trade_unlock: {
        first_unlock_fraction: 0.25,
        remaining_window_fraction: 0.8,
      },
      defaults: { scoring_mode: 'power' },
    });
    expect(buildGameConfigPatch(structuredClone(CONFIG), CONFIG)).toEqual({});
    expect(Object.keys(buildGameConfigPatch(draft, undefined))).toContain(
      'duration_presets'
    );
  });

  it('accepts the normalized fallback config', () => {
    expect(validateGameConfigDraft(normalizeGameConfig(null))).toEqual([]);
  });

  it('flags every structural problem', () => {
    const draft = structuredClone(CONFIG);
    draft.duration_presets = { '1m': 0 };
    draft.async_round_preset_ids = [];
    draft.sync_round_preset_ids = ['1m'];
    draft.async_session_preset_ids = ['1m'];
    draft.defaults.async_session_preset = '1m';
    draft.duration_limits = { min_seconds: 100, max_seconds: 50 };
    draft.trade_count_limits = { min: -1, max: 3 };
    draft.defaults.enrollment_window_seconds = 1;
    draft.trade_defaults = [
      { max_duration_seconds: null, trade_count: 1 },
      { max_duration_seconds: 600, trade_count: 9 },
      { max_duration_seconds: 300, trade_count: 1 },
    ];
    draft.trade_unlock = {
      first_unlock_fraction: 0,
      remaining_window_fraction: 1.5,
    };

    expect(validateGameConfigDraft(draft)).toEqual([
      'Preset 1m must be longer than 0 seconds.',
      'Offer at least one preset for async rounds.',
      'Default sync round duration must be one of the offered presets.',
      'Default async round duration must be one of the offered presets.',
      'Custom duration limits: min must be >= 0 and <= max.',
      'Trade count limits: min must be >= 0 and <= max.',
      'Default enrollment window must be within the enrollment limits.',
      'Only the last trade default row may leave max duration empty.',
      'Trade count 9 is outside the trade count limits.',
      'Trade default max durations must be > 0 and ascending.',
      'First unlock fraction must be > 0 and <= 1.',
      'Remaining window fraction must be > 0 and <= 1.',
    ]);
  });

  it('requires at least one preset and one trade default row', () => {
    const draft = structuredClone(CONFIG);
    draft.duration_presets = {};
    draft.trade_defaults = [];
    expect(validateGameConfigDraft(draft)).toEqual(
      expect.arrayContaining([
        'Add at least one duration preset.',
        'Add at least one trade default row.',
      ])
    );
  });
});

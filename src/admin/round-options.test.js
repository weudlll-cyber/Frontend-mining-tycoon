/**
 * File: src/admin/round-options.test.js
 * Purpose: Verify the per-round options of the admin create form: percent <->
 *          rate conversion and bounds, global fee/spread placeholders (Global
 *          Economy section first, then GET /meta), the chat default, and the
 *          optional POST /games fields plus review rows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ globalMeta: null, economy: null }));
vi.mock('../meta/meta-manager.js', () => ({
  getGlobalMeta: () => state.globalMeta,
}));
vi.mock('./economy-settings.js', () => ({
  getLoadedEconomyConfig: () => state.economy,
}));

import {
  applyChatDefault,
  buildRoundOptionsReviewRows,
  collectRoundOptionsPayload,
  formatRateAsPercent,
  parsePercentToRate,
  refreshRateOverrideHints,
  resolveGlobalEconomyRates,
} from './round-options.js';

function buildForm() {
  document.body.replaceChildren();
  const add = (tag, id, props = {}) => {
    const node = document.createElement(tag);
    node.id = id;
    Object.assign(node, props);
    document.body.appendChild(node);
    return node;
  };
  add('input', 'admin-chat-enabled', { type: 'checkbox', checked: true });
  add('input', 'admin-fee-override', { type: 'text' });
  add('p', 'admin-fee-override-note');
  add('input', 'admin-spread-override', { type: 'text' });
  add('p', 'admin-spread-override-note');
}

const $ = (id) => document.getElementById(id);

beforeEach(() => {
  buildForm();
  applyChatDefault(null);
});

afterEach(() => {
  state.globalMeta = null;
  state.economy = null;
});

describe('percent <-> rate', () => {
  it('formats rates as percent without float noise', () => {
    expect(formatRateAsPercent(0.02)).toBe('2');
    expect(formatRateAsPercent(0.0125)).toBe('1.25');
    expect(formatRateAsPercent(0.07)).toBe('7');
    expect(formatRateAsPercent(undefined)).toBeNull();
    expect(formatRateAsPercent(Number.NaN)).toBeNull();
  });

  it('parses percent input into a rate and rejects insane values', () => {
    expect(parsePercentToRate('', 'Fee')).toEqual({ rate: null, error: null });
    expect(parsePercentToRate('  ', 'Fee')).toEqual({
      rate: null,
      error: null,
    });
    expect(parsePercentToRate('2.5', 'Fee')).toEqual({
      rate: 0.025,
      error: null,
    });
    expect(parsePercentToRate('0.07', 'Fee').rate).toBe(0.0007);
    expect(parsePercentToRate('0', 'Fee').rate).toBe(0);
    expect(parsePercentToRate('abc', 'Fee').error).toBe(
      'Fee override must be a number.'
    );
    expect(parsePercentToRate('-1', 'Fee').error).toBe(
      'Fee override must be at least 0% and below 100%.'
    );
    expect(parsePercentToRate('100', 'Fee').error).toContain('below 100%');
  });
});

describe('global economy placeholders', () => {
  it('prefers the loaded Global Economy section over GET /meta', () => {
    state.globalMeta = { conversion_fee_rate: 0.03, oracle_spread: 0.01 };
    state.economy = { conversion_fee_rate: 0.05 };
    expect(resolveGlobalEconomyRates()).toEqual({
      conversion_fee_rate: 0.05,
      oracle_spread: 0.01,
    });
  });

  it('shows the current global values as placeholder and note', () => {
    state.globalMeta = { conversion_fee_rate: 0.02, oracle_spread: 0.005 };
    refreshRateOverrideHints();
    expect($('admin-fee-override').placeholder).toBe('2');
    expect($('admin-fee-override-note').textContent).toBe(
      'Empty = use the global economy value (currently 2%).'
    );
    expect($('admin-spread-override').placeholder).toBe('0.5');
  });

  it('falls back to a generic hint when no global values are known', () => {
    refreshRateOverrideHints();
    expect($('admin-fee-override').placeholder).toBe('Global economy value');
    expect($('admin-spread-override-note').textContent).toBe(
      'Empty = use the global economy value (section 9).'
    );
  });

  it('tolerates a form without the override fields', () => {
    document.body.replaceChildren();
    expect(() => refreshRateOverrideHints()).not.toThrow();
  });
});

describe('payload and review', () => {
  it('omits every option when untouched (backend defaults, today behavior)', () => {
    expect(collectRoundOptionsPayload()).toEqual({});
    expect(buildRoundOptionsReviewRows()).toEqual([
      ['Conversion fee', 'Global economy'],
      ['Oracle spread', 'Global economy'],
      ['Chat', 'Enabled'],
    ]);
  });

  it('sends overrides as rates and chat only when changed from the default', () => {
    state.globalMeta = { conversion_fee_rate: 0.02, oracle_spread: 0.01 };
    $('admin-fee-override').value = '0';
    $('admin-chat-enabled').checked = false;
    expect(collectRoundOptionsPayload()).toEqual({
      conversion_fee_rate: 0,
      chat_enabled: false,
    });
    expect(buildRoundOptionsReviewRows()).toEqual([
      ['Conversion fee', '0% (override)'],
      ['Oracle spread', 'Global economy (1%)'],
      ['Chat', 'Disabled'],
    ]);
  });

  it('follows the configured chat default', () => {
    applyChatDefault({ defaults: { chat_enabled: false } });
    expect($('admin-chat-enabled').checked).toBe(false);
    expect(collectRoundOptionsPayload()).toEqual({});
    $('admin-chat-enabled').checked = true;
    expect(collectRoundOptionsPayload()).toEqual({ chat_enabled: true });
  });

  it('rejects invalid overrides and marks them in the review', () => {
    $('admin-spread-override').value = '150';
    expect(() => collectRoundOptionsPayload()).toThrow(
      'Oracle spread override must be at least 0% and below 100%.'
    );
    expect(buildRoundOptionsReviewRows()[1]).toEqual([
      'Oracle spread',
      'Invalid value',
    ]);
  });

  it('uses the remembered chat default when the checkbox is missing', () => {
    document.body.replaceChildren();
    applyChatDefault({ defaults: { chat_enabled: false } });
    expect(collectRoundOptionsPayload()).toEqual({});
    expect(buildRoundOptionsReviewRows()[2]).toEqual(['Chat', 'Disabled']);
  });
});

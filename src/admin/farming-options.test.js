/**
 * File: src/admin/farming-options.test.js
 * Purpose: Verify the Farming Stage 1 options of the admin create form:
 *          defaults/limits from the game config, payload fields, client
 *          checks (limits, shorter than round/session) and review rows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildFallbackGameConfig } from '../config/index.js';
import {
  applyFarmingDefaults,
  bindFarmingInputs,
  buildFarmingReviewRows,
  collectFarmingPayload,
  readFarmingForm,
  splitDuration,
} from './farming-options.js';

function loadAdminFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'admin.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
}

const $ = (id) => document.getElementById(`admin-farming-${id}`);

function configWith(defaults = {}, extra = {}) {
  const config = buildFallbackGameConfig();
  Object.assign(config.defaults, defaults);
  return Object.assign(config, extra);
}

beforeEach(() => {
  loadAdminFixture();
  applyFarmingDefaults(buildFallbackGameConfig());
});

describe('splitDuration', () => {
  it('picks the largest unit that divides evenly', () => {
    expect(splitDuration(300)).toEqual({ value: 5, unit: 'minutes' });
    expect(splitDuration(7200)).toEqual({ value: 2, unit: 'hours' });
    expect(splitDuration(172800)).toEqual({ value: 2, unit: 'days' });
    expect(splitDuration(90)).toEqual({ value: 90, unit: 'seconds' });
    expect(splitDuration('x')).toEqual({ value: 0, unit: 'seconds' });
  });
});

describe('applyFarmingDefaults', () => {
  it('applies the fallback defaults (off, 5 minutes, 5 %)', () => {
    expect($('enabled').checked).toBe(false);
    expect($('min-duration-value').value).toBe('5');
    expect($('min-duration-unit').value).toBe('minutes');
    expect($('reward').value).toBe('5');
    expect($('reward').min).toBe('0.01');
    expect($('reward').max).toBe('100');
    expect($('reward').disabled).toBe(true);
    expect($('fields').classList.contains('farming-fields-off')).toBe(true);
    expect($('note').textContent).toContain('10s to 7d');
  });

  it('applies backend defaults and limits', () => {
    applyFarmingDefaults(
      configWith(
        {
          farming_enabled: true,
          farming_min_duration_seconds: 3600,
          farming_reward_rate: 0.025,
        },
        { farming_reward_rate_limits: { min: 0.01, max: 0.5 } }
      )
    );
    expect($('enabled').checked).toBe(true);
    expect($('min-duration-value').value).toBe('1');
    expect($('min-duration-unit').value).toBe('hours');
    expect($('reward').value).toBe('2.5');
    expect($('reward').max).toBe('50');
    expect($('reward').disabled).toBe(false);
  });

  it('copes with a missing config and a missing form', () => {
    applyFarmingDefaults(null);
    expect($('enabled').checked).toBe(false);
    document.body.innerHTML = '';
    expect(() => applyFarmingDefaults(buildFallbackGameConfig())).not.toThrow();
    expect(collectFarmingPayload(600)).toEqual({});
    expect(buildFarmingReviewRows(600)).toEqual([]);
  });
});

describe('payload and review', () => {
  it('sends nothing while farming stays off by default', () => {
    expect(collectFarmingPayload(600)).toEqual({});
    expect(buildFarmingReviewRows(600)).toEqual([['Farming', 'Disabled']]);
  });

  it('sends farming_enabled false when the default is on', () => {
    applyFarmingDefaults(configWith({ farming_enabled: true }));
    $('enabled').checked = false;
    expect(collectFarmingPayload(600)).toEqual({ farming_enabled: false });
  });

  it('sends all farming values when enabled', () => {
    $('enabled').checked = true;
    $('min-duration-value').value = '2';
    $('min-duration-unit').value = 'minutes';
    $('reward').value = '7';
    expect(collectFarmingPayload(600)).toEqual({
      farming_enabled: true,
      farming_min_duration_seconds: 120,
      farming_reward_rate: 0.07,
    });
    expect(buildFarmingReviewRows(600)).toEqual([
      ['Farming', 'Enabled: 7% per 2m cycle'],
    ]);
  });

  it('requires the minimum duration to be shorter than the round/session', () => {
    $('enabled').checked = true;
    $('min-duration-value').value = '10';
    $('min-duration-unit').value = 'minutes';
    expect(() => collectFarmingPayload(600)).toThrow(
      'Farming minimum duration (10m) must be shorter than the round/session duration (10m).'
    );
    expect(buildFarmingReviewRows(600)[0][1]).toMatch(/^Invalid: /);
    // Unknown window (0) skips the comparison; the backend still checks.
    expect(collectFarmingPayload(0).farming_min_duration_seconds).toBe(600);
  });

  it('checks the configured limits and number formats', () => {
    $('enabled').checked = true;
    $('min-duration-value').value = '5';
    $('min-duration-unit').value = 'seconds';
    $('reward').value = '200';
    expect(readFarmingForm(600).errors).toEqual([
      'Farming minimum duration must be between 10s and 7d.',
      'Farming reward must be between 0.01% and 100%.',
    ]);
    $('min-duration-value').value = '';
    $('reward').value = 'abc';
    expect(readFarmingForm(600).errors).toEqual([
      'Farming minimum duration must be a positive number.',
      'Farming reward must be a percent value.',
    ]);
    // 100 % is the seed maximum and accepted.
    $('min-duration-value').value = '1';
    $('min-duration-unit').value = 'minutes';
    $('reward').value = '100';
    expect(readFarmingForm(600)).toMatchObject({ errors: [], rewardRate: 1 });
  });
});

describe('bindFarmingInputs', () => {
  it('refreshes the review and field state on changes', () => {
    const onChange = vi.fn();
    bindFarmingInputs(onChange);
    $('enabled').checked = true;
    $('enabled').dispatchEvent(new Event('change'));
    expect($('reward').disabled).toBe(false);
    $('reward').dispatchEvent(new Event('input'));
    $('min-duration-value').dispatchEvent(new Event('input'));
    $('min-duration-unit').dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

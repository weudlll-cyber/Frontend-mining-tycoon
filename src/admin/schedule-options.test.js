/**
 * File: src/admin/schedule-options.test.js
 * Purpose: Unit tests for the admin "Start now / Schedule start" helpers
 *          (client-side window check, payload, review rows, visibility)
 *          against the real admin.html markup.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  applyScheduleState,
  bindScheduleInputs,
  buildScheduleReviewRows,
  collectSchedulePayload,
  getMaxDaysAhead,
  isScheduleSelected,
  validateScheduledStart,
} from './schedule-options.js';
import { setGameConfigDocument } from '../config/index.js';
import { toDateTimeLocalValue } from '../utils/schedule-time.js';

function loadAdminFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'admin.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
}

const $ = (id) => document.getElementById(id);

beforeEach(() => {
  loadAdminFixture();
});

afterEach(() => {
  setGameConfigDocument(null);
});

describe('validateScheduledStart', () => {
  const now = 1_800_000_000;

  it('accepts a start between now + 60 s and max_days_ahead', () => {
    expect(
      validateScheduledStart(now + 60, { nowSeconds: now, maxDaysAhead: 30 })
    ).toBe('');
    expect(
      validateScheduledStart(now + 30 * 86400, {
        nowSeconds: now,
        maxDaysAhead: 30,
      })
    ).toBe('');
  });

  it('rejects a missing, too-early or too-far start', () => {
    expect(validateScheduledStart(null)).toContain('Choose a date');
    expect(
      validateScheduledStart(now + 59, { nowSeconds: now, maxDaysAhead: 30 })
    ).toContain('at least 1 minute');
    expect(
      validateScheduledStart(now + 2 * 86400 + 1, {
        nowSeconds: now,
        maxDaysAhead: 2,
      })
    ).toBe('The scheduled start must be at most 2 days ahead.');
  });

  it('uses the effective game config (fallback 30 days)', () => {
    expect(getMaxDaysAhead()).toBe(30);
    setGameConfigDocument({
      version: 5,
      config: { scheduling: { max_days_ahead: 7 } },
    });
    expect(getMaxDaysAhead()).toBe(7);
    const tooFar = Math.floor(Date.now() / 1000) + 8 * 86400;
    expect(validateScheduledStart(tooFar)).toContain('at most 7 days ahead');
  });
});

describe('schedule controls in admin.html', () => {
  it('starts with "Start now": row hidden, no payload, "Starts: Now"', () => {
    applyScheduleState('sync');
    expect(isScheduleSelected()).toBe(false);
    expect($('admin-scheduled-start-row').hidden).toBe(true);
    expect($('admin-scheduled-start-hint').textContent).toBe('');
    expect(collectSchedulePayload('sync')).toEqual({});
    expect(buildScheduleReviewRows('sync')).toEqual([
      ['Starts', 'Now (enrollment opens on creation)'],
    ]);
  });

  it('shows the picker with bounds, zone and hint when scheduling', () => {
    const now = Math.floor(Date.now() / 60000) * 60;
    $('admin-start-scheduled').checked = true;
    let changes = 0;
    bindScheduleInputs(
      () => 'sync',
      () => {
        changes += 1;
      }
    );
    $('admin-scheduled-start').value = toDateTimeLocalValue(now + 3 * 3600);
    $('admin-scheduled-start').dispatchEvent(new Event('input'));

    expect(changes).toBe(1);
    expect($('admin-scheduled-start-row').hidden).toBe(false);
    expect($('admin-scheduled-start').required).toBe(true);
    expect($('admin-scheduled-start').max).not.toBe('');
    expect($('admin-scheduled-start-hint').textContent).toContain(
      'Upcoming until it opens'
    );
    expect($('admin-scheduled-start-hint').dataset.kind).toBe('info');
    expect($('admin-scheduled-start').getAttribute('aria-invalid')).toBe(
      'false'
    );
    expect(collectSchedulePayload('sync')).toEqual({
      scheduled_start_at: now + 3 * 3600,
    });
    expect(buildScheduleReviewRows('sync', now)).toEqual([
      ['Starts', expect.stringMatching(/\(in 3 h 00 min\)$/)],
    ]);

    // Async rounds never carry the field and hide the controls.
    applyScheduleState('async');
    expect(
      $('admin-schedule-fields').classList.contains('hidden-section')
    ).toBe(true);
    expect(collectSchedulePayload('async')).toEqual({});
    expect(buildScheduleReviewRows('async')).toEqual([]);
  });

  it('flags an invalid time in the hint', () => {
    $('admin-start-scheduled').checked = true;
    applyScheduleState('sync');
    expect($('admin-scheduled-start-hint').dataset.kind).toBe('error');
    expect($('admin-scheduled-start').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(() => collectSchedulePayload('sync')).toThrow('Choose a date');
  });

  it('does nothing on a page without the controls', () => {
    document.body.innerHTML = '';
    expect(() => applyScheduleState('sync')).not.toThrow();
    expect(() =>
      bindScheduleInputs(
        () => 'sync',
        () => {}
      )
    ).not.toThrow();
    expect(isScheduleSelected()).toBe(false);
  });
});

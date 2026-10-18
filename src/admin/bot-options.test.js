/**
File: src/admin/bot-options.test.js
Purpose: Admin "Bot opponents" inputs: payload, review rows, limits.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  applyBotLimits,
  bindBotInputs,
  buildBotReviewRows,
  collectBotPayload,
  readBotForm,
} from './bot-options.js';

const $ = (level) => document.getElementById(`admin-bots-${level}`);

beforeEach(() => {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'admin.html'),
    'utf8'
  );
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  applyBotLimits(null);
});

describe('bot options', () => {
  it('sends nothing without bots and nothing for async rounds', () => {
    expect(collectBotPayload('sync')).toEqual({});
    expect(buildBotReviewRows('sync')).toEqual([['Bots', 'None']]);
    $('hard').value = '2';
    expect(collectBotPayload('async')).toEqual({});
    expect(buildBotReviewRows('async')).toEqual([]);
  });

  it('sends the counts per level and lists them in the review', () => {
    $('easy').value = '2';
    $('hard').value = '1';
    expect(collectBotPayload('sync')).toEqual({
      bots: { easy: 2, medium: 0, hard: 1 },
    });
    expect(buildBotReviewRows('sync')).toEqual([['Bots', '2 Easy, 1 Hard']]);
  });

  it('checks whole numbers and the limit from /meta', () => {
    applyBotLimits({ max_bots_per_round: 3 });
    expect($('medium').max).toBe('3');
    expect(document.getElementById('admin-bots-note').textContent).toContain(
      'Up to 3 bots'
    );
    $('easy').value = '2';
    $('medium').value = '2';
    expect(() => collectBotPayload('sync')).toThrow(
      'At most 3 bots per round (now 4).'
    );
    expect(buildBotReviewRows('sync')[0][1]).toMatch(/^Invalid: /);
    $('medium').value = '1.5';
    expect(readBotForm().errors).toContain(
      'Medium bots must be a whole number of 0 or more.'
    );
  });

  it('refreshes the review when a count changes', () => {
    const onChange = vi.fn();
    bindBotInputs(onChange);
    $('easy').dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalled();
  });
});

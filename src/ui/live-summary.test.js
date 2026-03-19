/*
File: src/ui/live-summary.test.js
Purpose: Verify async session badge rendering in top summary.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import { initLiveSummary, renderAsyncSessionBadge } from './live-summary.js';

describe('live-summary async badge', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span id="my-score"></span>
      <span id="my-rank"></span>
      <span id="top-score"></span>
      <span id="portfolio-value"></span>
      <span id="async-session-status" class="badge badge-gray" hidden>Async: n/a</span>
    `;

    initLiveSummary({
      myScoreEl: document.getElementById('my-score'),
      myRankEl: document.getElementById('my-rank'),
      topScoreEl: document.getElementById('top-score'),
      portfolioValueEl: document.getElementById('portfolio-value'),
      asyncSessionStatusEl: document.getElementById('async-session-status'),
      getGameMeta: () => null,
      defaultTokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });
  });

  it('shows Async: Session Active badge when session is active', () => {
    const badge = document.getElementById('async-session-status');

    renderAsyncSessionBadge({
      roundMode: 'async',
      sessionActive: true,
      sessionSupported: true,
    });

    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('Async: Session Active');
    expect(badge.classList.contains('badge-green')).toBe(true);
  });
});

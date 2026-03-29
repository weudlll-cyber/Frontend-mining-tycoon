/**
File: src/ui/live-summary.test.js
Purpose: Verify async session badge rendering in top summary.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import {
  initLiveSummary,
  renderAsyncSessionBadge,
  renderQuickStats,
} from './live-summary.js';

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

  it('shows Async: Ready badge when async predicates are not all true', () => {
    const badge = document.getElementById('async-session-status');

    renderAsyncSessionBadge({
      roundMode: 'async',
      sessionActive: false,
      sessionSupported: true,
      asyncReady: false,
      asyncAvailability: {
        isAsyncRound: true,
        isWindowOpen: null,
        isJoined: false,
        backendSessionSupport: true,
        hasNoActiveSession: true,
        requireAuth: 'unknown',
      },
    });

    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('Async: Ready');
    expect(badge.classList.contains('badge-gray')).toBe(true);
  });

  it('shows Async: Ready when asyncReady is true', () => {
    const badge = document.getElementById('async-session-status');

    renderAsyncSessionBadge({
      roundMode: 'async',
      sessionActive: false,
      sessionSupported: true,
      asyncReady: true,
      asyncAvailability: {
        isAsyncRound: true,
        isWindowOpen: true,
        isJoined: true,
        backendSessionSupport: true,
        hasNoActiveSession: true,
        requireAuth: true,
      },
    });

    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('Async: Ready');
    expect(badge.classList.contains('badge-blue')).toBe(true);
  });

  it('uses stable comma formatting for score values', () => {
    renderQuickStats({
      player_id: '42',
      leaderboard_top_5: [
        { player_id: '42', score: 6343 },
      ],
      player_state: { score: 6343 },
    });

    expect(document.getElementById('my-score')?.textContent).toBe('6,343');
    expect(document.getElementById('top-score')?.textContent).toBe('6,343');
  });

  it('shows live async score while session is running even before finalized leaderboard score exists', () => {
    initLiveSummary({
      myScoreEl: document.getElementById('my-score'),
      myRankEl: document.getElementById('my-rank'),
      topScoreEl: document.getElementById('top-score'),
      portfolioValueEl: document.getElementById('portfolio-value'),
      asyncSessionStatusEl: document.getElementById('async-session-status'),
      getGameMeta: () => ({
        token_names: ['spring', 'summer', 'autumn', 'winter'],
        oracle_prices: { spring: 10, summer: 10, autumn: 10, winter: 10 },
      }),
      defaultTokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    renderQuickStats({
      game_id: '77',
      player_id: '1',
      session: { status: 'running' },
      leaderboard_top_5: [{ player_id: '1', score: 0 }],
      player_state: {
        balances: { spring: 2, summer: 3, autumn: 0, winter: 0 },
      },
    });

    expect(document.getElementById('my-score')?.textContent).toBe('50');
    expect(document.getElementById('top-score')?.textContent).toBe('50');
  });
});

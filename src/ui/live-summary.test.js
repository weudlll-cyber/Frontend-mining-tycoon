/*
File: src/ui/live-summary.test.js
Purpose: Verify async session badge rendering in top summary.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import {
  initLiveSummary,
  renderAsyncSessionBadge,
  renderAsyncScoreLines,
} from './live-summary.js';

describe('live-summary async badge', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span id="my-score"></span>
      <span id="my-rank"></span>
      <span id="top-score"></span>
      <span id="portfolio-value"></span>
      <span id="async-session-status" class="badge badge-gray" hidden>Async: n/a</span>
      <div id="async-score-lines" hidden>
        <span id="this-session-score">This session: —</span>
        <span id="best-round-score">Best this round: —</span>
      </div>
    `;

    initLiveSummary({
      myScoreEl: document.getElementById('my-score'),
      myRankEl: document.getElementById('my-rank'),
      topScoreEl: document.getElementById('top-score'),
      portfolioValueEl: document.getElementById('portfolio-value'),
      asyncScoreLinesEl: document.getElementById('async-score-lines'),
      thisSessionScoreEl: document.getElementById('this-session-score'),
      bestRoundScoreEl: document.getElementById('best-round-score'),
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

  it('renders This session and Best this round lines for async best-of payload', () => {
    const wrapper = document.getElementById('async-score-lines');
    const thisSession = document.getElementById('this-session-score');
    const bestRound = document.getElementById('best-round-score');

    renderAsyncScoreLines({
      scoring_aggregate: 'best_of',
      current_session_score: 1234,
      player_best_of_score: 5678,
    });

    expect(wrapper.hidden).toBe(false);
    expect(thisSession.textContent).toMatch(/This session:\s+1[\s,\u00A0]234/);
    expect(bestRound.textContent).toMatch(/Best this round:\s+5[\s,\u00A0]678/);
    expect(thisSession.title).toMatch(/Exact value:\s+1[\s,\u00A0]234/);
    expect(bestRound.title).toMatch(/Exact value:\s+5[\s,\u00A0]678/);
  });
});

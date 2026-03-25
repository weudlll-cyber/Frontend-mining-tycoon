/**
File: src/main.halving.test.js
Purpose: Halving helper behavior tests split from main.test.js.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-duration" value="300" />
      <input id="enrollment-window" value="60" />
      <input id="game-id" value="1" />
      <input id="player-id" value="1" />
      <button id="new-game-btn"></button>
      <button id="start-btn"></button>
      <button id="stop-btn"></button>
      <div id="conn-status"></div>
      <div id="game-status"></div>
      <div id="countdown"></div>
      <div id="countdown-label"></div>
      <div id="new-game-status"></div>
      <div id="meta-debug"></div>
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="upgrades"></div>
      <div id="portfolio-value">—</div>
    </div>
  `;
}

let mainModule;

async function loadMainModule() {
  mainModule = await import('./main.js');
  return mainModule;
}

beforeEach(() => {
  vi.resetModules();
  buildDomFixture();
});

describe('Seasonal Oracle halving helpers', () => {
  it('ignores stale state next_halving and uses computed strict-future selection', async () => {
    const module = await loadMainModule();
    const result = module.resolveNextHalvingTarget({
      data: {
        current_sim_month: 8.9,
        next_halving: {
          token: 'winter',
          halving_at_unix: 1890000000,
        },
      },
      activeGameMeta: {
        sim_months_per_real_second: 1,
        season_cycles_per_game: 1,
      },
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(result).not.toBeNull();
    expect(result.token).toBe('summer');
  });

  it('derives next_halving absolute unix target when state field is missing', async () => {
    const module = await loadMainModule();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const result = module.resolveNextHalvingTarget({
      data: {
        current_sim_month: 8,
      },
      activeGameMeta: {
        sim_months_per_real_second: 1,
      },
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(result).not.toBeNull();
    expect(result.token).toBe('summer');
    expect(result.halvingAtUnix).toBeCloseTo(1_700_000_001, 6);
  });

  it('detects post-halving window per token from sim month', async () => {
    const module = await loadMainModule();

    expect(module.computeTokenHalvingCount('spring', 8.9999)).toBe(1);
    expect(module.computeTokenHalvingCount('summer', 8.9999)).toBe(0);
    expect(module.computeTokenHalvingCount('summer', 9.0001)).toBe(1);
    expect(module.computeTokenHalvingCount('autumn', 18.0001)).toBe(1);
  });

  it('returns zero halving count for invalid token or month', async () => {
    const module = await loadMainModule();

    expect(module.computeTokenHalvingCount('invalid', 10)).toBe(0);
    expect(module.computeTokenHalvingCount('spring', Number.NaN)).toBe(0);
  });

  it('shows halving indicator only inside narrow current halving window', async () => {
    const module = await loadMainModule();

    expect(module.shouldShowTokenHalvingIndicator('summer', 9.2)).toBe(true);
    expect(module.shouldShowTokenHalvingIndicator('summer', 10.1)).toBe(false);
  });

  it('after second token halves, first token no longer shows halving indicator', async () => {
    const module = await loadMainModule();

    expect(module.shouldShowTokenHalvingIndicator('summer', 9.2)).toBe(true);
    expect(module.shouldShowTokenHalvingIndicator('spring', 9.2)).toBe(false);
  });

  it('selects only the smallest strictly-future halving across tokens', async () => {
    const module = await loadMainModule();

    const hint = module.computeNextHalvingHint({
      currentSimMonth: 8.9,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(hint).not.toBeNull();
    expect(hint.token).toBe('summer');
    expect(hint.halvingMonth).toBe(9);
    expect(hint.deltaSeconds).toBeCloseTo(0.1, 6);
  });

  it('switches next halving from token A to token B after passing A boundary', async () => {
    const module = await loadMainModule();

    const before = module.computeNextHalvingHint({
      currentSimMonth: 8.9,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });
    const after = module.computeNextHalvingHint({
      currentSimMonth: 9.1,
      simMonthsPerRealSecond: 1,
      simMonthsTotal: 36,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
    });

    expect(before.token).toBe('summer');
    expect(after.token).toBe('autumn');
    expect(after.halvingMonth).toBe(18);
  });

  it('does not reset countdown target for same token and halving month', async () => {
    const module = await loadMainModule();

    const prev = { token: 'summer', halvingMonth: 9, halvingAtUnix: 1000 };
    const next = { token: 'summer', halvingMonth: 9, halvingAtUnix: 2000 };

    expect(module.shouldResetNextHalvingCountdownTarget(prev, next)).toBe(
      false
    );
  });

  it('resets countdown target when token or halving month changes', async () => {
    const module = await loadMainModule();

    const prev = { token: 'summer', halvingMonth: 9, halvingAtUnix: 1000 };
    const nextTokenChanged = {
      token: 'autumn',
      halvingMonth: 18,
      halvingAtUnix: 2000,
    };
    const nextMonthChanged = {
      token: 'summer',
      halvingMonth: 45,
      halvingAtUnix: 3000,
    };

    expect(
      module.shouldResetNextHalvingCountdownTarget(prev, nextTokenChanged)
    ).toBe(true);
    expect(
      module.shouldResetNextHalvingCountdownTarget(prev, nextMonthChanged)
    ).toBe(true);
  });

  it('last halving notice appears right after boundary crossing', async () => {
    const module = await loadMainModule();

    const before = module.computeMostRecentPastHalving({
      currentSimMonth: 8.9,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
      simMonthsTotal: 36,
    });
    const after = module.computeMostRecentPastHalving({
      currentSimMonth: 9.1,
      tokenNames: ['spring', 'summer', 'autumn', 'winter'],
      simMonthsTotal: 36,
    });

    const updateBefore = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: null,
      previousNotice: null,
      mostRecentPastHalving: before,
      nowUnix: 100,
    });
    const updateAfter = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: updateBefore.seenKey,
      previousNotice: updateBefore.notice,
      mostRecentPastHalving: after,
      nowUnix: 101,
    });

    expect(updateAfter.changed).toBe(true);
    expect(updateAfter.notice.token).toBe('summer');
    expect(updateAfter.notice.halvingMonth).toBe(9);
  });

  it('last halving notice reducer keeps notice stable during repeated refreshes', async () => {
    const module = await loadMainModule();

    const mostRecent = { token: 'summer', halvingMonth: 9 };
    const first = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: null,
      previousNotice: null,
      mostRecentPastHalving: mostRecent,
      nowUnix: 100,
    });

    const refresh1 = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: first.seenKey,
      previousNotice: first.notice,
      mostRecentPastHalving: mostRecent,
      nowUnix: 102,
    });
    const refresh2 = module.deriveLastHalvingNoticeUpdate({
      previousSeenKey: refresh1.seenKey,
      previousNotice: refresh1.notice,
      mostRecentPastHalving: mostRecent,
      nowUnix: 106,
    });

    expect(first.changed).toBe(true);
    expect(refresh1.changed).toBe(false);
    expect(refresh2.changed).toBe(false);
    expect(refresh1.notice).toBe(first.notice);
    expect(refresh2.notice).toBe(first.notice);
  });

  it('last halving notice timeout threshold is fixed and short-lived', async () => {
    const module = await loadMainModule();

    expect(module.LAST_HALVING_NOTICE_SECONDS).toBe(8);
  });
});

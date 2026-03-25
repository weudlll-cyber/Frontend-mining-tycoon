/**
File: src/main.halving-passthrough.test.js
Purpose: Small passthrough checks for main halving helpers.
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

describe('main halving helper passthroughs', () => {
  it('resets next-halving target only when hash changed', async () => {
    const module = await loadMainModule();

    expect(module.shouldResetNextHalvingCountdownTarget(null, null)).toBe(true);
    expect(
      module.shouldResetNextHalvingCountdownTarget(
        { token: 'spring', halvingMonth: 3 },
        { token: 'spring', halvingMonth: 3 }
      )
    ).toBe(false);
    expect(
      module.shouldResetNextHalvingCountdownTarget(
        { token: 'spring', halvingMonth: 3 },
        { token: 'summer', halvingMonth: 3 }
      )
    ).toBe(true);
  });

  it('returns null target when no future halving exists', async () => {
    const module = await loadMainModule();

    const target = module.resolveNextHalvingTarget({
      game_id: 'g1',
      phase: 'running',
      server_time_seconds: 500,
      cycle_seconds: 300,
      emission: {
        current_cycle_elapsed_seconds: 200,
      },
      global_events: {
        halving: {
          occurred_count: 4,
          max_count: 4,
          interval_cycles: 2,
        },
      },
    });

    expect(target).toBeNull();
  });
});

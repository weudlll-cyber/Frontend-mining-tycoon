// Tests the meta debug line of the player board.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const metaState = vi.hoisted(() => ({ gameMeta: null }));

vi.mock('../meta/meta-manager.js', () => ({
  getActiveContractVersion: () => 3,
  getActiveMetaHash: () => 'abcdef1234567890',
  getGameMeta: () => metaState.gameMeta,
  shortMetaHash: (hash) => String(hash || '').slice(0, 6),
}));

let metaDebug;
let els;

beforeEach(async () => {
  vi.resetModules();
  metaState.gameMeta = null;
  document.body.innerHTML = `
    <input id="game-id" value="7" />
    <div id="meta-debug"></div>
  `;
  els = {
    gameIdInput: document.getElementById('game-id'),
    metaDebugEl: document.getElementById('meta-debug'),
  };
  metaDebug = await import('./meta-debug.js');
  metaDebug.initMetaDebug(els);
});

describe('renderMetaDebugLine', () => {
  it('shows contract version and meta hash without game meta', () => {
    metaDebug.renderMetaDebugLine();
    expect(els.metaDebugEl.textContent).toBe('contract v3 | meta_hash abcdef');
  });

  it.each([
    [45, '45s'],
    [600, '10m'],
    [7200, '2h'],
    [172800, '2d'],
  ])('formats a %is round as %s', (seconds, label) => {
    metaState.gameMeta = { game_duration_seconds: seconds };
    metaDebug.renderMetaDebugLine();
    expect(els.metaDebugEl.textContent).toContain(`Duration: ${label}`);
  });

  it('appends emission, cycles and scoring mode when present', () => {
    metaState.gameMeta = {
      game_duration_seconds: 600,
      emission_anchor_token: 'spring',
      emission_anchor_tokens_per_second: 5,
      season_cycles_per_game: 2,
      scoring_mode: 'power',
    };
    metaDebug.renderMetaDebugLine();
    expect(els.metaDebugEl.textContent).toBe(
      'contract v3 | meta_hash abcdef | Duration: 10m | Emission: spring @ 5/s | Cycles: 2 | Scoring: Power Mode'
    );
  });

  it('uses ? for a missing emission rate', () => {
    metaState.gameMeta = {
      game_duration_seconds: 60,
      emission_anchor_token: 'winter',
    };
    metaDebug.renderMetaDebugLine();
    expect(els.metaDebugEl.textContent).toContain('Emission: winter @ ?/s');
  });
});

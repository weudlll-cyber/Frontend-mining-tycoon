// Tests the meta debug line and the derived-emission preview of the player board.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const metaState = vi.hoisted(() => ({ gameMeta: null }));

vi.mock('../meta/meta-manager.js', () => ({
  getActiveContractVersion: () => 3,
  getActiveMetaHash: () => 'abcdef1234567890',
  getGameMeta: () => metaState.gameMeta,
  shortMetaHash: (hash) => String(hash || '').slice(0, 6),
}));

const TOKENS = ['spring', 'summer', 'autumn', 'winter'];
let metaDebug;
let els;

beforeEach(async () => {
  vi.resetModules();
  metaState.gameMeta = null;
  document.body.innerHTML = `
    <input id="game-id" value="7" />
    <div id="meta-debug"></div>
    <div id="derived-emission-preview" style="display:none"></div>
  `;
  els = {
    gameIdInput: document.getElementById('game-id'),
    metaDebugEl: document.getElementById('meta-debug'),
    derivedEmissionPreviewEl: document.getElementById(
      'derived-emission-preview'
    ),
  };
  metaDebug = await import('./meta-debug.js');
  metaDebug.initMetaDebug({ ...els, tokens: TOKENS });
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

describe('renderDerivedEmissionPreview', () => {
  it('stays hidden without a game id', () => {
    els.gameIdInput.value = '';
    metaDebug.renderDerivedEmissionPreview();
    expect(els.derivedEmissionPreviewEl.style.display).toBe('none');
  });

  it('stays hidden without derived rates', () => {
    metaState.gameMeta = {};
    metaDebug.renderDerivedEmissionPreview();
    expect(els.derivedEmissionPreviewEl.style.display).toBe('none');
  });

  it('stays hidden when a token rate is missing', () => {
    metaState.gameMeta = {
      derived_emission_rates_per_second: { spring: 1, summer: 2 },
    };
    metaDebug.renderDerivedEmissionPreview();
    expect(els.derivedEmissionPreviewEl.style.display).toBe('none');
  });

  it('lists every token rate with two decimals', () => {
    metaState.gameMeta = {
      derived_emission_rates_per_second: {
        spring: 1,
        summer: 2.5,
        autumn: 0.333,
        winter: 4,
      },
    };
    metaDebug.renderDerivedEmissionPreview();
    expect(els.derivedEmissionPreviewEl.style.display).toBe('block');
    expect(els.derivedEmissionPreviewEl.textContent).toBe(
      'Derived Rates: spring 1.00, summer 2.50, autumn 0.33, winter 4.00 /s'
    );
  });
});

/*
File: src/services/game-actions.test.js
Purpose: Validate setup-driven game creation/join flow for sync and host-style async rounds.
Role in system:
- Proves frontend request shaping and orchestration stay intent-only while backend remains authoritative.
Invariants:
- Async host flow must create and join first; optional auto-start must be explicit.
- Errors remain inline through status callbacks rather than modal UX.
Security notes:
- Tests verify payload/headers only and never expose token content.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameAndJoin, initGameActions } from './game-actions.js';

function buildDeps(overrides = {}) {
  return {
    isActiveContractSupported: vi.fn(() => true),
    showToast: vi.fn(),
    getLastGameData: vi.fn(() => null),
    getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
    getStorageItem: vi.fn(() => null),
    getPlayerTokenStorageKey: vi.fn(() => 'player-token-key'),
    getSelectedTokens: vi.fn(() => ({
      targetToken: 'spring',
      payToken: 'spring',
    })),
    disconnectChat: vi.fn(),
    hasOpenStream: vi.fn(() => false),
    stopActiveStream: vi.fn(),
    onSetupBusyChange: vi.fn(),
    clearNewGameStatus: vi.fn(),
    showNewGameStatus: vi.fn(),
    getPlayerName: vi.fn(() => 'Tester'),
    getEnrollmentWindow: vi.fn(() => 600),
    getSelectedRoundType: vi.fn(() => 'async'),
    getAsyncDurationPreset: vi.fn(() => '10m'),
    shouldAutoStartAsyncSession: vi.fn(() => true),
    cleanupGameMetaCache: vi.fn(),
    resolveDurationSeconds: vi.fn(() => ({ mode: 'preset', preset: '30m' })),
    collectAdvancedOverrides: vi.fn(() => ({})),
    setGameId: vi.fn(),
    setPlayerId: vi.fn(),
    setStorageItem: vi.fn(),
    markGameMetaSeen: vi.fn(),
    fetchMetaSnapshot: vi.fn(async () => ({})),
    saveSettings: vi.fn(),
    ensureInputsEditable: vi.fn(),
    startLiveStream: vi.fn(async () => {}),
    autoStartAsyncSession: vi.fn(async () => ({
      ok: true,
      sessionId: 'session-1',
    })),
    setSetupCollapsed: vi.fn(),
    scrollToLiveBoard: vi.fn(),
    ...overrides,
  };
}

describe('game-actions async host flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends async create payload with round_type, enrollment window, and duration preset', async () => {
    const deps = buildDeps({
      shouldAutoStartAsyncSession: vi.fn(() => false),
    });
    initGameActions(deps);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ game_id: 'g-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ player_id: 'p-1' }),
      });
    globalThis.fetch = fetchMock;

    await createNewGameAndJoin();

    const createCall = fetchMock.mock.calls[0];
    const createBody = JSON.parse(createCall[1].body);

    expect(createCall[0]).toBe('http://127.0.0.1:8000/games');
    expect(createBody.round_type).toBe('asynchronous');
    expect(createBody.enrollment_window_seconds).toBe(600);
    expect(createBody.duration_mode).toBe('preset');
    expect(createBody.duration_preset).toBe('10m');
  });

  it('auto-start ON triggers async session startup and avoids legacy start stream call', async () => {
    const deps = buildDeps({
      shouldAutoStartAsyncSession: vi.fn(() => true),
    });
    initGameActions(deps);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ game_id: 'g-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ player_id: 'p-1', player_token: 'tok' }),
      });

    await createNewGameAndJoin();

    expect(deps.autoStartAsyncSession).toHaveBeenCalledTimes(1);
    expect(deps.autoStartAsyncSession).toHaveBeenCalledWith({
      gameId: 'g-1',
      playerId: 'p-1',
    });
    expect(deps.startLiveStream).not.toHaveBeenCalled();
  });

  it('auto-start OFF performs create+join only and keeps manual async session start path', async () => {
    const deps = buildDeps({
      shouldAutoStartAsyncSession: vi.fn(() => false),
    });
    initGameActions(deps);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ game_id: 'g-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ player_id: 'p-2' }),
      });

    await createNewGameAndJoin();

    expect(deps.autoStartAsyncSession).not.toHaveBeenCalled();
    expect(deps.startLiveStream).not.toHaveBeenCalled();
    expect(deps.showNewGameStatus).toHaveBeenCalledWith(
      'Game created and joined. Start Session (Async) when ready.',
      'success'
    );
  });
});

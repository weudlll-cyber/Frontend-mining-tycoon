/**
File: src/async-session-flow.test.js
Purpose: Verify inline async-session policy error rendering from setup action flow.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSetupFlowFixture } from './test-utils/main-test-helpers.js';

async function loadMainModuleWithSessionMock(mockResult) {
  vi.resetModules();
  const startStreamMock = vi.fn();
  vi.doMock('./services/session-actions.js', () => ({
    initSessionActions: () => {},
    createAsyncSession: vi.fn(async () => mockResult),
    getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
    probeRequirePlayerAuth: vi.fn(async () => ({ value: false })),
  }));
  vi.doMock('./services/stream-controller.js', () => ({
    initStreamController: () => {},
    startStream: startStreamMock,
    stopLiveTimersAndHalving: vi.fn(),
    closeEventSourceIfOpen: vi.fn(),
    hasOpenStream: vi.fn(() => false),
  }));
  const main = await import('./main.js');
  return { main, startStreamMock };
}

describe('async session error states', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    buildSetupFlowFixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ game_id: 'game-1', player_id: 'player-1' }),
      })
    );
  });

  it('shows inline policy message for 403/409 responses', async () => {
    const { main, startStreamMock } = await loadMainModuleWithSessionMock({
      ok: false,
      kind: 'policy-closed',
      message: 'Session cannot be started now (policy window closed).',
    });

    main.setActiveMeta({
      round_type: 'asynchronous',
      supports_round_sessions: true,
    });
    main.setSetupStateForTests({
      roundMode: 'async',
      supportsSessionStart: true,
      streamActive: false,
      gameStatus: 'enrolling',
      sessionId: null,
    });

    await main.handleStartAsyncSession();

    await Promise.resolve();
    await Promise.resolve();

    const statusEl = document.getElementById('start-session-status');
    expect(statusEl.textContent).toContain(
      'Session cannot be started now (policy window closed).'
    );
    expect(startStreamMock).not.toHaveBeenCalled();
  });

  it('starts session-scoped stream when async session response is valid', async () => {
    const { main, startStreamMock } = await loadMainModuleWithSessionMock({
      ok: true,
      sessionId: 'session-9',
      sessionStartUnix: 1700000000,
      sessionDurationSec: 600,
      requiresPlayerAuth: false,
    });

    main.setActiveMeta({
      round_type: 'asynchronous',
      supports_round_sessions: true,
    });
    main.setSetupStateForTests({
      roundMode: 'async',
      supportsSessionStart: true,
      streamActive: false,
      gameStatus: 'enrolling',
      sessionId: null,
    });

    await main.handleStartAsyncSession();
    await Promise.resolve();

    expect(startStreamMock).toHaveBeenCalledTimes(1);
    const streamContext = startStreamMock.mock.calls[0][2];
    expect(streamContext.sessionId).toBe('session-9');
    expect(streamContext.requiresPlayerAuth).toBe(false);

    const statusEl = document.getElementById('start-session-status');
    expect(statusEl.textContent).toContain('Async session started');
  });

  it('shows malformed-response error and does not open any stream', async () => {
    const { main, startStreamMock } = await loadMainModuleWithSessionMock({
      ok: false,
      kind: 'http',
      code: 'MALFORMED_SESSION_RESPONSE',
      message: 'Session could not be started (malformed response).',
    });

    main.setActiveMeta({
      round_type: 'asynchronous',
      supports_round_sessions: true,
    });
    main.setSetupStateForTests({
      roundMode: 'async',
      supportsSessionStart: true,
      streamActive: false,
      gameStatus: 'enrolling',
      sessionId: null,
    });

    await main.handleStartAsyncSession();
    await Promise.resolve();

    const statusEl = document.getElementById('start-session-status');
    expect(statusEl.textContent).toContain(
      'Session could not be started (malformed response).'
    );
    expect(startStreamMock).not.toHaveBeenCalled();
  });
});

async function loadMainModuleCapturingStream(mockResult) {
  vi.resetModules();
  const streamDeps = { current: null };
  vi.doMock('./services/session-actions.js', () => ({
    initSessionActions: () => {},
    createAsyncSession: vi.fn(async () => mockResult),
    getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
    probeRequirePlayerAuth: vi.fn(async () => ({ value: false })),
  }));
  // Capture the callbacks main.js registers so a stream payload can be fed in.
  vi.doMock('./services/stream-controller.js', () => ({
    initStreamController: (deps) => {
      streamDeps.current = deps;
    },
    startStream: vi.fn(),
    stopLiveTimersAndHalving: vi.fn(),
    closeEventSourceIfOpen: vi.fn(),
    hasOpenStream: vi.fn(() => false),
  }));
  const main = await import('./main.js');
  return { main, streamDeps };
}

describe('async play-window gate for upgrade/trade actions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    buildSetupFlowFixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ game_id: 'game-1', player_id: 'player-1' }),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('./ui/trading-panel.js');
  });

  it('blocks actions once the async session expires and re-renders the trade panel', async () => {
    const sessionStartUnix = 1700000000;
    vi.useFakeTimers({ now: (sessionStartUnix + 598) * 1000 });

    let tradingDeps = null;
    const renderTradingStatus = vi.fn();
    vi.doMock('./ui/trading-panel.js', () => ({
      initTradingPanel: (deps) => {
        tradingDeps = deps;
        return { renderTradingStatus };
      },
    }));
    const { main, streamDeps } = await loadMainModuleCapturingStream({
      ok: true,
      sessionId: 'session-9',
      sessionStartUnix,
      sessionDurationSec: 600,
      requiresPlayerAuth: false,
    });

    main.setActiveMeta({
      round_type: 'asynchronous',
      supports_round_sessions: true,
    });
    main.setSetupStateForTests({
      roundMode: 'async',
      supportsSessionStart: true,
      streamActive: false,
      gameStatus: 'running',
      sessionId: null,
    });

    // Before any session the gate already reports the missing session.
    expect(tradingDeps).not.toBeNull();
    expect(tradingDeps.getActionAvailability()).toMatchObject({
      allowed: false,
      code: 'ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION',
    });

    await main.handleStartAsyncSession();
    streamDeps.current.onData({
      game_id: 'game-1',
      player_id: 'player-1',
      game_status: 'running',
      session: { session_id: 'session-9', status: 'running' },
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(tradingDeps.getActionAvailability().allowed).toBe(true);
    renderTradingStatus.mockClear();

    // Session duration elapses: the timer tick expires the session locally.
    await vi.advanceTimersByTimeAsync(3000);

    expect(tradingDeps.getActionAvailability()).toMatchObject({
      allowed: false,
      code: 'ACTION_NOT_ALLOWED_NO_ACTIVE_SESSION',
    });
    expect(renderTradingStatus).toHaveBeenCalled();
  });
});

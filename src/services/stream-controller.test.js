/**
File: src/services/stream-controller.test.js
Purpose: Validate session-stream URL construction and auth-ticket behavior.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAYS_MS,
  closeEventSourceIfOpen,
  initStreamController,
  startStream,
} from './stream-controller.js';

function flush() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('stream-controller session SSE routing', () => {
  const urls = [];

  beforeEach(() => {
    urls.length = 0;
    vi.restoreAllMocks();

    globalThis.EventSource = class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        urls.push(url);
      }
      close() {}
    };
  });

  it('uses session-scoped SSE URL when session exists', async () => {
    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: 987,
      requiresPlayerAuth: false,
      roundMode: 'async',
    });
    await flush();

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('/sessions/987/stream?player_id=44');
    expect(urls[0]).not.toContain('/games/123/stream');
    expect(urls[0]).not.toContain('ticket=');
    expect(deps.getStreamTicket).toHaveBeenCalledWith({
      gameId: '123',
      playerId: '44',
      requirePlayerAuth: false,
    });
  });

  it('appends the ticket when one is issued', async () => {
    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({
        ok: true,
        ticket: 'abc123',
      })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: 765,
      requiresPlayerAuth: true,
      roundMode: 'async',
    });
    await flush();

    expect(deps.getStreamTicket).toHaveBeenCalledTimes(1);
    expect(urls.length).toBe(1);
    expect(urls[0]).toContain(
      '/sessions/765/stream?player_id=44&ticket=abc123'
    );
  });

  it('does not fallback to legacy stream when session stream setup fails', async () => {
    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({
        ok: false,
        message: 'ticket failed',
      })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: 111,
      requiresPlayerAuth: true,
      roundMode: 'async',
    });
    await flush();

    expect(urls.length).toBe(0);
    expect(deps.onSessionStreamError).toHaveBeenCalledTimes(1);
    expect(deps.onStreamStateChange).toHaveBeenCalledWith(false);
  });

  it('blocks async stream start when no session exists', async () => {
    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: null,
      requiresPlayerAuth: false,
      roundMode: 'async',
    });
    await flush();

    expect(urls.length).toBe(0);
    expect(deps.onSessionStreamError).toHaveBeenCalledTimes(1);
  });

  it('uses legacy game stream only for sync round without session', async () => {
    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: null,
      requiresPlayerAuth: false,
      roundMode: 'sync',
    });
    await flush();

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('/games/123/stream?player_id=44');
  });

  it('closes session stream intentionally when session status becomes finished', async () => {
    let latestSource = null;
    globalThis.EventSource = class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this._closed = false;
        urls.push(url);
        latestSource = this;
      }
      close() {
        this._closed = true;
      }
    };

    const deps = {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStorageItem: vi.fn(),
      getPlayerTokenStorageKey: vi.fn(),
      getStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      onSessionStreamFinished: vi.fn(),
      disconnectChat: vi.fn(),
    };

    initStreamController(deps);
    startStream('123', '44', {
      sessionId: 999,
      requiresPlayerAuth: false,
      roundMode: 'async',
    });
    await flush();

    latestSource.onmessage?.({
      data: JSON.stringify({
        game_status: 'running',
        session: { session_id: 999, status: 'finished' },
      }),
    });

    expect(deps.onSessionStreamFinished).toHaveBeenCalledTimes(1);
    expect(deps.disconnectChat).toHaveBeenCalledTimes(1);
    expect(deps.onStreamStateChange).toHaveBeenCalledWith(false);
    expect(latestSource._closed).toBe(true);
  });
});

describe('stream-controller reconnect with fresh tickets', () => {
  let sources;

  function makeDeps(overrides = {}) {
    let ticketCounter = 0;
    return {
      clearCountdownInterval: vi.fn(),
      stopNextHalvingCountdown: vi.fn(),
      stopSeasonHalvingTimers: vi.fn(),
      resetTransientHalvingState: vi.fn(),
      onStreamStateChange: vi.fn(),
      updateSetupActionsState: vi.fn(),
      getNormalizedBaseUrlOrNull: vi.fn(() => 'http://127.0.0.1:8000'),
      connectChat: vi.fn(),
      getStreamTicket: vi.fn(async () => {
        ticketCounter += 1;
        return { ok: true, ticket: `ticket-${ticketCounter}` };
      }),
      setBadgeStatus: vi.fn(),
      connStatusEl: {},
      fetchMetaSnapshot: vi.fn(async () => ({})),
      onData: vi.fn(),
      onSessionStreamError: vi.fn(),
      disconnectChat: vi.fn(),
      ...overrides,
    };
  }

  async function flushAll() {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sources = [];
    globalThis.EventSource = class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.closed = false;
        sources.push(this);
      }
      close() {
        this.closed = true;
      }
    };
  });

  afterEach(() => {
    closeEventSourceIfOpen();
    vi.useRealTimers();
  });

  it('closes the errored source and reconnects with a newly fetched ticket', async () => {
    const deps = makeDeps();
    initStreamController(deps);
    startStream('5', '6', { roundMode: 'sync', requiresPlayerAuth: true });
    await flushAll();

    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe(
      'http://127.0.0.1:8000/games/5/stream?player_id=6&ticket=ticket-1'
    );

    sources[0].onerror();
    expect(sources[0].closed).toBe(true);
    expect(deps.setBadgeStatus).toHaveBeenLastCalledWith({}, 'reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await flushAll();

    expect(deps.getStreamTicket).toHaveBeenCalledTimes(2);
    expect(sources).toHaveLength(2);
    expect(sources[1].url).toContain('ticket=ticket-2');
    expect(sources[1].url).not.toContain('ticket-1');
  });

  it('backs off on repeated failures and resets after a message', async () => {
    const deps = makeDeps();
    initStreamController(deps);
    startStream('5', '6', { roundMode: 'sync' });
    await flushAll();

    sources[0].onerror();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await flushAll();
    sources[1].onerror();

    // Second attempt waits for the second backoff step.
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await flushAll();
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(
      RECONNECT_DELAYS_MS[1] - RECONNECT_DELAYS_MS[0]
    );
    await flushAll();
    expect(sources).toHaveLength(3);

    sources[2].onmessage({ data: JSON.stringify({ game_status: 'running' }) });
    sources[2].onerror();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await flushAll();
    expect(sources).toHaveLength(4);
  });

  it('retries when the ticket request fails during reconnect', async () => {
    const deps = makeDeps();
    initStreamController(deps);
    startStream('5', '6', { roundMode: 'sync' });
    await flushAll();

    deps.getStreamTicket.mockResolvedValueOnce({
      ok: false,
      message: 'network down',
    });
    sources[0].onerror();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await flushAll();
    expect(sources).toHaveLength(1);
    expect(deps.onSessionStreamError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[1]);
    await flushAll();
    expect(sources).toHaveLength(2);
  });

  it('gives up after the maximum number of reconnect attempts', async () => {
    const deps = makeDeps();
    initStreamController(deps);
    startStream('5', '6', { roundMode: 'sync' });
    await flushAll();

    deps.getStreamTicket.mockResolvedValue({ ok: false, message: 'down' });
    sources[0].onerror();
    for (let i = 0; i <= MAX_RECONNECT_ATTEMPTS; i += 1) {
      await vi.advanceTimersByTimeAsync(20000);
      await flushAll();
    }

    expect(deps.onSessionStreamError).toHaveBeenCalledTimes(1);
    expect(deps.onStreamStateChange).toHaveBeenLastCalledWith(false);
  });

  it('cancels a pending reconnect when the stream is closed intentionally', async () => {
    const deps = makeDeps();
    initStreamController(deps);
    startStream('5', '6', { roundMode: 'sync' });
    await flushAll();

    sources[0].onerror();
    closeEventSourceIfOpen();
    await vi.advanceTimersByTimeAsync(30000);
    await flushAll();

    expect(sources).toHaveLength(1);
    expect(deps.getStreamTicket).toHaveBeenCalledTimes(1);
  });
});

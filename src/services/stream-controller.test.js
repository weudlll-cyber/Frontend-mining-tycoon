/*
File: src/services/stream-controller.test.js
Purpose: Validate session-stream URL construction and auth-ticket behavior.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initStreamController, startStream } from './stream-controller.js';

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
      getSessionStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
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
    });
    await flush();

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('/sessions/987/stream?player_id=44');
    expect(urls[0]).not.toContain('/games/123/stream');
    expect(deps.getSessionStreamTicket).not.toHaveBeenCalled();
  });

  it('uses ticket flow only when auth is required', async () => {
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
      getSessionStreamTicket: vi.fn(async () => ({
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
    });
    await flush();

    expect(deps.getSessionStreamTicket).toHaveBeenCalledTimes(1);
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
      getSessionStreamTicket: vi.fn(async () => ({
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
    });
    await flush();

    expect(urls.length).toBe(0);
    expect(deps.onSessionStreamError).toHaveBeenCalledTimes(1);
    expect(deps.onStreamStateChange).toHaveBeenCalledWith(false);
  });

  it('uses legacy game stream when no session exists', async () => {
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
      getSessionStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
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
    });
    await flush();

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('/games/123/stream?player_id=44');
    expect(urls[0]).not.toContain('/sessions/');
  });
});

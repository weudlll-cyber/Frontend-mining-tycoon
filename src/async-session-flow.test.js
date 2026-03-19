/*
File: src/async-session-flow.test.js
Purpose: Verify inline async-session policy error rendering from setup action flow.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <main class="app-layout">
        <header class="card game-header">
          <button id="setup-toggle-btn" type="button" aria-expanded="true">Hide Setup</button>
          <button id="jump-live-btn" type="button">Jump to Live Board</button>
          <details id="debug-details" class="debug-details">
            <summary>Debug</summary>
            <div>debug body</div>
          </details>
          <div id="meta-debug"></div>
          <div id="debug-backend-url"></div>
          <div id="debug-game-id"></div>
          <div id="debug-player-id"></div>
          <div id="debug-session-id"></div>
        </header>

        <section id="setup-shell" class="setup-shell setup-open">
          <button id="jump-live-btn-setup" type="button">Jump to Live Board</button>
          <section id="setup-panel">
            <div class="setup-actions">
              <div class="setup-actions-header">
                <h3>Primary Actions</h3>
                <span id="round-mode-badge">Round: Sync</span>
              </div>
              <div class="button-group">
                <button id="new-game-btn" class="btn-primary" type="button">+ New Game</button>
                <button id="start-btn" class="btn-secondary" type="button">Start Stream</button>
                <button id="start-session-btn" class="btn-secondary" type="button" hidden>Start Async Session</button>
                <button id="stop-btn" class="btn-secondary" type="button">Stop Stream</button>
              </div>
              <p id="start-session-status" class="setup-session-status"></p>
              <p id="setup-actions-note"></p>
            </div>
          </section>
        </section>

        <section id="live-board"></section>
      </main>

      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <select id="duration-preset"><option value="30m" selected>30 minutes</option></select>
      <div id="duration-custom-input" style="display:none"></div>
      <input id="duration-custom-value" value="300" />
      <select id="duration-custom-unit"><option value="seconds">seconds</option></select>
      <input id="enrollment-window" value="60" />
      <input id="game-id" value="game-1" />
      <input id="player-id" value="player-1" />
      <input id="show-advanced-overrides" type="checkbox" />
      <div id="advanced-overrides" style="display:none"></div>
      <select id="anchor-token"><option value="">none</option></select>
      <input id="anchor-rate" value="" />
      <input id="season-cycles" value="" />
      <div id="derived-emission-preview" style="display:none"></div>

      <div id="conn-status"></div>
      <div id="game-status"></div>
      <div id="countdown"></div>
      <div id="countdown-label"></div>
      <div id="async-session-status" class="badge badge-gray" hidden></div>
      <div id="new-game-status"></div>
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="upgrades"></div>
      <div id="my-score"></div>
      <div id="my-rank"></div>
      <div id="top-score"></div>
      <div id="portfolio-value"></div>

      <aside id="chat-panel"></aside>
      <button id="chat-toggle-btn" type="button"></button>
      <ul id="chat-messages"></ul>
      <form id="chat-form"></form>
      <input id="chat-input" />
      <div id="chat-status"></div>
    </div>
  `;

  const liveBoard = document.getElementById('live-board');
  if (liveBoard) {
    liveBoard.scrollIntoView = () => {};
    liveBoard.focus = () => {};
  }
}

async function loadMainModuleWithSessionMock(mockResult) {
  vi.resetModules();
  const startStreamMock = vi.fn();
  vi.doMock('./services/session-actions.js', () => ({
    initSessionActions: () => {},
    createAsyncSession: vi.fn(async () => mockResult),
    getSessionStreamTicket: vi.fn(async () => ({ ok: true, ticket: null })),
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
    buildDomFixture();
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

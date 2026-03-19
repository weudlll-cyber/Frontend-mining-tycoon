/*
File: src/layout-controls.test.js
Purpose: Guard setup action visibility/state rules across sync and async round flows.
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
                <button id="start-session-btn" class="btn-secondary" type="button" hidden>Start Session</button>
                <button id="stop-btn" class="btn-secondary" type="button">Stop Stream</button>
              </div>
              <p id="setup-actions-note"></p>
            </div>
          </section>
        </section>

        <section id="live-board"></section>
      </main>

      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <select id="duration-preset">
        <option value="30m" selected>30 minutes</option>
      </select>
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

      <aside id="chat-panel"></aside>
      <button id="chat-toggle-btn" type="button"></button>
      <ul id="chat-messages"></ul>
      <form id="chat-form"></form>
      <input id="chat-input" />
      <div id="chat-status"></div>
    </div>
  `;
}

async function loadMainModule() {
  return import('./main.js');
}

beforeEach(() => {
  vi.resetModules();
  buildDomFixture();
});

describe('layout controls', () => {
  it('collapses and expands setup panel via toggle handler', async () => {
    const module = await loadMainModule();
    const setupShell = document.getElementById('setup-shell');
    const setupToggleBtn = document.getElementById('setup-toggle-btn');

    expect(setupShell.classList.contains('setup-collapsed')).toBe(false);
    module.toggleSetupCollapsed();

    expect(setupShell.classList.contains('setup-collapsed')).toBe(true);
    expect(setupToggleBtn.getAttribute('aria-expanded')).toBe('false');

    module.toggleSetupCollapsed();

    expect(setupShell.classList.contains('setup-collapsed')).toBe(false);
    expect(setupToggleBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('auto-collapses setup when game enters running state', async () => {
    const module = await loadMainModule();
    const setupShell = document.getElementById('setup-shell');

    module.setSetupCollapsed(false);
    module.autoCollapseSetupForLiveState('running');

    expect(setupShell.classList.contains('setup-collapsed')).toBe(true);
  });

  it('keeps debug details collapsed by default and allows inline expand', () => {
    const debugDetails = document.getElementById('debug-details');
    const debugSummary = debugDetails.querySelector('summary');

    expect(debugDetails.open).toBe(false);
    expect(debugSummary).not.toBeNull();

    debugDetails.open = true;
    expect(debugDetails.open).toBe(true);
  });

  it('jump-to-live-board collapses setup and focuses the live board', async () => {
    const module = await loadMainModule();
    const setupShell = document.getElementById('setup-shell');
    const liveBoard = document.getElementById('live-board');

    const focusSpy = vi.fn();
    const scrollSpy = vi.fn();

    liveBoard.focus = focusSpy;
    liveBoard.scrollIntoView = scrollSpy;

    module.setSetupCollapsed(false);
    module.scrollToLiveBoard();

    expect(setupShell.classList.contains('setup-collapsed')).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('always keeps primary action buttons in DOM when setup is open', async () => {
    await loadMainModule();

    const setupShell = document.getElementById('setup-shell');
    expect(setupShell.classList.contains('setup-collapsed')).toBe(false);

    expect(document.getElementById('new-game-btn')).not.toBeNull();
    expect(document.getElementById('start-btn')).not.toBeNull();
    expect(document.getElementById('start-session-btn')).not.toBeNull();
    expect(document.getElementById('stop-btn')).not.toBeNull();
    expect(document.getElementById('round-mode-badge')?.textContent).toContain(
      'Round: Sync'
    );
  });

  it('disables New Game while running and keeps it enabled when not running', async () => {
    const module = await loadMainModule();

    const newGameBtn = document.getElementById('new-game-btn');
    const noteEl = document.getElementById('setup-actions-note');

    module.setSetupStateForTests({ gameStatus: 'running' });

    expect(newGameBtn.disabled).toBe(true);
    expect(noteEl.textContent).toContain('currently running');

    module.setSetupStateForTests({ gameStatus: 'idle' });
    expect(newGameBtn.disabled).toBe(false);
  });

  it('applies Start/Stop enable rules based on game and stream state', async () => {
    const module = await loadMainModule();

    const gameIdInput = document.getElementById('game-id');
    const newGameBtn = document.getElementById('new-game-btn');
    const startBtn = document.getElementById('start-btn');
    const startSessionBtn = document.getElementById('start-session-btn');
    const stopBtn = document.getElementById('stop-btn');

    gameIdInput.value = '';
    module.setSetupStateForTests({ streamActive: false, gameStatus: 'idle' });
    module.updateSetupActionsState();
    expect(newGameBtn.disabled).toBe(false);
    expect(startBtn.disabled).toBe(true);
    expect(stopBtn.disabled).toBe(true);

    gameIdInput.value = 'game-1';
    module.setSetupStateForTests({ streamActive: false, gameStatus: 'idle' });
    module.updateSetupActionsState();
    expect(startBtn.disabled).toBe(false);
    expect(startSessionBtn.hidden).toBe(true);
    expect(stopBtn.disabled).toBe(true);

    module.setSetupStateForTests({ streamActive: true, gameStatus: 'idle' });
    expect(startBtn.disabled).toBe(true);
    expect(stopBtn.disabled).toBe(false);

    module.setSetupStateForTests({
      streamActive: false,
      gameStatus: 'running',
    });
    expect(newGameBtn.disabled).toBe(true);

    expect(document.getElementById('new-game-btn')).not.toBeNull();
    expect(document.getElementById('start-btn')).not.toBeNull();
    expect(document.getElementById('stop-btn')).not.toBeNull();
  });

  it('shows async Start Session with disabled fallback message when unsupported', async () => {
    const module = await loadMainModule();
    const startSessionBtn = document.getElementById('start-session-btn');
    const noteEl = document.getElementById('setup-actions-note');
    const asyncStatusBadge = document.getElementById('async-session-status');

    module.setActiveMeta({ round_mode: 'async', token_names: ['spring'] });
    module.setSetupStateForTests({
      streamActive: false,
      gameStatus: 'enrolling',
      roundMode: 'async',
      supportsSessionStart: false,
    });

    expect(startSessionBtn.hidden).toBe(false);
    expect(startSessionBtn.disabled).toBe(true);
    expect(noteEl.textContent).toContain('Async sessions not supported');
    expect(asyncStatusBadge.hidden).toBe(false);
    expect(asyncStatusBadge.textContent).toContain('Legacy View');
  });

  it('shows enabled async Start Session when backend support is available', async () => {
    const module = await loadMainModule();
    const startSessionBtn = document.getElementById('start-session-btn');

    module.setActiveMeta({ round_mode: 'async', token_names: ['spring'] });
    module.setSetupStateForTests({
      streamActive: false,
      gameStatus: 'enrolling',
      roundMode: 'async',
      supportsSessionStart: true,
    });

    expect(startSessionBtn.hidden).toBe(false);
    expect(startSessionBtn.disabled).toBe(false);
  });
});

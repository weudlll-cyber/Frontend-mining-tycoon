/*
File: src/ui/setup-shell.test.js
Purpose: Verify setup-shell guards that preserve user intent and async session discoverability states.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import {
  initSetupShell,
  setSetupCollapsed,
  setSetupShellState,
  autoCollapseSetupForLiveState,
  toggleSetupCollapsed,
  initializeHeaderInteractions,
  renderDebugContext,
  updateSetupActionsState,
} from './setup-shell.js';

function buildFixture() {
  document.body.innerHTML = `
    <input id="game-id" value="game-1" />
    <input id="player-id" value="player-1" />
    <button id="new-game-btn" type="button">+ New Game</button>
    <button id="start-btn" type="button">Start Stream</button>
    <button id="start-session-btn" type="button" hidden>Start Session</button>
    <button id="stop-btn" type="button">Stop Stream</button>
    <span id="round-mode-badge">Round: Sync</span>
    <span id="async-session-status" hidden>Async: n/a</span>
    <p id="setup-actions-note"></p>
    <p id="start-session-status"></p>
    <section id="setup-shell" class="setup-shell setup-open"></section>
    <button id="setup-toggle-btn" type="button" aria-expanded="true">Hide Setup</button>
    <details id="debug-details"><summary>Debug</summary></details>
    <span id="debug-backend-url">—</span>
    <span id="debug-game-id">—</span>
    <span id="debug-player-id">—</span>
    <span id="debug-session-id">—</span>
  `;

  const onStartAsyncSession = async () => {
    await fetch('/games/game-1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'async', player_id: 'player-1' }),
    });
  };

  const renderAsyncSessionBadge = ({
    roundMode,
    sessionActive,
    sessionSupported,
  }) => {
    const badge = document.getElementById('async-session-status');
    if (!badge) return;
    if (roundMode !== 'async') {
      badge.hidden = true;
      badge.textContent = 'Async: n/a';
      return;
    }
    badge.hidden = false;
    if (sessionActive) {
      badge.textContent = 'Async: Session Active';
    } else if (!sessionSupported) {
      badge.textContent = 'Async: Legacy View';
    } else {
      badge.textContent = 'Async: Session Ready';
    }
  };

  initSetupShell({
    gameIdInput: document.getElementById('game-id'),
    playerIdInput: document.getElementById('player-id'),
    newGameBtn: document.getElementById('new-game-btn'),
    startBtn: document.getElementById('start-btn'),
    startSessionBtn: document.getElementById('start-session-btn'),
    stopBtn: document.getElementById('stop-btn'),
    roundModeBadgeEl: document.getElementById('round-mode-badge'),
    asyncSessionStatusEl: document.getElementById('async-session-status'),
    setupActionsNoteEl: document.getElementById('setup-actions-note'),
    startSessionStatusEl: document.getElementById('start-session-status'),
    setupShellEl: document.getElementById('setup-shell'),
    setupToggleBtnEl: document.getElementById('setup-toggle-btn'),
    onStartAsyncSession,
    debugDetailsEl: document.getElementById('debug-details'),
    debugBackendUrlEl: document.getElementById('debug-backend-url'),
    debugGameIdEl: document.getElementById('debug-game-id'),
    debugPlayerIdEl: document.getElementById('debug-player-id'),
    debugSessionIdEl: document.getElementById('debug-session-id'),
    renderAsyncSessionBadge,
  });

  initializeHeaderInteractions();
}

beforeEach(() => {
  buildFixture();
});

describe('setup shell async readiness', () => {
  it('shows async badge and enables start-session when supported', () => {
    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'idle',
      roundMode: 'async',
      sessionStartSupported: true,
    });
    updateSetupActionsState();

    const badge = document.getElementById('round-mode-badge');
    const asyncStatus = document.getElementById('async-session-status');
    const startSessionBtn = document.getElementById('start-session-btn');
    const note = document.getElementById('setup-actions-note');

    expect(badge?.textContent).toContain('Round: Async');
    expect(asyncStatus?.hidden).toBe(false);
    expect(asyncStatus?.textContent).toContain('Session Ready');
    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(false);
    expect(document.getElementById('start-btn')?.disabled).toBe(true);
    expect(note?.textContent).toContain('Start Async Session first');
  });

  it('keeps Start Async Session disabled until player join is complete', () => {
    const playerIdInput = document.getElementById('player-id');
    const startSessionBtn = document.getElementById('start-session-btn');
    playerIdInput.value = '';

    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'enrolling',
      roundMode: 'async',
      sessionStartSupported: true,
      sessionActive: false,
    });
    updateSetupActionsState();

    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(true);
  });

  it('clicking Start Async Session triggers session POST callback', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = async () => ({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchMock;

    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'enrolling',
      roundMode: 'async',
      sessionStartSupported: true,
      sessionActive: false,
    });
    updateSetupActionsState();

    const startSessionBtn = document.getElementById('start-session-btn');
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({}) };
    };

    startSessionBtn?.click();
    await Promise.resolve();

    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0].url)).toContain('/games/game-1/sessions');
    expect(calls[0].init?.method).toBe('POST');

    globalThis.fetch = originalFetch;
  });

  it('shows fallback note and disables start-session when unsupported', () => {
    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'idle',
      roundMode: 'async',
      sessionStartSupported: false,
    });
    updateSetupActionsState();

    const startSessionBtn = document.getElementById('start-session-btn');
    const asyncStatus = document.getElementById('async-session-status');
    const note = document.getElementById('setup-actions-note');

    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(true);
    expect(asyncStatus?.textContent).toContain('Legacy View');
    expect(note?.textContent).toContain('legacy live view');
  });

  it('auto-closes only once when entering running if user did not reopen setup', () => {
    const setupShell = document.getElementById('setup-shell');

    setSetupCollapsed(false);
    setSetupShellState({ latestGameStatus: 'enrolling' });
    autoCollapseSetupForLiveState('enrolling');
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(false);

    autoCollapseSetupForLiveState('running');
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(true);

    setSetupCollapsed(false);
    autoCollapseSetupForLiveState('running');
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(false);
  });

  it('keeps setup open during repeated running updates after user expands it', () => {
    const setupShell = document.getElementById('setup-shell');

    setSetupCollapsed(true);
    toggleSetupCollapsed();
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(false);

    autoCollapseSetupForLiveState('running');
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(false);

    autoCollapseSetupForLiveState('running');
    expect(setupShell?.classList.contains('setup-collapsed')).toBe(false);
  });

  it('shows session id in debug only when debug panel is open', () => {
    const debugDetailsEl = document.getElementById('debug-details');
    const debugSessionIdEl = document.getElementById('debug-session-id');

    setSetupShellState({ sessionId: 77 });
    renderDebugContext();
    expect(debugSessionIdEl?.textContent).toBe('—');

    debugDetailsEl.open = true;
    debugDetailsEl.dispatchEvent(new Event('toggle'));
    expect(debugSessionIdEl?.textContent).toBe('77');
  });
});

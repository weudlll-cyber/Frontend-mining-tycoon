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
    <section id="setup-shell" class="setup-shell setup-open"></section>
    <button id="setup-toggle-btn" type="button" aria-expanded="true">Hide Setup</button>
  `;

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
    setupShellEl: document.getElementById('setup-shell'),
    setupToggleBtnEl: document.getElementById('setup-toggle-btn'),
  });
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
    expect(note?.textContent).toContain('start a session');
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
});

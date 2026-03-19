import { beforeEach, describe, expect, it } from 'vitest';
import {
  initSetupShell,
  setSetupShellState,
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
    <p id="setup-actions-note"></p>
  `;

  initSetupShell({
    gameIdInput: document.getElementById('game-id'),
    playerIdInput: document.getElementById('player-id'),
    newGameBtn: document.getElementById('new-game-btn'),
    startBtn: document.getElementById('start-btn'),
    startSessionBtn: document.getElementById('start-session-btn'),
    stopBtn: document.getElementById('stop-btn'),
    roundModeBadgeEl: document.getElementById('round-mode-badge'),
    setupActionsNoteEl: document.getElementById('setup-actions-note'),
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
    const startSessionBtn = document.getElementById('start-session-btn');
    const note = document.getElementById('setup-actions-note');

    expect(badge?.textContent).toContain('Round: Async');
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
    const note = document.getElementById('setup-actions-note');

    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(true);
    expect(note?.textContent).toContain('legacy game stream fallback');
  });
});

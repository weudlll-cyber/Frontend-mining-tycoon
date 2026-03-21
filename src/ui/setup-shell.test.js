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
    <label><input id="round-type-sync" name="round-type" type="radio" checked /> Sync</label>
    <label><input id="round-type-async" name="round-type" type="radio" /> Async (host)</label>
    <div id="async-host-controls" hidden>
      <label id="async-enrollment-field" hidden>
        <span>Enrollment Window (seconds)</span>
        <input id="enrollment-window" type="number" value="600" disabled />
      </label>
      <select id="async-duration-preset">
        <option value="5m">5m</option>
        <option value="10m" selected>10m</option>
        <option value="15m">15m</option>
        <option value="60m">1h</option>
        <option value="3h">3h</option>
        <option value="6h">6h</option>
        <option value="12h">12h</option>
        <option value="24h">24h</option>
      </select>
      <div id="async-duration-custom-wrap" hidden aria-hidden="true">
        <input id="async-duration-custom-minutes" value="10" />
      </div>
      <label><input id="async-auto-start" type="checkbox" checked /> Auto-start</label>
    </div>
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
      badge.textContent = 'Async: Ready';
    } else {
      badge.textContent = 'Async: Ready';
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
    roundTypeSyncInput: document.getElementById('round-type-sync'),
    roundTypeAsyncInput: document.getElementById('round-type-async'),
    asyncHostControlsEl: document.getElementById('async-host-controls'),
    asyncHostDurationPresetInput: document.getElementById(
      'async-duration-preset'
    ),
    asyncHostDurationCustomEl: document.getElementById(
      'async-duration-custom-wrap'
    ),
    asyncHostDurationCustomMinutesInput: document.getElementById(
      'async-duration-custom-minutes'
    ),
    asyncHostAutoStartCheckbox: document.getElementById('async-auto-start'),
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
      sessionApiSupported: true,
      asyncWindowOpen: true,
      requirePlayerAuth: false,
      hostRoundType: 'async',
    });
    updateSetupActionsState();

    const badge = document.getElementById('round-mode-badge');
    const asyncStatus = document.getElementById('async-session-status');
    const startSessionBtn = document.getElementById('start-session-btn');
    const note = document.getElementById('setup-actions-note');

    expect(badge?.textContent).toContain('Round: Async');
    expect(asyncStatus?.hidden).toBe(false);
    expect(asyncStatus?.textContent).toContain('Async: Ready');
    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(false);
    expect(document.getElementById('start-btn')?.disabled).toBe(true);
    expect(note?.textContent).toContain('Start Session (Async) first');
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
      sessionApiSupported: true,
      asyncWindowOpen: true,
      sessionActive: false,
      hostRoundType: 'async',
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
      sessionApiSupported: true,
      asyncWindowOpen: true,
      sessionActive: false,
      hostRoundType: 'async',
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

  it('shows async endpoint warning and disables start-session when unsupported', () => {
    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'idle',
      roundMode: 'async',
      sessionStartSupported: false,
      sessionApiSupported: false,
      asyncWindowOpen: true,
      hostRoundType: 'async',
    });
    updateSetupActionsState();

    const startSessionBtn = document.getElementById('start-session-btn');
    const asyncStatus = document.getElementById('async-session-status');
    const note = document.getElementById('setup-actions-note');

    expect(startSessionBtn?.hidden).toBe(false);
    expect(startSessionBtn?.disabled).toBe(true);
    expect(asyncStatus?.textContent).toContain('Async: Ready');
    expect(note?.textContent).toContain('endpoint is unavailable');
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

  it('renders gray diagnostic chip for each blocking async predicate', () => {
    setSetupShellState({
      isSetupBusy: false,
      isStreamActive: false,
      latestGameStatus: 'enrolling',
      roundMode: 'async',
      sessionStartSupported: true,
      sessionApiSupported: false,
      asyncWindowOpen: false,
      requirePlayerAuth: 'unknown',
      sessionActive: false,
      sessionId: null,
      hostRoundType: 'async',
    });
    updateSetupActionsState();

    const chips = Array.from(
      document.querySelectorAll('.async-diagnostic-chip--dim')
    );
    const chipsText = chips.map((chip) => chip.textContent || '');

    expect(chips.length).toBeGreaterThan(0);
    expect(chipsText.join(' ')).not.toContain('Window');
    expect(chipsText.join(' ')).toContain('SessionAPI');
    expect(chipsText.join(' ')).toContain('Auth');
  });

  it('shows async host controls with enrollment/session-duration controls hidden', () => {
    const asyncControls = document.getElementById('async-host-controls');
    const enrollmentField = document.getElementById('async-enrollment-field');
    const customDurationWrap = document.getElementById(
      'async-duration-custom-wrap'
    );

    setSetupShellState({ hostRoundType: 'async' });
    updateSetupActionsState();
    expect(asyncControls.hidden).toBe(false);
    expect(enrollmentField.hidden).toBe(true);
    expect(customDurationWrap.hidden).toBe(true);
    expect(customDurationWrap.getAttribute('aria-hidden')).toBe('true');
  });
});

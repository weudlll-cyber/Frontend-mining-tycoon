/**
File: src/layout-controls.test.js
Purpose: Guard setup action visibility/state rules across sync and async round flows.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSetupFlowFixture,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

beforeEach(() => {
  vi.resetModules();
  buildSetupFlowFixture();
  // DOMContentLoaded startup fetches meta/active games and then starts an
  // auto-refresh interval. A never-settling fetch parks that async chain so
  // it cannot log or schedule work after the test environment tears down.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {}))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('keeps debug panel collapsed by default and toggles from gear icon', async () => {
    await loadMainModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const debugPanel = document.getElementById('debug-panel');
    const debugToggleBtn = document.getElementById('debug-toggle-btn');

    expect(debugPanel.hidden).toBe(true);
    expect(debugToggleBtn.getAttribute('aria-expanded')).toBe('false');

    debugToggleBtn.click();
    expect(debugPanel.hidden).toBe(false);
    expect(debugToggleBtn.getAttribute('aria-expanded')).toBe('true');
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

    expect(document.getElementById('start-btn')).not.toBeNull();
    expect(document.getElementById('start-session-btn')).not.toBeNull();
    expect(document.getElementById('stop-btn')).not.toBeNull();
    expect(document.getElementById('round-mode-badge')?.textContent).toContain(
      'Round: Sync'
    );
  });

  it('shows running-state guidance while game is running', async () => {
    const module = await loadMainModule();

    const noteEl = document.getElementById('setup-actions-note');

    module.setSetupStateForTests({ gameStatus: 'running' });

    expect(noteEl.textContent).toContain('currently running');
  });

  it('applies Start/Stop enable rules based on game and stream state', async () => {
    const module = await loadMainModule();

    const gameIdInput = document.getElementById('game-id');
    const startBtn = document.getElementById('start-btn');
    const startSessionBtn = document.getElementById('start-session-btn');
    const stopBtn = document.getElementById('stop-btn');

    gameIdInput.value = '';
    module.setSetupStateForTests({ streamActive: false, gameStatus: 'idle' });
    module.updateSetupActionsState();
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
    expect(noteEl.textContent).toContain('endpoint is unavailable');
    expect(asyncStatusBadge.hidden).toBe(false);
    expect(asyncStatusBadge.textContent).toContain('Async: Ready');
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

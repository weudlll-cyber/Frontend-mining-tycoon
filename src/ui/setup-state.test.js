/**
 * File: src\ui\setup-state.test.js
 * Purpose: Regression tests for setup-state.test.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSetupShellState,
  buildStartSessionStatusClass,
} from './setup-state.js';

describe('setup-state helpers', () => {
  it('builds setup shell state with session derivations', () => {
    const state = buildSetupShellState({
      isStreamActive: true,
      isSetupBusy: false,
      latestGameStatus: 'running',
      roundMode: 'async',
      sessionStartSupported: true,
      sessionApiSupported: true,
      asyncWindowOpen: true,
      requirePlayerAuth: true,
      activeSession: { sessionId: 's-1' },
      hostRoundType: 'async',
      asyncHostAutoStart: false,
    });

    expect(state).toEqual({
      isStreamActive: true,
      isSetupBusy: false,
      latestGameStatus: 'running',
      roundMode: 'async',
      sessionStartSupported: true,
      sessionApiSupported: true,
      asyncWindowOpen: true,
      requirePlayerAuth: true,
      sessionActive: true,
      sessionId: 's-1',
      hostRoundType: 'async',
      asyncHostAutoStart: false,
    });
  });

  it('uses idle defaults when session is missing', () => {
    const state = buildSetupShellState({
      isStreamActive: false,
      isSetupBusy: true,
      latestGameStatus: null,
      roundMode: 'sync',
      sessionStartSupported: false,
      sessionApiSupported: null,
      asyncWindowOpen: null,
      requirePlayerAuth: 'unknown',
      activeSession: null,
      hostRoundType: 'sync',
      asyncHostAutoStart: true,
    });

    expect(state.sessionActive).toBe(false);
    expect(state.sessionId).toBeNull();
  });

  it('formats start-session status class from message and type', () => {
    expect(buildStartSessionStatusClass('ok', 'success')).toBe(
      'setup-session-status setup-session-status--success'
    );
    expect(buildStartSessionStatusClass('', 'warning')).toBe(
      'setup-session-status'
    );
  });
});

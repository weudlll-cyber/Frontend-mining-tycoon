/**
 * File: src\ui\round-context.test.js
 * Purpose: Regression tests for round-context.test.
 */

import { describe, expect, it } from 'vitest';
import {
  getRoundModeFromMeta,
  getSessionSupportFromMeta,
  resolveAsyncWindowOpen,
  computeCurrentRoundContext,
} from './round-context.js';

describe('round-context helpers', () => {
  it('normalizes async round mode aliases', () => {
    expect(getRoundModeFromMeta({ round_mode: 'async' })).toBe('async');
    expect(getRoundModeFromMeta({ round_type: 'asynchronous' })).toBe('async');
    expect(getRoundModeFromMeta({ round_mode: 'sync' })).toBe('sync');
  });

  it('resolves session support from flags and capability lists', () => {
    expect(getSessionSupportFromMeta({ supports_round_sessions: true })).toBe(
      true
    );
    expect(getSessionSupportFromMeta({ supports_session_stream: false })).toBe(
      false
    );
    expect(
      getSessionSupportFromMeta({ capabilities: ['chat', 'session-stream'] })
    ).toBe(true);
    expect(getSessionSupportFromMeta({ capabilities: ['chat'] })).toBeNull();
  });

  it('marks async round as open and falls back to window_open for sync', () => {
    expect(resolveAsyncWindowOpen({ round_mode: 'async' })).toBe(true);
    expect(
      resolveAsyncWindowOpen({ round_mode: 'sync', window_open: true })
    ).toBe(true);
    expect(resolveAsyncWindowOpen({ round_mode: 'sync' })).toBeNull();
  });

  it('takes the round mode from meta unless setup overrides it', () => {
    expect(
      computeCurrentRoundContext({
        gameMeta: { round_mode: 'async' },
        setupRoundModeOverride: null,
        asyncSessionSupportProbe: true,
        sessionStartSupported: false,
      })
    ).toEqual({ roundMode: 'async', supportsSessionStart: true });
    expect(
      computeCurrentRoundContext({
        gameMeta: { round_mode: 'async' },
        setupRoundModeOverride: 'sync',
        asyncSessionSupportProbe: true,
        sessionStartSupported: true,
      }).roundMode
    ).toBe('sync');
    expect(
      computeCurrentRoundContext({
        gameMeta: null,
        setupRoundModeOverride: null,
      }).roundMode
    ).toBe('sync');
  });

  it('forces session start unsupported for sync round mode', () => {
    const context = computeCurrentRoundContext({
      gameMeta: { round_mode: 'sync', supports_round_sessions: true },
      setupRoundModeOverride: null,
      asyncSessionSupportProbe: true,
      sessionStartSupported: true,
    });

    expect(context).toEqual({ roundMode: 'sync', supportsSessionStart: false });
  });
});

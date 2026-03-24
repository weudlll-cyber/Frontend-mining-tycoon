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

  it('computes context with host-selection preference before stream starts', () => {
    const context = computeCurrentRoundContext({
      gameMeta: { round_mode: 'sync' },
      selectedRoundType: 'async',
      isStreamActive: false,
      latestGameStatus: 'idle',
      setupRoundModeOverride: null,
      asyncSessionSupportProbe: true,
      sessionStartSupported: false,
    });

    expect(context).toEqual({ roundMode: 'async', supportsSessionStart: true });
  });

  it('forces session start unsupported for sync round mode', () => {
    const context = computeCurrentRoundContext({
      gameMeta: { round_mode: 'sync', supports_round_sessions: true },
      selectedRoundType: 'sync',
      isStreamActive: true,
      latestGameStatus: 'running',
      setupRoundModeOverride: null,
      asyncSessionSupportProbe: true,
      sessionStartSupported: true,
    });

    expect(context).toEqual({ roundMode: 'sync', supportsSessionStart: false });
  });
});

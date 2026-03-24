import { describe, expect, it } from 'vitest';
import {
  deriveStreamSessionState,
  resolveCountdownMode,
  stampIncomingUiData,
  shouldScheduleUiRender,
} from './ui-update-state.js';

describe('ui-update-state helpers', () => {
  it('keeps active session alive when stream has no explicit session signal', () => {
    const result = deriveStreamSessionState({
      activeSession: { sessionId: 's1', sessionStartUnix: 100 },
      streamSession: null,
    });

    expect(result.shouldClearActiveSession).toBe(false);
    expect(result.hasActiveSession).toBe(true);
  });

  it('clears active session when stream explicitly ends or replaces it', () => {
    const ended = deriveStreamSessionState({
      activeSession: { sessionId: 's1', sessionStartUnix: 100 },
      streamSession: { session_id: 's1', status: 'finished' },
    });
    expect(ended.shouldClearActiveSession).toBe(true);

    const replaced = deriveStreamSessionState({
      activeSession: { sessionId: 's1', sessionStartUnix: 100 },
      streamSession: { session_id: 's2', status: 'running' },
    });
    expect(replaced.shouldClearActiveSession).toBe(true);
  });

  it('resolves countdown modes from game status and session activity', () => {
    expect(
      resolveCountdownMode({ gameStatus: 'running', hasActiveSession: true })
    ).toBe('session');
    expect(
      resolveCountdownMode({ gameStatus: 'enrolling', hasActiveSession: false })
    ).toBe('enrolling');
    expect(
      resolveCountdownMode({ gameStatus: 'finished', hasActiveSession: false })
    ).toBe('finished');
  });

  it('stamps incoming UI data and decides when a frame should schedule', () => {
    const source = { game_status: 'running', score: 10 };
    const { stampedData, latestGameStatus } = stampIncomingUiData(source, 5000);

    expect(stampedData).toEqual({
      game_status: 'running',
      score: 10,
      timestamp: 5000,
    });
    expect(stampedData).not.toBe(source);
    expect(latestGameStatus).toBe('running');
    expect(shouldScheduleUiRender(null)).toBe(true);
    expect(shouldScheduleUiRender(123)).toBe(false);
  });
});

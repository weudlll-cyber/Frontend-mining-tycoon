/**
File: src/ui/action-availability.test.js
Purpose: Verify the play-window gate used to disable upgrade/trade buttons.
Role in system: Covers the pure helper that mirrors backend 409 ACTION_NOT_ALLOWED_* rules.
*/

import { describe, expect, it } from 'vitest';

import {
  ACTION_BLOCK_CODES,
  resolvePlayerActionAvailability,
} from './action-availability.js';

describe('resolvePlayerActionAvailability', () => {
  it('blocks actions while the round is enrolling', () => {
    const result = resolvePlayerActionAvailability({
      gameStatus: 'enrolling',
      roundMode: 'sync',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe(ACTION_BLOCK_CODES.GAME_NOT_RUNNING);
    expect(result.reason).toMatch(/round starts/);
    expect(result.farmReason).toBe('Farming opens when the round starts.');
  });

  it('blocks actions after the round finished (case-insensitive)', () => {
    const result = resolvePlayerActionAvailability({
      gameStatus: ' Finished ',
      roundMode: 'async',
      hasActiveSession: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe(ACTION_BLOCK_CODES.GAME_NOT_RUNNING);
    expect(result.reason).toMatch(/finished/);
    expect(result.farmReason).toMatch(/Farming is closed/);
  });

  it('blocks async actions without an active session', () => {
    const result = resolvePlayerActionAvailability({
      gameStatus: 'running',
      roundMode: 'async',
      hasActiveSession: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe(ACTION_BLOCK_CODES.NO_ACTIVE_SESSION);
    expect(result.reason).toBe('Start a session to upgrade or trade.');
    expect(result.farmReason).toBe('Start a session to deposit or withdraw.');
  });

  it('allows async actions during an active session', () => {
    expect(
      resolvePlayerActionAvailability({
        gameStatus: 'running',
        roundMode: 'async',
        hasActiveSession: true,
      })
    ).toEqual({ allowed: true, code: null, reason: '' });
  });

  it('allows sync actions while running, without a session', () => {
    expect(
      resolvePlayerActionAvailability({
        gameStatus: 'running',
        roundMode: 'sync',
      }).allowed
    ).toBe(true);
  });

  it('keeps actions enabled when the status is not known yet', () => {
    expect(resolvePlayerActionAvailability().allowed).toBe(true);
    expect(
      resolvePlayerActionAvailability({ gameStatus: null, roundMode: 'async' })
        .allowed
    ).toBe(true);
  });

  it('blocks actions while a scheduled round has not opened yet', () => {
    expect(
      resolvePlayerActionAvailability({
        gameStatus: 'scheduled',
        roundMode: 'sync',
      })
    ).toEqual({
      allowed: false,
      code: 'ACTION_NOT_ALLOWED_GAME_NOT_RUNNING',
      reason: 'The round has not opened yet.',
      farmReason: 'The round has not opened yet. Farming opens when it starts.',
    });
  });
});

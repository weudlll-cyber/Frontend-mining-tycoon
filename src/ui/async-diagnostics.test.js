/**
 * File: src\ui\async-diagnostics.test.js
 * Purpose: Regression tests for async-diagnostics.test.
 */

import { describe, expect, it } from 'vitest';
import {
  shouldResetAsyncDiagnostics,
  createAsyncDiagnosticsProbeKey,
  shouldSkipAsyncDiagnosticsProbe,
  resolveSessionSupportProbeValue,
  resolveRequirePlayerAuthValue,
} from './async-diagnostics.js';

describe('async-diagnostics helpers', () => {
  it('resets diagnostics outside async-ready prerequisites', () => {
    expect(
      shouldResetAsyncDiagnostics({
        baseUrl: '',
        gameId: 'g1',
        roundMode: 'async',
      })
    ).toBe(true);
    expect(
      shouldResetAsyncDiagnostics({
        baseUrl: 'http://127.0.0.1:8000',
        gameId: '',
        roundMode: 'async',
      })
    ).toBe(true);
    expect(
      shouldResetAsyncDiagnostics({
        baseUrl: 'http://127.0.0.1:8000',
        gameId: 'g1',
        roundMode: 'sync',
      })
    ).toBe(true);
    expect(
      shouldResetAsyncDiagnostics({
        baseUrl: 'http://127.0.0.1:8000',
        gameId: 'g1',
        roundMode: 'async',
      })
    ).toBe(false);
  });

  it('creates deterministic probe keys', () => {
    expect(
      createAsyncDiagnosticsProbeKey({
        baseUrl: 'http://127.0.0.1:8000',
        gameId: '12',
        playerId: '34',
      })
    ).toBe('http://127.0.0.1:8000|12|34');
  });

  it('skips probing for duplicate key without force and for in-flight calls', () => {
    expect(
      shouldSkipAsyncDiagnosticsProbe({
        force: false,
        probeKey: 'k',
        previousProbeKey: 'k',
        inFlight: null,
      })
    ).toBe(true);

    expect(
      shouldSkipAsyncDiagnosticsProbe({
        force: false,
        probeKey: 'new',
        previousProbeKey: 'old',
        inFlight: Promise.resolve(),
      })
    ).toBe(true);

    expect(
      shouldSkipAsyncDiagnosticsProbe({
        force: true,
        probeKey: 'k',
        previousProbeKey: 'k',
        inFlight: null,
      })
    ).toBe(false);
  });

  it('normalizes probe result values safely', () => {
    expect(resolveSessionSupportProbeValue({ supported: true })).toBe(true);
    expect(resolveSessionSupportProbeValue({ supported: false })).toBe(false);
    expect(resolveSessionSupportProbeValue({ supported: 'maybe' })).toBeNull();

    expect(resolveRequirePlayerAuthValue({ value: true })).toBe(true);
    expect(resolveRequirePlayerAuthValue({ value: false })).toBe(false);
    expect(resolveRequirePlayerAuthValue({ value: 'unknown' })).toBe('unknown');
  });
});

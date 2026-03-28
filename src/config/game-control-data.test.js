/**
 * Tests for src/config/game-control-data.js
 *
 * Verifies the control-data module exposes correct constants and that preset
 * subsets are fully covered by the main preset table.
 */

import { describe, it, expect } from 'vitest';
import {
  ROUND_DURATION_PRESETS,
  ROUND_DURATION_LIMITS,
  ASYNC_ROUND_PRESET_IDS,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_PRESET_IDS,
  ASYNC_SESSION_DEFAULT_PRESET,
  ENROLLMENT_WINDOW_LIMITS,
  ENROLLMENT_WINDOW_DEFAULT_SECONDS,
  SCORING_CONTROL,
} from './game-control-data.js';

describe('ROUND_DURATION_PRESETS', () => {
  it('contains standard preset IDs with positive second values', () => {
    const standardIds = [
      '5m',
      '10m',
      '15m',
      '20m',
      '30m',
      '60m',
      '6h',
      '12h',
      '24h',
      '3d',
      '7d',
    ];
    for (const id of standardIds) {
      expect(ROUND_DURATION_PRESETS[id]).toBeTypeOf('number');
      expect(ROUND_DURATION_PRESETS[id]).toBeGreaterThan(0);
    }
  });

  it('includes the async-only 3h preset', () => {
    expect(ROUND_DURATION_PRESETS['3h']).toBe(10800);
  });

  it('values are in ascending order of preset size', () => {
    const ids = [
      '5m',
      '10m',
      '15m',
      '20m',
      '30m',
      '60m',
      '3h',
      '6h',
      '12h',
      '24h',
      '3d',
      '7d',
    ];
    for (let i = 1; i < ids.length; i++) {
      expect(ROUND_DURATION_PRESETS[ids[i]]).toBeGreaterThan(
        ROUND_DURATION_PRESETS[ids[i - 1]]
      );
    }
  });
});

describe('ROUND_DURATION_LIMITS', () => {
  it('has min 60 and max 2592000 (30 days)', () => {
    expect(ROUND_DURATION_LIMITS.min).toBe(60);
    expect(ROUND_DURATION_LIMITS.max).toBe(2592000);
  });

  it('min < max', () => {
    expect(ROUND_DURATION_LIMITS.min).toBeLessThan(ROUND_DURATION_LIMITS.max);
  });
});

describe('ASYNC_ROUND_PRESET_IDS', () => {
  it('all entries exist in ROUND_DURATION_PRESETS', () => {
    for (const id of ASYNC_ROUND_PRESET_IDS) {
      expect(ROUND_DURATION_PRESETS).toHaveProperty(id);
    }
  });

  it('does not include 20m (sync-only)', () => {
    expect(ASYNC_ROUND_PRESET_IDS).not.toContain('20m');
  });

  it('includes 30m for async round testing', () => {
    expect(ASYNC_ROUND_PRESET_IDS).toContain('30m');
  });

  it('includes the 3h async-only preset', () => {
    expect(ASYNC_ROUND_PRESET_IDS).toContain('3h');
  });
});

describe('ASYNC_ROUND_DEFAULT_PRESET', () => {
  it('is 30m', () => {
    expect(ASYNC_ROUND_DEFAULT_PRESET).toBe('30m');
  });

  it('is in ASYNC_ROUND_PRESET_IDS', () => {
    expect(ASYNC_ROUND_PRESET_IDS).toContain(ASYNC_ROUND_DEFAULT_PRESET);
  });
});

describe('ASYNC_SESSION_PRESET_IDS', () => {
  it('all entries exist in ROUND_DURATION_PRESETS', () => {
    for (const id of ASYNC_SESSION_PRESET_IDS) {
      expect(ROUND_DURATION_PRESETS).toHaveProperty(id);
    }
  });

  it('includes 30m', () => {
    expect(ASYNC_SESSION_PRESET_IDS).toContain('30m');
  });

  it('includes 24h', () => {
    expect(ASYNC_SESSION_PRESET_IDS).toContain('24h');
  });
});

describe('ASYNC_SESSION_DEFAULT_PRESET', () => {
  it('is 5m', () => {
    expect(ASYNC_SESSION_DEFAULT_PRESET).toBe('5m');
  });

  it('is in ASYNC_SESSION_PRESET_IDS', () => {
    expect(ASYNC_SESSION_PRESET_IDS).toContain(ASYNC_SESSION_DEFAULT_PRESET);
  });
});

describe('ENROLLMENT_WINDOW_LIMITS', () => {
  it('has min 5 and max 3600', () => {
    expect(ENROLLMENT_WINDOW_LIMITS.min).toBe(5);
    expect(ENROLLMENT_WINDOW_LIMITS.max).toBe(3600);
  });

  it('min < max', () => {
    expect(ENROLLMENT_WINDOW_LIMITS.min).toBeLessThan(
      ENROLLMENT_WINDOW_LIMITS.max
    );
  });
});

describe('ENROLLMENT_WINDOW_DEFAULT_SECONDS', () => {
  it('is 10', () => {
    expect(ENROLLMENT_WINDOW_DEFAULT_SECONDS).toBe(10);
  });

  it('is within ENROLLMENT_WINDOW_LIMITS', () => {
    expect(ENROLLMENT_WINDOW_DEFAULT_SECONDS).toBeGreaterThanOrEqual(
      ENROLLMENT_WINDOW_LIMITS.min
    );
    expect(ENROLLMENT_WINDOW_DEFAULT_SECONDS).toBeLessThanOrEqual(
      ENROLLMENT_WINDOW_LIMITS.max
    );
  });
});

describe('SCORING_CONTROL', () => {
  it('DEFAULT_MODE is stockpile_total_tokens', () => {
    expect(SCORING_CONTROL.DEFAULT_MODE).toBe('stockpile_total_tokens');
  });

  it('ALLOWED_MODES contains all four modes', () => {
    expect(SCORING_CONTROL.ALLOWED_MODES).toEqual(
      expect.arrayContaining([
        'stockpile',
        'power',
        'mining_time',
        'efficiency',
      ])
    );
    expect(SCORING_CONTROL.ALLOWED_MODES).toHaveLength(4);
  });

  it('CANONICAL_MODES maps each allowed mode to a canonical full name', () => {
    expect(SCORING_CONTROL.CANONICAL_MODES.stockpile).toBe(
      'stockpile_total_tokens'
    );
    expect(SCORING_CONTROL.CANONICAL_MODES.power).toBe('power_oracle_weighted');
    expect(SCORING_CONTROL.CANONICAL_MODES.mining_time).toBe(
      'mining_time_equivalent'
    );
    expect(SCORING_CONTROL.CANONICAL_MODES.efficiency).toBe(
      'efficiency_system_mastery'
    );
  });

  it('DEFAULT_MODE is a value in CANONICAL_MODES', () => {
    const canonicalValues = Object.values(SCORING_CONTROL.CANONICAL_MODES);
    expect(canonicalValues).toContain(SCORING_CONTROL.DEFAULT_MODE);
  });
});

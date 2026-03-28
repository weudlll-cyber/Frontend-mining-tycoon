// Tests compact number formatting for UI value rendering.
import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('formatCompactNumber utility', () => {
  it('formats small numbers without suffixes', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(123.456, { decimalsSmall: 2 });
    expect(result.display).toBe('123.46');
    expect(result.full).toContain('123.46');
  });

  it('formats numbers >= 1k with k suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234, { decimalsSmall: 2 });
    expect(result.display).toBe('1.23k');
  });

  it('formats numbers >= 1M with M suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.display).toBe('1.23M');
  });

  it('formats numbers >= 1B with B suffix', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567890, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.display).toBe('1.23B');
  });

  it('returns em dash for non-finite values', async () => {
    const module = await loadMainModule();
    const resultNaN = module.formatCompactNumber(Number.NaN, {
      decimalsSmall: 2,
    });
    const resultInf = module.formatCompactNumber(Number.POSITIVE_INFINITY, {
      decimalsSmall: 2,
    });
    const resultNegInf = module.formatCompactNumber(Number.NEGATIVE_INFINITY, {
      decimalsSmall: 2,
    });

    expect(resultNaN.display).toBe('—');
    expect(resultInf.display).toBe('—');
    expect(resultNegInf.display).toBe('—');
  });

  it('provides full uncompressed value for tooltips', async () => {
    const module = await loadMainModule();
    const result = module.formatCompactNumber(1234567890, {
      decimalsSmall: 2,
      decimalsLarge: 2,
    });
    expect(result.full).toContain('1,234,567,890');
  });
});

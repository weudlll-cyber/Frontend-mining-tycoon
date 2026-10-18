// Tests the next-halving countdown text of the player board.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startNextHalvingCountdown,
  stopNextHalvingCountdown,
} from './halving-display.js';

afterEach(() => {
  stopNextHalvingCountdown();
  vi.useRealTimers();
});

describe('next-halving countdown', () => {
  it('shows mm:ss and the title-case token name, ticking every second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const textNode = document.createTextNode('');
    startNextHalvingCountdown({
      textNode,
      token: 'summer',
      halvingAtUnix: Date.now() / 1000 + 65,
    });
    expect(textNode.textContent).toBe(
      'Next halving in: ~01:05 (token: Summer)'
    );

    vi.advanceTimersByTime(1000);
    expect(textNode.textContent).toBe(
      'Next halving in: ~01:04 (token: Summer)'
    );
  });
});

import { describe, expect, it } from 'vitest';
import { PLAYER_NAME_MAX_LENGTH, toPlayerName } from './player-name.js';

describe('toPlayerName', () => {
  it('keeps a valid display name unchanged (trimmed)', () => {
    expect(toPlayerName('  Ana Miner_1.0-x ', 'ana')).toBe('Ana Miner_1.0-x');
  });

  it('keeps unicode letters and digits', () => {
    expect(toPlayerName('Jürgen Ölmann', 'juergen')).toBe('Jürgen Ölmann');
  });

  it('replaces disallowed characters and collapses spaces', () => {
    expect(toPlayerName("Bob's (Mega)!! Rig 🚀", 'bob')).toBe('Bob s Mega Rig');
  });

  it('truncates long display names to the backend limit', () => {
    const name = toPlayerName('A'.repeat(80), 'user');
    expect(name).toHaveLength(PLAYER_NAME_MAX_LENGTH);
  });

  it('falls back to the username when the display name has nothing usable', () => {
    expect(toPlayerName('🚀🚀🚀', 'rocket_fan')).toBe('rocket_fan');
    expect(toPlayerName('', 'x'.repeat(50))).toHaveLength(
      PLAYER_NAME_MAX_LENGTH
    );
  });

  it('falls back to Player when nothing is usable', () => {
    expect(toPlayerName('!!!', '')).toBe('Player');
    expect(toPlayerName(null, undefined)).toBe('Player');
  });
});

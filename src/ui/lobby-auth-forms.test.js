// Tests the lobby account form helpers (the form flows run in src/lobby.test.js).
import { describe, expect, it } from 'vitest';
import { validateEmail, validatePasswordClient } from './lobby-auth-forms.js';

describe('lobby auth form validation', () => {
  it('checks the email shape', () => {
    expect(validateEmail('alice@example.com')).toBe(true);
    expect(validateEmail('alice@example')).toBe(false);
    expect(validateEmail('no at sign')).toBe(false);
  });

  it('explains the first unmet password rule', () => {
    expect(validatePasswordClient('Short1!')).toMatch(/at least 12/);
    expect(validatePasswordClient('lowercase123!')).toMatch(/uppercase/);
    expect(validatePasswordClient('UPPERCASE123!')).toMatch(/lowercase/);
    expect(validatePasswordClient('NoDigitsHere!!')).toMatch(/digit/);
    expect(validatePasswordClient('NoSpecial1234')).toMatch(/special/);
    expect(validatePasswordClient('Valid-Password1')).toBeNull();
  });
});

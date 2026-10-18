// Tests the lobby account forms: validation helpers and the register dialog
// (login, logout and change password also run through src/lobby.test.js).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush } from '../test-utils/async-helpers.js';

vi.mock('../services/auth-client.js', () => ({
  changePassword: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('./lobby-account-email.js', () => ({
  getEmailCapabilities: vi.fn(() => ({ emailVerification: true })),
}));

const authClient = await import('../services/auth-client.js');
const { initLobbyAuthForms, validateEmail, validatePasswordClient } =
  await import('./lobby-auth-forms.js');

const VALID_PASSWORD = 'Valid-Password1';
let deps;

function buildDom() {
  document.body.innerHTML = `
    <button id="open-register-dialog" type="button"></button>
    <dialog id="register-dialog">
      <form id="register-form">
        <input id="register-username" name="username" />
        <input id="register-display-name" name="displayName" />
        <input id="register-email" name="email" />
        <input id="register-password" name="password" />
        <input id="register-password-confirm" name="passwordConfirm" />
        <p id="register-message"></p>
        <button id="cancel-register-dialog" type="button"></button>
      </form>
    </dialog>
  `;
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
  }
}

function fillRegisterForm(overrides = {}) {
  const values = {
    'register-username': 'alice',
    'register-email': 'alice@example.com',
    'register-password': VALID_PASSWORD,
    'register-password-confirm': VALID_PASSWORD,
    ...overrides,
  };
  Object.entries(values).forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
}

async function submitRegister() {
  document
    .getElementById('register-form')
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
}

const registerMessage = () =>
  document.getElementById('register-message').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  buildDom();
  deps = {
    getBackendUrl: vi.fn(() => 'http://api'),
    getAuthState: () => ({ isAuthenticated: false, token: '' }),
    applySession: vi.fn(),
    setAuthMessage: vi.fn(),
    setLobbyMessage: vi.fn(),
    onSignedIn: vi.fn(),
    onSessionExpired: vi.fn(),
    clearSessionLocally: vi.fn(),
    onLoggedOut: vi.fn(),
  };
  initLobbyAuthForms(deps);
});

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
    expect(validatePasswordClient(VALID_PASSWORD)).toBeNull();
  });
});

describe('register dialog', () => {
  it('opens, mirrors the username into the display name and closes', () => {
    document.getElementById('open-register-dialog').click();
    expect(
      document.getElementById('register-dialog').showModal
    ).toHaveBeenCalled();
    expect(registerMessage()).toBe('Create your account details below.');

    const username = document.getElementById('register-username');
    const displayName = document.getElementById('register-display-name');
    username.value = ' bob ';
    username.dispatchEvent(new Event('input'));
    expect(displayName.value).toBe('bob');

    displayName.value = 'Bobby';
    displayName.dispatchEvent(new Event('input'));
    username.value = 'robert';
    username.dispatchEvent(new Event('input'));
    username.dispatchEvent(new Event('blur'));
    expect(displayName.value).toBe('Bobby');

    document.getElementById('cancel-register-dialog').click();
    expect(document.getElementById('register-dialog').close).toHaveBeenCalled();
  });

  it('fills an empty display name on blur', () => {
    const username = document.getElementById('register-username');
    const displayName = document.getElementById('register-display-name');
    username.value = 'carol';
    username.dispatchEvent(new Event('input'));
    displayName.value = '';
    username.dispatchEvent(new Event('blur'));
    expect(displayName.value).toBe('carol');
  });

  it('rejects an invalid email, a weak password and a mismatch locally', async () => {
    fillRegisterForm({ 'register-email': 'nope' });
    await submitRegister();
    expect(registerMessage()).toBe('Please enter a valid email address.');

    fillRegisterForm({ 'register-password': 'short' });
    await submitRegister();
    expect(registerMessage()).toMatch(/at least 12/);

    fillRegisterForm({ 'register-password-confirm': 'Other-Password1' });
    await submitRegister();
    expect(registerMessage()).toBe('Password confirmation does not match.');
    expect(vi.mocked(authClient.register)).not.toHaveBeenCalled();
  });

  it('shows a missing backend URL in the dialog', async () => {
    deps.getBackendUrl.mockImplementation(() => {
      throw new Error('Backend URL is not set.');
    });
    fillRegisterForm();
    await submitRegister();
    expect(registerMessage()).toBe('Backend URL is not set.');
  });

  it('registers and points to the confirmation email', async () => {
    vi.mocked(authClient.register).mockResolvedValue({});
    fillRegisterForm();
    await submitRegister();
    expect(vi.mocked(authClient.register)).toHaveBeenCalledWith(
      'http://api',
      expect.objectContaining({ username: 'alice', password: VALID_PASSWORD })
    );
    expect(deps.setAuthMessage).toHaveBeenCalledWith(
      expect.stringContaining('We have sent you an email'),
      'success'
    );
    expect(document.getElementById('register-dialog').close).toHaveBeenCalled();
  });

  it('shows backend registration errors in the dialog', async () => {
    vi.mocked(authClient.register).mockRejectedValue(
      new Error('Username already taken.')
    );
    fillRegisterForm();
    await submitRegister();
    expect(registerMessage()).toBe('Username already taken.');
  });
});

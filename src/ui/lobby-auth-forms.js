/**
File: src/ui/lobby-auth-forms.js
Purpose: Account forms of the lobby (index.html): sign in, the "Create
  account" dialog (with the display name following the username until edited),
  the "Change password" dialog and logout.
Role in system: lobby-only, so native <dialog>s are allowed (LOCKED_DECISIONS
  §C). src/lobby.js owns the session state and passes it in through
  initLobbyAuthForms(); this module only handles the form events and calls the
  auth endpoints (src/services/auth-client.js).
Constraints: the backend owns password rules and sessions. Register checks the
  email shape and password strength locally only to give early hints; change
  password only checks that the confirmation matches. After a password change
  or logout the local session is cleared even if the backend is unreachable.
Security notes: passwords stay in the form fields and request bodies only;
  messages are shown with textContent.
*/

import {
  changePassword,
  login,
  logout,
  register,
} from '../services/auth-client.js';
import { DEFAULT_BACKEND_URL } from '../config/backend-url.js';
import { getEmailCapabilities } from './lobby-account-email.js';

let els = {};
let deps = {};
let displayNameUserEdited = false;

function byId(id) {
  return document.getElementById(id);
}

function setFormMessage(el, message, kind) {
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function setRegisterMessage(message, kind = 'info') {
  setFormMessage(els.registerMessage, message, kind);
}

function setChangePasswordMessage(message, kind = 'info') {
  setFormMessage(els.changePasswordMessage, message, kind);
}

/** Backend URL, or null after showing the error with `showError`. */
function readBaseUrl(showError) {
  try {
    return deps.getBackendUrl();
  } catch (error) {
    showError(error.message, 'error');
    return null;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.loginForm);

  const baseUrl = readBaseUrl(deps.setAuthMessage);
  if (!baseUrl) return;

  try {
    const payload = await login(baseUrl, {
      username: formData.get('username'),
      password: formData.get('password'),
    });
    deps.applySession(payload);
    if (!deps.getAuthState().isAuthenticated) {
      throw new Error('Login response did not include an access token.');
    }
    deps.setAuthMessage(
      'Login successful. Please select a game from the open list.',
      'success'
    );
    deps.onSignedIn(deps.getAuthState().token);
  } catch (error) {
    deps.setAuthMessage(error.message, 'error');
  }
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePasswordClient(password) {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password))
    return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password))
    return 'Password must contain at least one digit.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password))
    return 'Password must contain at least one special character (e.g. !@#$)';
  return null;
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  setRegisterMessage('', 'info');
  const formData = new FormData(els.registerForm);

  const emailVal = String(formData.get('email') || '').trim();
  if (!validateEmail(emailVal)) {
    setRegisterMessage('Please enter a valid email address.', 'error');
    return;
  }

  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');

  const pwError = validatePasswordClient(password);
  if (pwError) {
    setRegisterMessage(pwError, 'error');
    return;
  }

  if (password !== passwordConfirm) {
    setRegisterMessage('Password confirmation does not match.', 'error');
    return;
  }

  const baseUrl = readBaseUrl(setRegisterMessage);
  if (!baseUrl) return;

  try {
    await register(baseUrl, {
      username: formData.get('username'),
      email: formData.get('email'),
      password,
      displayName: formData.get('displayName'),
      discord: formData.get('discord'),
      telegram: formData.get('telegram'),
    });
    deps.setAuthMessage(
      getEmailCapabilities().emailVerification
        ? 'Registration successful. You can sign in now. We have sent you an email to confirm your address.'
        : 'Registration successful. You can sign in now.',
      'success'
    );
    els.registerDialog?.close();
    els.registerForm?.reset();
    setRegisterMessage('', 'info');
  } catch (error) {
    setRegisterMessage(error.message, 'error');
  }
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.changePasswordForm);
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const newPasswordConfirm = String(formData.get('newPasswordConfirm') || '');

  const authState = deps.getAuthState();
  if (!authState.isAuthenticated) {
    setChangePasswordMessage('Please sign in first.', 'error');
    return;
  }
  // WHY: only the confirmation match is checked locally; password strength
  // rules are owned by the backend and its 400/422 message is shown verbatim.
  if (newPassword !== newPasswordConfirm) {
    setChangePasswordMessage(
      'New password confirmation does not match.',
      'error'
    );
    return;
  }

  const baseUrl = readBaseUrl(setChangePasswordMessage);
  if (!baseUrl) return;

  setChangePasswordMessage('Changing password...', 'info');
  try {
    await changePassword(baseUrl, {
      authToken: authState.token,
      currentPassword,
      newPassword,
    });
  } catch (error) {
    if (error?.status === 401) {
      els.changePasswordDialog?.close();
      deps.onSessionExpired();
      return;
    }
    setChangePasswordMessage(
      error?.message || 'Password change failed.',
      'error'
    );
    return;
  }

  // WHY: the backend revokes every session of the account after a password
  // change, so the stored token is dead; clear it and ask for a fresh sign-in.
  els.changePasswordForm?.reset();
  setChangePasswordMessage('', 'info');
  els.changePasswordDialog?.close();
  deps.clearSessionLocally();
  deps.setAuthMessage(
    'Password changed. Please sign in again with your new password.',
    'success'
  );
}

function showLoggedOut() {
  deps.setAuthMessage(
    'Logged out successfully. Sign in to continue.',
    'success'
  );
  deps.setLobbyMessage(
    'You are logged out. Open games keep auto-refreshing.',
    'info'
  );
}

async function handleLogoutClick() {
  const confirmed = window.confirm('Do you really want to log out?');
  if (!confirmed) {
    return;
  }

  const authToken = String(deps.getAuthState().token || '').trim();
  if (!authToken) {
    deps.clearSessionLocally();
    showLoggedOut();
    return;
  }

  let baseUrl;
  try {
    baseUrl = deps.getBackendUrl();
  } catch {
    baseUrl = DEFAULT_BACKEND_URL;
  }

  if (els.logoutBtn) els.logoutBtn.disabled = true;
  deps.setAuthMessage('Logging out...', 'info');

  try {
    await logout(baseUrl, { authToken });
  } catch {
    // Continue local logout even if backend is unavailable to avoid trapping user state.
  }

  deps.clearSessionLocally();
  deps.onLoggedOut();
  showLoggedOut();
}

function syncDisplayNameFromUsername({ onlyWhenEmpty = false } = {}) {
  const { registerDisplayNameInput, registerUsernameInput } = els;
  if (!registerDisplayNameInput || displayNameUserEdited) return;
  if (onlyWhenEmpty && String(registerDisplayNameInput.value || '').trim()) {
    return;
  }
  registerDisplayNameInput.value = String(
    registerUsernameInput.value || ''
  ).trim();
}

function bindFormEvents() {
  els.loginForm?.addEventListener('submit', (event) => {
    void handleLoginSubmit(event);
  });
  els.registerForm?.addEventListener('submit', (event) => {
    void handleRegisterSubmit(event);
  });
  els.openRegisterBtn?.addEventListener('click', () => {
    displayNameUserEdited = false;
    setRegisterMessage('Create your account details below.', 'info');
    els.registerDialog?.showModal();
  });
  els.cancelRegisterBtn?.addEventListener('click', () => {
    els.registerDialog?.close();
  });
  els.registerDisplayNameInput?.addEventListener('input', () => {
    displayNameUserEdited = true;
  });
  els.registerUsernameInput?.addEventListener('input', () => {
    syncDisplayNameFromUsername();
  });
  els.registerUsernameInput?.addEventListener('blur', () => {
    syncDisplayNameFromUsername({ onlyWhenEmpty: true });
  });
  els.logoutBtn?.addEventListener('click', () => {
    void handleLogoutClick();
  });
  els.openChangePasswordBtn?.addEventListener('click', () => {
    els.changePasswordForm?.reset();
    setChangePasswordMessage('', 'info');
    els.changePasswordDialog?.showModal();
  });
  els.cancelChangePasswordBtn?.addEventListener('click', () => {
    els.changePasswordDialog?.close();
  });
  els.changePasswordForm?.addEventListener('submit', (event) => {
    void handleChangePasswordSubmit(event);
  });
}

/**
 * Look up the form elements and bind their events.
 * @param {{
 *   getBackendUrl: () => string,        // throws with a user-facing message
 *   getAuthState: () => { isAuthenticated: boolean, token: string },
 *   applySession: (payload: object) => void,
 *   setAuthMessage: (message: string, kind?: string) => void,
 *   setLobbyMessage: (message: string, kind?: string) => void,
 *   onSignedIn: (token: string) => void,
 *   onSessionExpired: () => void,
 *   clearSessionLocally: () => void,     // drop stored session + selection
 *   onLoggedOut: () => void,
 * }} options
 */
export function initLobbyAuthForms(options) {
  deps = options;
  displayNameUserEdited = false;
  els = {
    loginForm: byId('login-form'),
    registerForm: byId('register-form'),
    registerMessage: byId('register-message'),
    registerUsernameInput: byId('register-username'),
    registerDisplayNameInput: byId('register-display-name'),
    registerDialog: byId('register-dialog'),
    openRegisterBtn: byId('open-register-dialog'),
    cancelRegisterBtn: byId('cancel-register-dialog'),
    logoutBtn: byId('logout-btn'),
    changePasswordDialog: byId('change-password-dialog'),
    openChangePasswordBtn: byId('open-change-password'),
    cancelChangePasswordBtn: byId('cancel-change-password'),
    changePasswordForm: byId('change-password-form'),
    changePasswordMessage: byId('change-password-message'),
  };
  bindFormEvents();
}

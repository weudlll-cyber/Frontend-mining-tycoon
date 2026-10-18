/**
File: src/ui/lobby-account-email.js
Purpose: Lobby side of the email features (index.html):
  - "Forgot password?": asks for the username or email and requests a reset
    link (POST /auth/password-reset/request);
  - reset link `index.html?reset=<token>`: opens the "Choose a new password"
    dialog and sends POST /auth/password-reset/confirm;
  - confirmation link `index.html?verify=<token>`: POST /auth/verify-email;
  - the account panel hint "Your email address is not confirmed yet" with a
    "Send the link again" button (POST /auth/verify-email/resend).
Role in system: lobby-only, so native <dialog>s are allowed (LOCKED_DECISIONS
  §C). src/lobby.js wires it and supplies the backend URL and account token.
Constraints: the backend decides everything (token validity, password rules,
  rate limits); "Forgot password?" is only shown when GET
  /auth/email-capabilities says the server can send email.
Security notes: tokens are removed from the address bar right away
  (history.replaceState) so they do not stay in the history or get shared by
  copying the URL; they are only sent in request bodies. Backend messages are
  shown with textContent.
*/

import {
  confirmPasswordReset,
  fetchEmailCapabilities,
  requestPasswordReset,
  resendVerificationEmail,
  verifyEmail,
} from '../services/auth-client.js';

export const RESET_DISABLED_MESSAGE =
  'Password reset is not available. Please contact an administrator.';

let els = null;
let getContext = () => ({ baseUrl: '', authToken: '' });
let setStatus = () => {};
let capabilities = { passwordReset: false, emailVerification: false };
let resetToken = '';

function byId(id) {
  return document.getElementById(id);
}

function setMessage(el, message, kind = 'info') {
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

/** Current capabilities (for tests and the registration message). */
export function getEmailCapabilities() {
  return { ...capabilities };
}

function applyCapabilities() {
  if (els.openForgot) els.openForgot.hidden = !capabilities.passwordReset;
}

/** Load what the backend offers; failures keep everything email-related hidden. */
export async function loadEmailCapabilities() {
  try {
    capabilities = await fetchEmailCapabilities(getContext().baseUrl);
  } catch {
    capabilities = { passwordReset: false, emailVerification: false };
  }
  applyCapabilities();
  return getEmailCapabilities();
}

/**
 * Show or hide the "not confirmed" hint for the signed-in account.
 * `verified` is the `email_verified` flag from login or /auth/me; `undefined`
 * (older backend, or not known yet) hides the hint.
 */
export function renderEmailVerification(verified) {
  if (!els?.verifyHint) return;
  const show = verified === false && capabilities.emailVerification;
  els.verifyHint.hidden = !show;
  if (!show) setMessage(els.verifyMessage, '', 'info');
}

async function handleForgotSubmit(event) {
  event.preventDefault();
  const identifier = String(els.forgotIdentifier?.value || '').trim();
  if (!identifier) {
    setMessage(els.forgotMessage, 'Enter your username or email.', 'error');
    return;
  }
  setMessage(els.forgotMessage, 'Sending...', 'info');
  try {
    const result = await requestPasswordReset(getContext().baseUrl, {
      identifier,
    });
    setMessage(els.forgotMessage, '', 'info');
    els.forgotDialog?.close();
    setStatus(
      result?.message || 'If the account exists, we have sent it an email.',
      'success'
    );
  } catch (error) {
    const message =
      error?.status === 403
        ? RESET_DISABLED_MESSAGE
        : error?.message || 'Could not request a reset link.';
    setMessage(els.forgotMessage, message, 'error');
  }
}

async function handleResetSubmit(event) {
  event.preventDefault();
  const password = String(els.resetPassword?.value || '');
  const confirm = String(els.resetConfirm?.value || '');
  // WHY: only the match is checked here; strength rules belong to the backend
  // and its 422 message is shown as is.
  if (password !== confirm) {
    setMessage(els.resetMessage, 'The two passwords do not match.', 'error');
    return;
  }
  setMessage(els.resetMessage, 'Saving...', 'info');
  try {
    const result = await confirmPasswordReset(getContext().baseUrl, {
      token: resetToken,
      newPassword: password,
    });
    resetToken = '';
    els.resetForm?.reset();
    setMessage(els.resetMessage, '', 'info');
    els.resetDialog?.close();
    setStatus(
      result?.message || 'Your password has been changed. Please sign in.',
      'success'
    );
  } catch (error) {
    setMessage(
      els.resetMessage,
      error?.message || 'Could not change the password.',
      'error'
    );
  }
}

async function handleResendClick() {
  if (els.resendBtn) els.resendBtn.disabled = true;
  try {
    const result = await resendVerificationEmail(getContext().baseUrl, {
      authToken: getContext().authToken,
    });
    setMessage(
      els.verifyMessage,
      result?.message || 'We have sent you a new link.',
      'success'
    );
  } catch (error) {
    setMessage(
      els.verifyMessage,
      error?.message || 'Could not send the link.',
      'error'
    );
  } finally {
    if (els.resendBtn) els.resendBtn.disabled = false;
  }
}

/**
 * Handle `?reset=` / `?verify=` links from emails. The token is taken out of
 * the address bar before anything else happens.
 */
export async function handleEmailLinkFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const reset = String(params.get('reset') || '').trim();
  const verify = String(params.get('verify') || '').trim();
  if (!reset && !verify) return;
  window.history.replaceState(null, '', window.location.pathname);

  if (reset) {
    resetToken = reset;
    els.resetForm?.reset();
    setMessage(els.resetMessage, '', 'info');
    els.resetDialog?.showModal();
    return;
  }
  try {
    const result = await verifyEmail(getContext().baseUrl, { token: verify });
    setStatus(result?.message || 'Your email address is confirmed.', 'success');
    renderEmailVerification(true);
  } catch (error) {
    setStatus(
      error?.message || 'This confirmation link did not work.',
      'error'
    );
  }
}

/**
 * Wire the dialogs and the hint. `getContext` returns `{ baseUrl, authToken }`;
 * `setStatus(message, kind)` writes the lobby's main auth message.
 */
export function initAccountEmail(options = {}) {
  getContext = options.getContext || getContext;
  setStatus = options.setStatus || setStatus;
  capabilities = { passwordReset: false, emailVerification: false };
  resetToken = '';
  els = {
    openForgot: byId('open-forgot-password'),
    forgotDialog: byId('forgot-password-dialog'),
    forgotForm: byId('forgot-password-form'),
    forgotIdentifier: byId('forgot-identifier'),
    forgotMessage: byId('forgot-password-message'),
    cancelForgot: byId('cancel-forgot-password'),
    resetDialog: byId('reset-password-dialog'),
    resetForm: byId('reset-password-form'),
    resetPassword: byId('reset-new-password'),
    resetConfirm: byId('reset-new-password-confirm'),
    resetMessage: byId('reset-password-message'),
    cancelReset: byId('cancel-reset-password'),
    verifyHint: byId('email-verify-hint'),
    verifyMessage: byId('email-verify-message'),
    resendBtn: byId('resend-verification-btn'),
  };
  applyCapabilities();

  els.openForgot?.addEventListener('click', () => {
    els.forgotForm?.reset();
    setMessage(els.forgotMessage, '', 'info');
    els.forgotDialog?.showModal();
  });
  els.cancelForgot?.addEventListener('click', () => els.forgotDialog?.close());
  els.forgotForm?.addEventListener('submit', (event) => {
    void handleForgotSubmit(event);
  });
  els.cancelReset?.addEventListener('click', () => {
    resetToken = '';
    els.resetDialog?.close();
  });
  els.resetForm?.addEventListener('submit', (event) => {
    void handleResetSubmit(event);
  });
  els.resendBtn?.addEventListener('click', () => {
    void handleResendClick();
  });
}

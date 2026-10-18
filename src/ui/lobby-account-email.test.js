/**
File: src/ui/lobby-account-email.test.js
Purpose: Unit tests for the lobby email features: capabilities, the
  confirmation link (?verify=), the reset link (?reset=), the "not confirmed"
  hint and its resend button.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/auth-client.js', () => ({
  fetchEmailCapabilities: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerificationEmail: vi.fn(),
}));

import * as authClient from '../services/auth-client.js';
import {
  getEmailCapabilities,
  handleEmailLinkFromQuery,
  initAccountEmail,
  loadEmailCapabilities,
  renderEmailVerification,
} from './lobby-account-email.js';
import { flush } from '../test-utils/async-helpers.js';

const setStatus = vi.fn();

function buildDom() {
  document.body.innerHTML = `
    <button id="open-forgot-password" hidden></button>
    <dialog id="forgot-password-dialog">
      <form id="forgot-password-form">
        <input id="forgot-identifier" />
        <p id="forgot-password-message"></p>
        <button id="cancel-forgot-password" type="button"></button>
      </form>
    </dialog>
    <dialog id="reset-password-dialog">
      <form id="reset-password-form">
        <input id="reset-new-password" />
        <input id="reset-new-password-confirm" />
        <p id="reset-password-message"></p>
        <button id="cancel-reset-password" type="button"></button>
      </form>
    </dialog>
    <div id="email-verify-hint" hidden>
      <button id="resend-verification-btn" type="button"></button>
      <p id="email-verify-message"></p>
    </div>
    <div id="email-confirm-notice" hidden>
      <button id="confirm-email-btn" type="button"></button>
    </div>
  `;
  // jsdom has no <dialog> methods.
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  buildDom();
  window.history.replaceState(null, '', '/');
  vi.mocked(authClient.fetchEmailCapabilities).mockResolvedValue({
    passwordReset: true,
    emailVerification: true,
  });
  initAccountEmail({
    getContext: () => ({ baseUrl: 'http://api', authToken: 'tok' }),
    setStatus,
  });
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('email capabilities', () => {
  it('shows "Forgot password?" when the server can send email', async () => {
    await loadEmailCapabilities();
    expect(document.getElementById('open-forgot-password').hidden).toBe(false);
    expect(getEmailCapabilities()).toEqual({
      passwordReset: true,
      emailVerification: true,
    });
  });

  it('keeps everything hidden when the capability check fails', async () => {
    vi.mocked(authClient.fetchEmailCapabilities).mockRejectedValue(
      new Error('offline')
    );
    await loadEmailCapabilities();
    expect(document.getElementById('open-forgot-password').hidden).toBe(true);
    renderEmailVerification(false);
    expect(document.getElementById('email-verify-hint').hidden).toBe(true);
  });
});

describe('confirmation hint', () => {
  it('shows the hint only for a known unconfirmed address', async () => {
    await loadEmailCapabilities();
    const hint = document.getElementById('email-verify-hint');
    renderEmailVerification(undefined);
    expect(hint.hidden).toBe(true);
    renderEmailVerification(false);
    expect(hint.hidden).toBe(false);
    renderEmailVerification(true);
    expect(hint.hidden).toBe(true);
  });

  it('reports resend errors next to the button', async () => {
    vi.mocked(authClient.resendVerificationEmail).mockRejectedValue(
      Object.assign(new Error('Please wait a minute.'), { status: 429 })
    );
    document.getElementById('resend-verification-btn').click();
    await flush();
    expect(vi.mocked(authClient.resendVerificationEmail)).toHaveBeenCalledWith(
      'http://api',
      { authToken: 'tok' }
    );
    const message = document.getElementById('email-verify-message');
    expect(message.textContent).toBe('Please wait a minute.');
    expect(message.dataset.kind).toBe('error');
    expect(document.getElementById('resend-verification-btn').disabled).toBe(
      false
    );
  });
});

describe('links from emails', () => {
  it('confirms the address for ?verify= only after the button press', async () => {
    await loadEmailCapabilities();
    renderEmailVerification(false);
    window.history.replaceState(null, '', '/?verify=v-token');
    vi.mocked(authClient.verifyEmail).mockResolvedValue({
      message: 'Thank you, your email address is confirmed.',
    });

    await handleEmailLinkFromQuery();

    // Loading the page must not use up the token (mail link scanners).
    expect(window.location.search).toBe('');
    expect(vi.mocked(authClient.verifyEmail)).not.toHaveBeenCalled();
    const notice = document.getElementById('email-confirm-notice');
    expect(notice.hidden).toBe(false);

    document.getElementById('confirm-email-btn').click();
    await flush();

    expect(notice.hidden).toBe(true);
    expect(vi.mocked(authClient.verifyEmail)).toHaveBeenCalledWith(
      'http://api',
      { token: 'v-token' }
    );
    expect(setStatus).toHaveBeenCalledWith(
      'Thank you, your email address is confirmed.',
      'success'
    );
    expect(document.getElementById('email-verify-hint').hidden).toBe(true);
  });

  it('reports a confirmation link that did not work', async () => {
    window.history.replaceState(null, '', '/?verify=bad');
    vi.mocked(authClient.verifyEmail).mockRejectedValue(
      Object.assign(new Error('This link is invalid or has expired.'), {
        status: 400,
      })
    );
    await handleEmailLinkFromQuery();
    const button = document.getElementById('confirm-email-btn');
    button.click();
    await flush();
    expect(setStatus).toHaveBeenCalledWith(
      'This link is invalid or has expired.',
      'error'
    );
    // The notice stays for a retry and the button is usable again.
    expect(document.getElementById('email-confirm-notice').hidden).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('ignores the confirm button without a pending link', async () => {
    document.getElementById('confirm-email-btn').click();
    await flush();
    expect(vi.mocked(authClient.verifyEmail)).not.toHaveBeenCalled();
  });

  it('opens the new-password dialog for ?reset= and forgets the token on cancel', async () => {
    window.history.replaceState(null, '', '/?reset=r-token');
    await handleEmailLinkFromQuery();
    const dialog = document.getElementById('reset-password-dialog');
    expect(window.location.search).toBe('');
    expect(dialog.showModal).toHaveBeenCalled();

    document.getElementById('cancel-reset-password').click();
    expect(dialog.close).toHaveBeenCalled();
    document.getElementById('reset-new-password').value = 'NewPassword123!';
    document.getElementById('reset-new-password-confirm').value =
      'NewPassword123!';
    vi.mocked(authClient.confirmPasswordReset).mockResolvedValue({});
    document
      .getElementById('reset-password-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(vi.mocked(authClient.confirmPasswordReset)).toHaveBeenCalledWith(
      'http://api',
      { token: '', newPassword: 'NewPassword123!' }
    );
  });

  it('does nothing without a link in the address', async () => {
    await handleEmailLinkFromQuery();
    expect(vi.mocked(authClient.verifyEmail)).not.toHaveBeenCalled();
    expect(
      document.getElementById('reset-password-dialog').showModal
    ).not.toHaveBeenCalled();
  });

  it('asks for an identifier before requesting a reset link', async () => {
    document
      .getElementById('forgot-password-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(vi.mocked(authClient.requestPasswordReset)).not.toHaveBeenCalled();
    expect(document.getElementById('forgot-password-message').textContent).toBe(
      'Enter your username or email.'
    );
  });
});

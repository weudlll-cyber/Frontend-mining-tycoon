/**
 * File: src/ui/lobby-account-data.test.js
 * Purpose: Verify the lobby account data-protection controller against mocked
 *          GET /auth/me/export and DELETE /auth/me: file download via a
 *          temporary object URL, the signed-in gate, the delete dialog
 *          (confirmation checkbox gate, 204 / 401 / 403 / 429 / missing
 *          endpoint handling) and the invalid-backend-URL path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

vi.mock('../services/auth-client.js', () => ({
  exportMyAccountData: vi.fn(),
  deleteMyAccount: vi.fn(),
}));

const BASE = 'http://127.0.0.1:8000';

function loadLobbyFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'index.html'),
    'utf8'
  );
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

const $ = (id) => document.getElementById(id);

function apiError(message, status, code = null) {
  return Object.assign(new Error(message), { status, code });
}

let client;
let mod;
let context;
let callbacks;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  loadLobbyFixture();
  const dialog = $('delete-account-dialog');
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
  });
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();

  client = await import('../services/auth-client.js');
  vi.mocked(client.exportMyAccountData).mockReset();
  vi.mocked(client.deleteMyAccount).mockReset();
  mod = await import('./lobby-account-data.js');
  context = { baseUrl: BASE, authToken: 'jwt' };
  callbacks = {
    getContext: vi.fn(() => context),
    onAuthInvalid: vi.fn(),
    onAccountDeleted: vi.fn(),
    setStatus: vi.fn(),
  };
  mod.initAccountData(callbacks);
  mod.setAccountDataEnabled(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('account data buttons', () => {
  it('follow the signed-in state', () => {
    mod.setAccountDataEnabled(false);
    expect($('download-account-data').disabled).toBe(true);
    expect($('open-delete-account').disabled).toBe(true);

    mod.setAccountDataEnabled(true);
    expect($('download-account-data').disabled).toBe(false);
    expect($('open-delete-account').disabled).toBe(false);
  });

  it('ignores the gate before init without throwing', async () => {
    vi.resetModules();
    const fresh = await import('./lobby-account-data.js');
    expect(() => fresh.setAccountDataEnabled(true)).not.toThrow();
  });
});

describe('download my data', () => {
  it('saves the export as a JSON file and revokes the object URL', async () => {
    vi.mocked(client.exportMyAccountData).mockResolvedValue({
      account: { username: 'weudl' },
    });
    const clicks = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function recordClick() {
        clicks.push({ href: this.href, download: this.download });
      });

    $('download-account-data').click();
    await flush();

    expect(client.exportMyAccountData).toHaveBeenCalledWith(BASE, {
      authToken: 'jwt',
    });
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({
      account: { username: 'weudl' },
    });
    expect(clicks).toEqual([
      { href: 'blob:export', download: mod.EXPORT_FILE_NAME },
    ]);
    // The temporary link is removed and the URL revoked on the next tick.
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(
      'Your data was downloaded as mining-tycoon-account-export.json.',
      'success'
    );
    expect($('download-account-data').disabled).toBe(false);
    clickSpy.mockRestore();
  });

  it('expires the session on 401', async () => {
    vi.mocked(client.exportMyAccountData).mockRejectedValue(
      apiError('Authentication required', 401)
    );
    // lobby.js signs out on 401, which disables the buttons.
    callbacks.onAuthInvalid.mockImplementation(() =>
      mod.setAccountDataEnabled(false)
    );

    $('download-account-data').click();
    await flush();

    expect(callbacks.onAuthInvalid).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect($('download-account-data').disabled).toBe(true);
  });

  it('shows the backend message for other errors (e.g. missing endpoint)', async () => {
    vi.mocked(client.exportMyAccountData).mockRejectedValue(
      apiError('Not Found', 404)
    );

    $('download-account-data').click();
    await flush();

    expect(callbacks.setStatus).toHaveBeenLastCalledWith('Not Found', 'error');
    expect(callbacks.onAuthInvalid).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error has none', async () => {
    vi.mocked(client.exportMyAccountData).mockRejectedValue({ status: 500 });

    $('download-account-data').click();
    await flush();

    expect(callbacks.setStatus).toHaveBeenLastCalledWith(
      'Data export failed.',
      'error'
    );
  });

  it('reports an invalid backend URL and a missing session', async () => {
    callbacks.getContext.mockImplementationOnce(() => {
      throw new Error('Backend URL must use http or https.');
    });
    $('download-account-data').click();
    await flush();
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(
      'Backend URL must use http or https.',
      'error'
    );

    context = { baseUrl: BASE, authToken: '' };
    $('download-account-data').click();
    await flush();
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(
      'Please sign in first.',
      'error'
    );
    expect(client.exportMyAccountData).not.toHaveBeenCalled();
  });
});

describe('delete account dialog', () => {
  function openDialog() {
    $('open-delete-account').click();
  }

  async function fillAndSubmit({
    password = 'Secret123!',
    confirm = true,
  } = {}) {
    $('delete-account-password').value = password;
    const checkbox = $('delete-account-confirm');
    checkbox.checked = confirm;
    checkbox.dispatchEvent(new Event('change'));
    $('delete-account-form').dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await flush();
  }

  it('opens with a warning, a cleared form and a disabled submit', () => {
    $('delete-account-password').value = 'left over';
    $('delete-account-message').textContent = 'old';

    openDialog();

    expect($('delete-account-dialog').showModal).toHaveBeenCalled();
    expect($('delete-account-password').value).toBe('');
    expect($('delete-account-message').textContent).toBe('');
    expect($('delete-account-submit').disabled).toBe(true);
    const warning = $('delete-account-dialog').textContent.replace(/\s+/g, ' ');
    expect(warning).toContain('login history');
    expect(warning).toContain('Deleted player');
    expect(warning).toContain('cannot be undone');

    // Opening again while open does not call showModal twice.
    openDialog();
    expect($('delete-account-dialog').showModal).toHaveBeenCalledTimes(1);

    $('cancel-delete-account').click();
    expect($('delete-account-dialog').close).toHaveBeenCalled();
  });

  it('enables submit only while the confirmation is checked', () => {
    openDialog();
    const checkbox = $('delete-account-confirm');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect($('delete-account-submit').disabled).toBe(false);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect($('delete-account-submit').disabled).toBe(true);
  });

  it('refuses to submit without confirmation or password', async () => {
    openDialog();
    await fillAndSubmit({ confirm: false });
    expect($('delete-account-message').textContent).toBe(
      'Please confirm that you understand.'
    );

    await fillAndSubmit({ password: '' });
    expect($('delete-account-message').textContent).toBe(
      'Please enter your password.'
    );
    expect(client.deleteMyAccount).not.toHaveBeenCalled();
  });

  it('deletes the account on 204 and hands over to the lobby', async () => {
    let resolveDelete;
    vi.mocked(client.deleteMyAccount).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    openDialog();
    await fillAndSubmit();

    // While the request runs the submit stays disabled (no double submit).
    expect($('delete-account-submit').disabled).toBe(true);
    expect($('delete-account-message').textContent).toBe(
      'Deleting your account...'
    );

    resolveDelete(null);
    await flush();

    expect(client.deleteMyAccount).toHaveBeenCalledWith(BASE, {
      authToken: 'jwt',
      password: 'Secret123!',
    });
    expect($('delete-account-dialog').close).toHaveBeenCalled();
    expect($('delete-account-password').value).toBe('');
    expect(callbacks.onAccountDeleted).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Secret123!');
  });

  it('shows 403 PASSWORD_INCORRECT inside the dialog and stays open', async () => {
    vi.mocked(client.deleteMyAccount).mockRejectedValue(
      apiError('Password is incorrect.', 403, 'PASSWORD_INCORRECT')
    );
    openDialog();
    await fillAndSubmit();

    const message = $('delete-account-message');
    expect(message.textContent).toBe('Password is incorrect.');
    expect(message.dataset.kind).toBe('error');
    expect($('delete-account-dialog').close).not.toHaveBeenCalled();
    expect($('delete-account-submit').disabled).toBe(false);
    expect(callbacks.onAccountDeleted).not.toHaveBeenCalled();
  });

  it('shows the rate-limit and missing-endpoint messages from the backend', async () => {
    vi.mocked(client.deleteMyAccount).mockRejectedValueOnce(
      apiError('Too many attempts. Try again later.', 429)
    );
    openDialog();
    await fillAndSubmit();
    expect($('delete-account-message').textContent).toBe(
      'Too many attempts. Try again later.'
    );

    vi.mocked(client.deleteMyAccount).mockRejectedValueOnce({ status: 405 });
    await fillAndSubmit();
    expect($('delete-account-message').textContent).toBe(
      'Account deletion failed.'
    );
  });

  it('closes the dialog and expires the session on 401', async () => {
    vi.mocked(client.deleteMyAccount).mockRejectedValue(
      apiError('Authentication required', 401)
    );
    openDialog();
    await fillAndSubmit();

    expect($('delete-account-dialog').close).toHaveBeenCalled();
    expect(callbacks.onAuthInvalid).toHaveBeenCalled();
    expect(callbacks.onAccountDeleted).not.toHaveBeenCalled();
  });

  it('reports an invalid backend URL and a missing session in the dialog', async () => {
    openDialog();
    callbacks.getContext.mockImplementationOnce(() => {
      throw new Error('Backend URL must use http or https.');
    });
    await fillAndSubmit();
    expect($('delete-account-message').textContent).toBe(
      'Backend URL must use http or https.'
    );

    context = { baseUrl: BASE, authToken: '' };
    await fillAndSubmit();
    expect($('delete-account-message').textContent).toBe(
      'Please sign in first.'
    );
    expect(client.deleteMyAccount).not.toHaveBeenCalled();
  });
});

/**
File: src/ui/lobby-account-data.js
Purpose: Controller for the lobby account data-protection actions (index.html):
  - "Download my data": GET /auth/me/export, saved as
    `mining-tycoon-account-export.json` through a Blob + temporary object URL;
  - "Delete account": the #delete-account-dialog with a warning, the account
    password and a confirmation checkbox, then DELETE /auth/me.
Role in system: lobby-only (not the gameplay board), so a native <dialog> is
  allowed (LOCKED_DECISIONS §C). src/lobby.js wires it, supplies the backend
  URL / account token and owns the session handling (expiry, sign-out after a
  deletion).
Constraints: the backend decides everything (password check, rate limit, what
  is deleted); the frontend only sends the intent and shows the outcome.
Security notes: the token is only sent as a bearer header and the password
  only in the request body; neither is rendered. Backend messages are shown
  with textContent.
*/

import {
  deleteMyAccount,
  exportMyAccountData,
} from '../services/auth-client.js';

export const EXPORT_FILE_NAME = 'mining-tycoon-account-export.json';
export const ACCOUNT_DELETED_MESSAGE = 'Your account has been deleted.';

let els = null;
let getContext = () => ({ baseUrl: '', authToken: '' });
let onAuthInvalid = () => {};
let onAccountDeleted = () => {};
let setStatus = () => {};
let deletePending = false;
// Mirrors the lobby's signed-in state (setAccountDataEnabled).
let accountEnabled = false;

function byId(id) {
  return document.getElementById(id);
}

function setDialogMessage(message, kind = 'info') {
  if (!els.deleteMessage) return;
  els.deleteMessage.textContent = message;
  els.deleteMessage.dataset.kind = kind;
}

// The submit button stays disabled until the user ticks the confirmation and
// while a request is running (no double submits).
function syncDeleteSubmitState() {
  if (!els.deleteSubmit) return;
  els.deleteSubmit.disabled = deletePending || !els.deleteConfirm?.checked;
}

/**
 * Save a JSON payload as a file. The object URL is revoked on the next tick:
 * revoking synchronously right after click() can cancel the download in some
 * browsers.
 */
export function saveJsonFile(payload, fileName = EXPORT_FILE_NAME) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function handleDownloadClick() {
  const { downloadBtn } = els;
  let context;
  try {
    context = getContext();
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }
  if (!context.authToken) {
    setStatus('Please sign in first.', 'error');
    return;
  }

  downloadBtn.disabled = true;
  setStatus('Preparing your data export...', 'info');
  try {
    const payload = await exportMyAccountData(context.baseUrl, {
      authToken: context.authToken,
    });
    saveJsonFile(payload);
    setStatus(`Your data was downloaded as ${EXPORT_FILE_NAME}.`, 'success');
  } catch (error) {
    if (error?.status === 401) {
      onAuthInvalid();
      return;
    }
    setStatus(error?.message || 'Data export failed.', 'error');
  } finally {
    // Re-apply the signed-in gate (a 401 above has signed the user out).
    downloadBtn.disabled = !accountEnabled;
  }
}

function openDeleteDialog() {
  const { deleteDialog, deleteForm } = els;
  deleteForm?.reset();
  deletePending = false;
  setDialogMessage('', 'info');
  syncDeleteSubmitState();
  if (!deleteDialog.open && typeof deleteDialog.showModal === 'function') {
    deleteDialog.showModal();
  }
}

async function handleDeleteSubmit(event) {
  event.preventDefault();
  if (!els.deleteConfirm?.checked) {
    setDialogMessage('Please confirm that you understand.', 'error');
    return;
  }
  const password = String(els.deletePassword?.value || '');
  if (!password) {
    setDialogMessage('Please enter your password.', 'error');
    return;
  }

  let context;
  try {
    context = getContext();
  } catch (error) {
    setDialogMessage(error.message, 'error');
    return;
  }
  if (!context.authToken) {
    setDialogMessage('Please sign in first.', 'error');
    return;
  }

  deletePending = true;
  syncDeleteSubmitState();
  setDialogMessage('Deleting your account...', 'info');
  try {
    await deleteMyAccount(context.baseUrl, {
      authToken: context.authToken,
      password,
    });
  } catch (error) {
    deletePending = false;
    syncDeleteSubmitState();
    if (error?.status === 401) {
      els.deleteDialog.close();
      onAuthInvalid();
      return;
    }
    // 403 PASSWORD_INCORRECT, 429 rate limit and a missing endpoint on older
    // backends all show the backend's own message in the dialog.
    setDialogMessage(error?.message || 'Account deletion failed.', 'error');
    return;
  }

  deletePending = false;
  els.deleteForm?.reset();
  setDialogMessage('', 'info');
  syncDeleteSubmitState();
  els.deleteDialog.close();
  onAccountDeleted();
}

/**
 * Wire the buttons and the dialog. Options:
 * - getContext(): { baseUrl, authToken } (may throw for an invalid URL);
 * - onAuthInvalid(): the session expired (401);
 * - onAccountDeleted(): 204 from DELETE /auth/me, clear the local session;
 * - setStatus(message, kind): lobby status line for the download result.
 */
export function initAccountData(options = {}) {
  els = {
    downloadBtn: byId('download-account-data'),
    deleteBtn: byId('open-delete-account'),
    deleteDialog: byId('delete-account-dialog'),
    deleteForm: byId('delete-account-form'),
    deletePassword: byId('delete-account-password'),
    deleteConfirm: byId('delete-account-confirm'),
    deleteSubmit: byId('delete-account-submit'),
    deleteCancel: byId('cancel-delete-account'),
    deleteMessage: byId('delete-account-message'),
  };
  getContext = options.getContext || getContext;
  onAuthInvalid = options.onAuthInvalid || onAuthInvalid;
  onAccountDeleted = options.onAccountDeleted || onAccountDeleted;
  setStatus = options.setStatus || setStatus;

  els.downloadBtn?.addEventListener('click', () => {
    void handleDownloadClick();
  });
  els.deleteBtn?.addEventListener('click', openDeleteDialog);
  els.deleteCancel?.addEventListener('click', () => {
    els.deleteDialog.close();
  });
  els.deleteConfirm?.addEventListener('change', syncDeleteSubmitState);
  els.deleteForm?.addEventListener('submit', (event) => {
    void handleDeleteSubmit(event);
  });
  syncDeleteSubmitState();
}

/** Enable both actions only while signed in (called from lobby.js). */
export function setAccountDataEnabled(enabled) {
  accountEnabled = Boolean(enabled);
  if (!els) return;
  if (els.downloadBtn) els.downloadBtn.disabled = !enabled;
  if (els.deleteBtn) els.deleteBtn.disabled = !enabled;
}

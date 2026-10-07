/**
File: src/ui/lobby-results-dialog.js
Purpose: Controller for the lobby "My results" dialog (index.html
  #results-dialog). Two views share the dialog:
  - history: the signed-in account's finished rounds (GET /auth/me/history,
    newest first) with "Load more" pagination and an empty state;
  - full results: the final leaderboard of one round (GET /games/{id}/results)
    with the viewer's own row highlighted.
  The full-results view is also opened by the deep link
  `index.html?results=<gameId>[&player=<playerId>]` from the player board's
  Game Over overlay, which works signed out because the endpoint is public.
Role in system: lobby-only (not the gameplay board), so a native <dialog> is
  allowed (LOCKED_DECISIONS §C). src/lobby.js wires it and supplies the
  backend URL / account token.
Constraints: display-only; backend results are authoritative and final only
  once the round finished (409 GAME_NOT_FINISHED otherwise).
Security notes: renders through src/ui/lobby-results.js (textContent only);
  the account token is only sent as a bearer header, never rendered.
*/

import { fetchGameResults, fetchMyHistory } from '../services/auth-client.js';
import {
  buildHistoryItem,
  buildResultsList,
  formatResultsSummary,
} from './lobby-results.js';

export const HISTORY_PAGE_SIZE = 20;
export const RESULTS_NOT_FINAL_MESSAGE =
  'Final results are available when the round ends.';

let els = null;
let getContext = () => ({ baseUrl: '', authToken: '' });
let onAuthInvalid = () => {};
let historyItems = [];
let historyTotal = 0;
// Bumped on every reset so responses for a previous account/view are dropped.
let requestGeneration = 0;

function byId(id) {
  return document.getElementById(id);
}

function setMessage(el, message, kind = 'info') {
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function showDialog() {
  const { dialog } = els;
  if (!dialog.open && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function showView(view) {
  els.historyView.hidden = view !== 'history';
  els.resultsView.hidden = view !== 'results';
}

function renderHistory() {
  const { historyList, loadMoreBtn, historyMessage } = els;
  historyList.replaceChildren(
    ...historyItems.map((item) =>
      buildHistoryItem(item, {
        onFullResults: (entry) =>
          openGameResults(entry?.game_id, {
            highlight: { playerName: entry?.player_name, rank: entry?.rank },
            fromHistory: true,
          }),
      })
    )
  );
  loadMoreBtn.hidden = historyItems.length >= historyTotal;
  if (!historyItems.length) {
    setMessage(historyMessage, 'No finished rounds yet.', 'info');
  } else {
    setMessage(
      historyMessage,
      `Showing ${historyItems.length} of ${historyTotal} finished rounds.`,
      'info'
    );
  }
}

function handleAuthError(error) {
  if (error?.status !== 401) return false;
  els.dialog.close?.();
  onAuthInvalid();
  return true;
}

/** Load the next history page and append it. */
export async function loadMoreHistory() {
  const generation = requestGeneration;
  els.loadMoreBtn.disabled = true;
  setMessage(els.historyMessage, 'Loading your results...', 'info');
  try {
    // Inside the try: resolving the backend URL throws for an invalid URL.
    const { authToken, baseUrl } = getContext();
    if (!authToken) {
      setMessage(els.historyMessage, 'Sign in to see your results.', 'error');
      return;
    }
    const page = await fetchMyHistory(baseUrl, {
      authToken,
      limit: HISTORY_PAGE_SIZE,
      offset: historyItems.length,
    });
    if (generation !== requestGeneration) return;
    historyItems = historyItems.concat(page.items);
    // A page shorter than requested means the end, even if `total` drifted.
    historyTotal =
      page.items.length < HISTORY_PAGE_SIZE
        ? historyItems.length
        : Math.max(page.total, historyItems.length);
    renderHistory();
  } catch (error) {
    if (generation !== requestGeneration || handleAuthError(error)) return;
    setMessage(
      els.historyMessage,
      error?.message || 'Could not load your results.',
      'error'
    );
  } finally {
    els.loadMoreBtn.disabled = false;
  }
}

/** Open the dialog on the history view and load the first page. */
export async function openMyResults() {
  resetLobbyResults();
  els.historyList.replaceChildren();
  els.loadMoreBtn.hidden = true;
  showView('history');
  showDialog();
  await loadMoreHistory();
}

/**
 * Open the full final leaderboard of one round.
 * @param {string|number} gameId
 * @param {{ highlight?: object, fromHistory?: boolean }} [options]
 *   highlight: { playerId } or { playerName, rank } of the viewer's row.
 */
export async function openGameResults(
  gameId,
  { highlight = {}, fromHistory = false } = {}
) {
  const id = String(gameId ?? '').trim();
  if (!id) return;
  const generation = requestGeneration;
  els.resultsTitle.textContent = `Full results • Round ${id}`;
  els.resultsSummary.textContent = '';
  els.resultsList.replaceChildren();
  els.backBtn.hidden = !fromHistory;
  setMessage(els.resultsMessage, 'Loading results...', 'info');
  showView('results');
  showDialog();

  try {
    const payload = await fetchGameResults(getContext().baseUrl, id);
    if (generation !== requestGeneration) return;
    els.resultsSummary.textContent = formatResultsSummary(payload);
    els.resultsList.replaceChildren(buildResultsList(payload, highlight));
    setMessage(
      els.resultsMessage,
      payload?.results?.length ? '' : 'No players finished this round.',
      'info'
    );
  } catch (error) {
    if (generation !== requestGeneration) return;
    let message = error?.message || 'Could not load results.';
    if (error?.status === 409) message = RESULTS_NOT_FINAL_MESSAGE;
    if (error?.status === 404) message = `Round ${id} was not found.`;
    setMessage(
      els.resultsMessage,
      message,
      error?.status === 409 ? 'info' : 'error'
    );
  }
}

/** Drop cached history (logout / account switch) and ignore pending requests. */
export function resetLobbyResults() {
  requestGeneration += 1;
  historyItems = [];
  historyTotal = 0;
}

/**
 * Wire the dialog. Returns false when the markup is missing.
 * @param {{ getContext: () => { baseUrl: string, authToken: string },
 *   onAuthInvalid?: () => void }} options
 */
export function initLobbyResults(options = {}) {
  const dialog = byId('results-dialog');
  if (!dialog) {
    els = null;
    return false;
  }
  els = {
    dialog,
    historyView: byId('history-view'),
    historyList: byId('history-list'),
    historyMessage: byId('history-message'),
    loadMoreBtn: byId('history-load-more'),
    resultsView: byId('game-results-view'),
    resultsTitle: byId('game-results-title'),
    resultsSummary: byId('game-results-summary'),
    resultsList: byId('game-results-list'),
    resultsMessage: byId('game-results-message'),
    backBtn: byId('game-results-back'),
  };
  getContext = options.getContext || getContext;
  onAuthInvalid = options.onAuthInvalid || (() => {});
  resetLobbyResults();

  els.loadMoreBtn.addEventListener('click', () => void loadMoreHistory());
  els.backBtn.addEventListener('click', () => {
    showView('history');
    renderHistory();
  });
  byId('close-results-dialog')?.addEventListener('click', () =>
    dialog.close?.()
  );
  return true;
}

/**
File: src/lobby.js
Purpose: Lobby page (index.html): session state (the register / login /
  logout / change password forms live in src/ui/lobby-auth-forms.js),
  account data download and account deletion, the open-games list with join and rejoin, "My results" (account history and
  full final leaderboards) and the "Last Game Highscores" panel.
Role in system: entry point before the player board. Stores the backend URL,
  account session and per-game player credentials for player.html.
Backend contract notes:
- Join sends the account token; the backend links the player to the account
  and answers a repeated join with the same player_id and a NEW player_token
  (`rejoined: true`; the backend stores tokens hashed, so the previous token
  stops working and the stored one is replaced). 401 ACCOUNT_AUTH_INVALID = stale account token (treated
  like an expired session), 401 ACCOUNT_REQUIRED = round needs a sign-in.
- /games/active with the token marks the caller's games via `my_player_id`.
- Scheduled sync rounds (`status: "scheduled"`, `scheduled_start_at`,
  `opens_in_seconds`) are listed under "Upcoming" with a live countdown; the
  join button is disabled ("Opens at HH:MM") and the list reloads when the
  countdown reaches 0. A join that races the opening gets 409
  JOIN_NOT_ALLOWED_SCHEDULED (`opens_at`), shown as a friendly message.
Accessibility: the list is a keyboard-operable listbox (src/ui/lobby-game-list.js).
Security notes: tokens are never rendered; all backend text uses textContent.
*/

// Fonts are self-hosted (bundled by Vite from @fontsource, OFL-1.1) so the
// lobby makes no requests to Google Fonts.
import '@fontsource/sora/latin-400.css';
import '@fontsource/sora/latin-500.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import './shared.css';
import './lobby.css';
import {
  STORAGE_KEYS,
  clearPlayerTokens,
  getPlayerTokenStorageKey,
  getStorageItem,
  normalizeBaseUrl,
  setStorageItem,
} from './utils/storage-utils.js';
import { DEFAULT_BACKEND_URL } from './config/backend-url.js';
import { toPlayerName } from './utils/player-name.js';
import {
  fetchCurrentUser,
  fetchGameResults,
  fetchMyHistory,
  fetchOpenGames,
  joinGame,
} from './services/auth-client.js';
import { readGameStatus } from './ui/lobby-games.js';
import { initLobbyAuthForms } from './ui/lobby-auth-forms.js';
import {
  handleEmailLinkFromQuery,
  initAccountEmail,
  loadEmailCapabilities,
  renderEmailVerification,
} from './ui/lobby-account-email.js';
import {
  bindLobbyGameListKeyboard,
  markSelectedRow,
  renderLobbyGameList,
  startScheduledCountdown,
  stopScheduledCountdown,
} from './ui/lobby-game-list.js';
import {
  formatLocalDateTime,
  formatOpensAtShort,
  normalizeUnixSeconds,
} from './utils/schedule-time.js';
import {
  initLastGameHighscores,
  renderLastGameHighscores,
} from './ui/last-game-highscores.js';
import { buildServerLastGameSnapshot } from './ui/lobby-results.js';
import {
  initLobbyResults,
  openGameResults,
  openMyResults,
  resetLobbyResults,
} from './ui/lobby-results-dialog.js';
import {
  ACCOUNT_DELETED_MESSAGE,
  initAccountData,
  setAccountDataEnabled,
} from './ui/lobby-account-data.js';

const LOBBY_REFRESH_MS = 10000;
const ACCOUNT_REQUIRED_MESSAGE = 'Sign in to join this game.';
const JOIN_NOT_ALLOWED_SCHEDULED = 'JOIN_NOT_ALLOWED_SCHEDULED';
// A scheduled round that should have opened is re-listed at most this often,
// in case the backend still reports it as scheduled for a moment.
const DUE_REFRESH_MIN_INTERVAL_MS = 5000;

const authMessageEl = document.getElementById('auth-message');
const lobbyMessageEl = document.getElementById('lobby-message');
const accountSummaryEl = document.getElementById('account-summary');
const openGamesListEl = document.getElementById('open-games-list');
const joinSelectedBtn = document.getElementById('join-selected-btn');
const loginForm = document.getElementById('login-form');
const accountPanelEl = document.getElementById('account-panel');
const accountDisplayNameEl = document.getElementById('account-display-name');
const accountUsernameEl = document.getElementById('account-username');
const brandSubtitleEl = document.querySelector('.brand-subtitle');
const openResultsBtn = document.getElementById('open-results-dialog');
const logoutBtn = document.getElementById('logout-btn');
const openChangePasswordBtn = document.getElementById('open-change-password');
const lastGameSummaryEl = document.getElementById('last-game-summary');
const lastGameHighscoresEl = document.getElementById('last-game-highscores');
const adminSetupLinkEl = document.getElementById('admin-setup-link');

let lobbyRefreshTimer = null;
let selectedGameId = '';
// True when the selected open game already has this account's player
// (`my_player_id`), so joining it is a rejoin of the same player.
let selectedGameIsMine = false;
// Opening time (unix seconds) of the selected game when it is a scheduled
// round that cannot be joined yet; null otherwise.
let selectedGameOpensAt = null;
let lastDueRefreshMs = 0;
let authState = {
  isAuthenticated: false,
  token: '',
  username: '',
  displayName: '',
  isAdmin: false,
};

function setAuthMessage(message, kind = 'info') {
  if (!authMessageEl) return;
  authMessageEl.textContent = message;
  authMessageEl.dataset.kind = kind;
}

function setLobbyMessage(message, kind = 'info') {
  if (!lobbyMessageEl) return;
  lobbyMessageEl.textContent = message;
  lobbyMessageEl.dataset.kind = kind;
}

function getBackendUrlOrThrow() {
  const rawValue =
    String(localStorage.getItem(STORAGE_KEYS.baseUrl) || '').trim() ||
    DEFAULT_BACKEND_URL;
  const normalized = normalizeBaseUrl(rawValue);
  setStorageItem(STORAGE_KEYS.baseUrl, normalized);
  return normalized;
}

function readStoredLastPlayedGameSnapshot() {
  const raw = getStorageItem(STORAGE_KEYS.lastPlayedGameSnapshot);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function renderLobbyLastGameHighscores(snapshot = null) {
  renderLastGameHighscores(snapshot);
}

function updateJoinButtonState() {
  if (!joinSelectedBtn) return;
  const canJoin = authState.isAuthenticated && Boolean(selectedGameId);
  if (selectedGameId && selectedGameOpensAt !== null) {
    // Scheduled round: visible and selectable, but not joinable yet.
    joinSelectedBtn.disabled = true;
    joinSelectedBtn.textContent = `Opens at ${formatOpensAtShort(selectedGameOpensAt)}`;
  } else {
    joinSelectedBtn.disabled = !canJoin;
    joinSelectedBtn.textContent =
      canJoin && selectedGameIsMine ? 'Rejoin' : 'Enter game';
  }

  if (openResultsBtn) {
    openResultsBtn.disabled = !authState.isAuthenticated;
  }

  if (logoutBtn) {
    logoutBtn.disabled = !authState.isAuthenticated;
  }

  // Changing a password needs the signed-in session's bearer token.
  if (openChangePasswordBtn) {
    openChangePasswordBtn.disabled = !authState.isAuthenticated;
  }

  // "Download my data" / "Delete account" also need the bearer token.
  setAccountDataEnabled(authState.isAuthenticated);

  renderAuthView();
}

/**
 * Show either the sign-in form (signed out) or the account panel with the
 * signed-in name (signed in), so it is obvious whether you are logged in.
 */
function renderAuthView() {
  const signedIn = authState.isAuthenticated;
  if (loginForm) loginForm.hidden = signedIn;
  if (accountPanelEl) accountPanelEl.hidden = !signedIn;
  if (accountDisplayNameEl) {
    accountDisplayNameEl.textContent = signedIn
      ? authState.displayName || authState.username
      : '';
  }
  if (accountUsernameEl) {
    const showUsername =
      signedIn &&
      authState.username &&
      authState.username !== authState.displayName;
    accountUsernameEl.textContent = showUsername
      ? `(@${authState.username})`
      : '';
  }
  if (brandSubtitleEl) {
    brandSubtitleEl.textContent = signedIn
      ? 'Choose one of the open games to enter the live board.'
      : 'Sign in first, then choose one of the open games to enter the live board.';
  }
}

/**
 * Make the "Admin setup" link stand out for an administrator account.
 * Convenience only: the admin console and backend enforce admin access.
 */
function renderAdminSetupLink(isAdmin) {
  if (!adminSetupLinkEl) return;
  adminSetupLinkEl.textContent = isAdmin
    ? 'Admin setup (you are an administrator)'
    : 'Admin setup';
  adminSetupLinkEl.classList.toggle('is-admin-link', isAdmin);
}

function setAuthenticatedSession(payload) {
  // Login/register answer `{ access_token, user: {...} }`; GET /auth/me and a
  // restored session pass the user fields flat.
  const token = String(payload?.access_token || '').trim();
  const username = String(
    payload?.username || payload?.user?.username || ''
  ).trim();
  const displayName = String(
    payload?.display_name || payload?.user?.display_name || username || 'Player'
  ).trim();

  // `is_admin` comes from POST /auth/login (`user.is_admin`) or GET /auth/me;
  // a restored session does not know it yet (= not an administrator).
  const isAdmin =
    Boolean(token) && (payload?.user?.is_admin ?? payload?.is_admin) === true;

  authState = {
    isAuthenticated: Boolean(token),
    token,
    username,
    displayName,
    isAdmin,
  };
  renderAdminSetupLink(isAdmin);
  // `email_verified` comes from login/register (`user.email_verified`) or
  // GET /auth/me; unknown (restored session before /auth/me) hides the hint.
  renderEmailVerification(
    token
      ? (payload?.user?.email_verified ?? payload?.email_verified)
      : undefined
  );

  setStorageItem(STORAGE_KEYS.authToken, token);
  setStorageItem(STORAGE_KEYS.authUsername, username);
  setStorageItem(STORAGE_KEYS.authDisplayName, displayName);
  setStorageItem(STORAGE_KEYS.playerName, toPlayerName(displayName, username));

  if (accountSummaryEl) {
    accountSummaryEl.textContent = authState.isAuthenticated
      ? `Signed in as ${displayName || username}`
      : 'Not signed in.';
  }

  updateJoinButtonState();
}

function resetSelection() {
  selectedGameId = '';
  selectedGameIsMine = false;
  selectedGameOpensAt = null;
}

function clearOpenGames() {
  if (!openGamesListEl) return;
  stopScheduledCountdown();
  openGamesListEl.replaceChildren();
  openGamesListEl.removeAttribute('role');
  resetSelection();
  updateJoinButtonState();
}

/** Opening time in unix seconds for a selected scheduled game, else null. */
function opensAtSecondsOf(game) {
  return game?.isScheduled && game.opensAtMs !== null
    ? Math.round(game.opensAtMs / 1000)
    : null;
}

function handleGameSelected(game) {
  selectedGameId = game.gameId;
  selectedGameIsMine = Boolean(game.myPlayerId);
  selectedGameOpensAt = opensAtSecondsOf(game);
  let message;
  if (game.isScheduled) {
    message =
      selectedGameOpensAt === null
        ? `Selected ${game.gameId}. This round has not opened yet.`
        : `Selected ${game.gameId}. It opens at ${formatLocalDateTime(selectedGameOpensAt)}; you can join then.`;
  } else if (game.myPlayerId) {
    message = `Selected ${game.gameId}. Rejoin to continue with your player.`;
  } else {
    message = `Selected ${game.gameId}. You can now enter the game.`;
  }
  setLobbyMessage(message, game.isScheduled ? 'info' : 'success');
  updateJoinButtonState();
}

/** A scheduled round's countdown reached 0: reload so it shows as enrolling. */
function handleScheduledGameDue() {
  const now = Date.now();
  if (now - lastDueRefreshMs < DUE_REFRESH_MIN_INTERVAL_MS) return;
  lastDueRefreshMs = now;
  void refreshOpenGames();
}

function renderOpenGames(games = []) {
  if (!openGamesListEl) return;
  const selectedGame = renderLobbyGameList(openGamesListEl, games, {
    selectedGameId,
    onSelect: handleGameSelected,
  });
  if (selectedGame) {
    selectedGameIsMine = Boolean(selectedGame.myPlayerId);
    selectedGameOpensAt = opensAtSecondsOf(selectedGame);
  } else {
    resetSelection();
  }
  startScheduledCountdown(openGamesListEl, handleScheduledGameDue);
  updateJoinButtonState();
}

/**
 * Reload /games/active. `quiet` keeps the current lobby message (used after a
 * join error whose explanation must stay visible).
 */
async function refreshOpenGames({ showSuccess = false, quiet = false } = {}) {
  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    clearOpenGames();
    setLobbyMessage(error.message, 'error');
    return;
  }

  const authToken = authState.token;
  try {
    const rawGames = await fetchOpenGames(baseUrl, { authToken });
    const joinableGames = rawGames.filter((game) => canJoinFromLobby(game));
    // Scheduled rounds are listed (as Upcoming) but are not joinable yet.
    const upcomingGames = rawGames.filter(
      (game) => readGameStatus(game) === 'scheduled'
    );
    renderOpenGames([...joinableGames, ...upcomingGames]);
    if (!quiet && (showSuccess || authState.isAuthenticated)) {
      const upcomingNote = upcomingGames.length
        ? ` ${upcomingGames.length} upcoming.`
        : '';
      setLobbyMessage(
        `Loaded ${joinableGames.length} open game${joinableGames.length === 1 ? '' : 's'}.${upcomingNote}`,
        'success'
      );
    }
  } catch (error) {
    // A stale account token: drop the session and list the games anonymously.
    if (error?.status === 401 && authToken && authState.token === authToken) {
      expireStoredSession();
      await refreshOpenGames({ showSuccess });
      return;
    }
    clearOpenGames();
    setLobbyMessage(error.message, 'error');
  }
}

function refreshOnPageVisible() {
  if (document.visibilityState && document.visibilityState !== 'visible') {
    return;
  }
  void refreshOpenGames({ showSuccess: true });
}

function canJoinFromLobby(rawGame) {
  const status = readGameStatus(rawGame);
  if (status !== 'enrolling' && status !== 'running') {
    return false;
  }

  // The caller already plays here: always offer the rejoin, even when a new
  // async session would no longer fit the remaining round time.
  if (rawGame?.my_player_id !== null && rawGame?.my_player_id !== undefined) {
    return true;
  }

  const roundType = String(rawGame?.round_type || '').toLowerCase();
  const isAsyncRound = roundType === 'asynchronous' || roundType === 'async';
  if (!isAsyncRound) {
    return true;
  }

  const availableSeconds = Math.max(
    0,
    Number(rawGame?.run_remaining_seconds || 0)
  );
  const sessionSeconds = Math.max(
    0,
    Number(rawGame?.session_duration_seconds || 0)
  );
  if (availableSeconds <= 0 || sessionSeconds <= 0) {
    return true;
  }

  return sessionSeconds < availableSeconds;
}

async function handleJoinSelectedGame() {
  if (!authState.isAuthenticated) {
    setLobbyMessage('Please sign in before joining a game.', 'error');
    return;
  }
  if (!selectedGameId) {
    setLobbyMessage('Select an open game first.', 'error');
    return;
  }
  if (selectedGameOpensAt !== null) {
    setLobbyMessage(
      `This round has not opened yet. It opens at ${formatLocalDateTime(selectedGameOpensAt)}.`,
      'info'
    );
    return;
  }

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    setLobbyMessage(error.message, 'error');
    return;
  }

  joinSelectedBtn.disabled = true;
  setLobbyMessage(
    selectedGameIsMine
      ? 'Rejoining your player...'
      : 'Joining selected game...',
    'info'
  );

  // WHY: the backend only accepts 1-24 chars of letters/digits/space/_-. while
  // account display names allow 80 arbitrary chars, so map to a valid name.
  const playerName = toPlayerName(authState.displayName, authState.username);

  try {
    const joinPayload = await joinGame(baseUrl, {
      gameId: selectedGameId,
      playerName,
      authToken: authState.token,
    });

    const playerId = String(joinPayload?.player_id || '').trim();
    if (!playerId) {
      throw new Error('Join succeeded, but player_id is missing in response.');
    }

    setStorageItem(STORAGE_KEYS.baseUrl, baseUrl);
    setStorageItem(STORAGE_KEYS.gameId, selectedGameId);
    setStorageItem(STORAGE_KEYS.playerId, playerId);
    // WHY: player.html authenticates upgrades/trades/SSE tickets with the
    // per-game player token. Without it, REQUIRE_PLAYER_AUTH backends reject the
    // stored player and the board silently re-joins as a new anonymous player.
    const playerToken = String(joinPayload?.player_token || '').trim();
    if (playerToken) {
      setStorageItem(
        getPlayerTokenStorageKey(selectedGameId, playerId),
        playerToken
      );
    }
    setStorageItem(STORAGE_KEYS.playerName, playerName);

    window.location.href = '/player.html?autostart=1';
  } catch (error) {
    handleJoinError(error);
  }
}

/**
 * Join failures: account-auth errors get dedicated handling, everything else
 * shows the backend message (e.g. 422 player-name validation).
 */
function handleJoinError(error) {
  if (error?.code === 'ACCOUNT_AUTH_INVALID') {
    expireStoredSession();
    setLobbyMessage('Please sign in again to join this game.', 'error');
    return;
  }
  if (error?.code === JOIN_NOT_ALLOWED_SCHEDULED) {
    // The list was stale (the round is still scheduled): explain and reload
    // it so the row shows its countdown and the button its opening time.
    const opensAt = normalizeUnixSeconds(error.opensAt);
    setLobbyMessage(
      opensAt === null
        ? 'This round has not opened yet.'
        : `This round has not opened yet. It opens at ${formatLocalDateTime(opensAt)}.`,
      'info'
    );
    updateJoinButtonState();
    void refreshOpenGames({ quiet: true });
    return;
  }
  const message =
    error?.code === 'ACCOUNT_REQUIRED'
      ? error?.message || ACCOUNT_REQUIRED_MESSAGE
      : error?.message;
  setLobbyMessage(message, 'error');
  joinSelectedBtn.disabled = false;
  updateJoinButtonState();
}

function clearAuthSessionData() {
  // Account-bound views fall back to the local, device-only data.
  resetLobbyResults();
  renderLobbyLastGameHighscores(readStoredLastPlayedGameSnapshot());
  setStorageItem(STORAGE_KEYS.authToken, '');
  setStorageItem(STORAGE_KEYS.authUsername, '');
  setStorageItem(STORAGE_KEYS.authDisplayName, '');
  setStorageItem(STORAGE_KEYS.playerName, '');
  // Player tokens of this person's rounds must not outlive the sign-in.
  clearPlayerTokens();
  document.cookie = 'app-auth-session=; Max-Age=0; path=/; SameSite=Strict';
}

function startLobbyRefreshLoop() {
  if (lobbyRefreshTimer) {
    window.clearInterval(lobbyRefreshTimer);
  }
  lobbyRefreshTimer = window.setInterval(() => {
    void refreshOpenGames();
  }, LOBBY_REFRESH_MS);
}

function hydrateFromStorage() {
  const savedBaseUrl = localStorage.getItem(STORAGE_KEYS.baseUrl);
  if (!savedBaseUrl) {
    setStorageItem(STORAGE_KEYS.baseUrl, DEFAULT_BACKEND_URL);
  }

  const savedToken = String(
    localStorage.getItem(STORAGE_KEYS.authToken) || ''
  ).trim();
  const savedUsername = String(
    localStorage.getItem(STORAGE_KEYS.authUsername) || ''
  ).trim();
  const savedDisplayName = String(
    localStorage.getItem(STORAGE_KEYS.authDisplayName) || ''
  ).trim();

  if (savedToken) {
    setAuthenticatedSession({
      access_token: savedToken,
      username: savedUsername,
      display_name: savedDisplayName,
    });
    setAuthMessage(
      'Session restored. Select an open game to continue.',
      'info'
    );
    void validateStoredSession(savedToken);
  } else {
    setAuthMessage('Sign in or create a new account to join a game.', 'info');
    setAuthenticatedSession({ access_token: '' });
  }
}

/**
 * DELETE /auth/me answered 204: the account and all of its sessions are gone
 * on the server, so clear the local session exactly like a logout.
 */
function handleAccountDeleted() {
  clearAuthSessionData();
  resetSelection();
  setAuthenticatedSession({ access_token: '' });
  if (openGamesListEl) markSelectedRow(openGamesListEl, null);
  setAuthMessage(ACCOUNT_DELETED_MESSAGE, 'success');
}

function expireStoredSession() {
  clearAuthSessionData();
  resetSelection();
  setAuthenticatedSession({ access_token: '' });
  setAuthMessage('Your session has expired. Please sign in again.', 'error');
}

/**
 * Re-validate a token restored from localStorage via GET /auth/me.
 * 401 means the server-side session is gone (expired, revoked, password reset):
 * clear local auth state so the login form is the only path forward.
 * Network or other errors keep the restored session (backend may be restarting).
 */
async function validateStoredSession(token) {
  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch {
    return;
  }

  try {
    const user = await fetchCurrentUser(baseUrl, { authToken: token });
    // Ignore stale results if the user logged out/in while the request ran.
    if (authState.token !== token) return;
    const username = String(user?.username || authState.username || '').trim();
    const displayName = String(
      user?.display_name || authState.displayName || username
    ).trim();
    setAuthenticatedSession({
      access_token: token,
      username,
      display_name: displayName,
      is_admin: user?.is_admin,
      email_verified: user?.email_verified,
    });
    void preferServerLastGame(token);
  } catch (error) {
    if (error?.status === 401 && authState.token === token) {
      expireStoredSession();
    }
  }
}

/**
 * "Last Game Highscores" prefers the server: when signed in, show the top 5 of
 * the account's most recent finished round (history + full results). Any
 * failure (network error, no finished rounds yet) keeps the local
 * device snapshot written by player.html.
 */
async function preferServerLastGame(token) {
  try {
    const baseUrl = getBackendUrlOrThrow();
    const page = await fetchMyHistory(baseUrl, {
      authToken: token,
      limit: 1,
      offset: 0,
    });
    const latest = page.items[0];
    if (!latest || authState.token !== token) return;
    const snapshot = buildServerLastGameSnapshot(
      await fetchGameResults(baseUrl, latest.game_id)
    );
    if (snapshot && authState.token === token) {
      renderLobbyLastGameHighscores(snapshot);
    }
  } catch {
    // Keep the local snapshot.
  }
}

/**
 * Deep link from the player board's Game Over overlay:
 * index.html?results=<gameId>[&player=<playerId>] opens the full results.
 * The query is removed afterwards so a reload does not reopen the dialog.
 */
function openResultsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const gameId = String(params.get('results') || '').trim();
  if (!gameId) return;
  window.history.replaceState(null, '', window.location.pathname);
  void openGameResults(gameId, {
    highlight: { playerId: params.get('player') || '' },
  });
}

/** Drop the stored session and the game selection (logout, password change). */
function clearSessionLocally() {
  clearAuthSessionData();
  resetSelection();
  setAuthenticatedSession({ access_token: '' });
}

function bindEvents() {
  initLobbyAuthForms({
    getBackendUrl: getBackendUrlOrThrow,
    getAuthState: () => authState,
    applySession: setAuthenticatedSession,
    setAuthMessage,
    setLobbyMessage,
    onSignedIn(token) {
      // Re-list games with the token so the account's games show "Rejoin".
      void refreshOpenGames();
      void preferServerLastGame(token);
    },
    onSessionExpired: expireStoredSession,
    clearSessionLocally,
    onLoggedOut() {
      if (openGamesListEl) markSelectedRow(openGamesListEl, null);
    },
  });
  if (openGamesListEl) bindLobbyGameListKeyboard(openGamesListEl);
  joinSelectedBtn?.addEventListener('click', () => {
    void handleJoinSelectedGame();
  });
  openResultsBtn?.addEventListener('click', () => {
    void openMyResults();
  });

  // Keep lobby state fresh when users return from player view or a crashed tab.
  document.addEventListener('visibilitychange', refreshOnPageVisible);
  window.addEventListener('focus', refreshOnPageVisible);
  window.addEventListener('pageshow', refreshOnPageVisible);
}

function bootstrap() {
  initLastGameHighscores({
    summaryEl: lastGameSummaryEl,
    listEl: lastGameHighscoresEl,
  });
  renderLobbyLastGameHighscores(readStoredLastPlayedGameSnapshot());

  initLobbyResults({
    getContext: () => ({
      baseUrl: getBackendUrlOrThrow(),
      authToken: authState.token,
    }),
    onAuthInvalid: expireStoredSession,
  });

  initAccountData({
    getContext: () => ({
      baseUrl: getBackendUrlOrThrow(),
      authToken: authState.token,
    }),
    onAuthInvalid: expireStoredSession,
    onAccountDeleted: handleAccountDeleted,
    setStatus: setAuthMessage,
  });

  initAccountEmail({
    getContext: () => ({
      baseUrl: getBackendUrlOrThrow(),
      authToken: authState.token,
    }),
    setStatus: setAuthMessage,
  });

  hydrateFromStorage();
  bindEvents();
  openResultsFromQuery();
  // Capabilities first, so a confirmation link can update the account hint.
  void loadEmailCapabilities().then(handleEmailLinkFromQuery);
  void refreshOpenGames({ showSuccess: true });
  startLobbyRefreshLoop();
  updateJoinButtonState();
}

document.addEventListener('DOMContentLoaded', bootstrap);

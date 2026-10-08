/**
File: src/lobby.js
Purpose: Lobby page (index.html): register / login / logout / change password,
  account data download and account deletion, the open-games list with join and rejoin, "My results" (account history and
  full final leaderboards) and the "Last Game Highscores" panel.
Role in system: entry point before the player board. Stores the backend URL,
  account session and per-game player credentials for player.html.
Backend contract notes:
- Join sends the account token; the backend links the player to the account
  and answers a repeated join with the same player_id/player_token
  (`rejoined: true`). 401 ACCOUNT_AUTH_INVALID = stale account token (treated
  like an expired session), 401 ACCOUNT_REQUIRED = round needs a sign-in.
- /games/active with the token marks the caller's games via `my_player_id`.
- Older backends omit these fields; the lobby then behaves as before.
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
import './lobby.css';
import {
  STORAGE_KEYS,
  getPlayerTokenStorageKey,
  getStorageItem,
  normalizeBaseUrl,
  setStorageItem,
} from './utils/storage-utils.js';
import { DEFAULT_BACKEND_URL } from './config/backend-url.js';
import { toPlayerName } from './utils/player-name.js';
import {
  changePassword,
  fetchCurrentUser,
  fetchGameResults,
  fetchMyHistory,
  fetchOpenGames,
  joinGame,
  login,
  logout,
  register,
  resetPassword,
} from './services/auth-client.js';
import { buildGameStatusBadge, normalizeGameItem } from './ui/lobby-games.js';
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

const authMessageEl = document.getElementById('auth-message');
const lobbyMessageEl = document.getElementById('lobby-message');
const accountSummaryEl = document.getElementById('account-summary');
const openGamesListEl = document.getElementById('open-games-list');
const joinSelectedBtn = document.getElementById('join-selected-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const registerMessageEl = document.getElementById('register-message');
const registerUsernameInput = document.getElementById('register-username');
const registerDisplayNameInput = document.getElementById(
  'register-display-name'
);
const registerDialog = document.getElementById('register-dialog');
const openRegisterBtn = document.getElementById('open-register-dialog');
const logoutBtn = document.getElementById('logout-btn');
const cancelRegisterBtn = document.getElementById('cancel-register-dialog');
const forgotDialog = document.getElementById('forgot-password-dialog');
const openForgotBtn = document.getElementById('open-forgot-password');
const cancelForgotBtn = document.getElementById('cancel-forgot-password');
const forgotForm = document.getElementById('forgot-password-form');
const forgotMessageEl = document.getElementById('forgot-password-message');
const changePasswordDialog = document.getElementById('change-password-dialog');
const openChangePasswordBtn = document.getElementById('open-change-password');
const cancelChangePasswordBtn = document.getElementById(
  'cancel-change-password'
);
const changePasswordForm = document.getElementById('change-password-form');
const changePasswordMessageEl = document.getElementById(
  'change-password-message'
);
const openResultsBtn = document.getElementById('open-results-dialog');
const lastGameSummaryEl = document.getElementById('last-game-summary');
const lastGameHighscoresEl = document.getElementById('last-game-highscores');
const adminSetupLinkEl = document.getElementById('admin-setup-link');

let lobbyRefreshTimer = null;
let selectedGameId = '';
// True when the selected open game already has this account's player
// (`my_player_id`), so joining it is a rejoin of the same player.
let selectedGameIsMine = false;
let displayNameUserEdited = false;
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

function setRegisterMessage(message, kind = 'info') {
  if (!registerMessageEl) return;
  registerMessageEl.textContent = message;
  registerMessageEl.dataset.kind = kind;
}

function setForgotMessage(message, kind = 'info') {
  if (!forgotMessageEl) return;
  forgotMessageEl.textContent = message;
  forgotMessageEl.dataset.kind = kind;
}

function setChangePasswordMessage(message, kind = 'info') {
  if (!changePasswordMessageEl) return;
  changePasswordMessageEl.textContent = message;
  changePasswordMessageEl.dataset.kind = kind;
}

const PASSWORD_RESET_DISABLED_MESSAGE =
  'Password reset is not available. Please contact an administrator.';

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
  joinSelectedBtn.disabled = !canJoin;
  joinSelectedBtn.textContent =
    canJoin && selectedGameIsMine ? 'Rejoin' : 'Enter game';

  if (openResultsBtn) {
    openResultsBtn.disabled = !authState.isAuthenticated;
  }

  if (logoutBtn) {
    logoutBtn.disabled = !authState.isAuthenticated;
  }

  if (openForgotBtn) {
    openForgotBtn.disabled = authState.isAuthenticated;
  }

  // Changing a password needs the signed-in session's bearer token.
  if (openChangePasswordBtn) {
    openChangePasswordBtn.disabled = !authState.isAuthenticated;
  }

  // "Download my data" / "Delete account" also need the bearer token.
  setAccountDataEnabled(authState.isAuthenticated);
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
  const token = String(
    payload?.access_token || payload?.token || payload?.session_token || ''
  ).trim();
  const username = String(
    payload?.username || payload?.user?.username || payload?.login || ''
  ).trim();
  const displayName = String(
    payload?.display_name || payload?.user?.display_name || username || 'Player'
  ).trim();

  // `is_admin` comes from POST /auth/login (`user.is_admin`) or GET /auth/me;
  // older backends omit it (= not an administrator).
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

function clearOpenGames() {
  if (!openGamesListEl) return;
  openGamesListEl.replaceChildren();
  selectedGameId = '';
  updateJoinButtonState();
}

function renderOpenGames(games = []) {
  if (!openGamesListEl) return;
  const previouslySelectedGameId = selectedGameId;
  openGamesListEl.replaceChildren();

  if (!games.length) {
    selectedGameId = '';
    selectedGameIsMine = false;
    updateJoinButtonState();
    const emptyItem = document.createElement('li');
    emptyItem.className = 'game-list-empty';
    emptyItem.textContent = 'No joinable games right now.';
    openGamesListEl.appendChild(emptyItem);
    return;
  }

  let selectedStillAvailable = false;

  games.forEach((rawGame) => {
    const game = normalizeGameItem(rawGame);
    if (!game.gameId) return;

    const row = document.createElement('li');
    row.className = 'game-list-item';
    row.dataset.gameId = game.gameId;
    if (game.myPlayerId) {
      row.dataset.myPlayerId = game.myPlayerId;
    }
    if (game.gameId === previouslySelectedGameId) {
      row.classList.add('selected');
      selectedStillAvailable = true;
      selectedGameIsMine = Boolean(game.myPlayerId);
    }

    const left = document.createElement('div');
    left.className = 'game-list-main';

    const title = document.createElement('div');
    title.className = 'game-id';
    title.textContent = `${game.roundTypeLabel} • ${game.scoringModeLabel}`;
    if (game.myPlayerId) {
      const chip = document.createElement('span');
      chip.className = 'game-mine-chip';
      chip.textContent = 'You joined';
      title.appendChild(chip);
    }

    const subtitle = document.createElement('div');
    subtitle.className = 'game-subtitle';
    subtitle.textContent = `${game.tradeCountLabel} • ${game.playersCount} player${game.playersCount === 1 ? '' : 's'} • ${game.remainingLabel}`;

    left.appendChild(title);
    left.appendChild(subtitle);

    const badge = document.createElement('span');
    const badgeMeta = buildGameStatusBadge(game.status);
    badge.className = badgeMeta.className;
    badge.textContent = badgeMeta.text;

    row.appendChild(left);
    row.appendChild(badge);

    row.addEventListener('click', () => {
      selectedGameId = game.gameId;
      selectedGameIsMine = Boolean(game.myPlayerId);
      Array.from(openGamesListEl.querySelectorAll('.game-list-item')).forEach(
        (item) => {
          item.classList.toggle('selected', item === row);
        }
      );
      setLobbyMessage(
        game.myPlayerId
          ? `Selected ${game.gameId}. Rejoin to continue with your player.`
          : `Selected ${game.gameId}. You can now enter the game.`,
        'success'
      );
      updateJoinButtonState();
    });

    openGamesListEl.appendChild(row);
  });

  if (!selectedStillAvailable) {
    selectedGameId = '';
    selectedGameIsMine = false;
  }
  updateJoinButtonState();
}

async function refreshOpenGames({ showSuccess = false } = {}) {
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
    renderOpenGames(joinableGames);
    if (showSuccess || authState.isAuthenticated) {
      setLobbyMessage(
        `Loaded ${joinableGames.length} open game${joinableGames.length === 1 ? '' : 's'}.`,
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
  const status = String(rawGame?.game_status || '').toLowerCase();
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
  const message =
    error?.code === 'ACCOUNT_REQUIRED'
      ? error?.message || ACCOUNT_REQUIRED_MESSAGE
      : error?.message;
  setLobbyMessage(message, 'error');
  joinSelectedBtn.disabled = false;
  updateJoinButtonState();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    setAuthMessage(error.message, 'error');
    return;
  }

  try {
    const payload = await login(baseUrl, {
      username: formData.get('username'),
      password: formData.get('password'),
    });
    setAuthenticatedSession(payload);
    if (!authState.isAuthenticated) {
      throw new Error('Login response did not include an access token.');
    }
    setAuthMessage(
      'Login successful. Please select a game from the open list.',
      'success'
    );
    // Re-list games with the token so the account's games show "Rejoin".
    void refreshOpenGames();
    void preferServerLastGame(authState.token);
  } catch (error) {
    setAuthMessage(error.message, 'error');
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordClient(password) {
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
  const formData = new FormData(registerForm);

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

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    setRegisterMessage(error.message, 'error');
    return;
  }

  try {
    await register(baseUrl, {
      username: formData.get('username'),
      email: formData.get('email'),
      password,
      displayName: formData.get('displayName'),
      discord: formData.get('discord'),
      telegram: formData.get('telegram'),
    });
    setAuthMessage('Registration successful. You can sign in now.', 'success');
    registerDialog?.close();
    registerForm?.reset();
    setRegisterMessage('', 'info');
  } catch (error) {
    setRegisterMessage(error.message, 'error');
  }
}

async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  const formData = new FormData(forgotForm);

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    setAuthMessage(error.message, 'error');
    return;
  }

  setForgotMessage('Submitting password reset...', 'info');
  try {
    await resetPassword(baseUrl, {
      username: formData.get('username'),
      email: formData.get('email'),
      newPassword: formData.get('newPassword'),
    });
    setForgotMessage('', 'info');
    setAuthMessage(
      'Password reset succeeded. Please sign in with your new password.',
      'success'
    );
    forgotDialog?.close();
  } catch (error) {
    // WHY: the backend disables self-service reset unless a dev flag is set and
    // answers 403 (code PASSWORD_RESET_DISABLED). Keep the dialog open and show
    // the server's explanation instead of a generic failure.
    const message =
      error?.status === 403
        ? resolvePasswordResetDisabledMessage(error)
        : error?.message || 'Password reset failed.';
    setForgotMessage(message, 'error');
  }
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const formData = new FormData(changePasswordForm);
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const newPasswordConfirm = String(formData.get('newPasswordConfirm') || '');

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

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch (error) {
    setChangePasswordMessage(error.message, 'error');
    return;
  }

  setChangePasswordMessage('Changing password...', 'info');
  try {
    await changePassword(baseUrl, {
      authToken: authState.token,
      currentPassword,
      newPassword,
    });
  } catch (error) {
    if (error?.status === 401) {
      changePasswordDialog?.close();
      expireStoredSession();
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
  changePasswordForm?.reset();
  setChangePasswordMessage('', 'info');
  changePasswordDialog?.close();
  clearAuthSessionData();
  selectedGameId = '';
  setAuthenticatedSession({ access_token: '' });
  setAuthMessage(
    'Password changed. Please sign in again with your new password.',
    'success'
  );
}

function resolvePasswordResetDisabledMessage(error) {
  const serverMessage = String(error?.message || '').trim();
  // readApiError falls back to "Request failed (403)" when the body has no message.
  if (!serverMessage || /^Request failed \(\d+\)$/.test(serverMessage)) {
    return PASSWORD_RESET_DISABLED_MESSAGE;
  }
  return serverMessage;
}

function clearAuthSessionData() {
  // Account-bound views fall back to the local, device-only data.
  resetLobbyResults();
  renderLobbyLastGameHighscores(readStoredLastPlayedGameSnapshot());
  setStorageItem(STORAGE_KEYS.authToken, '');
  setStorageItem(STORAGE_KEYS.authUsername, '');
  setStorageItem(STORAGE_KEYS.authDisplayName, '');
  setStorageItem(STORAGE_KEYS.playerName, '');
  document.cookie = 'app-auth-session=; Max-Age=0; path=/; SameSite=Strict';
}

async function handleLogoutClick() {
  const confirmed = window.confirm('Do you really want to log out?');
  if (!confirmed) {
    return;
  }

  const authToken = String(authState.token || '').trim();
  if (!authToken) {
    clearAuthSessionData();
    selectedGameId = '';
    setAuthenticatedSession({ access_token: '' });
    setAuthMessage('Logged out successfully. Sign in to continue.', 'success');
    setLobbyMessage(
      'You are logged out. Open games keep auto-refreshing.',
      'info'
    );
    return;
  }

  let baseUrl;
  try {
    baseUrl = getBackendUrlOrThrow();
  } catch {
    baseUrl = DEFAULT_BACKEND_URL;
  }

  logoutBtn.disabled = true;
  setAuthMessage('Logging out...', 'info');

  try {
    await logout(baseUrl, { authToken });
  } catch {
    // Continue local logout even if backend is unavailable to avoid trapping user state.
  }

  clearAuthSessionData();
  selectedGameId = '';
  setAuthenticatedSession({ access_token: '' });
  Array.from(
    openGamesListEl?.querySelectorAll('.game-list-item.selected') || []
  ).forEach((item) => {
    item.classList.remove('selected');
  });
  setAuthMessage('Logged out successfully. Sign in to continue.', 'success');
  setLobbyMessage(
    'You are logged out. Open games keep auto-refreshing.',
    'info'
  );
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
  selectedGameId = '';
  setAuthenticatedSession({ access_token: '' });
  Array.from(
    openGamesListEl?.querySelectorAll('.game-list-item.selected') || []
  ).forEach((item) => {
    item.classList.remove('selected');
  });
  setAuthMessage(ACCOUNT_DELETED_MESSAGE, 'success');
}

function expireStoredSession() {
  clearAuthSessionData();
  selectedGameId = '';
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
 * failure (older backend without history, no rounds yet) keeps the local
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

function bindEvents() {
  loginForm?.addEventListener('submit', (event) => {
    void handleLoginSubmit(event);
  });
  registerForm?.addEventListener('submit', (event) => {
    void handleRegisterSubmit(event);
  });
  openRegisterBtn?.addEventListener('click', () => {
    displayNameUserEdited = false;
    setRegisterMessage('Create your account details below.', 'info');
    registerDialog?.showModal();
  });
  cancelRegisterBtn?.addEventListener('click', () => {
    registerDialog?.close();
  });
  registerDisplayNameInput?.addEventListener('input', () => {
    displayNameUserEdited = true;
  });
  registerUsernameInput?.addEventListener('input', () => {
    if (!registerDisplayNameInput) return;
    if (!displayNameUserEdited) {
      registerDisplayNameInput.value = String(
        registerUsernameInput.value || ''
      ).trim();
    }
  });
  registerUsernameInput?.addEventListener('blur', () => {
    if (!registerDisplayNameInput) return;
    if (
      !displayNameUserEdited &&
      !String(registerDisplayNameInput.value || '').trim()
    ) {
      registerDisplayNameInput.value = String(
        registerUsernameInput.value || ''
      ).trim();
    }
  });
  joinSelectedBtn?.addEventListener('click', () => {
    void handleJoinSelectedGame();
  });
  logoutBtn?.addEventListener('click', () => {
    void handleLogoutClick();
  });
  openForgotBtn?.addEventListener('click', () => {
    setForgotMessage('', 'info');
    forgotDialog?.showModal();
  });
  cancelForgotBtn?.addEventListener('click', () => {
    forgotDialog?.close();
  });
  forgotForm?.addEventListener('submit', (event) => {
    void handleForgotPasswordSubmit(event);
  });
  openResultsBtn?.addEventListener('click', () => {
    void openMyResults();
  });
  openChangePasswordBtn?.addEventListener('click', () => {
    changePasswordForm?.reset();
    setChangePasswordMessage('', 'info');
    changePasswordDialog?.showModal();
  });
  cancelChangePasswordBtn?.addEventListener('click', () => {
    changePasswordDialog?.close();
  });
  changePasswordForm?.addEventListener('submit', (event) => {
    void handleChangePasswordSubmit(event);
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

  hydrateFromStorage();
  bindEvents();
  openResultsFromQuery();
  void refreshOpenGames({ showSuccess: true });
  startLobbyRefreshLoop();
  updateJoinButtonState();
}

document.addEventListener('DOMContentLoaded', bootstrap);

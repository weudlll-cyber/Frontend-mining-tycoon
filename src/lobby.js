import './lobby.css';
import {
  STORAGE_KEYS,
  getStorageItem,
  normalizeBaseUrl,
  setStorageItem,
} from './utils/storage-utils.js';
import {
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

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';
const LOBBY_REFRESH_MS = 10000;

const authMessageEl = document.getElementById('auth-message');
const lobbyMessageEl = document.getElementById('lobby-message');
const accountSummaryEl = document.getElementById('account-summary');
const openGamesListEl = document.getElementById('open-games-list');
const joinSelectedBtn = document.getElementById('join-selected-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const registerMessageEl = document.getElementById('register-message');
const registerUsernameInput = document.getElementById('register-username');
const registerDisplayNameInput = document.getElementById('register-display-name');
const registerDialog = document.getElementById('register-dialog');
const openRegisterBtn = document.getElementById('open-register-dialog');
const logoutBtn = document.getElementById('logout-btn');
const cancelRegisterBtn = document.getElementById('cancel-register-dialog');
const forgotDialog = document.getElementById('forgot-password-dialog');
const openForgotBtn = document.getElementById('open-forgot-password');
const cancelForgotBtn = document.getElementById('cancel-forgot-password');
const forgotForm = document.getElementById('forgot-password-form');
const lastGameSummaryEl = document.getElementById('last-game-summary');
const lastGameHighscoresEl = document.getElementById('last-game-highscores');

let lobbyRefreshTimer = null;
let selectedGameId = '';
let displayNameUserEdited = false;
let authState = {
  isAuthenticated: false,
  token: '',
  username: '',
  displayName: '',
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

  if (logoutBtn) {
    logoutBtn.disabled = !authState.isAuthenticated;
  }

  if (openForgotBtn) {
    openForgotBtn.disabled = authState.isAuthenticated;
  }
}

function setAuthenticatedSession(payload) {
  const token =
    String(payload?.access_token || payload?.token || payload?.session_token || '').trim();
  const username =
    String(payload?.username || payload?.user?.username || payload?.login || '').trim();
  const displayName = String(
    payload?.display_name || payload?.user?.display_name || username || 'Player'
  ).trim();

  authState = {
    isAuthenticated: Boolean(token),
    token,
    username,
    displayName,
  };

  setStorageItem(STORAGE_KEYS.authToken, token);
  setStorageItem(STORAGE_KEYS.authUsername, username);
  setStorageItem(STORAGE_KEYS.authDisplayName, displayName);
  setStorageItem(STORAGE_KEYS.playerName, displayName || username || 'Player');

  if (accountSummaryEl) {
    accountSummaryEl.textContent = authState.isAuthenticated
      ? `Signed in as ${displayName || username}`
      : 'Not signed in.';
  }

  updateJoinButtonState();
}

function clearOpenGames() {
  if (!openGamesListEl) return;
  openGamesListEl.innerHTML = '';
  selectedGameId = '';
  updateJoinButtonState();
}

function renderOpenGames(games = []) {
  if (!openGamesListEl) return;
  const previouslySelectedGameId = selectedGameId;
  openGamesListEl.innerHTML = '';

  if (!games.length) {
    selectedGameId = '';
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
    if (game.gameId === previouslySelectedGameId) {
      row.classList.add('selected');
      selectedStillAvailable = true;
    }

    const left = document.createElement('div');
    left.className = 'game-list-main';

    const title = document.createElement('div');
    title.className = 'game-id';
    title.textContent = `${game.roundTypeLabel} • ${game.scoringModeLabel}`;

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
      Array.from(openGamesListEl.querySelectorAll('.game-list-item')).forEach((item) => {
        item.classList.toggle('selected', item === row);
      });
      setLobbyMessage(`Selected ${game.gameId}. You can now enter the game.`, 'success');
      updateJoinButtonState();
    });

    openGamesListEl.appendChild(row);
  });

  if (!selectedStillAvailable) {
    selectedGameId = '';
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

  try {
    const rawGames = await fetchOpenGames(baseUrl);
    const joinableGames = rawGames.filter((game) => canJoinFromLobby(game));
    renderOpenGames(joinableGames);
    if (showSuccess || authState.isAuthenticated) {
      setLobbyMessage(
        `Loaded ${joinableGames.length} open game${joinableGames.length === 1 ? '' : 's'}.`,
        'success'
      );
    }
  } catch (error) {
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

  const roundType = String(rawGame?.round_type || '').toLowerCase();
  const isAsyncRound = roundType === 'asynchronous' || roundType === 'async';
  if (!isAsyncRound) {
    return true;
  }

  const availableSeconds = Math.max(0, Number(rawGame?.run_remaining_seconds || 0));
  const sessionSeconds = Math.max(0, Number(rawGame?.session_duration_seconds || 0));
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
  setLobbyMessage('Joining selected game...', 'info');

  try {
    const joinPayload = await joinGame(baseUrl, {
      gameId: selectedGameId,
      playerName: authState.displayName || authState.username || 'Player',
      authToken: authState.token,
    });

    const playerId = String(joinPayload?.player_id || '').trim();
    if (!playerId) {
      throw new Error('Join succeeded, but player_id is missing in response.');
    }

    setStorageItem(STORAGE_KEYS.baseUrl, baseUrl);
    setStorageItem(STORAGE_KEYS.gameId, selectedGameId);
    setStorageItem(STORAGE_KEYS.playerId, playerId);
    setStorageItem(
      STORAGE_KEYS.playerName,
      authState.displayName || authState.username || 'Player'
    );

    window.location.href = '/player.html?autostart=1';
  } catch (error) {
    setLobbyMessage(error.message, 'error');
    joinSelectedBtn.disabled = false;
    updateJoinButtonState();
  }
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
    setAuthMessage('Login successful. Please select a game from the open list.', 'success');
  } catch (error) {
    setAuthMessage(error.message, 'error');
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordClient(password) {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
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

  try {
    await resetPassword(baseUrl, {
      username: formData.get('username'),
      email: formData.get('email'),
      newPassword: formData.get('newPassword'),
    });
    setAuthMessage('Password reset succeeded. Please sign in with your new password.', 'success');
    forgotDialog?.close();
  } catch (error) {
    setAuthMessage(error.message, 'error');
  }
}

function clearAuthSessionData() {
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
    setLobbyMessage('You are logged out. Open games keep auto-refreshing.', 'info');
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
  Array.from(openGamesListEl?.querySelectorAll('.game-list-item.selected') || []).forEach((item) => {
    item.classList.remove('selected');
  });
  setAuthMessage('Logged out successfully. Sign in to continue.', 'success');
  setLobbyMessage('You are logged out. Open games keep auto-refreshing.', 'info');
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

  const savedToken = String(localStorage.getItem(STORAGE_KEYS.authToken) || '').trim();
  const savedUsername = String(localStorage.getItem(STORAGE_KEYS.authUsername) || '').trim();
  const savedDisplayName = String(localStorage.getItem(STORAGE_KEYS.authDisplayName) || '').trim();

  if (savedToken) {
    setAuthenticatedSession({
      access_token: savedToken,
      username: savedUsername,
      display_name: savedDisplayName,
    });
    setAuthMessage('Session restored. Select an open game to continue.', 'info');
  } else {
    setAuthMessage('Sign in or create a new account to join a game.', 'info');
    setAuthenticatedSession({ access_token: '' });
  }
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
      registerDisplayNameInput.value = String(registerUsernameInput.value || '').trim();
    }
  });
  registerUsernameInput?.addEventListener('blur', () => {
    if (!registerDisplayNameInput) return;
    if (!displayNameUserEdited && !String(registerDisplayNameInput.value || '').trim()) {
      registerDisplayNameInput.value = String(registerUsernameInput.value || '').trim();
    }
  });
  joinSelectedBtn?.addEventListener('click', () => {
    void handleJoinSelectedGame();
  });
  logoutBtn?.addEventListener('click', () => {
    void handleLogoutClick();
  });
  openForgotBtn?.addEventListener('click', () => {
    forgotDialog?.showModal();
  });
  cancelForgotBtn?.addEventListener('click', () => {
    forgotDialog?.close();
  });
  forgotForm?.addEventListener('submit', (event) => {
    void handleForgotPasswordSubmit(event);
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

  hydrateFromStorage();
  bindEvents();
  void refreshOpenGames({ showSuccess: true });
  startLobbyRefreshLoop();
  updateJoinButtonState();
}

document.addEventListener('DOMContentLoaded', bootstrap);

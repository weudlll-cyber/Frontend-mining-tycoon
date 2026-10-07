import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

vi.mock('./services/auth-client.js', () => ({
  fetchCurrentUser: vi.fn().mockResolvedValue({ username: 'weudl' }),
  fetchGameResults: vi.fn(),
  fetchMyHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchOpenGames: vi.fn().mockResolvedValue([]),
  joinGame: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  deleteMyAccount: vi.fn(),
  exportMyAccountData: vi.fn(),
}));

function loadLobbyFixture() {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'index.html'),
    'utf8'
  );
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  document.body.innerHTML = match?.[2] || '';
  document.body.className = /class="([^"]+)"/.exec(match?.[1] || '')?.[1] || '';
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  loadLobbyFixture();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lobby last game highscores', () => {
  it('renders the saved last played game snapshot on the login screen', async () => {
    localStorage.setItem(
      'mining-tycoon:lastPlayedGameSnapshot',
      JSON.stringify({
        gameId: 'game-900',
        scoringModeLabel: 'Power Oracle',
        leaderboard: [
          { rank: 1, name: 'Alice', score: '501' },
          { rank: 2, name: 'Bob', score: '404' },
        ],
      })
    );

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(document.getElementById('last-game-summary')?.textContent).toContain(
      'game-900'
    );
    expect(document.querySelectorAll('.last-game-score-item')).toHaveLength(2);
  });

  it('refreshes open games when page becomes visible again', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-visible',
        game_status: 'enrolling',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
        enrollment_remaining_seconds: 25,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    fetchOpenGamesMock.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(fetchOpenGamesMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(1);
  });

  it('updates loaded count when games become unjoinable', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-open',
        game_status: 'enrolling',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
        enrollment_remaining_seconds: 10,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-open',
        game_status: 'finished',
        round_type: 'synchronous',
        scoring_mode: 'stockpile',
        trade_count: 0,
        players_count: 1,
      },
    ]);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    const lobbyMessage = document.getElementById('lobby-message');
    expect(lobbyMessage?.textContent).toContain('Loaded 0 open games');
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(0);
  });

  it('filters out async games when session duration is equal or longer than available game time', async () => {
    const authClient = await import('./services/auth-client.js');
    const fetchOpenGamesMock = vi.mocked(authClient.fetchOpenGames);
    fetchOpenGamesMock.mockResolvedValue([
      {
        game_id: 'game-hidden',
        game_status: 'running',
        round_type: 'asynchronous',
        scoring_mode: 'mining_time',
        trade_count: 0,
        players_count: 1,
        run_remaining_seconds: 315,
        session_duration_seconds: 600,
      },
      {
        game_id: 'game-visible',
        game_status: 'running',
        round_type: 'asynchronous',
        scoring_mode: 'stockpile',
        trade_count: 1,
        players_count: 2,
        run_remaining_seconds: 900,
        session_duration_seconds: 300,
      },
    ]);

    localStorage.setItem('mining-tycoon:authToken', 'token');
    localStorage.setItem('mining-tycoon:authUsername', 'weudl');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    const rows = document.querySelectorAll('.game-list-item');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-game-id')).toBe('game-visible');
  });
});

async function flushPromises() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

const OPEN_SYNC_GAME = {
  game_id: '77',
  game_status: 'enrolling',
  round_type: 'synchronous',
  scoring_mode: 'stockpile',
  trade_count: 0,
  players_count: 1,
  enrollment_remaining_seconds: 30,
};

async function bootLobbySignedIn({ games = [OPEN_SYNC_GAME] } = {}) {
  const authClient = await import('./services/auth-client.js');
  vi.mocked(authClient.fetchOpenGames).mockResolvedValue(games);
  localStorage.setItem('mining-tycoon:authToken', 'token');
  localStorage.setItem('mining-tycoon:authUsername', 'weudl');
  localStorage.setItem('mining-tycoon:authDisplayName', 'Weudl');
  await import('./lobby.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flushPromises();
  return authClient;
}

describe('lobby join flow', () => {
  it('stores the returned player_token under the per-game player key', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.joinGame).mockResolvedValue({
      player_id: 9,
      player_token: 'secret-player-token',
    });

    document.querySelector('.game-list-item[data-game-id="77"]').click();
    document.getElementById('join-selected-btn').click();
    await flushPromises();

    expect(localStorage.getItem('mining-tycoon:gameId')).toBe('77');
    expect(localStorage.getItem('mining-tycoon:playerId')).toBe('9');
    expect(localStorage.getItem('mining-tycoon:playerToken:77:9')).toBe(
      'secret-player-token'
    );
    // The token must never be rendered in the UI.
    expect(document.body.textContent).not.toContain('secret-player-token');
  });

  it('shows the backend 422 name-validation message on join failure', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.joinGame).mockRejectedValue(
      Object.assign(
        new Error(
          'Invalid player name: String should have at most 24 characters'
        ),
        { status: 422 }
      )
    );

    document.querySelector('.game-list-item[data-game-id="77"]').click();
    document.getElementById('join-selected-btn').click();
    await flushPromises();

    const message = document.getElementById('lobby-message');
    expect(message.textContent).toBe(
      'Invalid player name: String should have at most 24 characters'
    );
    expect(message.dataset.kind).toBe('error');
    expect(localStorage.getItem('mining-tycoon:playerId')).toBeNull();
  });
});

describe('lobby stored-session validation', () => {
  it('clears an expired stored session when /auth/me returns 401', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchCurrentUser).mockRejectedValue(
      Object.assign(new Error('Authentication required'), { status: 401 })
    );

    await bootLobbySignedIn();

    expect(authClient.fetchCurrentUser).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'token' }
    );
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.getElementById('auth-message').textContent).toContain(
      'session has expired'
    );
    expect(document.getElementById('account-summary').textContent).toBe(
      'Not signed in.'
    );
    expect(document.getElementById('join-selected-btn').disabled).toBe(true);
  });

  it('keeps the stored session when /auth/me fails for non-auth reasons', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchCurrentUser).mockRejectedValue(
      new Error('Failed to fetch')
    );

    await bootLobbySignedIn();

    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('token');
    expect(document.getElementById('account-summary').textContent).toBe(
      'Signed in as Weudl'
    );
  });

  it('refreshes the profile from /auth/me on success', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({
      username: 'weudl',
      display_name: 'Weudl Prime',
    });

    await bootLobbySignedIn();

    expect(document.getElementById('account-summary').textContent).toBe(
      'Signed in as Weudl Prime'
    );
  });
});

describe('lobby forgot-password dialog', () => {
  async function bootAndSubmitForgotForm(resetImpl) {
    const authClient = await import('./services/auth-client.js');
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    resetImpl(vi.mocked(authClient.resetPassword));

    const form = document.getElementById('forgot-password-form');
    form.querySelector('#forgot-username').value = 'alice';
    form.querySelector('#forgot-email').value = 'a@example.com';
    form.querySelector('#forgot-new-password').value = 'NewPassword123!';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
  }

  it('shows the server message when reset is disabled (403)', async () => {
    await bootAndSubmitForgotForm((mock) =>
      mock.mockRejectedValue(
        Object.assign(
          new Error(
            'Password reset is not available. Please contact an administrator.'
          ),
          { status: 403, code: 'PASSWORD_RESET_DISABLED' }
        )
      )
    );

    const message = document.getElementById('forgot-password-message');
    expect(message.textContent).toBe(
      'Password reset is not available. Please contact an administrator.'
    );
    expect(message.dataset.kind).toBe('error');
  });

  it('falls back to the disabled-reset guidance when a 403 has no message', async () => {
    await bootAndSubmitForgotForm((mock) =>
      mock.mockRejectedValue(
        Object.assign(new Error('Request failed (403)'), { status: 403 })
      )
    );

    expect(document.getElementById('forgot-password-message').textContent).toBe(
      'Password reset is not available. Please contact an administrator.'
    );
  });

  it('still completes the reset when the backend allows it (dev flag)', async () => {
    const dialog = document.getElementById('forgot-password-dialog');
    dialog.close = vi.fn();

    await bootAndSubmitForgotForm((mock) =>
      mock.mockResolvedValue({ message: 'Password reset successfully' })
    );

    expect(dialog.close).toHaveBeenCalled();
    expect(document.getElementById('auth-message').textContent).toContain(
      'Password reset succeeded'
    );
    expect(document.getElementById('forgot-password-message').textContent).toBe(
      ''
    );
  });

  it('shows other reset errors inside the dialog', async () => {
    await bootAndSubmitForgotForm((mock) =>
      mock.mockRejectedValue(
        Object.assign(new Error('User not found'), { status: 404 })
      )
    );

    expect(document.getElementById('forgot-password-message').textContent).toBe(
      'User not found'
    );
  });
});

describe('lobby change-password dialog', () => {
  beforeEach(async () => {
    // WHY: the auth-client mock factory is shared across tests in this file,
    // so reset the mocks this block configures to keep each case isolated.
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.changePassword).mockReset();
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({
      username: 'weudl',
    });
  });

  async function fillAndSubmit({
    current = 'OldPassword123!',
    next = 'NewPassword123!',
    confirm = next,
  } = {}) {
    const form = document.getElementById('change-password-form');
    form.querySelector('#change-current-password').value = current;
    form.querySelector('#change-new-password').value = next;
    form.querySelector('#change-new-password-confirm').value = confirm;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
  }

  it('is only available while signed in', async () => {
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(document.getElementById('open-change-password').disabled).toBe(true);
  });

  it('opens the native dialog with a cleared form', async () => {
    await bootLobbySignedIn();
    const dialog = document.getElementById('change-password-dialog');
    dialog.showModal = vi.fn();
    document.getElementById('change-password-message').textContent = 'old';

    const openBtn = document.getElementById('open-change-password');
    expect(openBtn.disabled).toBe(false);
    openBtn.click();

    expect(dialog.showModal).toHaveBeenCalled();
    expect(document.getElementById('change-password-message').textContent).toBe(
      ''
    );

    dialog.close = vi.fn();
    document.getElementById('cancel-change-password').click();
    expect(dialog.close).toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation without calling the backend', async () => {
    const authClient = await bootLobbySignedIn();

    await fillAndSubmit({ confirm: 'Different123!' });

    expect(authClient.changePassword).not.toHaveBeenCalled();
    const message = document.getElementById('change-password-message');
    expect(message.textContent).toBe(
      'New password confirmation does not match.'
    );
    expect(message.dataset.kind).toBe('error');
  });

  it('shows backend validation messages inside the dialog', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.changePassword).mockRejectedValue(
      Object.assign(
        new Error('Password must contain at least one uppercase letter'),
        { status: 422 }
      )
    );

    await fillAndSubmit();

    expect(authClient.changePassword).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      {
        authToken: 'token',
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      }
    );
    expect(document.getElementById('change-password-message').textContent).toBe(
      'Password must contain at least one uppercase letter'
    );
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('token');
  });

  it('falls back to a generic message when the error has none', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.changePassword).mockRejectedValue({ status: 400 });

    await fillAndSubmit();

    expect(document.getElementById('change-password-message').textContent).toBe(
      'Password change failed.'
    );
  });

  it('expires the local session when the backend answers 401', async () => {
    const authClient = await bootLobbySignedIn();
    const dialog = document.getElementById('change-password-dialog');
    dialog.close = vi.fn();
    vi.mocked(authClient.changePassword).mockRejectedValue(
      Object.assign(new Error('Authentication required'), { status: 401 })
    );

    await fillAndSubmit();

    expect(dialog.close).toHaveBeenCalled();
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.getElementById('auth-message').textContent).toContain(
      'session has expired'
    );
  });

  it('asks for a sign-in when the session expired while the dialog was open', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchCurrentUser).mockRejectedValue(
      Object.assign(new Error('Authentication required'), { status: 401 })
    );
    await bootLobbySignedIn();

    await fillAndSubmit();

    expect(authClient.changePassword).not.toHaveBeenCalled();
    expect(document.getElementById('change-password-message').textContent).toBe(
      'Please sign in first.'
    );
  });

  it('shows an invalid backend URL inside the dialog', async () => {
    const authClient = await bootLobbySignedIn();
    localStorage.setItem('mining-tycoon:baseUrl', 'ftp://example.com');

    await fillAndSubmit();

    expect(authClient.changePassword).not.toHaveBeenCalled();
    expect(document.getElementById('change-password-message').textContent).toBe(
      'Backend URL must use http or https.'
    );
  });

  it('signs the user out after a successful change', async () => {
    const authClient = await bootLobbySignedIn();
    const dialog = document.getElementById('change-password-dialog');
    dialog.close = vi.fn();
    vi.mocked(authClient.changePassword).mockResolvedValue({
      message: 'Password changed successfully. Please log in again.',
    });

    await fillAndSubmit();

    expect(dialog.close).toHaveBeenCalled();
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.getElementById('account-summary').textContent).toBe(
      'Not signed in.'
    );
    expect(document.getElementById('auth-message').textContent).toBe(
      'Password changed. Please sign in again with your new password.'
    );
    expect(document.getElementById('open-change-password').disabled).toBe(true);
  });
});

async function flushDeep() {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

describe('lobby account-linked players', () => {
  beforeEach(async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.joinGame).mockReset();
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({
      username: 'weudl',
    });
    vi.mocked(authClient.fetchMyHistory).mockReset();
    vi.mocked(authClient.fetchMyHistory).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(authClient.fetchGameResults).mockReset();
  });

  const MY_SYNC_GAME = {
    ...OPEN_SYNC_GAME,
    game_status: 'running',
    my_player_id: 9,
  };

  it('lists games with the account token and offers "Rejoin" for own games', async () => {
    const authClient = await bootLobbySignedIn({
      games: [MY_SYNC_GAME, { ...OPEN_SYNC_GAME, game_id: '78' }],
    });

    expect(authClient.fetchOpenGames).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'token' }
    );
    const mine = document.querySelector('.game-list-item[data-game-id="77"]');
    expect(mine.dataset.myPlayerId).toBe('9');
    expect(mine.querySelector('.game-mine-chip').textContent).toBe(
      'You joined'
    );
    const joinBtn = document.getElementById('join-selected-btn');

    mine.click();
    expect(joinBtn.textContent).toBe('Rejoin');
    expect(document.getElementById('lobby-message').textContent).toContain(
      'Rejoin to continue with your player'
    );

    document.querySelector('.game-list-item[data-game-id="78"]').click();
    expect(joinBtn.textContent).toBe('Enter game');
  });

  it('keeps the rejoin selection across refreshes and stores the same player', async () => {
    const authClient = await bootLobbySignedIn({ games: [MY_SYNC_GAME] });
    document.querySelector('.game-list-item[data-game-id="77"]').click();

    // Auto-refresh re-renders the list; the selection stays a rejoin.
    vi.advanceTimersByTime(10000);
    await flushPromises();
    expect(document.getElementById('join-selected-btn').textContent).toBe(
      'Rejoin'
    );

    vi.mocked(authClient.joinGame).mockResolvedValue({
      player_id: 9,
      player_token: 'same-token',
      user_id: 3,
      rejoined: true,
    });
    document.getElementById('join-selected-btn').click();
    expect(document.getElementById('lobby-message').textContent).toBe(
      'Rejoining your player...'
    );
    await flushPromises();

    expect(authClient.joinGame).toHaveBeenCalledWith('http://127.0.0.1:8000', {
      gameId: '77',
      playerName: 'Weudl',
      authToken: 'token',
    });
    expect(localStorage.getItem('mining-tycoon:playerId')).toBe('9');
    expect(localStorage.getItem('mining-tycoon:playerToken:77:9')).toBe(
      'same-token'
    );
  });

  it('shows own async games even when a new session would not fit', async () => {
    await bootLobbySignedIn({
      games: [
        {
          game_id: 'async-mine',
          game_status: 'running',
          round_type: 'asynchronous',
          run_remaining_seconds: 100,
          session_duration_seconds: 600,
          my_player_id: 4,
        },
      ],
    });
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(1);
  });

  it('treats ACCOUNT_AUTH_INVALID on join like an expired session', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.joinGame).mockRejectedValue(
      Object.assign(new Error('Invalid account token'), {
        status: 401,
        code: 'ACCOUNT_AUTH_INVALID',
      })
    );

    document.querySelector('.game-list-item[data-game-id="77"]').click();
    document.getElementById('join-selected-btn').click();
    await flushPromises();

    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.getElementById('auth-message').textContent).toContain(
      'session has expired'
    );
    expect(document.getElementById('lobby-message').textContent).toBe(
      'Please sign in again to join this game.'
    );
    expect(document.getElementById('join-selected-btn').disabled).toBe(true);
  });

  it('shows the ACCOUNT_REQUIRED message (with a fallback)', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.joinGame)
      .mockRejectedValueOnce(
        Object.assign(new Error('Sign in to join this game, please.'), {
          status: 401,
          code: 'ACCOUNT_REQUIRED',
        })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error(''), { status: 401, code: 'ACCOUNT_REQUIRED' })
      );

    document.querySelector('.game-list-item[data-game-id="77"]').click();
    document.getElementById('join-selected-btn').click();
    await flushPromises();
    const message = document.getElementById('lobby-message');
    expect(message.textContent).toBe('Sign in to join this game, please.');
    expect(document.getElementById('join-selected-btn').disabled).toBe(false);

    document.getElementById('join-selected-btn').click();
    await flushPromises();
    expect(message.textContent).toBe('Sign in to join this game.');
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('token');
  });

  it('drops a stale token when the open-games call answers 401', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchOpenGames).mockImplementation(
      async (_url, { authToken } = {}) => {
        if (authToken) {
          throw Object.assign(new Error('Invalid account token'), {
            status: 401,
            code: 'ACCOUNT_AUTH_INVALID',
          });
        }
        return [OPEN_SYNC_GAME];
      }
    );
    localStorage.setItem('mining-tycoon:authToken', 'token');
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushDeep();

    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.querySelectorAll('.game-list-item')).toHaveLength(1);
    vi.mocked(authClient.fetchOpenGames).mockReset();
    vi.mocked(authClient.fetchOpenGames).mockResolvedValue([]);
  });
});

describe('lobby results and history', () => {
  const RESULTS = {
    game_id: 5,
    finished_at: 1760000000,
    scoring_mode: 'stockpile',
    round_type: 'synchronous',
    participants: 2,
    results: [
      { rank: 1, player_id: 1, player_name: 'Alice', score: 300 },
      { rank: 2, player_id: 2, player_name: 'Weudl', score: 100 },
    ],
  };

  beforeEach(async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({
      username: 'weudl',
    });
    vi.mocked(authClient.fetchOpenGames).mockResolvedValue([]);
    vi.mocked(authClient.fetchMyHistory).mockReset();
    vi.mocked(authClient.fetchMyHistory).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(authClient.fetchGameResults).mockReset();
    vi.mocked(authClient.fetchGameResults).mockResolvedValue(RESULTS);
    window.history.replaceState(null, '', '/');
  });

  it('enables "My results" only when signed in and opens the history', async () => {
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    expect(document.getElementById('open-results-dialog').disabled).toBe(true);

    vi.resetModules();
    loadLobbyFixture();
    const authClient = await bootLobbySignedIn({ games: [] });
    const button = document.getElementById('open-results-dialog');
    expect(button.disabled).toBe(false);

    button.click();
    await flushDeep();
    expect(authClient.fetchMyHistory).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'token', limit: 20, offset: 0 }
    );
    expect(document.getElementById('history-message').textContent).toBe(
      'No finished rounds yet.'
    );
  });

  it('prefers the latest server result for "Last Game Highscores" when signed in', async () => {
    localStorage.setItem(
      'mining-tycoon:lastPlayedGameSnapshot',
      JSON.stringify({
        gameId: 'local-1',
        scoringModeLabel: 'X',
        leaderboard: [],
      })
    );
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchMyHistory).mockResolvedValue({
      items: [{ game_id: 5, rank: 2, player_name: 'Weudl' }],
      total: 1,
    });

    await bootLobbySignedIn({ games: [] });
    await flushDeep();

    expect(authClient.fetchMyHistory).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'token', limit: 1, offset: 0 }
    );
    expect(document.getElementById('last-game-summary').textContent).toBe(
      '5 • Stockpile Mode • Last finished game'
    );
    expect(document.querySelectorAll('.last-game-score-item')).toHaveLength(2);

    // Logging out falls back to the local device snapshot.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(authClient.logout).mockResolvedValue(null);
    document.getElementById('logout-btn').click();
    await flushDeep();
    expect(document.getElementById('last-game-summary').textContent).toContain(
      'local-1'
    );
  });

  it('keeps the local snapshot when the server has no history', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.fetchMyHistory).mockRejectedValue(
      Object.assign(new Error('Not Found'), { status: 404 })
    );
    await bootLobbySignedIn({ games: [] });
    await flushDeep();
    expect(document.getElementById('last-game-summary').textContent).toBe(
      'No finished game recorded yet.'
    );
    expect(authClient.fetchGameResults).not.toHaveBeenCalled();
  });

  it('re-lists games and loads the server result after a login', async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.login).mockResolvedValue({
      access_token: 'fresh',
      username: 'weudl',
    });
    vi.mocked(authClient.fetchMyHistory).mockResolvedValue({
      items: [{ game_id: 5 }],
      total: 1,
    });
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    vi.mocked(authClient.fetchOpenGames).mockClear();

    const form = document.getElementById('login-form');
    form.querySelector('#login-username').value = 'weudl';
    form.querySelector('#login-password').value = 'pw';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushDeep();

    expect(authClient.fetchOpenGames).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'fresh' }
    );
    expect(document.getElementById('last-game-summary').textContent).toContain(
      '5 •'
    );
  });

  it('opens the full results from the ?results= deep link and cleans the URL', async () => {
    const authClient = await import('./services/auth-client.js');
    window.history.replaceState(null, '', '/index.html?results=5&player=2');

    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushDeep();

    expect(authClient.fetchGameResults).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      '5'
    );
    expect(document.getElementById('game-results-view').hidden).toBe(false);
    expect(
      document.querySelector('.results-item.is-own .results-name').textContent
    ).toBe('Weudl');
    expect(window.location.search).toBe('');
  });
});

describe('lobby account data protection', () => {
  beforeEach(async () => {
    const authClient = await import('./services/auth-client.js');
    vi.mocked(authClient.deleteMyAccount).mockReset();
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({
      username: 'weudl',
    });
  });

  it('offers download and delete only while signed in', async () => {
    await import('./lobby.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(document.getElementById('download-account-data').disabled).toBe(
      true
    );
    expect(document.getElementById('open-delete-account').disabled).toBe(true);
  });

  it('signs out locally after the account was deleted', async () => {
    const authClient = await bootLobbySignedIn();
    vi.mocked(authClient.deleteMyAccount).mockResolvedValue(null);
    expect(document.getElementById('download-account-data').disabled).toBe(
      false
    );
    document.querySelector('.game-list-item[data-game-id="77"]').click();

    const dialog = document.getElementById('delete-account-dialog');
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    document.getElementById('open-delete-account').click();
    document.getElementById('delete-account-password').value = 'Secret123!';
    document.getElementById('delete-account-confirm').checked = true;
    document
      .getElementById('delete-account-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(authClient.deleteMyAccount).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      { authToken: 'token', password: 'Secret123!' }
    );
    expect(dialog.close).toHaveBeenCalled();
    expect(localStorage.getItem('mining-tycoon:authToken')).toBe('');
    expect(document.getElementById('account-summary').textContent).toBe(
      'Not signed in.'
    );
    expect(document.getElementById('auth-message').textContent).toBe(
      'Your account has been deleted.'
    );
    expect(document.querySelector('.game-list-item.selected')).toBeNull();
    expect(document.getElementById('open-delete-account').disabled).toBe(true);
    expect(document.getElementById('join-selected-btn').disabled).toBe(true);
  });
});

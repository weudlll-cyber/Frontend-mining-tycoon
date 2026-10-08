// Tests the enter-game / async-session start flow and the lobby autostart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ roundMode: 'sync', baseUrl: 'http://api' }));

vi.mock('../services/player-join.js', () => ({
  ensurePlayerJoinedForStream: vi.fn(async () => 'p-1'),
}));
vi.mock('../services/session-actions.js', () => ({
  createAsyncSession: vi.fn(),
}));
vi.mock('../services/stream-controller.js', () => ({
  startStream: vi.fn(),
}));
vi.mock('../meta/meta-manager.js', () => ({
  fetchMetaSnapshot: vi.fn(async () => null),
}));
vi.mock('./setup-controller.js', () => ({
  getCurrentRoundContext: () => ({ roundMode: ctx.roundMode }),
  getNormalizedBaseUrlOrNull: () => ctx.baseUrl,
  refreshAsyncDiagnostics: vi.fn(),
  setStartSessionStatus: vi.fn(),
}));
vi.mock('./toast.js', () => ({ showToast: vi.fn() }));
vi.mock('./game-over.js', () => ({ hideGameOverOverlay: vi.fn() }));
vi.mock('./board-update.js', () => ({ showScheduledRoundStatus: vi.fn() }));

let flow;
let boardState;
let join;
let sessionActions;
let stream;
let meta;
let setup;
let toast;
let boardUpdate;
let deps;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ctx.roundMode = 'sync';
  ctx.baseUrl = 'http://api';
  document.body.innerHTML = `
    <input id="game-id" value="g-1" />
    <input id="player-id" value="" />
  `;
  flow = await import('./start-flow.js');
  ({ boardState } = await import('./board-state.js'));
  join = await import('../services/player-join.js');
  sessionActions = await import('../services/session-actions.js');
  stream = await import('../services/stream-controller.js');
  meta = await import('../meta/meta-manager.js');
  setup = await import('./setup-controller.js');
  toast = await import('./toast.js');
  boardUpdate = await import('./board-update.js');
  deps = {
    gameIdInput: document.getElementById('game-id'),
    playerIdInput: document.getElementById('player-id'),
    updateSetupActionsState: vi.fn(),
    renderDebugContext: vi.fn(),
    setSetupCollapsed: vi.fn(),
  };
  flow.initStartFlow(deps);
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('runStartGameFlowSafely', () => {
  it('joins, fetches meta and starts the stream for a sync round', async () => {
    await flow.runStartGameFlowSafely();

    expect(join.ensurePlayerJoinedForStream).toHaveBeenCalledWith({
      baseUrl: 'http://api',
      gameId: 'g-1',
      playerId: '',
    });
    expect(meta.fetchMetaSnapshot).toHaveBeenCalledWith('http://api', 'g-1');
    expect(stream.startStream).toHaveBeenCalledWith(
      'g-1',
      'p-1',
      expect.objectContaining({ sessionId: null, forceSessionAttempt: false })
    );
    expect(boardState.currentViewedGameId).toBe('g-1');
    expect(deps.setSetupCollapsed).toHaveBeenCalledWith(true);
  });

  it('still streams when the meta fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    meta.fetchMetaSnapshot.mockRejectedValueOnce(new Error('offline'));
    await flow.runStartGameFlowSafely();
    expect(stream.startStream).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('starts an async session first when the round is async', async () => {
    ctx.roundMode = 'async';
    sessionActions.createAsyncSession.mockResolvedValue({
      ok: true,
      sessionId: 's-1',
      sessionStartUnix: 100,
      sessionDurationSec: 600,
    });
    await flow.runStartGameFlowSafely();

    expect(sessionActions.createAsyncSession).toHaveBeenCalledWith({
      gameId: 'g-1',
      playerId: 'p-1',
    });
    expect(boardState.activeSession?.sessionId).toBe('s-1');
    expect(stream.startStream).toHaveBeenCalledWith(
      'g-1',
      'p-1',
      expect.objectContaining({ sessionId: 's-1', forceSessionAttempt: true })
    );
  });

  it('stops without a backend URL or game id', async () => {
    ctx.baseUrl = null;
    await flow.runStartGameFlowSafely();
    expect(join.ensurePlayerJoinedForStream).not.toHaveBeenCalled();

    ctx.baseUrl = 'http://api';
    deps.gameIdInput.value = '';
    await flow.runStartGameFlowSafely();
    expect(toast.showToast).toHaveBeenCalledWith(
      'Choose an active game before entering the game.',
      'error'
    );
  });

  it('reports join errors as a toast', async () => {
    join.ensurePlayerJoinedForStream.mockRejectedValueOnce(
      new Error('Join failed: full')
    );
    await flow.runStartGameFlowSafely();
    expect(toast.showToast).toHaveBeenCalledWith('Join failed: full', 'error');
    expect(stream.startStream).not.toHaveBeenCalled();
  });

  it('shows a scheduled round when the join is refused as not opened yet', async () => {
    const refusal = Object.assign(new Error('Join failed: not open'), {
      status: 409,
      code: 'JOIN_NOT_ALLOWED_SCHEDULED',
      opensAt: 1_800_000_000,
    });
    join.ensurePlayerJoinedForStream.mockRejectedValueOnce(refusal);
    await flow.runStartGameFlowSafely({ source: 'autostart' });
    expect(boardUpdate.showScheduledRoundStatus).toHaveBeenCalledWith(
      1_800_000_000
    );
    expect(toast.showToast).toHaveBeenCalledWith(
      'This round has not opened yet.',
      'info'
    );
    expect(stream.startStream).not.toHaveBeenCalled();

    // The async-session button path handles it the same way (no opens_at).
    join.ensurePlayerJoinedForStream.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'JOIN_NOT_ALLOWED_SCHEDULED' })
    );
    await flow.handleStartAsyncSession();
    expect(boardUpdate.showScheduledRoundStatus).toHaveBeenLastCalledWith(null);
    expect(setup.setStartSessionStatus).not.toHaveBeenCalledWith('x', 'error');
  });

  it('catches unexpected errors and releases the busy state', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stream.startStream.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    boardState.isSetupBusy = true;
    await flow.runStartGameFlowSafely({ source: 'test' });

    expect(toast.showToast).toHaveBeenCalledWith(
      'Could not start game: boom',
      'error'
    );
    expect(boardState.isSetupBusy).toBe(false);
    expect(deps.updateSetupActionsState).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('handleStartAsyncSession', () => {
  it('reports a failed session start', async () => {
    sessionActions.createAsyncSession.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'Round not running',
    });
    await flow.handleStartAsyncSession();

    expect(setup.setStartSessionStatus).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String)
    );
    expect(boardState.isSetupBusy).toBe(false);
    expect(stream.startStream).not.toHaveBeenCalled();
  });

  it('asks for a game when none is stored', async () => {
    deps.gameIdInput.value = '';
    await flow.handleStartAsyncSession();
    expect(setup.setStartSessionStatus).toHaveBeenCalledWith(
      'Choose an active game before starting a session.',
      'error'
    );
  });
});

describe('runAutostartIfRequested', () => {
  it('enters the game once and drops the autostart flag', async () => {
    window.history.replaceState({}, '', '/player.html?autostart=1&x=2#top');
    await flow.runAutostartIfRequested();

    expect(stream.startStream).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?x=2');
    expect(window.location.hash).toBe('#top');
  });

  it('does nothing without the flag', async () => {
    window.history.replaceState({}, '', '/player.html');
    await flow.runAutostartIfRequested();
    expect(stream.startStream).not.toHaveBeenCalled();
  });
});

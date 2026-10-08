// Tests how trade/farm results and finished sessions are applied to the board.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./player-view.js', () => ({ renderPlayerState: vi.fn() }));
vi.mock('./live-board-lifecycle.js', () => ({
  refreshPanelStatus: vi.fn(),
  setLiveSessionActive: vi.fn(),
}));
vi.mock('./game-over.js', () => ({
  captureLastPlayedGameSnapshot: vi.fn(),
  hideGameOverOverlay: vi.fn(),
  isGameOverOverlayEligible: vi.fn(() => false),
  showGameOverOverlay: vi.fn(),
}));
vi.mock('./setup-controller.js', () => ({
  getCurrentRoundContext: () => ({ roundMode: 'sync' }),
  refreshAsyncDiagnostics: vi.fn(),
  setStartSessionStatus: vi.fn(),
}));

let boardUpdate;
let boardState;
let playerView;
let lifecycle;
let gameOver;
let deps;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  boardUpdate = await import('./board-update.js');
  ({ boardState } = await import('./board-state.js'));
  playerView = await import('./player-view.js');
  lifecycle = await import('./live-board-lifecycle.js');
  gameOver = await import('./game-over.js');
  deps = {
    renderQuickStats: vi.fn(),
    renderPortfolioValue: vi.fn(),
  };
  boardUpdate.initBoardUpdate(deps);
});

function expectBoardRendered() {
  expect(playerView.renderPlayerState).toHaveBeenCalledWith(
    boardState.lastGameData
  );
  expect(deps.renderQuickStats).toHaveBeenCalledWith(boardState.lastGameData);
  expect(deps.renderPortfolioValue).toHaveBeenCalledWith(
    boardState.lastGameData
  );
  expect(lifecycle.refreshPanelStatus).toHaveBeenCalled();
}

describe('applyTradeExecuted', () => {
  it('ignores payloads without an updated state', () => {
    boardUpdate.applyTradeExecuted(null);
    boardUpdate.applyTradeExecuted({ updated_state: null });
    expect(playerView.renderPlayerState).not.toHaveBeenCalled();
    expect(boardState.lastGameData).toBeNull();
  });

  it('merges the player state and takes trades_used from the trade result', () => {
    boardState.lastGameData = { game_id: 'g1', player_state: { old: true } };
    boardUpdate.applyTradeExecuted({
      updated_state: { balances: { spring: 3 } },
      trade_result: { trades_used: 2 },
    });

    expect(boardState.lastGameData).toEqual({
      game_id: 'g1',
      player_state: { balances: { spring: 3 } },
      trades_used: 2,
    });
    expectBoardRendered();
  });

  it('falls back to the counter in the updated state', () => {
    boardUpdate.applyTradeExecuted({
      updated_state: { trade_count_used: 4 },
    });
    expect(boardState.lastGameData.trades_used).toBe(4);

    boardUpdate.applyTradeExecuted({ updated_state: {} });
    expect(boardState.lastGameData.trades_used).toBe(0);
  });
});

describe('applyFarmUpdated', () => {
  it('ignores payloads without an updated state', () => {
    boardUpdate.applyFarmUpdated({});
    expect(playerView.renderPlayerState).not.toHaveBeenCalled();
  });

  it('merges the farm state and re-renders the board', () => {
    boardState.lastGameData = { game_id: 'g1', player_state: {} };
    boardUpdate.applyFarmUpdated({
      updated_state: { balances: { winter: 9 } },
    });
    expect(boardState.lastGameData.game_id).toBe('g1');
    expectBoardRendered();
  });
});

describe('showSessionFinishedOverlay', () => {
  it('shows the session-finished overlay for the game', () => {
    boardUpdate.showSessionFinishedOverlay('g1');
    expect(gameOver.showGameOverOverlay).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ title: 'Session Finished' })
    );
  });
});

describe('cancelPendingUiRender', () => {
  it('drops a scheduled frame', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation(() => 42);
    boardUpdate.updateUI({ game_status: 'running' });
    boardUpdate.cancelPendingUiRender();

    expect(cancelSpy).toHaveBeenCalledWith(42);
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});

describe('showScheduledRoundStatus', () => {
  it('shows the scheduled phase badge and gates actions without a payload', () => {
    const gameStatusEl = document.createElement('span');
    const updateSetupActionsState = vi.fn();
    boardUpdate.initBoardUpdate({
      ...deps,
      gameStatusEl,
      updateSetupActionsState,
    });
    const opensAt = Math.floor(new Date(2026, 9, 9, 9, 15).getTime() / 1000);

    boardUpdate.showScheduledRoundStatus(opensAt);
    expect(boardState.latestGameStatus).toBe('scheduled');
    expect(gameStatusEl.textContent).toMatch(/^Scheduled — opens at .*09:15$/);
    expect(lifecycle.refreshPanelStatus).toHaveBeenCalled();
    expect(updateSetupActionsState).toHaveBeenCalled();

    // Unknown opening time (no opens_at in the 409): plain "Scheduled".
    boardUpdate.showScheduledRoundStatus();
    expect(gameStatusEl.textContent).toBe('Scheduled');
  });
});

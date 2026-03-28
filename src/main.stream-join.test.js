import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  getPlayerTokenStorageKey,
  getStorageItem,
} from './utils/storage-utils.js';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('stream start join behavior', () => {
  it('auto-joins and persists player context when player id is missing', async () => {
    const module = await loadMainModule();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ player_id: 42, player_token: 'token-42' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '',
    });

    expect(playerId).toBe('42');
    expect(document.getElementById('player-id').value).toBe('42');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/join');
    expect(getStorageItem(STORAGE_KEYS.gameId)).toBe('game-7');
    expect(getStorageItem(STORAGE_KEYS.playerId)).toBe('42');
    expect(getStorageItem(getPlayerTokenStorageKey('game-7', '42'))).toBe(
      'token-42'
    );
  });

  it('does not call join endpoint when player id is already present', async () => {
    const module = await loadMainModule();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ game_id: 'game-7', player_id: '77' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '77',
    });

    expect(playerId).toBe('77');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/state');
  });

  it('re-joins when existing player id does not belong to selected game', async () => {
    const module = await loadMainModule();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ player_id: 88, player_token: 'token-88' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const playerId = await module.ensurePlayerJoinedForStream({
      baseUrl: 'http://127.0.0.1:8000',
      gameId: 'game-7',
      playerId: '77',
    });

    expect(playerId).toBe('88');
    expect(document.getElementById('player-id').value).toBe('88');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/games/game-7/state');
    expect(fetchMock.mock.calls[1][0]).toContain('/games/game-7/join');
  });
});

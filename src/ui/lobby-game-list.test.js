/**
File: src/ui/lobby-game-list.test.js
Purpose: Unit tests for the lobby open-games listbox renderer: option roles,
  the "Upcoming" group for scheduled rounds, countdown ticks and selection
  marking. The keyboard flow is covered end-to-end in src/lobby.test.js.
Security notes: verifies backend text is rendered as text, never markup.
*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  markSelectedRow,
  renderLobbyGameList,
  startScheduledCountdown,
  stopScheduledCountdown,
  tickScheduledCountdowns,
} from './lobby-game-list.js';

afterEach(() => {
  stopScheduledCountdown();
  vi.useRealTimers();
});

function makeList() {
  const list = document.createElement('ul');
  document.body.replaceChildren(list);
  return list;
}

describe('renderLobbyGameList', () => {
  it('orders scheduled rounds by opening time below the Upcoming divider', () => {
    const list = makeList();
    const nowMs = 1_800_000_000_000;
    const selected = renderLobbyGameList(
      list,
      [
        { game_id: 'late', status: 'scheduled', opens_in_seconds: 7200 },
        { game_id: 'unknown', status: 'scheduled' },
        { game_id: '<b>open</b>', game_status: 'running' },
        { game_id: 'soon', status: 'scheduled', opens_in_seconds: 60 },
        { game_id: '' },
      ],
      { selectedGameId: 'soon', nowMs, onSelect: vi.fn() }
    );

    const ids = Array.from(list.querySelectorAll('.game-list-item')).map(
      (row) => row.dataset.gameId
    );
    expect(ids).toEqual(['<b>open</b>', 'soon', 'late', 'unknown']);
    expect(list.querySelector('b')).toBeNull();
    expect(list.children[1].className).toBe('game-list-group-label');
    expect(selected.gameId).toBe('soon');
    const soonRow = list.querySelector('[data-game-id="soon"]');
    expect(soonRow.getAttribute('aria-selected')).toBe('true');
    expect(soonRow.tabIndex).toBe(0);

    // A scheduled round without any opening time: no countdown data.
    const unknownRow = list.querySelector('[data-game-id="unknown"]');
    expect(unknownRow.dataset.opensAtMs).toBeUndefined();
    expect(unknownRow.querySelector('.game-start-time')).toBeNull();
    expect(unknownRow.querySelector('.game-countdown').textContent).toBe(
      'Opens soon'
    );
  });

  it('reports due rows on every tick and leaves other rows alone', () => {
    const list = makeList();
    renderLobbyGameList(
      list,
      [{ game_id: 's', status: 'scheduled', opens_in_seconds: 2 }],
      { nowMs: 0, onSelect: vi.fn() }
    );
    const onDue = vi.fn();
    expect(tickScheduledCountdowns(list, onDue, 1000)).toBe(false);
    expect(list.querySelector('.game-countdown').textContent).toBe(
      'opens in 1 s'
    );
    expect(tickScheduledCountdowns(list, onDue, 2000)).toBe(true);
    expect(tickScheduledCountdowns(list, onDue, 3000)).toBe(true);
    expect(onDue).toHaveBeenCalledTimes(2);
    expect(list.querySelector('.game-countdown').textContent).toBe(
      'opening now'
    );
  });

  it('runs the countdown only while scheduled rows exist', () => {
    vi.useFakeTimers();
    const list = makeList();
    const onDue = vi.fn();
    renderLobbyGameList(list, [{ game_id: 'g', game_status: 'running' }], {
      onSelect: vi.fn(),
    });
    startScheduledCountdown(list, onDue);
    expect(vi.getTimerCount()).toBe(0);

    renderLobbyGameList(
      list,
      [{ game_id: 's', status: 'scheduled', opens_in_seconds: 1 }],
      { onSelect: vi.fn() }
    );
    startScheduledCountdown(list, onDue);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(onDue).toHaveBeenCalledTimes(1);

    // An empty list stops the ticker.
    renderLobbyGameList(list, [], { onSelect: vi.fn() });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the selection and keeps one tab stop', () => {
    const list = makeList();
    renderLobbyGameList(
      list,
      [
        { game_id: 'a', game_status: 'running' },
        { game_id: 'b', game_status: 'running' },
      ],
      { selectedGameId: 'b', onSelect: vi.fn() }
    );
    markSelectedRow(list, null);
    const rows = Array.from(list.querySelectorAll('.game-list-item'));
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
    ]);
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1]);
  });
});

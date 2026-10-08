/**
File: src/ui/standings-status.test.js
Purpose: Verify the Live / Provisional / Final labels for leaderboard values.
Role in system: Guards the async "Provisional while the round is open" contract.
Security notes: DOM text only.
*/

import { beforeEach, describe, expect, it } from 'vitest';

import {
  initStandingsStatus,
  renderStandingsStatus,
  resolveStandingsStatus,
} from './standings-status.js';

describe('resolveStandingsStatus', () => {
  it('labels a scheduled round with its local opening time', () => {
    const opensAt = Math.floor(new Date(2026, 9, 9, 18, 30).getTime() / 1000);
    const status = resolveStandingsStatus({
      roundMode: 'sync',
      gameStatus: 'scheduled',
      scheduledStartAt: opensAt,
    });
    expect(status.state).toBe('scheduled');
    expect(status.label).toBe('Scheduled');
    expect(status.description).toMatch(/^Scheduled — opens at .*18:30\.$/);
    expect(
      resolveStandingsStatus({ gameStatus: 'scheduled' }).description
    ).toBe('Scheduled — the round has not opened yet.');
  });

  it('marks async rounds provisional until the round is finished', () => {
    expect(
      resolveStandingsStatus({ roundMode: 'async', gameStatus: 'running' })
        .state
    ).toBe('provisional');
    expect(
      resolveStandingsStatus({ roundMode: 'async', gameStatus: 'enrolling' })
        .state
    ).toBe('provisional');
    expect(
      resolveStandingsStatus({ roundMode: 'async', gameStatus: 'FINISHED ' })
        .state
    ).toBe('final');
  });

  it('marks sync rounds live while running and final when finished', () => {
    expect(
      resolveStandingsStatus({ roundMode: 'sync', gameStatus: 'running' })
    ).toMatchObject({ state: 'live', label: 'Live' });
    expect(
      resolveStandingsStatus({ roundMode: 'sync', gameStatus: 'finished' })
    ).toMatchObject({ state: 'final', label: 'Final' });
  });

  it('shows no label without a meaningful status', () => {
    expect(resolveStandingsStatus().state).toBe('none');
    expect(
      resolveStandingsStatus({ roundMode: 'sync', gameStatus: 'enrolling' })
        .state
    ).toBe('none');
  });
});

describe('renderStandingsStatus', () => {
  let headerTagEl;
  let panelNoteEl;

  beforeEach(() => {
    document.body.innerHTML = '<span id="tag"></span><p id="note"></p>';
    headerTagEl = document.getElementById('tag');
    panelNoteEl = document.getElementById('note');
    initStandingsStatus({ headerTagEl, panelNoteEl });
  });

  it('starts empty and without a tooltip', () => {
    expect(headerTagEl.textContent).toBe('');
    expect(headerTagEl.dataset.standingsState).toBe('none');
    expect(headerTagEl.hasAttribute('title')).toBe(false);
  });

  it('renders the short label in the header and the sentence in the panel', () => {
    renderStandingsStatus(
      resolveStandingsStatus({ roundMode: 'async', gameStatus: 'running' })
    );
    expect(headerTagEl.textContent).toBe('Provisional');
    expect(headerTagEl.title).toBe('Provisional — the round is still open.');
    expect(panelNoteEl.textContent).toBe(
      'Provisional — the round is still open.'
    );
    expect(panelNoteEl.dataset.standingsState).toBe('provisional');

    // Reset clears text and tooltip again.
    renderStandingsStatus();
    expect(headerTagEl.textContent).toBe('');
    expect(headerTagEl.hasAttribute('title')).toBe(false);
  });

  it('tolerates missing elements', () => {
    initStandingsStatus();
    expect(() =>
      renderStandingsStatus(
        resolveStandingsStatus({ roundMode: 'sync', gameStatus: 'running' })
      )
    ).not.toThrow();
  });
});

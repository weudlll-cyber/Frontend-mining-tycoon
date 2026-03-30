/**
File: src/ui/season-focus.test.js
Purpose: Verify compact season-focus controls keep exactly one active mobile season card.
Role in system: Regression tests for low-scroll mobile gameplay layout.
Invariants: Focus state is class-based and must not remove any season card from the DOM.
Security notes: DOM-only behavior tests.
*/

import { beforeEach, describe, expect, it } from 'vitest';

import {
  getFocusedSeason,
  initSeasonFocus,
  setFocusedSeason,
} from './season-focus.js';

function makeButton(season) {
  const button = document.createElement('button');
  button.dataset.seasonFocus = season;
  return button;
}

function makeCard(season) {
  const card = document.createElement('div');
  card.className = 'season-card';
  card.dataset.season = season;
  return card;
}

describe('season-focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('applies default focused season state', () => {
    const strip = document.createElement('div');
    const buttons = ['spring', 'summer', 'autumn', 'winter'].map(makeButton);
    const cards = ['spring', 'summer', 'autumn', 'winter'].map(makeCard);

    initSeasonFocus({
      stripEl: strip,
      buttons,
      cards,
      defaultSeason: 'autumn',
    });

    expect(getFocusedSeason()).toBe('autumn');
    expect(strip.dataset.activeSeason).toBe('autumn');
    expect(cards[2].classList.contains('season-card-focus-active')).toBe(true);
    expect(cards[0].classList.contains('season-card-focus-active')).toBe(false);
  });

  it('updates active season when setFocusedSeason is called', () => {
    const strip = document.createElement('div');
    const buttons = ['spring', 'summer', 'autumn', 'winter'].map(makeButton);
    const cards = ['spring', 'summer', 'autumn', 'winter'].map(makeCard);

    initSeasonFocus({
      stripEl: strip,
      buttons,
      cards,
      defaultSeason: 'spring',
    });

    setFocusedSeason('winter');

    expect(getFocusedSeason()).toBe('winter');
    expect(cards[3].classList.contains('season-card-focus-active')).toBe(true);
    expect(cards[0].classList.contains('season-card-focus-active')).toBe(false);
    expect(buttons[3].getAttribute('aria-selected')).toBe('true');
  });
});

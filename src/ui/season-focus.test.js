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

  it('moves between season tabs with ArrowLeft/ArrowRight/Home/End', () => {
    const strip = document.createElement('div');
    const buttons = ['spring', 'summer', 'autumn', 'winter'].map(makeButton);
    buttons.forEach((button) => strip.appendChild(button));
    document.body.appendChild(strip);
    const cards = ['spring', 'summer', 'autumn', 'winter'].map(makeCard);
    initSeasonFocus({
      stripEl: strip,
      buttons,
      cards,
      defaultSeason: 'spring',
    });

    // Roving tabindex: only the active tab is in the Tab order.
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);

    const press = (target, key) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    };

    expect(press(buttons[0], 'ArrowRight').defaultPrevented).toBe(true);
    expect(getFocusedSeason()).toBe('summer');
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1, -1]);

    press(buttons[1], 'End');
    expect(getFocusedSeason()).toBe('winter');
    press(buttons[3], 'ArrowRight');
    expect(getFocusedSeason()).toBe('spring');
    press(buttons[0], 'ArrowLeft');
    expect(getFocusedSeason()).toBe('winter');
    press(buttons[3], 'Home');
    expect(getFocusedSeason()).toBe('spring');
    expect(document.activeElement).toBe(buttons[0]);

    // Other keys and events from outside the tabs are ignored.
    expect(press(buttons[0], 'ArrowDown').defaultPrevented).toBe(false);
    expect(press(strip, 'ArrowRight').defaultPrevented).toBe(false);
    expect(getFocusedSeason()).toBe('spring');
  });
});

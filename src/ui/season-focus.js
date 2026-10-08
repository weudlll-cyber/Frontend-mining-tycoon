/**
File: src/ui/season-focus.js
Purpose: Keep mobile gameplay compact by focusing one season card at a time.
Role in system: Presentation-only helper for responsive season navigation; does not alter gameplay data or actions.
Invariants: All season cards remain in the DOM and continue receiving updates; only visibility classes change.
Accessibility: the strip is a WAI-ARIA tablist (player.html). Only the active
  tab is in the Tab order (roving tabindex); ArrowLeft/ArrowRight (wrapping),
  Home and End move to and activate another season, like the live tools
  window tabs (src/ui/live-drawer.js).
Security notes: No external input processing.
*/

const VALID_SEASONS = ['spring', 'summer', 'autumn', 'winter'];

let _stripEl = null;
let _buttons = [];
let _cards = [];
let _activeSeason = 'spring';

function normalizeSeason(value) {
  const season = String(value || '')
    .trim()
    .toLowerCase();
  return VALID_SEASONS.includes(season) ? season : 'spring';
}

function applyState() {
  if (!_stripEl) {
    return;
  }

  _stripEl.dataset.activeSeason = _activeSeason;

  _buttons.forEach((button) => {
    const season = normalizeSeason(button.dataset.seasonFocus);
    const isActive = season === _activeSeason;
    button.classList.toggle('season-focus-btn-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  _cards.forEach((card) => {
    const season = normalizeSeason(card.dataset.season);
    card.classList.toggle('season-card-focus-active', season === _activeSeason);
  });
}

export function setFocusedSeason(season) {
  _activeSeason = normalizeSeason(season);
  applyState();
}

export function getFocusedSeason() {
  return _activeSeason;
}

// Arrow/Home/End navigation inside the tablist (automatic activation).
function handleSeasonFocusKeydown(event) {
  const currentIndex = _buttons.indexOf(event.target);
  if (currentIndex < 0) return;

  let nextIndex = null;
  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % _buttons.length;
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + _buttons.length) % _buttons.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = _buttons.length - 1;
  }
  if (nextIndex === null) return;

  event.preventDefault();
  const nextButton = _buttons[nextIndex];
  setFocusedSeason(nextButton.dataset.seasonFocus);
  nextButton.focus();
}

export function initSeasonFocus(deps) {
  _stripEl = deps.stripEl || null;
  _buttons = Array.isArray(deps.buttons) ? deps.buttons : [];
  _cards = Array.isArray(deps.cards) ? deps.cards : [];

  if (!_stripEl || !_buttons.length || !_cards.length) {
    return;
  }

  _buttons.forEach((button) => {
    button?.addEventListener('click', () => {
      setFocusedSeason(button.dataset.seasonFocus);
    });
  });
  _stripEl.addEventListener('keydown', handleSeasonFocusKeydown);

  _activeSeason = normalizeSeason(deps.defaultSeason);
  applyState();
}

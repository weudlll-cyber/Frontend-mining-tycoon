/**
File: src/ui/season-focus.js
Purpose: Keep mobile gameplay compact by focusing one season card at a time.
Role in system: Presentation-only helper for responsive season navigation; does not alter gameplay data or actions.
Invariants: All season cards remain in the DOM and continue receiving updates; only visibility classes change.
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

  _activeSeason = normalizeSeason(deps.defaultSeason);
  applyState();
}

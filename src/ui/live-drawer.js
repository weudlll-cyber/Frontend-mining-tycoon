/**
File: src/ui/live-drawer.js
Purpose: Manage the optional live-tools drawer (Trade/Farm/Chat) without impacting core gameplay rendering.
Role in system: Provides a compact interaction shell so non-core panels stay reachable while preserving a low-scroll main board.
Invariants: Gameplay cards and player-state panel remain always visible; drawer only hosts auxiliary panels.
Security notes: UI-only state; no network or game-authority logic.
*/

const VALID_TABS = ['trade', 'farm', 'chat'];

let _refs = {
  rootEl: null,
  backdropEl: null,
  closeBtnEl: null,
  tabButtons: [],
  panels: [],
  openButtons: [],
};

let _onStateChanged = null;
let _isOpen = false;
let _activeTab = 'trade';

function normalizeTab(value) {
  const tab = String(value || '')
    .trim()
    .toLowerCase();
  return VALID_TABS.includes(tab) ? tab : 'trade';
}

function emitStateChange() {
  if (typeof _onStateChanged === 'function') {
    _onStateChanged({ isOpen: _isOpen, activeTab: _activeTab });
  }
}

function renderState() {
  if (_refs.rootEl) {
    _refs.rootEl.hidden = !_isOpen;
    _refs.rootEl.classList.toggle('live-drawer-open', _isOpen);
    _refs.rootEl.dataset.activeTab = _activeTab;
  }

  _refs.tabButtons.forEach((button) => {
    const tab = normalizeTab(button.dataset.liveTab);
    const isActive = tab === _activeTab;
    button.classList.toggle('live-drawer-tab-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  _refs.panels.forEach((panel) => {
    const tab = normalizeTab(panel.dataset.livePanel);
    const isActive = tab === _activeTab;
    panel.hidden = !isActive;
  });

  _refs.openButtons.forEach((button) => {
    if (button) {
      button.setAttribute('aria-expanded', String(_isOpen));
    }
  });

  emitStateChange();
}

export function setLiveDrawerTab(tab) {
  _activeTab = normalizeTab(tab);
  renderState();
}

export function openLiveDrawer(tab = _activeTab) {
  _activeTab = normalizeTab(tab);
  _isOpen = true;
  renderState();
}

export function closeLiveDrawer() {
  _isOpen = false;
  renderState();
}

export function isLiveDrawerOpen() {
  return _isOpen;
}

export function getLiveDrawerTab() {
  return _activeTab;
}

export function initLiveDrawer(deps) {
  _refs = {
    rootEl: deps.rootEl || null,
    backdropEl: deps.backdropEl || null,
    closeBtnEl: deps.closeBtnEl || null,
    tabButtons: Array.isArray(deps.tabButtons) ? deps.tabButtons : [],
    panels: Array.isArray(deps.panels) ? deps.panels : [],
    openButtons: Array.isArray(deps.openButtons) ? deps.openButtons : [],
  };
  _onStateChanged = deps.onStateChanged;

  if (!_refs.rootEl) {
    return;
  }

  _refs.tabButtons.forEach((button) => {
    button?.addEventListener('click', () => {
      openLiveDrawer(button.dataset.liveTab);
    });
  });

  _refs.openButtons.forEach((button) => {
    button?.addEventListener('click', () => {
      openLiveDrawer(button.dataset.liveTab);
    });
  });

  _refs.backdropEl?.addEventListener('click', closeLiveDrawer);
  _refs.closeBtnEl?.addEventListener('click', closeLiveDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && _isOpen) {
      closeLiveDrawer();
    }
  });

  _isOpen = false;
  _activeTab = normalizeTab(deps.defaultTab);
  renderState();
}

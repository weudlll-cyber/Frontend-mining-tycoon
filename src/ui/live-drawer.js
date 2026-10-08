/**
File: src/ui/live-drawer.js
Purpose: Manage the optional live-tools drawer (Trade/Farm/Chat/Top 5) without impacting core gameplay rendering.
Role in system: Provides a compact interaction shell so non-core panels stay reachable while preserving a low-scroll main board.
Invariants: Gameplay cards and player-state panel remain always visible; drawer only hosts auxiliary panels.
Security notes: UI-only state; no network or game-authority logic.
Accessibility:
- Tabs follow the WAI-ARIA tabs pattern: roving tabindex (only the active tab
  is in the Tab order), ArrowLeft/ArrowRight/Home/End move between tabs and
  activate them, aria-selected mirrors the active tab.
- Opening from an action-bar button moves focus to the active tab; closing
  while focus is inside the window returns focus to that opener.
- Dragging is clamped so the header always stays inside the viewport.
*/

const VALID_TABS = ['trade', 'farm', 'chat', 'leaderboard'];

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
let _lastOpenerEl = null;

// Part of the window header that must stay on screen while dragging, so the
// player can always grab it again (px).
const DRAG_KEEP_VISIBLE_PX = 48;

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
    // Roving tabindex: Tab enters the tablist on the active tab only.
    button.tabIndex = isActive ? 0 : -1;
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
  const focusWasInside = Boolean(
    _refs.rootEl && _refs.rootEl.contains(document.activeElement)
  );
  _isOpen = false;
  renderState();
  // Hidden elements lose focus; hand it back to the button that opened us.
  if (focusWasInside && _lastOpenerEl?.isConnected) {
    _lastOpenerEl.focus();
  }
}

function getActiveTabButton() {
  return (
    _refs.tabButtons.find(
      (button) => button && normalizeTab(button.dataset.liveTab) === _activeTab
    ) || null
  );
}

// Arrow/Home/End navigation inside the tablist (WAI-ARIA tabs pattern with
// automatic activation). Returns true when the key was handled.
function handleLiveDrawerTabKeydown(event) {
  const buttons = _refs.tabButtons.filter(Boolean);
  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return false;

  let nextIndex = null;
  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % buttons.length;
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = buttons.length - 1;
  }
  if (nextIndex === null) return false;

  event.preventDefault();
  const nextButton = buttons[nextIndex];
  setLiveDrawerTab(nextButton.dataset.liveTab);
  nextButton.focus();
  return true;
}

/** Keep `value` between min and max (max wins when the range is empty). */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function isLiveDrawerOpen() {
  return _isOpen;
}

export function getLiveDrawerTab() {
  return _activeTab;
}

// Make the floating window draggable by its header.
// Tracks mouse/touch delta from the drag start position and updates
// the window's left/top inline style; clears the CSS transform that
// centres the window on first open so pixel positioning takes over.
function _initDrag(windowEl, handleEl) {
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;

  // Clamp so at least DRAG_KEEP_VISIBLE_PX of the header stays inside the
  // viewport; a window dragged off-screen (easy on phones) is unreachable.
  function applyDelta(clientX, clientY) {
    // Unknown width (not laid out yet): keep the left edge on screen.
    const width = windowEl.offsetWidth || DRAG_KEEP_VISIBLE_PX;
    const left = clamp(
      startLeft + (clientX - startX),
      DRAG_KEEP_VISIBLE_PX - width,
      window.innerWidth - DRAG_KEEP_VISIBLE_PX
    );
    const top = clamp(
      startTop + (clientY - startY),
      0,
      window.innerHeight - DRAG_KEEP_VISIBLE_PX
    );
    windowEl.style.left = left + 'px';
    windowEl.style.top = top + 'px';
  }

  function onMouseMove(e) {
    applyDelta(e.clientX, e.clientY);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  handleEl.addEventListener('mousedown', (e) => {
    // Allow clicks on buttons inside the header to pass through normally.
    if (e.target.closest('button')) return;
    const rect = windowEl.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    // Once dragged, switch from the centering transform to absolute pixels.
    windowEl.style.transform = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  // Touch support for mobile drag
  handleEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.target.closest('button')) return;
      const touch = e.touches[0];
      const rect = windowEl.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      windowEl.style.transform = 'none';

      function onTouchMove(ev) {
        applyDelta(ev.touches[0].clientX, ev.touches[0].clientY);
      }
      function onTouchEnd() {
        handleEl.removeEventListener('touchmove', onTouchMove);
        handleEl.removeEventListener('touchend', onTouchEnd);
      }
      handleEl.addEventListener('touchmove', onTouchMove, { passive: false });
      handleEl.addEventListener('touchend', onTouchEnd);
      e.preventDefault();
    },
    { passive: false }
  );
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
    button?.addEventListener('keydown', handleLiveDrawerTabKeydown);
  });

  _refs.openButtons.forEach((button) => {
    button?.addEventListener('click', () => {
      _lastOpenerEl = button;
      openLiveDrawer(button.dataset.liveTab);
      // Move keyboard focus into the (non-modal) window.
      getActiveTabButton()?.focus();
    });
  });

  _refs.backdropEl?.addEventListener('click', closeLiveDrawer);
  _refs.closeBtnEl?.addEventListener('click', closeLiveDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && _isOpen) {
      closeLiveDrawer();
    }
  });

  // Wire up drag-to-move on the header bar.
  const headerEl = _refs.rootEl.querySelector('.live-drawer-header');
  if (headerEl) {
    _initDrag(_refs.rootEl, headerEl);
  }

  // Close when clicking anywhere outside the floating window.
  // Uses pointerdown (fires before click) so the check happens before any
  // button inside the window could re-open it in the same gesture.
  document.addEventListener('pointerdown', (e) => {
    if (_isOpen && !_refs.rootEl.contains(e.target)) {
      closeLiveDrawer();
    }
  });

  _isOpen = false;
  _lastOpenerEl = null;
  _activeTab = normalizeTab(deps.defaultTab);
  renderState();
}

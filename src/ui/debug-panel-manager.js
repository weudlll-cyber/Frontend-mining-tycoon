/**
File: src/ui/debug-panel-manager.js
Purpose: Encapsulate setup debug-panel visibility state and persistence.
*/

import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';

export function renderDebugContext(refs, state) {
  if (!refs) return;

  if (refs.debugBackendUrlEl) {
    refs.debugBackendUrlEl.textContent = refs.baseUrlInput?.value || '—';
  }
  if (refs.debugGameIdEl) {
    refs.debugGameIdEl.textContent = refs.gameIdInput?.value || '—';
  }
  if (refs.debugPlayerIdEl) {
    refs.debugPlayerIdEl.textContent = refs.playerIdInput?.value || '—';
  }
  if (refs.debugSessionIdEl) {
    const debugOpen = isDebugPanelExpanded(refs);
    refs.debugSessionIdEl.textContent =
      debugOpen && state?.sessionId ? String(state.sessionId) : '—';
  }
}

export function toggleDebugPanel(refs, state) {
  setDebugPanelExpanded(refs, state, !isDebugPanelExpanded(refs));
}

export function applyStoredDebugPanelState(refs, state) {
  const stored = getStorageItem(STORAGE_KEYS.debugPanelOpen);
  const shouldExpand = stored === 'true';
  setDebugPanelExpanded(refs, state, shouldExpand, { persist: false });
}

function isDebugPanelExpanded(refs) {
  return Boolean(refs?.debugPanelEl && !refs.debugPanelEl.hidden);
}

function setDebugToggleExpandedAttribute(refs, isExpanded) {
  if (!refs?.debugToggleBtnEl) return;
  refs.debugToggleBtnEl.setAttribute(
    'aria-expanded',
    isExpanded ? 'true' : 'false'
  );
  refs.debugToggleBtnEl.setAttribute(
    'aria-label',
    isExpanded ? 'Collapse debug panel' : 'Expand debug panel'
  );
}

function setDebugPanelExpanded(
  refs,
  state,
  isExpanded,
  { persist = true } = {}
) {
  if (!refs?.debugPanelEl) return;

  refs.debugPanelEl.hidden = !isExpanded;
  refs.debugPanelEl.classList.toggle('debug-panel-open', isExpanded);
  setDebugToggleExpandedAttribute(refs, isExpanded);

  if (persist) {
    setStorageItem(STORAGE_KEYS.debugPanelOpen, isExpanded ? 'true' : 'false');
  }

  renderDebugContext(refs, state);
}

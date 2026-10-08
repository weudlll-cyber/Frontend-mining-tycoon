/**
File: src/ui/toast.js
Purpose: Non-blocking toast notifications for the player board, announced to screen readers.
Role in system:
- main.js forwards status/error feedback here (session start, join errors, ...).
- Toasts render inside two persistent live regions in <body>:
  info/success toasts in a polite `role="status"` region, error toasts in an
  assertive `role="alert"` region. Regions exist before any message is added,
  so assistive technology picks up each new toast.
Invariants:
- Non-blocking: no backdrop, no focus change, pointer events pass through
  (LOCKED_DECISIONS §C - no blocking overlays for core gameplay).
- UI timing only; these are not gameplay control data.
Security notes:
- Message text is set with textContent only.
*/

const TOAST_VISIBLE_MS = 3000;
const TOAST_FADE_MS = 300;
const TOAST_SHOW_DELAY_MS = 10;

let _regions = null;

function createRegion(kind) {
  const region = document.createElement('div');
  region.className = `toast-region toast-region-${kind}`;
  if (kind === 'assertive') {
    region.setAttribute('role', 'alert');
    region.setAttribute('aria-live', 'assertive');
  } else {
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
  }
  document.body.appendChild(region);
  return region;
}

/** Create (or re-create after DOM teardown) the two toast live regions. */
export function ensureToastRegions() {
  if (
    !_regions ||
    !_regions.polite.isConnected ||
    !_regions.assertive.isConnected
  ) {
    _regions?.polite.remove();
    _regions?.assertive.remove();
    _regions = {
      polite: createRegion('polite'),
      assertive: createRegion('assertive'),
    };
  }
  return _regions;
}

export function showToast(message, type = 'info') {
  const regions = ensureToastRegions();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  // Errors interrupt (assertive); everything else waits its turn (polite).
  const region = type === 'error' ? regions.assertive : regions.polite;
  region.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), TOAST_SHOW_DELAY_MS);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }, TOAST_VISIBLE_MS);
  return toast;
}

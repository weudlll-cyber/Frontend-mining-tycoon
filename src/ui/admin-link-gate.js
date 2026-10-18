/**
 * File: src/ui/admin-link-gate.js
 * Purpose: Show the "+ New Game (Admin)" link on player.html only when the page
 *          was opened with ?admin=1, which keeps the player UI clean.
 * Role in system: Called once by src/main.js. It used to be an inline script in
 *          player.html; the Content-Security-Policy (deploy/nginx) allows no
 *          inline scripts.
 */

/**
 * @param {string} [search] URL query string (default: the current page's)
 * @returns {boolean} true when the link was shown
 */
export function applyAdminLinkGate(search = window.location.search) {
  const adminLink = document.getElementById('admin-setup-link');
  if (!adminLink || new URLSearchParams(search).get('admin') !== '1') {
    return false;
  }
  adminLink.style.display = 'inline-flex';
  return true;
}

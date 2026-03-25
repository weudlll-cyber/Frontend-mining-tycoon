/**
File: src/ui/badge.js
Purpose: Status badge rendering helper for connection/game/enrollment lifecycle states.
*/

/**
 * Apply a named visual status to a badge DOM element.
 * @param {HTMLElement} element
 * @param {'connected'|'running'|'reconnecting'|'waiting'|'finished'|'enrolling'|string} status
 */
export function setBadgeStatus(element, status) {
  element.className = 'badge';
  switch (status) {
    case 'connected':
    case 'running':
      element.classList.add('badge-green');
      element.textContent = status === 'connected' ? 'Connected' : 'Running';
      break;
    case 'reconnecting':
      element.classList.add('badge-yellow');
      element.textContent = 'Reconnecting';
      break;
    case 'waiting':
      element.classList.add('badge-yellow');
      element.textContent = 'Waiting for first event...';
      break;
    case 'finished':
      element.classList.add('badge-blue');
      element.textContent = 'Finished';
      break;
    default:
      element.classList.add('badge-gray');
      element.textContent = 'Idle';
  }
}

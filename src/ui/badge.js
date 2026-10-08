/**
File: src/ui/badge.js
Purpose: Status badge rendering helper for connection/game/enrollment lifecycle states.
Scheduled sync rounds: status `scheduled` reads "Scheduled — opens at HH:MM"
(local time) when the opening time is known.
*/

import {
  formatOpensAtShort,
  normalizeUnixSeconds,
} from '../utils/schedule-time.js';

/**
 * Apply a named visual status to a badge DOM element.
 * @param {HTMLElement} element
 * @param {'connected'|'running'|'reconnecting'|'waiting'|'finished'|'enrolling'|'scheduled'|string} status
 * @param {{ opensAt?: number|null }} [details] - `opensAt` (unix seconds) for `scheduled`
 */
export function setBadgeStatus(element, status, { opensAt = null } = {}) {
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
    case 'scheduled': {
      const opensAtSeconds = normalizeUnixSeconds(opensAt);
      element.classList.add('badge-yellow');
      element.textContent =
        opensAtSeconds === null
          ? 'Scheduled'
          : `Scheduled — opens at ${formatOpensAtShort(opensAtSeconds)}`;
      break;
    }
    default:
      element.classList.add('badge-gray');
      element.textContent = 'Idle';
  }
}

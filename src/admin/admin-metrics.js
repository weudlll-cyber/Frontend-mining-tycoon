/**
 * File: src/admin/admin-metrics.js
 * Purpose: Admin "Metrics" section. Shows the cross-game summary from
 *          GET /admin/metrics and per-game counters from
 *          GET /admin/games/{id}/metrics (opened from the game-management list).
 * Role in system: Read-only admin view; initialised from admin-setup.js and
 *          called by game-management.js row actions.
 * Constraints: Metrics are aggregated counters without PII; the frontend only
 *          displays them and never derives gameplay decisions from them.
 * Security notes: keys and values are rendered via textContent only; game IDs
 *          are URL-encoded.
 */

import { adminRequest } from './admin-api.js';

function el(id) {
  return document.getElementById(id);
}

function humanizeKey(key) {
  const text = String(key).replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Format one counter value for display. Nested counter maps (e.g. upgrades by
 * type) are flattened to "key: value" pairs so the panel stays one row each.
 */
export function formatCounterValue(value) {
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return 'none';
    return entries.map(([k, v]) => `${k}: ${formatCounterValue(v)}`).join(', ');
  }
  if (value === null || value === undefined) return '—';
  return String(value);
}

function renderDefinitionList(container, rows) {
  const dl = document.createElement('dl');
  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  });
  container.replaceChildren(dl);
}

function showError(message) {
  const errorEl = el('admin-metrics-error');
  errorEl.textContent = message;
  errorEl.className = message ? 'result-box error' : 'result-box';
}

export async function loadMetricsSummary() {
  const summaryEl = el('admin-metrics-summary');
  showError('');
  try {
    const summary = await adminRequest('/admin/metrics');
    const rows = [['Games total', formatCounterValue(summary?.games_total)]];
    Object.entries(summary?.games_by_status || {}).forEach(
      ([status, count]) => {
        rows.push([`Games ${status}`, formatCounterValue(count)]);
      }
    );
    renderDefinitionList(summaryEl, rows);
    summaryEl.hidden = false;
  } catch (error) {
    showError(`❌ Could not load metrics summary: ${error.message}`);
  }
}

/**
 * Load and show counters for one game. Scrolls the panel into view because
 * the trigger lives in the game list further up the admin page.
 */
export async function showGameMetrics(gameId) {
  const panelEl = el('admin-game-metrics');
  const titleEl = el('admin-game-metrics-title');
  const bodyEl = el('admin-game-metrics-body');
  if (!panelEl || !titleEl || !bodyEl) return;

  showError('');
  titleEl.textContent = `Game ${gameId} metrics`;
  bodyEl.textContent = 'Loading...';
  panelEl.hidden = false;
  panelEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

  try {
    const result = await adminRequest(
      `/admin/games/${encodeURIComponent(gameId)}/metrics`
    );
    const rows = Object.entries(result?.counters || {}).map(([key, value]) => [
      humanizeKey(key),
      formatCounterValue(value),
    ]);
    if (!rows.length) {
      bodyEl.textContent = 'No counters recorded yet.';
      return;
    }
    renderDefinitionList(bodyEl, rows);
  } catch (error) {
    bodyEl.textContent = '';
    showError(`❌ Could not load metrics for game ${gameId}: ${error.message}`);
  }
}

export function initAdminMetrics() {
  const refreshBtn = el('admin-metrics-refresh-btn');
  if (!refreshBtn) return;
  refreshBtn.addEventListener('click', loadMetricsSummary);
}

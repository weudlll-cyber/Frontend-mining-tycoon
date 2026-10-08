/**
 * File: src/admin/game-management.js
 * Purpose: Admin game list with per-row actions: Metrics (per-game counters),
 *          Reset (POST /admin/games/{id}/reset clones the game's settings into
 *          a new game) and Delete.
 * Role in system: Initialised from admin-setup.js; backend enforces admin access
 *          (admin token or administrator account session, see admin-session.js).
 * Security notes: backend values are rendered via textContent/createElement;
 *          game IDs are URL-encoded.
 */
import { adminRequest } from './admin-api.js';
import {
  buildAdminAuthHeaders,
  handleAdminAuthError,
} from './admin-session.js';
import { createApiError, readApiError } from '../utils/api-error.js';
import { showGameMetrics } from './admin-metrics.js';

function el(id) {
  return document.getElementById(id);
}

async function getBackendUrl() {
  const url = (el('admin-backend-url')?.value || '').trim();
  if (!url) {
    throw new Error('Backend URL is not set. Please enter a backend URL.');
  }
  return url;
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', ...buildAdminAuthHeaders() };
}

/**
 * Turn a failed admin response into an Error with the backend message; an
 * expired or non-admin account session is signed out locally first.
 */
async function adminResponseError(response) {
  const fallback = `${response.status} ${response.statusText}`;
  return handleAdminAuthError(
    createApiError(await readApiError(response, fallback))
  );
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m`;
}

function formatTimeRemaining(game) {
  const now = Date.now();
  let endMs = null;

  if (game.status === 'enrolling' && game.enrollment_ends_at) {
    endMs = new Date(game.enrollment_ends_at).getTime();
  } else if (
    game.status === 'running' &&
    game.run_started_at &&
    game.real_duration_seconds
  ) {
    endMs =
      new Date(game.run_started_at).getTime() +
      game.real_duration_seconds * 1000;
  }

  if (endMs === null || isNaN(endMs)) {
    return formatDuration(game.real_duration_seconds);
  }

  const remainingMs = endMs - now;
  if (remainingMs <= 0) return 'Ending soon';

  const totalSecs = Math.floor(remainingMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    const m = mins % 60;
    return `${hours}h ${m}m left`;
  }
  if (mins > 0) return `${mins}m ${secs}s left`;
  return `${secs}s left`;
}

function getStatusBadgeColor(status) {
  switch (status) {
    case 'enrolling':
      return '#fbbf24'; // amber
    case 'running':
      return '#3b82f6'; // blue
    case 'finished':
      return '#6b7280'; // gray
    default:
      return '#e5e7eb'; // light gray
  }
}

function getRoundTypeLabel(roundType) {
  const normalized = String(roundType || 'synchronous').toLowerCase();
  if (normalized === 'asynchronous' || normalized === 'async') {
    return '⏱ Async';
  }
  return '👥 Sync';
}

function createRowButton(label, background, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-row-btn';
  button.textContent = label;
  button.style.background = background;
  button.addEventListener('click', onClick);
  return button;
}

async function fetchAndDisplayGames() {
  const loadingEl = el('admin-games-loading');
  const errorEl = el('admin-games-error');
  const containerEl = el('admin-games-list-container');
  const emptyEl = el('admin-games-empty');
  const tbodyEl = el('admin-games-tbody');

  if (!loadingEl || !errorEl || !containerEl || !emptyEl || !tbodyEl) {
    return;
  }

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  containerEl.style.display = 'none';
  emptyEl.style.display = 'none';

  try {
    const baseUrl = await getBackendUrl();

    const response = await fetch(`${baseUrl}/admin/games`, {
      method: 'GET',
      headers: adminHeaders(),
    });

    if (!response.ok) {
      throw await adminResponseError(response);
    }

    const data = await response.json();
    const games = data.games || [];

    loadingEl.style.display = 'none';

    const activeGames = games.filter(
      (g) => g.status === 'running' || g.status === 'enrolling'
    );

    if (activeGames.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    tbodyEl.innerHTML = '';
    activeGames.forEach((game) => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--border)';

      const gameIdCell = document.createElement('td');
      gameIdCell.style.padding = '0.75rem';
      gameIdCell.textContent = game.game_id;
      gameIdCell.style.fontFamily = 'monospace';
      gameIdCell.style.fontWeight = '600';

      const statusCell = document.createElement('td');
      statusCell.style.padding = '0.75rem';
      const statusBadge = document.createElement('span');
      statusBadge.style.display = 'inline-block';
      statusBadge.style.padding = '0.25rem 0.75rem';
      statusBadge.style.borderRadius = '4px';
      statusBadge.style.fontSize = '0.8rem';
      statusBadge.style.fontWeight = '600';
      statusBadge.style.backgroundColor = getStatusBadgeColor(game.status);
      statusBadge.style.color =
        game.status === 'running' || game.status === 'enrolling'
          ? '#fff'
          : '#1a1a1a';
      statusBadge.textContent =
        game.status.charAt(0).toUpperCase() + game.status.slice(1);
      statusCell.appendChild(statusBadge);

      const typeCell = document.createElement('td');
      typeCell.style.padding = '0.75rem';
      typeCell.textContent = getRoundTypeLabel(
        game.round_type || 'synchronous'
      );

      const durationCell = document.createElement('td');
      durationCell.style.padding = '0.75rem';
      durationCell.textContent = formatTimeRemaining(game);

      const playersCell = document.createElement('td');
      playersCell.style.padding = '0.75rem';
      playersCell.textContent = `${game.players_count || 0} player${game.players_count !== 1 ? 's' : ''}`;

      const actionCell = document.createElement('td');
      actionCell.style.padding = '0.75rem';
      actionCell.style.textAlign = 'center';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑 Delete';
      deleteBtn.style.padding = '0.4rem 0.8rem';
      deleteBtn.style.background = 'var(--danger)';
      deleteBtn.style.color = '#fff';
      deleteBtn.style.border = 'none';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '0.8rem';
      deleteBtn.style.fontWeight = '600';
      deleteBtn.style.transition = 'background 0.15s';
      deleteBtn.onmouseenter = () => {
        deleteBtn.style.background = '#dc2626';
      };
      deleteBtn.onmouseleave = () => {
        deleteBtn.style.background = 'var(--danger)';
      };
      deleteBtn.onclick = () => deleteGame(game.game_id, deleteBtn);

      const metricsBtn = createRowButton('📊 Metrics', 'var(--primary)', () =>
        showGameMetrics(game.game_id)
      );
      const resetBtn = createRowButton('♻ Reset', '#d97706', () =>
        resetGame(game.game_id, resetBtn)
      );

      actionCell.appendChild(metricsBtn);
      actionCell.appendChild(resetBtn);
      actionCell.appendChild(deleteBtn);

      row.appendChild(gameIdCell);
      row.appendChild(statusCell);
      row.appendChild(typeCell);
      row.appendChild(durationCell);
      row.appendChild(playersCell);
      row.appendChild(actionCell);

      tbodyEl.appendChild(row);
    });

    containerEl.style.display = 'block';
  } catch (error) {
    console.error('Error fetching games:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `❌ Error loading games: ${error.message}`;
  }
}

async function deleteGame(gameId, buttonEl) {
  if (
    !confirm(
      `Are you sure you want to delete game ${gameId}? This cannot be undone.`
    )
  ) {
    return;
  }

  const resultEl = el('admin-delete-result');
  if (!resultEl) return;
  resultEl.style.display = 'none';

  try {
    buttonEl.disabled = true;
    buttonEl.textContent = '⏳ Deleting...';

    const baseUrl = await getBackendUrl();

    const response = await fetch(
      `${baseUrl}/admin/games/${encodeURIComponent(gameId)}`,
      {
        method: 'DELETE',
        headers: adminHeaders(),
      }
    );
    if (!response.ok) {
      throw await adminResponseError(response);
    }

    await response.json();

    resultEl.className = 'result-box success';
    resultEl.textContent = `✅ Game ${gameId} deleted successfully.`;
    resultEl.style.display = 'block';

    setTimeout(fetchAndDisplayGames, 800);
  } catch (error) {
    console.error('[DELETE] Catch block error:', error.message, error.stack);
    buttonEl.disabled = false;
    buttonEl.textContent = '🗑 Delete';
    resultEl.className = 'result-box error';
    resultEl.textContent = `❌ Failed to delete game: ${error.message}.`;
    resultEl.style.display = 'block';
  }
}

/**
 * Reset = clone: the backend creates a NEW game from the source game's
 * settings snapshot (fresh seed). The source game itself is left unchanged.
 * Uses the same confirm step as delete.
 */
export async function resetGame(gameId, buttonEl) {
  if (
    !confirm(
      `Reset game ${gameId}? This creates a new game with the same settings. Game ${gameId} itself is not changed.`
    )
  ) {
    return;
  }

  const resultEl = el('admin-delete-result');
  if (!resultEl) return;
  resultEl.style.display = 'none';
  buttonEl.disabled = true;
  buttonEl.textContent = '⏳ Resetting...';

  try {
    const result = await adminRequest(
      `/admin/games/${encodeURIComponent(gameId)}/reset`,
      { method: 'POST' }
    );
    resultEl.className = 'result-box success';
    resultEl.replaceChildren();
    const intro = document.createElement('div');
    intro.textContent = `✅ Game ${gameId} was reset. New game ID:`;
    const idEl = document.createElement('div');
    idEl.className = 'game-id-display';
    idEl.textContent = String(result?.new_game_id ?? '?');
    resultEl.append(intro, idEl);
    resultEl.style.display = 'block';

    setTimeout(fetchAndDisplayGames, 800);
  } catch (error) {
    resultEl.className = 'result-box error';
    resultEl.textContent = `❌ Failed to reset game: ${error.message}`;
    resultEl.style.display = 'block';
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = '♻ Reset';
  }
}

/** Reload the game list (e.g. after an administrator signed in). */
export async function refreshGameList() {
  await fetchAndDisplayGames();
}

export function initGameManagement() {
  const refreshBtn = el('admin-refresh-games-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchAndDisplayGames);
  }
  fetchAndDisplayGames();
}

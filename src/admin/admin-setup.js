/**
 * File: src/admin/admin-setup.js
 * Purpose: Admin-only round creation UI. Populates form controls from
 *          control-data constants, handles live previews, and submits
 *          POST /games with an optional X-Admin-Token header.
 *
 * No runtime dependencies on main.js or setup-shell.js; standalone module.
 */

import {
  ROUND_DURATION_PRESETS,
  ASYNC_ROUND_PRESET_IDS,
  ASYNC_ROUND_DEFAULT_PRESET,
  ASYNC_SESSION_PRESET_IDS,
  ASYNC_SESSION_DEFAULT_PRESET,
  ENROLLMENT_WINDOW_LIMITS,
  ENROLLMENT_WINDOW_DEFAULT_SECONDS,
  SCORING_CONTROL,
  TRADE_COUNT_LIMITS,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from '../config/index.js';
import { initGameManagement } from './game-management.js';

// ── Label maps ───────────────────────────────────────────────────────────────

const SCORING_LABELS = {
  stockpile_total_tokens: 'Stockpile — highest total token count wins.',
  power_oracle_weighted: 'Power — highest oracle-weighted score wins.',
  mining_time_equivalent:
    'Mining Time Equivalent — highest equivalent mining time wins.',
  efficiency_system_mastery:
    'Efficiency — best improvement from baseline wins.',
};

// Short-alias → canonical mode value accepted by backend
const SCORING_ALIAS_MAP = SCORING_CONTROL.CANONICAL_MODES;

// Default sync preset for manual testing
const SYNC_DEFAULT_PRESET = '5m';

// ── DOM helpers ──────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

function buildOption(value, label, isDefault) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  if (isDefault) opt.selected = true;
  return opt;
}

// ── Populate selects from control data ──────────────────────────────────────

function populateDurationPreset() {
  const select = el('admin-duration-preset');
  for (const [key] of Object.entries(ROUND_DURATION_PRESETS)) {
    // Skip async-only preset '3h' from sync dropdown
    if (key === '3h') continue;
    select.appendChild(
      buildOption(key, _presetLabel(key), key === SYNC_DEFAULT_PRESET)
    );
  }
  select.appendChild(buildOption('custom', 'Custom…', false));
}

function populateAsyncDurationPreset() {
  const select = el('admin-async-duration-preset');
  for (const key of ASYNC_ROUND_PRESET_IDS) {
    select.appendChild(
      buildOption(key, _presetLabel(key), key === ASYNC_ROUND_DEFAULT_PRESET)
    );
  }
}

function populateAsyncSessionPreset() {
  const select = el('admin-async-session-preset');
  for (const key of ASYNC_SESSION_PRESET_IDS) {
    select.appendChild(
      buildOption(key, _presetLabel(key), key === ASYNC_SESSION_DEFAULT_PRESET)
    );
  }
}

function populateScoringModes() {
  const group = el('admin-scoring-mode-group');
  let first = true;
  for (const [alias, canonical] of Object.entries(SCORING_ALIAS_MAP)) {
    const label = document.createElement('label');
    label.className = 'radio-option';

    const radioId = `admin-scoring-${alias}`;
    label.setAttribute('for', radioId);

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'admin-scoring-mode';
    input.id = radioId;
    input.value = canonical;
    if (first) {
      input.checked = true;
      first = false;
    }
    input.addEventListener('change', updateReview);

    const span = document.createElement('span');
    span.textContent = SCORING_LABELS[canonical] ?? canonical;

    label.appendChild(input);
    label.appendChild(span);
    group.appendChild(label);
  }
}

// ── Preset label helper ──────────────────────────────────────────────────────

function _presetLabel(key) {
  const seconds = ROUND_DURATION_PRESETS[key];
  if (seconds < 3600) return `${seconds / 60}m`;
  if (seconds < 86400) return `${seconds / 3600}h`;
  if (seconds < 604800) return `${seconds / 86400}d`;
  return `${seconds / 86400}d`;
}

// ── Duration resolution ──────────────────────────────────────────────────────

function resolveCurrentDurationSeconds() {
  const roundType = _getSelectedRoundType();
  if (roundType === 'async') {
    const preset = el('admin-async-duration-preset').value;
    return ROUND_DURATION_PRESETS[preset] ?? 0;
  }

  const preset = el('admin-duration-preset').value;
  if (preset === 'custom') {
    const rawValue = Number(el('admin-duration-custom-value').value);
    const unit = el('admin-duration-custom-unit').value;
    const multipliers = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
    return Math.round(rawValue * (multipliers[unit] ?? 1));
  }
  return ROUND_DURATION_PRESETS[preset] ?? 0;
}

function resolveAsyncSessionSeconds() {
  const preset = el('admin-async-session-preset').value;
  return ROUND_DURATION_PRESETS[preset] ?? 0;
}

// ── Trade schedule preview ───────────────────────────────────────────────────

function updateTradePreview() {
  const durationSeconds = resolveCurrentDurationSeconds();
  const rawCount = Number(el('admin-trade-count').value);
  const tradeCount = Math.max(
    TRADE_COUNT_LIMITS.min,
    Math.min(TRADE_COUNT_LIMITS.max, Math.round(rawCount) || 0)
  );

  const noteEl = el('admin-trade-count-note');
  const previewEl = el('admin-trade-schedule-preview');

  if (tradeCount === 0) {
    noteEl.textContent = 'Trading disabled for this round.';
    previewEl.textContent = 'No trades configured.';
    return;
  }

  const offsets = computeTradeUnlockOffsetsSeconds(durationSeconds, tradeCount);
  if (!offsets.length) {
    noteEl.textContent = '';
    previewEl.textContent =
      'Set a valid round duration to preview trade schedule.';
    return;
  }

  noteEl.textContent = `${tradeCount} trade${tradeCount !== 1 ? 's' : ''} scheduled.`;
  const lines = offsets.map((offset, i) => {
    const mins = Math.floor(offset / 60);
    const secs = offset % 60;
    const timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    return `Trade ${i + 1}: unlocks at ${timeStr} (offset ${offset}s)`;
  });
  previewEl.textContent = lines.join('\n');
}

// ── Default trade count auto-sync ────────────────────────────────────────────

function syncDefaultTradeCount() {
  const durationSeconds = resolveCurrentDurationSeconds();
  const defaultCount = getDefaultTradeCount(durationSeconds);
  const input = el('admin-trade-count');
  input.value = String(defaultCount);
  updateTradePreview();
}

// ── Round type visibility ────────────────────────────────────────────────────

function _getSelectedRoundType() {
  const syncRadio = el('admin-round-type-sync');
  return syncRadio && syncRadio.checked ? 'sync' : 'async';
}

function applyRoundTypeVisibility() {
  const isAsync = _getSelectedRoundType() === 'async';
  el('admin-sync-fields').classList.toggle('hidden-section', isAsync);
  el('admin-async-fields').classList.toggle('hidden-section', !isAsync);
  syncDefaultTradeCount();
  updateReview();
}

// ── Scoring mode helper ──────────────────────────────────────────────────────

function _getSelectedScoringMode() {
  const checked = document.querySelector(
    'input[name="admin-scoring-mode"]:checked'
  );
  return checked ? checked.value : SCORING_CONTROL.DEFAULT_MODE;
}

function toBackendScoringMode(selectedValue) {
  // UI radios currently use canonical labels; backend contract expects short aliases.
  for (const [alias, canonical] of Object.entries(SCORING_ALIAS_MAP)) {
    if (canonical === selectedValue) return alias;
  }
  return selectedValue;
}

function formatApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        const loc = Array.isArray(item?.loc) ? item.loc.join('.') : 'field';
        const msg = item?.msg ?? JSON.stringify(item);
        return `${loc}: ${msg}`;
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message ?? JSON.stringify(detail);
  }
  return String(detail);
}

// ── Enrollment window helper ─────────────────────────────────────────────────

function _getEnrollmentWindow() {
  const raw = Number(el('admin-enrollment-window').value);
  return Math.max(
    ENROLLMENT_WINDOW_LIMITS.min,
    Math.min(
      ENROLLMENT_WINDOW_LIMITS.max,
      Math.round(raw) || ENROLLMENT_WINDOW_DEFAULT_SECONDS
    )
  );
}

// ── Review panel ─────────────────────────────────────────────────────────────

function _scoringLabel(canonical) {
  return (
    Object.keys(SCORING_ALIAS_MAP).find(
      (a) => SCORING_ALIAS_MAP[a] === canonical
    ) ?? canonical
  );
}

export function buildReviewSummary() {
  const roundType = _getSelectedRoundType();
  const durationSeconds = resolveCurrentDurationSeconds();
  const rawCount = Number(el('admin-trade-count').value);
  const tradeCount = Math.max(
    TRADE_COUNT_LIMITS.min,
    Math.min(TRADE_COUNT_LIMITS.max, Math.round(rawCount) || 0)
  );

  const rows = [];

  rows.push(['Round type', roundType === 'async' ? 'Async (host)' : 'Sync']);
  rows.push(['Scoring mode', _scoringLabel(_getSelectedScoringMode())]);
  rows.push(['Duration', _formatSeconds(durationSeconds)]);

  if (roundType === 'sync') {
    rows.push(['Enrollment window', `${_getEnrollmentWindow()}s`]);
  } else {
    const sessionSeconds = resolveAsyncSessionSeconds();
    rows.push(['Session duration', _formatSeconds(sessionSeconds)]);
  }

  rows.push(['Trade count', String(tradeCount)]);

  return rows;
}

function _formatSeconds(s) {
  if (!s || s <= 0) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${s / 3600}h`;
  return `${s / 86400}d`;
}

function updateReview() {
  const dl = el('admin-review-dl');
  dl.innerHTML = '';
  const rows = buildReviewSummary();
  for (const [key, val] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = val;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  updateTradePreview();
}

// ── Payload builder (exported for tests) ─────────────────────────────────────

export function buildGamePayload() {
  const roundType = _getSelectedRoundType();
  const durationSeconds = resolveCurrentDurationSeconds();
  const rawCount = Number(el('admin-trade-count').value);
  const tradeCount = Math.max(
    TRADE_COUNT_LIMITS.min,
    Math.min(TRADE_COUNT_LIMITS.max, Math.round(rawCount) || 0)
  );
  const tradeUnlockOffsets = computeTradeUnlockOffsetsSeconds(
    durationSeconds,
    tradeCount
  );
  const scoringMode = toBackendScoringMode(_getSelectedScoringMode());

  const preset =
    roundType === 'async'
      ? el('admin-async-duration-preset').value
      : el('admin-duration-preset').value;

  const isCustom = preset === 'custom';

  const payload = {
    scoring_mode: scoringMode,
    trade_count: tradeCount,
    trade_unlock_offsets_seconds: tradeUnlockOffsets,
  };

  if (roundType === 'async') {
    payload.round_type = 'asynchronous';
    payload.enrollment_window_seconds = 0;
    payload.duration_mode = 'preset';
    payload.duration_preset = preset;
    payload.session_duration_seconds = resolveAsyncSessionSeconds();
  } else {
    payload.enrollment_window_seconds = _getEnrollmentWindow();
    if (isCustom) {
      payload.duration_mode = 'custom';
      payload.duration_custom_seconds = durationSeconds;
    } else {
      payload.duration_mode = 'preset';
      payload.duration_preset = preset;
    }
  }

  // Advanced overrides — only include non-blank fields
  const anchorToken = el('admin-anchor-token').value;
  const anchorRate = el('admin-anchor-rate').value;
  const seasonCycles = el('admin-season-cycles').value;
  if (anchorToken) payload.anchor_token = anchorToken;
  if (anchorRate && Number(anchorRate) > 0)
    payload.anchor_rate = Number(anchorRate);
  if (seasonCycles && Number(seasonCycles) >= 1)
    payload.season_cycles = Number(seasonCycles);

  return payload;
}

// ── Create round ─────────────────────────────────────────────────────────────

async function createRound() {
  const resultBox = el('admin-result-box');
  const createBtn = el('admin-create-btn');

  resultBox.className = 'result-box';
  resultBox.innerHTML = '';
  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';

  try {
    const baseUrl = (el('admin-backend-url').value || '')
      .trim()
      .replace(/\/$/, '');
    if (!baseUrl || !/^https?:\/\/.+/.test(baseUrl)) {
      throw new Error(
        'Invalid backend URL. Use http://host:port or https://host:port.'
      );
    }

    const adminToken = (el('admin-token').value || '').trim();

    const payload = buildGamePayload();

    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
    }

    const response = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        if (body.detail) detail = formatApiDetail(body.detail);
      } catch {
        // ignore JSON parse error
      }
      if (response.status === 403) {
        throw new Error(
          `Admin permission required to create rounds. ${detail}`
        );
      }
      throw new Error(`Game creation failed: ${detail}`);
    }

    const data = await response.json();
    const gameId = data.game_id;
    if (!gameId) throw new Error('Server did not return a game_id.');

    const joinUrl = `${window.location.origin}${window.location.pathname.replace('admin.html', 'index.html')}`;
    resultBox.className = 'result-box success';
    resultBox.innerHTML = `
      <div>✅ Round created successfully.</div>
      <div class="game-id-display" id="new-game-id-display">Game ID: ${gameId}</div>
      <div>Share the Game ID with players. They join at:</div>
      <a class="join-link" href="${joinUrl}" target="_blank">${joinUrl}</a>
    `;
  } catch (err) {
    resultBox.className = 'result-box error';
    resultBox.textContent = `❌ ${err.message}`;
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Round';
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

function init() {
  populateDurationPreset();
  populateAsyncDurationPreset();
  populateAsyncSessionPreset();
  populateScoringModes();

  // Enrollment window defaults
  el('admin-enrollment-window').min = String(ENROLLMENT_WINDOW_LIMITS.min);
  el('admin-enrollment-window').max = String(ENROLLMENT_WINDOW_LIMITS.max);
  el('admin-enrollment-window').value = String(
    ENROLLMENT_WINDOW_DEFAULT_SECONDS
  );

  // Trade count limits from control data
  el('admin-trade-count').min = String(TRADE_COUNT_LIMITS.min);
  el('admin-trade-count').max = String(TRADE_COUNT_LIMITS.max);

  // Event listeners
  el('admin-round-type-sync').addEventListener(
    'change',
    applyRoundTypeVisibility
  );
  el('admin-round-type-async').addEventListener(
    'change',
    applyRoundTypeVisibility
  );

  el('admin-sync-fields').addEventListener('change', () => {
    const preset = el('admin-duration-preset').value;
    el('admin-duration-custom-row').style.display =
      preset === 'custom' ? '' : 'none';
    syncDefaultTradeCount();
    updateReview();
  });

  el('admin-async-fields').addEventListener('change', () => {
    // Clamp session to not exceed round duration
    const roundSecs = resolveCurrentDurationSeconds();
    const sessionSecs = resolveAsyncSessionSeconds();
    if (sessionSecs > roundSecs) {
      const sessionSelect = el('admin-async-session-preset');
      // Pick largest session preset that fits
      for (let i = sessionSelect.options.length - 1; i >= 0; i--) {
        const optSecs =
          ROUND_DURATION_PRESETS[sessionSelect.options[i].value] ?? 0;
        if (optSecs <= roundSecs) {
          sessionSelect.selectedIndex = i;
          break;
        }
      }
    }
    syncDefaultTradeCount();
    updateReview();
  });

  el('admin-enrollment-window').addEventListener('input', updateReview);

  el('admin-trade-count').addEventListener('input', () => {
    updateTradePreview();
    updateReview();
  });

  el('admin-create-btn').addEventListener('click', createRound);

  // Initial state
  syncDefaultTradeCount();
  updateReview();
  initGameManagement();
}

document.addEventListener('DOMContentLoaded', init);

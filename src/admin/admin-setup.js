/**
 * File: src/admin/admin-setup.js
 * Purpose: Admin-only round creation UI. Populates form controls from the
 *          effective game config (backend GET /meta `game_config`, falling
 *          back to the src/config constants), handles live previews, and
 *          submits POST /games with an optional X-Admin-Token header.
 *          Re-renders the form when /meta loads or the admin saves new
 *          Game Settings (section 11).
 *
 * No runtime dependencies on main.js or setup-shell.js; standalone module.
 * Security notes: backend values (game_id) and derived URLs are rendered via
 * textContent/createElement only — never innerHTML.
 */

import {
  SCORING_CONTROL,
  getEffectiveGameConfig,
  getActiveGameConfigDocument,
  getPresetSeconds,
  isAsyncRoundType,
  clampTradeCount,
  clampEnrollmentWindowSeconds,
  getDefaultTradeCount,
  computeTradeUnlockOffsetsSeconds,
} from '../config/index.js';
import { fetchMetaSnapshot } from '../meta/meta-manager.js';
import { initGameManagement } from './game-management.js';
import { initEconomySettings } from './economy-settings.js';
import { initAdminMetrics } from './admin-metrics.js';
import { initGameConfigSettings } from './game-config-settings.js';
import { collectAdvancedOverridesFromInputs } from '../ui/setup-payload.js';
import { fillPresetSelect } from '../ui/async-duration.js';
import { DEFAULT_BACKEND_URL } from '../config/backend-url.js';
import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
} from '../utils/storage-utils.js';

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

// ── DOM helpers ──────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

// ── Populate the form from the effective game config ───────────────────────

/**
 * (Re)build the create-form options, limits and defaults from the effective
 * game config. Defaults (round type, presets, scoring mode, enrollment window)
 * are applied every time: this runs on page load, after /meta arrives and
 * after the admin saves new Game Settings, i.e. whenever the defaults change.
 */
export function applyGameConfigToForm() {
  const config = getEffectiveGameConfig();
  const { defaults } = config;
  const keep = { keepCurrent: false };

  fillPresetSelect(
    el('admin-duration-preset'),
    config.sync_round_preset_ids,
    defaults.sync_round_preset,
    { ...keep, customOption: true }
  );
  fillPresetSelect(
    el('admin-async-duration-preset'),
    config.async_round_preset_ids,
    defaults.async_round_preset,
    keep
  );
  fillPresetSelect(
    el('admin-async-session-preset'),
    config.async_session_preset_ids,
    defaults.async_session_preset,
    keep
  );

  const isAsync = isAsyncRoundType(defaults.round_type);
  el('admin-round-type-sync').checked = !isAsync;
  el('admin-round-type-async').checked = isAsync;

  const scoringRadio = el(`admin-scoring-${defaults.scoring_mode}`);
  if (scoringRadio) scoringRadio.checked = true;

  const enrollment = el('admin-enrollment-window');
  enrollment.min = String(config.enrollment_window_limits.min_seconds);
  enrollment.max = String(config.enrollment_window_limits.max_seconds);
  enrollment.value = String(clampEnrollmentWindowSeconds(0, config));

  const customValue = el('admin-duration-custom-value');
  customValue.min = String(config.duration_limits.min_seconds);
  customValue.max = String(config.duration_limits.max_seconds);

  el('admin-trade-count').min = String(config.trade_count_limits.min);
  el('admin-trade-count').max = String(config.trade_count_limits.max);

  renderConfigSource();
  applyRoundTypeVisibility();
}

function renderConfigSource() {
  const sourceEl = el('admin-game-config-source');
  if (!sourceEl) return;
  const doc = getActiveGameConfigDocument();
  const hash = String(doc?.config_hash || '').slice(0, 12);
  sourceEl.textContent = doc
    ? `Options and defaults: backend Game Settings v${doc.version ?? '?'} (${hash || 'no hash'}).`
    : 'Options and defaults: built-in fallback (backend sent no game config).';
}

/**
 * Fetch GET /meta (public) and re-render the form with its game_config.
 * Failures keep the current (fallback) form; meta-manager logs them.
 */
export async function refreshGameConfigFromMeta() {
  const baseUrl = String(el('admin-backend-url').value || '').trim();
  if (!/^https?:\/\/.+/.test(baseUrl)) return;
  await fetchMetaSnapshot(baseUrl, null, { force: true });
  applyGameConfigToForm();
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

// ── Duration resolution ──────────────────────────────────────────────────────

function resolveCurrentDurationSeconds() {
  const roundType = _getSelectedRoundType();
  if (roundType === 'async') {
    const preset = el('admin-async-duration-preset').value;
    return getPresetSeconds(preset) ?? 0;
  }

  const preset = el('admin-duration-preset').value;
  if (preset === 'custom') {
    const rawValue = Number(el('admin-duration-custom-value').value);
    const unit = el('admin-duration-custom-unit').value;
    const multipliers = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
    return Math.round(rawValue * (multipliers[unit] ?? 1));
  }
  return getPresetSeconds(preset) ?? 0;
}

function resolveAsyncSessionSeconds() {
  const preset = el('admin-async-session-preset').value;
  return getPresetSeconds(preset) ?? 0;
}

/**
 * Time window that trade defaults and unlock offsets are based on.
 * Async rounds: offsets count from each player's session start and the backend
 * rejects offsets >= session duration, so the session length is the window.
 * Sync rounds: the round duration.
 */
export function resolveTradeWindowSeconds() {
  return _getSelectedRoundType() === 'async'
    ? resolveAsyncSessionSeconds()
    : resolveCurrentDurationSeconds();
}

// ── Trade schedule preview ───────────────────────────────────────────────────

function updateTradePreview() {
  const durationSeconds = resolveTradeWindowSeconds();
  const tradeCount = clampTradeCount(el('admin-trade-count').value);

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

  const perSession = _getSelectedRoundType() === 'async' ? ' per session' : '';
  noteEl.textContent = `${tradeCount} trade${tradeCount !== 1 ? 's' : ''} scheduled${perSession}.`;
  const lines = offsets.map((offset, i) => {
    const mins = Math.floor(offset / 60);
    const secs = offset % 60;
    const timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    return `Trade ${i + 1}: unlocks at ${timeStr} (offset ${offset}s)`;
  });
  previewEl.textContent = lines.join('\n');
}

// ── Default trade count auto-sync ────────────────────────────────────────────

export function syncDefaultTradeCount() {
  const durationSeconds = resolveTradeWindowSeconds();
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
  return clampEnrollmentWindowSeconds(el('admin-enrollment-window').value);
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
  const tradeCount = clampTradeCount(el('admin-trade-count').value);

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

export function updateReview() {
  const dl = el('admin-review-dl');
  dl.replaceChildren();
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
  const tradeCount = clampTradeCount(el('admin-trade-count').value);
  const tradeUnlockOffsets = computeTradeUnlockOffsetsSeconds(
    resolveTradeWindowSeconds(),
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

  // Advanced overrides — only non-blank fields, using the backend contract
  // names (emission_anchor_token, emission_anchor_tokens_per_second,
  // season_cycles_per_game). The admin section is always visible, so the
  // shared helper is called with an always-checked toggle.
  Object.assign(
    payload,
    collectAdvancedOverridesFromInputs({
      showAdvancedCheckbox: { checked: true },
      anchorTokenInput: el('admin-anchor-token'),
      anchorRateInput: el('admin-anchor-rate'),
      seasonCyclesInput: el('admin-season-cycles'),
    })
  );

  return payload;
}

// ── Create round ─────────────────────────────────────────────────────────────

/**
 * Render the "round created" result with safe DOM APIs only.
 * gameId comes from the backend response and joinUrl from window.location,
 * so neither may be interpolated into HTML.
 */
export function renderCreateSuccess(resultBox, { gameId, joinUrl }) {
  resultBox.className = 'result-box success';

  const okLine = document.createElement('div');
  okLine.textContent = '✅ Round created successfully.';

  const idLine = document.createElement('div');
  idLine.className = 'game-id-display';
  idLine.id = 'new-game-id-display';
  idLine.textContent = `Game ID: ${String(gameId)}`;

  const shareLine = document.createElement('div');
  shareLine.textContent = 'Share the Game ID with players. They join at:';

  const link = document.createElement('a');
  link.className = 'join-link';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = joinUrl;
  // Only allow http(s) links; anything else stays as plain text.
  if (/^https?:\/\//i.test(String(joinUrl))) {
    link.href = joinUrl;
  }

  resultBox.replaceChildren(okLine, idLine, shareLine, link);
}

export function initBackendUrlField() {
  const input = el('admin-backend-url');
  if (!input) return;
  const stored = String(getStorageItem(STORAGE_KEYS.baseUrl) || '').trim();
  if (!String(input.value || '').trim()) {
    input.value = stored || DEFAULT_BACKEND_URL;
  }
  input.addEventListener('change', () => {
    const value = String(input.value || '').trim();
    if (/^https?:\/\/.+/.test(value)) {
      setStorageItem(STORAGE_KEYS.baseUrl, value.replace(/\/+$/, ''));
    }
  });
}

export async function createRound() {
  const resultBox = el('admin-result-box');
  const createBtn = el('admin-create-btn');

  resultBox.className = 'result-box';
  resultBox.replaceChildren();
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
    renderCreateSuccess(resultBox, { gameId, joinUrl });
  } catch (err) {
    resultBox.className = 'result-box error';
    resultBox.textContent = `❌ ${err.message}`;
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Round';
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

export function init() {
  initBackendUrlField();
  populateScoringModes();

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
        const optSecs = getPresetSeconds(sessionSelect.options[i].value) ?? 0;
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

  // Initial state: fallback config first, then the backend game_config from
  // /meta (re-fetched when the backend URL changes).
  applyGameConfigToForm();
  initGameManagement();
  initEconomySettings();
  initAdminMetrics();
  initGameConfigSettings({ onSaved: applyGameConfigToForm });
  el('admin-backend-url').addEventListener('change', () => {
    void refreshGameConfigFromMeta();
  });
  void refreshGameConfigFromMeta();
}

document.addEventListener('DOMContentLoaded', init);

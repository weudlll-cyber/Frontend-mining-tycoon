/**
File: src/ui/farming-panel.js
Purpose: Farm tab of the live tools window (Farming Stage 1, passive farming)
  and the Farming status pill in the action bar.
Role in system:
- Upstream: round meta `farming` (rules) and the board state `farming` block
  (rules + positions per token), resolved by farming-state.js; the play-window
  gate from action-availability.js (via main.js).
- Downstream: deposit / withdraw intents through the injected `depositFarm`
  and `withdrawFarm` callbacks (src/services/game-actions.js); main.js merges
  the returned `updated_state` into the board and re-renders this panel.
Constraints:
- Display/intent only: rewards, cycles and countdowns are backend values. The
  next-reward countdown only ticks down locally between SSE updates, like the
  other board timers, and is re-based on every payload.
- The tab stays visible with explicit status text when farming is off
  (LOCKED_DECISIONS §C); no overlays, everything lives inside the non-modal
  live tools window (§D).
- The DOM is built once per token list and then updated in place, so typing
  in an amount field is never interrupted by live updates.
Security notes: safe DOM only (createElement / textContent); backend error
  messages are shown via the toast as plain text.
*/

import {
  formatFarmDuration,
  formatRewardPercent,
  getFarmPosition,
  normalizeFarming,
  resolveFarmTokens,
  resolveRawFarming,
} from './farming-state.js';
import { asNumber, formatTokenUnits } from './trading-panel-formatters.js';
import { formatTokenName } from '../utils/value-utils.js';

export const FARMING_DISABLED_TEXT = 'Farming is not enabled for this round.';
const FARMING_ENABLED_TEXT = 'Farming is enabled for this round.';

// Short rule summary shown in the tab (mirrors the backend Stage 1 rules).
const FARMING_RULES = Object.freeze([
  'Rewards are added after each full cycle and compound.',
  "A deposit restarts that token's cycle timer.",
  'Withdrawing before a cycle completes earns nothing for that cycle.',
  'Farmed tokens cannot be spent until withdrawn.',
  'Farmed tokens still count toward Stockpile, Power and Mining Time scores.',
]);

const ACTION_LABELS = Object.freeze({
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  'withdraw-all': 'Withdraw all',
});

/**
 * Whether a farm action button is usable right now, with the reason shown as
 * its tooltip. Pure; the backend still validates every request.
 * @param {{ action: 'deposit'|'withdraw'|'withdraw-all', farming: object,
 *   availability?: object|null, amountText?: string, balance?: number,
 *   farmed?: number, isSubmitting?: boolean }} input
 * @returns {{ enabled: boolean, reason: string }}
 */
export function resolveFarmActionState({
  action,
  farming,
  availability = null,
  amountText = '',
  balance = 0,
  farmed = 0,
  isSubmitting = false,
}) {
  if (isSubmitting) {
    return { enabled: false, reason: 'Farm action is being submitted.' };
  }
  if (!farming?.enabled) {
    return { enabled: false, reason: FARMING_DISABLED_TEXT };
  }
  // Play-window gate (enrolling/finished round, async without a session);
  // backend 409 ACTION_NOT_ALLOWED_* remains authoritative.
  if (availability && !availability.allowed) {
    return {
      enabled: false,
      reason: availability.farmReason || availability.reason,
    };
  }
  if (action === 'withdraw-all') {
    return farmed > 0
      ? {
          enabled: true,
          reason:
            'Withdraw everything farmed for this token. An unfinished cycle earns nothing.',
        }
      : { enabled: false, reason: 'Nothing is farmed for this token.' };
  }

  const text = String(amountText ?? '').trim();
  const amount = text ? asNumber(text) : null;
  if (amount === null || amount <= 0) {
    return { enabled: false, reason: 'Enter an amount greater than 0.' };
  }
  if (action === 'deposit') {
    return amount > balance
      ? { enabled: false, reason: 'Amount exceeds your available balance.' }
      : {
          enabled: true,
          reason:
            "Deposit into farming. This restarts the token's cycle timer.",
        };
  }
  return amount > farmed
    ? { enabled: false, reason: 'Amount exceeds your farmed amount.' }
    : {
        enabled: true,
        reason:
          'Withdraw from farming. An unfinished cycle earns nothing for that cycle.',
      };
}

/** Countdown text for a position, `elapsed` seconds after the payload. */
export function formatNextReward(position, elapsedSeconds = 0) {
  if (!position || position.amount <= 0) return '—';
  if (position.next_reward_in_seconds === null) return '—';
  const remaining = Math.max(
    0,
    position.next_reward_in_seconds - Math.max(0, elapsedSeconds)
  );
  return remaining > 0 ? formatFarmDuration(remaining) : 'Due now';
}

/** Rule summary line, e.g. "Reward: 5% per completed 5m cycle." */
export function formatFarmingRuleSummary(farming) {
  const reward = formatRewardPercent(farming?.reward_rate);
  const cycle = formatFarmDuration(farming?.min_duration_seconds);
  const summary = `Reward: ${reward} of the farmed amount per completed ${cycle} cycle (minimum duration).`;
  if (!hasFavoredBonus(farming)) return summary;
  return `${summary} A cycle that completes while its token is the favored season earns ${formatMultiplier(farming.favored_multiplier)}; the favored season rotates with the oracle prices.`;
}

/** Action-bar pill text for the farming status. */
export function formatFarmingPillText(farming) {
  if (!farming?.enabled) return 'Not enabled';
  const parts = [];
  if (farming.reward_rate !== null) {
    parts.push(formatRewardPercent(farming.reward_rate));
  }
  if (farming.min_duration_seconds !== null) {
    parts.push(formatFarmDuration(farming.min_duration_seconds));
  }
  if (hasFavoredBonus(farming)) {
    parts.push(`favored ${formatMultiplier(farming.favored_multiplier)}`);
  }
  return parts.length ? `Enabled (${parts.join(' / ')})` : 'Enabled';
}

function hasFavoredBonus(farming) {
  return Number(farming?.favored_multiplier) > 1;
}

function formatMultiplier(value) {
  return `×${Number(Number(value).toFixed(2))}`;
}

/**
 * Stage 2 line, e.g. "Favored now: Summer earns ×2 per cycle · changes in 42s".
 * Empty when the round has no favored-season bonus or the server sent no token.
 */
export function formatFavoredLine(farming, elapsedSeconds = 0) {
  if (!hasFavoredBonus(farming) || !farming.favored_token) return '';
  const name = formatTokenName(farming.favored_token);
  const base = `Favored now: ${name} earns ${formatMultiplier(farming.favored_multiplier)} per cycle`;
  if (farming.favored_changes_in_seconds === null) return base;
  const remaining = Math.max(
    0,
    farming.favored_changes_in_seconds - Math.max(0, elapsedSeconds)
  );
  return remaining > 0
    ? `${base} · changes in ${formatFarmDuration(remaining)}`
    : `${base} · changing now`;
}

function createEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createStat(label) {
  const wrapper = createEl('span', 'farming-stat');
  wrapper.appendChild(createEl('span', 'farming-stat-label', label));
  const value = createEl('span', 'farming-stat-value', '--');
  wrapper.appendChild(value);
  return { wrapper, value };
}

function createActionButton(token, action) {
  const button = createEl(
    'button',
    action === 'deposit'
      ? 'btn-primary farming-btn'
      : 'btn-secondary farming-btn',
    ACTION_LABELS[action]
  );
  button.type = 'button';
  button.dataset.farmAction = action;
  button.dataset.token = token;
  button.disabled = true;
  return button;
}

function buildTokenRow(token) {
  const row = createEl('div', 'farming-row');
  row.dataset.token = token;

  const head = createEl('div', 'farming-row-head');
  head.appendChild(createEl('strong', 'farming-token', formatTokenName(token)));
  const favoredBadge = createEl('span', 'farming-favored-badge');
  favoredBadge.hidden = true;
  head.appendChild(favoredBadge);
  const balance = createStat('Balance');
  const farmed = createStat('Farmed');
  const cycles = createStat('Cycles');
  const next = createStat('Next reward');
  head.append(balance.wrapper, farmed.wrapper, cycles.wrapper, next.wrapper);

  const actions = createEl('div', 'farming-row-actions');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = 'any';
  input.placeholder = 'Amount';
  input.className = 'farming-amount';
  input.dataset.field = 'farm-amount';
  input.dataset.token = token;
  input.setAttribute('aria-label', `${formatTokenName(token)} farm amount`);
  const buttons = {
    deposit: createActionButton(token, 'deposit'),
    withdraw: createActionButton(token, 'withdraw'),
    'withdraw-all': createActionButton(token, 'withdraw-all'),
  };
  actions.append(
    input,
    buttons.deposit,
    buttons.withdraw,
    buttons['withdraw-all']
  );

  row.append(head, actions);
  return {
    row,
    input,
    buttons,
    balanceEl: balance.value,
    farmedEl: farmed.value,
    cyclesEl: cycles.value,
    nextEl: next.value,
    favoredBadge,
  };
}

function buildLayout(tokens) {
  const card = createEl('div', 'card farming-card');

  const header = createEl('div', 'farming-card-header');
  header.appendChild(createEl('h2', '', 'Farming'));
  const stageEl = createEl('span', 'farming-stage', 'Stage 1 · Passive');
  header.appendChild(stageEl);

  const statusEl = createEl('p', 'farming-status-line', FARMING_DISABLED_TEXT);
  statusEl.setAttribute('role', 'status');
  const favoredEl = createEl('p', 'farming-favored-line');
  favoredEl.hidden = true;

  const rulesEl = createEl('div', 'farming-rules');
  const summaryEl = createEl('p', 'farming-rule-summary');
  const list = createEl('ul', 'farming-rule-list');
  FARMING_RULES.forEach((rule) => list.appendChild(createEl('li', '', rule)));
  rulesEl.append(summaryEl, list);

  const availabilityEl = createEl('p', 'farming-availability-note');
  availabilityEl.hidden = true;

  const rowsEl = createEl('div', 'farming-rows');
  const rows = {};
  tokens.forEach((token) => {
    rows[token] = buildTokenRow(token);
    rowsEl.appendChild(rows[token].row);
  });

  card.append(header, statusEl, favoredEl, rulesEl, availabilityEl, rowsEl);
  return {
    key: tokens.join('|'),
    card,
    stageEl,
    favoredEl,
    statusEl,
    rulesEl,
    summaryEl,
    availabilityEl,
    rowsEl,
    rows,
  };
}

/**
 * Wire the Farm tab and the action-bar pill.
 * @returns {{ renderFarmingStatus: () => void, dispose: () => void }|null}
 */
export function initFarmingPanel(deps) {
  const {
    getGameMeta,
    getLastGameData,
    getActionAvailability,
    depositFarm,
    withdrawFarm,
    showToast,
    farmingPanelRef,
    farmingStatusRef,
    now = () => Date.now(),
    tickMs = 1000,
  } = deps || {};

  if (!farmingPanelRef && !farmingStatusRef) {
    return null;
  }

  let layout = null;
  const amountInputs = {};
  let submittingKey = null;
  // Countdown base: the farming block of the last payload and when it arrived.
  let countdownRaw = null;
  let countdownAt = 0;
  let lastFarming = null;
  let tickTimer = null;

  function safeCall(fn, fallback) {
    try {
      return typeof fn === 'function' ? fn() : fallback;
    } catch (error) {
      console.error('[farming-panel] dependency error:', error);
      return fallback;
    }
  }

  function readFarming() {
    const meta = safeCall(getGameMeta, null) || {};
    const state = safeCall(getLastGameData, null) || {};
    const farming = normalizeFarming(meta, state);
    // Re-base the local countdown whenever a new farming block arrives.
    const raw = resolveRawFarming(state);
    if (raw !== countdownRaw) {
      countdownRaw = raw;
      countdownAt = now();
    }
    return { farming, state };
  }

  function elapsedSeconds() {
    return Math.max(0, Math.floor((now() - countdownAt) / 1000));
  }

  function tickCountdowns() {
    if (!layout || !lastFarming?.enabled) return;
    const elapsed = elapsedSeconds();
    Object.entries(layout.rows).forEach(([token, refs]) => {
      refs.nextEl.textContent = formatNextReward(
        getFarmPosition(lastFarming, token),
        elapsed
      );
    });
    renderFavored(layout, lastFarming, elapsed);
  }

  function syncTicker(enabled) {
    if (enabled && !tickTimer && farmingPanelRef) {
      tickTimer = setInterval(tickCountdowns, tickMs);
    } else if (!enabled && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function renderPill(farming) {
    if (!farmingStatusRef) return;
    const pillText = formatFarmingPillText(farming);
    farmingStatusRef.textContent = pillText;
    farmingStatusRef.title = pillText;
    farmingStatusRef.classList.toggle(
      'farming-status-enabled',
      farming.enabled
    );
    farmingStatusRef.classList.toggle(
      'farming-status-disabled',
      !farming.enabled
    );
  }

  function ensureLayout(tokens) {
    const key = tokens.join('|');
    if (layout && layout.key === key) return layout;
    layout = buildLayout(tokens);
    farmingPanelRef.replaceChildren(layout.card);
    return layout;
  }

  function renderPanel(farming, state) {
    if (!farmingPanelRef) return;
    const tokens = resolveFarmTokens(state);
    const refs = ensureLayout(tokens);
    const balances = state?.player_state?.balances || {};
    const availability = safeCall(getActionAvailability, null);

    refs.statusEl.textContent = farming.enabled
      ? FARMING_ENABLED_TEXT
      : FARMING_DISABLED_TEXT;
    refs.statusEl.dataset.farmingState = farming.enabled
      ? 'enabled'
      : 'disabled';
    refs.rulesEl.hidden = !farming.enabled;
    refs.rowsEl.hidden = !farming.enabled;
    refs.summaryEl.textContent = formatFarmingRuleSummary(farming);
    refs.stageEl.textContent = hasFavoredBonus(farming)
      ? 'Stage 2 · Favored season'
      : 'Stage 1 · Passive';

    const blocked = farming.enabled && availability && !availability.allowed;
    refs.availabilityEl.hidden = !blocked;
    refs.availabilityEl.textContent = blocked
      ? availability.farmReason || availability.reason
      : '';

    const elapsed = elapsedSeconds();
    renderFavored(refs, farming, elapsed);
    tokens.forEach((token) => {
      const row = refs.rows[token];
      const position = getFarmPosition(farming, token);
      const balance = asNumber(balances[token]) ?? 0;

      row.balanceEl.textContent = formatTokenUnits(balance);
      row.farmedEl.textContent = formatTokenUnits(position.amount);
      row.cyclesEl.textContent = String(position.cycles_completed);
      row.nextEl.textContent = formatNextReward(position, elapsed);

      const amountText = amountInputs[token] || '';
      // Never overwrite the field the player is typing in.
      if (
        document.activeElement !== row.input &&
        row.input.value !== amountText
      ) {
        row.input.value = amountText;
      }

      Object.entries(row.buttons).forEach(([action, button]) => {
        const execution = resolveFarmActionState({
          action,
          farming,
          availability,
          amountText,
          balance,
          farmed: position.amount,
          isSubmitting: submittingKey !== null,
        });
        button.disabled = !execution.enabled;
        button.title = execution.reason;
        button.textContent =
          submittingKey === `${token}:${action}`
            ? 'Working...'
            : ACTION_LABELS[action];
      });
    });
  }

  function renderFavored(refs, farming, elapsed) {
    const line = farming.enabled ? formatFavoredLine(farming, elapsed) : '';
    refs.favoredEl.hidden = !line;
    if (refs.favoredEl.textContent !== line) refs.favoredEl.textContent = line;
    Object.entries(refs.rows).forEach(([token, row]) => {
      const favored = Boolean(line) && farming.favored_token === token;
      row.row.classList.toggle('farming-row-favored', favored);
      row.favoredBadge.hidden = !favored;
      row.favoredBadge.textContent = favored
        ? `${formatMultiplier(farming.favored_multiplier)} now`
        : '';
    });
  }

  function renderFarmingStatus() {
    const { farming, state } = readFarming();
    lastFarming = farming;
    renderPill(farming);
    renderPanel(farming, state);
    syncTicker(farming.enabled);
  }

  async function submit(token, action) {
    const { farming, state } = readFarming();
    const position = getFarmPosition(farming, token);
    const amountText = amountInputs[token] || '';
    const execution = resolveFarmActionState({
      action,
      farming,
      availability: safeCall(getActionAvailability, null),
      amountText,
      balance: asNumber(state?.player_state?.balances?.[token]) ?? 0,
      farmed: position.amount,
      isSubmitting: submittingKey !== null,
    });
    if (!execution.enabled) {
      showToast?.(execution.reason, 'info');
      return;
    }
    const handler = action === 'deposit' ? depositFarm : withdrawFarm;
    if (typeof handler !== 'function') {
      showToast?.('Farm action handler is unavailable.', 'error');
      return;
    }

    submittingKey = `${token}:${action}`;
    renderFarmingStatus();
    try {
      await handler({
        token,
        amount: action === 'withdraw-all' ? null : asNumber(amountText),
      });
      amountInputs[token] = '';
    } catch (error) {
      showToast?.(
        `${ACTION_LABELS[action]} failed: ${error?.message || 'Unknown error'}`,
        'error'
      );
    } finally {
      submittingKey = null;
      renderFarmingStatus();
    }
  }

  if (farmingPanelRef) {
    farmingPanelRef.addEventListener('input', (event) => {
      const target = event.target;
      if (target?.dataset?.field !== 'farm-amount') return;
      amountInputs[target.dataset.token] = String(target.value || '');
      renderFarmingStatus();
    });
    farmingPanelRef.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[data-farm-action]');
      if (!button || !farmingPanelRef.contains(button)) return;
      void submit(button.dataset.token, button.dataset.farmAction);
    });
  }

  renderFarmingStatus();

  return {
    renderFarmingStatus,
    dispose() {
      syncTicker(false);
    },
  };
}

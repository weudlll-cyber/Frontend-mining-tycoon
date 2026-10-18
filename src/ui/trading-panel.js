/**
 * File: src/ui/trading-panel.js
 * Purpose: Render unified conversion panel with scoring-mode-aware primary result display.
 * Role: Frontend display/intent only; all preview and trade-rule values are backend authoritative.
 * Notes: Pure view-model helpers (tokens, balances, previews, rules, schedule)
 *   live in trading-panel-model.js; this file owns the DOM and the panel state.
 */

import { initMicroTooltips } from './micro-tooltip.js';
import {
  asNumber,
  formatDurationAbsolute,
  formatScoringModeName,
  formatTokenUnits,
} from './trading-panel-formatters.js';
import {
  resolveActiveScoringMode,
  resolveBalances,
  resolveTokenList,
  resolveTokenLabel,
  resolveResultPreview,
  resolvePreviewRoot,
  resolvePreviewForSelection,
  buildResultSection,
  resolveTradingRules,
  resolveRoundElapsedSeconds,
  getScheduleStatus,
  FALLBACK_TOKENS,
} from './trading-panel-model.js';

let tooltipSerial = 0;

function syncSelectOptions(
  selectEl,
  values,
  getLabel = (value) => String(value)
) {
  if (!selectEl) return;
  const previousValue = selectEl.value;

  // WHY: Reusing option nodes keeps native dropdowns open across live refreshes.
  values.forEach((value, index) => {
    let option = selectEl.options[index];
    if (!option) {
      option = document.createElement('option');
      selectEl.appendChild(option);
    }
    if (option.value !== value) {
      option.value = value;
    }
    option.textContent = getLabel(value);
  });

  while (selectEl.options.length > values.length) {
    selectEl.remove(selectEl.options.length - 1);
  }

  selectEl.value = values.includes(previousValue)
    ? previousValue
    : values[0] || '';
}

function removeManagedTooltips(panelEl) {
  const tooltipLayer = document.getElementById('tooltip-layer');
  if (!panelEl || !tooltipLayer) return;
  const oldIds = panelEl.dataset.tipIds
    ? panelEl.dataset.tipIds.split(',').filter(Boolean)
    : [];
  oldIds.forEach((tipId) => {
    const node = tooltipLayer.querySelector(`#${tipId}`);
    if (node) {
      node.remove();
    }
  });
  panelEl.dataset.tipIds = '';
}

function createInlineTooltipTrigger(panelEl, label, tooltipText) {
  const wrapper = document.createElement('span');
  wrapper.className = 'trading-inline-note';

  const textNode = document.createTextNode(label);
  wrapper.appendChild(textNode);

  const tooltipLayer = document.getElementById('tooltip-layer');
  if (!tooltipLayer) return wrapper;

  tooltipSerial += 1;
  const tipId = `ps-tip-trading-${tooltipSerial}`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ps-tip-trigger trading-inline-tip';
  trigger.textContent = 'i';
  trigger.setAttribute('aria-label', `${label} info`);
  trigger.setAttribute('aria-describedby', tipId);
  trigger.setAttribute('data-tooltip-id', tipId);
  trigger.setAttribute('aria-expanded', 'false');

  const bubble = document.createElement('span');
  bubble.id = tipId;
  bubble.className = 'ps-tip-bubble';
  bubble.setAttribute('role', 'tooltip');
  bubble.textContent = tooltipText;

  tooltipLayer.appendChild(bubble);
  wrapper.appendChild(trigger);

  const existingIds = panelEl.dataset.tipIds
    ? panelEl.dataset.tipIds.split(',').filter(Boolean)
    : [];
  existingIds.push(tipId);
  panelEl.dataset.tipIds = existingIds.join(',');

  return wrapper;
}

function createBaseCard(trading, modeName) {
  const card = document.createElement('div');
  card.className = `trading-card ${trading.enabled ? 'trading-enabled' : 'trading-disabled'}`;

  const header = document.createElement('div');
  header.className = 'trading-card-header';

  const title = document.createElement('span');
  title.className = 'trading-title';
  title.textContent = 'Convert Tokens';

  const badge = document.createElement('span');
  badge.className = 'trading-badge';
  badge.textContent = trading.enabled ? 'Enabled' : 'Unavailable';

  header.appendChild(title);
  header.appendChild(badge);

  const mode = document.createElement('div');
  mode.className = 'trading-mode';
  mode.textContent = `Mode: ${modeName}`;

  card.appendChild(header);
  card.appendChild(mode);
  return card;
}

function appendControlsSection(card, model) {
  const controls = document.createElement('div');
  controls.className = 'trading-controls';

  const fromLabel = document.createElement('label');
  fromLabel.className = 'trading-field';
  const fromText = document.createElement('span');
  fromText.textContent = 'From';
  const fromSelect = document.createElement('select');
  fromSelect.setAttribute('data-field', 'from-token');
  fromSelect.setAttribute('aria-label', 'From token selector');

  model.tokens.forEach((token) => {
    const option = document.createElement('option');
    option.value = token;
    option.textContent = resolveTokenLabel(token, model.meta);
    option.selected = token === model.selectedFromToken;
    fromSelect.appendChild(option);
  });

  fromLabel.appendChild(fromText);
  fromLabel.appendChild(fromSelect);

  const toLabel = document.createElement('label');
  toLabel.className = 'trading-field';
  const toText = document.createElement('span');
  toText.textContent = 'To';
  const toSelect = document.createElement('select');
  toSelect.setAttribute('data-field', 'to-token');
  toSelect.setAttribute('aria-label', 'To token selector');

  model.tokens.forEach((token) => {
    const option = document.createElement('option');
    option.value = token;
    option.textContent = resolveTokenLabel(token, model.meta);
    option.selected = token === model.selectedToToken;
    toSelect.appendChild(option);
  });

  toLabel.appendChild(toText);
  toLabel.appendChild(toSelect);

  const amountLabel = document.createElement('label');
  amountLabel.className = 'trading-field trading-field-amount';
  const amountText = document.createElement('span');
  amountText.textContent = 'Amount';
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.min = '0';
  amountInput.step = 'any';
  amountInput.placeholder = 'Enter amount';
  amountInput.value = model.amountInputValue;
  amountInput.setAttribute('data-field', 'amount');
  amountInput.setAttribute('inputmode', 'decimal');
  amountInput.setAttribute('aria-label', 'Amount to convert');

  amountLabel.appendChild(amountText);
  amountLabel.appendChild(amountInput);

  const balanceRow = document.createElement('div');
  balanceRow.className = 'trading-balance-row';
  const balanceFrom = document.createElement('span');
  balanceFrom.className = 'trading-balance-from';
  balanceFrom.textContent = `Balance (${resolveTokenLabel(model.selectedFromToken, model.meta)}): `;
  const balanceFromStrong = document.createElement('strong');
  balanceFromStrong.className = 'trading-balance-from-value';
  balanceFromStrong.textContent = model.balanceFrom;
  balanceFrom.appendChild(balanceFromStrong);
  const balanceTo = document.createElement('span');
  balanceTo.className = 'trading-balance-to';
  balanceTo.textContent = `Balance (${resolveTokenLabel(model.selectedToToken, model.meta)}): `;
  const balanceToStrong = document.createElement('strong');
  balanceToStrong.className = 'trading-balance-to-value';
  balanceToStrong.textContent = model.balanceTo;
  balanceTo.appendChild(balanceToStrong);
  balanceRow.appendChild(balanceFrom);
  balanceRow.appendChild(balanceTo);

  const costNote = document.createElement('div');
  costNote.className = 'trading-cost-note';
  // The round's effective oracle spread (game meta `oracle_spread`, set per
  // round by the admin or taken from the global economy) is shown next to the
  // fee when the backend sends it; older metas without it keep the fee only.
  const spread = model.meta?.oracle_spread;
  const spreadText =
    typeof spread === 'number' && Number.isFinite(spread)
      ? ` fee + ${(spread * 100).toFixed(2)}% spread for this round`
      : '';
  costNote.textContent = `Conversion cost: ${model.feePercentage}%${spreadText} (informational)`;

  controls.appendChild(fromLabel);
  controls.appendChild(toLabel);
  controls.appendChild(amountLabel);
  controls.appendChild(balanceRow);
  controls.appendChild(costNote);

  card.appendChild(controls);
}

function appendPrimaryResultSection(panelEl, card, result) {
  const section = document.createElement('section');
  section.className = 'trading-primary-result';
  section.setAttribute('aria-live', 'polite');

  const labelRow = document.createElement('div');
  labelRow.className = 'primary-result-label-row';

  const label = document.createElement('span');
  label.className = 'primary-result-label';
  label.textContent = 'PRIMARY RESULT (Net Effect)';
  labelRow.appendChild(label);

  if (result.hint) {
    labelRow.appendChild(
      createInlineTooltipTrigger(panelEl, 'Metric', result.hint)
    );
  }

  const metricLabel = document.createElement('div');
  metricLabel.className = 'primary-result-metric-label';
  metricLabel.textContent = result.primaryLabel;

  const metricValue = document.createElement('div');
  metricValue.className = 'primary-result-value';
  metricValue.textContent = result.primaryValue;

  const secondary = document.createElement('div');
  secondary.className = 'primary-result-secondary';
  secondary.textContent = result.secondary;

  section.appendChild(labelRow);
  section.appendChild(metricLabel);
  section.appendChild(metricValue);
  section.appendChild(secondary);

  card.appendChild(section);
}

function appendScheduleSection(card, rules, tradesUsed, elapsedSeconds) {
  const wrapper = document.createElement('div');
  wrapper.className = 'trading-details';

  const usedRow = document.createElement('div');
  usedRow.className = 'trading-detail-row';
  const usedLabel = document.createElement('span');
  usedLabel.className = 'detail-label';
  usedLabel.textContent = 'Trades used:';
  const usedValue = document.createElement('span');
  usedValue.className = 'detail-value';
  usedValue.classList.add('trading-trades-used-value');
  usedValue.textContent = `${tradesUsed} / ${rules.trade_count}`;
  usedRow.appendChild(usedLabel);
  usedRow.appendChild(usedValue);

  wrapper.appendChild(usedRow);

  const nextRow = document.createElement('div');
  nextRow.className = 'trading-detail-row';
  const nextLabel = document.createElement('span');
  nextLabel.className = 'detail-label';
  nextLabel.textContent = 'Next trade:';
  const nextValue = document.createElement('span');
  nextValue.className = 'detail-value';
  nextValue.classList.add('trading-next-trade-value');

  const nextOffset = rules.unlock_offsets_seconds[tradesUsed] ?? null;
  if (nextOffset === null) {
    nextValue.textContent = 'No remaining trades';
  } else if (elapsedSeconds >= nextOffset) {
    nextValue.textContent = 'Available now';
  } else {
    nextValue.textContent = `Available in ${formatDurationAbsolute(nextOffset - elapsedSeconds)}`;
  }
  nextRow.appendChild(nextLabel);
  nextRow.appendChild(nextValue);

  wrapper.appendChild(nextRow);

  const scheduleTitle = document.createElement('div');
  scheduleTitle.className = 'detail-label';
  scheduleTitle.textContent = 'Trade schedule:';
  wrapper.appendChild(scheduleTitle);

  const scheduleList = document.createElement('ul');
  scheduleList.className = 'trading-schedule-list';

  if (!rules.trade_count || !rules.unlock_offsets_seconds.length) {
    const item = document.createElement('li');
    item.className = 'trading-schedule-item';
    item.textContent = 'No trades configured for this round.';
    scheduleList.appendChild(item);
  } else {
    rules.unlock_offsets_seconds.forEach((offset, idx) => {
      const item = document.createElement('li');
      item.className = 'trading-schedule-item';

      const left = document.createElement('span');
      left.className = 'trading-schedule-item-label';
      left.textContent = `Trade ${idx + 1} at ${formatDurationAbsolute(offset)}`;
      left.setAttribute('data-schedule-index', String(idx));

      const right = document.createElement('span');
      right.className = 'detail-value';
      right.classList.add('trading-schedule-item-status');
      right.setAttribute('data-schedule-index', String(idx));
      right.textContent = getScheduleStatus(
        idx,
        offset,
        tradesUsed,
        elapsedSeconds
      );

      item.appendChild(left);
      item.appendChild(right);
      scheduleList.appendChild(item);
    });
  }

  wrapper.appendChild(scheduleList);
  card.appendChild(wrapper);
}

function resolveExecutionState(model, trading, isSubmitting) {
  const amount = asNumber(model.amountInputValue);
  const availableFrom =
    asNumber(model.balances?.[model.selectedFromToken]) ?? 0;
  const nextOffset =
    model.rules.unlock_offsets_seconds[model.tradesUsed] ?? null;

  if (isSubmitting) {
    return {
      enabled: false,
      buttonText: 'Executing...',
      reason: 'Trade is being submitted.',
    };
  }
  if (!trading.enabled) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'Trading is not enabled for this round.',
    };
  }
  // Play-window gate from the board state (enrolling/finished round, async
  // round without an active session). Backend 409 remains authoritative.
  if (model.actionAvailability && !model.actionAvailability.allowed) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: model.actionAvailability.reason,
    };
  }
  if (!model.rules.trade_count) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'No trade slots are configured for this round.',
    };
  }
  if (model.tradesUsed >= model.rules.trade_count) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'No remaining trade slots in this round.',
    };
  }
  if (nextOffset !== null && model.elapsedSeconds < nextOffset) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: `Next trade unlocks in ${formatDurationAbsolute(nextOffset - model.elapsedSeconds)}.`,
    };
  }
  if (model.selectedFromToken === model.selectedToToken) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'Choose two different tokens for conversion.',
    };
  }
  if (amount === null || amount <= 0) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'Enter an amount greater than 0.',
    };
  }
  if (amount > availableFrom) {
    return {
      enabled: false,
      buttonText: 'Execute Trade',
      reason: 'Amount exceeds your available balance.',
    };
  }

  return {
    enabled: true,
    buttonText: 'Execute Trade',
    reason: 'Submit trade at backend-authoritative conversion rates.',
  };
}

function appendActionsSection(panelEl, card, execution) {
  const actions = document.createElement('div');
  actions.className = 'trading-actions';

  const executeBtn = document.createElement('button');
  executeBtn.type = 'button';
  executeBtn.className = 'btn-primary trading-execute-btn';
  executeBtn.setAttribute('data-action', 'execute-trade');
  executeBtn.textContent = execution.buttonText;
  executeBtn.disabled = !execution.enabled;
  executeBtn.title = execution.reason;

  actions.appendChild(executeBtn);
  actions.appendChild(
    createInlineTooltipTrigger(panelEl, 'Execution rules', execution.reason)
  );

  card.appendChild(actions);
}

function appendStatusSummary(card, trading) {
  const summary = document.createElement('div');
  summary.className = 'trading-summary';

  const status = document.createElement('div');
  status.className = 'trading-status';
  status.textContent = String(trading.status || 'disabled');

  const reason = document.createElement('div');
  reason.className = 'trading-reason';
  reason.textContent = String(trading.reason || 'Not available');

  summary.appendChild(status);
  summary.appendChild(reason);
  card.appendChild(summary);
}

export function normalizeTradingCapability(rawTrading, fallbackFeeRate = 0.02) {
  if (!rawTrading) {
    return {
      enabled: false,
      status: 'disabled',
      reason: 'Trading not configured',
      fee_model: 'value_fee_rate',
      value_fee_rate: fallbackFeeRate,
      max_trades_per_player: null,
      trade_opens_after_seconds: null,
    };
  }

  return {
    enabled: rawTrading.enabled === true,
    status: String(rawTrading.status || 'disabled').toLowerCase(),
    reason: rawTrading.reason || null,
    fee_model: String(rawTrading.fee_model || 'value_fee_rate'),
    value_fee_rate:
      typeof rawTrading.value_fee_rate === 'number'
        ? rawTrading.value_fee_rate
        : fallbackFeeRate,
    max_trades_per_player:
      typeof rawTrading.max_trades_per_player === 'number'
        ? rawTrading.max_trades_per_player
        : null,
    trade_opens_after_seconds:
      typeof rawTrading.trade_opens_after_seconds === 'number'
        ? rawTrading.trade_opens_after_seconds
        : null,
  };
}

/**
 * Panel state of one initTradingPanel() call: the injected dependencies plus
 * the user's current selection. Passed explicitly to the functions below.
 */
function createPanelContext(deps) {
  return {
    ...deps,
    disposeTooltips: () => {},
    selectedFromToken: FALLBACK_TOKENS[0],
    selectedToToken: FALLBACK_TOKENS[1],
    amountInputValue: '',
    isTradeSubmitting: false,
    // WHY: a full rebuild replaces the Execute button. When it happens between
    // pressing and releasing the mouse (the amount field's `change` on blur, or
    // a live tick), the browser drops the click and the trade silently does
    // not happen. While a press inside the panel is in progress, update in
    // place.
    pointerPressedInPanel: false,
  };
}

function getTrading(ctx) {
  try {
    const meta = ctx.getGameMeta();
    // WHY: a per-round fee override may be 0, so only a missing/non-numeric
    // conversion_fee_rate falls back to the 2% default (`||` dropped 0).
    const metaFee = meta?.conversion_fee_rate;
    const fallbackFee =
      typeof metaFee === 'number' && Number.isFinite(metaFee) ? metaFee : 0.02;
    return normalizeTradingCapability(meta?.trading, fallbackFee);
  } catch (err) {
    console.error('[trading-panel] getTrading error:', err);
    return normalizeTradingCapability(null);
  }
}

function getActionAvailabilityState(ctx) {
  return typeof ctx.getActionAvailability === 'function'
    ? ctx.getActionAvailability()
    : null;
}

function getCurrentState(ctx) {
  if (typeof ctx.getLastGameData !== 'function') return null;
  try {
    return ctx.getLastGameData() || null;
  } catch (err) {
    console.error('[trading-panel] getLastGameData error:', err);
    return null;
  }
}

function keepTokenSelectionValid(ctx, tokens) {
  if (!tokens.length) {
    ctx.selectedFromToken = FALLBACK_TOKENS[0];
    ctx.selectedToToken = FALLBACK_TOKENS[1];
    return;
  }

  if (!tokens.includes(ctx.selectedFromToken)) {
    ctx.selectedFromToken = tokens[0];
  }
  if (!tokens.includes(ctx.selectedToToken)) {
    ctx.selectedToToken =
      tokens.find((token) => token !== ctx.selectedFromToken) || tokens[0];
  }
  if (ctx.selectedFromToken === ctx.selectedToToken && tokens.length > 1) {
    ctx.selectedToToken =
      tokens.find((token) => token !== ctx.selectedFromToken) || tokens[0];
  }
}

/** Trade schedule position: rules, trades used and elapsed round time. */
function resolveScheduleProgress(meta, state) {
  const rules = resolveTradingRules(meta, state);
  const tradesUsed = Math.max(
    0,
    Math.min(rules.trade_count, Math.round(Number(state?.trades_used) || 0))
  );
  const elapsedSeconds = resolveRoundElapsedSeconds(meta, state);
  return { rules, tradesUsed, elapsedSeconds };
}

function resolveExecution(ctx, trading, balances, progress) {
  return resolveExecutionState(
    {
      amountInputValue: ctx.amountInputValue,
      balances,
      selectedFromToken: ctx.selectedFromToken,
      selectedToToken: ctx.selectedToToken,
      rules: progress.rules,
      tradesUsed: progress.tradesUsed,
      elapsedSeconds: progress.elapsedSeconds,
      actionAvailability: getActionAvailabilityState(ctx),
    },
    trading,
    ctx.isTradeSubmitting
  );
}

/**
 * Everything both render paths need. Keeps the token selection valid first,
 * so the balances and preview always refer to offered tokens.
 */
function resolvePanelView(ctx, trading) {
  const meta = ctx.getGameMeta() || {};
  const state = getCurrentState(ctx) || {};
  const mode = resolveActiveScoringMode(meta, state, ctx.getActiveScoringMode);
  const tokens = resolveTokenList(meta, state);
  const balances = resolveBalances(state);
  keepTokenSelectionValid(ctx, tokens);

  const previewRoot = resolvePreviewRoot(meta, state, trading);
  const previewData = resolvePreviewForSelection(
    previewRoot,
    ctx.selectedFromToken,
    ctx.selectedToToken
  );
  const result = buildResultSection(
    mode,
    resolveResultPreview(
      mode,
      previewData,
      ctx.amountInputValue,
      trading.value_fee_rate
    )
  );
  const progress = resolveScheduleProgress(meta, state);
  const execution = resolveExecution(ctx, trading, balances, progress);
  return { meta, mode, tokens, balances, result, progress, execution };
}

function renderPanelCard(ctx, trading) {
  const panelEl = ctx.tradingPanelRef;
  if (!panelEl) return;

  const view = resolvePanelView(ctx, trading);
  const { rules, tradesUsed, elapsedSeconds } = view.progress;

  removeManagedTooltips(panelEl);
  ctx.disposeTooltips();

  while (panelEl.firstChild) {
    panelEl.removeChild(panelEl.firstChild);
  }

  const card = createBaseCard(trading, formatScoringModeName(view.mode));
  appendControlsSection(card, {
    meta: view.meta,
    tokens: view.tokens,
    selectedFromToken: ctx.selectedFromToken,
    selectedToToken: ctx.selectedToToken,
    amountInputValue: ctx.amountInputValue,
    balanceFrom: formatTokenUnits(view.balances?.[ctx.selectedFromToken]),
    balanceTo: formatTokenUnits(view.balances?.[ctx.selectedToToken]),
    feePercentage: (trading.value_fee_rate * 100).toFixed(2),
  });
  appendPrimaryResultSection(panelEl, card, view.result);
  appendActionsSection(panelEl, card, view.execution);
  appendStatusSummary(card, trading);
  appendScheduleSection(card, rules, tradesUsed, elapsedSeconds);

  panelEl.appendChild(card);
  ctx.disposeTooltips = initMicroTooltips(panelEl);
}

function syncControlsInPlace(ctx, view) {
  const panelEl = ctx.tradingPanelRef;
  const { meta, tokens, balances } = view;
  const fromSelect = panelEl.querySelector('select[data-field="from-token"]');
  const toSelect = panelEl.querySelector('select[data-field="to-token"]');
  const amountInput = panelEl.querySelector('input[data-field="amount"]');
  syncSelectOptions(fromSelect, tokens, (token) =>
    resolveTokenLabel(token, meta)
  );
  syncSelectOptions(toSelect, tokens, (token) =>
    resolveTokenLabel(token, meta)
  );
  if (fromSelect) fromSelect.value = ctx.selectedFromToken;
  if (toSelect) toSelect.value = ctx.selectedToToken;
  if (amountInput && amountInput.value !== ctx.amountInputValue) {
    amountInput.value = ctx.amountInputValue;
  }

  const balanceFromEl = panelEl.querySelector('.trading-balance-from');
  const balanceToEl = panelEl.querySelector('.trading-balance-to');
  const balanceFromValueEl = panelEl.querySelector(
    '.trading-balance-from-value'
  );
  const balanceToValueEl = panelEl.querySelector('.trading-balance-to-value');
  if (balanceFromEl?.firstChild) {
    balanceFromEl.firstChild.textContent = `Balance (${resolveTokenLabel(ctx.selectedFromToken, meta)}): `;
  }
  if (balanceToEl?.firstChild) {
    balanceToEl.firstChild.textContent = `Balance (${resolveTokenLabel(ctx.selectedToToken, meta)}): `;
  }
  if (balanceFromValueEl) {
    balanceFromValueEl.textContent = formatTokenUnits(
      balances?.[ctx.selectedFromToken]
    );
  }
  if (balanceToValueEl) {
    balanceToValueEl.textContent = formatTokenUnits(
      balances?.[ctx.selectedToToken]
    );
  }
}

function syncResultInPlace(panelEl, result) {
  const metricLabelEl = panelEl.querySelector('.primary-result-metric-label');
  const valueEl = panelEl.querySelector('.primary-result-value');
  const secondaryEl = panelEl.querySelector('.primary-result-secondary');
  if (metricLabelEl) metricLabelEl.textContent = result.primaryLabel;
  if (valueEl) valueEl.textContent = result.primaryValue;
  if (secondaryEl) secondaryEl.textContent = result.secondary;
}

function syncScheduleInPlace(panelEl, progress) {
  const { rules, tradesUsed, elapsedSeconds } = progress;
  const tradesUsedEl = panelEl.querySelector('.trading-trades-used-value');
  const nextTradeEl = panelEl.querySelector('.trading-next-trade-value');
  if (tradesUsedEl) {
    tradesUsedEl.textContent = `${tradesUsed} / ${rules.trade_count}`;
  }
  if (nextTradeEl) {
    const nextOffset = rules.unlock_offsets_seconds[tradesUsed] ?? null;
    if (nextOffset === null) {
      nextTradeEl.textContent = 'No remaining trades';
    } else if (elapsedSeconds >= nextOffset) {
      nextTradeEl.textContent = 'Available now';
    } else {
      nextTradeEl.textContent = `Available in ${formatDurationAbsolute(nextOffset - elapsedSeconds)}`;
    }
  }

  rules.unlock_offsets_seconds.forEach((offset, idx) => {
    const labelEl = panelEl.querySelector(
      `.trading-schedule-item-label[data-schedule-index="${idx}"]`
    );
    const statusEl = panelEl.querySelector(
      `.trading-schedule-item-status[data-schedule-index="${idx}"]`
    );
    if (labelEl) {
      labelEl.textContent = `Trade ${idx + 1} at ${formatDurationAbsolute(offset)}`;
    }
    if (statusEl) {
      statusEl.textContent = getScheduleStatus(
        idx,
        offset,
        tradesUsed,
        elapsedSeconds
      );
    }
  });
}

/**
 * Refresh the mounted panel without replacing its nodes, so the focused
 * control (or the button under a pressed pointer) stays in place.
 */
function updateEditingPanelInPlace(ctx, trading) {
  const panelEl = ctx.tradingPanelRef;
  if (!panelEl) return;

  const view = resolvePanelView(ctx, trading);
  syncControlsInPlace(ctx, view);
  syncResultInPlace(panelEl, view.result);
  syncScheduleInPlace(panelEl, view.progress);

  const executeBtn = panelEl.querySelector('.trading-execute-btn');
  if (executeBtn) {
    executeBtn.textContent = view.execution.buttonText;
    executeBtn.disabled = !view.execution.enabled;
    executeBtn.title = view.execution.reason;
  }
}

function renderBottomStatus(ctx, trading) {
  renderBottomBarTradingStatus(trading, ctx.tradingStatusRef);
}

function isEditingPanelField(panelEl) {
  const activeEl = document.activeElement;
  return (
    Boolean(activeEl) &&
    Boolean(panelEl) &&
    panelEl.contains(activeEl) &&
    (activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLSelectElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl?.isContentEditable === true ||
      // Keyboard users: Tab to Execute must not lose the focused button.
      activeEl?.dataset?.action === 'execute-trade')
  );
}

function renderPanel(ctx) {
  const trading = getTrading(ctx);

  // Keep the current editor control mounted while the user types/selects.
  // Rebuilding the panel replaces the amount/select DOM node and drops focus.
  if (isEditingPanelField(ctx.tradingPanelRef) || ctx.pointerPressedInPanel) {
    // Keep the active control mounted while still refreshing computed preview text.
    updateEditingPanelInPlace(ctx, trading);
    renderBottomStatus(ctx, trading);
    return;
  }

  renderPanelCard(ctx, trading);
  renderBottomStatus(ctx, trading);
}

function handlePanelInput(ctx, event) {
  const target = event?.target;
  if (!target || !ctx.tradingPanelRef?.contains(target)) return;

  const field = target.getAttribute('data-field');
  if (!field) return;

  if (field === 'from-token') {
    ctx.selectedFromToken = String(target.value || '').toLowerCase();
  } else if (field === 'to-token') {
    ctx.selectedToToken = String(target.value || '').toLowerCase();
  } else if (field === 'amount') {
    ctx.amountInputValue = String(target.value || '');
  }

  const meta = ctx.getGameMeta() || {};
  const state = getCurrentState(ctx) || {};
  keepTokenSelectionValid(ctx, resolveTokenList(meta, state));

  renderPanel(ctx);
}

function notify(ctx, message, type) {
  if (typeof ctx.showToast === 'function') {
    ctx.showToast(message, type);
  }
}

async function handleExecuteTrade(ctx) {
  const trading = getTrading(ctx);
  const meta = ctx.getGameMeta() || {};
  const state = getCurrentState(ctx) || {};
  const execution = resolveExecution(
    ctx,
    trading,
    resolveBalances(state),
    resolveScheduleProgress(meta, state)
  );

  if (!execution.enabled) {
    notify(ctx, execution.reason, 'info');
    return;
  }
  if (typeof ctx.executeTrade !== 'function') {
    notify(ctx, 'Trade execution handler is unavailable.', 'error');
    return;
  }

  const amount = asNumber(ctx.amountInputValue);
  ctx.isTradeSubmitting = true;
  renderPanel(ctx);

  try {
    await ctx.executeTrade({
      fromToken: ctx.selectedFromToken,
      toToken: ctx.selectedToToken,
      amount,
    });
    ctx.amountInputValue = '';
  } catch (error) {
    notify(ctx, `Trade failed: ${error?.message || 'Unknown error'}`, 'error');
  } finally {
    ctx.isTradeSubmitting = false;
    renderPanel(ctx);
  }
}

function wirePanelEvents(ctx) {
  const panelEl = ctx.tradingPanelRef;
  if (!panelEl) return;

  const releasePointer = () => {
    if (!ctx.pointerPressedInPanel) return;
    // Clear after the click event that follows pointerup has been dispatched.
    setTimeout(() => {
      ctx.pointerPressedInPanel = false;
    }, 0);
  };
  const onInput = (event) => handlePanelInput(ctx, event);

  panelEl.addEventListener('pointerdown', () => {
    ctx.pointerPressedInPanel = true;
  });
  document.addEventListener('pointerup', releasePointer, true);
  document.addEventListener('pointercancel', releasePointer, true);
  panelEl.addEventListener('input', onInput);
  panelEl.addEventListener('change', onInput);
  panelEl.addEventListener('click', (event) => {
    const button = event?.target?.closest?.(
      'button[data-action="execute-trade"]'
    );
    if (!button || !panelEl.contains(button)) return;
    void handleExecuteTrade(ctx);
  });
}

export function initTradingPanel(deps) {
  const { getGameMeta, tradingPanelRef, tradingStatusRef } = deps || {};

  if (!getGameMeta) {
    console.warn('[trading-panel] initTradingPanel: getGameMeta not provided');
    return;
  }

  if (!tradingPanelRef && !tradingStatusRef) {
    console.warn(
      '[trading-panel] initTradingPanel: no refs provided for trading panel or status'
    );
    return;
  }

  const ctx = createPanelContext(deps);
  wirePanelEvents(ctx);

  return {
    renderTradingStatus: () => renderPanel(ctx),
    getTrading: () => getTrading(ctx),
    renderPanelCard: (trading) => renderPanelCard(ctx, trading),
    renderBottomStatus: (trading) => renderBottomStatus(ctx, trading),
  };
}

export function renderTradingStatus(
  trading,
  tradingPanelRef,
  tradingStatusRef
) {
  if (!trading) return;

  if (tradingPanelRef) {
    while (tradingPanelRef.firstChild) {
      tradingPanelRef.removeChild(tradingPanelRef.firstChild);
    }

    const card = createBaseCard(trading, 'Stockpile Mode');
    appendPrimaryResultSection(tradingPanelRef, card, {
      primaryLabel: 'Total Tokens Change',
      primaryValue: '--',
      secondary: 'Units: -- -> --',
      hint: null,
    });
    appendStatusSummary(card, trading);
    appendScheduleSection(
      card,
      { trade_count: 0, unlock_offsets_seconds: [] },
      0,
      0
    );
    tradingPanelRef.appendChild(card);
  }

  renderBottomBarTradingStatus(trading, tradingStatusRef);
}

export function renderBottomBarTradingStatus(data, statusRef) {
  if (!data || !statusRef) return;
  const statusText = data.enabled ? 'Enabled' : 'Not Enabled';
  const feeText = `${(data.value_fee_rate * 100).toFixed(1)}%`;
  // The pill already has the "Trading" label; the value is shortened with an
  // ellipsis on narrow windows, so the full text is also the tooltip.
  const text = `${statusText} (${feeText} fee)`;
  statusRef.textContent = text;
  statusRef.title = text;
  // classList, not className: the bottom-bar-value class (ellipsis) must stay.
  statusRef.classList.toggle('trading-status-enabled', Boolean(data.enabled));
  statusRef.classList.toggle('trading-status-disabled', !data.enabled);
}

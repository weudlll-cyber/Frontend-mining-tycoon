/**
 * File: src/ui/trading-panel.js
 * Purpose: Render unified conversion panel with scoring-mode-aware primary result display.
 * Role: Frontend display/intent only; all preview and trade-rule values are backend authoritative.
 */

import { initMicroTooltips } from "./micro-tooltip.js";

const DEFAULT_SCORING_MODE = "stockpile_total_tokens";
const FALLBACK_TOKENS = ["spring", "summer", "autumn", "winter"];

let tooltipSerial = 0;

function normalizeScoringMode(rawMode) {
  const mode = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (!mode) return DEFAULT_SCORING_MODE;
  if (mode === "stockpile_total_tokens" || mode === "stockpile") {
    return "stockpile_total_tokens";
  }
  if (
    mode === "power_oracle_weighted" ||
    mode === "power" ||
    mode === "oracle_weighted"
  ) {
    return "power_oracle_weighted";
  }
  if (mode === "mining_time_equivalent" || mode === "mining_time") {
    return "mining_time_equivalent";
  }
  if (mode === "efficiency_system_mastery" || mode === "efficiency") {
    return "efficiency_system_mastery";
  }
  return DEFAULT_SCORING_MODE;
}

function formatScoringModeName(mode) {
  const normalized = normalizeScoringMode(mode);
  if (normalized === "power_oracle_weighted") return "Power Mode";
  if (normalized === "mining_time_equivalent") {
    return "Mining Time Equivalent Mode";
  }
  if (normalized === "efficiency_system_mastery") return "Efficiency Mode";
  return "Stockpile Mode";
}

function resolveActiveScoringMode(meta, state, getActiveScoringMode) {
  if (typeof getActiveScoringMode === "function") {
    return normalizeScoringMode(getActiveScoringMode());
  }
  return normalizeScoringMode(state?.scoring_mode || meta?.scoring_mode);
}

function resolveTokenList(meta, state) {
  const candidates = [];
  if (state?.balances && typeof state.balances === "object") {
    candidates.push(...Object.keys(state.balances));
  }
  if (meta?.token_names && typeof meta.token_names === "object") {
    candidates.push(...Object.keys(meta.token_names));
  }
  if (!candidates.length) {
    return [...FALLBACK_TOKENS];
  }
  const deduped = [];
  candidates.forEach((token) => {
    const normalized = String(token || "").trim().toLowerCase();
    if (!normalized || deduped.includes(normalized)) return;
    deduped.push(normalized);
  });
  return deduped.length ? deduped : [...FALLBACK_TOKENS];
}

function formatTokenName(token) {
  const text = String(token || "").trim();
  if (!text) return "Unknown";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedNumber(value, decimals = 2) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  const abs = Math.abs(numeric).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
    const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "+/-";
  return `${sign}${abs}`;
}

function formatSignedPercent(value, decimals = 1) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  return `${formatSignedNumber(numeric, decimals)}%`;
}

function formatTokenUnits(value) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatSignedTokens(value) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  return `${formatSignedNumber(numeric, 0)} tokens`;
}

function formatDurationCompact(seconds) {
  const numeric = asNumber(seconds);
  if (numeric === null) return "--";
  const sign = numeric < 0 ? "-" : "+";
  const total = Math.max(0, Math.round(Math.abs(numeric)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${sign}${hours}h ${minutes}m`;
  }
  return `${sign}${minutes}m ${secs}s`;
}

function formatDurationAbsolute(seconds) {
  const numeric = asNumber(seconds);
  if (numeric === null) return "--";
  const total = Math.max(0, Math.round(numeric));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

function resolvePreviewRoot(meta, state, trading) {
  const candidates = [
    state?.conversion_preview,
    state?.trade_preview,
    state?.trading_preview,
    meta?.conversion_preview,
    meta?.trade_preview,
    trading?.preview,
  ];
  return candidates.find((item) => item && typeof item === "object") || null;
}

function resolvePreviewForSelection(previewRoot, fromToken, toToken) {
  if (!previewRoot || typeof previewRoot !== "object") return null;

  const pairKey = `${fromToken}:${toToken}`;
  if (previewRoot.pairs && typeof previewRoot.pairs === "object") {
    return (
      previewRoot.pairs[pairKey] ||
      previewRoot.pairs[`${fromToken}->${toToken}`] ||
      null
    );
  }
  if (previewRoot.by_pair && typeof previewRoot.by_pair === "object") {
    return (
      previewRoot.by_pair[pairKey] ||
      previewRoot.by_pair[`${fromToken}->${toToken}`] ||
      null
    );
  }

  return previewRoot;
}

function buildResultSection(mode, preview) {
  const normalizedMode = normalizeScoringMode(mode);
  const data = preview || {};

  if (normalizedMode === "power_oracle_weighted") {
    const before = asNumber(data.weighted_score_before);
    const after = asNumber(data.weighted_score_after);
    return {
      primaryLabel: "Weighted Score Change",
      primaryValue: formatSignedPercent(data.weighted_score_change_pct, 1),
      secondary:
        before !== null && after !== null
          ? `Score: ${before.toFixed(2)} -> ${after.toFixed(2)}`
          : "Score: -- -> --",
      hint: null,
    };
  }

  if (normalizedMode === "mining_time_equivalent") {
    const before = asNumber(data.mining_time_before_seconds);
    const after = asNumber(data.mining_time_after_seconds);
    return {
      primaryLabel: "Mining Time Equivalent Change",
      primaryValue: formatDurationCompact(data.mining_time_change_seconds),
      secondary:
        before !== null && after !== null
          ? `Total: ${formatDurationAbsolute(before)} -> ${formatDurationAbsolute(after)}`
          : "Total: -- -> --",
      hint: "Represents how long it would take to mine these holdings from scratch using baseline mining rates.",
    };
  }

  if (normalizedMode === "efficiency_system_mastery") {
    const before = asNumber(data.efficiency_before);
    const after = asNumber(data.efficiency_after);
    return {
      primaryLabel: "Efficiency Impact",
      primaryValue: formatSignedPercent(data.efficiency_change_pct, 1),
      secondary:
        before !== null && after !== null
          ? `Score: ${before.toFixed(2)} -> ${after.toFixed(2)}`
          : "Score: -- -> --",
      hint: "Efficiency measures improvement quality under the round rules, not asset possession.",
    };
  }

  return {
    primaryLabel: "Total Tokens Change",
    primaryValue: formatSignedTokens(data.total_tokens_change),
    secondary:
      asNumber(data.units_given) !== null || asNumber(data.units_received) !== null
        ? `Units: -${formatTokenUnits(data.units_given)} -> +${formatTokenUnits(data.units_received)}`
        : "Units: -- -> --",
    hint: null,
  };
}

function resolveTradingRules(meta, state) {
  const raw = state?.trading_rules || meta?.trading_rules || null;
  if (!raw || typeof raw !== "object") {
    return { trade_count: 0, unlock_offsets_seconds: [] };
  }
  const tradeCount = Math.max(0, Math.round(Number(raw.trade_count) || 0));
  const offsets = Array.isArray(raw.unlock_offsets_seconds)
    ? raw.unlock_offsets_seconds
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return {
    trade_count: tradeCount,
    unlock_offsets_seconds: offsets,
  };
}

function resolveRoundElapsedSeconds(meta, state) {
  const gameDuration = asNumber(meta?.game_duration_seconds);
  const secondsRemaining = asNumber(state?.seconds_remaining);
  if (gameDuration === null || secondsRemaining === null) {
    return 0;
  }
  return Math.max(0, Math.round(gameDuration - secondsRemaining));
}

function getScheduleStatus(index, unlockOffset, tradesUsed, elapsedSeconds) {
  if (index < tradesUsed) {
    return "Used";
  }
  if (elapsedSeconds >= unlockOffset) {
    return "Available now";
  }
  return `Available in ${formatDurationAbsolute(unlockOffset - elapsedSeconds)}`;
}

function removeManagedTooltips(panelEl) {
  const tooltipLayer = document.getElementById("tooltip-layer");
  if (!panelEl || !tooltipLayer) return;
  const oldIds = panelEl.dataset.tipIds
    ? panelEl.dataset.tipIds.split(",").filter(Boolean)
    : [];
  oldIds.forEach((tipId) => {
    const node = tooltipLayer.querySelector(`#${tipId}`);
    if (node) {
      node.remove();
    }
  });
  panelEl.dataset.tipIds = "";
}

function createInlineTooltipTrigger(panelEl, label, tooltipText) {
  const wrapper = document.createElement("span");
  wrapper.className = "trading-inline-note";

  const textNode = document.createTextNode(label);
  wrapper.appendChild(textNode);

  const tooltipLayer = document.getElementById("tooltip-layer");
  if (!tooltipLayer) return wrapper;

  tooltipSerial += 1;
  const tipId = `ps-tip-trading-${tooltipSerial}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ps-tip-trigger trading-inline-tip";
    trigger.textContent = "i";
  trigger.setAttribute("aria-label", `${label} info`);
  trigger.setAttribute("aria-describedby", tipId);
  trigger.setAttribute("data-tooltip-id", tipId);
  trigger.setAttribute("aria-expanded", "false");

  const bubble = document.createElement("span");
  bubble.id = tipId;
  bubble.className = "ps-tip-bubble";
  bubble.setAttribute("role", "tooltip");
  bubble.textContent = tooltipText;

  tooltipLayer.appendChild(bubble);
  wrapper.appendChild(trigger);

  const existingIds = panelEl.dataset.tipIds
    ? panelEl.dataset.tipIds.split(",").filter(Boolean)
    : [];
  existingIds.push(tipId);
  panelEl.dataset.tipIds = existingIds.join(",");

  return wrapper;
}

function createBaseCard(trading, modeName) {
  const card = document.createElement("div");
  card.className = `trading-card ${trading.enabled ? "trading-enabled" : "trading-disabled"}`;

  const header = document.createElement("div");
  header.className = "trading-card-header";

  const title = document.createElement("span");
  title.className = "trading-title";
  title.textContent = "Convert Tokens";

  const badge = document.createElement("span");
  badge.className = "trading-badge";
  badge.textContent = trading.enabled ? "Enabled" : "Unavailable";

  header.appendChild(title);
  header.appendChild(badge);

  const mode = document.createElement("div");
  mode.className = "trading-mode";
  mode.textContent = `Mode: ${modeName}`;

  card.appendChild(header);
  card.appendChild(mode);
  return card;
}

function appendControlsSection(card, model) {
  const controls = document.createElement("div");
  controls.className = "trading-controls";

  const fromLabel = document.createElement("label");
  fromLabel.className = "trading-field";
  const fromText = document.createElement("span");
  fromText.textContent = "From";
  const fromSelect = document.createElement("select");
  fromSelect.setAttribute("data-field", "from-token");
  fromSelect.setAttribute("aria-label", "From token selector");

  model.tokens.forEach((token) => {
    const option = document.createElement("option");
    option.value = token;
    option.textContent = formatTokenName(token);
    option.selected = token === model.selectedFromToken;
    fromSelect.appendChild(option);
  });

  fromLabel.appendChild(fromText);
  fromLabel.appendChild(fromSelect);

  const toLabel = document.createElement("label");
  toLabel.className = "trading-field";
  const toText = document.createElement("span");
  toText.textContent = "To";
  const toSelect = document.createElement("select");
  toSelect.setAttribute("data-field", "to-token");
  toSelect.setAttribute("aria-label", "To token selector");

  model.tokens.forEach((token) => {
    const option = document.createElement("option");
    option.value = token;
    option.textContent = formatTokenName(token);
    option.selected = token === model.selectedToToken;
    toSelect.appendChild(option);
  });

  toLabel.appendChild(toText);
  toLabel.appendChild(toSelect);

  const amountLabel = document.createElement("label");
  amountLabel.className = "trading-field trading-field-amount";
  const amountText = document.createElement("span");
  amountText.textContent = "Amount";
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.min = "0";
  amountInput.step = "any";
  amountInput.placeholder = "Enter amount";
  amountInput.value = model.amountInputValue;
  amountInput.setAttribute("data-field", "amount");
  amountInput.setAttribute("inputmode", "decimal");
  amountInput.setAttribute("aria-label", "Amount to convert");

  amountLabel.appendChild(amountText);
  amountLabel.appendChild(amountInput);

  const balanceRow = document.createElement("div");
  balanceRow.className = "trading-balance-row";
  const balanceFrom = document.createElement("span");
  balanceFrom.textContent = `Balance (${formatTokenName(model.selectedFromToken)}): `;
  const balanceFromStrong = document.createElement("strong");
  balanceFromStrong.textContent = model.balanceFrom;
  balanceFrom.appendChild(balanceFromStrong);
  const balanceTo = document.createElement("span");
  balanceTo.textContent = `Balance (${formatTokenName(model.selectedToToken)}): `;
  const balanceToStrong = document.createElement("strong");
  balanceToStrong.textContent = model.balanceTo;
  balanceTo.appendChild(balanceToStrong);
  balanceRow.appendChild(balanceFrom);
  balanceRow.appendChild(balanceTo);

  const costNote = document.createElement("div");
  costNote.className = "trading-cost-note";
  costNote.textContent = `Conversion cost: ${model.feePercentage}% (informational)`;

  controls.appendChild(fromLabel);
  controls.appendChild(toLabel);
  controls.appendChild(amountLabel);
  controls.appendChild(balanceRow);
  controls.appendChild(costNote);

  card.appendChild(controls);
}

function appendPrimaryResultSection(panelEl, card, result) {
  const section = document.createElement("section");
  section.className = "trading-primary-result";
  section.setAttribute("aria-live", "polite");

  const labelRow = document.createElement("div");
  labelRow.className = "primary-result-label-row";

  const label = document.createElement("span");
  label.className = "primary-result-label";
  label.textContent = "PRIMARY RESULT (Net Effect)";
  labelRow.appendChild(label);

  if (result.hint) {
    labelRow.appendChild(
      createInlineTooltipTrigger(panelEl, "Metric", result.hint)
    );
  }

  const metricLabel = document.createElement("div");
  metricLabel.className = "primary-result-metric-label";
  metricLabel.textContent = result.primaryLabel;

  const metricValue = document.createElement("div");
  metricValue.className = "primary-result-value";
  metricValue.textContent = result.primaryValue;

  const secondary = document.createElement("div");
  secondary.className = "primary-result-secondary";
  secondary.textContent = result.secondary;

  section.appendChild(labelRow);
  section.appendChild(metricLabel);
  section.appendChild(metricValue);
  section.appendChild(secondary);

  card.appendChild(section);
}

function appendScheduleSection(card, rules, tradesUsed, elapsedSeconds) {
  const wrapper = document.createElement("div");
  wrapper.className = "trading-details";

  const usedRow = document.createElement("div");
  usedRow.className = "trading-detail-row";
  const usedLabel = document.createElement("span");
  usedLabel.className = "detail-label";
  usedLabel.textContent = "Trades used:";
  const usedValue = document.createElement("span");
  usedValue.className = "detail-value";
  usedValue.textContent = `${tradesUsed} / ${rules.trade_count}`;
  usedRow.appendChild(usedLabel);
  usedRow.appendChild(usedValue);

  wrapper.appendChild(usedRow);

  const nextRow = document.createElement("div");
  nextRow.className = "trading-detail-row";
  const nextLabel = document.createElement("span");
  nextLabel.className = "detail-label";
  nextLabel.textContent = "Next trade:";
  const nextValue = document.createElement("span");
  nextValue.className = "detail-value";

  const nextOffset = rules.unlock_offsets_seconds[tradesUsed] ?? null;
  if (nextOffset === null) {
    nextValue.textContent = "No remaining trades";
  } else if (elapsedSeconds >= nextOffset) {
    nextValue.textContent = "Available now";
  } else {
    nextValue.textContent = `Available in ${formatDurationAbsolute(nextOffset - elapsedSeconds)}`;
  }
  nextRow.appendChild(nextLabel);
  nextRow.appendChild(nextValue);

  wrapper.appendChild(nextRow);

  const scheduleTitle = document.createElement("div");
  scheduleTitle.className = "detail-label";
  scheduleTitle.textContent = "Trade schedule:";
  wrapper.appendChild(scheduleTitle);

  const scheduleList = document.createElement("ul");
  scheduleList.className = "trading-schedule-list";

  if (!rules.trade_count || !rules.unlock_offsets_seconds.length) {
    const item = document.createElement("li");
    item.className = "trading-schedule-item";
    item.textContent = "No trades configured for this round.";
    scheduleList.appendChild(item);
  } else {
    rules.unlock_offsets_seconds.forEach((offset, idx) => {
      const item = document.createElement("li");
      item.className = "trading-schedule-item";

      const left = document.createElement("span");
      left.textContent = `Trade ${idx + 1} at ${formatDurationAbsolute(offset)}`;

      const right = document.createElement("span");
      right.className = "detail-value";
      right.textContent = getScheduleStatus(idx, offset, tradesUsed, elapsedSeconds);

      item.appendChild(left);
      item.appendChild(right);
      scheduleList.appendChild(item);
    });
  }

  wrapper.appendChild(scheduleList);
  card.appendChild(wrapper);
}

function appendActionsSection(panelEl, card, trading) {
  const actions = document.createElement("div");
  actions.className = "trading-actions";

  const executeBtn = document.createElement("button");
  executeBtn.type = "button";
  executeBtn.className = "btn-primary trading-execute-btn";
  executeBtn.textContent = "Execute Conversion";
  executeBtn.disabled = !trading.enabled;

  actions.appendChild(executeBtn);
  actions.appendChild(
    createInlineTooltipTrigger(
      panelEl,
      "Irreversible",
      "This action cannot be undone after confirmation by the backend."
    )
  );

  card.appendChild(actions);
}

function appendStatusSummary(card, trading) {
  const summary = document.createElement("div");
  summary.className = "trading-summary";

  const status = document.createElement("div");
  status.className = "trading-status";
  status.textContent = String(trading.status || "disabled");

  const reason = document.createElement("div");
  reason.className = "trading-reason";
  reason.textContent = String(trading.reason || "Not available");

  summary.appendChild(status);
  summary.appendChild(reason);
  card.appendChild(summary);
}

export function normalizeTradingCapability(rawTrading, fallbackFeeRate = 0.02) {
  if (!rawTrading) {
    return {
      enabled: false,
      status: "disabled",
      reason: "Trading not configured",
      fee_model: "value_fee_rate",
      value_fee_rate: fallbackFeeRate,
      max_trades_per_player: null,
      trade_opens_after_seconds: null,
    };
  }

  return {
    enabled: rawTrading.enabled === true,
    status: String(rawTrading.status || "disabled").toLowerCase(),
    reason: rawTrading.reason || null,
    fee_model: String(rawTrading.fee_model || "value_fee_rate"),
    value_fee_rate:
      typeof rawTrading.value_fee_rate === "number"
        ? rawTrading.value_fee_rate
        : fallbackFeeRate,
    max_trades_per_player:
      typeof rawTrading.max_trades_per_player === "number"
        ? rawTrading.max_trades_per_player
        : null,
    trade_opens_after_seconds:
      typeof rawTrading.trade_opens_after_seconds === "number"
        ? rawTrading.trade_opens_after_seconds
        : null,
  };
}

export function initTradingPanel(deps) {
  const {
    getGameMeta,
    getLastGameData,
    getActiveScoringMode,
    tradingPanelRef,
    tradingStatusRef,
  } = deps || {};

  if (!getGameMeta) {
    console.warn("[trading-panel] initTradingPanel: getGameMeta not provided");
    return;
  }

  if (!tradingPanelRef && !tradingStatusRef) {
    console.warn("[trading-panel] initTradingPanel: no refs provided for trading panel or status");
    return;
  }

  let disposeTooltips = () => {};
  let selectedFromToken = FALLBACK_TOKENS[0];
  let selectedToToken = FALLBACK_TOKENS[1];
  let amountInputValue = "";

  function getTrading() {
    try {
      const meta = getGameMeta();
      const fallbackFee = meta?.conversion_fee_rate || 0.02;
      return normalizeTradingCapability(meta?.trading, fallbackFee);
    } catch (err) {
      console.error("[trading-panel] getTrading error:", err);
      return normalizeTradingCapability(null);
    }
  }

  function getCurrentState() {
    if (typeof getLastGameData !== "function") return null;
    try {
      return getLastGameData() || null;
    } catch (err) {
      console.error("[trading-panel] getLastGameData error:", err);
      return null;
    }
  }

  function keepTokenSelectionValid(tokens) {
    if (!tokens.length) {
      selectedFromToken = FALLBACK_TOKENS[0];
      selectedToToken = FALLBACK_TOKENS[1];
      return;
    }

    if (!tokens.includes(selectedFromToken)) {
      selectedFromToken = tokens[0];
    }
    if (!tokens.includes(selectedToToken)) {
      selectedToToken = tokens.find((token) => token !== selectedFromToken) || tokens[0];
    }
    if (selectedFromToken === selectedToToken && tokens.length > 1) {
      selectedToToken = tokens.find((token) => token !== selectedFromToken) || tokens[0];
    }
  }

  function renderPanelCard(trading) {
    if (!tradingPanelRef) return;

    const meta = getGameMeta() || {};
    const state = getCurrentState() || {};
    const mode = resolveActiveScoringMode(meta, state, getActiveScoringMode);
    const modeName = formatScoringModeName(mode);
    const tokens = resolveTokenList(meta, state);
    keepTokenSelectionValid(tokens);

    const balanceFrom = formatTokenUnits(state?.balances?.[selectedFromToken]);
    const balanceTo = formatTokenUnits(state?.balances?.[selectedToToken]);

    const previewRoot = resolvePreviewRoot(meta, state, trading);
    const previewData = resolvePreviewForSelection(
      previewRoot,
      selectedFromToken,
      selectedToToken
    );
    const result = buildResultSection(mode, previewData);

    const rules = resolveTradingRules(meta, state);
    const tradesUsed = Math.max(
      0,
      Math.min(rules.trade_count, Math.round(Number(state?.trades_used) || 0))
    );
    const elapsedSeconds = resolveRoundElapsedSeconds(meta, state);

    removeManagedTooltips(tradingPanelRef);
    disposeTooltips();

    while (tradingPanelRef.firstChild) {
      tradingPanelRef.removeChild(tradingPanelRef.firstChild);
    }

    const card = createBaseCard(trading, modeName);
    appendControlsSection(card, {
      tokens,
      selectedFromToken,
      selectedToToken,
      amountInputValue,
      balanceFrom,
      balanceTo,
      feePercentage: (trading.value_fee_rate * 100).toFixed(2),
    });
    appendPrimaryResultSection(tradingPanelRef, card, result);
    appendActionsSection(tradingPanelRef, card, trading);
    appendStatusSummary(card, trading);
    appendScheduleSection(card, rules, tradesUsed, elapsedSeconds);

    tradingPanelRef.appendChild(card);
    disposeTooltips = initMicroTooltips(tradingPanelRef);
  }

  function renderBottomStatus(trading) {
    if (!tradingStatusRef) return;

    const statusText = trading.enabled ? "Enabled" : "Not Enabled";
    const feeText = `${(trading.value_fee_rate * 100).toFixed(1)}%`;

    tradingStatusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
    tradingStatusRef.className = trading.enabled
      ? "trading-status-enabled"
      : "trading-status-disabled";
  }

  function renderTradingStatus() {
    const trading = getTrading();
    renderPanelCard(trading);
    renderBottomStatus(trading);
  }

  function handlePanelInput(event) {
    const target = event?.target;
    if (!target || !tradingPanelRef?.contains(target)) return;

    const field = target.getAttribute("data-field");
    if (!field) return;

    if (field === "from-token") {
      selectedFromToken = String(target.value || "").toLowerCase();
    } else if (field === "to-token") {
      selectedToToken = String(target.value || "").toLowerCase();
    } else if (field === "amount") {
      amountInputValue = String(target.value || "");
    }

    renderTradingStatus();
  }

  if (tradingPanelRef) {
    tradingPanelRef.addEventListener("input", handlePanelInput);
    tradingPanelRef.addEventListener("change", handlePanelInput);
  }

  return {
    renderTradingStatus,
    getTrading,
    renderPanelCard,
    renderBottomStatus,
  };
}

export function renderTradingStatus(trading, tradingPanelRef, tradingStatusRef) {
  if (!trading) return;

  if (tradingPanelRef) {
    while (tradingPanelRef.firstChild) {
      tradingPanelRef.removeChild(tradingPanelRef.firstChild);
    }

    const card = createBaseCard(trading, "Stockpile Mode");
    appendPrimaryResultSection(tradingPanelRef, card, {
      primaryLabel: "Total Tokens Change",
      primaryValue: "--",
      secondary: "Units: -- -> --",
      hint: null,
    });
    appendStatusSummary(card, trading);
    appendScheduleSection(card, { trade_count: 0, unlock_offsets_seconds: [] }, 0, 0);
    tradingPanelRef.appendChild(card);
  }

  if (tradingStatusRef) {
    const statusText = trading.enabled ? "Enabled" : "Not Enabled";
    const feeText = `${(trading.value_fee_rate * 100).toFixed(1)}%`;

    tradingStatusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
    tradingStatusRef.className = trading.enabled
      ? "trading-status-enabled"
      : "trading-status-disabled";
  }
}

export function renderBottomBarTradingStatus(data, statusRef) {
  if (!data || !statusRef) return;
  const statusText = data.enabled ? "Enabled" : "Not Enabled";
  const feeText = `${(data.value_fee_rate * 100).toFixed(1)}%`;
  statusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
  statusRef.className = data.enabled
    ? "trading-status-enabled"
    : "trading-status-disabled";
}

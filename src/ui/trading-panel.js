/**
 * File: src/ui/trading-panel.js
 * Purpose: Render trading capability status in UI and normalize trading data from meta contracts.
 * Role: Displays disabled trading scaffold with fee information; supports future enabled trading.
 * Dependencies: DOM globals (document), meta contract shape.
 * Exports: initTradingPanel, normalizeTradingCapability, renderTradingStatus, renderBottomBarTradingStatus.
 * Last updated: 2026-03-25
 * Author/Owner: Platform Team
 */

/**
 * Normalize trading capability from API response with defensive parsing.
 * Handles missing/null trading, converts all numeric fields to safe defaults.
 * @param {Object|null} rawTrading - Raw trading capability from meta response
 * @param {number} fallbackFeeRate - Default fee rate if not specified in trading object
 * @returns {Object} Normalized trading capability with guaranteed fields
 */
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

  const normalized = {
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

  return normalized;
}

/**
 * Initialize trading panel module with dependency injection.
 * Allows tests to mock getGameMeta and refs.
 * @param {Object} deps - Dependencies object
 * @param {Function} deps.getGameMeta - Function returning current game meta
 * @param {HTMLElement} deps.tradingPanelRef - Reference to trading panel container
 * @param {HTMLElement} deps.tradingStatusRef - Reference to bottom-bar status display
 */
export function initTradingPanel(deps) {
  const { getGameMeta, tradingPanelRef, tradingStatusRef } = deps || {};

  if (!getGameMeta) {
    console.warn("[trading-panel] initTradingPanel: getGameMeta not provided");
    return;
  }

  if (!tradingPanelRef && !tradingStatusRef) {
    console.warn("[trading-panel] initTradingPanel: no refs provided for trading panel or status");
    return;
  }

  /**
   * Get current trading capability data with caching safeguard.
   * @returns {Object} Normalized trading capability
   */
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

  /**
   * Render trading panel card content.
   * @param {Object} trading - Normalized trading capability
   */
  function renderPanelCard(trading) {
    if (!tradingPanelRef) return;

    const statusClass = trading.enabled ? "trading-enabled" : "trading-disabled";
    const feePercentage = (trading.value_fee_rate * 100).toFixed(2);

    tradingPanelRef.innerHTML = `
      <div class="trading-card ${statusClass}">
        <div class="trading-card-header">
          <span class="trading-title">Trading</span>
          <span class="trading-badge">${trading.enabled ? "Enabled" : "Scaffold"}</span>
        </div>
        <div class="trading-summary">
          <div class="trading-status">${trading.status}</div>
          <div class="trading-reason">${trading.reason || "Not available"}</div>
        </div>
        <div class="trading-details">
          <div class="trading-detail-row">
            <span class="detail-label">Fee Model:</span>
            <span class="detail-value">${trading.fee_model}</span>
          </div>
          <div class="trading-detail-row">
            <span class="detail-label">Fee Rate:</span>
            <span class="detail-value">${feePercentage}%</span>
          </div>
          ${
            trading.max_trades_per_player !== null
              ? `
            <div class="trading-detail-row">
              <span class="detail-label">Trades/Player:</span>
              <span class="detail-value">${trading.max_trades_per_player}</span>
            </div>
          `
              : ""
          }
          ${
            trading.trade_opens_after_seconds !== null
              ? `
            <div class="trading-detail-row">
              <span class="detail-label">Opens After:</span>
              <span class="detail-value">${Math.round(trading.trade_opens_after_seconds)}s</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  /**
   * Render bottom-bar trading status (compact display).
   * @param {Object} trading - Normalized trading capability
   */
  function renderBottomStatus(trading) {
    if (!tradingStatusRef) return;

    const statusText = trading.enabled ? "Enabled" : "Not Enabled";
    const feeText = `${(trading.value_fee_rate * 100).toFixed(1)}%`;

    tradingStatusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
    tradingStatusRef.className = trading.enabled ? "trading-status-enabled" : "trading-status-disabled";
  }

  /**
   * Public method: Render both panel and bottom-bar trading status.
   * Called from main.js during UI updates.
   */
  function renderTradingStatus() {
    const trading = getTrading();
    renderPanelCard(trading);
    renderBottomStatus(trading);
  }

  // Return public API for testing and external use
  return {
    renderTradingStatus,
    getTrading,
    renderPanelCard,
    renderBottomStatus,
  };
}

/**
 * Render trading status (public wrapper for convenience).
 * Call this method directly from main.js when trading panel refs are managed externally.
 * @param {Object} trading - Normalized trading capability
 * @param {HTMLElement} tradingPanelRef - Panel container
 * @param {HTMLElement} tradingStatusRef - Status display
 */
export function renderTradingStatus(trading, tradingPanelRef, tradingStatusRef) {
  if (!trading) return;

  // Render panel card
  if (tradingPanelRef) {
    const statusClass = trading.enabled ? "trading-enabled" : "trading-disabled";
    const feePercentage = (trading.value_fee_rate * 100).toFixed(2);

    tradingPanelRef.innerHTML = `
      <div class="trading-card ${statusClass}">
        <div class="trading-card-header">
          <span class="trading-title">Trading</span>
          <span class="trading-badge">${trading.enabled ? "Enabled" : "Scaffold"}</span>
        </div>
        <div class="trading-summary">
          <div class="trading-status">${trading.status}</div>
          <div class="trading-reason">${trading.reason || "Not available"}</div>
        </div>
        <div class="trading-details">
          <div class="trading-detail-row">
            <span class="detail-label">Fee Model:</span>
            <span class="detail-value">${trading.fee_model}</span>
          </div>
          <div class="trading-detail-row">
            <span class="detail-label">Fee Rate:</span>
            <span class="detail-value">${feePercentage}%</span>
          </div>
          ${
            trading.max_trades_per_player !== null
              ? `
            <div class="trading-detail-row">
              <span class="detail-label">Trades/Player:</span>
              <span class="detail-value">${trading.max_trades_per_player}</span>
            </div>
          `
              : ""
          }
          ${
            trading.trade_opens_after_seconds !== null
              ? `
            <div class="trading-detail-row">
              <span class="detail-label">Opens After:</span>
              <span class="detail-value">${Math.round(trading.trade_opens_after_seconds)}s</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  // Render bottom-bar status
  if (tradingStatusRef) {
    const statusText = trading.enabled ? "Enabled" : "Not Enabled";
    const feeText = `${(trading.value_fee_rate * 100).toFixed(1)}%`;

    tradingStatusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
    tradingStatusRef.className = trading.enabled ? "trading-status-enabled" : "trading-status-disabled";
  }
}

/**
 * Export public API for bottom-bar status rendering wrapper.
 * @param {Object} data - Contains normalized trading capability
 * @param {HTMLElement} statusRef - Status display reference
 */
export function renderBottomBarTradingStatus(data, statusRef) {
  if (!data || !statusRef) return;
  const statusText = data.enabled ? "Enabled" : "Not Enabled";
  const feeText = `${(data.value_fee_rate * 100).toFixed(1)}%`;
  statusRef.textContent = `Trading: ${statusText} (${feeText} fee)`;
  statusRef.className = data.enabled ? "trading-status-enabled" : "trading-status-disabled";
}

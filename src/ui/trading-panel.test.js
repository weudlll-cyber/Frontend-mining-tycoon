/**
 * File: src/ui/trading-panel.test.js
 * Purpose: Test trading capability scaffold rendering and normalization.
 * Key responsibilities:
 * - Verify normalizeTradingCapability handles missing/null data with sensible defaults
 * - Verify renderTradingStatus populates panel and bottom-bar correctly
 * - Verify initTradingPanel handles dependency injection
 * Test file for src/ui/trading-panel.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeTradingCapability,
  initTradingPanel,
  renderTradingStatus,
  renderBottomBarTradingStatus,
} from './trading-panel.js';

describe('trading-panel', () => {
  describe('normalizeTradingCapability', () => {
    it('returns safe defaults when trading is null', () => {
      const result = normalizeTradingCapability(null);
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('disabled');
      expect(result.fee_model).toBe('value_fee_rate');
      expect(result.value_fee_rate).toBe(0.02); // default fallback
    });

    it('respects custom fallback fee rate when trading is null', () => {
      const result = normalizeTradingCapability(null, 0.05);
      expect(result.value_fee_rate).toBe(0.05);
    });

    it('preserves enabled=true and related scaffold fields', () => {
      const raw = {
        enabled: false,
        status: 'disabled',
        reason: 'Trading scaffold: execution not yet implemented',
        fee_model: 'value_fee_rate',
        value_fee_rate: 0.02,
        max_trades_per_player: null,
        trade_opens_after_seconds: null,
      };
      const result = normalizeTradingCapability(raw);
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('disabled');
      expect(result.reason).toContain('scaffold');
      expect(result.value_fee_rate).toBe(0.02);
    });

    it('converts upper-case status to lower-case', () => {
      const raw = { status: 'DISABLED' };
      const result = normalizeTradingCapability(raw);
      expect(result.status).toBe('disabled');
    });

    it('uses fallback fee rate if trading.value_fee_rate is missing', () => {
      const raw = { status: 'disabled' };
      const result = normalizeTradingCapability(raw, 0.03);
      expect(result.value_fee_rate).toBe(0.03);
    });

    it('ignores invalid numeric fields, uses null instead', () => {
      const raw = {
        status: 'disabled',
        max_trades_per_player: 'not a number',
        trade_opens_after_seconds: null,
      };
      const result = normalizeTradingCapability(raw);
      expect(result.max_trades_per_player).toBe(null);
      expect(result.trade_opens_after_seconds).toBe(null);
    });
  });

  describe('renderTradingStatus', () => {
    let panelEl;
    let statusEl;
    let tooltipLayer;

    beforeEach(() => {
      panelEl = document.createElement('div');
      panelEl.id = 'trading-panel';
      statusEl = document.createElement('span');
      statusEl.id = 'trading-status';
      tooltipLayer = document.createElement('div');
      tooltipLayer.id = 'tooltip-layer';
      document.body.appendChild(panelEl);
      document.body.appendChild(statusEl);
      document.body.appendChild(tooltipLayer);
    });

    afterEach(() => {
      document.body.removeChild(panelEl);
      document.body.removeChild(statusEl);
      document.body.removeChild(tooltipLayer);
    });

    it('renders unified conversion panel shell', () => {
      const trading = normalizeTradingCapability(null);
      renderTradingStatus(trading, panelEl, statusEl);

      expect(panelEl.innerHTML).toContain('Convert Tokens');
      expect(panelEl.innerHTML).toContain('Mode: Stockpile Mode');
      expect(panelEl.innerHTML).toContain('PRIMARY RESULT (Net Effect)');
      expect(panelEl.innerHTML).toContain('Total Tokens Change');
    });

    it('renders bottom-bar status text', () => {
      const trading = normalizeTradingCapability(null, 0.02);
      renderTradingStatus(trading, panelEl, statusEl);

      expect(statusEl.textContent).toContain('Trading:');
      expect(statusEl.textContent).toContain('Not Enabled');
      expect(statusEl.textContent).toContain('2.0%');
    });

    it('renders safe fallback panel content without throwing', () => {
      const trading = normalizeTradingCapability(null, 0.05);
      renderTradingStatus(trading, panelEl, statusEl);

      expect(panelEl.innerHTML).toContain('Convert Tokens');
      expect(panelEl.innerHTML).toContain('Trade schedule');
    });

    it('handles missing panel ref gracefully', () => {
      const trading = normalizeTradingCapability(null);
      expect(() => renderTradingStatus(trading, null, statusEl)).not.toThrow();
    });

    it('handles missing status ref gracefully', () => {
      const trading = normalizeTradingCapability(null);
      expect(() => renderTradingStatus(trading, panelEl, null)).not.toThrow();
    });
  });

  describe('renderBottomBarTradingStatus', () => {
    let statusEl;

    beforeEach(() => {
      statusEl = document.createElement('span');
      document.body.appendChild(statusEl);
    });

    afterEach(() => {
      document.body.removeChild(statusEl);
    });

    it('renders compact status text for disabled trading', () => {
      const trading = normalizeTradingCapability(null, 0.02);
      renderBottomBarTradingStatus(trading, statusEl);

      expect(statusEl.textContent).toContain('Not Enabled');
      expect(statusEl.textContent).toContain('2.0%');
    });

    it('applies trading-status-disabled class for disabled trading', () => {
      const trading = normalizeTradingCapability(null);
      renderBottomBarTradingStatus(trading, statusEl);

      expect(statusEl.className).toBe('trading-status-disabled');
    });

    it('applies trading-status-enabled class for enabled trading', () => {
      const trading = {
        enabled: true,
        value_fee_rate: 0.01,
      };
      renderBottomBarTradingStatus(trading, statusEl);

      expect(statusEl.className).toBe('trading-status-enabled');
    });

    it('handles null data gracefully', () => {
      expect(() => renderBottomBarTradingStatus(null, statusEl)).not.toThrow();
    });
  });

  describe('initTradingPanel', () => {
    let panelEl;
    let statusEl;
    let tooltipLayer;

    beforeEach(() => {
      panelEl = document.createElement('div');
      statusEl = document.createElement('span');
      tooltipLayer = document.createElement('div');
      tooltipLayer.id = 'tooltip-layer';
      document.body.appendChild(panelEl);
      document.body.appendChild(statusEl);
      document.body.appendChild(tooltipLayer);
    });

    afterEach(() => {
      document.body.removeChild(panelEl);
      document.body.removeChild(statusEl);
      document.body.removeChild(tooltipLayer);
    });

    it('returns null when getGameMeta is not provided', () => {
      const api = initTradingPanel({});
      // Should warn but not throw
      expect(api).toBeUndefined();
    });

    it('warns when no refs are provided', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      initTradingPanel({ getGameMeta: () => ({}) });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no refs provided')
      );
      warn.mockRestore();
    });

    it('returns API with renderTradingStatus method when refs are provided', () => {
      const getMeta = () => ({ conversion_fee_rate: 0.02, trading: null });
      const api = initTradingPanel({
        getGameMeta: getMeta,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      expect(api).toBeDefined();
      expect(api.renderTradingStatus).toBeDefined();
      expect(typeof api.renderTradingStatus).toBe('function');
    });

    it('renderTradingStatus updates panel and status when called', () => {
      const getMeta = () => ({ conversion_fee_rate: 0.02, trading: null });
      const api = initTradingPanel({
        getGameMeta: getMeta,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();

      expect(panelEl.innerHTML).toContain('trading-card');
      expect(panelEl.innerHTML).toContain('Trades used:');
      expect(statusEl.textContent).toContain('Trading:');
    });

    it('uses season labels when token_names is an array and balances use numeric keys', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        token_names: ['spring', 'summer', 'autumn', 'winter'],
        trading: { enabled: true, status: 'enabled', value_fee_rate: 0.02 },
      });
      const getLastGameData = () => ({
        balances: { 0: 100, 1: 80 },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      expect(panelEl.textContent).toContain('Balance (Spring):');
      expect(panelEl.textContent).toContain('Balance (Summer):');
      expect(panelEl.textContent).not.toContain('Balance (0):');
      expect(panelEl.textContent).not.toContain('Balance (1):');
    });

    it('updates stockpile estimate while typing amount without full rebuild', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'stockpile',
        trading: { enabled: true, status: 'enabled', value_fee_rate: 0.02 },
      });
      const getLastGameData = () => ({
        balances: { spring: 1000, summer: 500 },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      const amountInput = panelEl.querySelector('input[data-field="amount"]');
      expect(amountInput).not.toBeNull();

      amountInput.value = '100';
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(panelEl.textContent).toContain('Units: -100 -> +98');
      expect(panelEl.textContent).toContain('-2 tokens');
    });

    it('prefers backend oracle pair preview rate for stockpile amount estimate', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'stockpile',
        trading: { enabled: true, status: 'enabled', value_fee_rate: 0.02 },
      });
      const getLastGameData = () => ({
        balances: { spring: 1000, summer: 500 },
        conversion_preview: {
          by_pair: {
            'spring:summer': {
              net_to_per_from: 0.5,
            },
          },
        },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      const amountInput = panelEl.querySelector('input[data-field="amount"]');
      expect(amountInput).not.toBeNull();

      amountInput.value = '100';
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(panelEl.textContent).toContain('Units: -100 -> +50');
      expect(panelEl.textContent).toContain('-50 tokens');
    });

    it('renders trades used / total and full schedule list', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'stockpile',
        game_duration_seconds: 600,
        trading: null,
      });
      const getLastGameData = () => ({
        seconds_remaining: 600,
        trades_used: 1,
        trading_rules: {
          trade_count: 3,
          unlock_offsets_seconds: [120, 360, 540],
        },
        balances: { spring: 1000, summer: 900 },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });
      api.renderTradingStatus();

      expect(panelEl.textContent).toContain('Trades used:');
      expect(panelEl.textContent).toContain('1 / 3');
      expect(panelEl.textContent).toContain('Trade 1 at 2m 0s');
      expect(panelEl.textContent).toContain('Trade 2 at 6m 0s');
      expect(panelEl.textContent).toContain('Trade 3 at 9m 0s');
      expect(panelEl.textContent).toContain('Used');
      expect(panelEl.textContent).toContain('Available in');
    });

    it('shows Power Mode primary result when meta scoring_mode is power', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'power',
        trading: null,
      });
      const getLastGameData = () => ({
        balances: { spring: 1000, summer: 800 },
        conversion_preview: {
          weighted_score_change_pct: 8.2,
          weighted_score_before: 100.4,
          weighted_score_after: 108.6,
        },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      expect(panelEl.innerHTML).toContain('Mode: Power Mode');
      expect(panelEl.innerHTML).toContain('Weighted Score Change');
      expect(panelEl.innerHTML).toMatch(/\+8[.,]2%/);
      expect(panelEl.innerHTML).toContain('Score: 100.40 -&gt; 108.60');
    });

    it('shows Mining Time Equivalent primary result and tooltip hint', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'mining_time_equivalent',
        trading: null,
      });
      const getLastGameData = () => ({
        balances: { spring: 1000, summer: 800 },
        conversion_preview: {
          mining_time_change_seconds: 16320,
          mining_time_before_seconds: 3600,
          mining_time_after_seconds: 19920,
        },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      expect(panelEl.innerHTML).toContain('Mode: Mining Time Equivalent Mode');
      expect(panelEl.innerHTML).toContain('Mining Time Equivalent Change');
      expect(panelEl.innerHTML).toContain('+4h 32m');
      expect(panelEl.innerHTML).toContain('Metric info');
    });

    it('shows Efficiency primary result when mode is efficiency', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.02,
        scoring_mode: 'efficiency',
        trading: null,
      });
      const getLastGameData = () => ({
        balances: { spring: 1000, summer: 800 },
        conversion_preview: {
          efficiency_change_pct: 6.4,
          efficiency_before: 88,
          efficiency_after: 94.4,
        },
      });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      expect(panelEl.innerHTML).toContain('Mode: Efficiency Mode');
      expect(panelEl.innerHTML).toContain('Efficiency Impact');
      expect(panelEl.innerHTML).toMatch(/\+6[.,]4%/);
    });

    it('keeps stockpile mode as default and shows neutral placeholders when preview is unavailable', () => {
      const getMeta = () => ({ conversion_fee_rate: 0.02, trading: null });
      const getLastGameData = () => ({ balances: { spring: 100 } });

      const api = initTradingPanel({
        getGameMeta: getMeta,
        getLastGameData,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      api.renderTradingStatus();
      expect(panelEl.innerHTML).toContain('Mode: Stockpile Mode');
      expect(panelEl.innerHTML).toContain('Total Tokens Change');
      expect(panelEl.innerHTML).toContain('--');
    });

    it('getTrading normalizes meta.trading with conversion_fee_rate fallback', () => {
      const getMeta = () => ({
        conversion_fee_rate: 0.03,
        trading: { status: 'disabled', value_fee_rate: 0.03 },
      });
      const api = initTradingPanel({
        getGameMeta: getMeta,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      const trading = api.getTrading();
      expect(trading.value_fee_rate).toBe(0.03);
      expect(trading.status).toBe('disabled');
    });

    it('getTrading falls back to 0.02 if conversion_fee_rate is missing', () => {
      const getMeta = () => ({});
      const api = initTradingPanel({
        getGameMeta: getMeta,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      const trading = api.getTrading();
      expect(trading.value_fee_rate).toBe(0.02);
    });

    it('handles getGameMeta errors gracefully', () => {
      const getMeta = () => {
        throw new Error('Meta fetch failed');
      };
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const api = initTradingPanel({
        getGameMeta: getMeta,
        tradingPanelRef: panelEl,
        tradingStatusRef: statusEl,
      });

      const trading = api.getTrading();
      expect(trading.enabled).toBe(false);
      expect(err).toHaveBeenCalled();
      const firstCall = err.mock.calls[0];
      expect(firstCall[0]).toContain('[trading-panel] getTrading error');
      err.mockRestore();
    });
  });
});

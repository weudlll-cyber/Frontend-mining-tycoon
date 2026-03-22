/*
File: src/state/halving-store.js
Purpose: Central driftless halving state store (singleton) with per-second ticker.
Owns:
- authoritativeTarget (next_halving_unix | null)
- fallbackDeltaSeconds (number | null)
- Driftless per-second ticker (via performance.now())
- Subscriber notifications
- SSE capture ring-buffer (last 50 snapshots)
Guarantees:
- Single instance per page (singleton)
- Per-second ticks independent of SSE cadence (even if SSE is ~8s interval)
- getSecondsRemaining() is driftless (performance.now() based)
- SSE paths NEVER write DOM directly; only reAnchor* calls
- Visible mm:ss changes every second even with sparse SSE updates
*/

const _HALVING_STORE_INSTANCE_KEY = '__HALVING_STORE_SINGLETON__';
const _SSE_CAPTURE_MAX = 50;
const _DEBUG_FLAG_KEY = '__HALVING_STORE_DEBUG__';

let _instance = null;

function isDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return Boolean(window[_DEBUG_FLAG_KEY]);
}

function debugLog(label, data) {
  if (!isDebugEnabled()) return;
  console.info(`[halving-store] ${label}`, data);
}

function snapshotHalvingDomText() {
  if (typeof document === 'undefined') return null;
  const footerLabel = document.getElementById('halving-label');
  const gridCell = document.querySelector('[data-halving-grid]');
  return {
    footer: footerLabel?.textContent ?? null,
    grid: gridCell?.textContent ?? null,
  };
}

function assertHalvingDomUnchanged(beforeSnapshot, origin) {
  if (!beforeSnapshot || typeof document === 'undefined') return;

  const footerLabel = document.getElementById('halving-label');
  const gridCell = document.querySelector('[data-halving-grid]');
  const afterFooter = footerLabel?.textContent ?? null;
  const afterGrid = gridCell?.textContent ?? null;

  if (
    beforeSnapshot.footer !== afterFooter ||
    beforeSnapshot.grid !== afterGrid
  ) {
    throw new Error(
      `[halving-store] ${origin} mutated halving DOM directly. ` +
        'Only ticker subscribers may write #halving-label/[data-halving-grid].'
    );
  }
}

/**
 * HalvingStore singleton class
 */
class HalvingStore {
  constructor() {
    // Authoritative anchor (from SSE)
    this.authoritativeTarget = null; // { next_halving_unix, server_now_unix, token, halvingMonth }
    this.anchorPerfNow_auth = null;
    this.initialRemainingMs_auth = null;

    // Fallback anchor (when authoritative unavailable)
    this.fallbackDeltaSeconds = null;
    this.anchorPerfNow_fallback = null;
    this.initialRemainingMs_fallback = null;

    // Ticker state
    this._tickerRunning = false;
    this._tickerTimeoutId = null;
    this._lastRenderedSeconds = new Map(); // node -> seconds
    this._lastRenderedMmss = new Map(); // node -> mmss string

    // Subscribers
    this._subscribers = new Set();

    // SSE capture ring-buffer
    this._sseCapture = [];
    this._sseCaptureIndex = 0;

    // Reanchor tracking
    this._reanchorCount = 0;
    this._lastReanchorReason = '';

    // Monotonic guard: track if authoritative changed
    this._authoritativeChanged = false;
  }

  /**
   * Start the per-second ticker if not running.
   */
  start() {
    if (this._tickerRunning) return;
    this._tickerRunning = true;
    debugLog('start ticker', {});
    this._scheduleNextTick();
  }

  /**
   * Stop the per-second ticker.
   */
  stop() {
    if (!this._tickerRunning) return;
    this._tickerRunning = false;
    if (this._tickerTimeoutId) {
      clearTimeout(this._tickerTimeoutId);
      this._tickerTimeoutId = null;
    }
    debugLog('stop ticker', {});
  }

  /**
   * Re-anchor from authoritative SSE source (next_halving_unix).
   * @param {number} nextHalvingUnix - server unix timestamp
   * @param {number} serverNowUnix - server unix timestamp at message send
   * @param {string} token - token name
   * @param {number} halvingMonth - halving month
   */
  reAnchorAuthoritative(nextHalvingUnix, serverNowUnix, token, halvingMonth) {
    const domBefore = isDebugEnabled() ? snapshotHalvingDomText() : null;
    const nextUnix = Number(nextHalvingUnix);
    const serverNow = Number(serverNowUnix);
    if (!Number.isFinite(nextUnix) || !Number.isFinite(serverNow)) {
      this.reset();
      return;
    }

    const prevTarget = this.authoritativeTarget;
    const prevUnix = prevTarget?.next_halving_unix ?? null;

    // Only re-anchor if target changed by >= 1 second
    const sameTarget = prevUnix !== null && Math.abs(prevUnix - nextUnix) < 1;

    if (sameTarget) {
      // Same target: refresh anchor time only
      const nowPerfMs = performance.now();
      const remainingMs = Math.max(0, (nextUnix - serverNow) * 1000);
      this.anchorPerfNow_auth = nowPerfMs;
      this.initialRemainingMs_auth = remainingMs;
      this._authoritativeChanged = false;
      this._lastReanchorReason = 'authoritative_same_target';
      debugLog('reAnchorAuthoritative skip', {
        prevUnix,
        nextUnix,
        reason: 'same_target',
      });
    } else {
      // Target changed: new anchor
      const nowPerfMs = performance.now();
      const remainingMs = Math.max(0, (nextUnix - serverNow) * 1000);
      this.authoritativeTarget = {
        next_halving_unix: nextUnix,
        server_now_unix: serverNow,
        token,
        halvingMonth,
      };
      this.anchorPerfNow_auth = nowPerfMs;
      this.initialRemainingMs_auth = remainingMs;
      this.fallbackDeltaSeconds = null; // clear fallback when auth updates
      this._authoritativeChanged = true;
      this._lastReanchorReason = 'authoritative_target_changed';
      this._reanchorCount += 1;
      debugLog('reAnchorAuthoritative new', {
        nextUnix,
        serverNow,
        token,
        halvingMonth,
      });
    }

    // Capture SSE snapshot
    this._captureSSESnapshot({
      path: 'authoritative',
      next_halving_unix: nextUnix,
      server_now_unix: serverNow,
      delta_seconds: null,
      token,
      halving_month: halvingMonth,
    });

    // Start ticker
    this.start();

    if (isDebugEnabled()) {
      assertHalvingDomUnchanged(domBefore, 'reAnchorAuthoritative');
    }
  }

  /**
   * Re-anchor from fallback source (computed delta seconds, no absolute unix).
   * Called when SSE provides remaining time calculation instead of absolute unix.
   * @param {number} deltaSeconds - remaining seconds from computation
   * @param {string} token - token name
   * @param {number} halvingMonth - halving month
   */
  reAnchorFallback(deltaSeconds, token, halvingMonth) {
    const domBefore = isDebugEnabled() ? snapshotHalvingDomText() : null;
    const nextDelta = Number(deltaSeconds);
    if (!Number.isFinite(nextDelta) || nextDelta < 0) {
      this.reset();
      return;
    }

    const prevDelta = this.fallbackDeltaSeconds ?? null;
    const sameDelta = prevDelta !== null && Math.abs(nextDelta - prevDelta) < 1;

    if (sameDelta) {
      // Same delta: refresh anchor time only
      const nowPerfMs = performance.now();
      this.anchorPerfNow_fallback = nowPerfMs;
      this.initialRemainingMs_fallback = nextDelta * 1000;
      this._authoritativeChanged = false;
      this._lastReanchorReason = 'fallback_same_delta';
      debugLog('reAnchorFallback skip', {
        prevDelta,
        nextDelta,
        reason: 'same_delta',
      });
    } else {
      // Delta changed: new anchor
      const nowPerfMs = performance.now();
      this.fallbackDeltaSeconds = nextDelta;
      this.anchorPerfNow_fallback = nowPerfMs;
      this.initialRemainingMs_fallback = nextDelta * 1000;
      this.authoritativeTarget = null; // clear auth when fallback updates
      this._authoritativeChanged = false;
      this._lastReanchorReason = 'fallback_delta_changed';
      this._reanchorCount += 1;
      debugLog('reAnchorFallback new', {
        deltaSeconds: nextDelta,
        token,
        halvingMonth,
      });
    }

    // Capture SSE snapshot
    this._captureSSESnapshot({
      path: 'fallback',
      next_halving_unix: null,
      server_now_unix: null,
      delta_seconds: nextDelta,
      token,
      halving_month: halvingMonth,
    });

    // Start ticker
    this.start();

    if (isDebugEnabled()) {
      assertHalvingDomUnchanged(domBefore, 'reAnchorFallback');
    }
  }

  /**
   * Get current seconds remaining (driftless, based on performance.now()).
   * Returns integer floor of seconds.
   */
  getSecondsRemaining() {
    let remainingMs = 0;

    if (this.authoritativeTarget !== null) {
      // Authoritative path
      if (!Number.isFinite(this.anchorPerfNow_auth)) return null;
      const elapsedMs = Math.max(
        0,
        performance.now() - this.anchorPerfNow_auth
      );
      remainingMs = Math.max(0, this.initialRemainingMs_auth - elapsedMs);
    } else if (this.fallbackDeltaSeconds !== null) {
      // Fallback path
      if (!Number.isFinite(this.anchorPerfNow_fallback)) return null;
      const elapsedMs = Math.max(
        0,
        performance.now() - this.anchorPerfNow_fallback
      );
      remainingMs = Math.max(0, this.initialRemainingMs_fallback - elapsedMs);
    } else {
      return null; // No anchor
    }

    return Math.floor(remainingMs / 1000);
  }

  /**
   * Subscribe to per-second ticks.
   * Listener receives { seconds: number | null, mmss: string }.
   * @returns unsubscribe function
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('listener must be a function');
    }
    this._subscribers.add(listener);
    return () => {
      this._subscribers.delete(listener);
    };
  }

  /**
   * Reset to initial state (no anchors, no ticker).
   */
  reset() {
    this.authoritativeTarget = null;
    this.anchorPerfNow_auth = null;
    this.initialRemainingMs_auth = null;
    this.fallbackDeltaSeconds = null;
    this.anchorPerfNow_fallback = null;
    this.initialRemainingMs_fallback = null;
    this._authoritativeChanged = false;
    this.stop();
    debugLog('reset store', {});
  }

  /**
   * Get SSE capture ring-buffer (last N snapshots).
   */
  getSSECaptures() {
    return [...this._sseCapture];
  }

  /**
   * Get reanchor statistics.
   */
  getReanchorStats() {
    return {
      count: this._reanchorCount,
      lastReason: this._lastReanchorReason,
    };
  }

  /* ========== Internal ========== */

  _scheduleNextTick() {
    if (!this._tickerRunning) return;

    const now = performance.now();
    const remainder = now % 1000;
    const nextDelayMs = remainder === 0 ? 1000 : 1000 - remainder;

    this._tickerTimeoutId = setTimeout(() => {
      if (!this._tickerRunning) return;
      this._onTick();
      this._scheduleNextTick();
    }, nextDelayMs);
  }

  _onTick() {
    const seconds = this.getSecondsRemaining();
    const mmss = seconds !== null ? this._formatMmss(seconds) : '';

    // Notify subscribers
    for (const listener of this._subscribers) {
      try {
        listener({
          seconds: seconds ?? null,
          mmss,
          authoritativeChanged: this._authoritativeChanged,
        });
      } catch (err) {
        console.error('[halving-store] subscriber error:', err);
      }
    }

    this._authoritativeChanged = false;
  }

  _formatMmss(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  _captureSSESnapshot(data) {
    const snapshot = {
      tsClient: Date.now(),
      ...data,
    };
    this._sseCapture[this._sseCaptureIndex % _SSE_CAPTURE_MAX] = snapshot;
    this._sseCaptureIndex += 1;
  }
}

/**
 * Get or create the singleton halving store.
 */
export function getHalvingStore() {
  if (_instance === null) {
    _instance = new HalvingStore();
    if (typeof window !== 'undefined') {
      window[_HALVING_STORE_INSTANCE_KEY] = _instance;
    }
  }
  return _instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetHalvingStoreForTest() {
  if (_instance) {
    _instance.stop();
  }
  _instance = null;
  if (typeof window !== 'undefined') {
    delete window[_HALVING_STORE_INSTANCE_KEY];
  }
}

/**
 * Enable/disable debug logging.
 */
export function setHalvingStoreDebug(enabled = true) {
  if (typeof window !== 'undefined') {
    window[_DEBUG_FLAG_KEY] = Boolean(enabled);
  }
}

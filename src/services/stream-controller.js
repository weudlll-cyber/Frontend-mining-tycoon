/**
File: src/services/stream-controller.js
Purpose: Own SSE lifecycle, reconnect state, and timer cleanup around live game streaming.
Role in system:
- Switches between legacy game streams and session-scoped streams based on explicit session context from the orchestrator.
Invariants:
- Session streams must not silently fall back to legacy game streams once a session exists.
- Every (re)connect fetches a fresh short-lived SSE ticket (backend TTL is 60 s):
  the native EventSource auto-reconnect would replay the original, expired ticket
  URL, so on error the source is closed and reopened by this module with backoff.
Security notes:
- Parse SSE payloads defensively.
- The ticket is a short-lived, single-purpose credential; it is never logged.
*/

import { debugLog } from '../utils/debug-log.js';

// Backoff schedule for controller-driven reconnects (ms). The last value repeats.
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 15000];
// After this many consecutive failed reconnect attempts the stream gives up
// and surfaces an error instead of retrying forever.
export const MAX_RECONNECT_ATTEMPTS = 20;

let _deps = null;
let _eventSource = null;
let _waitingTimer = null;
let _reconnectTimer = null;
let _reconnectAttempts = 0;
// Incremented on every startStream/close so stale async work (ticket fetches,
// reconnect timers) from a previous stream can detect it was superseded.
let _streamGeneration = 0;
let _intentionalClose = false;
let _payloadLogged = false;

export function initStreamController(deps) {
  _deps = deps;
}

function clearWaitingTimer() {
  if (_waitingTimer) {
    clearTimeout(_waitingTimer);
    _waitingTimer = null;
  }
}

function clearReconnectTimer() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

export function closeEventSourceIfOpen() {
  clearReconnectTimer();
  _streamGeneration += 1;
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }
}

function getReconnectDelayMs(attempt) {
  const index = Math.min(Math.max(attempt, 1), RECONNECT_DELAYS_MS.length) - 1;
  return RECONNECT_DELAYS_MS[index];
}

export function stopLiveTimersAndHalving() {
  if (!_deps) {
    clearWaitingTimer();
    return;
  }

  _deps.clearCountdownInterval();
  _deps.stopNextHalvingCountdown();
  _deps.stopSeasonHalvingTimers();
  clearWaitingTimer();
  _deps.resetTransientHalvingState();
}

export function hasOpenStream() {
  return Boolean(_eventSource);
}

export function startStream(gameId, playerId, streamContext = {}) {
  debugLog('stream', 'startStream invoked', {
    gameId,
    hasSessionId: Boolean(streamContext?.sessionId),
    requiresPlayerAuth: Boolean(streamContext?.requiresPlayerAuth),
    roundMode: streamContext?.roundMode || 'unknown',
  });

  _deps.onStreamStateChange(true);
  _deps.updateSetupActionsState();

  if (_eventSource) {
    _intentionalClose = true;
    stopLiveTimersAndHalving();
    closeEventSourceIfOpen();
  }

  const base = _deps.getNormalizedBaseUrlOrNull();
  if (!base) {
    _deps.onStreamStateChange(false);
    _deps.updateSetupActionsState();
    return;
  }

  void _deps.connectChat();

  async function buildSseUrl() {
    const sessionId = streamContext?.sessionId;
    const isAsyncRound =
      String(streamContext?.roundMode || '').toLowerCase() === 'async';
    const encodedGameId = encodeURIComponent(gameId);
    const encodedPlayerId = encodeURIComponent(playerId);
    const encodedSessionId = encodeURIComponent(sessionId || '');

    if (isAsyncRound && !sessionId) {
      throw new Error('Async session required before starting stream.');
    }

    const baseStreamUrl = sessionId
      ? `${base}/sessions/${encodedSessionId}/stream?player_id=${encodedPlayerId}`
      : `${base}/games/${encodedGameId}/stream?player_id=${encodedPlayerId}`;

    // WHY: EventSource cannot send X-Player-Token, so the backend accepts a
    // short-lived ticket query param instead (required for both game and
    // session streams when REQUIRE_PLAYER_AUTH is on). Always request a fresh
    // one per connect attempt; tickets expire after 60 s.
    const ticketResult = await _deps.getStreamTicket({
      gameId,
      playerId,
      requirePlayerAuth: Boolean(streamContext?.requiresPlayerAuth),
    });
    if (!ticketResult?.ok) {
      throw new Error(
        ticketResult?.message || 'Unable to open authenticated stream.'
      );
    }
    if (ticketResult.ticket) {
      return `${baseStreamUrl}&ticket=${encodeURIComponent(ticketResult.ticket)}`;
    }
    // Once a session exists, staying on the session transport preserves
    // backend-authoritative context and avoids silent drift.
    return baseStreamUrl;
  }

  function finishStream() {
    _intentionalClose = true;
    _deps.onStreamStateChange(false);
    closeEventSourceIfOpen();
    _deps.clearCountdownInterval();
    _deps.stopNextHalvingCountdown();
    clearWaitingTimer();
    _deps.disconnectChat();
    _deps.updateSetupActionsState();
  }

  function giveUp(message) {
    _deps.onStreamStateChange(false);
    _deps.updateSetupActionsState();
    _deps.setBadgeStatus(_deps.connStatusEl, 'idle');
    _deps.onSessionStreamError?.(message);
  }

  function scheduleReconnect(generation) {
    if (generation !== _streamGeneration || _intentionalClose) return;
    clearReconnectTimer();
    _reconnectAttempts += 1;
    if (_reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      giveUp('Live stream connection lost. Please re-enter the game.');
      return;
    }
    _deps.setBadgeStatus(_deps.connStatusEl, 'reconnecting');
    const delay = getReconnectDelayMs(_reconnectAttempts);
    debugLog('stream', 'scheduling reconnect', {
      attempt: _reconnectAttempts,
      delay,
    });
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (generation !== _streamGeneration || _intentionalClose) return;
      connect(generation, { isReconnect: true });
    }, delay);
  }

  function openEventSource(url, generation) {
    _eventSource = new EventSource(url);

    _eventSource.onopen = () => {
      _deps.setBadgeStatus(_deps.connStatusEl, 'waiting');
      _deps.updateSetupActionsState();

      clearWaitingTimer();
      _waitingTimer = setTimeout(() => {
        if (_eventSource && _eventSource.readyState === EventSource.OPEN) {
          _deps.setBadgeStatus(_deps.connStatusEl, 'waiting');
        }
      }, 3000);

      _deps
        .fetchMetaSnapshot(base, gameId)
        .catch((err) => console.warn('Meta refresh on connect failed:', err));
    };

    _eventSource.onmessage = (event) => {
      clearWaitingTimer();
      _reconnectAttempts = 0;
      _deps.setBadgeStatus(_deps.connStatusEl, 'connected');

      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error('Failed to parse SSE data.');
        return;
      }

      if (!_payloadLogged) {
        // Payload structure logged once for debugging (if needed, can be re-enabled)
        _payloadLogged = true;
      }

      _deps.onData(data);

      const sessionStatus = String(data?.session?.status || '').toLowerCase();
      if (sessionStatus === 'finished') {
        finishStream();
        _deps.onSessionStreamFinished?.(data);
        return;
      }

      if (data?.game_status === 'finished') {
        finishStream();
      }
    };

    _eventSource.onerror = () => {
      clearWaitingTimer();

      if (_intentionalClose || generation !== _streamGeneration) {
        _deps.onStreamStateChange(false);
        _deps.setBadgeStatus(_deps.connStatusEl, 'idle');
        _deps.updateSetupActionsState();
        return;
      }

      // WHY: close the native source so the browser does not auto-reconnect
      // with the original (by now possibly expired) ticket URL; reconnect
      // ourselves with a freshly issued ticket instead.
      if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
      }
      scheduleReconnect(generation);
    };
  }

  function connect(generation, { isReconnect = false } = {}) {
    buildSseUrl()
      .then((url) => {
        if (generation !== _streamGeneration || _intentionalClose) return;
        openEventSource(url, generation);
      })
      .catch((error) => {
        if (generation !== _streamGeneration) return;
        if (isReconnect) {
          // Ticket/network failures during reconnect are usually transient.
          scheduleReconnect(generation);
          return;
        }
        giveUp(error?.message || 'Unable to start session stream.');
      });
  }

  _deps.setBadgeStatus(_deps.connStatusEl, 'reconnecting');
  _intentionalClose = false;
  _reconnectAttempts = 0;
  clearReconnectTimer();
  _streamGeneration += 1;
  connect(_streamGeneration);
}

/*
File: src/services/stream-controller.js
Purpose: Own SSE lifecycle, reconnect state, and timer cleanup around live game streaming.
Role in system:
- Switches between legacy game streams and session-scoped streams based on explicit session context from the orchestrator.
Invariants:
- Session streams must not silently fall back to legacy game streams once a session exists.
- Ticket query parameter is used only for authenticated session streams.
Security notes:
- Parse SSE payloads defensively.
- Never append sensitive query params unless the backend requires the short-lived ticket flow.
*/

import { debugLog } from '../utils/debug-log.js';

let _deps = null;
let _eventSource = null;
let _waitingTimer = null;
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

export function closeEventSourceIfOpen() {
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }
}

export function stopLiveTimersAndHalving() {
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
    const encodedGameId = encodeURIComponent(gameId);
    const encodedPlayerId = encodeURIComponent(playerId);
    const encodedSessionId = encodeURIComponent(sessionId || '');
    const baseStreamUrl = sessionId
      ? `${base}/sessions/${encodedSessionId}/stream?player_id=${encodedPlayerId}`
      : `${base}/games/${encodedGameId}/stream?player_id=${encodedPlayerId}`;

    if (!sessionId) {
      return baseStreamUrl;
    }

    // WHY: Authenticated session streams require a short-lived ticket because EventSource cannot send custom headers.
    if (streamContext?.requiresPlayerAuth) {
      const ticketResult = await _deps.getSessionStreamTicket({
        gameId,
        playerId,
        requirePlayerAuth: true,
      });
      if (!ticketResult?.ok || !ticketResult.ticket) {
        throw new Error(
          ticketResult?.message ||
            'Unable to open authenticated session stream.'
        );
      }
      return `${baseStreamUrl}&ticket=${encodeURIComponent(ticketResult.ticket)}`;
    }

    // WHY: Once a session exists, staying on the session transport preserves backend-authoritative context and avoids silent drift.
    return baseStreamUrl;
  }

  _deps.setBadgeStatus(_deps.connStatusEl, 'reconnecting');
  _intentionalClose = false;

  buildSseUrl()
    .then((url) => {
      _eventSource = new EventSource(url);

      _eventSource.onopen = () => {
        _deps.setBadgeStatus(_deps.connStatusEl, 'waiting');
        _deps.updateSetupActionsState();

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
        _deps.setBadgeStatus(_deps.connStatusEl, 'connected');

        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          console.error('Failed to parse SSE data:', event.data);
          return;
        }

        if (!_payloadLogged) {
          console.log('SSE payload keys:', Object.keys(data));
          if (data.upgrade_metrics) {
            console.log('upgrade_metrics structure:', data.upgrade_metrics);
          }
          if (data.player_state) {
            console.log('player_state keys:', Object.keys(data.player_state));
          }
          _payloadLogged = true;
        }

        _deps.onData(data);

        if (data?.game_status === 'finished') {
          _intentionalClose = true;
          _deps.onStreamStateChange(false);
          closeEventSourceIfOpen();
          _deps.clearCountdownInterval();
          _deps.stopNextHalvingCountdown();
          clearWaitingTimer();
          _deps.disconnectChat();
          _deps.updateSetupActionsState();
        }
      };

      _eventSource.onerror = () => {
        clearWaitingTimer();

        if (!_intentionalClose) {
          _deps.setBadgeStatus(_deps.connStatusEl, 'reconnecting');
          console.log(
            'Connection error, readyState:',
            _eventSource?.readyState
          );
        } else {
          _deps.onStreamStateChange(false);
          _deps.setBadgeStatus(_deps.connStatusEl, 'idle');
          _deps.updateSetupActionsState();
        }
      };
    })
    .catch((error) => {
      _deps.onStreamStateChange(false);
      _deps.updateSetupActionsState();
      _deps.setBadgeStatus(_deps.connStatusEl, 'idle');
      _deps.onSessionStreamError?.(
        error?.message || 'Unable to start session stream.'
      );
    });
}

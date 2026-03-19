/*
File: src/services/stream-controller.js
Purpose: Own SSE lifecycle, reconnect state, and timer cleanup around live game streaming.
*/

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

    const ticketUrl = sessionId
      ? `${base}/sessions/${encodedSessionId}/sse-ticket?player_id=${encodedPlayerId}`
      : `${base}/games/${encodedGameId}/sse-ticket?player_id=${encodedPlayerId}`;

    const playerToken = _deps.getStorageItem(
      _deps.getPlayerTokenStorageKey(gameId, playerId)
    );
    try {
      const ticketResp = await fetch(ticketUrl, {
        headers: playerToken ? { 'X-Player-Token': playerToken } : {},
      });
      if (ticketResp.ok) {
        const ticketData = await ticketResp.json();
        if (ticketData.ticket) {
          return `${baseStreamUrl}&ticket=${encodeURIComponent(ticketData.ticket)}`;
        }
      }
    } catch {
      // Dev mode can still fall back to a ticketless stream URL.
    }

    // Fallback for backends that do not support session streams yet.
    if (sessionId) {
      return `${base}/games/${encodedGameId}/stream?player_id=${encodedPlayerId}`;
    }

    return baseStreamUrl;
  }

  _deps.setBadgeStatus(_deps.connStatusEl, 'reconnecting');
  _intentionalClose = false;

  buildSseUrl().then((url) => {
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
        console.log('Connection error, readyState:', _eventSource?.readyState);
      } else {
        _deps.onStreamStateChange(false);
        _deps.setBadgeStatus(_deps.connStatusEl, 'idle');
        _deps.updateSetupActionsState();
      }
    };
  });
}

/**
File: src/ui/chat-panel.js
Purpose: Minimal non-persistent chat panel (WebSocket side-channel only).
*/

let _panelEl = null;
let _toggleBtnEl = null;
let _messagesEl = null;
let _formEl = null;
let _inputEl = null;
let _statusEl = null;

let _getBaseUrl = null;
let _getGameId = null;
let _getPlayerId = null;
let _getPlayerToken = null;
let _showToast = null;
let _onMessage = null;
let _onPanelVisibilityChanged = null;
let _manageToggleInternally = true;

let _chatSocket = null;
let _reconnectTimer = null;
let _reconnectAttempts = 0;
let _shouldStayConnected = false;
let _chatAuthenticated = false;

const MAX_RENDERED_MESSAGES = 200;

export function shouldAutoScroll(containerEl, thresholdPx = 8) {
  if (!containerEl) return false;
  const distanceFromBottom =
    containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

function setStatus(text, level = 'idle') {
  if (!_statusEl) return;
  _statusEl.textContent = text;
  _statusEl.dataset.level = level;
}

function applyPanelOpenState(isOpen) {
  if (!_panelEl || !_toggleBtnEl) return;
  _panelEl.classList.toggle('chat-panel-open', isOpen);
  _toggleBtnEl.setAttribute('aria-expanded', String(isOpen));
  if (typeof _onPanelVisibilityChanged === 'function') {
    _onPanelVisibilityChanged(Boolean(isOpen));
  }
}

export function setChatPanelOpen(isOpen) {
  applyPanelOpenState(Boolean(isOpen));
}

export function isChatPanelOpen() {
  return Boolean(_panelEl?.classList.contains('chat-panel-open'));
}

function clearReconnectTimer() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

function normalizeWsBase(baseUrl) {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.toString().replace(/\/+$/, '');
}

function setComposerEnabled(enabled) {
  if (_inputEl) {
    _inputEl.disabled = !enabled;
  }
  const submitBtn = _formEl?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = !enabled;
  }
}

async function buildChatConnectionInfo() {
  const baseUrl = _getBaseUrl?.();
  const gameId = String(_getGameId?.() || '').trim();
  const playerId = String(_getPlayerId?.() || '').trim();
  if (!baseUrl || !gameId || !playerId) {
    return null;
  }

  const wsBase = normalizeWsBase(baseUrl);
  const playerToken = _getPlayerToken?.(gameId, playerId);

  let ticket = null;
  try {
    const ticketResp = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/sse-ticket?player_id=${encodeURIComponent(playerId)}`,
      {
        headers: playerToken ? { 'X-Player-Token': playerToken } : {},
      }
    );
    if (ticketResp.ok) {
      const ticketData = await ticketResp.json();
      ticket = ticketData?.ticket || null;
    }
  } catch {
    // Dev mode can still work without ticket when auth is disabled.
  }

  const wsUrl = `${wsBase}/ws/chat`;

  return {
    url: wsUrl,
    authToken: ticket,
  };
}

export function appendChatMessage(messagesEl, message) {
  if (!messagesEl) return;
  const wasAtBottom = shouldAutoScroll(messagesEl);

  const row = document.createElement('li');
  row.className = 'chat-message-row';

  const meta = document.createElement('div');
  meta.className = 'chat-message-meta';

  const user = document.createElement('span');
  user.className = 'chat-message-user';
  user.textContent = String(message.user || 'player');

  const time = document.createElement('span');
  time.className = 'chat-message-time';
  const tsNumber = Number(message.ts);
  time.textContent = Number.isFinite(tsNumber)
    ? new Date(tsNumber * 1000).toLocaleTimeString()
    : '--:--:--';

  const text = document.createElement('p');
  text.className = 'chat-message-text';
  text.textContent = String(message.text || '');

  meta.append(user, time);
  row.append(meta, text);
  messagesEl.appendChild(row);

  while (messagesEl.childElementCount > MAX_RENDERED_MESSAGES) {
    messagesEl.removeChild(messagesEl.firstElementChild);
  }

  if (wasAtBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function scheduleReconnect() {
  if (!_shouldStayConnected) return;
  clearReconnectTimer();
  const delay = Math.min(8000, 1000 * 2 ** _reconnectAttempts);
  _reconnectAttempts += 1;
  _reconnectTimer = setTimeout(() => {
    void connectChat();
  }, delay);
}

function closeSocket() {
  if (_chatSocket) {
    _chatSocket.onopen = null;
    _chatSocket.onmessage = null;
    _chatSocket.onerror = null;
    _chatSocket.onclose = null;
    _chatSocket.close();
    _chatSocket = null;
  }
}

export function disconnectChat() {
  _shouldStayConnected = false;
  _chatAuthenticated = false;
  clearReconnectTimer();
  closeSocket();
  setComposerEnabled(false);
  setStatus('Offline', 'idle');
}

export async function connectChat() {
  if (!_messagesEl) return;
  if (_chatSocket && _chatSocket.readyState <= 1) return;

  const connectionInfo = await buildChatConnectionInfo();
  if (!connectionInfo) {
    setStatus('Offline', 'idle');
    return;
  }

  _shouldStayConnected = true;
  _chatAuthenticated = false;
  setComposerEnabled(false);
  closeSocket();
  setStatus('Connecting...', 'connecting');

  try {
    _chatSocket = new WebSocket(connectionInfo.url);
  } catch {
    setStatus('Offline', 'error');
    scheduleReconnect();
    return;
  }

  _chatSocket.onopen = () => {
    _reconnectAttempts = 0;
    setStatus('Authorizing...', 'connecting');
    if (!connectionInfo.authToken) {
      _chatSocket?.close();
      return;
    }
    _chatSocket?.send(
      JSON.stringify({
        type: 'auth',
        token: connectionInfo.authToken,
      })
    );
  };

  _chatSocket.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload?.type === 'chat_message') {
      appendChatMessage(_messagesEl, payload);
      _onMessage?.(payload);
      return;
    }

    if (payload?.type === 'auth_ok') {
      _chatAuthenticated = true;
      setComposerEnabled(true);
      setStatus('Online', 'online');
      return;
    }

    if (payload?.type === 'chat_error') {
      setStatus('Rate limited', 'warning');
    }
  };

  _chatSocket.onerror = () => {
    setStatus('Offline', 'error');
  };

  _chatSocket.onclose = () => {
    _chatSocket = null;
    if (_shouldStayConnected) {
      setStatus('Reconnecting...', 'connecting');
      scheduleReconnect();
    } else {
      setStatus('Offline', 'idle');
    }
  };
}

function submitCurrentInput() {
  if (
    !_chatSocket ||
    _chatSocket.readyState !== WebSocket.OPEN ||
    !_chatAuthenticated
  ) {
    _showToast?.('Chat is offline.', 'info');
    return;
  }

  const text = String(_inputEl?.value || '').trim();
  if (!text) return;

  _chatSocket.send(
    JSON.stringify({
      type: 'chat_message',
      text,
    })
  );

  _inputEl.value = '';
}

export function initChatPanel(deps) {
  _panelEl = deps.panelEl || null;
  _toggleBtnEl = deps.toggleBtnEl || null;
  _messagesEl = deps.messagesEl || null;
  _formEl = deps.formEl || null;
  _inputEl = deps.inputEl || null;
  _statusEl = deps.statusEl || null;

  _getBaseUrl = deps.getBaseUrl;
  _getGameId = deps.getGameId;
  _getPlayerId = deps.getPlayerId;
  _getPlayerToken = deps.getPlayerToken;
  _showToast = deps.showToast;
  _onMessage = deps.onMessage;
  _onPanelVisibilityChanged = deps.onPanelVisibilityChanged;
  _manageToggleInternally = deps.manageToggleInternally !== false;

  if (!_panelEl || !_toggleBtnEl || !_messagesEl || !_formEl || !_inputEl) {
    return;
  }

  applyPanelOpenState(false);
  setComposerEnabled(false);
  setStatus('Offline', 'idle');

  if (_manageToggleInternally) {
    _toggleBtnEl.addEventListener('click', () => {
      const isOpen = !_panelEl.classList.contains('chat-panel-open');
      applyPanelOpenState(isOpen);
    });
  }

  _formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    submitCurrentInput();
  });
}

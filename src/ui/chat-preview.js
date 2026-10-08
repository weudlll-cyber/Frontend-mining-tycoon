/**
File: src/ui/chat-preview.js
Purpose: Compact chat preview dock and unread counters of the player board.
Role in system:
- Upstream: chat messages from chat-panel.js (`onMessage`), moderation clears
  (`onCleared`), the round's chat option (`onAvailabilityChange`) and live
  tools window state changes (live-drawer.js `onStateChanged`).
- Downstream: the unread badge on the chat button, the dock unread counter
  and the one-line dock preview text.
Constraints:
- Chat is social-only and never affects gameplay (LOCKED_DECISIONS §D).
- Messages only count as unread while the Chat tab is not visible.
Security notes: message text is rendered via textContent only.
*/

import {
  CHAT_CLEARED_TEXT,
  CHAT_DISABLED_TEXT,
  resolveChatUserLabel,
  setChatPanelOpen,
} from './chat-panel.js';
import { getLiveDrawerTab, isLiveDrawerOpen } from './live-drawer.js';

const CHAT_READY_PREVIEW = 'Chat is ready';

let _els = {};
let chatUnreadCount = 0;
let lastChatPreview = CHAT_READY_PREVIEW;

/**
 * @param {{ chatUnreadBadgeEl, chatDockUnreadEl, chatDockPreviewEl,
 *   playerIdInput, playerNameInput }} els
 */
export function initChatPreview(els) {
  _els = els || {};
}

export function renderChatPreviewState() {
  const unreadText = chatUnreadCount > 99 ? '99+' : String(chatUnreadCount);

  if (_els.chatUnreadBadgeEl) {
    _els.chatUnreadBadgeEl.hidden = chatUnreadCount <= 0;
    _els.chatUnreadBadgeEl.textContent = unreadText;
  }

  if (_els.chatDockUnreadEl) {
    _els.chatDockUnreadEl.hidden = chatUnreadCount <= 0;
    _els.chatDockUnreadEl.textContent = unreadText;
  }

  if (_els.chatDockPreviewEl) {
    _els.chatDockPreviewEl.textContent = lastChatPreview;
  }
}

function isChatTabVisible() {
  return isLiveDrawerOpen() && getLiveDrawerTab() === 'chat';
}

export function markChatAsRead() {
  if (chatUnreadCount <= 0) return;
  chatUnreadCount = 0;
  renderChatPreviewState();
}

export function handleChatMessagePreview(message) {
  const user = resolveChatUserLabel(message, {
    ownPlayerId: _els.playerIdInput?.value,
    ownPlayerName: _els.playerNameInput?.value,
  });
  const text = String(message?.text || '').trim();
  lastChatPreview = text ? `${user}: ${text}` : `${user}: (empty message)`;

  if (!isChatTabVisible()) {
    chatUnreadCount += 1;
  }

  renderChatPreviewState();
}

// Moderation: an administrator cleared the chat, so the dock must not keep
// showing a removed message or count it as unread.
export function handleChatClearedPreview() {
  lastChatPreview = CHAT_CLEARED_TEXT;
  chatUnreadCount = 0;
  renderChatPreviewState();
}

// Round option: keep the chat preview dock in sync with "chat disabled".
// Re-enabling only resets the preview when it still shows the disabled text,
// so a real last message is never overwritten.
export function handleChatAvailabilityChange(enabled) {
  if (!enabled) {
    lastChatPreview = CHAT_DISABLED_TEXT;
  } else if (lastChatPreview === CHAT_DISABLED_TEXT) {
    lastChatPreview = CHAT_READY_PREVIEW;
  }
  renderChatPreviewState();
}

export function handleLiveDrawerStateChange(nextState) {
  const chatVisible = Boolean(
    nextState?.isOpen && nextState?.activeTab === 'chat'
  );
  setChatPanelOpen(chatVisible);
  if (chatVisible) {
    markChatAsRead();
  }
}

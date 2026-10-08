// Tests the chat preview dock: unread counters, read reset and chat-disabled text.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const drawer = vi.hoisted(() => ({ open: false, tab: 'trade' }));

vi.mock('./live-drawer.js', () => ({
  isLiveDrawerOpen: () => drawer.open,
  getLiveDrawerTab: () => drawer.tab,
}));

vi.mock('./chat-panel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  setChatPanelOpen: vi.fn(),
}));

let preview;
let chatPanel;
let els;

beforeEach(async () => {
  vi.resetModules();
  drawer.open = false;
  drawer.tab = 'trade';
  document.body.innerHTML = `
    <input id="player-id" value="7" />
    <input id="player-name" value="Alice" />
    <span id="chat-unread-badge" hidden></span>
    <span id="chat-dock-unread" hidden></span>
    <span id="chat-dock-preview"></span>
  `;
  els = {
    playerIdInput: document.getElementById('player-id'),
    playerNameInput: document.getElementById('player-name'),
    chatUnreadBadgeEl: document.getElementById('chat-unread-badge'),
    chatDockUnreadEl: document.getElementById('chat-dock-unread'),
    chatDockPreviewEl: document.getElementById('chat-dock-preview'),
  };
  preview = await import('./chat-preview.js');
  chatPanel = await import('./chat-panel.js');
  preview.initChatPreview(els);
});

describe('chat preview dock', () => {
  it('starts with the ready text and no unread badge', () => {
    preview.renderChatPreviewState();
    expect(els.chatDockPreviewEl.textContent).toBe('Chat is ready');
    expect(els.chatUnreadBadgeEl.hidden).toBe(true);
  });

  it('counts messages as unread while the chat tab is hidden', () => {
    preview.handleChatMessagePreview({ user: 'player-9', text: 'hi' });
    preview.handleChatMessagePreview({ user: 'player-9', text: '' });

    expect(els.chatUnreadBadgeEl.hidden).toBe(false);
    expect(els.chatUnreadBadgeEl.textContent).toBe('2');
    expect(els.chatDockUnreadEl.textContent).toBe('2');
    expect(els.chatDockPreviewEl.textContent).toMatch(/\(empty message\)$/);
  });

  it('caps the counter text at 99+', () => {
    for (let i = 0; i < 100; i += 1) {
      preview.handleChatMessagePreview({ user: 'player-9', text: 'x' });
    }
    expect(els.chatUnreadBadgeEl.textContent).toBe('99+');
  });

  it('does not count messages while the chat tab is visible', () => {
    drawer.open = true;
    drawer.tab = 'chat';
    preview.handleChatMessagePreview({ user: 'player-9', text: 'hi' });
    expect(els.chatUnreadBadgeEl.hidden).toBe(true);
  });

  it('marks messages read when the chat tab opens', () => {
    preview.handleChatMessagePreview({ user: 'player-9', text: 'hi' });
    preview.handleLiveDrawerStateChange({ isOpen: true, activeTab: 'chat' });

    expect(chatPanel.setChatPanelOpen).toHaveBeenLastCalledWith(true);
    expect(els.chatUnreadBadgeEl.hidden).toBe(true);
    expect(els.chatUnreadBadgeEl.textContent).toBe('0');
  });

  it('closes the chat panel state for other tabs and ignores a second read', () => {
    preview.handleLiveDrawerStateChange({ isOpen: true, activeTab: 'trade' });
    expect(chatPanel.setChatPanelOpen).toHaveBeenLastCalledWith(false);
    preview.markChatAsRead();
    expect(els.chatUnreadBadgeEl.hidden).toBe(true);
  });

  it('shows the disabled text and restores the ready text only when unchanged', () => {
    preview.handleChatAvailabilityChange(false);
    expect(els.chatDockPreviewEl.textContent).toBe(
      chatPanel.CHAT_DISABLED_TEXT
    );

    preview.handleChatAvailabilityChange(true);
    expect(els.chatDockPreviewEl.textContent).toBe('Chat is ready');

    preview.handleChatMessagePreview({ user: 'player-9', text: 'last' });
    const lastPreview = els.chatDockPreviewEl.textContent;
    preview.handleChatAvailabilityChange(true);
    expect(els.chatDockPreviewEl.textContent).toBe(lastPreview);
  });

  it('shows the cleared notice and resets unread after a moderation clear', () => {
    preview.handleChatMessagePreview({ user: 'player-9', text: 'rude' });
    preview.handleChatClearedPreview();
    expect(els.chatDockPreviewEl.textContent).toBe(chatPanel.CHAT_CLEARED_TEXT);
    expect(els.chatUnreadBadgeEl.hidden).toBe(true);
  });
});

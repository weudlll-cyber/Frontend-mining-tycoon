import { describe, expect, it } from 'vitest';

import {
  appendChatMessage,
  initChatPanel,
  shouldAutoScroll,
} from './chat-panel.js';

describe('chat panel rendering', () => {
  it('renders message content via textContent only', () => {
    const messages = document.createElement('ul');

    appendChatMessage(messages, {
      user: 'player-1',
      text: '<img src=x onerror=alert(1)>',
      ts: 1_700_000_000,
    });

    expect(messages.querySelector('img')).toBeNull();
    expect(messages.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('appends new messages without replacing existing nodes', () => {
    const messages = document.createElement('ul');

    appendChatMessage(messages, {
      user: 'player-1',
      text: 'first',
      ts: 1_700_000_000,
    });

    const firstNode = messages.firstElementChild;

    appendChatMessage(messages, {
      user: 'player-2',
      text: 'second',
      ts: 1_700_000_010,
    });

    expect(messages.childElementCount).toBe(2);
    expect(messages.firstElementChild).toBe(firstNode);
    expect(messages.lastElementChild.textContent).toContain('second');
  });

  it('detects when auto-scroll should stay pinned to bottom', () => {
    const messages = document.createElement('ul');
    Object.defineProperty(messages, 'scrollHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(messages, 'clientHeight', {
      value: 200,
      configurable: true,
    });

    messages.scrollTop = 300;
    expect(shouldAutoScroll(messages)).toBe(true);

    messages.scrollTop = 120;
    expect(shouldAutoScroll(messages)).toBe(false);
  });

  it('starts collapsed and toggles open state via chat button', () => {
    const panel = document.createElement('aside');
    panel.id = 'chat-panel';
    panel.className = 'chat-card';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'chat-toggle-btn';

    const messages = document.createElement('ul');
    const form = document.createElement('form');
    const input = document.createElement('input');
    const status = document.createElement('span');
    const submit = document.createElement('button');
    submit.type = 'submit';
    form.append(input, submit);

    document.body.append(panel, toggleBtn, messages, form, status);

    initChatPanel({
      panelEl: panel,
      toggleBtnEl: toggleBtn,
      messagesEl: messages,
      formEl: form,
      inputEl: input,
      statusEl: status,
      getBaseUrl: () => 'http://127.0.0.1:8000',
      getGameId: () => '1',
      getPlayerId: () => '1',
      getPlayerToken: () => null,
      showToast: () => {},
    });

    expect(panel.classList.contains('chat-panel-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    toggleBtn.click();
    expect(panel.classList.contains('chat-panel-open')).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

    toggleBtn.click();
    expect(panel.classList.contains('chat-panel-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });
});

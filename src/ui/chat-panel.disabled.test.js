/**
File: src/ui/chat-panel.disabled.test.js
Purpose: Verify per-round chat disabling: game meta `chat_enabled: false`
  opens no WebSocket and shows "Chat is disabled for this round.", and a
  server `chat_error` with code CHAT_DISABLED stops chat without a reconnect
  loop. A missing `chat_enabled` keeps today's behavior (chat on).
Role in system: Regression coverage for src/ui/chat-panel.js round options.
Invariants/Security: Chat stays social-only; server text rendered via textContent.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_DISABLED_TEXT,
  connectChat,
  disconnectChat,
  initChatPanel,
  isChatDisabled,
  isChatEnabledForRound,
} from './chat-panel.js';

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

let refs;
let chatEnabled;
let gameId;
let availability;

function setup() {
  const panel = document.createElement('aside');
  const toggleBtn = document.createElement('button');
  const messages = document.createElement('ul');
  const form = document.createElement('form');
  const input = document.createElement('input');
  const submit = document.createElement('button');
  submit.type = 'submit';
  form.append(input, submit);
  const status = document.createElement('span');
  const note = document.createElement('p');
  note.hidden = true;
  document.body.replaceChildren(panel, toggleBtn, messages, form, status, note);
  refs = { panel, messages, input, submit, status, note };

  initChatPanel({
    panelEl: panel,
    toggleBtnEl: toggleBtn,
    messagesEl: messages,
    formEl: form,
    inputEl: input,
    statusEl: status,
    disabledNoteEl: note,
    getBaseUrl: () => 'http://127.0.0.1:8000',
    getGameId: () => gameId,
    getPlayerId: () => '7',
    getPlayerName: () => 'Alice',
    getPlayerToken: () => 'tok',
    showToast: () => {},
    isChatEnabled: () => chatEnabled,
    onAvailabilityChange: (enabled) => availability.push(enabled),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: 'ticket-1' }),
    })
  );
  chatEnabled = undefined;
  gameId = '42';
  availability = [];
  setup();
});

afterEach(() => {
  disconnectChat();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isChatEnabledForRound', () => {
  it('only treats an explicit false as disabled', () => {
    expect(isChatEnabledForRound({ chat_enabled: false })).toBe(false);
    expect(isChatEnabledForRound({ chat_enabled: true })).toBe(true);
    expect(isChatEnabledForRound({})).toBe(true);
    expect(isChatEnabledForRound(null)).toBe(true);
  });
});

describe('chat disabled by game meta', () => {
  it('opens no WebSocket and shows the disabled note', async () => {
    chatEnabled = false;

    await connectChat();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(isChatDisabled()).toBe(true);
    expect(refs.note.hidden).toBe(false);
    expect(refs.note.textContent).toBe(CHAT_DISABLED_TEXT);
    expect(refs.panel.classList.contains('chat-card-disabled')).toBe(true);
    expect(refs.status.textContent).toBe('Disabled');
    expect(refs.input.disabled).toBe(true);
    expect(availability).toEqual([false]);

    // Stream end keeps the "Disabled" status instead of "Offline".
    disconnectChat();
    expect(refs.status.textContent).toBe('Disabled');
  });

  it('connects as today when chat_enabled is missing and re-enables after a disabled round', async () => {
    chatEnabled = false;
    await connectChat();
    chatEnabled = true;

    await connectChat();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://127.0.0.1:8000/ws/chat');
    expect(isChatDisabled()).toBe(false);
    expect(refs.note.hidden).toBe(true);
    expect(refs.panel.classList.contains('chat-card-disabled')).toBe(false);
    expect(availability).toEqual([false, true]);
  });
});

describe('CHAT_DISABLED from the server', () => {
  it('stops chat without a reconnect loop and shows the server detail', async () => {
    await connectChat();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'auth',
      token: 'ticket-1',
    });

    socket.receive({
      type: 'chat_error',
      code: 'CHAT_DISABLED',
      detail: '<b>Chat is disabled for this round.</b>',
    });

    expect(socket.closed).toBe(true);
    expect(isChatDisabled()).toBe(true);
    expect(refs.note.querySelector('b')).toBeNull();
    expect(refs.note.textContent).toBe(
      '<b>Chat is disabled for this round.</b>'
    );

    // The server close must not schedule a reconnect.
    socket.onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // A later connect for the same game stays offline.
    await connectChat();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Another game may chat again.
    gameId = '43';
    await connectChat();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(isChatDisabled()).toBe(false);
  });

  it('falls back to the default text when the server sends no detail', async () => {
    await connectChat();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ type: 'chat_error', code: 'CHAT_DISABLED' });
    expect(refs.note.textContent).toBe(CHAT_DISABLED_TEXT);
  });

  it('keeps other chat errors as a rate-limit warning', async () => {
    await connectChat();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ type: 'chat_error', code: 'RATE_LIMITED' });
    expect(refs.status.textContent).toBe('Rate limited');
    expect(isChatDisabled()).toBe(false);
  });
});

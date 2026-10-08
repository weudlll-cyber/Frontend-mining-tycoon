/**
File: src/ui/chat-panel.moderation.test.js
Purpose: Verify chat moderation in the player chat tab: CHAT_MUTED disables
  the composer with a notice until `muted_until` (no reconnect, socket stays
  open), and `chat_cleared` empties the list with an administrator notice.
  Also covers the emoji button wiring inside the chat panel.
Role in system: Regression coverage for src/ui/chat-panel.js moderation.
Invariants/Security: Chat stays social-only; notices rendered via textContent.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_CLEARED_TEXT,
  connectChat,
  disconnectChat,
  formatMuteNotice,
  initChatPanel,
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

const NOW_MS = Date.UTC(2026, 9, 8, 12, 0, 0);

let refs;
let gameId;
let onCleared;

function setup() {
  const panel = document.createElement('aside');
  const toggleBtn = document.createElement('button');
  const messages = document.createElement('ul');
  const notice = document.createElement('p');
  notice.hidden = true;
  const picker = document.createElement('div');
  const form = document.createElement('form');
  const emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  const input = document.createElement('input');
  input.maxLength = 200;
  const submit = document.createElement('button');
  submit.type = 'submit';
  form.append(emojiBtn, input, submit);
  const status = document.createElement('span');
  document.body.replaceChildren(
    panel,
    toggleBtn,
    messages,
    notice,
    picker,
    form,
    status
  );
  refs = { messages, notice, picker, form, emojiBtn, input, submit, status };
  onCleared = vi.fn();

  initChatPanel({
    panelEl: panel,
    toggleBtnEl: toggleBtn,
    messagesEl: messages,
    formEl: form,
    inputEl: input,
    statusEl: status,
    noticeEl: notice,
    emojiBtnEl: emojiBtn,
    emojiPickerEl: picker,
    getEmojiList: () => ['🦄'],
    onCleared,
    getBaseUrl: () => 'http://127.0.0.1:8000',
    getGameId: () => gameId,
    getPlayerId: () => '7',
    getPlayerName: () => 'Alice',
    getPlayerToken: () => 'tok',
    showToast: () => {},
  });
}

async function connectOnline() {
  await connectChat();
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  socket.receive({ type: 'auth_ok' });
  return socket;
}

function submit() {
  refs.form.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: 'ticket-1' }),
    })
  );
  gameId = '42';
  setup();
});

afterEach(() => {
  disconnectChat();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('formatMuteNotice', () => {
  it('shows HH:MM for a timed mute and the round end otherwise', () => {
    const until = NOW_MS / 1000 + 900;
    const time = new Date(until * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatMuteNotice(until)).toBe(
      `You are muted in this round's chat (until ${time}).`
    );
    expect(formatMuteNotice(null)).toBe(
      "You are muted in this round's chat (until the round ends)."
    );
    expect(formatMuteNotice(undefined)).toMatch(/round ends/);
  });
});

describe('CHAT_MUTED', () => {
  it('disables the composer until muted_until, without reconnecting', async () => {
    const socket = await connectOnline();
    expect(refs.input.disabled).toBe(false);
    expect(refs.emojiBtn.disabled).toBe(false);

    const until = NOW_MS / 1000 + 60;
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      detail: "You are muted in this round's chat.",
      muted_until: until,
    });

    expect(refs.input.disabled).toBe(true);
    expect(refs.submit.disabled).toBe(true);
    expect(refs.emojiBtn.disabled).toBe(true);
    expect(refs.notice.hidden).toBe(false);
    expect(refs.notice.textContent).toBe(formatMuteNotice(until));
    expect(socket.closed).toBe(false);
    expect(refs.status.textContent).toBe('Online');

    // Submitting while muted sends nothing.
    refs.input.value = 'hello';
    submit();
    expect(socket.sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(refs.input.disabled).toBe(false);
    expect(refs.emojiBtn.disabled).toBe(false);
    expect(refs.notice.hidden).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);

    submit();
    expect(JSON.parse(socket.sent.at(-1))).toEqual({
      type: 'chat_message',
      text: 'hello',
    });
  });

  it('keeps a mute until the round ends across a reconnect of the same game', async () => {
    const socket = await connectOnline();
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      muted_until: null,
    });
    expect(refs.notice.textContent).toMatch(/round ends/);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(refs.input.disabled).toBe(true);

    socket.readyState = 3;
    socket.onclose();
    await vi.advanceTimersByTimeAsync(1000);
    const next = FakeWebSocket.instances.at(-1);
    expect(next).not.toBe(socket);
    next.open();
    next.receive({ type: 'auth_ok' });
    expect(refs.input.disabled).toBe(true);
    expect(refs.notice.hidden).toBe(false);
  });

  it('re-enables only once the socket is ready and clears for another game', async () => {
    const socket = await connectOnline();
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      muted_until: NOW_MS / 1000 + 30,
    });
    // A second mute replaces the first timer.
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      muted_until: NOW_MS / 1000 + 10,
    });
    socket.readyState = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refs.notice.hidden).toBe(true);
    expect(refs.input.disabled).toBe(true);

    socket.readyState = 1;
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      muted_until: null,
    });
    gameId = '43';
    disconnectChat();
    await connectOnline();
    expect(refs.notice.hidden).toBe(true);
    expect(refs.input.disabled).toBe(false);
  });

  it('drops the mute when the player connects to another game', async () => {
    const socket = await connectOnline();
    socket.receive({
      type: 'chat_error',
      code: 'CHAT_MUTED',
      muted_until: null,
    });
    socket.readyState = 3;
    gameId = '44';
    await connectChat();
    expect(refs.notice.hidden).toBe(true);
  });
});

describe('chat_cleared', () => {
  it('empties the list and shows the administrator notice', async () => {
    const socket = await connectOnline();
    socket.receive({
      type: 'chat_message',
      user: 'Bob',
      text: 'spam',
      ts: 1,
    });
    expect(refs.messages.childElementCount).toBe(1);

    socket.receive({ type: 'chat_cleared' });
    expect(refs.messages.childElementCount).toBe(1);
    expect(refs.messages.textContent).toBe(CHAT_CLEARED_TEXT);
    expect(refs.messages.textContent).not.toContain('spam');
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(socket.closed).toBe(false);
  });
});

describe('emoji button in the chat panel', () => {
  it('stays disabled offline and inserts into the chat input when online', async () => {
    expect(refs.emojiBtn.disabled).toBe(true);
    await connectOnline();
    refs.emojiBtn.click();
    expect(refs.picker.hidden).toBe(false);
    refs.picker.querySelector('.chat-emoji-option').click();
    expect(refs.input.value).toBe('🦄');

    refs.emojiBtn.click();
    disconnectChat();
    expect(refs.picker.hidden).toBe(true);
  });
});

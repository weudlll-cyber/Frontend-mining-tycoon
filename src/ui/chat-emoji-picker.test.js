/**
File: src/ui/chat-emoji-picker.test.js
Purpose: Verify the inline chat emoji picker: list resolution from `/meta`
  `chat_emoji` with the built-in fallback, insertion at the cursor, and
  keyboard operation (arrows, Home/End, Escape without closing the window).
Role in system: Regression coverage for src/ui/chat-emoji-picker.js.
Invariants/Security: emoji rendered via textContent; aria-labels carry names.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_CHAT_EMOJI,
  initChatEmojiPicker,
  insertAtCursor,
  resolveChatEmojiList,
} from './chat-emoji-picker.js';

describe('resolveChatEmojiList', () => {
  it('falls back to the built-in list without meta', () => {
    expect(resolveChatEmojiList(undefined)).toEqual([...DEFAULT_CHAT_EMOJI]);
    expect(resolveChatEmojiList([])).toEqual([...DEFAULT_CHAT_EMOJI]);
    expect(resolveChatEmojiList(['', 42, null])).toEqual([
      ...DEFAULT_CHAT_EMOJI,
    ]);
  });

  it('uses meta strings and objects, drops duplicates and invalid entries', () => {
    expect(
      resolveChatEmojiList([
        '👍',
        '👍',
        ' 🦄 ',
        { emoji: '🍕', name: 'pizza' },
        'x'.repeat(40),
        { name: 'no emoji' },
      ])
    ).toEqual([
      { emoji: '👍', name: 'thumbs up' },
      { emoji: '🦄', name: '🦄' },
      { emoji: '🍕', name: 'pizza' },
    ]);
  });
});

describe('insertAtCursor', () => {
  it('inserts at the cursor and replaces a selection', () => {
    const input = document.createElement('input');
    input.value = 'hello world';
    input.setSelectionRange(5, 5);
    expect(insertAtCursor(input, '🔥')).toBe(true);
    expect(input.value).toBe('hello🔥 world');
    expect(input.selectionStart).toBe(7);

    input.setSelectionRange(0, 5);
    insertAtCursor(input, '👋');
    expect(input.value).toBe('👋🔥 world');
  });

  it('appends when the input has no cursor information', () => {
    const fake = { value: 'hi', selectionStart: null, selectionEnd: null };
    expect(insertAtCursor(fake, '!')).toBe(true);
    expect(fake.value).toBe('hi!');
  });

  it('refuses text that would exceed maxlength or empty input', () => {
    const input = document.createElement('input');
    input.maxLength = 3;
    input.value = 'abc';
    expect(insertAtCursor(input, '😀')).toBe(false);
    expect(input.value).toBe('abc');
    expect(insertAtCursor(null, '😀')).toBe(false);
    expect(insertAtCursor(input, '')).toBe(false);
  });
});

describe('initChatEmojiPicker', () => {
  let button;
  let picker;
  let input;
  let api;
  let emojiList;

  function key(target, name) {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    button = document.createElement('button');
    picker = document.createElement('div');
    input = document.createElement('input');
    document.body.replaceChildren(button, picker, input);
    emojiList = undefined;
    api = initChatEmojiPicker({
      buttonEl: button,
      pickerEl: picker,
      inputEl: input,
      getEmojiList: () => emojiList,
    });
  });

  it('returns null without its elements', () => {
    expect(initChatEmojiPicker({ buttonEl: button })).toBeNull();
  });

  it('opens with labelled options, focuses the first and inserts on click', () => {
    expect(picker.hidden).toBe(true);
    button.click();
    expect(api.isOpen()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const options = picker.querySelectorAll('.chat-emoji-option');
    expect(options).toHaveLength(DEFAULT_CHAT_EMOJI.length);
    expect(options[0].getAttribute('aria-label')).toBe('grinning face');
    expect(document.activeElement).toBe(options[0]);
    expect(options[0].tabIndex).toBe(0);
    expect(options[1].tabIndex).toBe(-1);

    input.value = 'gg ';
    input.setSelectionRange(3, 3);
    options[8].click();
    expect(input.value).toBe('gg 👍');
    expect(api.isOpen()).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('uses the meta list when present', () => {
    emojiList = ['🦄', '🍕'];
    button.click();
    const labels = [...picker.querySelectorAll('.chat-emoji-option')].map(
      (option) => option.textContent
    );
    expect(labels).toEqual(['🦄', '🍕']);
  });

  it('moves focus with arrows, Home and End', () => {
    button.click();
    const options = picker.querySelectorAll('.chat-emoji-option');
    key(options[0], 'ArrowRight');
    expect(document.activeElement).toBe(options[1]);
    key(options[1], 'ArrowDown');
    expect(document.activeElement).toBe(options[9]);
    key(options[9], 'ArrowUp');
    expect(document.activeElement).toBe(options[1]);
    key(options[1], 'ArrowLeft');
    key(options[0], 'ArrowLeft');
    expect(document.activeElement).toBe(options[0]);
    key(options[0], 'End');
    expect(document.activeElement).toBe(options[options.length - 1]);
    key(options[options.length - 1], 'Home');
    expect(document.activeElement).toBe(options[0]);
    key(options[0], 'a');
    expect(document.activeElement).toBe(options[0]);
  });

  it('closes on Escape without letting the live window see it', () => {
    const windowListener = vi.fn();
    document.addEventListener('keydown', windowListener);
    button.click();
    key(picker.firstElementChild, 'Escape');
    expect(api.isOpen()).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(windowListener).not.toHaveBeenCalled();

    button.click();
    key(button, 'Escape');
    expect(api.isOpen()).toBe(false);
    expect(windowListener).not.toHaveBeenCalled();

    // Escape on the closed button is left to the live tools window.
    key(button, 'Escape');
    expect(windowListener).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', windowListener);
  });

  it('toggles closed via the button and ignores clicks between options', () => {
    button.click();
    button.click();
    expect(api.isOpen()).toBe(false);
    api.close();
    expect(api.isOpen()).toBe(false);

    button.click();
    picker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(api.isOpen()).toBe(true);
  });
});

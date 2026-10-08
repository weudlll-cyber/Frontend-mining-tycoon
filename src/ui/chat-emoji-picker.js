/**
File: src/ui/chat-emoji-picker.js
Purpose: Small inline emoji picker for the chat composer. An emoji button
  toggles a grid of emoji inside the chat panel; choosing one inserts it at
  the cursor of the chat input.
Role in system: Used by src/ui/chat-panel.js (Chat tab of the live tools
  window on player.html). The emoji list comes from global `/meta`
  `chat_emoji` when the backend provides it, otherwise from the built-in
  fallback list below.
Constraints:
  - Inline in the chat panel (no overlay, no backdrop; LOCKED_DECISIONS §C/§D).
  - Keyboard operable: Enter/Space on the button opens the grid and focuses
    the first emoji, arrow keys / Home / End move between emoji (roving
    tabindex, so Tab leaves the grid), Escape closes it and returns focus to
    the emoji button without closing the live tools window.
  - Social-only: inserting an emoji only edits the local input text.
Security notes: emoji and names are rendered via textContent/aria-label only;
  meta entries are filtered to short non-empty strings.
*/

/** Built-in emoji with accessible names (used when /meta has no chat_emoji). */
export const DEFAULT_CHAT_EMOJI = Object.freeze([
  { emoji: '😀', name: 'grinning face' },
  { emoji: '😂', name: 'face with tears of joy' },
  { emoji: '😉', name: 'winking face' },
  { emoji: '😎', name: 'smiling face with sunglasses' },
  { emoji: '🤔', name: 'thinking face' },
  { emoji: '😮', name: 'face with open mouth' },
  { emoji: '😢', name: 'crying face' },
  { emoji: '😡', name: 'angry face' },
  { emoji: '👍', name: 'thumbs up' },
  { emoji: '👎', name: 'thumbs down' },
  { emoji: '👏', name: 'clapping hands' },
  { emoji: '🙌', name: 'raising hands' },
  { emoji: '🎉', name: 'party popper' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '🚀', name: 'rocket' },
  { emoji: '💎', name: 'gem stone' },
  { emoji: '⛏️', name: 'pick' },
  { emoji: '💰', name: 'money bag' },
  { emoji: '📈', name: 'chart increasing' },
  { emoji: '📉', name: 'chart decreasing' },
  { emoji: '⚡', name: 'high voltage' },
  { emoji: '🏆', name: 'trophy' },
  { emoji: '❤️', name: 'red heart' },
  { emoji: '👋', name: 'waving hand' },
]);

const NAME_BY_EMOJI = new Map(
  DEFAULT_CHAT_EMOJI.map((entry) => [entry.emoji, entry.name])
);

const MAX_EMOJI_LENGTH = 16;
const GRID_COLUMNS = 8;

function normalizeEntry(entry) {
  const raw = typeof entry === 'string' ? entry : entry?.emoji;
  const emoji = typeof raw === 'string' ? raw.trim() : '';
  if (!emoji || emoji.length > MAX_EMOJI_LENGTH) return null;
  const metaName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  return { emoji, name: metaName || NAME_BY_EMOJI.get(emoji) || emoji };
}

/**
 * Resolve the picker list from `/meta` `chat_emoji` (strings or
 * `{emoji, name}` objects). Invalid entries and duplicates are dropped; an
 * absent or empty list falls back to DEFAULT_CHAT_EMOJI.
 */
export function resolveChatEmojiList(metaList) {
  if (!Array.isArray(metaList)) return [...DEFAULT_CHAT_EMOJI];
  const seen = new Set();
  const list = [];
  metaList.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized || seen.has(normalized.emoji)) return;
    seen.add(normalized.emoji);
    list.push(normalized);
  });
  return list.length ? list : [...DEFAULT_CHAT_EMOJI];
}

/**
 * Insert text at the input's cursor (replacing a selection). Respects the
 * input's maxlength: when the text would not fit, nothing is inserted.
 * @returns {boolean} whether the text was inserted
 */
export function insertAtCursor(inputEl, text) {
  if (!inputEl || !text) return false;
  const value = String(inputEl.value || '');
  const start = Number.isInteger(inputEl.selectionStart)
    ? inputEl.selectionStart
    : value.length;
  const end = Number.isInteger(inputEl.selectionEnd)
    ? inputEl.selectionEnd
    : start;
  const next = value.slice(0, start) + text + value.slice(end);
  const maxLength = Number(inputEl.maxLength);
  if (maxLength > 0 && next.length > maxLength) return false;
  inputEl.value = next;
  const caret = start + text.length;
  inputEl.setSelectionRange?.(caret, caret);
  return true;
}

/**
 * Wire the emoji button and the inline picker grid.
 * @param {{ buttonEl: HTMLButtonElement, pickerEl: HTMLElement,
 *   inputEl: HTMLInputElement, getEmojiList?: () => unknown }} deps
 * @returns {{ close: () => void, isOpen: () => boolean } | null}
 */
export function initChatEmojiPicker({
  buttonEl,
  pickerEl,
  inputEl,
  getEmojiList,
}) {
  if (!buttonEl || !pickerEl || !inputEl) return null;

  let items = [];
  let activeIndex = 0;

  const isOpen = () => !pickerEl.hidden;

  function focusItem(index) {
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, i) => {
      item.tabIndex = i === activeIndex ? 0 : -1;
    });
    items[activeIndex].focus();
  }

  function render() {
    const list = resolveChatEmojiList(getEmojiList?.());
    items = list.map(({ emoji, name }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chat-emoji-option';
      item.textContent = emoji;
      item.dataset.emoji = emoji;
      item.setAttribute('aria-label', name);
      item.title = name;
      item.tabIndex = -1;
      return item;
    });
    pickerEl.replaceChildren(...items);
    activeIndex = 0;
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen()) return;
    pickerEl.hidden = true;
    buttonEl.setAttribute('aria-expanded', 'false');
    if (restoreFocus) buttonEl.focus();
  }

  function open() {
    render();
    pickerEl.hidden = false;
    buttonEl.setAttribute('aria-expanded', 'true');
    focusItem(0);
  }

  buttonEl.setAttribute('aria-expanded', 'false');
  pickerEl.hidden = true;

  buttonEl.addEventListener('click', () => {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  });

  buttonEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      // Keep the live tools window open: only the picker closes.
      event.stopPropagation();
      close();
    }
  });

  pickerEl.addEventListener('click', (event) => {
    const item = event.target.closest?.('.chat-emoji-option');
    if (!item) return;
    insertAtCursor(inputEl, item.dataset.emoji);
    close();
    inputEl.focus();
  });

  pickerEl.addEventListener('keydown', (event) => {
    const moves = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: GRID_COLUMNS,
      ArrowUp: -GRID_COLUMNS,
    };
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      close({ restoreFocus: true });
    } else if (event.key in moves) {
      event.preventDefault();
      const next = activeIndex + moves[event.key];
      focusItem(Math.min(Math.max(next, 0), items.length - 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusItem(event.key === 'Home' ? 0 : items.length - 1);
    }
  });

  return { close: () => close(), isOpen };
}

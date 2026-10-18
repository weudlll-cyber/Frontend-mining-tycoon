/**
 * File: src/ui/bot-badge.js
 * Purpose: The "BOT" badge that marks bot opponents wherever player names are
 *          listed (Top 5 on the board, lobby highscores and full results).
 * Role in system: Bots are always recognisable: their names start with "Bot"
 *          and every list shows this badge. The backend marks rows with
 *          `is_bot` / `bot_level`.
 * Security notes: text via textContent only.
 */

const LEVEL_LABELS = Object.freeze({
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
});

/** True for a leaderboard/result row that belongs to a bot. */
export function isBotEntry(entry) {
  return entry?.is_bot === true;
}

/** Tooltip text, e.g. "Bot opponent (Hard)". */
export function botBadgeTitle(level) {
  const label = LEVEL_LABELS[String(level || '').toLowerCase()];
  return label ? `Bot opponent (${label})` : 'Bot opponent';
}

/** Create a badge element for a bot row. */
export function createBotBadge(level) {
  const badge = document.createElement('span');
  badge.className = 'bot-badge';
  badge.textContent = 'BOT';
  badge.title = botBadgeTitle(level);
  // role="img" makes screen readers announce the label (with the level);
  // aria-label alone is ignored on a plain span.
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', botBadgeTitle(level));
  return badge;
}

/**
 * Show or hide an existing badge element for a row (stable nodes for live
 * lists that update every second).
 */
export function syncBotBadge(badge, entry) {
  if (!badge) return;
  const bot = isBotEntry(entry);
  badge.hidden = !bot;
  if (bot) {
    const title = botBadgeTitle(entry.bot_level);
    if (badge.title !== title) {
      badge.title = title;
      badge.setAttribute('aria-label', title);
    }
  }
}

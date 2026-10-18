/**
File: src/ui/bot-badge.test.js
Purpose: The BOT badge marks bot rows; players stay unmarked.
*/

import { describe, expect, it } from 'vitest';
import {
  botBadgeTitle,
  createBotBadge,
  isBotEntry,
  syncBotBadge,
} from './bot-badge.js';

describe('bot badge', () => {
  it('recognises bot rows only by the backend flag', () => {
    expect(isBotEntry({ is_bot: true })).toBe(true);
    expect(isBotEntry({ is_bot: false, name: 'Bot Easy 1' })).toBe(false);
    expect(isBotEntry(null)).toBe(false);
  });

  it('names the level in the tooltip', () => {
    expect(botBadgeTitle('medium')).toBe('Bot opponent (Medium)');
    expect(botBadgeTitle('unknown')).toBe('Bot opponent');
    const badge = createBotBadge('easy');
    expect(badge.textContent).toBe('BOT');
    expect(badge.getAttribute('aria-label')).toBe('Bot opponent (Easy)');
  });

  it('syncs an existing badge with the row', () => {
    const badge = createBotBadge();
    syncBotBadge(badge, { is_bot: true, bot_level: 'hard' });
    expect(badge.hidden).toBe(false);
    expect(badge.title).toBe('Bot opponent (Hard)');
    syncBotBadge(badge, { name: 'Alice' });
    expect(badge.hidden).toBe(true);
    expect(() => syncBotBadge(null, {})).not.toThrow();
  });
});

describe('bot badge styles', () => {
  it('keeps a hidden badge hidden despite its display rule', async () => {
    const fs = await import('node:fs');
    // One shared rule for the board and the lobby (src/shared.css).
    const css = fs.readFileSync('src/shared.css', 'utf8');
    expect(css).toMatch(/\.bot-badge\[hidden\]\s*\{\s*display:\s*none;/);
    for (const entry of ['src/main.js', 'src/lobby.js']) {
      expect(fs.readFileSync(entry, 'utf8'), entry).toContain(
        "import './shared.css';"
      );
    }
  });
});

// Tests chat dock preview rendering against shared chat display-name rules.
import { describe, expect, it } from 'vitest';
import {
  installMainTestHooks,
  loadMainModule,
} from './test-utils/main-test-helpers.js';

installMainTestHooks();

describe('chat dock preview', () => {
  it('uses the current player display name for own player-id messages', async () => {
    const module = await loadMainModule();

    document.getElementById('player-id').value = '310';
    document.getElementById('player-name').value = 'Alice Miner';

    module.handleChatMessagePreview({
      user: 'player-310',
      text: '234523452345',
    });

    expect(document.getElementById('chat-dock-preview').textContent).toBe(
      'Alice Miner: 234523452345'
    );
  });
});

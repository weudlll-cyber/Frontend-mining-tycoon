// Shared DOM fixture and import helpers for main module tests.
import { beforeEach, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-id" value="1" />
      <input id="player-id" value="1" />
      <button id="new-game-btn"></button>
      <button id="start-btn"></button>
      <button id="stop-btn"></button>
      <div id="conn-status"></div>
      <div id="game-status"></div>
      <div id="countdown"></div>
      <div id="countdown-label"></div>
      <div id="new-game-status"></div>
      <div id="meta-debug"></div>
      <aside id="chat-panel" class="chat-card"></aside>
      <button id="chat-toggle-btn" type="button"></button>
      <ul id="chat-messages"></ul>
      <form id="chat-form"><input id="chat-input" /><button type="submit">Send</button></form>
      <span id="chat-status"></span>
      <span id="chat-unread-badge"></span>
      <button id="chat-dock-btn" type="button">
        <span id="chat-dock-preview"></span>
        <span id="chat-dock-unread"></span>
      </button>
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="portfolio-value">—</div>
    </div>
  `;
}

export async function loadMainModule() {
  return await import('../main.js');
}

export function installMainTestHooks() {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    buildDomFixture();
  });
}

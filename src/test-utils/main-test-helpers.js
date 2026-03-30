// Shared DOM fixture and import helpers for main module tests.
import { beforeEach, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-duration" value="300" />
      <select id="duration-preset">
        <option value="5m" selected>5 minutes</option>
      </select>
      <input id="duration-custom-value" value="" />
      <select id="duration-custom-unit">
        <option value="minutes" selected>minutes</option>
      </select>
      <input id="enrollment-window" value="60" />
      <label>
        <input type="radio" name="scoring-mode" value="balance" checked />
      </label>
      <label>
        <input type="radio" name="scoring-mode" value="portfolio" />
      </label>
      <input id="trade-count" value="10" />
      <label>
        <input id="round-type-sync" type="radio" name="round-type" value="sync" checked />
      </label>
      <label>
        <input id="round-type-async" type="radio" name="round-type" value="async" />
      </label>
      <select id="async-duration-preset">
        <option value="30m" selected>30m</option>
      </select>
      <select id="async-session-duration-preset">
        <option value="5m" selected>5m</option>
      </select>
      <label>
        <input id="async-auto-start" type="checkbox" />
      </label>
      <input id="game-id" value="1" />
      <select id="active-game-select">
        <option value="">No joinable games found</option>
      </select>
      <button id="refresh-active-games-btn" type="button"></button>
      <div id="active-game-status"></div>
      <input id="player-id" value="1" />
      <input id="show-advanced-overrides" type="checkbox" />
      <div id="advanced-overrides" style="display:none"></div>
      <select id="anchor-token">
        <option value="">— Use recommendation —</option>
        <option value="spring">spring</option>
        <option value="summer">summer</option>
        <option value="autumn">autumn</option>
        <option value="winter">winter</option>
      </select>
      <input id="anchor-rate" value="" />
      <input id="season-cycles" value="" />
      <div id="derived-emission-preview" style="display:none"></div>
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
      <div id="upgrades"></div>
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

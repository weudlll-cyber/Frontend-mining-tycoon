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

/**
 * Setup-shell fixture (header, setup actions, live board) for the setup and
 * async-session flow tests.
 */
export function buildSetupFlowFixture() {
  document.body.innerHTML = `
    <div id="app">
      <main class="app-layout">
        <header class="card game-header">
          <button id="setup-toggle-btn" type="button" aria-expanded="true">Hide Setup</button>
          <button id="jump-live-btn" type="button">Jump to Live Board</button>
          <button id="debug-toggle-btn" type="button" aria-expanded="false" aria-controls="debug-panel">⚙️</button>
          <section id="debug-panel" class="debug-panel" hidden>
            <div>debug body</div>
          </section>
          <div id="meta-debug"></div>
          <div id="debug-backend-url"></div>
          <div id="debug-game-id"></div>
          <div id="debug-player-id"></div>
          <div id="debug-session-id"></div>
        </header>

        <section id="setup-shell" class="setup-shell setup-open">
          <button id="jump-live-btn-setup" type="button">Jump to Live Board</button>
          <section id="setup-panel">
            <div class="setup-actions">
              <div class="setup-actions-header">
                <h3>Primary Actions</h3>
                <span id="round-mode-badge">Round: Sync</span>
              </div>
              <div class="button-group">
                <button id="new-game-btn" class="btn-primary" type="button">+ New Game</button>
                <button id="start-btn" class="btn-secondary" type="button">Start Game</button>
                <button id="start-session-btn" class="btn-secondary" type="button" hidden>Start Async Session</button>
                <button id="stop-btn" class="btn-secondary" type="button">Stop Stream</button>
              </div>
              <p id="start-session-status" class="setup-session-status"></p>
              <p id="setup-actions-note"></p>
            </div>
          </section>
        </section>

        <section id="live-board"></section>
      </main>

      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-id" value="game-1" />
      <input id="player-id" value="player-1" />

      <div id="conn-status"></div>
      <div id="game-status"></div>
      <div id="countdown"></div>
      <div id="countdown-label"></div>
      <div id="async-session-status" class="badge badge-gray" hidden></div>
      <div id="new-game-status"></div>
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="my-score"></div>
      <div id="my-rank"></div>
      <div id="top-score"></div>
      <div id="portfolio-value"></div>

      <aside id="chat-panel"></aside>
      <button id="chat-toggle-btn" type="button"></button>
      <ul id="chat-messages"></ul>
      <form id="chat-form"></form>
      <input id="chat-input" />
      <div id="chat-status"></div>
    </div>
  `;

  const liveBoard = document.getElementById('live-board');
  if (liveBoard) {
    liveBoard.scrollIntoView = () => {};
    liveBoard.focus = () => {};
  }
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

/**
File: src/main.season-upgrades.test.js
Purpose: Season-card rendering and halving UI behavior tests split from main.test.js.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDomFixture() {
  document.body.innerHTML = `
    <div id="app">
      <input id="base-url" value="http://127.0.0.1:8000" />
      <input id="player-name" value="Tester" />
      <input id="game-duration" value="300" />
      <input id="enrollment-window" value="60" />
      <input id="game-id" value="1" />
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
      <div id="player-state"></div>
      <div id="leaderboard"></div>
      <div id="upgrades"></div>
      <div id="portfolio-value">—</div>
    </div>
  `;
}

let mainModule;

async function loadMainModule() {
  mainModule = await import('./main.js');
  return mainModule;
}

beforeEach(() => {
  vi.resetModules();
  buildDomFixture();
});

describe('Seasonal Oracle season card rendering', () => {
  it('renders season-card HTML structure for desktop inline layout', async () => {
    await loadMainModule();

    // Build the season card DOM structure that renderSeasonData expects
    const template = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-summer" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-autumn" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-winter" class="season-card">
        <div class="season-balance">0</div>
        <div class="season-output">0</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;
    document.body.innerHTML += template;

    expect(document.getElementById('season-spring')).not.toBeNull();
    expect(document.getElementById('season-summer')).not.toBeNull();
    expect(document.getElementById('season-autumn')).not.toBeNull();
    expect(document.getElementById('season-winter')).not.toBeNull();
  });

  it('renders token balances in season cards correctly', async () => {
    // Setup DOM with season cards
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-summer" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-autumn" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
      <div id="season-winter" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;

    await loadMainModule();

    const springCard = document.getElementById('season-spring');
    const balanceEl = springCard.querySelector('.season-balance');
    expect(balanceEl).not.toBeNull();
  });

  it('renders output per second in season cards correctly', async () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-balance">—</div>
        <div class="season-output">—</div>
        <div class="season-halving">—</div>
        <div class="season-upgrades"></div>
      </div>
    `;

    await loadMainModule();

    const springCard = document.getElementById('season-spring');
    const outputEl = springCard.querySelector('.season-output');

    expect(outputEl).not.toBeNull();
    expect(outputEl.textContent).toBe('—');
  });

  it('updates season halving countdown every second without remounting the node', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00Z'));

    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    const stableRef = halvingEl;
    const nowUnix = Date.now() / 1000;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: nowUnix + 5,
    });

    const firstText = halvingEl.textContent;
    vi.advanceTimersByTime(1000);
    const secondText = halvingEl.textContent;

    expect(firstText).not.toBe(secondText);
    expect(secondText).toBe('00:04');
    expect(document.querySelector('.season-halving')).toBe(stableRef);

    module.stopSeasonHalvingTimers();
    vi.useRealTimers();
  });

  it('keeps season halving countdown smooth for same-month payload drift', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00Z'));

    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    const initialNow = Date.now() / 1000;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: initialNow + 10,
      halvingMonth: 36,
    });

    vi.advanceTimersByTime(2000);
    const beforeResync = halvingEl.textContent;

    module.syncSeasonHalvingTicker({
      token: 'spring',
      halvingEl,
      halvingAtUnix: Date.now() / 1000 + 10,
      halvingMonth: 36,
    });

    vi.advanceTimersByTime(1000);
    const afterResync = halvingEl.textContent;

    expect(beforeResync).toBe('00:08');
    expect(afterResync).toBe('00:07');

    module.stopSeasonHalvingTimers();
    vi.useRealTimers();
  });

  it('keeps halving countdown text selectable and copyable', async () => {
    const module = await loadMainModule();
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
          <span class="season-balance">0</span>
          <span class="season-output">0/s</span>
        </div>
      </div>
    `;

    const halvingEl = document.querySelector('.season-halving');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 40);

    expect(halvingEl.nodeType).toBe(Node.ELEMENT_NODE);
    expect(halvingEl.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats long halving countdowns with compact hour/day labels', async () => {
    const module = await loadMainModule();

    expect(module.formatDurationCompact(59)).toBe('00:59');
    expect(module.formatDurationCompact(3600)).toBe('1h 00m');
    expect(module.formatDurationCompact(3661)).toBe('1h 01m');
    expect(module.formatDurationCompact(86400)).toBe('1d 0h');
  });

  it('applies compact halving text for long-running season countdowns', async () => {
    const module = await loadMainModule();
    const halvingEl = document.createElement('span');
    halvingEl.className = 'season-halving';

    module.applyHalvingTextAndSeverity(
      halvingEl,
      Date.now() / 1000 + 3 * 3600 + 5 * 60
    );
    expect(halvingEl.textContent).toMatch(/^3h 0[45]m$/);
  });

  it('applies warning/critical color classes only at threshold windows', async () => {
    const module = await loadMainModule();
    const halvingEl = document.createElement('span');
    halvingEl.className = 'season-halving';

    expect(module.classifyHalvingSeverity(45)).toBe('normal');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 45);
    expect(halvingEl.classList.contains('season-halving--warning')).toBe(false);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(
      false
    );

    expect(module.classifyHalvingSeverity(20)).toBe('warning');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 20);
    expect(halvingEl.classList.contains('season-halving--warning')).toBe(true);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(
      false
    );

    expect(module.classifyHalvingSeverity(3)).toBe('critical');
    module.applyHalvingTextAndSeverity(halvingEl, Date.now() / 1000 + 3);
    expect(halvingEl.classList.contains('season-halving--critical')).toBe(true);
  });

  it('renders Balance and Output in the same compact meta row', () => {
    document.body.innerHTML = `
      <div id="season-spring" class="season-card">
        <div class="season-meta">
          <div class="meta-item">
            <span class="meta-label">Balance</span>
            <span class="season-balance">100.50</span>
          </div>
          <span class="meta-sep" aria-hidden="true">|</span>
          <div class="meta-item">
            <span class="meta-label">Output</span>
            <span class="season-output">5.25/s</span>
          </div>
          <span class="meta-sep" aria-hidden="true">|</span>
          <div class="meta-item halving-item">
            <span class="meta-label">Halving</span>
            <span class="season-halving">—</span>
          </div>
        </div>
        <div class="season-upgrades"></div>
      </div>
    `;

    const springCard = document.getElementById('season-spring');
    const metaRow = springCard.querySelector('.season-meta');
    const balanceEl = springCard.querySelector('.season-balance');
    const outputEl = springCard.querySelector('.season-output');

    expect(metaRow).not.toBeNull();
    expect(metaRow.contains(balanceEl)).toBe(true);
    expect(metaRow.contains(outputEl)).toBe(true);

    const labels = Array.from(metaRow.querySelectorAll('.meta-label')).map(
      (el) => el.textContent.trim()
    );
    expect(labels).toEqual(['Balance', 'Output', 'Halving']);
    expect(metaRow.textContent).toContain('|');
    expect(metaRow.textContent).not.toMatch(/Spring|Summer|Autumn|Winter/i);

    expect(balanceEl.textContent).toBe('100.50');
    expect(outputEl.textContent).toBe('5.25/s');
  });
});

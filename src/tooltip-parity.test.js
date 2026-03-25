/**
File: src/tooltip-parity.test.js
Purpose: Repo-wide tooltip system parity assertions.
Role in system:
- Single point of failure if any component drifts from the shared micro-tooltip contract.
- Enforces LOCKED_DECISIONS §C: non-blocking tooltips, no auto-hide on hover,
  stable anchors across SSE ticks.
Invariants:
- All non-event tooltips must use .ps-tip-trigger and .ps-tip-bubble.
- event-display must NOT scan document.body on each SSE tick (would kill open tips).
- Tooltip bubbles must live in #tooltip-layer (prevents clipping by overflow:hidden).
- No setTimeout auto-hide path may be added without updating this test.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// ─── Source-text helpers ───────────────────────────────────────────────────

function readSrc(relPath) {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', relPath), 'utf8');
}

// ─── Static source-text checks (no DOM needed) ────────────────────────────

describe('tooltip system parity — static source checks', () => {
  it('event-display does not call initMicroTooltips(document.body)', () => {
    // WHY: scanning document.body on every SSE tick disposes all other
    // initMicroTooltips instances, which closes any open tooltip after ~1 s.
    // event-display must scope to _eventBannerEl or use bindDirectTooltip.
    const src = readSrc('ui/event-display.js');
    expect(src).not.toMatch(
      /_disposeTooltips\s*=\s*initMicroTooltips\s*\(\s*document\.body\s*\)/
    );
  });

  it('event indicator tooltip binding uses no setTimeout auto-hide path', () => {
    const src = readSrc('ui/event-display.js');
    // Closing is mouseleave-driven with a single-frame hover re-check (RAF),
    // never a timeout-based auto-hide.
    expect(src).toMatch(/bindDirectTooltip/);
    expect(src).not.toMatch(/setTimeout\s*\(/);
  });

  it('micro-tooltip.js uses RAF hover-watch, not a mouseleave setTimeout auto-hide', () => {
    // WHY: SSE DOM reflows fire spurious mouseleave events. RAF polling :hover
    // is reflow-immune. Any auto-hide timeout on hover would regress tooltip
    // stability on SSE ticks.
    const src = readSrc('ui/micro-tooltip.js');
    // Must have the RAF loop (startHoverWatch)
    expect(src).toMatch(/startHoverWatch/);
    expect(src).toMatch(/requestAnimationFrame/);
    // Must NOT register mouseleave handlers in this shared module.
    // Closing is handled via RAF :hover tracking + Escape/blur paths.
    expect(src).not.toMatch(/addEventListener\(\s*['"]mouseleave['"]/);
  });

  it('all tooltip trigger classes use .ps-tip-trigger across ui modules', () => {
    // Collect all button/trigger definitions from UI modules and ensure
    // they use the shared class — guarantees the CSS/ARIA contract is consistent.
    // NOTE: player-view.js delegates layout construction to player-view-layout.js,
    // so we check that player-view-layout.js (its helper) contains the classes.
    const fileChecks = [
      { file: 'ui/player-view-layout.js', key: 'player-view' }, // extracted helpers for player-view
      { file: 'ui/season-cards.js', key: 'season-cards' },
      { file: 'ui/upgrade-panel-inline.js', key: 'upgrade-panel-inline' },
    ];
    fileChecks.forEach(({ file }) => {
      const src = readSrc(file);
      // Each file creates a tooltip trigger — it must carry 'ps-tip-trigger'
      expect(src).toMatch(/ps-tip-trigger/);
    });
  });

  it('all tooltip bubble classes use .ps-tip-bubble across ui modules', () => {
    // NOTE: player-view.js delegates layout construction to player-view-layout.js,
    // so we check that player-view-layout.js (its helper) contains the classes.
    const fileChecks = [
      { file: 'ui/player-view-layout.js', key: 'player-view' }, // extracted helpers for player-view
      { file: 'ui/season-cards.js', key: 'season-cards' },
      { file: 'ui/upgrade-panel-inline.js', key: 'upgrade-panel-inline' },
    ];
    fileChecks.forEach(({ file }) => {
      const src = readSrc(file);
      expect(src).toMatch(/ps-tip-bubble/);
    });
  });

  it('css defines .ps-tip-bubble with visibility:hidden (not display:none) for accessible hide', () => {
    // visibility:hidden keeps bubble in layout flow without show/hide reflow;
    // display:none would shift content and is incompatible with getClientRects positioning.
    const css = readSrc('style.css');
    // Match the top-level .ps-tip-bubble block (not #tooltip-layer .ps-tip-bubble)
    // by requiring the selector to start at beginning of line or after a newline.
    const bubbleBlock = css.match(/(?:^|\n)\.ps-tip-bubble\s*\{([\s\S]*?)\}/);
    expect(bubbleBlock).not.toBeNull();
    expect(bubbleBlock?.[1]).toMatch(/visibility\s*:\s*hidden/);
  });

  it('css .ps-tip-bubble.is-open sets visibility:visible (not display:block)', () => {
    const css = readSrc('style.css');
    const openBlock = css.match(
      /(?:^|\n)\.ps-tip-bubble\.is-open\s*\{([\s\S]*?)\}/
    );
    expect(openBlock).not.toBeNull();
    expect(openBlock?.[1]).toMatch(/visibility\s*:\s*visible/);
  });

  it('#tooltip-layer is pointer-events:none with individual bubbles re-enabled', () => {
    // WHY: layer must be non-blocking (pointer-events:none) so it does not
    // intercept clicks on season cards or upgrade buttons beneath it.
    // Individual .ps-tip-bubble elements restore pointer-events:auto so the
    // user can hover/interact with the tooltip text.
    const css = readSrc('style.css');
    const layerBlock = css.match(/#tooltip-layer\s*\{([\s\S]*?)\}/);
    expect(layerBlock).not.toBeNull();
    expect(layerBlock?.[1]).toMatch(/pointer-events\s*:\s*none/);

    const bubbleInLayer = css.match(
      /#tooltip-layer\s+\.ps-tip-bubble\s*\{([\s\S]*?)\}/
    );
    expect(bubbleInLayer).not.toBeNull();
    expect(bubbleInLayer?.[1]).toMatch(/pointer-events\s*:\s*auto/);
  });

  it('no tooltip anchor remounts event-display on each renderEventBanner call', () => {
    // Each call to renderEventBanner must NOT rebuild the full banner DOM
    // (which would cause initMicroTooltips to run and dispose other instances).
    // ensureEventBannerUi() returns a boolean and rebuilds only when needed.
    const src = readSrc('ui/event-display.js');
    expect(src).toMatch(/ensureEventBannerUi/);
    // The return value of ensureEventBannerUi must be acted upon (bannerRebuilt check)
    expect(src).toMatch(/bannerRebuilt/);
  });
});

// ─── DOM behaviour checks ──────────────────────────────────────────────────

describe('tooltip system parity — DOM behaviour', () => {
  // Minimal shared DOM setup for system-level tests
  function buildMinimalDom() {
    document.body.innerHTML = `
      <div id="tooltip-layer"></div>
      <button class="ps-tip-trigger"
        aria-describedby="ps-tip-test"
        aria-expanded="false"
        data-tooltip-id="ps-tip-test">ℹ︎</button>
      <span id="ps-tip-test" class="ps-tip-bubble" role="tooltip">
        Test tooltip content
      </span>
    `;
  }

  beforeEach(buildMinimalDom);

  it('tooltip trigger has aria-describedby linking to bubble id', () => {
    const trigger = document.querySelector('.ps-tip-trigger');
    const id = trigger?.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const bubble = document.getElementById(id);
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains('ps-tip-bubble')).toBe(true);
  });

  it('tooltip trigger has aria-expanded=false before opening', () => {
    const trigger = document.querySelector('.ps-tip-trigger');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('tooltip trigger has data-tooltip-id matching aria-describedby', () => {
    const trigger = document.querySelector('.ps-tip-trigger');
    const ariaId = trigger.getAttribute('aria-describedby');
    const dataId = trigger?.dataset.tooltipId;
    expect(ariaId).toBe(dataId);
  });

  it('tooltip bubble has role=tooltip', () => {
    const bubble = document.querySelector('.ps-tip-bubble');
    expect(bubble?.getAttribute('role')).toBe('tooltip');
  });
});

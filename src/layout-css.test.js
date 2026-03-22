/*
File: src/layout-css.test.js
Purpose: Enforce desktop no-page-scroll and internal-scroll layout invariants.
Role in system: Regression guard for LOCKED_DECISIONS UI constraints.
Invariants/Security: Verifies CSS contract only; no runtime DOM injection or behavior mutation.
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readStyleCss() {
  const cssPath = path.resolve(process.cwd(), 'src', 'style.css');
  return fs.readFileSync(cssPath, 'utf8');
}

describe('dashboard layout css guardrails', () => {
  it('keeps page scrolling disabled at html/body level', () => {
    const css = readStyleCss();

    expect(css).toMatch(/html,\s*\nbody\s*\{[\s\S]*?overflow:\s*hidden;/);
  });

  it('keeps seasons-scroll as the internal scroll container on desktop', () => {
    const css = readStyleCss();

    expect(css).toMatch(/\.seasons-scroll\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(css).toMatch(/\.seasons-scroll\s*\{[\s\S]*?min-height:\s*0;/);
    expect(css).toMatch(/\.seasons-scroll\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;/);

    const seasonsGridBlock = css.match(/\.seasons-grid\s*\{([\s\S]*?)\}/);
    expect(seasonsGridBlock).not.toBeNull();
    expect(seasonsGridBlock?.[1] || '').not.toMatch(/overflow-y\s*:/);
  });

  it('constrains dashboard middle area to allow internal scrolling', () => {
    const css = readStyleCss();

    expect(css).toMatch(/\.dashboard-shell\s*\{[\s\S]*?min-height:\s*0;/);
    expect(css).toMatch(/\.dashboard-shell\s*\{[\s\S]*?flex:\s*1;/);
    expect(css).toMatch(/\.dashboard-main\s*\{[\s\S]*?min-height:\s*0;/);
    expect(css).toMatch(
      /\.dashboard-main\s*>\s*\*\s*\{[\s\S]*?min-height:\s*0;/
    );
  });

  it('keeps setup panel constrained with internal scrolling', () => {
    const css = readStyleCss();

    expect(css).toMatch(
      /\.setup-shell\s*\{[\s\S]*?max-height:\s*clamp\(120px,\s*28vh,\s*320px\);/
    );
    expect(css).toMatch(/\.setup-shell\s*\{[\s\S]*?min-height:\s*0;/);
    expect(css).toMatch(/\.setup-shell-scroll\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(css).toMatch(
      /\.setup-shell\.setup-collapsed\s*\{[\s\S]*?max-height:\s*0;/
    );
  });

  it('keeps season halving text selectable with threshold-based coloring', () => {
    const css = readStyleCss();

    expect(css).toMatch(/\.season-halving\s*\{[\s\S]*?user-select:\s*text;/);
    expect(css).toMatch(/\.season-halving\.season-halving--warning\s*\{/);
    expect(css).toMatch(/\.season-halving\.season-halving--critical\s*\{/);
  });

  it('prevents horizontal scrollbar in season upgrade containers', () => {
    const css = readStyleCss();

    expect(css).toMatch(/\.season-upgrades\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    // Column alignment is enforced via --upgrade-cols CSS variable (bounded minmax tracks)
    expect(css).toMatch(/--upgrade-cols\s*:/);
  });

  it('upgrade columns use shared CSS variable for header/row alignment', () => {
    const css = readStyleCss();

    // .upgrade-table defines the master column tracks via the variable
    expect(css).toMatch(/\.upgrade-table\s*\{[\s\S]*?var\(--upgrade-cols\)/);

    // header/row subgrids inherit those tracks — confirmed by 'subgrid' keyword
    expect(css).toMatch(/grid-template-columns\s*:\s*subgrid/);
  });

  it('upgrade-lane-list uses display:contents so rows join the parent upgrade-table grid', () => {
    const css = readStyleCss();

    expect(css).toMatch(
      /\.upgrade-lane-list[\s\S]*?\{[\s\S]*?display\s*:\s*contents/
    );
  });

  it('player-status panel has a fixed width variable and dashboard uses a fixed right column', () => {
    const css = readStyleCss();

    // --player-panel-width custom property must be declared
    expect(css).toMatch(/--player-panel-width\s*:/);

    // .dashboard-main must use the variable as the second column track
    expect(css).toMatch(
      /\.dashboard-main\s*\{[\s\S]*?grid-template-columns[\s\S]*?var\(--player-panel-width\)/
    );
  });

  it('seasons-scroll has min-width:0 to prevent the left column from overflowing the grid', () => {
    const css = readStyleCss();

    expect(css).toMatch(/\.seasons-scroll\s*\{[\s\S]*?min-width:\s*0;/);
  });

  it('seasons-grid uses two equal columns on desktop (2x2 layout)', () => {
    const css = readStyleCss();

    const gridBlock = css.match(/\.seasons-grid\s*\{([\s\S]*?)\}/);
    expect(gridBlock).not.toBeNull();
    expect(gridBlock?.[1] || '').toMatch(
      /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
  });
});

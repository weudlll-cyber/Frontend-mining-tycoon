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
    expect(css).toMatch(/\.upgrade-compact-grid\s*\{[\s\S]*?minmax\(0,/);
  });
});

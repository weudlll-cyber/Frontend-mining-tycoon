/**
File: src/a11y-css.test.js
Purpose: Guard the accessibility CSS contract on every page stylesheet.
Role in system: Regression guard for reduced motion, visible keyboard focus,
  the no-shift standings label and the phone-sized live tools window.
Invariants/Security: Reads CSS files only; no DOM injection.
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readCss(name) {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', name), 'utf8');
}

const PAGE_STYLESHEETS = ['style.css', 'lobby.css', 'how-to-play.css'];

describe('accessibility css guardrails', () => {
  it.each(PAGE_STYLESHEETS)(
    '%s disables animations and transitions for reduced motion',
    (name) => {
      const css = readCss(name);
      const block = css.match(
        /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}/
      );
      expect(block).not.toBeNull();
      expect(block[1]).toMatch(/animation-duration:\s*0\.01ms !important;/);
      expect(block[1]).toMatch(/transition-duration:\s*0\.01ms !important;/);
      expect(block[1]).toMatch(/scroll-behavior:\s*auto !important;/);
    }
  );

  it.each(PAGE_STYLESHEETS)('%s shows a focus outline on links', (name) => {
    const css = readCss(name);
    expect(css).toMatch(/a:focus-visible[\s\S]*?\{[^}]*outline:\s*\d+px solid/);
  });

  it('player focus ring covers buttons, inputs, tabs and overrides outline:none', () => {
    const css = readCss('style.css');
    const rule = css.match(
      /button:focus-visible,[\s\S]*?\{\s*outline:\s*3px solid #1d4ed8;/
    );
    expect(rule).not.toBeNull();
    ['input', 'select', "[role='tab']", '.form-group input'].forEach(
      (selector) => {
        expect(rule[0]).toContain(`${selector}:focus-visible`);
      }
    );
    // The focus ring must come after the legacy `outline: none` rules.
    expect(css.lastIndexOf('outline: none')).toBeLessThan(css.indexOf(rule[0]));
  });

  it('keeps the live tools window inside a phone viewport', () => {
    const css = readCss('style.css');
    const drawer = css.match(/\.live-drawer \{([\s\S]*?)\}/);
    expect(drawer?.[1]).toMatch(/max-width:\s*calc\(100vw - 16px\);/);
    expect(drawer?.[1]).toMatch(
      /min-width:\s*min\(280px, calc\(100vw - 16px\)\);/
    );
  });

  it('blocks horizontal page scroll on phones only', () => {
    const css = readCss('style.css');
    const mobile = css.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/);
    expect(mobile?.[1]).toMatch(/overflow-x:\s*hidden;/);
  });

  it('reserves space for the standings tag so the header does not shift', () => {
    const css = readCss('style.css');
    expect(css).toMatch(/\.standings-tag \{[\s\S]*?min-width:\s*6\.25rem;/);
    expect(css).toMatch(
      /\.standings-tag\[data-standings-state='none'\] \{\s*visibility:\s*hidden;/
    );
  });
});

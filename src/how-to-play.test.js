/**
File: src/how-to-play.test.js
Purpose: Guard the static "How to play" guide and the links that lead to it.
Role in system: Regression test for how-to-play.html (Vite input, no script),
  the lobby link in index.html and the player-board link in player.html.
Invariants: The guide stays static (no script, no external resources); the
  player-board link opens a new tab so the running game is not left.
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function parseHtml(relativePath) {
  return new DOMParser().parseFromString(
    readRepoFile(relativePath),
    'text/html'
  );
}

const SECTION_IDS = [
  'quick-start',
  'goal',
  'mining',
  'upgrades',
  'halvings',
  'oracle-prices',
  'trading',
  'round-types',
  'scoring',
  'events',
  'live-tools',
  'accounts',
  'farming',
];

describe('how-to-play guide page', () => {
  const doc = parseHtml('how-to-play.html');

  it('has a section for every topic and a table of contents linking to it', () => {
    const tocTargets = Array.from(
      doc.querySelectorAll('nav.guide-toc a[href^="#"]')
    ).map((link) => link.getAttribute('href').slice(1));

    expect(tocTargets).toEqual(SECTION_IDS);
    for (const id of SECTION_IDS) {
      const section = doc.getElementById(id);
      expect(section, id).not.toBeNull();
      expect(section.tagName).toBe('SECTION');
    }
  });

  it('stays static: no script and no external resources', () => {
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    const externalRefs = Array.from(
      doc.querySelectorAll('link[href], img[src]')
    ).filter((el) =>
      /^(https?:)?\/\//.test(el.getAttribute('href') || el.getAttribute('src'))
    );
    expect(externalRefs).toHaveLength(0);
    expect(readRepoFile('src/how-to-play.css')).not.toMatch(/@import|url\(/);
  });

  it('lists all four scoring modes and explains farming Stage 1', () => {
    const scoring = doc.getElementById('scoring').textContent;
    for (const mode of ['Stockpile', 'Power', 'Mining Time', 'Efficiency']) {
      expect(scoring).toContain(mode);
    }
    const farming = doc.getElementById('farming').textContent;
    expect(farming).not.toMatch(/not playable yet/i);
    expect(farming).toMatch(/restarts that token's cycle timer/);
    expect(farming).toMatch(/Stage 2/);
  });

  it('is a Vite build input and covered by the format check', () => {
    expect(readRepoFile('vite.config.js')).toContain(
      "resolve(__dirname, 'how-to-play.html')"
    );
    const pkg = JSON.parse(readRepoFile('package.json'));
    expect(pkg.scripts['format:check']).toContain('how-to-play.html');
  });
});

describe('links to the how-to-play guide', () => {
  it('lobby links to the guide in the same tab', () => {
    const link = parseHtml('index.html').getElementById('how-to-play-link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/how-to-play.html');
    expect(link.hasAttribute('target')).toBe(false);
  });

  it('player board links to the guide in a new tab from the header actions', () => {
    const link = parseHtml('player.html').getElementById('how-to-play-link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/how-to-play.html');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.closest('.header-actions')).not.toBeNull();
  });
});

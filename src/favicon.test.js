/**
File: src/favicon.test.js
Purpose: Every page uses the game icon (public/favicon.svg, the "season gem").
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PAGES = [
  'index.html',
  'player.html',
  'admin.html',
  'how-to-play.html',
  'how-to-play.de.html',
  'privacy.html',
  'imprint.html',
];

function read(file) {
  return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

describe('game icon', () => {
  it.each(PAGES)('%s links the season gem icon', (page) => {
    const doc = new DOMParser().parseFromString(read(page), 'text/html');
    const icons = doc.querySelectorAll('link[rel="icon"]');
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute('href')).toBe('/favicon.svg');
  });

  it('is an SVG with the four season facets', () => {
    const svg = read('public/favicon.svg');
    for (const color of ['#4f9d4a', '#e0b324', '#cf6a2a', '#3f7fc4']) {
      expect(svg).toContain(color);
    }
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/vite.svg'))).toBe(
      false
    );
  });
});

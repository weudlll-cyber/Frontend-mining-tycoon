/**
File: src/how-to-play.test.js
Purpose: Guard the static "How to play" guide and the links that lead to it.
Role in system: Regression test for how-to-play.html (Vite input, no script),
  its translations (src/config/guide-languages.js), the lobby intro in
  index.html and the player-board link in player.html.
Invariants: The guide stays static (no script, no external resources); the
  player-board link opens a new tab so the running game is not left.
*/

import { describe, expect, it } from 'vitest';
import { GUIDE_LANGUAGES } from './config/guide-languages.js';
import { readRepoFile } from './test-utils/repo-files.js';

function parseHtml(relativePath) {
  return new DOMParser().parseFromString(
    readRepoFile(relativePath),
    'text/html'
  );
}

const SECTION_IDS = [
  'principle',
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
  'roadmap',
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

describe('how-to-play guide content', () => {
  const doc = parseHtml('how-to-play.html');

  it('explains the game principle before the details', () => {
    const steps = Array.from(
      doc.querySelectorAll('#principle ol.guide-steps > li strong')
    ).map((el) => el.textContent.trim());
    expect(steps).toEqual([
      'Mine.',
      'Invest.',
      'Read the market.',
      'Time your moves.',
      'Win.',
    ]);
  });

  it('keeps planned features apart in the marked roadmap section', () => {
    const roadmap = doc.getElementById('roadmap');
    expect(roadmap.classList.contains('guide-roadmap')).toBe(true);
    expect(roadmap.textContent).toMatch(/planned/i);
    expect(roadmap.textContent).toMatch(/Not planned, by design/);
    // The roadmap is the last section so the rules above stay "as of today".
    const sections = doc.querySelectorAll('main > section.guide-section');
    expect(sections[sections.length - 1].id).toBe('roadmap');
  });
});

describe('how-to-play guide languages', () => {
  it('lists English first as the default page', () => {
    expect(GUIDE_LANGUAGES[0]).toEqual({
      code: 'en',
      label: 'English',
      file: 'how-to-play.html',
    });
    const codes = GUIDE_LANGUAGES.map((lang) => lang.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  for (const lang of GUIDE_LANGUAGES) {
    describe(`${lang.label} page (${lang.file})`, () => {
      const doc = parseHtml(lang.file);

      it('declares its language and has the same sections as English', () => {
        expect(doc.documentElement.getAttribute('lang')).toBe(lang.code);
        const ids = Array.from(
          doc.querySelectorAll('main > section.guide-section')
        ).map((section) => section.id);
        expect(ids).toEqual(SECTION_IDS);
      });

      it('shows a language switch with every language, marking its own', () => {
        const links = Array.from(doc.querySelectorAll('nav.guide-lang a'));
        expect(
          links.map((link) => [
            link.getAttribute('hreflang'),
            link.getAttribute('href'),
          ])
        ).toEqual(GUIDE_LANGUAGES.map((l) => [l.code, `/${l.file}`]));
        const current = links.filter(
          (link) => link.getAttribute('aria-current') === 'page'
        );
        expect(current.map((link) => link.getAttribute('hreflang'))).toEqual([
          lang.code,
        ]);
      });

      it('is built by Vite and covered by the format check', () => {
        expect(readRepoFile('vite.config.js')).toContain('GUIDE_LANGUAGES');
        const pkg = JSON.parse(readRepoFile('package.json'));
        const formatted =
          lang.code === 'en' || pkg.scripts['format:check'].includes(lang.file);
        expect(formatted).toBe(true);
      });
    });
  }
});

describe('links to the how-to-play guide', () => {
  it('lobby start screen shows the intro with the guide and roadmap links', () => {
    const doc = parseHtml('index.html');
    const intro = doc.getElementById('lobby-intro');
    expect(intro).not.toBeNull();
    expect(intro.hasAttribute('hidden')).toBe(false);
    // Inside the first panel, above the sign-in form, so it is seen first.
    expect(intro.closest('.auth-panel')).not.toBeNull();
    expect(
      intro.compareDocumentPosition(doc.getElementById('login-form')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(intro.contains(doc.getElementById('how-to-play-link'))).toBe(true);
    expect(doc.getElementById('roadmap-link').getAttribute('href')).toBe(
      '/how-to-play.html#roadmap'
    );
  });

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

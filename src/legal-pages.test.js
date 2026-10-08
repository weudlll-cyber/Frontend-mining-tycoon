/**
File: src/legal-pages.test.js
Purpose: Guard the static legal page templates (privacy.html, imprint.html) and the
  links that lead to them.
Role in system: Regression test for the two Vite inputs (no script), their template
  banner and operator placeholders, the lobby footer and registration-dialog links and
  the how-to-play footer links.
Invariants: The pages stay static (no script, no external resources); every
  operator-specific fact is a visible [PLACEHOLDER]; the template banner is present
  until an operator replaces the templates.
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

function placeholdersOf(doc) {
  return Array.from(doc.querySelectorAll('mark.legal-placeholder')).map((el) =>
    el.textContent.replace(/\s+/g, ' ').trim()
  );
}

const LEGAL_PAGES = {
  'privacy.html': [
    '[OPERATOR NAME]',
    '[POSTAL ADDRESS]',
    '[CONTACT EMAIL]',
    '[HOSTING PROVIDER]',
    '[SUPERVISORY AUTHORITY]',
    '[LAST UPDATED DATE]',
    '[LOG RETENTION PERIOD]',
  ],
  'imprint.html': [
    '[OPERATOR NAME]',
    '[POSTAL ADDRESS]',
    '[CONTACT EMAIL]',
    '[RESPONSIBLE PERSON NAME]',
    '[VAT ID]',
    '[LAST UPDATED DATE]',
  ],
};

describe.each(Object.entries(LEGAL_PAGES))(
  'legal page template %s',
  (file, requiredPlaceholders) => {
    const doc = parseHtml(file);

    it('shows the template banner at the top', () => {
      const banner = doc.getElementById('legal-template-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent.replace(/\s+/g, ' ')).toContain(
        'Template — must be completed and reviewed (ideally by a legal professional) before going live.'
      );
      expect(banner.closest('header')).not.toBeNull();
    });

    it('marks every operator-specific fact as a visible placeholder', () => {
      const placeholders = placeholdersOf(doc);
      for (const marker of requiredPlaceholders) {
        expect(placeholders, marker).toContain(marker);
      }
      for (const text of placeholders) {
        expect(text).toMatch(/^\[.+\]$/);
      }
    });

    it('stays static: no script and no external resources', () => {
      expect(doc.querySelectorAll('script')).toHaveLength(0);
      const externalRefs = Array.from(
        doc.querySelectorAll('link[href], img[src]')
      ).filter((el) =>
        /^(https?:)?\/\//.test(
          el.getAttribute('href') || el.getAttribute('src')
        )
      );
      expect(externalRefs).toHaveLength(0);
    });

    it('is a Vite build input, format-checked and deployed', () => {
      expect(readRepoFile('vite.config.js')).toContain(
        `resolve(__dirname, '${file}')`
      );
      const pkg = JSON.parse(readRepoFile('package.json'));
      expect(pkg.scripts['format:check']).toContain(file);
      expect(readRepoFile('scripts/deploy-to-vps.ps1')).toContain(`"${file}"`);
      expect(readRepoFile('deploy/remote/install-frontend.sh')).toContain(
        ` ${file}`
      );
    });
  }
);

describe('privacy notice content', () => {
  const text = parseHtml('privacy.html').body.textContent.replace(/\s+/g, ' ');

  it('names the data the software actually processes', () => {
    for (const fact of [
      'Discord handle',
      'Telegram handle',
      'user agent',
      'app-auth-session',
      'AUTH_AUDIT_RETENTION_DAYS',
      'Chat messages are not stored',
      '14 days',
      'do not load anything from Google Fonts',
      'Download my data',
      'Delete account',
      'Deleted player',
    ]) {
      expect(text, fact).toContain(fact);
    }
  });
});

describe('links to the legal pages', () => {
  it('lobby footer links both pages in the same tab', () => {
    const doc = parseHtml('index.html');
    const footer = doc.querySelector('footer.lobby-footer');
    expect(footer).not.toBeNull();
    const privacy = doc.getElementById('privacy-link');
    const imprint = doc.getElementById('imprint-link');
    expect(privacy.getAttribute('href')).toBe('/privacy.html');
    expect(imprint.getAttribute('href')).toBe('/imprint.html');
    expect(footer.contains(privacy) && footer.contains(imprint)).toBe(true);
    expect(privacy.hasAttribute('target')).toBe(false);
  });

  it('registration dialog points to the privacy notice without a checkbox', () => {
    const doc = parseHtml('index.html');
    const note = doc.getElementById('register-privacy-note');
    expect(note).not.toBeNull();
    expect(note.closest('#register-form')).not.toBeNull();
    expect(note.textContent.replace(/\s+/g, ' ')).toContain(
      'By creating an account you agree to the privacy notice'
    );
    const link = note.querySelector('a');
    expect(link.getAttribute('href')).toBe('/privacy.html');
    // Opens in a new tab so the half-filled form is not lost.
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(
      doc.querySelectorAll('#register-form input[type="checkbox"]')
    ).toHaveLength(0);
  });

  it('how-to-play footer and the two legal pages link each other', () => {
    const guideHrefs = Array.from(
      parseHtml('how-to-play.html').querySelectorAll('footer a')
    ).map((a) => a.getAttribute('href'));
    expect(guideHrefs).toEqual(
      expect.arrayContaining(['/privacy.html', '/imprint.html'])
    );
    expect(
      parseHtml('privacy.html').querySelector('footer a[href="/imprint.html"]')
    ).not.toBeNull();
    expect(
      parseHtml('imprint.html').querySelector('footer a[href="/privacy.html"]')
    ).not.toBeNull();
  });
});

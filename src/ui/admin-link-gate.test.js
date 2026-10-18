/**
 * File: src/ui/admin-link-gate.test.js
 * Purpose: The admin link on player.html appears only with ?admin=1, and
 *          player.html carries no inline script (Content-Security-Policy).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyAdminLinkGate } from './admin-link-gate.js';

describe('applyAdminLinkGate', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<a id="admin-setup-link" style="display: none">+ New Game</a>';
  });

  it('shows the link with ?admin=1', () => {
    expect(applyAdminLinkGate('?admin=1')).toBe(true);
    expect(document.getElementById('admin-setup-link').style.display).toBe(
      'inline-flex'
    );
  });

  it('keeps the link hidden otherwise', () => {
    expect(applyAdminLinkGate('?admin=0')).toBe(false);
    expect(applyAdminLinkGate('')).toBe(false);
    expect(document.getElementById('admin-setup-link').style.display).toBe(
      'none'
    );
  });

  it('does nothing without the link', () => {
    document.body.innerHTML = '';
    expect(applyAdminLinkGate('?admin=1')).toBe(false);
  });
});

describe('Content-Security-Policy readiness', () => {
  const pages = fs
    .readdirSync(process.cwd())
    .filter((name) => name.endsWith('.html'));

  it.each(pages)('%s has no inline <script>', (page) => {
    const html = fs.readFileSync(path.resolve(process.cwd(), page), 'utf8');
    const scripts = html.match(/<script\b[^>]*>/gi) || [];
    scripts.forEach((tag) => expect(tag).toMatch(/\bsrc=/));
  });

  it('the nginx template sends the policy with the backend origin', () => {
    const conf = fs.readFileSync(
      path.resolve(process.cwd(), 'deploy/nginx/mining-frontend.conf'),
      'utf8'
    );
    const policies = conf.match(/Content-Security-Policy "[^"]+"/g) || [];
    // Server level and the hashed-assets location (add_header replaces).
    expect(policies).toHaveLength(2);
    policies.forEach((policy) => {
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain('connect-src');
      expect(policy).toContain('__API_ORIGIN__ __API_WS_ORIGIN__');
      expect(policy).toContain("frame-ancestors 'none'");
    });
  });
});

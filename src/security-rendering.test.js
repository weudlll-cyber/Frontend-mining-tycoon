/**
File: src/security-rendering.test.js
Purpose: Guard safe rendering posture across runtime entrypoints.
Role in system: Prevent regressions to unsafe DOM APIs in core frontend modules.
Invariants/Security: Blocks untrusted innerHTML usage and enforces text-based rendering patterns.
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readSource(relativePath) {
  const sourcePath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(sourcePath, 'utf8');
}

describe('runtime rendering safety guardrails', () => {
  it('avoids runtime innerHTML assignment in main rendering entrypoint', () => {
    const source = readSource(path.join('src', 'main.js'));
    expect(source).not.toMatch(/\.innerHTML\s*=/);
  });

  it('keeps lobby and admin console free of innerHTML assignments', () => {
    for (const relativePath of [
      path.join('src', 'lobby.js'),
      path.join('src', 'admin', 'admin-setup.js'),
      path.join('src', 'ui', 'event-display.js'),
    ]) {
      const source = readSource(relativePath);
      expect(source).not.toMatch(/\.innerHTML\s*=/);
    }
  });

  it('never interpolates backend values into HTML template strings', () => {
    const adminSource = readSource(path.join('src', 'admin', 'admin-setup.js'));
    expect(adminSource).not.toMatch(/innerHTML\s*=\s*`/);
  });
});

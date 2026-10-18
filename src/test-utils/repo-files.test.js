import { describe, expect, it } from 'vitest';
import { readCssBundle, readRepoFile } from './repo-files.js';

describe('repo file helpers', () => {
  it('reads a repository file', () => {
    expect(readRepoFile('package.json')).toContain('"name"');
  });

  it('inlines local @import statements of a stylesheet', () => {
    const bundle = readCssBundle('src/style.css');
    expect(bundle).not.toMatch(/@import\s+['"]\.\//);
    expect(bundle).toContain('.ps-tip-bubble');
  });
});

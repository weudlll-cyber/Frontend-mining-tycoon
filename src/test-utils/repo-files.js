// Shared helpers for tests that read repository files (HTML pages, CSS).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Read a file relative to the repository root. */
export function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

const IMPORT_RE = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

/**
 * Read a stylesheet relative to the repository root with its local
 * `@import`s inlined in place (like the Vite build does), so tests see the
 * whole cascade of an entry stylesheet such as src/style.css.
 */
export function readCssBundle(relativePath) {
  const css = readRepoFile(relativePath);
  const dir = path.posix.dirname(relativePath.replaceAll('\\', '/'));
  return css.replace(IMPORT_RE, (statement, target) =>
    target.startsWith('.')
      ? readCssBundle(path.posix.join(dir, target))
      : statement
  );
}

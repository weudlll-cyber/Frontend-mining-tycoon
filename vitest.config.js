import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // The default 'forks' pool cannot spawn its workers reliably on Windows
    // (26 of 51 test files died with "Timeout waiting for worker to respond"),
    // which permanently blocked the pre-push gate. Threads run the same suite
    // green in half the time.
    pool: 'threads',
    exclude: ['.stryker-tmp/**', 'coverage/**', 'dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/style.css', '.stryker-tmp/**'],
      thresholds: {
        lines: 67,
        statements: 67,
        functions: 62,
        branches: 57,
      },
    },
  },
});

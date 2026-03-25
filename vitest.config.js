import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
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

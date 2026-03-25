/*
File: stryker.config.mjs
Purpose: Mutation-testing configuration for high-signal frontend logic.
*/

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/meta/meta-manager.js',
    'src/utils/storage-utils.js',
    'src/services/session-actions.js',
    'src/services/stream-controller.js',
  ],
  testRunner: 'command',
  commandRunner: {
    command: 'npm run test -- --run',
  },
  ignorePatterns: ['.venv/**', 'coverage/**'],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html',
  },
  coverageAnalysis: 'off',
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
  tempDirName: '.stryker-tmp',
};

export default config;

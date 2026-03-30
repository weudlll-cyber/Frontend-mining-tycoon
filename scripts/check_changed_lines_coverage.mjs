/*
File: scripts/check_changed_lines_coverage.mjs
Purpose: Enforce changed-lines coverage for PRs using Istanbul JSON coverage output.
Role in system:
- Fails CI when added production JS lines are not covered by tests.
Invariants:
- Only production JS files under src are enforced (test files are excluded).
- Uses git diff against PR base SHA to determine added lines.
*/

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

function normalizePath(value) {
  return value.replaceAll('\\\\', '/').replaceAll('\\', '/');
}

function getBaseSha() {
  const fromEnv = process.env.BASE_SHA || process.env.GITHUB_BASE_SHA;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  throw new Error('Missing BASE_SHA/GITHUB_BASE_SHA for changed-lines coverage check.');
}

function collectAddedLines(baseSha) {
  const diffCommand = `git diff --unified=0 --diff-filter=AM ${baseSha}...HEAD -- src/**/*.js`;
  const output = execSync(diffCommand, { encoding: 'utf8' });
  const linesByFile = new Map();

  let currentFile = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      const filePath = line.slice('+++ b/'.length);
      if (filePath.endsWith('.test.js')) {
        currentFile = null;
        continue;
      }
      currentFile = filePath;
      if (!linesByFile.has(currentFile)) {
        linesByFile.set(currentFile, new Set());
      }
      continue;
    }

    if (!currentFile || !line.startsWith('@@')) {
      continue;
    }

    const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }

    const start = Number.parseInt(match[1], 10);
    const count = Number.parseInt(match[2] || '1', 10);
    if (!Number.isFinite(start) || !Number.isFinite(count) || count <= 0) {
      continue;
    }

    const fileLines = linesByFile.get(currentFile);
    for (let i = 0; i < count; i += 1) {
      fileLines.add(start + i);
    }
  }

  for (const [filePath, set] of [...linesByFile.entries()]) {
    if (set.size === 0) {
      linesByFile.delete(filePath);
    }
  }

  return linesByFile;
}

function buildCoveredLineSet(fileCoverage) {
  const covered = new Set();
  for (const [statementId, span] of Object.entries(fileCoverage.statementMap || {})) {
    const hitCount = fileCoverage.s?.[statementId] ?? 0;
    if (hitCount <= 0) {
      continue;
    }
    const startLine = span?.start?.line;
    const endLine = span?.end?.line;
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
      continue;
    }
    for (let line = startLine; line <= endLine; line += 1) {
      covered.add(line);
    }
  }
  return covered;
}

function buildCoverableLineSet(fileCoverage) {
  const coverable = new Set();
  for (const span of Object.values(fileCoverage.statementMap || {})) {
    const startLine = span?.start?.line;
    const endLine = span?.end?.line;
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
      continue;
    }
    for (let line = startLine; line <= endLine; line += 1) {
      coverable.add(line);
    }
  }
  return coverable;
}

function resolveCoverageEntry(coverageMap, relFilePath) {
  const normalizedRel = normalizePath(relFilePath);
  for (const [coveragePath, data] of Object.entries(coverageMap)) {
    const normalizedCoveragePath = normalizePath(coveragePath);
    if (
      normalizedCoveragePath.endsWith(`/${normalizedRel}`) ||
      normalizedCoveragePath.endsWith(normalizedRel)
    ) {
      return data;
    }
  }
  return null;
}

function main() {
  const baseSha = getBaseSha();
  const coveragePath = path.resolve('coverage', 'coverage-final.json');

  if (!existsSync(coveragePath)) {
    throw new Error('coverage/coverage-final.json not found. Run coverage tests first.');
  }

  const addedLinesByFile = collectAddedLines(baseSha);
  if (addedLinesByFile.size === 0) {
    console.log('No added production JS lines found; changed-lines coverage passes.');
    return;
  }

  const coverageMap = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const failures = [];

  for (const [filePath, addedLines] of addedLinesByFile.entries()) {
    const coverageEntry = resolveCoverageEntry(coverageMap, filePath);
    if (!coverageEntry) {
      failures.push({
        filePath,
        missing: [...addedLines].sort((a, b) => a - b),
      });
      continue;
    }

    const coverableLines = buildCoverableLineSet(coverageEntry);
    const enforcedLines = [...addedLines].filter((line) => coverableLines.has(line));
    if (enforcedLines.length === 0) {
      continue;
    }

    const coveredLines = buildCoveredLineSet(coverageEntry);
    const uncovered = enforcedLines.filter((line) => !coveredLines.has(line));
    if (uncovered.length > 0) {
      failures.push({
        filePath,
        missing: uncovered.sort((a, b) => a - b),
      });
    }
  }

  if (failures.length === 0) {
    console.log('Changed-lines coverage check passed.');
    return;
  }

  console.error('Changed-lines coverage failed. Uncovered added lines:');
  for (const failure of failures) {
    console.error(`- ${failure.filePath}: ${failure.missing.join(', ')}`);
  }
  process.exit(1);
}

main();

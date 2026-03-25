/*
File: scripts/check_license_policy.mjs
Purpose: Fail CI when installed frontend dependencies use disallowed licenses.
Role in system:
- Enforces the repository's strong-copyleft license deny policy.
- Reads license-checker JSON output generated in CI.
Invariants:
- Only explicit strong-copyleft families are blocked automatically.
- Missing license data is treated as a failure and must be reviewed.
*/

import { readFileSync } from 'node:fs';
import path from 'node:path';

const DISALLOWED_PREFIXES = ['GPL', 'AGPL', 'SSPL'];

function normalizeLicenses(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+OR\s+|\s+AND\s+|\//i)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function isDisallowedLicense(license) {
  const normalized = license.toUpperCase();
  return DISALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/check_license_policy.mjs <license-json-path>');
  }

  const resolvedPath = path.resolve(inputPath);
  const rawJson = readFileSync(resolvedPath, 'utf8').replace(/^\uFEFF/, '');
  const licenseMap = JSON.parse(rawJson);
  const failures = [];

  for (const [packageName, metadata] of Object.entries(licenseMap)) {
    const licenses = normalizeLicenses(metadata?.licenses);
    if (licenses.length === 0) {
      failures.push({ packageName, reason: 'missing license metadata' });
      continue;
    }

    const blocked = licenses.filter(isDisallowedLicense);
    if (blocked.length > 0) {
      failures.push({ packageName, reason: `disallowed licenses: ${blocked.join(', ')}` });
    }
  }

  if (failures.length === 0) {
    console.log('Frontend license policy passed.');
    return;
  }

  console.error('Frontend license policy failed. Review the following packages:');
  for (const failure of failures) {
    console.error(`- ${failure.packageName}: ${failure.reason}`);
  }
  process.exit(1);
}

main();

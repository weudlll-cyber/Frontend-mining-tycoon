# Frontend Audit Matrix

This matrix defines mandatory audit gates and frequency for the frontend repository.

## PR Audit Matrix

| Audit category | Check | Threshold / Gate | Enforcement |
|---|---|---|---|
| Security basis | `npm audit --omit=dev --audit-level=high` | `0` high/critical vulnerabilities | Blocking |
| Secret scanning | `gitleaks` | `0` verified secrets in repo history or diff | Blocking |
| Source cleanliness | `npm run clean:audit` | `0` blocking findings (eslint + unused/dependency scan) | Blocking |
| Tests | `npm run test -- --run` | All tests pass | Blocking |
| Changed-lines coverage | `npm run check:changed-lines-coverage` | `100%` of added production JS lines covered | Blocking (PR only) |
| Contract checks | `npm run test:contract` | Contract suite passes completely | Blocking (PR only) |
| License policy | Dependency review + license policy script | No new dependencies with `GPL`, `AGPL`, or `SSPL` licenses | Blocking |

## Nightly Audit Matrix

| Audit category | Check | Threshold / Gate | Enforcement |
|---|---|---|---|
| Full test suite | clean:audit + format + test + coverage + build | All checks pass | Blocking |
| Flaky detection | `npm run test -- --run` repeated 3x | `3/3` successful runs | Blocking |
| Extended security scanning | `npm audit --audit-level=moderate` | `0` moderate/high/critical vulnerabilities | Blocking |
| Secret scanning | `gitleaks` | `0` verified secrets in repo history | Blocking |
| SBOM generation | CycloneDX SBOM export | SBOM artifact must generate successfully | Blocking |
| License policy | `license-checker` + policy script | No installed dependencies with `GPL`, `AGPL`, or `SSPL` licenses | Blocking |

## Frequency

- PR audits: every pull request
- Nightly audits: daily scheduled workflow (`nightly-audits.yml`)

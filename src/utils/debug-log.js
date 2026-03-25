/**
File: src/utils/debug-log.js
Purpose: Provide low-noise dev-only diagnostics logging for runtime predicate tracing.
Role in system:
- Centralizes guarded debug output so production behavior stays unchanged.
Invariants:
- Never log secrets such as tokens or tickets.
- Logging must stay non-blocking and optional.
Security notes:
- Callers must pass only non-sensitive metadata.
*/

function isDevRuntime() {
  if (typeof import.meta !== 'undefined' && import.meta?.env) {
    return Boolean(import.meta.env.DEV);
  }
  return false;
}

export function debugLog(scope, message, details = null) {
  if (!isDevRuntime()) return;

  const prefix = `[${scope}] ${message}`;
  if (details === null || details === undefined) {
    console.debug(prefix);
    return;
  }
  console.debug(prefix, details);
}

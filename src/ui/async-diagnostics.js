/*
File: src/ui/async-diagnostics.js
Purpose: Pure helper logic for async diagnostics probe flow.
*/

export function shouldResetAsyncDiagnostics({ baseUrl, gameId, roundMode }) {
  return !baseUrl || !gameId || roundMode !== 'async';
}

export function createAsyncDiagnosticsProbeKey({ baseUrl, gameId, playerId }) {
  return `${baseUrl}|${gameId}|${playerId}`;
}

export function shouldSkipAsyncDiagnosticsProbe({
  force,
  probeKey,
  previousProbeKey,
  inFlight,
}) {
  if (inFlight && !force) {
    return true;
  }
  if (!force && probeKey === previousProbeKey && !inFlight) {
    return true;
  }
  return false;
}

export function resolveSessionSupportProbeValue(sessionSupportResult) {
  return typeof sessionSupportResult?.supported === 'boolean'
    ? sessionSupportResult.supported
    : null;
}

export function resolveRequirePlayerAuthValue(authResult) {
  return authResult?.value === true || authResult?.value === false
    ? authResult.value
    : 'unknown';
}

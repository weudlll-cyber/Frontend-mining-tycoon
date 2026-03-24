/*
File: src/ui/round-context.js
Purpose: Resolve round mode and async session-start capability from setup/meta state.
*/

export function getRoundModeFromMeta(meta) {
  const raw = String(meta?.round_mode || meta?.round_type || '')
    .trim()
    .toLowerCase();
  if (raw === 'async' || raw === 'asynchronous') return 'async';
  return 'sync';
}

export function getSessionSupportFromMeta(meta) {
  if (!meta) return null;
  if (
    meta.supports_round_sessions === true ||
    meta.supports_session_stream === true ||
    meta.supports_async_sessions === true
  ) {
    return true;
  }
  if (
    meta.supports_round_sessions === false ||
    meta.supports_session_stream === false
  ) {
    return false;
  }

  const capabilityLists = [];
  if (Array.isArray(meta.capabilities)) capabilityLists.push(meta.capabilities);
  if (Array.isArray(meta.features)) capabilityLists.push(meta.features);
  const capabilityMatch = capabilityLists
    .flat()
    .map((entry) => String(entry).toLowerCase())
    .some((entry) => entry.includes('session'));
  return capabilityMatch ? true : null;
}

export function resolveAsyncWindowOpen(meta) {
  if (getRoundModeFromMeta(meta) === 'async') {
    return true;
  }
  if (typeof meta?.window_open === 'boolean') {
    return meta.window_open;
  }
  return null;
}

export function computeCurrentRoundContext({
  gameMeta,
  selectedRoundType,
  isStreamActive,
  latestGameStatus,
  setupRoundModeOverride,
  asyncSessionSupportProbe,
  sessionStartSupported,
}) {
  const metaRoundMode = getRoundModeFromMeta(gameMeta);
  const shouldPreferHostSelection =
    selectedRoundType === 'async' &&
    !isStreamActive &&
    (latestGameStatus === null ||
      latestGameStatus === 'idle' ||
      latestGameStatus === 'enrolling');
  const roundMode =
    setupRoundModeOverride === 'async' || setupRoundModeOverride === 'sync'
      ? setupRoundModeOverride
      : shouldPreferHostSelection
        ? 'async'
        : gameMeta
          ? metaRoundMode
          : selectedRoundType;

  const supportFromMeta = getSessionSupportFromMeta(gameMeta);
  const supportFromProbe =
    typeof asyncSessionSupportProbe === 'boolean'
      ? asyncSessionSupportProbe
      : null;
  const supportsSessionStart =
    roundMode !== 'async'
      ? false
      : supportFromMeta === false
        ? false
        : supportFromMeta === true
          ? true
          : supportFromProbe === true
            ? true
            : sessionStartSupported;

  return {
    roundMode,
    supportsSessionStart,
  };
}

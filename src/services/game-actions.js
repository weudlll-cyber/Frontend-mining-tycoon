/*
File: src/services/game-actions.js
Purpose: Handle upgrade submissions and create-then-join game session flows.
Role in system:
- Orchestrates frontend intent calls for game creation/joining while backend remains authoritative.
Invariants:
- No modal or blocking UX side-effects; status remains inline.
- Async session auto-start must never silently fallback to legacy stream on malformed session responses.
Security notes:
- Encode IDs in URLs and never surface or log token secrets.
*/

let _deps = null;

export function initGameActions(deps) {
  _deps = deps;
}

async function getErrorMessageFromResponse(response, fallbackMessage) {
  try {
    const errorData = await response.json();
    const detail =
      errorData &&
      typeof errorData.detail === 'string' &&
      errorData.detail.trim()
        ? errorData.detail
        : fallbackMessage;
    const code =
      errorData && typeof errorData.code === 'string' && errorData.code
        ? errorData.code
        : null;
    return { detail, code };
  } catch {
    return { detail: fallbackMessage, code: null };
  }
}

export async function performUpgrade(
  upgradeType,
  nextLevel,
  targetToken,
  payToken
) {
  if (!_deps.isActiveContractSupported()) {
    _deps.showToast(
      'Unsupported contract version. Upgrade actions are disabled.',
      'error'
    );
    return;
  }

  const lastGameData = _deps.getLastGameData();
  if (!lastGameData?.game_id || !lastGameData?.player_id) {
    console.error('No game or player data available for upgrade');
    return;
  }

  const baseUrl = _deps.getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }

  const gameId = lastGameData.game_id;
  const playerId = lastGameData.player_id;
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(gameId, playerId)
  );

  const selectedTokens = _deps.getSelectedTokens();
  const actualTargetToken = targetToken || selectedTokens.targetToken;
  // WHY: Inline lanes may select a different pay token per-upgrade; fallback stays backward-compatible with legacy panel selection.
  const actualPayToken =
    payToken || selectedTokens.payToken || actualTargetToken;

  const headers = { 'Content-Type': 'application/json' };
  if (playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  try {
    const response = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/upgrade`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          upgrade_type: upgradeType,
          target_token: actualTargetToken,
          pay_token: actualPayToken,
        }),
      }
    );

    if (!response.ok) {
      const { detail } = await getErrorMessageFromResponse(
        response,
        `Upgrade failed: ${response.status} ${response.statusText}`
      );
      throw new Error(detail);
    }

    await response.json();
    _deps.showToast(
      `Upgraded ${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)} to level ${nextLevel}`,
      'success'
    );
  } catch (error) {
    console.error('Upgrade error:', error);
    _deps.showToast(`Upgrade failed: ${error.message}`, 'error');
  }
}

export async function startRoundSession(roundId, playerId) {
  const baseUrl = _deps.getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    return { sessionId: null, unsupported: false };
  }

  const encodedRoundId = encodeURIComponent(roundId);
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(roundId, playerId)
  );
  const headers = { 'Content-Type': 'application/json' };
  if (playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  const endpoints = [
    `${baseUrl}/rounds/${encodedRoundId}/sessions`,
    `${baseUrl}/games/${encodedRoundId}/sessions`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ player_id: playerId }),
      });

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      if (!response.ok) {
        const { detail } = await getErrorMessageFromResponse(
          response,
          `Session start failed: ${response.status} ${response.statusText}`
        );
        throw new Error(detail);
      }

      const sessionData = await response.json();
      const sessionId = sessionData?.session_id || sessionData?.id || null;
      if (!sessionId) {
        throw new Error(
          'Session start succeeded but no session_id was returned'
        );
      }

      return { sessionId, unsupported: false };
    } catch (error) {
      console.error('Session start error:', error);
      _deps.showToast(`Session start failed: ${error.message}`, 'error');
      return { sessionId: null, unsupported: false };
    }
  }

  return { sessionId: null, unsupported: true };
}

export async function createNewGameAndJoin() {
  if (!_deps) {
    throw new Error('Game actions module is not initialized.');
  }

  if (_deps.hasOpenStream()) {
    _deps.stopActiveStream();
  }
  _deps.disconnectChat();

  _deps.onSetupBusyChange(true);
  _deps.clearNewGameStatus();

  const baseUrl = _deps.getNormalizedBaseUrlOrNull({ notify: false });
  if (!baseUrl) {
    _deps.showNewGameStatus(
      'Error: Invalid backend URL. Use http://host:port or https://host:port.',
      'error'
    );
    _deps.onSetupBusyChange(false);
    return;
  }

  const playerName = _deps.getPlayerName();
  const selectedRoundType = _deps.getSelectedRoundType?.() || 'sync';
  const shouldAutoStartAsyncSession =
    _deps.shouldAutoStartAsyncSession?.() !== false;
  const isAsyncHostRound = selectedRoundType === 'async';
  _deps.cleanupGameMetaCache();

  try {
    let durationPayload;
    let asyncRoundPreset = null;
    let asyncSessionDurationSeconds = null;
    if (isAsyncHostRound) {
      const asyncPreset = _deps.getAsyncDurationPreset?.();
      if (!asyncPreset) {
        throw new Error('Invalid async round duration preset.');
      }
      const asyncSessionSeconds = _deps.getAsyncSessionDurationSeconds?.();
      if (!Number.isFinite(asyncSessionSeconds) || asyncSessionSeconds <= 0) {
        throw new Error('Invalid async session duration.');
      }
      asyncRoundPreset = asyncPreset;
      asyncSessionDurationSeconds = Math.floor(asyncSessionSeconds);
      durationPayload = {
        duration_mode: 'preset',
        duration_preset: asyncPreset,
      };
    } else {
      try {
        const durationResolution = _deps.resolveDurationSeconds();
        if (durationResolution.mode === 'custom') {
          durationPayload = {
            duration_mode: 'custom',
            duration_custom_seconds: durationResolution.customSeconds,
          };
        } else {
          durationPayload = {
            duration_mode: 'preset',
            duration_preset: durationResolution.preset,
          };
        }
      } catch (error) {
        throw new Error(`Invalid duration: ${error.message}`);
      }
    }

    const overrides = _deps.collectAdvancedOverrides();
    const gamePayload = {
      enrollment_window_seconds: _deps.getEnrollmentWindow(),
      ...durationPayload,
      ...overrides,
    };
    if (isAsyncHostRound) {
      gamePayload.round_type = 'asynchronous';
      gamePayload.enrollment_window_seconds = 0;
      gamePayload.duration_mode = 'preset';
      gamePayload.duration_preset = asyncRoundPreset;
      gamePayload.session_duration_seconds = asyncSessionDurationSeconds;
      delete gamePayload.duration_custom_seconds;
    }

    _deps.showNewGameStatus('Creating game...', 'info');
    const gameResponse = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gamePayload),
    });

    if (!gameResponse.ok) {
      const { detail } = await getErrorMessageFromResponse(
        gameResponse,
        `Game creation failed: ${gameResponse.status} ${gameResponse.statusText}`
      );
      throw new Error(detail);
    }

    const gameData = await gameResponse.json();
    const gameId = gameData.game_id;
    if (!gameId) {
      throw new Error('No game_id returned from server');
    }

    _deps.setGameId(gameId);

    _deps.showNewGameStatus('Joining game...', 'info');
    const joinResponse = await fetch(
      `${baseUrl}/games/${encodeURIComponent(gameId)}/join`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      }
    );

    if (!joinResponse.ok) {
      const { detail, code } = await getErrorMessageFromResponse(
        joinResponse,
        `Join failed: ${joinResponse.status} ${joinResponse.statusText}`
      );
      if (code) {
        // Join policy error code logged
      }
      throw new Error(detail);
    }

    const joinData = await joinResponse.json();
    const playerId = joinData.player_id;
    if (!playerId) {
      throw new Error('No player_id returned from server');
    }

    _deps.setPlayerId(playerId);

    if (joinData.player_token) {
      _deps.setStorageItem(
        _deps.getPlayerTokenStorageKey(gameId, playerId),
        joinData.player_token
      );
    }

    _deps.markGameMetaSeen(gameId);
    _deps.cleanupGameMetaCache();
    await _deps.fetchMetaSnapshot(baseUrl, gameId);
    _deps.saveSettings();

    if (isAsyncHostRound && shouldAutoStartAsyncSession) {
      _deps.showNewGameStatus(
        'Game created and joined. Starting async session...',
        'info'
      );
      // WHY: Host-style async flow explicitly creates a backend session before opening the stream transport.
      const autoStartResult = await _deps.autoStartAsyncSession({
        gameId,
        playerId,
      });
      _deps.onSetupBusyChange(false);
      _deps.ensureInputsEditable();

      if (!autoStartResult?.ok) {
        _deps.showNewGameStatus(
          autoStartResult?.message ||
            'Game created and joined. Async session could not be started.',
          'error'
        );
        return;
      }

      _deps.showNewGameStatus(
        'Game created, joined, and async session started.',
        'success'
      );
      return;
    }

    if (isAsyncHostRound && !shouldAutoStartAsyncSession) {
      _deps.showNewGameStatus(
        'Game created and joined. Start Session (Async) when ready.',
        'success'
      );
      _deps.onSetupBusyChange(false);
      _deps.ensureInputsEditable();
      return;
    }

    _deps.showNewGameStatus(
      'Game created and joined. Starting stream...',
      'success'
    );
    _deps.onSetupBusyChange(false);
    _deps.ensureInputsEditable();
    await _deps.startLiveStream(gameId, playerId, {
      forceSessionAttempt: true,
    });
    _deps.setSetupCollapsed(true);
    _deps.scrollToLiveBoard();
  } catch (error) {
    console.error('Error creating game and joining:', error);
    _deps.showNewGameStatus(`Error: ${error.message}`, 'error');
    _deps.showToast(`Error: ${error.message}`, 'error');
    _deps.onSetupBusyChange(false);
    _deps.ensureInputsEditable();
  }
}

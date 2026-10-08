/**
File: src/services/game-actions.js
Purpose: Submit player upgrade, trade and farm (deposit/withdraw) intents to the backend.
Role in system:
- Player-side intent calls only; game creation is admin-only (admin.html → admin-setup.js).
Invariants:
- No modal or blocking UX side-effects; feedback goes through the existing toast/status.
- Backend stays authoritative: 409 (action outside an active round/session, or
  FARMING_DISABLED) is shown verbatim from the backend instead of being
  reinterpreted client-side.
- Farm actions mirror trades: same X-Player-Token header, errors are thrown as
  ApiError for the farming panel toast, success hands `updated_state` to
  `onFarmUpdated`.
Security notes:
- Encode IDs in URLs and never surface or log token secrets.
*/

import { createApiError, readApiError } from '../utils/api-error.js';

let _deps = null;

export function initGameActions(deps) {
  _deps = deps;
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

  // Inline season lanes always pass the target token; the pay token defaults
  // to the target token when the lane did not pick a different one.
  const actualTargetToken = targetToken;
  const actualPayToken = payToken || actualTargetToken;

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
      throw createApiError(
        await readApiError(
          response,
          `${response.status} ${response.statusText}`.trim()
        )
      );
    }

    await response.json();
    _deps.showToast(
      `Upgraded ${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)} to level ${nextLevel}`,
      'success'
    );
  } catch (error) {
    if (error?.status === 409) {
      // WHY: 409 means the round/session is not active (e.g. enrolling or
      // ended); the backend message already explains what to do.
      _deps.showToast(error.message, 'error');
      return;
    }
    console.error('Upgrade error:', error);
    _deps.showToast(`Upgrade failed: ${error.message}`, 'error');
  }
}

export async function performTrade(fromToken, toToken, amount) {
  if (!_deps) {
    throw new Error('Game actions module is not initialized.');
  }
  const lastGameData = _deps?.getLastGameData?.();
  if (!lastGameData?.game_id || !lastGameData?.player_id) {
    throw new Error('No game or player data available for trade');
  }

  const baseUrl = _deps.getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    throw new Error('Invalid backend URL');
  }

  const gameId = lastGameData.game_id;
  const playerId = lastGameData.player_id;
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(gameId, playerId)
  );

  const headers = { 'Content-Type': 'application/json' };
  if (playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  const response = await fetch(
    `${baseUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/trade`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from_token: fromToken,
        to_token: toToken,
        amount,
      }),
    }
  );

  if (!response.ok) {
    // The trading panel shows `Trade failed: <backend message>` in its toast,
    // including 409 responses for trades outside an active round/session.
    throw createApiError(
      await readApiError(
        response,
        `${response.status} ${response.statusText}`.trim()
      )
    );
  }

  const payload = await response.json();
  _deps.showToast('Trade executed successfully.', 'success');
  if (typeof _deps.onTradeExecuted === 'function') {
    _deps.onTradeExecuted(payload);
  }
  return payload;
}

/**
 * POST a farm action for the current player.
 * @param {'deposit'|'withdraw'} action
 * @param {{ token: string, amount: number|null }} body amount null = withdraw all
 */
async function postFarmAction(action, body) {
  if (!_deps) {
    throw new Error('Game actions module is not initialized.');
  }
  const lastGameData = _deps.getLastGameData?.();
  if (!lastGameData?.game_id || !lastGameData?.player_id) {
    throw new Error('No game or player data available for farming');
  }

  const baseUrl = _deps.getNormalizedBaseUrlOrNull();
  if (!baseUrl) {
    throw new Error('Invalid backend URL');
  }

  const gameId = lastGameData.game_id;
  const playerId = lastGameData.player_id;
  const playerToken = _deps.getStorageItem(
    _deps.getPlayerTokenStorageKey(gameId, playerId)
  );

  const headers = { 'Content-Type': 'application/json' };
  if (playerToken) {
    headers['X-Player-Token'] = playerToken;
  }

  const response = await fetch(
    `${baseUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/farm/${action}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    // 409 FARMING_DISABLED / ACTION_NOT_ALLOWED_* and 400 (insufficient
    // balance) carry a readable backend message; the panel shows it verbatim.
    throw createApiError(
      await readApiError(
        response,
        `${response.status} ${response.statusText}`.trim()
      )
    );
  }

  const payload = await response.json();
  if (typeof _deps.onFarmUpdated === 'function') {
    _deps.onFarmUpdated(payload);
  }
  return payload;
}

/** Move `amount` of `token` from the spendable balance into farming. */
export async function performFarmDeposit(token, amount) {
  const payload = await postFarmAction('deposit', { token, amount });
  _deps.showToast('Deposited into farming.', 'success');
  return payload;
}

/** Withdraw `amount` of `token` from farming; null withdraws everything. */
export async function performFarmWithdraw(token, amount = null) {
  const payload = await postFarmAction('withdraw', { token, amount });
  _deps.showToast('Withdrawn from farming.', 'success');
  return payload;
}

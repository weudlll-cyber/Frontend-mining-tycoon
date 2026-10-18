/**
File: src/ui/board-dom.js
Purpose: Look up every DOM element the player board (player.html) wires up.
Role in system:
- Called once by src/main.js while the module is evaluated (same timing as
  the former top-level `document.getElementById` calls), the returned object
  is passed into the player-board modules through their init functions.
Constraints:
- Lookup only: no listeners, no rendering. Missing elements stay `null` and
  every consumer null-checks, so partial test fixtures keep working.
*/

export function queryPlayerBoardDom(doc = document) {
  const byId = (id) => doc.getElementById(id);

  const els = {
    // Inputs (setup shell)
    baseUrlInput: byId('base-url'),
    playerNameInput: byId('player-name'),
    gameIdInput: byId('game-id'),
    playerIdInput: byId('player-id'),

    // Game-over overlay
    gameOverOverlayEl: byId('game-over-overlay'),
    gameOverTitleEl: byId('game-over-title'),
    gameOverMessageEl: byId('game-over-message'),
    gameOverResultsLinkEl: byId('game-over-results-link'),
    gameOverResultsNoteEl: byId('game-over-results-note'),

    // Buttons
    startBtn: byId('start-btn'),
    startSessionBtn: byId('start-session-btn'),
    stopBtn: byId('stop-btn'),

    // Status displays
    connStatusEl: byId('conn-status'),
    gameStatusEl: byId('game-status'),
    countdownEl: byId('countdown'),
    countdownLabelEl: byId('countdown-label'),
    asyncSessionStatusEl: byId('async-session-status'),
    scoringModeStatusEl: byId('scoring-mode-status'),
    setupActionsNoteEl: byId('setup-actions-note'),
    roundModeBadgeEl: byId('round-mode-badge'),
    startSessionStatusEl: byId('start-session-status'),
    metaDebugEl: byId('meta-debug'),
    liveBoardEl: byId('live-board'),
    setupShellEl: byId('setup-shell'),
    setupToggleBtnEl: byId('setup-toggle-btn'),
    jumpLiveBtnEl: byId('jump-live-btn'),
    jumpLiveBtnSetupEl: byId('jump-live-btn-setup'),
    debugToggleBtnEl: byId('debug-toggle-btn'),
    debugPanelEl: byId('debug-panel'),
    debugBackendUrlEl: byId('debug-backend-url'),
    debugGameIdEl: byId('debug-game-id'),
    debugPlayerIdEl: byId('debug-player-id'),
    debugSessionIdEl: byId('debug-session-id'),

    // Async session UX helpers
    // roundRemainingHintEl: the <span> that wraps the "Round left: …" secondary
    //   countdown shown while a session is active (#round-remaining-hint).
    // roundRemainingEl: the inner <span> with the formatted round-remaining
    //   time (#round-remaining).
    roundRemainingHintEl: byId('round-remaining-hint'),
    roundRemainingEl: byId('round-remaining'),

    // Chat panel and chat preview dock
    chatPanelEl: byId('chat-panel'),
    chatToggleBtnEl: byId('chat-toggle-btn'),
    chatMessagesEl: byId('chat-messages'),
    chatFormEl: byId('chat-form'),
    chatInputEl: byId('chat-input'),
    chatStatusEl: byId('chat-status'),
    chatDisabledNoteEl: byId('chat-disabled-note'),
    chatNoticeEl: byId('chat-notice'),
    chatEmojiBtnEl: byId('chat-emoji-btn'),
    chatEmojiPickerEl: byId('chat-emoji-picker'),
    chatUnreadBadgeEl: byId('chat-unread-badge'),
    chatDockBtnEl: byId('chat-dock-btn'),
    chatDockPreviewEl: byId('chat-dock-preview'),
    chatDockUnreadEl: byId('chat-dock-unread'),

    // Trading / farming panels and the live tools window
    tradingPanelEl: byId('trading-panel'),
    tradingStatusEl: byId('trading-status'),
    farmingPanelEl: byId('farming-panel'),
    farmingStatusEl: byId('farming-status'),
    tradeDrawerBtnEl: byId('trade-drawer-btn'),
    farmDrawerBtnEl: byId('farm-drawer-btn'),
    liveDrawerEl: byId('live-drawer'),
    liveDrawerBackdropEl: byId('live-drawer-backdrop'),
    liveDrawerCloseBtnEl: byId('live-drawer-close-btn'),
    liveDrawerTabTradeEl: byId('live-tab-trade'),
    liveDrawerTabFarmEl: byId('live-tab-farm'),
    liveDrawerTabChatEl: byId('live-tab-chat'),
    liveDrawerTabLeaderboardEl: byId('live-tab-leaderboard'),
    leaderboardDrawerBtnEl: byId('leaderboard-drawer-btn'),
    liveDrawerPanelTradeEl: byId('live-panel-trade'),
    liveDrawerPanelFarmEl: byId('live-panel-farm'),
    liveDrawerPanelChatEl: byId('live-panel-chat'),
    liveDrawerPanelLeaderboardEl: byId('live-panel-leaderboard'),

    // Player state, season cards and leaderboard
    playerStateEl: byId('player-state'),
    // Compact top-5 leaderboard lives in the live tools window ("Top 5" tab).
    leaderboardEl: byId('leaderboard'),
    seasonScrollEl: doc.querySelector('.seasons-scroll'),
    seasonFocusStripEl: byId('season-focus-strip'),
    seasonFocusButtons: Array.from(doc.querySelectorAll('[data-season-focus]')),
    seasonCards: Array.from(doc.querySelectorAll('.season-card')),
    myScoreEl: byId('my-score'),
    myRankEl: byId('my-rank'),
    topScoreEl: byId('top-score'),
    standingsStatusEl: byId('standings-status'),
    leaderboardStandingsStatusEl: byId('leaderboard-standings-status'),
    portfolioValueEl: byId('portfolio-value'),
    scoreContextLabelEl: byId('score-context-label'),
  };

  // Inputs the setup shell re-enables when the board resets.
  els.editableInputs = [
    els.baseUrlInput,
    els.playerNameInput,
    els.gameIdInput,
    els.playerIdInput,
  ];

  return els;
}

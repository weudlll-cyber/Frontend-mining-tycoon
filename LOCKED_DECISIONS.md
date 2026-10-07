# LOCKED DECISIONS

Canonical source of truth for non-negotiable project invariants.

This file defines architecture, UI, gameplay-boundary, and delivery constraints that MUST remain stable across future changes and new Copilot chats.

## How To Use This File

- Read this file before proposing or implementing any feature/refactor.
- Treat every item marked LOCKED ✅ as a project contract.
- If a requested change conflicts with this file, stop and handle it through Change Control.
- When prompting Copilot, include this instruction: "Do not violate LOCKED_DECISIONS.md."
- During reviews, validate every PR/change against these invariants.

## A) Architecture & Determinism LOCKED ✅

- Backend is authoritative for gameplay outcomes and state transitions.
- Frontend MUST be display/intent only and MUST NOT become authoritative for gameplay outcomes.
- Oracle pricing, halving progression, and event timeline MUST remain deterministic from server-defined inputs.
- Game settings that define simulation/economy behavior MUST be snapshot-locked per game/round after creation.
- Frontend MUST NOT mutate authoritative game state outside backend API contracts.

## B) Economy Scope LOCKED ✅

- System MUST NOT introduce player-to-player market mechanics.
- Trading (when enabled) MUST be deterministic token reallocation via oracle-based conversion rules.
- Project MUST NOT include real-money mechanics, claims, or payout semantics.

## C) UI Philosophy LOCKED ✅

- Desktop target MUST keep important gameplay information visible without page scrolling.
- No blocking overlays/modals/popups for core gameplay UX.
- Exception (post-game only): when a round finishes, or a player's async session ends, `player.html` shows a full-screen `Game Over` / `Session Finished` overlay. It appears only after play has ended, blocks nothing that is still playable, and a click (or Enter/Space) returns the player to the lobby (`index.html`). Dialogs outside gameplay (lobby register / forgot-password dialogs) are not covered by this rule.
- The floating live tools window (§D) is non-modal and does not count as a blocking overlay.
- Non-blocking micro-tooltips for explanation and additional precision are explicitly allowed, provided they:
  - do not block interaction,
  - do not require dismissal to continue gameplay,
  - do not hide or replace required information,
  - have no backdrop or modal behavior.
  - close via pointer-leave / keyboard Escape / blur paths (no timeout-based auto-hide).
  - use the shared tooltip contract (`.ps-tip-trigger` + `.ps-tip-bubble` in `#tooltip-layer`) across player and season headers.
- Seasonal gameplay controls MUST stay inline in season cards.
- Season upgrades MUST remain visible as 3 lanes: hashrate, efficiency, cooling.
- Analytics panel MUST remain read-only and visible in the main layout.
- Analytics panel content MUST include:
  - per-token output and total output
  - cumulative mined
  - seasonal balances
  - oracle prices
  - fee/spread conversion parameters
- Trading and Farming sections MUST be visible even when disabled, with explicit status text.

## D) Chat Rules LOCKED ✅

- Chat is social-only and MUST NOT affect gameplay, scoring, or deterministic simulation.
- ~~Chat UI MUST be docked inline (no overlay behavior).~~ Superseded by the REDESIGN DECISION (2026-10-07) below.
- Chat UI MUST live in the non-modal live tools window described below and MUST NOT block gameplay.
- Chat message list MUST scroll internally inside the chat panel.
- Chat persistence is NOT required; non-persistent behavior is acceptable.

REDESIGN DECISION (2026-10-07) - floating live tools window:

> **Confirmed by the project owner (2026-10-07).** This note documents the
> implementation introduced with commit `e5deacc` and extended since (most
> recently with the Top 5 tab in PR #19). The floating window is the approved
> chat/live-tools UI; the inline dock is not coming back.

- Chat, Trade, Farm and the Top 5 leaderboard are tabs of one **floating live
  tools window** on `player.html` (`#live-drawer`, `src/ui/live-drawer.js`).
- It is opened from the action-bar buttons (`Trade`, `Farm`, `Chat`, `Top 5`)
  or the chat preview dock, which stays visible with an unread badge.
- It is **non-modal**: no backdrop dimming and no focus trap. It floats above
  part of the board (`position: fixed`), and everything it does not cover
  (season cards, inline upgrades, Player State panel) stays usable while it
  is open.
- It can be **dragged** by its header (mouse and touch) and resized, so the
  player can move it off the information they need.
- It closes with the close button, the **Escape** key, or a **click/tap
  outside** the window.
- Core gameplay information (season cards, upgrades, analytics, action bar
  status pills) MUST NOT move into this window.

## E) Farming Scope LOCKED ✅

- Scope is limited to:
  - Stage 1 Passive Farming
  - Stage 2 Rotating Farming
- Stage 3 farming concepts MUST NOT be introduced.
- If Stage 2 details are incomplete in implementation, they are still treated as a scope boundary for future work.

## F) Scoring LOCKED ✅

REDESIGN DECISION (2026-03-25):

- Mode definitions are documented in [SCORING_MODES.md](SCORING_MODES.md).
- Scoring/outcome now supports four project-approved modes selected before round start:
  - Stockpile Mode (Total Tokens)
  - Power Mode (Oracle-Weighted Score)
  - Mining Time Equivalent Mode
  - Efficiency Mode (System Mastery)
- Default project outcome mode is Stockpile Mode (Total Tokens).
- Power Mode (Oracle-Weighted Score) remains explicitly available as an optional mode.
- The selected outcome mode MUST be fixed before round start and MUST NOT switch mid-round.

## G) Operational/Test Discipline LOCKED ✅

- Test suites MUST remain green after any change.
- New behavior or changed behavior MUST be accompanied by tests or test updates.
- Security posture MUST preserve XSS-safe rendering patterns.
- UI rendering MUST NOT use innerHTML with untrusted content.
- Backend contracts MUST remain explicit and backward-safe unless a versioned redesign is approved.

## PR Checklist (Invariant Compliance)

- [ ] Architecture & Determinism: Backend authority is preserved; frontend did not become authoritative.
- [ ] Deterministic Model: Oracle/halving/events remain deterministic and snapshot-locked per game.
- [ ] Economy Scope: No P2P market mechanics and no real-money semantics were introduced.
- [ ] UI Philosophy: Core gameplay remains inline (no blocking overlays/modals/popups; non-blocking micro-tooltips allowed) and desktop keeps key information visible without page scroll.
- [ ] Analytics & Inline Upgrades: Read-only analytics remains visible; season upgrades remain inline with hashrate/efficiency/cooling lanes.
- [ ] Trading/Farming Visibility: Trading and farming sections remain visible with explicit status text when disabled.
- [ ] Chat Rules: Chat remains social-only, internally scrollable, non-gameplay, and inside the non-modal live tools window (§D).
- [ ] Farming Scope: No Stage 3 farming scope was introduced.
- [ ] Scoring: Outcome mode is one of the four approved modes, selected before round start, and not switched mid-round.
- [ ] Operational/Security Discipline: Tests remain green; changed behavior includes tests; no untrusted innerHTML usage.

REDESIGN DECISION reminder:

- [ ] If any checklist item is violated, this PR MUST first update LOCKED_DECISIONS.md with an explicit REDESIGN DECISION note before code/docs changes proceed.

## Change Control

- Any proposed violation of this file requires an explicit REDESIGN DECISION note.
- REDESIGN DECISION must be documented before implementation begins.
- LOCKED_DECISIONS.md must be updated first, then dependent docs/tests/code.
- Without that sequence, violating changes MUST NOT be merged.

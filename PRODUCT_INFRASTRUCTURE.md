# Non-Gameplay Systems & Product Infrastructure

This document defines the non-gameplay systems required to operate Seasonal Tycoon as a complete, functional product. These systems surround the core gameplay simulation but are not part of it. They handle player identity, access control, result visibility, social interaction, and scope boundaries.

All systems in this document are governed by the same project invariants defined in [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md):

- Backend is authoritative.
- Outcomes are deterministic.
- Fairness is preserved unconditionally.

This is an intent document. Each section carries an implementation status
marker (verified against both repos on 2026-10-07): **Implemented**,
**Partial** or **Not started**. For the full factual state see
[PROJECT_BASELINE.md](PROJECT_BASELINE.md).

---

## 1. Player Creation & Player Profiles

> **Status: Partial.** Accounts exist (`/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/change-password`). Registration in the lobby collects username, display name, email, a **Discord handle (required)**, a **Telegram handle (optional)** and a password (min. 12 characters with upper/lowercase, digit and special character). The Discord/Telegram handles are stored as contact fields only; there is no Discord or Telegram integration (see Section 9). Accounts are **linked** to in-game players: the lobby joins with the account token, the backend stores the account on the player, and joining the same game again returns the same player and `player_token` ("Rejoin" in the lobby). Admins can require a signed-in account to join (Game Settings, `account_policy.require_account_to_join`). No avatars or cosmetic metadata.

### What a Player Profile Represents

A player profile is an identity record. It represents a persistent participant in the game system, independent of any specific round or game session.

A profile holds identifying and cosmetic information about the player. It does not carry gameplay state, balances, or any in-round context. Examples of profile data:

- Display name (player-chosen or assigned)
- Stable internal identifier (backend-generated, not player-controlled)
- Optional cosmetic metadata (for example: avatar selection from a fixed set)

Profiles exist across games and rounds. A player who participates in multiple rounds over time has a single persistent profile, not one per game.

### Profiles Are Identity-Only

Player profiles are strictly identity records. They do not:

- Grant advantages within a round.
- Carry balance, token holdings, upgrade levels, or any simulation state across rounds.
- Influence oracle prices, scoring calculations, or simulation outputs in any way.

The distinction between a player profile (who the player is) and session state (what the player has done in this round) is required to maintain fairness. Session state is scoped to a single game and discarded or archived at round end. The profile persists.

### Backend Authority Over Identity

Player identity is created and maintained server-side. The backend is the authoritative source of player identity records. Clients present credentials and receive identity data; they do not self-assign identifiers or mutate their own profile arbitrarily.

---

## 2. Player Profile Persistence

> **Status: Partial.** Account records persist in the backend database across rounds, and players are linked to accounts, so finished-round results are attributed to the account (see Section 7). There is no profile page beyond the lobby's "My results" list.
>
> **Account data export and deletion: Implemented (frontend; needs the matching backend).** Signed in, the lobby offers **Download my data** (`GET /auth/me/export`, saved as `mining-tycoon-account-export.json`) and **Delete account** (`DELETE /auth/me` with the password; `204` on success, `403 PASSWORD_INCORRECT`, `429` when rate limited). Deletion removes the account, its sessions and login history; past results keep their rows but show "Deleted player" as the name. Older backends without these endpoints show their error message in the lobby.

### Why Persistence Is Required

A player who returns after one round ends should be recognizable as the same participant. Without persistent profiles, every game session produces an isolated, anonymous participant — which breaks leaderboard continuity, result attribution, and any future per-player historical view.

Persistence is therefore a minimum product requirement, not an optional enhancement.

### Persistence Is Round-Independent

Player profile data survives round completion. When a round ends:

- The round's game state is finalized and archived.
- Player session state (that round's balances, upgrades, final score) is recorded against the outcome.
- The player profile itself is unaffected.

Deleting, expiring, or resetting a game does not delete the player's identity record or their past result history (see Section 7).

### Minimal Viable vs. Future Extensibility

The minimum viable player profile stores only what is needed to identify a consistent participant across rounds: a stable identifier, a display name, and a creation timestamp. Cosmetic and social features (avatars, status, badges) can be layered on later without requiring profile schema redesign, provided the stable identifier remains the canonical reference key from the start.

---

## 3. Admin Roles & Permissions

> **Status: Partial.** Admin rights are a shared admin token (`X-Admin-Token`, backend `ADMIN_TOKEN`), enforced server-side for game creation when `REQUIRE_ADMIN_FOR_GAME_CREATE` is on and for the `/admin/*` routes (without `ADMIN_TOKEN` the admin routes are localhost-only). Accounts have an `is_admin` field, but no role-based admin login exists yet. Rounds start automatically after the enrollment window; there is no manual "start round" control.

### Not All Users Are Equal

Player accounts and admin accounts serve different purposes. Not every participant is permitted to configure the game environment. At minimum, the system requires two distinct roles:

- **Player** — can join games, participate in rounds, view their own state, and interact via chat.
- **Admin** — can create and configure games, start rounds, set round parameters, and manage the game lifecycle on behalf of all players.

### What Admins Control

Admins are responsible for the pre-round configuration layer:

- Creating games and setting their lifecycle parameters (duration mode, enrollment window, scoring mode, trading rules, farming rules).
- Starting the enrollment phase and transitioning the round to running.
- Making decisions that are snapshot-locked before any player joins.

Players have no access to these controls. The configuration surface exists only for the admin role.

### Server-Side Enforcement

Admin role permission checks are enforced by the backend. The frontend may adjust its UI to hide or disable admin controls for non-admin users, but this is cosmetic convenience only. The backend independently validates role authority before executing any admin-only operation.

Admin permissions do not affect gameplay fairness. Admins configure the game environment that applies equally to all players. Once a round starts, the admin has no special in-game capabilities.

---

## 4. Admin-Only Game Setup (Separation of Concerns)

> **Status: Implemented** for scoring mode, round type, durations, enrollment window, trade count and advanced emission overrides (`admin.html`). Farming rules and a per-round chat opt-out do not exist yet. Players cannot create games.

### Setup vs. Play

Game configuration and game participation are logically and functionally separated.

The setup path — selecting scoring mode, enabling or disabling trading and farming, choosing duration presets, configuring enrollment rules — belongs to an admin-facing workflow. Players are not exposed to this layer. They join a game that has already been configured and are presented with the playable environment as defined.

This separation serves two purposes:

1. **Complexity reduction** — The player-facing UI can focus entirely on participation and gameplay without exposing irrelevant configuration controls.
2. **Misconfiguration prevention** — Players cannot accidentally or intentionally alter round parameters after a game is defined.

### What Each Side Sees

| Admin workflow | Player-facing UI |
|---|---|
| Select scoring mode | Sees current round's scoring mode (read-only) |
| Set duration and enrollment window | Sees countdown to round start or end |
| Enable or disable trading/farming | Sees trading/farming panel with their status |
| Start or transition game lifecycle | Reacts to lifecycle state changes via live update |

All parameters set in the admin workflow become snapshot-locked at round creation. No runtime override is possible once the round is live (see [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md) Section A and F).

---

## 5. Highscores & Leaderboards (Sync & Async)

> **Status: Partial.** All four scoring modes are evaluated by the backend. Players see a live Top 5 (SSE `leaderboard_top_5`) in the "Top 5" tab of the live tools window, plus rank and top score in the header. Missing: a full leaderboard view and a "provisional vs. final" marker for async rounds.

### Leaderboard Scope

Leaderboards are scoped per round and per scoring mode. A leaderboard entry for a given round is only meaningful in the context of that round's fixed scoring mode, because different scoring modes evaluate entirely different quantities. Cross-round and cross-mode comparison requires explicit context.

### Synchronous Rounds

In a synchronous round, all players participate concurrently within a shared time window. The final leaderboard is produced once at round end, when all player sessions are complete.

During the round, a live leaderboard view may show current standings based on in-progress state. This is a preview, not the final result.

### Asynchronous Rounds

In an asynchronous round, players complete their sessions at different times within the round window. Sessions complete independently. The backend records each session result as it finishes and updates the leaderboard accordingly.

This means rankings are partially visible before the round closes. Players who completed early can see where they stand, but the final ranking is only confirmed once the round window ends and no further sessions can be submitted.

Determinism and fairness are preserved regardless of session timing. Because all round parameters are snapshot-locked at round creation, every player plays under identical conditions: the same scoring mode, the same oracle parameters, the same simulation rules. The only variable is when within the round window each player chooses to participate.

---

## 6. Async Rounds & "Best-Of" Handling

> **Status: Implemented.** Async rounds allow repeated sessions; each session starts from the same baseline state, the backend keeps the best finalized score, and the Player State panel shows `This session` and `Best this round`.

### Multiple Sessions per Player

Async rounds may permit a player to run more than one session within the round window. Each attempt is a separate, independent game session run under the same snapshot-locked round parameters.

### Authoritative Best Result

The backend determines which session represents a player's authoritative result for leaderboard purposes. This is defined as the best result across all completed sessions, evaluated under the round's fixed scoring mode. The algorithm for selecting the best result is backend-determined and applied consistently across all players.

The frontend exposes both values:

- **This session** — the score from the most recently completed or currently active session.
- **Best this round** — the player's authoritative best result across all sessions in this round.

Players can use the comparison between these two values to understand whether their latest attempt improved on their previous best.

### Fairness Invariants

Allowing multiple sessions does not compromise fairness:

- All sessions in a round use the same scoring mode, the same simulation rules, and the same snapshot-locked settings.
- More attempts grant a player more opportunities to perform, but do not alter the evaluation criteria.
- Whether a player achieves their best result on attempt one or attempt five, the result is evaluated identically.

Retry count itself is never a scoring factor.

---

## 7. Result History & Past Rounds

> **Status: Implemented (basic).** `GET /auth/me/history` lists the signed-in account's finished rounds (date, round type, scoring mode, rank / participants, score, player name; paginated, newest first) and `GET /games/{id}/results` returns a finished round's full final leaderboard (`409 GAME_NOT_FINISHED` before the end). The lobby shows both in the "My results" dialog, and its "Last Game Highscores" panel uses the newest server result when signed in (the browser-local snapshot remains the signed-out fallback). Not yet: cross-round statistics, archive/retention policy.

### The Need for Historical Results

A game that produces no persistent record of outcomes is a game that only exists in the present. Once players have participated in multiple rounds, they need a way to review past performance, observe improvement over time, and compare results across different game configurations.

A historical results view is a required product feature for this reason.

### What Result History Covers

A result history entry should include, at minimum:

- Round identifier
- Round start and end date/time
- Scoring mode used in that round
- Player's final score under that scoring mode
- Player's placement or rank within that round's leaderboard

This represents a minimal read-only record sufficient for self-review and comparison.

### Live Leaderboard vs. Historical Results

There is an intentional distinction between the live leaderboard (visible during an active round) and historical results (the permanent record of a completed round).

The live leaderboard reflects in-progress state. It may change minute to minute and is not the final outcome until the round closes. Historical results are finalized, immutable records. Once a round is complete and results are archived, the historical record does not change.

### Role of History

Result history is a non-gameplay, read-only system. It does not affect simulation, scoring, or current-round state in any way. Its purpose is to support:

- Player self-review and learning.
- Multi-round performance comparison.
- Understanding of how different scoring modes produce different outcomes.

---

## 8. Chat System (Social, Non-Gameplay)

> **Status: Partial.** Round-scoped, non-persistent WebSocket chat with server-side rate limits and server-derived `user`/`ts` is implemented; in the UI it is the Chat tab of the floating live tools window plus a preview dock. Emoji support, admin moderation (mute/clear) and the per-round opt-out are not started.

### Chat Is Social-Only

The chat system provides a communication layer for players during a round. It is explicitly bounded to social interaction. Chat messages do not trigger game actions, are not interpreted by the simulation, and have no effect on scoring, token balances, or any gameplay state.

This boundary is a locked project invariant (see [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md) Section D).

### Round-Scoped Chat

Chat is scoped per round. A chat thread is associated with a specific active game. There is no cross-round or cross-game persistent chat history. When a round ends, its chat record may be discarded; persistence of chat history is not a product requirement.

### Planned Extensions

The following extensions to chat are planned and remain within scope:

- **Basic emoji support** — A small, fixed set of emoji reactions or expressions may be made available within the chat input. This set is curated and maintained server-side. Players cannot upload, add, or define custom emoji.
- **No gameplay signals via chat** — Even with emoji or reaction features, chat interactions carry no gameplay meaning and affect no simulation state.

The following is confirmed out of scope for chat:

- External chat platform integrations (for example: Discord, Slack, or similar).
- Direct messaging between specific players.
- Chat-triggered game actions or commands.

### Moderation & Rate Limiting

Chat rate limiting and content moderation are enforced server-side. The backend applies message rate limits to prevent flooding and abuse. Moderation controls (muting, clearing) are admin operations.

### Per-Round Opt-Out

Chat can be disabled on a per-round basis by the admin during game configuration. When disabled, the chat UI displays its disabled status explicitly rather than being hidden entirely (consistent with the visibility principle applied to trading and farming panels).

---

## 9. Scope Boundaries

> **Status: Respected.** None of the out-of-scope items below are implemented. Collecting Discord/Telegram handles at registration is contact data only and is not a chat or notification integration.

The following items are explicitly outside the current product scope. They are listed here to prevent scope creep during design and implementation discussions.

**Out of scope:**

- Friends lists and social graphs between players.
- Player-to-player direct trading or item transfer of any kind.
- Monetization systems, payment flows, in-game purchase mechanics, or any real-world asset claims.
- Cross-round carry-over of token balances, upgrade levels, or any gameplay state that persists from one round into the next.
- Experience points, leveling systems, or any progression mechanic that grants gameplay advantages across rounds.
- External chat or notification integrations (Discord, email, push notifications).
- Player-generated content (custom emoji, avatars from external uploads, theme customization).
- Public API or third-party data access to game state.
- Live spectator features beyond standard leaderboard visibility.

Any proposal that touches these areas requires a deliberate design decision and change control review before it can enter the implementation backlog.

---

## Why These Systems Matter

A simulation engine and a set of gameplay mechanics are not a product. A product is something a player can return to, trust, and engage with over multiple sessions. That requires persistent identity so players are recognized across rounds, access controls so the game environment is configured correctly before anyone plays, leaderboards and result history so outcomes have context and meaning beyond the moment they occur, and a social layer that connects participants without compromising the fairness of the game itself.

Without these systems, each round is a standalone experience that leaves no trace and serves no community. With them, the game becomes something players can build a relationship with over time. These infrastructure components are what separate a well-made simulation from a functioning game product.

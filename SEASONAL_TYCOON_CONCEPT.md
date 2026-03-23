# SEASONAL TYCOON CONCEPT

This document describes the Seasonal Tycoon game concept at a high level.
It captures the vision and design intent of the game rather than its technical implementation.

For the current implemented and authoritative project state, see [PROJECT_BASELINE.md](PROJECT_BASELINE.md).
That document is the technical truth of what currently exists in the project, while this document explains the game idea the project is built to express.

## Locked Snapshot: Invariants

Canonical invariants are maintained in [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).

At the concept level, these locked constraints preserve Seasonal Tycoon's planning-first identity:

- "Everything visible" supports anticipation and strategy comparison without hiding context.
- "No overlays" keeps cognitive load low and preserves a stable decision surface.
- Chat remains a social layer only, so community interaction does not alter gameplay fairness.
- Determinism and fairness keep outcomes tied to player decisions under shared conditions, not randomness or UI timing artifacts.

## What Is Seasonal Tycoon?

Seasonal Tycoon is a strategic tycoon and simulation game inspired by the Seasonal Tokens ecosystem.

At its core, it is a game about operating inside a cyclical system. Players are not trying to win through constant reactions or short-term speculation. They are trying to understand how production, relative value, and shifting demand interact over time, then position themselves accordingly.

The game rewards long-term thinking. It asks players to read patterns, commit to a strategy, and adapt as the seasonal economy changes shape. The central challenge is not raw speed. It is understanding where value is likely to move next and how to prepare for it before the rest of the system catches up.

## The Three Economic Pillars

Seasonal Tycoon is built around three connected economic activities: mining, trading, and farming. Each one represents a different way of participating in the system, and the strategic depth of the game comes from how they affect one another.

### Mining - Production

Mining is the production engine of the game.

Players operate mining infrastructure that produces the four seasonal tokens. Mining increases the total supply of those tokens and acts as the primary source of newly created assets in the economy.

Because mining creates the raw flow of value into the system, it gives players a foundation. It is the most direct way to build up holdings, but it is not a passive choice. Mining upgrades improve efficiency and output, yet each improvement requires planning. A player cannot optimize everything at once, so mining becomes a sequence of priorities and tradeoffs.

Mining is therefore more than income generation. It is the player’s long-term industrial base. Decisions made here shape what resources they will have available later for trading, farming, or continued expansion.

### Trading - Allocation

Trading is the allocation layer of the game.

Players can convert tokens through oracle-derived relative prices and an associated system fee. This is not player-to-player trading and it is not an open market in the traditional sense. It represents a player reallocating their position within the larger system.

The purpose of trading is not constant activity for its own sake. It is a way to move into the right token at the right phase of the seasonal cycle. As halvings, changing supply conditions, and other system forces alter the relative attractiveness of different tokens, players can reposition their portfolio in response.

Trading gives the player strategic flexibility. Mining may determine what they produce, but trading determines what they choose to hold. Used well, it allows a player to convert strength in one part of the system into opportunity in another.

### Farming - Liquidity & Demand

Farming is the liquidity and demand pillar of the game.

Players can allocate tokens into farming, representing the act of providing liquidity to the ecosystem. In return, farming generates a steady stream of token income and helps create rotating demand for specific seasonal assets.

This matters because farming changes the shape of the economy. It is not only another source of yield. It also creates reasons for particular tokens to become more relevant at different moments. As farming rewards shift over time, players are encouraged to move liquidity between seasons rather than remain fixed in one position forever.

Farming complements mining. Mining expands supply, while farming can create demand and redirect attention. Together, they turn the economy into a moving system rather than a static production race.

## Oracle Prices & Cycles

Seasonal Tycoon uses relative prices rather than a random market model.

Prices are deterministic and shaped by changes inside the system itself. Supply shifts, halvings, events, and farming demand all contribute to changing relative value over time. The result is a game economy that is readable and structured, but still deep enough that good decisions require judgment.

Players are not meant to guess at chaos. They are meant to study cycles. The challenge comes from the fact that the system is predictable in principle without being trivial in practice. Multiple forces overlap, and success depends on recognizing how those forces interact before their consequences are obvious.

In that sense, Seasonal Tycoon is a game about anticipation. The strongest players are not the ones who react fastest, but the ones who understand the coming shape of the cycle and prepare for it in advance.

## Events & External Influences

Global events act as temporary external influences on the economy.

These events can affect mining output, relative prices, or the attractiveness of farming. Their purpose is to introduce variation and pressure without turning the game into randomness.

Events add uncertainty to short-term decision making, but they do not break determinism. They are part of the system’s logic, not an exception to it. Players still succeed through interpretation and planning, not by hoping for luck.

This gives the game a useful tension. The economy remains understandable, yet no strategy can be treated as permanently safe or automatic.

## Round-Wide Chat as a Social Layer

Each round includes a shared chat space for participants in that round.

All players assigned to the same round can communicate in that common channel, regardless of where each individual player is in their own session flow. This makes chat a round-level social layer rather than a personal session feature.

Chat is intentionally independent from gameplay outcomes. It does not change scoring, economic behavior, or deterministic simulation logic. Its role is social and communal: helping players share reactions, compare approaches, and experience the round together.

The UI keeps chat non-intrusive by docking it inline within the dashboard instead of opening overlays. This preserves focus on gameplay information while still supporting round-wide social interaction.

By keeping chat separate from core mechanics, Seasonal Tycoon supports community interaction without compromising fairness.

## Round Types: Asynchronous and Synchronous

Seasonal Tycoon supports two conceptual round formats chosen by the host.

Asynchronous challenge rounds are the default format. In these rounds, players can begin their identical time-limited session at any point within the round window. Each participant faces the same underlying scenario and timeline, and results are compared through the leaderboard.

Synchronous live event rounds use a fixed host-scheduled start. In this format, all players begin at the same time and play through the same rule set under the same deterministic model. Round-wide chat is active during the live event to reinforce the shared moment.

These round types change when players participate, not how the core economy behaves.

## Determinism & Fairness Across Round Types

Both round formats follow the same deterministic planning model.

The underlying scenario is fixed at round definition and remains stable while the round is active. There are no mid-round rule shifts, and no participant-specific alterations to core economic behavior.

In practical terms, players in the same round are evaluated against the same foundational conditions: same seed context, same event logic, and same oracle behavior. The game may be experienced asynchronously or synchronously, but fairness remains anchored in shared deterministic inputs.

## Game Modes & Play Styles

Seasonal Tycoon can support different styles of play depending on how much of the economy is active.

Short games emphasize mining and upgrade decisions. They focus on building production strength and making clear prioritization choices without asking players to manage a broader economic portfolio.

Medium-length games expand the decision space by introducing limited trading. Farming may be optional or minimal, allowing players to begin engaging with allocation strategy while keeping the overall system relatively readable.

Longer games treat mining as infrastructure rather than the whole game. In those formats, trading and farming become the primary strategic tools for expressing long-term judgment. Players still care about production, but the deeper challenge comes from how they reposition holdings and liquidity as the cycle evolves.

These different modes do not change the identity of the game. They change which layer of the economy is most important for success.

## UI Philosophy: Everything Visible, Always Accessible

Seasonal Tycoon's user interface is designed around a core principle: **all important game information is visible on one screen, without overlays or modal popups.**

### Information Architecture

The dashboard is organized into four key regions:

1. **Status Bar (top)**: Game phase, remaining time, quick stats (score, rank, top score).
2. **Seasonal Cards (left, 2×2 grid)**: Each season displays balance, mining output rate, and halving countdown. Inline upgrade controls are part of each card, showing all three upgrade paths (hashrate, efficiency, cooling) at once.
3. **Player State Analytics (right panel)**: Per-token output, cumulative mined amount, seasonal balances, oracle prices, conversion parameters (fee and spread).
4. **Bottom Bar**: Portfolio value, and placeholders for Trading and Farming status, even when disabled.

### Strategic Rationale

This layout supports long-term planning by making the whole economic landscape visible at once. Players can:

- See which seasons are gaining value (via output rates and oracle prices)
- Compare upgrade costs and returns across all seasons (inline side-by-side)
- Track their total production and portfolio value instantly
- Understand conversion parameters before making trading decisions
- Know which economic modes are available even if they're not currently enabled

### Phases That Were, Phases That Aren't Yet

A key insight: **mining/trading/farming are not always active, but they are always visible as placeholders.**

When trading or farming is not enabled for a game mode, the UI still shows them as "Not enabled in this mode" or "Available later this round." This design serves two purposes:

1. **Honesty**: Players see the full breadth of the system, not just the slice currently available to them.
2. **Planning**: Even if trading isn't enabled now, seeing the placeholder and oracle prices helps players imagine future scenarios and think ahead.

This supports Seasonal Tycoon's identity as a **game about anticipation**, not just reaction. Players can study the conditions and plan strategies for later phases of the game or future rounds.

### No Overlays = Reduced Cognitive Load

By putting upgrade controls directly into season cards instead of opening separate panels, the dashboard stays lean and focused. Players aren't juggling windows or losing sight of the big picture. Every action is contextualized within its season and visible relative to the others.

## What Makes It a Tycoon Game

Seasonal Tycoon is a tycoon game because it is built around opportunity cost, long-term planning, and irreversible commitment.

Players are always deciding where limited attention and resources should go. Investing more heavily in mining means fewer resources available for trading or farming. Reallocating into one seasonal position means stepping away from another. Every meaningful move closes off alternatives.

The game is therefore not about doing everything. It is about building a strategy that fits the current phase of the system and accepting the consequences of that choice. That pressure to prioritize is what gives the game its tycoon character.

The player is effectively managing an evolving seasonal business inside a living economy. Success comes from reading structure, deploying resources with intent, and staying aligned with the changing logic of the system.

## What Seasonal Tycoon Is Not

Seasonal Tycoon is not a player-to-player trading game and it is not a simulation of real financial markets.

It does not involve real money, external speculation, or promises of profit. It is also not intended to be a click-heavy game built on constant manual actions.

The challenge is not to out-trade other players in a live market or grind through repetitive inputs. The challenge is to understand the system well enough to make strong strategic decisions inside it.

Success is never guaranteed. The game rewards interpretation, timing, and discipline, not certainty.

## Current Design Decisions (Locked Snapshot)

This section records decisions that have been discussed, agreed upon, and are treated as stable unless they are explicitly revisited.

### Round & Session Model

Rounds define a fixed scenario with a fixed duration.

Each player runs an identical, time-limited session inside that round. Players may start their own session at any point during the round window, and join timing does not change gameplay conditions. Sessions are evaluated under the same rules and timeline structure for all participants.

Two round formats are part of the agreed model:

- asynchronous challenge rounds (default)
- synchronous live event rounds (host-scheduled)

Round conditions are defined at creation and do not change while the round is active.

### Host Control & Defaults

Players do not choose game modes.

The host selects the preset game mode and may optionally apply overrides before the round begins. Defaults exist to support quick round creation, while overrides remain optional and pre-round only.

### Trading Rules (Agreed)

Short games default to zero trades.

Trading is never enabled automatically. If trading is enabled by the host, both a fixed trade count and fixed minimum trade start times are defined in advance. Those limits and timings are identical for all players in the round and remain fixed during play.

### Default Trading Values by Game Length

Default trading values are:

- five-minute games: zero trades
- ten- to fifteen-minute games: one trade, typically in the middle portion
- twenty- to forty-minute games: two trades, typically in middle and later portions
- sixty-minute-and-longer games: three trades, typically across early, middle, and later portions

Hosts may override both trade count and trade timing before round start.

### Scoring & Leaderboards

The default score metric is final portfolio value weighted by oracle-relative value.

Only the final session state determines score, using the oracle context at the final update point. The default outcome is a top leaderboard ranking.

Alternative outcome formats may be selected by the host, but they must also be fixed before the round starts.

### Determinism & Fairness

All players in the same round experience the same scenario foundations: event logic, price behavior, and timing structure.

Results depend on player decisions made inside those fixed conditions, not on participant-specific rule differences. Chat and social interaction remain outside gameplay and do not affect scoring.

### Chat & Social Layer

Each round has a shared chat space for all players assigned to that round.

Chat is independent from individual session timing and independent from gameplay outcomes. It supports both asynchronous challenge rounds and synchronous live event rounds as a common social layer.

### Trading Costs (Agreed Default)

Trading is not free and always carries a cost.

The agreed default is a value-based fee. Each trade applies a fixed fee based on the oracle-weighted value of the traded amount at the moment the trade is made.

This fee model is deterministic, identical for all players in the same round, and applied consistently across asynchronous challenge rounds and synchronous live event rounds.

Its purpose is to discourage random or excessively frequent trading and to keep trades as deliberate strategic decisions.

The exact fee level is treated as a balancing parameter rather than a core design principle.

Hosts may override the fee before a round starts. This can include reducing the fee or disabling it for special rounds or learning-focused events.

Any such override must be fixed before round start and must apply equally to all players in that round.

### Farming Stage 1 - Passive Farming (Agreed Concept)

Tokens allocated to farming remain under player control and can be removed again by the player.

To receive a farming bonus, allocated tokens must remain in farming for at least a predefined minimum duration. This minimum farming duration is defined before the round starts and is identical for all players in that round.

The farming reward is granted only after the minimum duration has elapsed.

If tokens remain in farming after the reward is granted, the farming position increases by that bonus, creating a compounding effect over time.

If tokens are removed before the minimum duration is reached, no farming bonus is awarded.

In this stage, farming remains deterministic, low-risk, and non-reactive. Its role is to reward patience and long-term planning rather than short-term optimization.

Hosts may set the minimum farming duration and the farming reward level before the round begins.

All farming parameters must be fixed before round start and must apply equally to all players in that round.

Farming is intentionally limited to Stage 1 (Passive Farming) and Stage 2 (Rotating Farming), with no Stage 3 or further escalation layers planned. This is a deliberate design choice to preserve clarity, flexibility, and round-based playability.

## Implementation Reality Check (2026-03-23)

- Current implementation/validation focus is Mining.
- Trading and Farming remain concept-defined, but dedicated UI implementation work for those pillars has not started yet.
- Structured playtest validation is still needed for mining pace, upgrade economy tuning, and halving behavior quality.

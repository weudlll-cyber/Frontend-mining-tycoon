# SCORING_MODES

## Scoring / Outcome Modes

This document defines the approved round outcome modes for Seasonal Tycoon / Mining Tycoon.

Mode selection is locked before round start and cannot change mid-round.

All modes share the same deterministic systems (simulation timing, token output, halvings, event activation, oracle behavior, and conversion rules). Only evaluation differs.

### 1) Stockpile Mode (Total Tokens)

- Summary: Highest total token count across all seasons wins.
- Measures: End-of-round aggregate token count (spring + summer + autumn + winter).
- Rewards: Strong token accumulation and broad production discipline.
- Does NOT reward: Oracle-weight timing advantages by themselves.

### 2) Power Mode (Oracle-Weighted Score)

- Summary: Highest final oracle-weighted score wins.
- Measures: End-of-round holdings weighted by oracle-derived seasonal weights.
- Rewards: Strong allocation decisions under changing oracle weight patterns.
- Does NOT reward: Raw token volume alone when weight alignment is weak.

### 3) Mining Time Equivalent Mode

- Summary: Holdings are converted into total Mining Time Equivalent; highest total wins.
- Measures: End-of-round holdings mapped to equivalent mining-time output at fixed conversion ratios.
- Rewards: Production consistency and token accumulation independent of oracle score weighting.
- Does NOT reward: Oracle-weight variance as a scoring multiplier.

### 4) Efficiency Mode (System Mastery)

- Summary: Best improvement relative to baseline/inputs wins.
- Measures: Performance improvement from pre-round baseline under identical initial inputs.
- Rewards: Skillful system tuning, upgrade timing, and disciplined decision paths.
- Does NOT reward: Absolute holdings alone without strong efficiency gain.

## Selection Lock Rule

- Outcome mode is selected before round start by the host/configuration path.
- The selected mode remains fixed for the round.
- Runtime switching during an active round is not permitted.

## Implementation (Backend)

All four modes are implemented and evaluated by the backend
(`app/services/scoring_service.py:compute_player_score` in the sibling backend
repo). The same function feeds the sync leaderboard, the SSE
`leaderboard_top_5`, async session final scores and the async best-of. Rounds
without a stored `scoring_mode` score as `stockpile`. The authoritative
definitions are in the backend `README.md`, section "Scoring modes -
implementation definitions".

| Mode (`scoring_mode`) | Formula | Score type |
|---|---|---|
| `stockpile` | `sum(balance[t])` over the four tokens | integer |
| `power` | `sum(balance[t] * oracle_price[t])` at the scoring sim month | integer |
| `mining_time` | `sum(balance[t] / base_rate[t])`, i.e. seconds of baseline mining (`base_rate` = snapshot-locked level-0 emission rate) | integer |
| `efficiency` | `cumulative_mined / baseline_mined`, where `baseline_mined` is what a no-upgrade player would have mined over the same elapsed time (1.0 = baseline) | float, 4 decimals |

> **Pending product confirmation:** the `mining_time` and `efficiency` formulas
> are an implementation interpretation of the intent described above. The
> project owner still has to confirm them.

Frontend display (`src/utils/score-format.js`): integers for `stockpile`,
`power` and `mining_time`; efficiency scores are shown as a ratio with four
decimals and a `×` suffix (for example `1.2345×`). The admin console and the
setup payload use the long canonical names (`stockpile_total_tokens`,
`power_oracle_weighted`, `mining_time_equivalent`,
`efficiency_system_mastery`, see `src/config/game-control-data.js`).

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

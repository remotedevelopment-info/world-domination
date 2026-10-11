# borders/expansion

> Model: 1.0.0 · Status: draft

## Purpose

The rules by which players gain and lose territory — the README's core loop: diplomacy, economy, and military actions resolved against the 90-second tick, plus the daily-activity retention rules that make land contested.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

First real resolved action = **minor**. Changing the one-kingdom-per-player claim model or the ownership schema = **major** (touches `http-api`, `database`, `protocol`).

## Ideas

- Tick-based action resolution queue drained in `game_engine.processTick` (the `game_actions` table is already waiting)
- Adjacency graph so expansion must flow from held territory; connection/encirclement rules
- War/alliance state machines feeding diplomacy; trade pacts feeding economy
- Resource costs for actions (population/resources columns already exist on `countries`)
- Inactivity erosion: neighbors absorb lapsed empires (README daily-activity / 7-day rule)
- Occupation/siege timing instead of instant conquest

## Concerns

- This skill is currently pure design: the game rules are undefined beyond "claim a kingdom", and balance is entirely open.
- Resolution model choice: per-tick batch (fits the engine, up to 90s latency) vs. real-time events (needs a scheduler) — decide before building.
- Multi-territory empires: schema allows many `player_countries` rows per user, but the API caps players at one — expansion implies lifting the cap, which changes every "my kingdom" UI path.
- Interaction with the crashed tick loop (see `game-engine`): no action system can ship until ticks persist.

## Issues

- **Inactivity rules not implemented**: `processInactivePlayers` is a logging stub (`backend/internal/game/engine.go` L180-184) despite the README promising daily activity or territory loss — the 7-day forfeiture comment is aspirational.
- **`game_actions` is write-free**: table created at schema init (`backend/internal/database/database.go` L114-122) but no code ever inserts — no action history/audit exists.
- **Heartbeat data has no consumer**: `POST /api/heartbeat` diligently updates `last_active` (`backend/internal/handlers/handlers.go` L199-212), but nothing reads it for enforcement.
- **Claim has zero preconditions**: no adjacency, cost, or timing gate (`handlers.go` L132-172), and the double-claim/`owner_id` defects (see `borders`, `http-api`) mean even the first step of expansion is unsound.
- **One-kingdom cap contradicts the vision**: `handlers.go` L156-159 rejects a second country outright — border expansion can never happen under the current rule.

## Result

Only the seed action works: initial single-kingdom claim (`POST /api/assign-country` → `player_countries` insert) plus per-user ownership lookup. The three expansion verbs exist purely as UI placeholders — `showAction('diplomacy'|'economy'|'military')` renders "Coming Soon" options in a modal (`frontend/js/game.js` L340-353). No territory has ever been gained beyond claim, and none has ever been lost.

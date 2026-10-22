# borders/expansion

> Model: 1.0.0 · Status: draft

## Purpose

The rules by which players gain and lose territory — the README's core loop: diplomacy, economy, and military actions resolved against the 90-second tick, plus the daily-activity retention rules that make land contested. Two military verbs exist: **border expansion** (into an unclaimed adjacent cell; low cost, low risk) and **invasion** (into an enemy-held cell; high cost, high risk, may reduce population on both sides). Troops must be deployed to a North/South/East/West border side facing the target before any military action. Successful invasion pushes the border into invaded land and gains resources; failed invasion costs attacker population and military strength.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

First real resolved action = **minor**. Changing the one-kingdom-per-player claim model or the ownership schema = **major** (touches `http-api`, `database`, `protocol`). Introducing troop deployment preconditions and asymmetric invasion risk is **minor** (additive rules on top of existing schema).

## Ideas

- Tick-based action resolution queue drained in `game_engine.processTick` (the `game_actions` table is already waiting)
- Adjacency graph so expansion must flow from held territory; connection/encirclement rules
- War/alliance state machines feeding diplomacy; trade pacts feeding economy
- Resource costs for actions (population/resources columns already exist on `countries`)
- Inactivity erosion: neighbors absorb lapsed empires (README daily-activity / 7-day rule)
- Occupation/siege timing instead of instant conquest
- Military size labels: "levy" (1–99), "company" (100–499), "battalion" (500–999), "legion" (1000–4999), "horde" (5000+) — picturesque labels derived from numeric strength

## Concerns

- This skill is currently pure design: the game rules are undefined beyond "claim a kingdom", and balance is entirely open.
- Resolution model choice: per-tick batch (fits the engine, up to 90s latency) vs. real-time events (needs a scheduler) — decide before building.
- Multi-territory empires: schema allows many `player_countries` rows per user, but the API caps players at one — expansion implies lifting the cap, which changes every "my kingdom" UI path.
- Interaction with the crashed tick loop (see `game-engine`): no action system can ship until ticks persist.
- Invasion risk asymmetry must be tuned: relative attacker:defender strength ratio determines probability of success, population loss magnitude, and resource gain — no formula exists yet.
- Troop deployment cooldown: troops moved to a border cannot be redeployed until the next tick — prevents rapid repositioning to game invasions.

## Issues

- **Inactivity rules not implemented**: `processInactivePlayers` is a logging stub (`backend/internal/game/engine.go` L180-184) despite the README promising daily activity or territory loss — the 7-day forfeiture comment is aspirational.
- **`game_actions` is write-free**: table created at schema init (`backend/internal/database/database.go` L114-122) but no code ever inserts — no action history/audit exists.
- **Heartbeat data has no consumer**: `POST /api/heartbeat` diligently updates `last_active` (`backend/internal/handlers/handlers.go` L199-212), but nothing reads it for enforcement.
- **Claim has zero preconditions**: no adjacency, cost, or timing gate (`handlers.go` L132-172), and the double-claim/`owner_id` defects (see `borders`, `http-api`) mean even the first step of expansion is unsound.
- **One-kingdom cap contradicts the vision**: `handlers.go` L156-159 rejects a second country outright — border expansion can never happen under the current rule.
- **Troop deployment model does not exist**: no N/S/E/W border assignment, no strength per border, no cooldown — invasions/expansions cannot be gated on border-facing troop presence.
- **Military unit model does not exist**: no `size` label or `strength` value per player — combat resolution has no inputs.

## Result

Only the seed action works: initial single-kingdom claim (`POST /api/assign-country` → `player_countries` insert) plus per-user ownership lookup. The three expansion verbs exist purely as UI placeholders — `showAction('diplomacy'|'economy'|'military')` renders "Coming Soon" options in a modal (`frontend/js/game.js` L340-353). No territory has ever been gained beyond claim, and none has ever been lost. Troop deployment, border pushing, invasion/expansion combat, and military size/strength are all pure design.

Sub-skill dependencies: `troop_deployments`, `border_lines`, `military_actions` tables and `users.base_color`/`users.home_territory_id` columns planned in `database`; tick-time military resolution planned in `game-engine`.

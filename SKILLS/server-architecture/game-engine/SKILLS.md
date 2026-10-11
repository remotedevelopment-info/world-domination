# server-architecture/game-engine

> Model: 1.0.0 · Status: draft

## Purpose

The authoritative simulation loop: advance the world every 90 seconds, build the canonical `GameState`, persist it, and broadcast it to connected clients. All time-driven game rules live here.

## Affects

Backend

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Fixing the first-tick panic is a **patch** (restores intended behavior); resuming/serializing ticks or changing tick semantics is at least **minor**.

## Ideas

- Resume `currentTick` from `game_states` on boot — `database.GetNextTick()` already exists (`backend/internal/database/database.go` L207-210) but is never called
- Call `TriggerTick` (also unused, `engine.go` L192-197) from tests/an admin endpoint for manual ticks
- Drain an action queue each tick (connects to `borders/expansion`)
- Catch-up ticks after downtime; configurable tick duration; `recover()` around tick processing so one bad tick can't kill the server
- Deterministic state transitions + snapshot diffs instead of full-state rebuild

## Concerns

- `buildGameState` re-queries the DB every tick — fine for 15 rows, a poor pattern once territory cells grow.
- Tick processing order is: persist → broadcast → inactivity (`processTick`, `engine.go` L99-121); a DB outage delays the broadcast but players still get stale state — is that the desired degradation?
- All tick state is process-local: two instances would run two divergent worlds (single-writer assumption, undocumented).

## Issues

- **Fatal first-tick panic (stack-breaking)**: `buildGameState` type-asserts map values as `float64`, but `database.GetCountries` returns `int64` for BIGINT columns — `panic: interface conversion: interface {} is int64, not float64` at `backend/internal/game/engine.go` L132 (`c["id"].(float64)`; also L133/L137/L138 for population/resources, and L141 for `owner_id`). **Verified live**: the container logs show `Processing tick 1` then the panic, exit code 2, 90 seconds after every start; the stack has been down since. There is no `recover()` anywhere, so the panic kills HTTP and WebSocket service along with the engine.
- **Zero ticks ever persisted**: the panic occurs before `SaveGameState` (`engine.go` L107 vs L115) — `game_states` is empty despite the DB running for days.
- **Tick counter resets on restart**: `currentTick` starts at 0 (`engine.go` L47-54); on a future fixed build this would re-save tick 1 — `game_states.tick` has an index but no `UNIQUE` constraint (`database.go` L107-112, L132).
- **Engine cannot be restarted**: `Stop` closes `stopChan` (`engine.go` L79-83); a later `Start` spawns a loop that exits immediately on the closed channel — restart silently does nothing.
- **Data race**: `isRunning` is read/written in `Start`/`Stop` without the mutex (`engine.go` L70-83).
- **Inactivity enforcement is a stub**: `processInactivePlayers` only logs (`engine.go` L180-184) — see `borders/expansion`.
- `TriggerTick` is dead code (never called).

## Result

Designed pipeline exists — ticker (90s) → `buildGameState` → JSON marshal → `SaveGameState` → `notifySubscribers` → inactivity stub — with a singleton engine, buffered subscriber channels, and a public `GetCurrentTick`. In practice **the pipeline has never completed a single tick against a running server** (verified panic above); `Start`/`Stop` wiring and startup logging work, and the ticker fires on schedule.

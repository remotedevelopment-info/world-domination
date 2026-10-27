# socket-communications

> Model: 1.0.0 · Status: draft

## Purpose

Real-time, bidirectional communication between the Go server and connected browser clients: push authoritative game state (ticks, ownership changes) without polling, and let clients observe link health. This transport layer underpins everything the game UI displays.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Any change to the WebSocket message format is a **major** bump for this skill and `protocol`.

## Ideas

- Delta/diff broadcasts instead of full `GameState` every tick
- Authenticate the WS handshake (pass the token on connect; reject anonymous sockets)
- Move heartbeat onto the socket itself (see `reconnection-heartbeat`)
- Per-era or per-player channels instead of one global broadcast
- Client→server actions over WS (actions are currently REST-only)
- Horizontal scaling: replace the in-process subscriber map with a pub/sub bus

## Concerns

- Single in-process broadcast: every subscriber receives every tick with no interest filtering — fine for one instance, blocking for scale.
- Full-state JSON grows linearly with kingdoms × players.
- No backpressure policy beyond silent drop-on-full (see Issues).
- Ownership changes only propagate on the next 90s tick, so the map can lag a REST claim by up to 90 seconds.

## Issues

- **Unauthenticated endpoint**: `wsHandler` upgrades any connection with no token check (`backend/cmd/server/main.go` L30) — anonymous clients receive full game state.
- **CORS wide open**: `CheckOrigin` returns `true` for every origin (`backend/cmd/server/main.go` L25) — any website can open a socket to this server from a visitor's browser.
- **Silent state drops**: `notifySubscribers` uses `select`/`default` on a buffered(10) channel (`backend/internal/game/engine.go` L169-178) — a slow client misses ticks with no warning or catch-up.
- **WS alone is insufficient**: the client assumes `data.countries` on tick messages (`frontend/js/game.js` L301-306), but the `init` message carries none (`backend/cmd/server/main.go` L43-47) — initial map state requires a REST fetch.

## Result

Working single-endpoint transport: `GET /ws` registered at `backend/cmd/server/main.go` L94; on connect the server sends `{type:"init", tick, timestamp}`; every 90s the engine marshals full `GameState` and pushes it to subscribers via Go channels (`backend/internal/game/engine.go` `processTick` → `notifySubscribers`); the server sends a WS ping every 30s (`main.go` L59-64); the client tracks connection status, reconnects on close, and repaints on receipt (`frontend/js/game.js` `connectWebSocket`).

Caveat: the tick path has never completed against a live server — the first tick panics the process (see `server-architecture/game-engine`), so no tick frame has ever been broadcast and the ping loop dies with each crash.

Sub-skills: `protocol` (message contract), `reconnection-heartbeat` (link recovery & liveness).

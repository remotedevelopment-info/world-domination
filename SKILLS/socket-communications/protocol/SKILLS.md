# socket-communications/protocol

> Model: 1.0.0 · Status: draft

## Purpose

The wire contract for everything crossing the `/ws` endpoint: message shapes, identification, versioning, and semantics on both sides. Defines what a client may assume about any frame it receives.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Introducing a versioned envelope is a **major** bump (all clients break).

## Ideas

- Versioned envelope: `{v: 1, type: "init"|"tick"|"error"|"ack", seq, payload}`
- Sequence numbers so clients can detect dropped ticks (see `reconnection-heartbeat`)
- Snapshot-on-connect: `init` should carry the full current `GameState`, not just a tick number
- Message registry shared by server and client (a single source of truth per message type)
- Client→server frames (actions, chat) once the socket becomes bidirectional

## Concerns

- Messages are identified by ad-hoc shape inspection — `init` by its `type` field, ticks by the mere presence of `tick`+`countries` (`frontend/js/game.js` L295-306) — so any new message type can be misread as a tick or silently ignored.
- No schema validation on either side; the server marshals whatever `GameState` contains.
- Client never sends a single frame over the socket — the "bidirectional" transport is 99% one-way today.

## Issues

- **Contract advertises fields that never exist**: `GameState` declares `players` and `actions` arrays (`backend/internal/game/engine.go` L14-20) but `buildGameState` only populates `Tick`/`Timestamp`/`Countries` (L147-151) — the arrays are always absent, so future client code reading `data.players` will break silently.
- **No error channel**: the server cannot tell a client its message was bad; the client's `JSON.parse` failure is uncaught (`frontend/js/game.js` L296).
- **No version field** — a rolling deploy changing the envelope cannot warn old clients.

## Result

Two de-facto message shapes: server `init` = `{type:"init", tick, timestamp}` sent on connect (`backend/cmd/server/main.go` L43-47), and server tick = full `GameState` JSON (`backend/internal/game/engine.go` `processTick`). The client has one `onmessage` handler branching on field presence. Note: as of writing, no tick frame has ever reached a live client — the first tick panics the server (see `server-architecture/game-engine`).

# socket-communications/reconnection-heartbeat

> Model: 1.0.0 · Status: draft

## Purpose

Detecting dead links, recovering the session after a drop, and reporting liveness: the WebSocket reconnect loop, the 30s server ping, the REST heartbeat, and the connection-status indicator.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

## Ideas

- Exponential backoff with jitter instead of fixed 5s
- Resume-on-reconnect: client sends last seen tick → server replies with snapshot
- True WS heartbeat both directions (server read deadline + client pong) instead of REST-over-open-socket
- On 401 from heartbeat: clear session and show login screen instead of failing silently

## Concerns

- The REST heartbeat proves the *API* is reachable, not that the *socket* is healthy — the two can disagree.
- Heartbeat doubles as the game's activity signal (`player_countries.last_active`), so socket health and game-retention rules are entangled.
- Fixed-interval reconnect across many clients produces a thundering herd after a server restart.

## Issues

- **Interval leak**: `setInterval(sendHeartbeat, 30000)` is registered *inside* `connectWebSocket()` (`frontend/js/game.js` L307), and every reconnect calls `connectWebSocket()` again (L290-294) — each outage permanently adds another heartbeat interval; repeated flaps multiply heartbeat traffic.
- **Reconnect after logout**: `logout()` closes the socket (`frontend/js/game.js` L198-201), `onclose` unconditionally schedules a reconnect (L290-294) — the client reconnects while logged out.
- **Silent session death**: heartbeat 401s are swallowed (`.catch(() => {})`, `frontend/js/game.js` L311-316) and token expiry (24h, `backend/pkg/auth/auth.go` L28) is never surfaced — the UI shows "connected" while every API call fails until page reload.
- **Server never reads the socket**: `wsHandler` only writes (pings/state) (`backend/cmd/server/main.go` L53-65), so client close frames are processed only when a later write fails — a departed client can linger up to a full tick.
- **Fixed 5s backoff, no jitter/cap** (`frontend/js/game.js` L293).
- Cross-cutting: while the server is dead between ticks (see `server-architecture/game-engine`), clients sit in a permanent disconnect/reconnect cycle — this skill's machinery makes the crash look like flaky networking.

## Result

Client-driven recovery works: `onclose` → 5s retry with a UI status dot (`frontend/js/game.js` L283-308); server sends WS ping every 30s (`backend/cmd/server/main.go` L59-64); REST heartbeat every 30s updates `player_countries.last_active` via `POST /api/heartbeat` (`backend/internal/handlers/handlers.go` L199-212) — also the sole writer of activity data. First `init` frame triggers an immediate heartbeat (`game.js` L288).

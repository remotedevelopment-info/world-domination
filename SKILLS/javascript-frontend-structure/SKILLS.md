# javascript-frontend-structure

> Model: 1.0.0 · Status: draft

## Purpose

How the browser client is organized: screen layout, session handling, application state, and the division of responsibilities inside the vanilla-JavaScript codebase. It is the map for where frontend changes should go as `game.js` grows — now including military panels, base colour selection, and border visualization.

## Affects

Frontend

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

## Ideas

- ES modules (`<script type="module">`) and splitting `game.js` into `net/`, `map/`, `ui/`, `auth/` files
- A small state store to replace scattered globals (single source of truth for `kingdoms`/`myKingdom`)
- Protocol-relative socket URL (`wss:` when page is `https:`)
- Unit tests for pure logic (`pointInPolygon`, `getCentroid`, reducers)
- Replace inline `onclick` attributes with `addEventListener` wiring
- Populate the full My-Kingdom stat panel and add hover tooltips
- Military panel: army size label ("levy"/"company"/"battalion"/"legion"/"horde") + strength number; N/S/E/W troop deployment buttons
- Base colour picker for home territory; colour-override preview on taken territories
- Border visualization layer on canvas (separate from country fill) showing pushed border segments

## Concerns

- All session and game state lives in mutable module globals (`token`, `currentUser`, `kingdoms`, `myKingdom`, `selectedKingdomId`, `ws`, `currentTick`) with manual sync between them — easy to desync.
- `localStorage` is the session source of truth: any XSS can exfiltrate the token; there is no refresh/expiry handling client-side.
- Zero-dependency, zero-build approach is simple to audit but will strain as features grow — decide now whether a build step is ever allowed.
- `innerHTML` is used with server data (`renderKingdomList`, `game.js` L254) — safe today because kingdom names are seeded, but a risky pattern once user-controlled strings appear.
- Military UI must gate actions: hide/disable invade/expand buttons when no troops are deployed on the border side facing the target — this is client-side UX, not a security boundary (server validates).

## Issues

- **Reconnect interval leak**: `setInterval(sendHeartbeat, 30000)` is registered inside `connectWebSocket()` (`frontend/js/game.js` L307) — every reconnect registers *another* interval, so heartbeat frequency grows with each outage.
- **Reconnect after logout**: `ws.onclose` unconditionally schedules a 5s reconnect (`frontend/js/game.js` L290-294); `logout()` closes the socket (L198-201), which triggers a reconnect while logged out.
- **Hardcoded `ws://`** (`frontend/js/game.js` L3) — the socket breaks if the site is ever served over HTTPS.
- **Implicit global `event`** in `selectKingdom` (`frontend/js/game.js` L263) — depends on the deprecated `window.event` and ignores the passed `id` for element lookup.
- **Uncaught `JSON.parse`** in `ws.onmessage` (`frontend/js/game.js` L296) — one malformed frame throws inside the handler.
- **Blank stat fields**: `my-kingdom-pop` / `my-kingdom-res` (`frontend/index.html` L77-78) are never written by `checkMyKingdom` (`frontend/js/game.js` L228-245).

## Result

Working three-file client: `frontend/index.html` (107 lines; `auth-screen` ↔ `game-screen` switching, sidebar panels, action modal, plain `<script src="js/game.js">` at L106 — no build tooling), `frontend/css/style.css` (202 lines), `frontend/js/game.js` (359 lines; functions grouped by concern — auth/REST, canvas map, WebSocket, activity log, modal). Session persisted in `localStorage` (`token`, `user`); auto-login on reload (`game.js` L360); window-resize canvas re-render; tick and connection status in the header.

Candidate future sub-skills: `state-management/`, `auth-session/`, `rendering/`, `military-ui/`.

Sub-skill dependencies: `base_color`/`home_territory_id` column data from `GET /api/countries` (database); border segment geometry from `GET /api/borders` or WS `border_changed` frames (socket-communications/protocol).

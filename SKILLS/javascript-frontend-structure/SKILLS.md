# javascript-frontend-structure

> Model: 1.0.0 · Status: draft

## Purpose

How the browser client is organized: screen layout, session handling, application state, and the division of responsibilities inside the vanilla-JavaScript codebase. It is the map for where frontend changes should go as `game.js` grows — now including military panels, base colour selection, and border visualization.

## Affects

Frontend

## Released/Intended SEMVER

- **Released:** 0.1.0
- **Intended:** 0.2.0

## Ideas

- Splitting world map rendering into specialized layers (terrain, territory borders, frontlines, troops, fog)
- Replace remaining inline `onclick` attributes with explicit `addEventListener` wiring
- Unit tests for pure logic (`pointInPolygon`, `getCentroid`, reducers)
- Military panel: army size label ("levy"/"company"/"battalion"/"legion"/"horde") + strength number; N/S/E/W troop deployment buttons
- Base colour picker for home territory; colour-override preview on taken territories
- Border visualization layer on canvas (separate from country fill) showing pushed border segments

## Concerns

- `localStorage` is the session source of truth: any XSS can exfiltrate the token; there is no refresh/expiry handling client-side.
- Zero-dependency, zero-build approach is simple to audit and app-store friendly, but code must remain cleanly modularized as features expand.
- Military UI must gate actions: hide/disable invade/expand buttons when no troops are deployed on the border side facing the target — this is client-side UX, not a security boundary (server validates).

## Issues

- **Inline onclick attributes in index.html**: HTML elements still use inline `onclick="..."` attributes mapped to `window.*` globals in `main.js` rather than declarative component-level event listeners.
- **Tessellation/subdivision missing**: The world map still uses single monolithic polygons per country; dynamic border movement requires multi-cell or province polygon subdivisions.

## Result

Framework-free, zero-build native ES module client (`<script type="module" src="js/main.js">`):
- `frontend/js/state.js`: Single source of truth for session (`token`, `currentUser`), game state (`kingdoms`, `myKingdom`, `troops`, `tick`), and UI flags.
- `frontend/js/config.js`: Protocol-relative endpoint URLs (`http:`/`https:`, `ws:`/`wss:`) adapting automatically to origin.
- `frontend/js/api.js`: Reusable REST client with standardized JSON error parsing.
- `frontend/js/auth.js`: Login, registration, session storage, and form switching.
- `frontend/js/socket.js`: Reconnecting WebSocket transport with dedicated heartbeat timer (immune to interval leaks) and safe frame parsing.
- `frontend/js/map/`: Modular geometry math (`geometry.js`), kingdom polygon datasets (`polygons.js`), and canvas rendering (`renderer.js`) with responsive canvas scaling and normalized hit-testing.
- `frontend/js/ui/`: Toast notifications (`toast.js`), real-time header clock & turn countdown (`clock.js`), modal actions (`actions.js`), and War Room Console (`console.js` with rotary dials, compass, tactical actuators, target radar, and territory minimap).
- `frontend/js/main.js`: Application lifecycle orchestration and global bridge.

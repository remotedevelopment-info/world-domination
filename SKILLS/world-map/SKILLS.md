# world-map

> Model: 1.0.0 · Status: draft

## Purpose

Representation and rendering of the medieval Europe game map: how territory geometry is defined, projected onto the canvas, painted, and hit-tested by player clicks. It is the visual surface of the entire game.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Replacing the polygon format (e.g. with GeoJSON) is a **major** bump.

## Ideas

- Real GeoJSON geometry + a proper projection (Mercator/equirectangular) instead of hand-placed coordinates
- Zoom/pan with a transform matrix; hover tooltips; selection highlighting
- Serve geometry from the backend per era (medieval, renaissance, …) — see `kingdom-data`
- Render states/regions subdivision once the territory hierarchy exists (README: "Large countries split into states/regions")
- Animate ownership changes (border pulse / color tween) on tick

## Concerns

- **Overlapping polygons by design and by accident**: small states sit inside larger shapes (VEN, PAP within the peninsula area) *and* Iberian polygons overlap each other (POR/ESP, CAS/ESP, CAS/ARA — `frontend/js/game.js` L19-36). Whichever kingdom the server returns first wins the click (`getKingdomAtPosition` L98-111), so hit results depend on DB row order, not geometry.
- Geometry, attributes, and ownership live in three places (JS polygons, `countries` table, `player_countries`) — see `kingdom-data`.
- The README promises multiple eras; today only `'medieval'` is ever queried.

## Issues

- **Orphan polygon**: `kingdomPolygons` defines **16** codes but the seed inserts **15** kingdoms — `ITA` has geometry with no `countries` row (`frontend/js/game.js` L26 vs `backend/internal/database/database.go` L167-181). Italy is never drawn and can never be clicked or claimed.
- **Hit-test/scale mismatch**: `getKingdomAtPosition` normalizes clicks by `canvasWidth`/`canvasHeight` but takes the offset from `getBoundingClientRect()` (`frontend/js/game.js` L99-101) — the two disagree the moment CSS scales the canvas.
- The map repaints only on WS tick or explicit REST load — no hover/preview state exists.
- Duplicate fill colors in the seed (ENG/ARA `#FF6B6B`, FRA/CAS `#4ECDC4`, SWE/PAP `#FFAAA5`, `backend/internal/database/database.go` L167-181) make distinct kingdoms visually identical except for borders.

## Result

Working map: 16 normalized `[0,1]` polygons keyed by country code (`frontend/js/game.js` L19-36); `renderMap` paints ocean background, per-kingdom fill, ownership border, and centroid code label (L51-90); ray-casting `pointInPolygon` powers click-to-inspect overlay (L98-123, L328-338); sidebar lists unclaimed kingdoms (L247-258); canvas re-renders on window resize and on every WS tick (note: ticks currently never fire — see `server-architecture/game-engine`).

Sub-skills: `projection` (coordinate math), `kingdom-data` (geometry vs. attribute sources of truth).

# world-map/kingdom-data

> Model: 1.0.0 · Status: draft

## Purpose

Where kingdom data lives and how it stays in sync: which source owns geometry, which owns attributes (name/color/population), which owns ownership — and how they reach the client. Player base colour and home territory now override the seeded country colour on taken territories.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

Serving geometry from the backend (`GET /api/map`) is a **minor**; moving geometry out of the client contract is **major** (breaks old frontends). Adding `base_color` override rendering on taken territories is **minor**.

## Ideas

- Geometry as a `JSONB` column on `countries` (or a `geometries` table), served via `GET /api/map?era=…`
- Parity test/CI check: every seeded `code` has a polygon and vice versa
- Per-era geometry sets (renaissance, modern …) matching the README's era roadmap
- Sub-territory geometry (cells) once `borders/expansion` needs them

## Concerns

- Three-way split today: geometry → frontend JS, attributes → `countries` table, holdings → `player_countries`; only attributes/holdings sync live, geometry requires a JS redeploy.
- `code` (3 letters) is the join key between JS and DB — unvalidated and unindexed as a contract (no uniqueness constraint on `countries.code`).
- The era concept exists in the DB (`eras` table, `era` column) but geometry has no era dimension at all.
- Initial 15-country polygons must form a **closed tiling** in normalized `[0,1]` space: every shared edge matches exactly between neighbors, no gaps or overlaps. `ITA` has a polygon but no DB row — needs seeding or removal to keep the tiling consistent.
- Player base colour (from `users.base_color`) overrides a country's seeded colour on any territory that player controls. Home territory (`users.home_territory_id`) renders in base colour permanently.

## Issues

- **Orphan / missing pairs**: `kingdomPolygons` has **16** codes, the seed has **15** — `ITA` exists only in `frontend/js/game.js` L26 with no `countries` row (`backend/internal/database/database.go` L167-181). Nothing detects this drift; a mismatch silently drops a kingdom from the map.
- **Geometry not served by any endpoint**: clients hardcode it, so the server cannot validate, version, or hotfix the map.
- **Ownership never syncs out**: even after the engine panic is fixed, `countries.owner_id` is never written (see `borders`), so the attribute stream would still report everyone unowned.

## Result

Working sync for attributes: `GET /api/countries` returns id/name/code/color/owner_id/population/resources/territory_type for an era (`backend/internal/database/database.go` L239-267); the WS tick broadcasts the same attributes (`engine.go` buildGameState); the frontend keys its hardcoded polygons by `code` and joins them to the fetched rows (`frontend/js/game.js` L59-61). Geometry side is static in source; join works for all 15 seeded kingdoms.

Sub-skill dependencies: `users.base_color` and `users.home_territory_id` columns are planned in `database` but not yet implemented; colour-override rendering on taken territories is not yet in the client.

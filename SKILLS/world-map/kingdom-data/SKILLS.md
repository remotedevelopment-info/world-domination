# world-map/kingdom-data

> Model: 1.0.0 · Status: draft

## Purpose

Where kingdom data lives and how it stays in sync: which source owns geometry, which owns attributes (name/color/population), which owns ownership — and how they reach the client.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Serving geometry from the backend (`GET /api/map`) is a **minor**; moving geometry out of the client contract is **major** (breaks old frontends).

## Ideas

- Geometry as a `JSONB` column on `countries` (or a `geometries` table), served via `GET /api/map?era=…`
- Parity test/CI check: every seeded `code` has a polygon and vice versa
- Per-era geometry sets (renaissance, modern …) matching the README's era roadmap
- Sub-territory geometry (cells) once `borders/expansion` needs them

## Concerns

- Three-way split today: geometry → frontend JS, attributes → `countries` table, holdings → `player_countries`; only attributes/holdings sync live, geometry requires a JS redeploy.
- `code` (3 letters) is the join key between JS and DB — unvalidated and unindexed as a contract (no uniqueness constraint on `countries.code`).
- The era concept exists in the DB (`eras` table, `era` column) but geometry has no era dimension at all.

## Issues

- **Orphan / missing pairs**: `kingdomPolygons` has **16** codes, the seed has **15** — `ITA` exists only in `frontend/js/game.js` L26 with no `countries` row (`backend/internal/database/database.go` L167-181). Nothing detects this drift; a mismatch silently drops a kingdom from the map.
- **Geometry not served by any endpoint**: clients hardcode it, so the server cannot validate, version, or hotfix the map.
- **Ownership never syncs out**: even after the engine panic is fixed, `countries.owner_id` is never written (see `borders`), so the attribute stream would still report everyone unowned.

## Result

Working sync for attributes: `GET /api/countries` returns id/name/code/color/owner_id/population/resources/territory_type for an era (`backend/internal/database/database.go` L239-267); the WS tick broadcasts the same attributes (`engine.go` buildGameState); the frontend keys its hardcoded polygons by `code` and joins them to the fetched rows (`frontend/js/game.js` L59-61). Geometry side is static in source; join works for all 15 seeded kingdoms.

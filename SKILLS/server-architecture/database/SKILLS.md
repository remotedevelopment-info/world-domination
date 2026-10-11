# server-architecture/database

> Model: 1.0.0 · Status: draft

## Purpose

Schema, connection lifecycle, seeding, and query layer for PostgreSQL: the single persistent store for users, kingdoms, player holdings, ticks, and actions.

## Affects

Backend

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Column removal/rename or constraint changes on existing tables = **major**; new tables/columns = **minor**.

## Ideas

- Real migrations (golang-migrate or goose) instead of `CREATE TABLE IF NOT EXISTS`
- Idempotent per-kingdom seed (`INSERT … ON CONFLICT (code) DO NOTHING`) instead of a count-based guard
- Archive/prune `game_states` (one row per tick ≈ 960/day forever)
- Connection pool tuning + `Ping` on startup with retries (compose currently relies on postgres healthcheck only)
- A `countries.owner_id` write path (see `borders` Issues — currently read-only)
- Store map geometry server-side (see `kingdom-data`)

## Concerns

- Schema-as-code: any column change requires manual DDL against live data; `IF NOT EXISTS` silently masks drift between code and DB.
- Seed guard is count-based (`era='medieval'` count > 0 → skip): a partially seeded or hand-edited table is never repaired, and deleting all rows re-seeds from scratch.
- `sslmode=disable` hardcoded (`backend/internal/database/database.go` L43).
- No migration history = environments can diverge unnoticed.

## Issues

- **`countries.owner_id` is write-free**: ownership lives only in `player_countries` inserts (`database.go` L269-274); no `UPDATE countries` exists anywhere (verified by search) — see `borders`.
- **`game_states` grows unbounded** — `SaveGameState` appends every tick (`database.go` L206-209) with no retention policy (moot until the engine panic is fixed, since zero rows have ever been written).
- **No UNIQUE on ownership**: `player_countries` enforces `UNIQUE(user_id, country_id)` only (`database.go` L103) — nothing prevents two users owning one country; an `UNIQUE(country_id) WHERE is_active` partial index is missing.
- **Misleading API**: `GetUserByUsername` returns an ad-hoc struct with a `Population` field that is never scanned (`database.go` L211-230).
- **No UNIQUE on `game_states.tick`** (`database.go` L107-112) — repeated ticks after restart would silently duplicate.

## Result

Working: `InitDB` from env vars with ping (`database.go` L16-57), `InitSchema` creating 6 tables + 3 indexes + the `medieval` era row (L60-147), `SeedInitialData` inserting **15** kingdoms idempotently (L149-205 — verified: includes CAS, lacks ITA), and the query helpers consumed by handlers and the engine (`GetCountries`, `CreateUser`, `GetPlayerCountry`, `AssignCountryToPlayer`, `UpdatePlayerActivity`, `SaveGameState`, …). Table set: `users`, `eras`, `countries`, `player_countries`, `game_states`, `game_actions`.

# borders

> Model: 1.0.0 · Status: draft

## Purpose

Ownership boundaries of territory: how a kingdom's border is drawn to show who holds it, and how borders are *meant* to change as players expand — the README's core "expand borders through diplomacy, economics, and military action" loop. Borders are dynamic lines in normalized `[0,1]` space: initial polygons form a closed tiling, and gameplay pushes border segments into invaded lands. Troops deploy to North/South/East/West border sides; invasions and expansions must originate from a troop-manned border facing the target.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

Any change to how ownership is stored or resolved (e.g. fixing `owner_id`, adjacency rules) is at least a **minor** bump; changing the claim model or introducing troop deployment / border-push mechanics is **major**.

## Ideas

- Owner-colored borders so empires are distinguishable at a glance
- Sub-territory cells (grid/hex) inside each country so borders can *actually* grow, rather than conquest meaning "take a whole country"
- Frontline/contested rendering between adjacent empires; fortification states
- Fog of war and scouting effects on border visibility
- Distinct rendering for truces/alliances vs. hostile borders
- Player base colour override: taken territories render in the conquering player's `base_color`; home territory renders in base colour permanently

## Concerns

- The core expansion mechanic has no design yet — with static country polygons, "expansion" can only ever mean claiming another whole country.
- No adjacency rules: any unclaimed country can be claimed from anywhere, which makes borders irrelevant strategically.
- Fill colors are not unique across kingdoms (see `world-map` Issues) — until borders identify the owner, two different empires can look identical.
- `parent_id` and `territory_type` columns exist for hierarchy (`backend/internal/database/database.go` L87-91) but `parent_id` is never read or written — states/regions borders are unwritten design.
- Tessellation invariant: after a border is pushed into invaded land, adjacent polygons must still tile with no gaps/overlaps — enforcement belongs in `database` or `game-engine`.
- Cardinal-direction troop deployment: troops must be on the border side facing the target before an invasion/expansion can be launched — this is a gating precondition with no implementation.

## Issues

- **`countries.owner_id` is never written**: `AssignCountryToPlayer` only inserts into `player_countries` (`backend/internal/database/database.go` L269-274) and no code anywhere issues an `UPDATE countries` (verified by search). So after a claim: `GetCountries` still returns `owner_id: null`, the WS tick still shows the kingdom unowned, the border stays thin/translucent, and the sidebar still lists it as claimable — the map can *never* show an owned border today.
- **Concurrent double-claim**: `AssignCountryHandler` checks only that the *claiming user* has no country (`backend/internal/handlers/handlers.go` L151-159); nothing checks whether the *country* is taken, and `player_countries` has only `UNIQUE(user_id, country_id)` — two players can hold the same kingdom.
- Border style distinguishes only claimed vs. unclaimed (white 3px vs. translucent 1px), never *which* owner (`frontend/js/game.js` L78-79).
- Nothing consumes `last_active` to enforce the README's daily-activity rule — see `expansion`.
- Troop deployment model does not exist: no N/S/E/W border assignment, no strength per border, no cooldown — see `borders/expansion`.

## Result

Partial: borders render as polygon strokes during `renderMap` (`frontend/js/game.js` L77-80); a player can claim exactly one kingdom via REST (`POST /api/assign-country`) and see it in their own "My Kingdom" panel (`GET /api/my-country`), but that ownership **never reaches the map** (see Issues). Diplomacy/economy/military modal buttons exist as "Coming Soon" placeholders (`frontend/js/game.js` L340-353).

Sub-skills: `rendering` (strokes & hit-testing), `expansion` (territory gain/loss rules, troop deployment, border pushing).

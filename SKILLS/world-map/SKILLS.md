# world-map

> Model: 1.0.0 · Status: updated · Era: Age of Discovery (c. 1500)

## Purpose

Representation and rendering of the historical world map across 5 chronological eras, beginning with the **Age of Discovery (c. 1500)** featuring a **Steampunk** cartographic sensibility: how territory geometry is defined, projected onto the canvas, painted with portolan nautical elements, and hit-tested by player clicks. It is the visual surface of the entire game.

## Historic Eras Narrative Model

1. **The Age of Discovery (circa 1500)** [ACTIVE]: Visual design is **Steampunk** (brass astrolabes, nautical portolan charts, radiating rhumb lines, compass rose, copper rivets, aged parchment dials). Player board starts reduced to the 11 sovereign powers operating in 1500.
2. **The Age of Revolt (1750–1860)** [LOCKED]: Gunpowder, steam, and imperial fractures; emergence of republics (e.g., American and French revolutions) from imperial territory.
3. **The Age of Independence (1860–1920)** [LOCKED]: Rise of nation-states (e.g., German/Italian unification, Latin American independence, Balkan succession from Ottoman rule).
4. **The Age of Decolonisation (Mid 20th C.)** [LOCKED]: Mid-century post-colonial independence movements in Asia, Africa, and the Caribbean.
5. **The Modern Age** [LOCKED]: Contemporary digital geopolitics and global trade networks.

*Core Mechanic:* Each age sees the birth of new countries costing existing empires territory and introducing new diplomatic factions.

## Affects

Both frontend and backend.

## Released/Intended SEMVER

- **Released:** 0.1.0 (Proof of concept tagged `v0.1.0`)
- **Intended:** 0.2.0 (Steampunk 1500 Age of Discovery world map & War Room Console)

## Age of Discovery (1500) Sovereign Realms (11 Kingdoms)

The starting board is reduced to the sovereign realms operating in 1500:
1. `ESP` — Crown of Spain (unified Castile + Aragon under Isabella & Ferdinand; watertight non-overlapping border with Portugal)
2. `POR` — Kingdom of Portugal (pioneering Atlantic maritime empire)
3. `FRA` — Kingdom of France (Valois dynasty)
4. `ENG` — Kingdom of England (Tudor dynasty)
5. `HRE` — Holy Roman Empire (Habsburg realm)
6. `OTT` — Ottoman Empire (Sultanate of Bayezid II)
7. `VEN` — Republic of Venice (Serenissima maritime republic)
8. `PAP` — Papal States (Rome / Borgia era)
9. `POL` — Poland-Lithuania (Jagiellonian union)
10. `RUS` — Tsardom of Muscovy (Ivan III / Grand Duchy)
11. `KAL` — Kalmar Union (unified Scandinavia under King John)

## Steampunk Cartographic Features

- **Portolan Radiating Rhumb Lines**: 32-bearing navigation rays radiating across the ocean from key hubs (Atlantic off Lisbon and Eastern Mediterranean).
- **Astrolabe Nautical Compass Rose**: 16-point faceted compass star with outer brass graduation rings, degree ticks, and a fleur-de-lis north arrow located in the North Atlantic.
- **Cartographic Border**: Latitude and longitude degree strip with alternating bronze and dark-ink intervals, framed by 4 brass corner rosettes with rivets.
- **Cartouche Plaque**: Antique brass and parchment header declaring "ORBIS TERRARUM · ANNO DOMINI MD (1500) · THE AGE OF DISCOVERY".
- **War Room Console**: Brass gear bezels, aged parchment gauge dials, mechanical levers with weighted copper knobs, and Astrolabe radar minimap.

## Issues Resolved

- **Overlapping Iberian Polygons**: Resolved by merging Castile and Aragon into the sovereign Crown of Spain (`ESP`), matching Portugal (`POR`) on its eastern border with zero overlap.
- **Split Scandinavia**: Resolved by merging Norway and Sweden along their shared spine into the sovereign Kalmar Union (`KAL`).
- **Anachronistic Byzantium**: Replaced with the historical Ottoman Empire (`OTT`) in 1500.
- **Frontend Modularization**: Monolithic `game.js` decomposed into standard ES modules under `frontend/js/` (`state.js`, `api.js`, `socket.js`, `map/`, `ui/`, `main.js`).

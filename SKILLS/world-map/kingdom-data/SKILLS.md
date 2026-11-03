# world-map/kingdom-data

> Model: 1.0.0 · Status: updated · Era: Age of Discovery (c. 1500)

## Purpose

Where kingdom data lives and how it stays in sync across the 5 historical eras: which source owns geometry, which owns attributes (name/color/population/borders), which owns ownership, and how they reach the client in the 1500 Age of Discovery setup.

## Historic Eras Setup

- **Age of Discovery (c. 1500)**: Reduced to 11 sovereign realms (`ESP`, `POR`, `FRA`, `ENG`, `HRE`, `OTT`, `VEN`, `PAP`, `POL`, `RUS`, `KAL`).
- Seeded via `SeedInitialData()` in `backend/internal/database/database.go` with distinct colors, populations, and adjacency border lists.
- As the game advances through subsequent eras (Revolt, Independence, Decolonisation, Modern), newly born nations are introduced at the expense of existing empires' territories.

## Released/Intended SEMVER

- **Released:** 0.1.0
- **Intended:** 0.2.0

## 1500 Sovereign Kingdoms (11 Realms)

| Code | Realm Name | Sovereign Dynasty / Rule | Starting Population | Gold Reserves | Adjacencies |
|:---:|:---|:---|:---:|:---:|:---|
| `ESP` | Crown of Spain | Isabella & Ferdinand (Trastámara) | 8,500,000 | 750 | POR, FRA |
| `POR` | Kingdom of Portugal | Manuel I (House of Aviz) | 2,200,000 | 450 | ESP |
| `FRA` | Kingdom of France | Louis XII (House of Valois) | 16,000,000 | 850 | ESP, HRE |
| `ENG` | Kingdom of England | Henry VII (House of Tudor) | 4,500,000 | 600 | FRA |
| `HRE` | Holy Roman Empire | Maximilian I (House of Habsburg) | 14,000,000 | 900 | FRA, VEN, POL, KAL |
| `OTT` | Ottoman Empire | Sultan Bayezid II | 12,000,000 | 1000 | VEN, POL |
| `VEN` | Republic of Venice | Agostino Barbarigo (Doge) | 1,800,000 | 700 | HRE, OTT, PAP |
| `PAP` | Papal States | Pope Alexander VI (Borgia) | 1,500,000 | 500 | VEN |
| `POL` | Poland-Lithuania | John I Albert (Jagiellonian) | 6,500,000 | 650 | HRE, OTT, RUS |
| `RUS` | Tsardom of Muscovy | Ivan III (Rurik dynasty) | 5,000,000 | 500 | POL, KAL |
| `KAL` | Kalmar Union | King John (House of Oldenburg) | 2,000,000 | 400 | HRE, RUS |

## Synchronization Architecture

- **Database (`countries` table)**:
  `SeedInitialData()` seeds or updates the 11 kingdoms with name, code, color, population, resources, and JSON border adjacency.
- **REST (`GET /api/countries?era=discovery` / `medieval`)**:
  Returns all sovereign realms with current ownership and stats.
- **WebSocket Tick**:
  Broadcasts updated state (`countries`, `troops`, `diplomacy`) on game loop cycles.
- **Frontend Geometry (`frontend/js/map/polygons.js`)**:
  Normalized `[0, 1]` polygon sets matching all 11 codes. Zero overlap between Spanish and Portuguese borders or between Scandinavian territories.


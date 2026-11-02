# world-map/era-expansion

> Model: 1.0.0 · Status: active

## Purpose

Defines the mathematical, geographical, and chronological rules by which the playable world expands across the 5 historical eras. Governs how territories increase by approximately 125% per era—introducing the Americas in the Age of Independence, Oceania (Australia & New Zealand) in the Age of Decolonisation, and scaling to 200 sovereign nations in the Modern Age while preserving historical secession costs against parent empires.

## Affects

Both

## Released/Intended SEMVER

- **Released:** 0.3.0
- **Intended:** 0.3.0
- Bump notes: Full global projection migration across all 5 historical eras: scaled territories from 11 discovery empires to 200 modern sovereign nations with aspect-preserved global projection, bounding-box hit testing, and database seeding.

## Ideas

- **Mathematical Growth Curve**: Scale territory count via an approximate 125% era-over-era addition:
  - **Era I: The Age of Discovery (c. 1500)**: 11 sovereign powers (Old World / Mediterranean maritime base).
  - **Era II: The Age of Revolt (1750–1859)**: 25 sovereign realms (+14 nations: European revolts, Dutch independence, early Atlantic breaks).
  - **Era III: The Age of Independence (1860–1919)**: 57 sovereign nations (+32 nations: adds North, Central, and South America alongside Italian/German unification).
  - **Era IV: The Age of Decolonisation (1920–1988)**: 128 sovereign nations (+71 nations: adds Australia, New Zealand, and post-colonial Africa, South Asia, and Southeast Asia).
  - **Era V: The Modern Age (1989–Present)**: 200 sovereign nations (+72 nations: post-Soviet republics, Balkan dissolutions, and contemporary global nation-states).
- **Global Projection Transition**:
  - Implement a dual-mode or continuous world projection: Discovery and Revolt eras use focused regional views or an antique world map projection; Independence expands to full global Mercator / Robinson / Natural Earth coordinates [0, 1].
  - Use `Path2D` path caching per country to render 200 polygon boundaries with sub-millisecond frametimes on HTML5 Canvas.
- **Americas Regional Composition (Era III — Age of Independence)**:
  - North America: United States (`USA`), Canada (`CAN`), Mexico (`MEX`), Cuba (`CUB`), Dominican Republic (`DOM`), Haiti (`HAI`).
  - Central America: Guatemala (`GUA`), Honduras (`HON`), El Salvador (`SLV`), Nicaragua (`NIC`), Costa Rica (`CRI`), Panama (`PAN`).
  - South America: Brazil (`BRA`), Argentina (`ARG`), Colombia (`COL`), Peru (`PER`), Venezuela (`VEN_SA`), Chile (`CHL`), Bolivia (`BOL`), Ecuador (`ECU`), Paraguay (`PAR`), Uruguay (`URY`).
- **Oceania & Afro-Asian Decolonisation (Era IV — Age of Decolonisation)**:
  - Oceania: Commonwealth of Australia (`AUS`), New Zealand (`NZL`), Papua New Guinea (`PNG`).
  - Asia: India (`IND`), Pakistan (`PAK`), Indonesia (`IDN`), Philippines (`PHL`), Vietnam (`VNM`), Myanmar (`MMR`), Malaysia (`MYS`).
  - Africa: Nigeria (`NGA`), South Africa (`ZAF`), Kenya (`KEN`), Ghana (`GHA`), Ethiopia (`ETH`), Congo (`COD`), Tanzania (`TZA`), Sudan (`SDN`).
- **Full Modern 200-Nation Roster (Era V — The Modern Age)**:
  - Completes the United Nations roster (193 member states + observers and key sovereign territories = 200 total nations).
  - Central Asia (Kazakhstan, Uzbekistan, etc.), Caucasus (Georgia, Armenia, Azerbaijan), Eastern Europe (Belarus, Moldova, Slovakia, etc.), and Pacific Island states.

## Concerns

- **Coordinate Space Expansion**: Current normalized coordinates in `polygons.js` map Western Europe to `[0.1, 0.6]`. Shifting to a global map means Europe must occupy approximately `[0.45, 0.25]` to `[0.60, 0.45]`, with the Americas occupying `[0.05, 0.20]` through `[0.35, 0.85]`, Asia spanning `[0.60, 0.88]`, and Australia/NZ at `[0.78, 0.65]` to `[0.92, 0.85]`.
- **Canvas Rendering Performance at 200 Countries**: Iterating 200 polygons with hit-testing on every mouse move or click requires bounding-box pre-filtering (`getPolygonBounds`) before raycasting.
- **Label Density and Overlap**: At 200 countries, small nations in Europe, the Caribbean, and Central America will have overlapping text labels unless dynamic zoom/pan or LOD (Level-of-Detail) decluttering is introduced.
- **Database Scalability**: The 15-second economy tick in `backend/internal/game/engine.go` currently queries all countries. At 200 countries, economy updates must skip unowned territories (which remain stagnant) so DB transaction time stays under 10ms.

## Issues

- **Aspect Distortion on Resizing**: `frontend/js/map/renderer.js` lines 29-31 scales `x * canvasWidth` and `y * canvasHeight` without aspect-ratio preservation, which will stretch global continents on ultra-wide monitors.
- **Single Canvas Coordinate Bounding**: `frontend/js/map/polygons.js` currently contains European and North African coordinates only; Americas, Oceania, and Sub-Saharan Africa polygons have not yet been defined in the normalized space.

## Result

- Successfully implemented the full 5-era global expansion progression:
  - Era I (Discovery c. 1500): 11 Founding Empires
  - Era II (Revolt 1750–1859): 25 Sovereign Realms (+14 nations)
  - Era III (Independence 1860–1919): 57 Sovereign Nations (+32 nations, introducing North, Central & South America)
  - Era IV (Decolonisation 1920–1988): 128 Sovereign Nations (+71 nations, introducing Australia, New Zealand, Papua New Guinea, Africa & Asia)
  - Era V (Modern Age 1989–Present): 200 Sovereign Nations (+72 nations, completing global UN membership coverage)
- Converted all 200 sovereign nations into normalized global coordinates $[x, y] \in [0, 1]$ mapped via $x = (\text{lon} + 180)/360$ and $y = (85 - \text{lat})/145$.
- Implemented aspect-ratio preserved letterboxed projection ($2.15:1$) in `renderer.js` and `geometry.js` guaranteeing 0 distortion across all monitor resolutions.
- Added bounding-box pre-filtering in `getKingdomAtPosition()` ensuring sub-millisecond click raycasting over 200 polygons.
- Updated Go database seeding in `database.go` with all 200 nations, populations, resources, and era metadata.


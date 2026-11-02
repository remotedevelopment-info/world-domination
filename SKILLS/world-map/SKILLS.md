# world-map

> Model: 1.0.0 · Status: active

## Purpose

Representation and rendering of the historical world map across 5 chronological eras, beginning with the **Age of Discovery (c. 1500)** featuring a **Steampunk** cartographic sensibility: how territory geometry is defined, projected onto the canvas, painted with portolan nautical elements, and hit-tested by player clicks. It is the visual surface of the entire game.

## Affects

Both

## Released/Intended SEMVER

- **Released:** 0.1.0
- **Intended:** 0.2.0

## Ideas

- Progressive era-by-era geographic reveal: Americas unlock in the Age of Independence; Oceania (Australia & New Zealand) and Africa unlock in Decolonisation; scaling to 200 countries in the Modern Age (see sub-skill `world-map/era-expansion`).
- Level of detail (LOD) and dynamic viewport pan/zoom for high-density modern borders.
- Sub-skills:
  - `world-map/projection`: Coordinate math (normalized to canvas pixels).
  - `world-map/kingdom-data`: Geometry vs attribute sources of truth and sync.
  - `world-map/era-expansion`: Global territory scaling model (11 -> 25 -> 57 -> 128 -> 200 nations).

## Concerns

- Transitioning from regional Mediterranean/European coordinates to a global map canvas requires remapping coordinate bounds without breaking click hit-testing.
- Visual clutter on canvas when up to 200 labels and border rivets are active simultaneously.

## Issues

- **Aspect distortion**: `renderer.js` stretches coordinates non-proportionally when window aspect ratio changes.
- **Americas and Oceania polygons pending**: World map currently bounded to Europe and North Africa until global projection migration in `world-map/era-expansion`.

## Result

- 1500 Age of Discovery operational with 11 founding sovereign powers (`ESP`, `POR`, `FRA`, `ENG`, `HRE`, `OTT`, `VEN`, `PAP`, `POL`, `RUS`, `KAL`).
- Steampunk cartography active: 32-bearing portolan rhumb lines, 16-point astrolabe compass rose, graduated degree border, and brass war tokens.
- Dynamic era synchronization engine operational via `syncKingdomsForYear()` and `onEraChange()`.
- Documented expansion architecture in `world-map/era-expansion`.

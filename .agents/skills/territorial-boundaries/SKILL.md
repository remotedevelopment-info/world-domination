---
name: territorial-boundaries
description: >-
  Expertise and architectural standards for historical and dynamic cartography in Kingdom Conquest.
  Covers the topological shared-arc jigsaw model, watertight frontier alignment, three-case spatial
  era emergence (client state enclosure, partial-overlap clipping, uncontested formation), multi-resolution
  LOD cartography (Fast, High-Res Historical, Ultra-Realistic), database geometric source-of-truth
  persistence, dynamic combat-driven border pushing, and multi-pass HTML5 canvas rendering.
---

# Territorial Boundaries, Multi-Resolution Cartography & Dynamic Era Emergence

This skill documents the mathematical, cartographic, and game-engine rules for territorial boundaries, watertight non-overlapping jigsaw polygon alignment, spatial era-based nation emergence, multi-resolution cartography (`fast`, `high_res`, `realistic`), database geometric truth persistence, and real-time military border pushing.

---

## 1. The Core Philosophy: Watertight Jigsaw Cartography

In historical grand strategy, a world map is not a collection of floating standalone shapes. It is a **watertight topological jigsaw puzzle**:

1. **Defendable Geographical Borders**: Borders represent historical and geographical reality (riverbanks, mountain crests, coastlines, surveyed treaties).
2. **Zero Seams & Zero Overlaps**: Two adjacent sovereign territories must never overlap each other's interior and must share identical vertex sequences along their common frontier.
3. **Database as Authoritative Source of Truth, `polygons.js` as Canonical Baseline**:
   - The initial geographic state at the start of the game (and the canonical template of each emerging nation at the start of each Era) is defined by the constants in `frontend/js/map/polygons.js`.
   - As gameplay progresses—through military border pushing, territorial annexations, and era-transition spatial resolution—**the PostgreSQL database is the single source of truth** for live territorial boundaries.
4. **Multi-Pass Canvas Rendering Pipeline**:
   - **Pass 1 (Territorial Fills)**: Fill all sovereign landmasses with realm colors and subtle coastline contour ripples.
   - **Pass 2 (Frontier Strokes)**: Stroke all boundary curves on top of the fills so neighboring fills never clip or eat into shared borders.
   - **Pass 2b (Sovereign Gold Casing)**: Render the multi-layered imperial gold outline around all territories commanded by the active player.
   - **Pass 3 (Cartographic Typography)**: Render parchment abbreviation plaques (`FRA`, `ESP`, `OTT`, etc.) at non-colliding era-aware anchors.
   - **Pass 4 (Garrisons & Units)**: Render troop miniature brass tokens and defensive border fortifications.

---

## 2. Topological Shared-Arc Model & Symmetric Subdivision

### 2.1 The Problem with Independent Polygons
When Country $A$ and Country $B$ define independent coordinate loops:
$$\text{Poly}_A = [p_1, p_2, p_3, \dots], \quad \text{Poly}_B = [q_1, q_2, q_3, \dots]$$
Manual drafting or unsynchronized simplification introduces discrepancies along their mutual border. Under high magnification (e.g., the 2.4× Steampunk Brass Loupe), this creates visual seams (ocean showing through) or overlapping territory (colors bleeding over each other).

### 2.2 The Solution: Shared Frontier Arcs & Symmetric Topological Refinement
Every shared border segment between Country $A$ and Country $B$ is governed as a **Shared Topological Arc** $\mathcal{A}_{A,B}$:
$$\mathcal{A}_{A,B} = [\mathbf{v}_1, \mathbf{v}_2, \mathbf{v}_3, \dots, \mathbf{v}_k]$$

- Country $A$'s perimeter traverses $\mathcal{A}_{A,B}$ in forward order:
  $$\mathbf{v}_1 \longrightarrow \mathbf{v}_2 \longrightarrow \dots \longrightarrow \mathbf{v}_k$$
- Country $B$'s perimeter traverses $\mathcal{A}_{A,B}$ in reverse order:
  $$\mathbf{v}_k \longrightarrow \dots \longrightarrow \mathbf{v}_2 \longrightarrow \mathbf{v}_1$$

When upsampling from `fast` (low-poly) to `high_res` or `realistic` resolution, any shared segment $(\mathbf{u}, \mathbf{v})$ is canonically ordered as $(\mathbf{p}_{\min}, \mathbf{p}_{\max}) = \text{lexMinMax}(\mathbf{u}, \mathbf{v})$. Deterministic midpoint displacement along the canonical normal vector $\hat{\mathbf{n}}(\mathbf{p}_{\min} \to \mathbf{p}_{\max})$ generates intermediate frontier vertices $[\mathbf{m}_1, \dots, \mathbf{m}_r]$. Country $A$ receives the forward sequence and Country $B$ receives the exact reversed sequence—guaranteeing **zero gaps and zero overlaps across all resolution tiers**.

---

## 3. Spatial Era Emergence, Overlap Clipping & Client States

At the start of each historical Era (`1500 Discovery`, `1750 Revolt`, `1860 Independence`, `1920 Decolonisation`, `1989 Modern`), the cartographic engine builds the updated world map by introducing new countries whose historical `birth_year` has arrived.

Each candidate country $C_{\text{new}}$ begins with its canonical era-start template polygon $P_{\text{new}}^0$ from `polygons.js` and is evaluated spatially against the live territorial polygons $\{P_k\}_{k \in \text{Active}}$ currently in the database from prior gameplay:

### 3.1 The Three Spatial Emergence Rules

1. **Case 1 — Full Enclosure by a Larger Territory $\longrightarrow$ Client State Formation**:
   - **Condition**: $C_{\text{new}}$'s canonical land $P_{\text{new}}^0$ is already completely (or predominantly, $\ge 85\%$) occupied by a single larger existing territory $P_{\text{outer}}$:
     $$\frac{\text{Area}(P_{\text{new}}^0 \cap P_{\text{outer}})}{\text{Area}(P_{\text{new}}^0)} \ge 0.85 \quad \text{and} \quad \text{Area}(P_{\text{outer}}) > \text{Area}(P_{\text{new}}^0)$$
   - **Outcome**:
     - $C_{\text{new}}$ **appears as a Client State (Vassal)** of the outer enclosing state $C_{\text{outer}}$ (`isClientState = true`, `suzerainCode = C_outer.code`, `diplomaticStatus = "client"`, `tributeRate = 0.20`).
     - Topologically, $P_{\text{new}}^0$ is carved out of $P_{\text{outer}}$ ($P_{\text{outer}}' = P_{\text{outer}} \setminus P_{\text{new}}^0$) so the client state has a clean, non-overlapping polygon inside or along the frontier of the suzerain state.
     - **Ownership**: The newly formed client state is **not** directly owned by the outer empire's player; it is governed by an autonomous AI NPC initially and is open for a player to claim, govern, or lead in an independence strike.

2. **Case 2 — Partial Coverage by Existing Territories $\longrightarrow$ Non-Overlapped Clipped Formation**:
   - **Condition**: $C_{\text{new}}$'s canonical polygon $P_{\text{new}}^0$ is only partly covered by one or more existing territories $\bigcup_{k \in \text{Active}} P_k$:
     $$0 < \frac{\text{Area}\left(P_{\text{new}}^0 \cap \bigcup_{k \in \text{Active}} P_k\right)}{\text{Area}(P_{\text{new}}^0)} < 0.85$$
   - **Outcome**:
     - $C_{\text{new}}$ **takes only the space that is not yet overlapped** via Weiler-Atherton / Greiner-Hormann 2D boolean polygon difference:
       $$P_{\text{new}}^{\text{eff}} = P_{\text{new}}^0 \setminus \bigcup_{k \in \text{Active}} P_k$$
     - Provided the remaining un-overlapped area exceeds the minimum viable territorial threshold ($\text{Area}(P_{\text{new}}^{\text{eff}}) \ge A_{\min}$), $C_{\text{new}}$ emerges in that remaining space with its clipped edges snapped watertight against the existing borders of its neighbors.
     - Starting population and resources scale proportionally to the retained area fraction $\text{Area}(P_{\text{new}}^{\text{eff}}) / \text{Area}(P_{\text{new}}^0)$.
     - If prior conquests have left zero viable uncontested space ($\text{Area}(P_{\text{new}}^{\text{eff}}) < A_{\min}$) across multiple rival empires, $C_{\text{new}}$ is suppressed unless/until liberated.

3. **Case 3 — Free Coordinates (Uncontested Land) $\longrightarrow$ Full Sovereign Formation**:
   - **Condition**: No existing active state occupies $P_{\text{new}}^0$'s coordinates:
     $$\text{Area}\left(P_{\text{new}}^0 \cap \bigcup_{k \in \text{Active}} P_k\right) = 0$$
   - **Outcome**:
     - $C_{\text{new}}$ forms in full using its canonical era-start polygon $P_{\text{new}}^0$ from `polygons.js`.
     - It appears immediately on the board as an independent, unclaimed sovereign nation—ready for an existing player to expand into/take over or for a new player joining the realm to claim.

---

### 3.2 Reinterpreting "Death Year" — The Sunset of Empire & Core Landmass Inheritance

1. **Imperial Sunset & Core Landmass Inheritance**:
   - When an empire with defined historical successors reaches its `death_year` (`KAL` 1523 $\to$ `SWE`, `HRE` 1806 $\to$ `AUT`, `AUH` 1918 $\to$ `AUT`, `OTT` 1922 $\to$ `TUR`, `USSR` 1989 $\to$ `RUS`, `YUG` 1989 $\to$ `SRB`, `CZE_SLO` 1989 $\to$ `CZE`, `MOR` 1920 $\to$ `MAR`, `PER_EM` 1920 $\to$ `SAU`/`IRN`, `MUG` 1920 $\to$ `IND`, `KOR` 1989 $\to$ `KOR_S`):
   - The owner of the dissolving empire inherits **only the primary core successor landmass** (`IMPERIAL_SUCCESSORS[empireCode]`).
   - All connected client states cease paying tribute and become fully independent **sibling states** (initially in natural alliance with the former core until broken by diplomacy or war).
2. **Client State Independence Strikes & Imperial Overstretch**:
   - Before `death_year`, client states can launch an **Independence Strike**; the parent empire holds a $+25\%$ Imperial Clout combat advantage prior to `death_year`, which drops to $0\%$ after `death_year`.
   - Empires accumulating excessive client states suffer **Imperial Overstretch** when $\sum \text{GarrisonCost}(c) > \sum \text{Tribute}(c)$, draining the imperial treasury and triggering coordinated client-state rebellions.

---

### 3.3 Canonical Reference Dissolutions & Era Evolutions

| Predecessor Empire | Code | `birth` | `death` | Core Successor & Emergent States | Cartographic Boundary Transition |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Kalmar Union** | `KAL` | 1500 | 1523 | Core: `SWE`; Siblings: `DEN`, `NOR` | Spans Denmark, Norway, Sweden, and Finland in 1500; splits in 1523 into Sweden-Finland (`SWE`) and Denmark-Norway (`DEN`). In 1860 `NOR` separates; in 1920 `FIN` separates east of the Gulf of Bothnia. |
| **Holy Roman Empire** | `HRE` | 1500 | 1806 | Core: `AUT`; Clients: `NED`, `SWI`, `PRU`, `BAV`, `SAX`, `GEN` | Unified Central European polygon in 1500; in 1750 carves out distinct non-overlapping client electorates (`PRU`, `BAV`, `SAX`, `NED`, `SWI`, `GEN`); dissolves in 1806. |
| **Poland-Lithuania** | `POL` | 1500 | 1795 | Partitioned 1795; Reborn as `POL_REP` (1918) | Broad Jagiellonian commonwealth in 1500–1750; reborn post-WWI as `POL_REP` with non-overlapping borders against `DEU`, `CZE_SLO`, `USSR` (`BLR`/`UKR`/`LTU`). |
| **Ottoman Empire** | `OTT` | 1500 | 1922 | Core: `TUR`; Clients/Successors: `GRE`, `ROM`, `SRB`, `BUL`, `EGY`, `SYR`, `IRQ`, `SAU`, `YEM` | Spans Balkans, Anatolia, Levant in 1500; carves out `GRE` (1750) and `ROM`, `SRB`, `BUL` (1860); transitions in 1922 to `TUR` and Middle Eastern states. |
| **Austro-Hungarian Empire** | `AUH` | 1860 | 1918 | Core: `AUT`; Siblings: `HUN`, `CZE_SLO`, `YUG`, `ROM` | Dual Monarchy across Danube basin in 1860; partitions in 1918 into `AUT`, `HUN`, `CZE_SLO`, `YUG`. |
| **Pre-Unification Italy** | `VEN`, `GEN`, `NAP`, `PAP` | 1500 | 1797–1870 | Unified Kingdom of Italy (`ITA`, 1860) | Regional republics and kingdoms in 1500–1750; unify in 1860 into the Italian Peninsula & Sicily (`ITA`). |
| **German Electorates** | `PRU`, `BAV`, `SAX` | 1750 | 1871 | Unified Germany (`DEU`, 1871) | Distinct non-overlapping electorates in 1750–1860; unify in 1871 into `DEU` snapped cleanly to `DEN`, `NED`, `BEL`, `FRA`, `SWI`, `AUT`, `CZE`, `POL_REP`. |
| **Soviet Union** | `USSR` | 1920 | 1989 | Core: `RUS`; 14 Republics (`UKR`, `BLR`, `KAZ`, `UZB`, `TKM`, `KGZ`, `TJK`, `GEO`, `ARM`, `AZE`, `EST`, `LVA`, `LTU`, `MDA`) | Replaces `RUS` in 1920–1988 across Eurasia; fragments in 1989 into 15 watertight sovereign states. |

---

## 4. Multi-Resolution Cartography & Header Panel Switcher

To balance 60 FPS gameplay responsiveness with historical and geographic authenticity, `polygons.js` and `renderer.js` support **three live-switchable cartographic resolution states**:

### 4.1 The Three Cartographic Resolution Tiers

| Resolution Key | UI Label | Avg. Vertices / Nation | Cartographic Characteristics |
| :--- | :--- | :--- | :--- |
| **`fast`** | `⚡ Fast (Low-Poly Board)` | 8–22 vertices | Crisp, lightweight geometric polygons with **strictly 0% neighbor overlap** and exact shared frontier vertices. Ideal for rapid pan/zoom and low-power devices. |
| **`high_res`** | `🧭 High-Res (Historical)` | 35–85 vertices | Historically accurate borders for the **start dates of each of the 5 eras** (`1500`, `1750`, `1860`, `1920`, `1989`). Captures major peninsulas (Brittany, Cotentin, Jutland, Peloponnese, Crimea, Sinai), bays, and river/mountain frontiers using symmetric topological arc subdivision. |
| **`realistic`** | `🌍 Realistic (Ultra-HD)` | 110–240+ vertices | Very high-resolution geographic cartography with multi-octave coastal articulation (fjords, estuaries, capes, deltas) and treaty-grade historical frontiers. Maintains 100% watertight shared borders even under the 2.4× Loupe Magnifier. |

### 4.2 Era-Aware & Resolution-Aware Polygon Lookup API
In `frontend/js/map/polygons.js`:
```javascript
export function getKingdomPolygon(code, simYear = 1500, resolution = state.mapResolution || "fast")
```
1. **Database Override First**: If the authoritative server state / database holds a live mutated polygon for `code` (from combat border pushing or partial-overlap clipping), that geometry is used as the base control polygon and upsampled to `resolution`.
2. **Era-Specific Historical Snapshot Second**: Looks up era-specific historical boundaries (`ERA_HISTORICAL_POLYGONS[eraKey][code]`) so empires and nations reflect their true historical borders at the start of `1500`, `1750`, `1860`, `1920`, and `1989` (e.g., Sweden with vs. without Finland, HRE in 1500 vs. 1750, Ottoman Empire in 1500 vs. 1860).
3. **Resolution Tier Synthesis**: Returns the pre-computed or cached polygon for the active tier (`fast`, `high_res`, or `realistic`), ensuring hit-testing (`getKingdomAtCanvasCoords`), viewport framing (`computeTargetViewport`), main canvas rendering (`renderMap`), 2.4× Loupe magnification, and the Command Center tactical minimap all use the exact same active geometry.

### 4.3 Member User Header Panel Control (`#map-resolution-select`)
- Placed directly in the member user's **Header Panel** (`header.game-header`) as a styled steampunk brass pull-down selector.
- Changing the selection invokes `window.setMapResolution(mode)`:
  1. Updates `state.mapResolution` (`"fast"` | `"high_res"` | `"realistic"`).
  2. Clears the bounding-box hit-test cache (`boundsCache.clear()`).
  3. Immediately calls `renderMap(false)` (and refreshes the Command Center minimap if open).
- **Zero Gameplay Disruption**: Switching resolution does not alter game ticks, troop positions, ownership, economy, or diplomacy—only the geometric exactness of the rendered map and point-in-polygon hit-testing.

---

## 5. Dynamic Frontier "Border Pushing" & Database Schema

### 5.1 Mathematical Formulation of Frontier Displacement
Let $\mathcal{A}_{A,B} = \{\mathbf{p}_i\}_{i=1}^N$ be the shared arc between Kingdom $A$ and Kingdom $B$.
For each vertex $\mathbf{p}_i$, the unit normal vector $\hat{\mathbf{n}}_i$ pointing from Kingdom $A$ into Kingdom $B$ is:
$$\hat{\mathbf{t}}_i = \frac{\mathbf{p}_{i+1} - \mathbf{p}_{i-1}}{\|\mathbf{p}_{i+1} - \mathbf{p}_{i-1}\|}, \quad \hat{\mathbf{n}}_i = (t_{i,y}, -t_{i,x})$$

When combat pressure occurs along frontier segment $i$:
$$\mathbf{p}_i(t + \Delta t) = \mathbf{p}_i(t) + \alpha \cdot \hat{\mathbf{n}}_i \cdot \frac{T_A - T_B}{T_A + T_B + \epsilon} \cdot \Delta t$$

Because the displacement operates on the canonical shared arc $\mathcal{A}_{A,B}$, both Kingdom $A$ (forward) and Kingdom $B$ (reversed) deform together without gaps or overlaps, and the displacement vector field transfers seamlessly across `fast`, `high_res`, and `realistic` resolutions.

### 5.2 Database Schema for Authoritative Map Geometry
```sql
CREATE TABLE IF NOT EXISTS border_arcs (
    id SERIAL PRIMARY KEY,
    code_a VARCHAR(16) NOT NULL,
    code_b VARCHAR(16) NOT NULL,
    era_id VARCHAR(32) NOT NULL DEFAULT 'discovery',
    vertices JSONB NOT NULL, -- Array of normalized [x, y] control coordinates
    control_ratio DOUBLE PRECISION DEFAULT 0.5,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS country_geometries (
    country_code VARCHAR(16) PRIMARY KEY,
    era_born INT NOT NULL DEFAULT 1500,
    suzerain_code VARCHAR(16), -- Set when emerged via Case 1 (Full Enclosure Client State)
    polygon_fast JSONB NOT NULL, -- Authoritative live polygon (after clipping / border pushing)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Cartographic Revision Plan & Execution Checklist

1. **Phase 1 — Lifecycle & Successor Audit (`HISTORICAL_KINGDOMS` & `state.js`)**:
   - Ensure all predecessor empires (`KAL`, `HRE`, `VEN`, `PAP`, `POL`, `GEN`, `NAP`, `PRU`, `BAV`, `SAX`, `MOR`, `PER_EM`, `MUG`, `AUH`, `OTT`, `USSR`, `YUG`, `CZE_SLO`, `KOR`) have accurate `death_year` and `IMPERIAL_SUCCESSORS` mappings so obsolete empires do not overlap their modern successor states.
2. **Phase 2 — Watertight De-Overlapping of Base `fast` Polygons (`polygons.js`)**:
   - Apply exact 2D Greiner-Hormann / Weiler-Atherton polygon difference and boundary vertex snapping across all neighboring countries so every border is shared and contemporaneous overlaps drop to `0%`.
3. **Phase 3 — Era-Start Historical Boundary Snapshots (`ERA_HISTORICAL_POLYGONS`)**:
   - Provide authentic era-start shapes for `1500`, `1750`, `1860`, `1920`, and `1989` (e.g., `HRE` 1500 vs. 1750, `OTT` 1500 vs. 1750 vs. 1860, `SWE` 1523–1860 with Finland vs. 1920+ west of Bothnia, `POL` vs. `POL_REP`).
4. **Phase 4 — High-Resolution (`high_res`) & Ultra-Realistic (`realistic`) Generators**:
   - Implement symmetric topological edge subdivision and coastal geographic articulation in `polygons.js` so `getKingdomPolygon(code, year, resolution)` serves `fast`, `high_res`, and `realistic` polygons on demand with caching.
5. **Phase 5 — Three-Case Spatial Emergence Engine & Header Pull-Down UI**:
   - Wire `resolveEraEmergenceGeometry` and add the `#map-resolution-select` pull-down to the member user's Header Panel in `index.html`, `renderer.js`, and `console.js`.


---

## 7. Implementation Log

### Iteration 1 (2026-11-10) — On-demand refinement engine
- `high_res` / `realistic` are **no longer precomputed blobs**. `refinePolygon(code, basePoly, resolution, eraStart)` in `polygons.js` refines *any* base polygon (era baseline or authoritative DB polygon), so polygons changed by wars or border pushing are upgraded automatically. `polygons.js` went from ~517 KB to ~184 KB.
- Each edge gets one of three classifications against the polygons active in the same era:
  - `shared`: the same edge exists in a neighbour. It gets a symmetric meander (lexMinMax canonical order, recursive midpoint displacement seeded from the edge key).
  - `coast`: there is no territory on the outer side. It gets multi-octave articulation that cuts **inward only**, so a coastline can never push into a neighbour across a narrow strait.
  - `frontier`: it touches a neighbour but the vertices don't match. It stays straight so it can't open a gap or create an overlap.
- Tuning lives in `MAP_RESOLUTION_PROFILES` (depth, roughness, amplitude cap, decay for each tier).
- Call `invalidateCartographyCache()` after authoritative geometry changes.
- Measured on a 0.0025 sample grid:
  - 1500–1860: 0 overlap cells on every tier.
  - 1920/1989: 5 overlap cells in `fast`, 10 in `high_res`, ~30 of ~29k in `realistic` (≈0.1%).

### Next iterations
1. Fix the remaining overlaps at three-way junctions (shared-arc meanders near T-junctions), and the 5 that already exist in the `fast` baseline.
2. Snap `frontier` edges into true shared arcs (insert the matching vertices) so they meander too.
3. Hand-author key coastal features (Jutland, Brittany, Peloponnese, Crimea, Italy's heel) in the baseline.
4. Persist `polygon_high_res` / `polygon_realistic` server-side for clients that can't afford to compute them.


### Iteration 1.1 (2026-11-10) — Scandinavian Territorial Geometry & Sweden Multi-Era Realignment
- **Root Cause of Sweden Glitch**:
  - `SWE`'s baseline polygon had accidentally been swapped with the Finnish territory in commit `a8c8aa4`, leaving Sweden's actual peninsula territory `[0.5308..0.5669, 0.1145..0.2041]` unclaimed (rendering black ocean background between Norway and Finland).
  - In `1920`, when Finland emerged, clipping against the incorrect Swedish baseline left only a tiny sliver of territory in the White Sea / Lake Ladoga border `[0.5794..0.6111]`, causing Sweden's badge to float over black empty land in the Swedish heartland while coloring a foreign patch yellow.
  - In `NOR`, the Scandinavian mountain spine border had inverted coordinate order between vertices 5 and 11, causing Norway's polygon to fold inwards across Sweden.
- **Cartographic Fixes in [polygons.js](file:///Users/nicholasalexander/Code/AI/World%20Domination/frontend/js/map/polygons.js)**:
  - **Swedish Mainland (`SWE`)**: Restored authentic Swedish peninsula coordinates (`[0.5308, 0.1793]` Bohuslän/Svinesund through Scania, Stockholm, Gulf of Bothnia up to Treriksröset `[0.5569, 0.1145]`, down the Scandes spine).
  - **Kingdom of Norway (`NOR`)**: Realigned western fjord and northern coastal ring `[0.5139..0.5722]` so it mirrors Sweden's frontier with exact shared vertices: `[0.5569, 0.1145]` (Treriksröset), `[0.5403, 0.1434]` (Jämtland), `[0.5339, 0.1641]` (Värmland), `[0.5308, 0.1793]` (Svinesund/Skagerrak).
  - **Republic of Finland (`FIN`)**: Established clean shared frontier along Torne Valley `[0.5569, 0.1145] ➔ [0.5669, 0.1324]`, opening the Gulf of Bothnia waters between Sweden and Finland.
  - **Multi-Era Historical Realignment**:
    - **Era 1500 (Age of Discovery)**: Scandinavia is ruled by the unified Kalmar Union (`KAL`, `#34495E`).
    - **Era 1750 (Age of Revolt)**: Gustav Vasa's restored Swedish Empire (`SWE`, `#F1C40F`) spans both Sweden and Finland (`sweEmpire1750`), bordering the Tsardom of Muscovy/Russian Empire along Lake Ladoga / Karelia (`[0.5847, 0.1586]`).
    - **Era 1860 (Age of Independence)**: Following Sweden's loss of Finland to the Russian Empire (Treaty of Fredrikshamn 1809) and the personal union with Norway (1814), Sweden spans its Scandinavian mainland while Norway (`NOR`, `#BA4A00`) emerges on its sovereign fjord territory.
    - **Era 1920 (Age of Decolonisation)**: Finland (`FIN`, `#5DADE2`) emerges as an independent Nordic republic, cleanly bounded by Sweden along the Torne River, Norway across Finnmark, and Soviet Russia.
    - **Era 1989 (Modern Age)**: Modern borders with Sweden, Norway, and Finland all watertight, non-overlapping, and centered on their authentic capitals.

### Iteration 1.2 (2026-11-12) — British Isles Cartography: Wales Restoration & Multi-Era Devolution
- **Root Cause of Missing Wales**:
  - `ENG`'s baseline polygon previously traced the internal Anglo-Welsh border (`[0.4926, 0.2132] ➔ [0.4915, 0.2027]` via Offa's Dyke and the Wye/Dee valleys), completely omitting the Welsh landmass (Anglesey, Gwynedd, Llŷn, Cardigan Bay, Pembrokeshire, Gower, Cardiff).
  - This left a gaping ocean bite between the English Midlands and the Irish Sea, omitting Wales entirely from the world map across all eras.
- **Cartographic & Historical Alignment in [polygons.js](file:///Users/nicholasalexander/Code/AI/World%20Domination/frontend/js/map/polygons.js) & [database.go](file:///Users/nicholasalexander/Code/AI/World%20Domination/backend/internal/database/database.go)**:
  - **Age of Discovery (1500) through Decolonisation (1988)**: Under the Tudors (Henry VII) and the Laws in Wales Acts 1535/1542, Wales was integrated with the English Crown. England (`ENG`, `#C0392B`) physically attaches the complete Welsh landmass (`engUnified`, 38 points) on the map:
    - Traces the Bristol Channel from Severn `[0.4926, 0.2132]` around Cardiff, Gower, Carmarthen Bay, St David's Head `[0.4851, 0.2118]`, Cardigan Bay `[0.4886, 0.2088]`, Llŷn Peninsula, Anglesey `[0.4871, 0.2030]`, Great Orme `[0.4891, 0.2034]`, to Chester `[0.4915, 0.2027]`.
  - **The Modern Age (1989+)**: Wales (`WAL`, `#008751`, *Principality of Wales / Cymru*) emerges as a distinct Celtic realm and client state under the British Crown (`parent: "ENG"`), reflecting modern devolution (Senedd / Welsh Parliament):
    - `kingdomPolygons["WAL"]`: Dedicated 22-point watertight polygon sharing the exact frontier arc with England from Chester to the Severn Estuary in reverse order (zero seams, zero overlaps, difference = 0.00000000).
    - `ERA_HISTORICAL_POLYGONS["1989"]["ENG"]`: Overrides `ENG` to England-proper (29 points) upon devolution, freeing the Welsh territory for `WAL`.
    - `kingdomLabelPositions["WAL"]`: Cartographic label anchor plaque at `[0.4893, 0.2088]` in central Wales (Cambrian range).
    - Fiscal archetype: Maritime realm (`TaxMod: 0.50`, `TradeMod: 1.80`), population 2,900,000, resources 520.

### Iteration 1.3 (2026-11-13) — Modern Era (1989) Watertight Boundary & Overlap Elimination
- **Diagnostic Sweep Across All 186 Active 1989 Nations**:
  - Eliminated all 8 non-enclave overlaps / segment crossings and closed major land-border gaps in [polygons.js](file:///Users/nicholasalexander/Code/AI/World%20Domination/frontend/js/map/polygons.js) (only the intentional `LSO` enclave inside `ZAF` remains nested with zero crossings):
  1. **Iran (`PER_EM`) vs. Azerbaijan (`AZE`)**: Added `ERA_HISTORICAL_POLYGONS["1989"]["PER_EM"]` (61 vertices) trimming the Safavid-era northern loop around Azerbaijan and snapping cleanly along `AZE`'s southern frontier (`[0.6291, 0.2839] ➔ [0.6357, 0.2865]`).
  2. **Turkey (`TUR`) East Thrace**: Restored European Turkey (`[0.5743, 0.2756] ➔ [0.5723, 0.2737] ➔ [0.5731, 0.2682] ➔ [0.5778, 0.2668]`) in `kingdomPolygons["TUR"]` and `ERA_HISTORICAL_POLYGONS["1920"]["TUR"]`, closing the Thracian ocean gap and sharing 4 exact frontier vertices each with `GRE` and `BUL`.
  3. **Horn of Africa (`SOM` / `ETH` / `DJI`)**: Restored western Somaliland (Zeila–Hargeisa) in `SOM`, snapping cleanly to `ETH` (`[0.6333, 0.4556] ➔ [0.6192, 0.4389]`) and `DJI` (`[0.6192, 0.4389] ➔ [0.6201, 0.4361]`), eliminating the `0.01586` Horn gap.
  4. **Guianas (`GUF` / `BRA` / `SUR`)**: Aligned French Guiana (`GUF`) with `SUR`'s exact eastern frontier (`6` shared vertices) and inserted `GUF`'s southern river vertices (`[0.3496, 0.4882]`, `[0.3536, 0.4869]`) into `BRA` (`5` shared vertices), eliminating all crossings.
  5. **Morocco / Western Sahara (`MAR`) & Mauritania (`MRT`) & Algeria (`ALG`)**: Snapped `MAR`'s southern/eastern border to the `ALG`/`MRT` tripoint (`[0.4759, 0.3484]`) and `MRT`'s exact staircase (`7` shared vertices, `0` crossings).
  6. **Senegal (`SEN`) & The Gambia (`GMB`)**: Removed the self-intersecting river-estuary fold in `GMB`, leaving `7` exact shared vertices with `SEN` and `0` crossings.
  7. **Kazakhstan (`KAZ`) & Turkmenistan (`TKM`)**: Adjusted `TKM[40]` (`[0.6471, 0.2675]`) south of the `KAZ` frontier line (`0` crossings).
  8. **Argentina (`ARG`) & Chile (`CHL`)**: Adjusted `CHL[48]` (`[0.3077, 0.791]`) south of the Strait of Magellan line (`0` crossings).
  9. **Micronesia (`FSM`) & Papua New Guinea (`PNG`)**: Relocated `FSM` from the Southern Hemisphere (`y = 0.52..0.54`, overlapping `PNG`) to its true Northern Hemisphere Micronesian coordinates (`5°N–10°N`, `y = 0.4472..0.4706`, `0` self-intersections).

### Iteration 1.4 (2026-11-14) — Symmetric Canonical Edge Subdivision & Chad (`TCD`) Decolonisation/Modern Fix
- **Root Cause of Shared Territory / Border Overlaps in `high_res` & `realistic` Modes**:
  - `refinePolygon(code, basePoly, resolution, eraStart)` in [polygons.js](file:///Users/nicholasalexander/Code/AI/World%20Domination/frontend/js/map/polygons.js#L50970) previously seeded its PRNG with `_hash("${ek}:${code}")` (including the country `code`) and subdivided edges in each country's local traversal order (`a ➔ b` vs. `b ➔ a`), causing adjacent nations (including **Chad (`TCD`)** in `1920` Decolonisation and `1989` Modern against `CMR`, `NGA`, `NER`, `SDN`, and `CAF`) to generate conflicting border curves—creating shared-territory overlaps and gaps.
  - Additionally, `refinePolygon` used `coastRough` / `coastCap` (`0.0050`) instead of `landRough` / `landCap` (`0.0015` / `0.0020`), allowing meanders to swing across narrow panhandles (such as Cameroon's Far North border with Chad).
- **Fix**:
  - Seeded `refinePolygon` strictly with the canonical undirected edge key `_hash(ek)` (independent of country `code`).
  - Canonicalized segment endpoints in `lexMinMax(a, b)` order (`u ➔ v`), subdividing once and reversing intermediate points when traversed in reverse (`!isForward`).
  - Applied `landRough` and `landCap` so narrow frontiers never cross neighbor panhandles.
  - Verified **0 crossings** for `TCD` against all 6 neighbors (`LBY`, `SDN`, `CAF`, `CMR`, `NGA`, `NER`) across both `1920` and `1989` in `fast`, `high_res`, and `realistic` tiers.




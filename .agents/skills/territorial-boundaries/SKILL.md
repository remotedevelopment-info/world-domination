---
name: territorial-boundaries
description: >-
  Expertise and architectural standards for historical and dynamic cartography in Kingdom Conquest.
  Covers the topological shared-arc jigsaw model, watertight frontier alignment, era-by-era emergence
  and dissolution rules, dynamic combat-driven border pushing, and multi-pass HTML5 canvas rendering.
---

# Territorial Boundaries & Dynamic Frontier Cartography

This skill documents the mathematical, cartographic, and game-engine rules for territorial boundaries, jigsaw polygon alignment, era-based nation emergence, and real-time military border pushing.

---

## 1. The Core Philosophy: Jigsaw Cartography

In historical grand strategy, a world map is not a collection of floating standalone shapes. It is a **watertight topological jigsaw puzzle**:

1. **Defendable Borders**: Borders represent geographical reality (riverbanks, mountain crests, coastlines, surveyed frontiers).
2. **Zero Seams & Zero Overlaps**: Two adjacent nations must share the exact same mathematical boundary curve.
3. **Multi-Pass Canvas Pipeline**:
   - **Pass 1 (Territorial Fills)**: Fill all sovereign landmasses with realm colors and coastline contour glow.
   - **Pass 2 (Frontier Strokes)**: Stroke all boundary curves on top of the fills. Neighboring fills never clip or eat into shared strokes.
   - **Pass 3 (Cartographic Typography)**: Render parchment abbreviation badges (`FRA`, `ESP`, etc.) if labels are toggled on.
   - **Pass 4 (Garrisons & Units)**: Render troop miniature brass tokens and defensive border rivets.

---

## 2. Topological Shared-Arc Model

### The Problem with Independent Polygons
When Country $A$ and Country $B$ define independent coordinate loops:
$$\text{Poly}_A = [p_1, p_2, p_3, \dots], \quad \text{Poly}_B = [q_1, q_2, q_3, \dots]$$
Floating-point rounding and manual drafting introduce slight discrepancies along their mutual border. Under high magnification (e.g. 2.4× Loupe), this creates visual seams (ocean showing through) or overlapping territory (colors bleeding over each other).

### The Solution: Shared Frontier Arcs (TopoJSON Style)
Every shared border segment between Country $A$ and Country $B$ is defined once as a **Shared Arc** $\mathcal{A}_{A,B}$:
$$\mathcal{A}_{A,B} = [\mathbf{v}_1, \mathbf{v}_2, \mathbf{v}_3, \dots, \mathbf{v}_k]$$

- Country $A$'s perimeter traverses $\mathcal{A}_{A,B}$ in forward order:
  $$\mathbf{v}_1 \longrightarrow \mathbf{v}_2 \longrightarrow \dots \longrightarrow \mathbf{v}_k$$
- Country $B$'s perimeter traverses $\mathcal{A}_{A,B}$ in reverse order:
  $$\mathbf{v}_k \longrightarrow \dots \longrightarrow \mathbf{v}_2 \longrightarrow \mathbf{v}_1$$

Because both countries evaluate the identical mathematical sequence, **overlap and gaps are mathematically impossible**.

---

## 3. Era Emergence & Empire Dissolution

### 3.1 Era Baseline Lifecycle
Every country has historical lifecycle metadata:
- `birth_year`: The historical year when the sovereign nation emerges.
- `death_year`: The historical year when an empire dissolves or unifies into successor states.
- `unlock_era`: The era (`discovery`, `revolt`, `independence`, `decolonisation`, `modern`) in which it unlocks.
- `parent`: The predecessor empire from which the territory secedes.

### 3.2 Canonical Dissolutions
Older macro-empires must be retired when their successors emerge to prevent lingering background geometry:
1. **Kalmar Union (`KAL`)**: `death_year = 1523`. Retired upon the independence of Sweden (`SWE`), Denmark (`DEN`), and Norway (`NOR`).
2. **Holy Roman Empire (`HRE`)**: `death_year = 1806`. Retired when Francis II dissolved the empire, giving rise to the Austrian Empire, German Confederation (`PRU`, `BAV`, `SAX`), and Italy (`ITA`).
3. **Ottoman Empire (`OTT`)**: `death_year = 1922`. Retired upon the abolition of the Sultanate, transitioning sovereign authority to the Republic of Turkey (`TUR`) and League of Nations mandates.
4. **Austro-Hungarian Empire (`AUH`)**: `death_year = 1918`. Retired at the end of World War I (Treaties of Saint-Germain-en-Laye and Trianon), cleanly dissolving into the sovereign Republic of Austria (`AUT`), Republic of Hungary (`HUN`), Czechoslovakia (`CZE_SLO`), and Yugoslavia (`YUG`). In the Modern Era, Austria and Hungary exist side-by-side as two distinct countries sharing the watertight Burgenland/Danube frontier arc (`[0.5486, 0.2552] <-> [0.545, 0.2634] <-> [0.5431, 0.2634]`).
5. **Pre-Unification Italian States (`VEN`, `GEN`, `NAP`, `PAP`)**: Unified under the House of Savoy into the Kingdom of Italy (`ITA`, `birth_year = 1860`). Predecessor states dissolve cleanly: Venice (`VEN`, `death_year = 1797`), Genoa (`GEN`, `death_year = 1815`), Naples (`NAP`, `death_year = 1860`), and Papal States (`PAP`, `death_year = 1870`), allowing unified Italy to command the full 21-vertex Alpine-to-Calabria peninsula and boot coastline.
6. **German Electorates (`PRU`, `BAV`, `SAX`)**: `death_year = 1871`. Unified under the German Empire / modern Federal Republic of Germany (`DEU`, `birth_year = 1871`), which snaps directly to Denmark, the Netherlands, Belgium, France, Switzerland, Austria, the Czech Republic, and Poland.
7. **Poland-Lithuania (`POL`)**: `death_year = 1795`. Partitioned by Prussia, Russia, and Austria, re-emerging at the end of WWI as the sovereign Republic of Poland (`POL_REP`, `birth_year = 1918`).

### 3.3 Rule of Gameplay Territory Preservation
When transitioning between historical ages in live gameplay:
- **Baseline Emergence**: Unclaimed or AI-held neutral territories transition to the historical successor nation.
- **Player Overrun Protection**: If a human player has conquered a territory in a prior era (e.g. a player-owned French Empire conquered the Rhineland or Ottoman Egypt), the start of a new age **does not overwrite the player's conquests**. New nations only emerge in territories that are not currently occupied by sovereign player realms.

---

## 4. Dynamic Frontier "Border Pushing" Engine

In active gameplay, armies stationed along borders push the frontline forward into enemy territory.

### 4.1 Mathematical Formulation of Frontier Displacement
Let $\mathcal{A}_{A,B} = \{\mathbf{p}_i\}_{i=1}^N$ be the shared arc between Kingdom $A$ and Kingdom $B$.
For each vertex $\mathbf{p}_i$, calculate the unit normal vector $\hat{\mathbf{n}}_i$ pointing from Kingdom $A$ into Kingdom $B$:
$$\hat{\mathbf{t}}_i = \frac{\mathbf{p}_{i+1} - \mathbf{p}_{i-1}}{\|\mathbf{p}_{i+1} - \mathbf{p}_{i-1}\|}, \quad \hat{\mathbf{n}}_i = (t_{i,y}, -t_{i,x})$$

When combat pressure occurs along frontier segment $i$:
$$\mathbf{p}_i(t + \Delta t) = \mathbf{p}_i(t) + \alpha \cdot \hat{\mathbf{n}}_i \cdot \frac{T_A - T_B}{T_A + T_B + \epsilon} \cdot \Delta t$$
Where:
- $T_A, T_B$: Troops dispatched by Kingdom $A$ and Kingdom $B$ to that border section.
- $\alpha$: Frontier velocity coefficient (governed by infrastructure and technology levels).
- $\epsilon$: Regularization constant preventing division by zero.

### 4.2 Watertight Invariant
Because the displacement operates directly on the shared vertices of $\mathcal{A}_{A,B}$, both Kingdom $A$ (which uses the arc forward) and Kingdom $B$ (which uses the arc reversed) automatically receive the exact same deformation. Territory transfer occurs without any polygon clipping artifacts.

---

## 5. Database Schema & WebSocket Protocol

### 5.1 SQLite Schema for Shared Frontiers
```sql
CREATE TABLE IF NOT EXISTS border_arcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_a TEXT NOT NULL,
    code_b TEXT NOT NULL,
    vertices TEXT NOT NULL, -- JSON array of normalized [x, y] coordinates
    control_ratio REAL DEFAULT 0.5, -- 0.0 = full B control, 1.0 = full A control
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS country_geometries (
    country_code TEXT PRIMARY KEY,
    arc_sequence TEXT NOT NULL, -- Ordered array of arc IDs with traversal direction (+/-)
    coastline_geometry TEXT NOT NULL -- Outer non-shared maritime coastal segments
);
```

### 5.2 Client-Server Synchronization
1. **Initial Connect (`ws: init`)**:
   Server sends the current vertex state of all shared arcs.
2. **Combat Tick (`ws: border_push`)**:
   When troop balance shifts a boundary:
   ```json
   {
     "type": "border_update",
     "arc_id": 42,
     "code_a": "FRA",
     "code_b": "ESP",
     "vertices": [[0.4833, 0.2855], [0.4944, 0.2869], [0.5092, 0.2938]],
     "control_ratio": 0.62
   }
   ```
3. **Client Update**:
   The renderer updates `border_arcs[42]`. The next `renderMap()` frame reflects the new frontline immediately.


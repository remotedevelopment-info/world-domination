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

## 3. Dynamic Era Emergence, Client States & Imperial Dissolution

The turning of a historical era is a dynamic, living simulation event governed by systemic rules of geography, sovereignty, and imperial overstretch.

### 3.1 The Emergence Lifecycle Rules

When a historical milestone / era transition triggers for candidate state $S_{\text{new}}$:

1. **Rule of Spatial Viability ("Is there space for it to exist?")**:
   - If the proposed territory is completely absorbed, colonized, or defended without ceded ground, $S_{\text{new}}$ **fails to emerge** (suppressed by military reality).
   - If uncontested land or parent territory exists, $S_{\text{new}}$ instantiates with watertight, non-overlapping borders.

2. **Rule of Parent Sovereignty & Client State Status**:
   - **Does the parent state exist?**
     - **If YES**: $S_{\text{new}}$ emerges as a **Client State (Vassal)** of the parent empire. It belongs politically to the parent empire's sphere of influence and pays economic tribute, but it occupies its own distinct territorial polygon.
     - **If NO**: $S_{\text{new}}$ emerges as a fully independent sovereign realm.
   - **Separation of Ownership**:
     - A newly emerged client state is **NOT owned directly by the empire player**.
     - If unclaimed by a human player, it is governed by an **AI NPC**.
     - It is open and "ripe for the taking" by any new player joining the server, or can be claimed through conquest or diplomacy.

3. **Reinterpreting "Death Year" — The Sunset of Empire**:
   - A historical `death_year` is **not an automatic deletion** of a living parent state.
   - Instead, `death_year` signals the **Imperial Sunset**:
     1. **Independence Achieved**: Client states cease paying tribute to the parent empire.
     2. **Transition to Siblinghood**: The parent state transitions from a suzerain overlord into an equal **sibling state** alongside its former clients.
     3. **Natural Alliance**: Former client states and the parent are established as **natural allies** by default, cooperating in defense and trade until such time as either party breaks the alliance or declares war.
     4. **Evaporation of Imperial Advantage**: The parent empire loses its pre-death-year combat and diplomatic leverage.

---

### 3.2 Client State Independence Strikes & Border Defense

A client state trapped within an empire does not have to wait for the parent's `death_year`. It can strike for independence at any time:

1. **The Independence Strike**:
   - The client state halts tribute payments, expels imperial tax collectors, and mobilizes border garrisons.
   - The parent empire can deploy troops to frontier arcs to crush the rebellion and re-subjugate the territory.

2. **The Asymmetric Combat Advantage**:
   - **Before `death_year`**: The parent state enjoys an **Imperial Clout Advantage** (higher troop morale, $+25\%$ combat efficacy ratio along shared frontiers, and diplomatic leverage against foreign intervention).
   - **After `death_year`**: The imperial advantage drops to zero. Frontier combat is evaluated on pure mathematical parity:
     $$\Delta \mathbf{p}_i = \alpha \cdot \hat{\mathbf{n}}_i \cdot \frac{T_{\text{rebel}} - T_{\text{parent}}}{T_{\text{rebel}} + T_{\text{parent}} + \epsilon}$$

3. **Sovereignty Recognized**:
   - If the client state successfully defends its frontiers against parent incursions for $N$ consecutive ticks, independence is formally recognized. The client state becomes a fully sovereign nation.

---

### 3.3 The Fragility of Empires (Imperial Overstretch)

A foundational thesis of *Kingdom Conquest* is that **empires are as fragile as they are large**:

> When an empire accumulates too many client states across too vast a geographical span, garrison and logistics maintenance costs outstrip the economic benefits of tribute.

#### The Imperial Balance Sheet:
$$\text{Net Revenue} = \sum_{c \in \text{Clients}} \text{Tribute}(c) - \sum_{c \in \text{Clients}} \text{GarrisonCost}(c)$$

Where garrison maintenance cost scales with physical frontier exposure and distance from the imperial capital:
$$\text{GarrisonCost}(c) = \beta \cdot \text{FrontierArcs}(c) \cdot \left(1 + \lambda \cdot \text{Distance}(c, \text{Capital})\right)$$

- $\text{FrontierArcs}(c)$: The count of contested border segments the client shares with hostile neighbors.
- $\text{Distance}(c, \text{Capital})$: Normalized distance across the world map from the imperial throne.
- $\beta, \lambda$: Logistics decay coefficients.

#### Dynamic Dissolution Triggers:
When $\text{GarrisonCost} > \text{Tribute}$, the empire enters **Imperial Overstretch**:
1. Imperial treasury decays rapidly into deficit.
2. Unpaid frontier garrisons desert or defect to local client militias.
3. Client state **Liberty Desire / Unrest** spikes:
   $$\text{Unrest}_c = \frac{\text{ImperialDebt}}{\text{ImperialPrestige}} + \gamma \cdot \left(T_{\text{client}} - T_{\text{imperial\_garrison}}\right)$$
4. Coordinated independence strikes trigger across multiple client states simultaneously, dismantling the empire from within **well before the parent's historical `death_year`**.

---

### 3.4 Canonical Reference Dissolutions & Evolutions

| Predecessor Empire | Code | `birth` | `death` | Emergent Client / Sibling States | Historical Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Kalmar Union** | `KAL` | 1500 | 1523 | Sweden (`SWE`), Denmark (`DEN`), Norway (`NOR`) | Gustav Vasa's War of Liberation dissolves the union; former clients emerge as sovereign Baltic rivals. |
| **Holy Roman Empire** | `HRE` | 1500 | 1806 | Prussia (`PRU`), Bavaria (`BAV`), Saxony (`SAX`), Austria (`AUT`) | Confederal umbrella of autonomous electorates; clients strike for independent dominance until formal imperial dissolution in 1806. |
| **Poland-Lithuania** | `POL` | 1500 | 1795 | Partitioned by Prussia, Russia, and Austria; re-emerges as `POL_REP` (1918) | Imperial overstretch and noble veto lead to triple partition; reborn as independent republic post-WWI. |
| **Ottoman Empire** | `OTT` | 1500 | 1922 | Turkey (`TUR`), Egypt (`EGY`), Syria (`SYR`), Iraq (`IRQ`), Lebanon (`LBN`) | Centuries of tributary eyalets (Balkans, Levant, North Africa); sultanate abolished in 1922, ceding sovereign siblinghood to Turkey. |
| **Austro-Hungarian Empire** | `AUH` | 1860 | 1918 | Austria (`AUT`), Hungary (`HUN`), Czechoslovakia (`CZE_SLO`), Yugoslavia (`YUG`) | Habsburg Dual Monarchy collapses post-WWI; Austria and Hungary exist as two distinct sovereign nations sharing the Burgenland frontier. |
| **Pre-Unification Italy** | `VEN`, `GEN`, `NAP`, `PAP` | 1500 | 1860–1870 | Unified Kingdom of Italy (`ITA`) | Regional city-states and kingdoms unify under Garibaldi and Victor Emmanuel II into a single 21-vertex boot coastline. |
| **German Electorates** | `PRU`, `BAV`, `SAX` | 1750 | 1871 | Unified German Empire / Federal Republic (`DEU`) | Electorates unify under Bismarck into a single contiguous nation snapping to Denmark, France, Austria, and Poland. |
| **Union of Soviet Socialist Republics** | `USSR` | 1922 | 1991 | Russian Federation (`RUS`), Ukraine (`UKR`), Belarus (`BLR`), Kazakhstan (`KAZ`), Central Asian & Caucasian republics (`UZB`, `TKM`, `KGZ`, `TJK`, `GEO`, `ARM`, `AZE`), Baltic states (`EST`, `LVA`, `LTU`), Moldova (`MDA`) | Emerges in the Decolonisation era (1922) from the Russian Eurasian core, suzerain to Soviet socialist republics. Dissolves in 1991; owner inherits the Russian Federation (`RUS`) while all 14 republics gain sovereign independence. |

---

### 3.5 Core Landmass Inheritance Rule upon Imperial Dissolution

When an empire reaches its historical `death_year`:
- **Core Landmass Inheritance**: The owner of the dying empire inherits **only the largest successor landmass** (`successorCode`, e.g., `USSR` $\rightarrow$ `RUS`, `AUH` $\rightarrow$ `AUT`, `OTT` $\rightarrow$ `TUR`, `HRE` $\rightarrow$ `AUT`, `KAL` $\rightarrow$ `DEN`). Player command (`state.myKingdom`) transfers automatically to this core realm.
- **Client State Independence**: All connected client states gain full sovereignty and independence, becoming independent sovereign nations (no longer paying tribute, no longer suzerain-bound).
- **Imperial Dissolution**: The predecessor imperial entity dissolves and retires from the map.
- **Baseline Emergence**: Unclaimed or AI-held neutral territories transition to the historical successor nation.
- **Player Overrun Protection**: If a human player has conquered a territory in a prior era, the start of a new age does not overwrite player conquests. New nations emerge only in territories not currently occupied by sovereign player realms.

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


---
name: multiuser-synchronization
description: >-
  Architectural standards and protocols for real-time multi-user state synchronization in Kingdom Conquest.
  Covers the authoritative server timeline, WebSocket broadcast pipelines, client-side clock drift compensation,
  era transition coordination, and concurrent multi-player world state management.
---

# Multi-User Synchronization & Authoritative Timeline Architecture

This skill defines the synchronization model, network contracts, and client-server protocols required to ensure that all connected players experience a consistent, real-time shared world state across different browsers and sessions.

---

## 1. The Core Philosophy: Authoritative Server Truth

In a persistent multiplayer grand-strategy game, world time and territorial states cannot be determined client-side:

1. **Single Source of Truth**:
   - The Go server engine maintains the authoritative simulation year (`sim_year`), current era (`era_id`), chrono scale (`chrono_scale`), and world tick count.
   - Clients never advance historical eras or leap across centuries independently.

2. **Universal Broadcast via WebSockets**:
   - Whenever any world mutation occurs—such as a timeline jump, scale change, player claim, military advance, or economic cycle—the server broadcasts the updated `GameState` payload to all active WebSocket connections.

3. **Smooth Local Interpolation**:
   - High-frequency local clocks on the client interpolate smoothly between authoritative server ticks (e.g., rendering fractional year progress bars, seasonal changes, and day/month increments) without causing jitter or snapping backward.

---

## 2. Global Timeline Protocol & Network Contract

### 2.1 Authoritative GameState Timeline Payload

Every WebSocket frame (both initial connection `"init"` and subsequent broadcast ticks) includes authoritative timeline telemetry:

```json
{
  "tick": 42,
  "sim_year": 1920.0,
  "year_int": 1920,
  "era_id": "decolonisation",
  "era_name": "AGE OF DECOLONISATION",
  "chrono_scale": "1d",
  "is_paused": false,
  "timestamp": "2026-11-03T17:00:00Z",
  "countries": [ ... ],
  "players": [ ... ],
  "actions": [ ... ]
}
```

### 2.2 Historical Eras Definition

Historical eras are synchronized between the backend engine and frontend chronometer:

| Era ID | Name | Start Year | End Year | Historical Keynotes |
| :--- | :--- | :--- | :--- | :--- |
| `discovery` | THE AGE OF DISCOVERY | 1500 | 1749 | 11 Founding Sovereign Realms; Kalmar Union spans Scandinavia & Finland |
| `revolt` | THE AGE OF REVOLT | 1750 | 1859 | Prussia, Sweden, Denmark, Scotland, Dutch Republic emerge |
| `independence` | THE AGE OF INDEPENDENCE | 1860 | 1919 | Unified Italy, Austria-Hungary, Romania, Serbia, USA |
| `decolonisation` | AGE OF DECOLONISATION | 1920 | 1988 | Unified USSR spanning Eurasia; Post-WWI European republics |
| `modern` | THE MODERN AGE | 1989 | 9999 | USSR dissolves & fragments into 15 sovereign nations |

### 2.3 Chrono Scales (Speed Multipliers)

| Scale Key | Real Seconds per Game Year | Purpose |
| :--- | :--- | :--- |
| `1s` | 1 second | Warp speed development / automated stress testing |
| `5s` | 5 seconds | Turbo historical playthrough |
| `1m` | 60 seconds | Rapid session testing |
| `1h` | 3,600 seconds | Fast-paced multiplayer campaign |
| `4h` | 14,400 seconds | Daily multi-era campaign |
| `1d` | 86,400 seconds | **Standard persistent game time** (1 day = 1 game year) |
| `2d` | 172,800 seconds | Long-term strategy |
| `4d` | 345,600 seconds | Marathon geopolitical campaign |

---

## 3. Client Synchronization & Drift Compensation

### 3.1 Ingesting Server Timeline
When the client receives a WebSocket update:
1. It extracts `sim_year`, `year_int`, `era_id`, `chrono_scale`, and `is_paused`.
2. It compares the server's `sim_year` with the client's current interpolated year:
   - If drift $|\text{clientYear} - \text{serverYear}| > 0.5$ years, it snaps immediately to server time.
   - If drift is minimal, it gently nudges the local clock rate to converge seamlessly without visual jump.
3. If `era_id` has changed:
   - Updates all era plaques in the UI chronometer bar.
   - Fires `onEraChange(newEra, yearInt, prevEraId)`.
   - Re-evaluates active territorial boundaries and re-renders the canvas map.

### 3.2 User-Triggered Timeline Changes & Administrator Permissions
In a multi-user environment, arbitrary players cannot mutate the server timeline or jump historical eras for other players:
1. **Nominated Timeline Administrator & Role Hierarchy**:
   - The PostgreSQL `users` table includes a `role VARCHAR(32) DEFAULT 'player'` column.
   - Users with `role = 'admin'` or designated accounts `admin@sfsw.net` (username `admin`) and `nalex@sfsw.net` (username `nalex`) are granted imperial overseer authority.
   - Server endpoints (`/api/timeline/jump`, `/api/timeline/scale`, `/api/timeline/pause`, `/api/admin/dashboard`) require authentication and verify that `user.Role == "admin"` or `database.IsAdminIdentifier(user.Email/Username)`.
   - Requests from unauthenticated users return `401 Unauthorized`; non-admin users receive `403 Forbidden`.
2. **Silent Failure for Non-Admin Timeline Interaction**:
   - In the frontend chronometer UI, attempts by regular players to click historical era plaques or modify the chronometer scale fail silently (no email-quoting toasts or warning dialogs are shown to users).
3. **Overseer vs. Player-Admin Separation**:
   - **Pure Overseer (`admin@sfsw.net` / `admin`)**: Neutral game monitor and observer with no claimed kingdom. Header badge displays `👑 Overseer`, territory claiming is suppressed, and no player prompts are shown.
   - **Player-Admin (`nalex@sfsw.net` / `nalex`)**: Active participant ruling a sovereign empire (e.g. *Kingdom of England*) with complete access to gameplay, economy, troops, and diplomacy, while retaining developer timeline controls (`👑 Admin Console` and Chronometer Regulator). Header badge displays `<Kingdom Name> 👑`.
4. **Admin Dashboard Telemetry (`/api/admin/dashboard`)**:
   - Real-time endpoint returning complete overseer telemetry:
     - Authoritative timeline state: current simulation year, era ID and name, chrono scale, ticker running/paused status, and server tick index.
     - Complete user roster: user IDs, usernames, emails, roles, claimed realms, realm code/color, populations, resources/treasury reserves, troop counts, tax/economy rates, and last login timestamps.
   - Embedded admin controls allow instant era warps (1500, 1750, 1860, 1920, 1989), global chrono speed changes (1s to 4d), and ticker pause/resume toggle with automatic broadcast to all players.
5. **Authoritative Broadcast**:
   - When the administrator jumps the timeline or updates the chrono scale, the server updates its internal `GameEngine` timeline, persists the snapshot in `game_states`, and immediately broadcasts the updated `GameState` to **all** connected players.
   - All open browser tabs and remote player screens transition simultaneously into the target era in lockstep.
6. **No Client-Side LocalStorage Override**:
   - Clients must never persist timeline years, scales, or manual offsets to browser `localStorage`.
   - Upon page load, clients immediately fetch `GET /api/timeline` and align their local chronometer to the server before rendering the map, ensuring the server is the sole source of truth across all sessions.

---

## 4. Multi-User Territorial Concurrency Rules

1. **Atomic Kingdom Claims**:
   - Claim requests (`POST /api/assign-country`) execute under PostgreSQL transaction locks.
   - If two players attempt to claim the same kingdom at the same instant, one succeeds and the other receives a `409 Conflict`.
   - The winning claim triggers `Advance()`, instantly updating all other players' maps to show the newly claimed kingdom highlighted in the player's color.

2. **Inactive Player Reclamation**:
   - The server engine checks for players who have been inactive for $> 7$ days.
   - Abandoned kingdoms have their ownership reset to `null` and are returned to unclaimed status across all players' screens.


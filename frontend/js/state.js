// state.js - Centralized application state store

import { HISTORICAL_KINGDOMS, HISTORICAL_KINGDOM_BY_CODE } from "./map/polygons.js";

// Optional Polynesian / Pacific island nations (Advanced Play Meta Theme)
export const POLYNESIAN_ISLES = new Set(["WSM", "TON", "FJI", "VUT", "SLB", "FSM"]);

/**
 * Imperial Successor Mapping (Core Landmass Inheritance Rule):
 * When an empire reaches its death_year, the empire dissolves and its owner
 * inherits ONLY the largest successor landmass. Connected client states gain
 * full sovereignty and independence.
 */
export const IMPERIAL_SUCCESSORS = {
  USSR: "RUS", // Soviet Union -> Russian Federation
  SOV: "RUS",
  AUH: "AUT", // Austria-Hungary -> Republic of Austria (Hungary HUN sovereign)
  OTT: "TUR", // Ottoman Empire -> Republic of Turkey
  HRE: "AUT", // Holy Roman Empire -> Archduchy/Empire of Austria (electorates sovereign)
  KAL: "DEN", // Kalmar Union -> Kingdom of Denmark (Sweden SWE sovereign)
};

export const state = {
  token: null,
  currentUser: null,
  allKingdoms: [],
  kingdoms: [],
  myKingdom: null,
  kingdomBorders: {},
  troops: {},
  currentTick: 0,
  currentSimYear: 1500,
  currentEraId: "discovery",
  shownKingdomId: null,
  selectedKingdomId: null,
  lastStateAt: Date.now(),
  lastEconomy: null,
  loggedOut: false,
  authBusy: false,
  actionBusy: false,
  metaThemes: {
    polynesiaIsles: false, // Optional advanced oceanic play meta theme
  },
  showMapLabels: true, // Control switch: show/hide name plate abbreviations on base map
};

// Initialize session from localStorage if available
if (typeof localStorage !== "undefined") {
  state.token = localStorage.getItem("token") || null;
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    try {
      state.currentUser = JSON.parse(storedUser);
    } catch (_) {
      state.currentUser = null;
    }
  }
}

export function setToken(token) {
  state.token = token;
  if (typeof localStorage !== "undefined") {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }
}

export function setCurrentUser(user) {
  state.currentUser = user;
  if (typeof localStorage !== "undefined") {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
  }
}

export function clearSession() {
  state.token = null;
  state.currentUser = null;
  state.myKingdom = null;
  state.loggedOut = true;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
}

export function setMyKingdom(kingdom) {
  state.myKingdom = kingdom;
}

export function setKingdoms(kingdoms) {
  state.kingdoms = kingdoms;
}

export function setTroops(troops) {
  state.troops = troops;
}

/**
 * Enriches server countries with historical era metadata, ensures all 32 era
 * countries exist in the master list, and filters `state.kingdoms` to those
 * unlocked up to `currentYear` (with parent empire territorial cost applied).
 */
export function syncKingdomsForYear(rawKingdoms, currentYear) {
  if (typeof rawKingdoms === "number") {
    currentYear = rawKingdoms;
    rawKingdoms = null;
  }
  if (typeof currentYear !== "number") {
    currentYear = state.currentSimYear || 1500;
  }
  state.currentSimYear = currentYear;

  const sourceList = Array.isArray(rawKingdoms)
    ? rawKingdoms
    : (state.kingdoms && state.kingdoms.length > 0)
    ? state.kingdoms
    : state.allKingdoms;
  const byCode = new Map();

  sourceList.forEach((raw) => {
    if (!raw || !raw.code) return;
    const meta = HISTORICAL_KINGDOM_BY_CODE[raw.code] || {};
    let parsedBorders = raw.borders;
    if (typeof parsedBorders === "string") {
      try {
        parsedBorders = JSON.parse(parsedBorders);
      } catch {
        parsedBorders = null;
      }
    }

    const borderList = Array.isArray(parsedBorders?.borders)
      ? parsedBorders.borders
      : Array.isArray(meta.borders)
      ? meta.borders
      : [];

    const birthYear =
      typeof parsedBorders?.birth_year === "number"
        ? parsedBorders.birth_year
        : typeof raw.birth_year === "number"
        ? raw.birth_year
        : meta.birth_year || 1500;

    const deathYear =
      typeof parsedBorders?.death_year === "number"
        ? parsedBorders.death_year
        : typeof raw.death_year === "number"
        ? raw.death_year
        : meta.death_year || 9999;

    const unlockEra = parsedBorders?.unlock_era || raw.unlock_era || meta.unlock_era || "discovery";
    const parent = parsedBorders?.parent ?? raw.parent ?? meta.parent ?? "";
    const historicalNote = raw.historical_note || meta.historical_note || "";

    byCode.set(raw.code, {
      ...meta,
      ...raw,
      base_population: raw.base_population ?? raw.population ?? meta.population ?? 1000000,
      base_resources: raw.base_resources ?? raw.resources ?? meta.resources ?? 500,
      isIsland: Boolean(raw.isIsland || raw.is_island || meta.is_island),
      birth_year: birthYear,
      death_year: deathYear,
      unlock_era: unlockEra,
      parent,
      historical_note: historicalNote,
      borderList,
    });
  });

  // Ensure all historical kingdoms are represented even if backend DB was seeded earlier
  HISTORICAL_KINGDOMS.forEach((meta) => {
    if (!byCode.has(meta.code)) {
      byCode.set(meta.code, {
        ...meta,
        owner_id: null,
        owner_name: null,
        base_population: meta.population,
        base_resources: meta.resources,
        isIsland: Boolean(meta.is_island),
        death_year: meta.death_year || 9999,
        borderList: meta.borders || [],
      });
    }
  });

  // Preserve state.myKingdom ownership if client has an active claim
  if (state.myKingdom && byCode.has(state.myKingdom.code)) {
    const mk = byCode.get(state.myKingdom.code);
    if (!mk.owner_id && state.myKingdom.owner_id) {
      mk.owner_id = state.myKingdom.owner_id;
      mk.owner_name = state.myKingdom.owner_name;
    }
  }

  const masterList = Array.from(byCode.values()).sort(
    (a, b) => (a.birth_year - b.birth_year) || ((a.id || 0) - (b.id || 0))
  );
  state.allKingdoms = masterList;

  // Dynamic era naming for Russia across centuries
  const rus = byCode.get("RUS");
  const ussr = byCode.get("USSR");
  if (rus) {
    if (currentYear >= 1991) {
      rus.name = "Russian Federation";
    } else if (currentYear >= 1721) {
      rus.name = "Russian Empire";
    } else {
      rus.name = "Tsardom of Muscovy";
    }
  }

  // Core Landmass Inheritance Rule upon Imperial Dissolution / Evolution
  // 1. Decolonisation emergence (1922): RUS transforms into USSR
  if (currentYear >= 1922 && currentYear < 1991) {
    if (rus && ussr && rus.owner_id && !ussr.owner_id) {
      ussr.owner_id = rus.owner_id;
      ussr.owner_name = rus.owner_name;
      rus.owner_id = null;
      rus.owner_name = null;
      if (state.myKingdom && (state.myKingdom.code === "RUS" || state.myKingdom.id === rus.id)) {
        state.myKingdom = ussr;
      }
    }
  }

  // 2. Imperial Dissolution at death_year:
  // When an empire reaches its death_year, it dissolves and its owner inherits ONLY
  // the largest successor landmass. All connected client states become independent.
  Object.entries(IMPERIAL_SUCCESSORS).forEach(([empireCode, successorCode]) => {
    const empire = byCode.get(empireCode);
    const successor = byCode.get(successorCode);
    if (!empire || !successor) return;

    const death = typeof empire.death_year === "number" ? empire.death_year : 9999;
    if (currentYear >= death) {
      if (empire.owner_id) {
        if (!successor.owner_id) {
          successor.owner_id = empire.owner_id;
          successor.owner_name = empire.owner_name;
        }
        empire.owner_id = null;
        empire.owner_name = null;
        if (state.myKingdom && (state.myKingdom.code === empire.code || state.myKingdom.id === empire.id)) {
          state.myKingdom = successor;
        }
      } else if (state.myKingdom && (state.myKingdom.code === empire.code || state.myKingdom.id === empire.id)) {
        if (state.myKingdom.owner_id && !successor.owner_id) {
          successor.owner_id = state.myKingdom.owner_id;
          successor.owner_name = state.myKingdom.owner_name;
        }
        state.myKingdom = successor;
      }
    }
  });

  // Filter countries that are active in `currentYear` (emerged and not dissolved/absorbed)
  const active = masterList
    .filter((k) => {
      // Mutual timeline exclusivity between RUS and USSR
      if (k.code === "RUS") {
        return currentYear < 1922 || currentYear >= 1991;
      }
      if (k.code === "USSR") {
        return currentYear >= 1922 && currentYear < 1991;
      }

      const birth = typeof k.birth_year === "number" ? k.birth_year : 1500;
      const death = typeof k.death_year === "number" ? k.death_year : 9999;

      // Empires with defined successors dissolve at death_year (owner inherits core landmass)
      if (IMPERIAL_SUCCESSORS[k.code]) {
        return currentYear >= birth && currentYear < death;
      }

      // Living realms commanded by players survive past death_year unless an imperial rule dissolved them
      if (k.owner_id) return currentYear >= birth;
      return currentYear >= birth && currentYear < death;
    })
    .map((k) => ({ ...k }));

  const activeCodes = new Set(active.map((k) => k.code));

  // Establish client state, suzerainty, siblinghood, and alliance statuses
  active.forEach((k) => {
    const parentCode = k.parent;
    const parentMeta = parentCode ? byCode.get(parentCode) : null;
    const parentActive = parentMeta && activeCodes.has(parentCode);

    if (parentMeta) {
      const parentDeath = typeof parentMeta.death_year === "number" ? parentMeta.death_year : 9999;
      if (parentActive && currentYear < parentDeath) {
        // Parent is alive and before death_year -> Client State (pays tribute)
        k.isClientState = true;
        k.suzerainCode = parentCode;
        k.isSibling = false;
        k.diplomaticStatus = "client";
        k.tributeRate = 0.20; // 20% economic tribute to parent
      } else {
        // Independence achieved (siblinghood with former suzerain)
        k.isClientState = false;
        k.suzerainCode = null;
        k.isSibling = true;
        k.diplomaticStatus = parentActive ? "sibling_ally" : "sovereign";
        k.tributeRate = 0.0;
      }
    } else {
      k.isClientState = false;
      k.suzerainCode = null;
      k.isSibling = false;
      k.diplomaticStatus = "sovereign";
      k.tributeRate = 0.0;
    }
  });

  // Calculate Imperial Overstretch & Garrison burdens for parent empires
  active.forEach((k) => {
    const clients = active.filter((c) => c.suzerainCode === k.code);
    k.clientCount = clients.length;
    if (clients.length > 0) {
      k.tributeIncome = clients.reduce(
        (sum, c) => sum + Math.round((c.base_resources || 500) * (c.tributeRate || 0.2)),
        0
      );
      k.garrisonCost = clients.length * 120;
      k.imperialOverstretch = k.garrisonCost > k.tributeIncome;
    } else {
      k.tributeIncome = 0;
      k.garrisonCost = 0;
      k.imperialOverstretch = false;
    }
  });

  // Apply historical secession cost to unowned parent empires when child nations emerge
  active.forEach((k) => {
    if (!k.owner_id) {
      const emergedChildren = active.filter((c) => c.parent === k.code && c.code !== k.code);
      if (emergedChildren.length > 0) {
        const popCost = emergedChildren.reduce((sum, c) => sum + Math.round((c.base_population || 0) * 0.35), 0);
        const resCost = emergedChildren.reduce((sum, c) => sum + Math.round((c.base_resources || 0) * 0.25), 0);
        k.population = Math.max(500000, (k.base_population || k.population) - popCost);
        k.resources = Math.max(150, (k.base_resources || k.resources) - resCost + (k.tributeIncome || 0));
      } else {
        k.population = k.base_population || k.population;
        k.resources = (k.base_resources || k.resources) + (k.tributeIncome || 0);
      }
    }
  });

  state.kingdoms = active;

  // Build active border adjacency sets (filtered to countries that exist in the current year)
  state.kingdomBorders = {};
  active.forEach((k) => {
    const activeNeighbors = (k.borderList || []).filter((code) => activeCodes.has(code));
    state.kingdomBorders[k.code] = new Set(activeNeighbors);
  });

  if (state.myKingdom) {
    const updatedMy = active.find((k) => k.code === state.myKingdom.code);
    if (updatedMy) {
      state.myKingdom = updatedMy;
    }
  }

  return active;
}



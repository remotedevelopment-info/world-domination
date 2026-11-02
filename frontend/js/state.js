// state.js - Centralized application state store

import { HISTORICAL_KINGDOMS, HISTORICAL_KINGDOM_BY_CODE } from "./map/polygons.js";

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
export function syncKingdomsForYear(rawKingdoms, currentYear = state.currentSimYear || 1500) {
  state.currentSimYear = currentYear;

  const sourceList = Array.isArray(rawKingdoms) ? rawKingdoms : state.allKingdoms;
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
      unlock_era: unlockEra,
      parent,
      historical_note: historicalNote,
      borderList,
    });
  });

  // Ensure all 32 historical kingdoms are represented even if backend DB was seeded earlier
  HISTORICAL_KINGDOMS.forEach((meta) => {
    if (!byCode.has(meta.code)) {
      byCode.set(meta.code, {
        ...meta,
        owner_id: null,
        owner_name: null,
        base_population: meta.population,
        base_resources: meta.resources,
        isIsland: Boolean(meta.is_island),
        borderList: meta.borders || [],
      });
    }
  });

  const masterList = Array.from(byCode.values()).sort(
    (a, b) => (a.birth_year - b.birth_year) || ((a.id || 0) - (b.id || 0))
  );
  state.allKingdoms = masterList;

  // Filter countries that have emerged by `currentYear`
  const active = masterList
    .filter((k) => (k.birth_year || 1500) <= currentYear)
    .map((k) => ({ ...k }));

  const activeCodes = new Set(active.map((k) => k.code));

  // Apply historical secession cost to unowned parent empires when child nations emerge
  active.forEach((k) => {
    if (!k.owner_id) {
      const emergedChildren = active.filter((c) => c.parent === k.code && c.code !== k.code);
      if (emergedChildren.length > 0) {
        const popCost = emergedChildren.reduce((sum, c) => sum + Math.round((c.base_population || 0) * 0.35), 0);
        const resCost = emergedChildren.reduce((sum, c) => sum + Math.round((c.base_resources || 0) * 0.25), 0);
        k.population = Math.max(500000, (k.base_population || k.population) - popCost);
        k.resources = Math.max(150, (k.base_resources || k.resources) - resCost);
      } else {
        k.population = k.base_population || k.population;
        k.resources = k.base_resources || k.resources;
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

  return active;
}



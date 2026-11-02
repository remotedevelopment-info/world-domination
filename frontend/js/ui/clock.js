// clock.js - Steampunk Map Legend Year Chronometer & Development Time Scale Engine

import { TICK_INTERVAL_S } from "../config.js";
import { state } from "../state.js";

export const CHRONO_SCALES = {
  "1m": { id: "1m", seconds: 60, label: "1 min = 1 yr", name: "1 Minute = 1 Year" },
  "1h": { id: "1h", seconds: 3600, label: "1 hr = 1 yr", name: "1 Hour = 1 Year" },
  "4h": { id: "4h", seconds: 14400, label: "4 hrs = 1 yr", name: "4 Hours = 1 Year" },
  "1d": { id: "1d", seconds: 86400, label: "1 day = 1 yr", name: "1 Day = 1 Year (Standard)" },
  "2d": { id: "2d", seconds: 172800, label: "2 days = 1 yr", name: "2 Days = 1 Year" },
  "4d": { id: "4d", seconds: 345600, label: "4 days = 1 yr", name: "4 Days = 1 Year" },
};

export const BASE_YEAR = 1500;

export const HISTORICAL_ERAS = [
  { id: "discovery", name: "THE AGE OF DISCOVERY", startYear: 1500, endYear: 1749 },
  { id: "revolt", name: "THE AGE OF REVOLT", startYear: 1750, endYear: 1859 },
  { id: "independence", name: "THE AGE OF INDEPENDENCE", startYear: 1860, endYear: 1919 },
  { id: "decolonisation", name: "AGE OF DECOLONISATION", startYear: 1920, endYear: 1988 },
  { id: "modern", name: "THE MODERN AGE", startYear: 1989, endYear: 9999 },
];

let currentScaleKey = "1d";
let manualYearOffset = 0;
let devDrawerOpen = false;
let clockTimer = null;

// Initialize persisted dev scale & offset from localStorage
if (typeof localStorage !== "undefined") {
  const savedScale = localStorage.getItem("world_domination_chrono_scale");
  if (savedScale && CHRONO_SCALES[savedScale]) {
    currentScaleKey = savedScale;
  }
  const savedOffset = localStorage.getItem("world_domination_year_offset");
  if (savedOffset !== null) {
    const parsed = parseFloat(savedOffset);
    if (!isNaN(parsed)) manualYearOffset = parsed;
  }
}

export function startClock() {
  if (clockTimer) return;
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

export function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

/**
 * Computes current game year, season, month, day, and time to next tick/year rollover
 */
export function computeGameTime() {
  const scale = CHRONO_SCALES[currentScaleKey] || CHRONO_SCALES["1d"];
  const now = Date.now();
  const lastAt = state.lastStateAt || now;
  const elapsedSinceState = Math.max(0, (now - lastAt) / 1000);
  const totalElapsedRealSec = ((state.currentTick || 0) * TICK_INTERVAL_S) + elapsedSinceState;

  const yearsPassed = totalElapsedRealSec / scale.seconds;
  const currentYearFrac = BASE_YEAR + manualYearOffset + yearsPassed;
  const yearInt = Math.floor(currentYearFrac);
  const yearFrac = Math.max(0, Math.min(1, currentYearFrac - yearInt));

  // 12 Months
  const monthIdx = Math.min(11, Math.floor(yearFrac * 12));
  const monthNames = [
    "I (Jan)", "II (Feb)", "III (Mar)", "IV (Apr)",
    "V (May)", "VI (Jun)", "VII (Jul)", "VIII (Aug)",
    "IX (Sep)", "X (Oct)", "XI (Nov)", "XII (Dec)",
  ];
  const month = monthNames[monthIdx];

  // Day of year 1..365
  const dayOfYear = Math.min(365, Math.floor(yearFrac * 365) + 1);

  // 4 Seasons
  const seasons = [
    { name: "❄️ Winter", start: 0.0, end: 0.25 },
    { name: "🌱 Spring", start: 0.25, end: 0.50 },
    { name: "☀️ Summer", start: 0.50, end: 0.75 },
    { name: "🍂 Autumn", start: 0.75, end: 1.0 },
  ];
  let season = seasons[0].name;
  for (const s of seasons) {
    if (yearFrac >= s.start && yearFrac < s.end) {
      season = s.name;
      break;
    }
  }

  // Next tick remaining seconds
  const remainTickSec = Math.max(0, TICK_INTERVAL_S - (Math.floor(elapsedSinceState) % TICK_INTERVAL_S));

  // Next year remaining seconds
  const remainYearSec = Math.max(0, Math.ceil((1 - yearFrac) * scale.seconds));

  // Current Historical Era
  let currentEra = HISTORICAL_ERAS[0];
  for (const era of HISTORICAL_ERAS) {
    if (yearInt >= era.startYear && yearInt <= era.endYear) {
      currentEra = era;
      break;
    }
  }

  return {
    yearInt,
    yearFrac,
    currentYearFrac,
    month,
    dayOfYear,
    season,
    remainTickSec,
    remainYearSec,
    currentEra,
    scale,
  };
}

/**
 * Format duration in seconds into human-readable text
 */
function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${(sec / 86400).toFixed(1)} days`;
}

/**
 * Periodic tick called every 1 second: updates Map Legend, Cartouche, Era Bar, & Dev Drawer
 */
export function tickClock() {
  const time = computeGameTime();

  // 1. Update Map Legend Year Display
  const yearNumEl = document.getElementById("legend-year-display");
  if (yearNumEl) yearNumEl.textContent = time.yearInt;

  const seasonEl = document.getElementById("legend-season-display");
  if (seasonEl) seasonEl.textContent = time.season;

  const monthDayEl = document.getElementById("legend-month-day");
  if (monthDayEl) monthDayEl.textContent = `Month ${time.month} · Day ${time.dayOfYear}`;

  const urgencyEl = document.getElementById("legend-urgency-tick");
  if (urgencyEl) {
    urgencyEl.textContent = `Next Tick in ${time.remainTickSec}s`;
    urgencyEl.classList.toggle("urgent", time.remainTickSec <= 5);
  }

  const progressFill = document.getElementById("legend-year-progress");
  if (progressFill) {
    progressFill.style.width = `${(time.yearFrac * 100).toFixed(1)}%`;
  }

  const eraTagEl = document.getElementById("legend-era-tag");
  if (eraTagEl) {
    eraTagEl.textContent = time.currentEra.name;
  }

  const ratioBadge = document.getElementById("header-dev-ratio-badge");
  if (ratioBadge) {
    ratioBadge.textContent = time.scale.label;
  }

  // 2. Synchronize Era Chronometer Bar Plaques
  updateHistoricalEraBar(time.currentEra, time.yearInt);

  // 3. Update Canvas Cartouche Header Text
  updateCartouchePlaque(time.currentEra, time.yearInt);

  // 4. Update Dev Drawer Telemetry if Open
  if (devDrawerOpen) {
    updateDevDrawerTelemetry(time);
  }

  // 5. Fallback for any legacy elements
  const legacyUrgency = document.getElementById("urgency-tick");
  if (legacyUrgency) {
    legacyUrgency.textContent = `Next state update in ${time.remainTickSec}s`;
    legacyUrgency.classList.toggle("urgent", time.remainTickSec <= 5);
  }
}

/**
 * Updates the 5 historical era plaques in .era-chronometer-bar
 */
function updateHistoricalEraBar(activeEra, yearInt) {
  const plaques = document.querySelectorAll(".era-plaque");
  if (!plaques || !plaques.length) return;

  const eraOrder = ["discovery", "revolt", "independence", "decolonisation", "modern"];
  const activeIdx = eraOrder.indexOf(activeEra.id);

  plaques.forEach((plaque) => {
    const eraId = plaque.dataset.era;
    const idx = eraOrder.indexOf(eraId);
    const badge = plaque.querySelector(".plaque-badge");

    if (idx === activeIdx) {
      plaque.classList.add("active");
      plaque.classList.remove("locked", "completed");
      if (badge) {
        badge.textContent = "ACTIVE ERA";
        badge.className = "plaque-badge active-lamp";
      }
    } else if (idx < activeIdx) {
      plaque.classList.remove("active", "locked");
      plaque.classList.add("completed");
      if (badge) {
        badge.textContent = "HISTORIC";
        badge.className = "plaque-badge completed-lamp";
      }
    } else {
      plaque.classList.remove("active", "completed");
      plaque.classList.add("locked");
      if (badge) {
        badge.textContent = "🔒 LOCKED";
        badge.className = "plaque-badge locked-lamp";
      }
    }
  });
}

/**
 * Updates the cartouche plaque atop the canvas
 */
function updateCartouchePlaque(currentEra, yearInt) {
  const titleEl = document.querySelector(".cartouche-title");
  if (titleEl) {
    titleEl.textContent = `ORBIS TERRARUM · ANNO DOMINI ${yearInt}`;
  }
  const subEl = document.querySelector(".cartouche-subtitle");
  if (subEl) {
    subEl.textContent = `${currentEra.name} · SOVEREIGN REALMS`;
  }
}

/**
 * Updates live telemetry inside the Dev Chrono Drawer
 */
function updateDevDrawerTelemetry(time) {
  const liveYr = document.getElementById("dev-live-year");
  if (liveYr) liveYr.textContent = time.currentYearFrac.toFixed(2);

  const liveEra = document.getElementById("dev-live-era");
  if (liveEra) liveEra.textContent = time.currentEra.name;

  const liveTicks = document.getElementById("dev-live-ticks");
  if (liveTicks) liveTicks.textContent = state.currentTick || 0;

  const liveNextYr = document.getElementById("dev-live-next-yr");
  if (liveNextYr) liveNextYr.textContent = formatDuration(time.remainYearSec);

  const offsetDisp = document.getElementById("dev-offset-display");
  if (offsetDisp) {
    const sign = manualYearOffset >= 0 ? "+" : "";
    offsetDisp.textContent = `Offset: ${sign}${manualYearOffset.toFixed(1)} years`;
  }
}

/**
 * Synchronize radio button selection in Dev Drawer
 */
function syncRadioCardUI() {
  const cards = document.querySelectorAll(".chrono-scales-grid .scale-card");
  cards.forEach((card) => {
    const isSelected = card.dataset.scale === currentScaleKey;
    card.classList.toggle("active", isSelected);
    const radio = card.querySelector("input[type='radio']");
    if (radio) radio.checked = isSelected;
  });
}

// -------------------------------------------------------------
// DEVELOPMENT CONTROL ACTIONS
// -------------------------------------------------------------

export function toggleDevChronoControl() {
  devDrawerOpen = !devDrawerOpen;
  const drawer = document.getElementById("dev-chrono-drawer");
  if (drawer) {
    drawer.classList.toggle("hidden", !devDrawerOpen);
    drawer.classList.toggle("open", devDrawerOpen);
  }
  if (devDrawerOpen) {
    syncRadioCardUI();
    tickClock();
  }
}

export function setChronoScale(scaleKey) {
  if (!CHRONO_SCALES[scaleKey]) return;
  currentScaleKey = scaleKey;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("world_domination_chrono_scale", scaleKey);
  }
  syncRadioCardUI();
  tickClock();
}

export function jumpToYear(targetYear) {
  const scale = CHRONO_SCALES[currentScaleKey] || CHRONO_SCALES["1d"];
  const totalElapsedRealSec = (state.currentTick || 0) * TICK_INTERVAL_S;
  const yearsFromTicks = totalElapsedRealSec / scale.seconds;
  manualYearOffset = targetYear - (BASE_YEAR + yearsFromTicks);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem("world_domination_year_offset", String(manualYearOffset));
  }
  tickClock();
}

export function stepYearOffset(delta) {
  manualYearOffset += delta;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("world_domination_year_offset", String(manualYearOffset));
  }
  tickClock();
}

export function resetYearOffset() {
  manualYearOffset = 0;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("world_domination_year_offset");
  }
  tickClock();
}

export function getCurrentGameYear() {
  return computeGameTime().yearInt;
}

export function getCurrentGameYearFraction() {
  return computeGameTime().currentYearFrac;
}

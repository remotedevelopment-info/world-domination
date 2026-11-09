// console.js - War Room Console: Interactive Dials, Meters, Radar & Tactical Actuators

import { state } from "../state.js";
import {
  apiGetKingdomDetail,
  apiGetDiplomacy,
  apiSetEconomySettings,
  apiSendAction,
  readErrorMessage,
} from "../api.js";
import { showToast, logMessage, escapeHtml } from "./toast.js";
import { kingdomPolygons } from "../map/polygons.js";
import { applyActionResult } from "./actions.js";
import { isCountryOwnedByCurrentUser } from "../map/renderer.js";
import { isPureOverseer, getCurrentGameYear } from "./clock.js";
import {
  renderMileometer,
  syncPopulationMileometerAnchor,
  setPopulationMileometerRate,
  startPopulationMileometerTicker,
  stopPopulationMileometerTicker,
} from "./mileometer.js";

let currentConsoleBay = "all";
let taxRate = 50;
let investmentRate = 0;
let socialCostsRate = 0;
let marketsLevel = 0;
let infraLevel = 0;
let compassDirection = "N";
let compassAngle = 0;
let movementMode = "interior"; // 'interior' | 'target'
let marchSpeed = "Slow"; // 'Slow' | 'Fast'
let selectedTargetCountryId = null;
let targetCountryIndex = 0;
let diplomaticStance = "envoy"; // 'envoy' | 'alliance' | 'trade' | 'war'
let commandCenterDetail = null;
let activeDial = null;
let debouncedPushSettingsTimer = null;
let dialsWired = false;
let compassDragging = false;
let lastEconomyUserActionTime = 0;
let isPushingEconomySettings = false;

// Round-robin territory state without queuing events
let activeCommandCenterKingdom = null;
let isTerritoryFetching = false;
let isTerritoryFetchPending = false;
let territoryPeriodicTimer = null;
let roundRobinTerritoryIndex = 0;

const DIAL_BASE_DEG = 120;
const DIAL_DEG_PER_UNIT = 2.4; // 240 deg sweep for 0..100 range

export function isUserAdjustingEconomy() {
  if (activeDial !== null) return true;
  if (debouncedPushSettingsTimer !== null) return true;
  if (isPushingEconomySettings) return true;
  if (Date.now() - lastEconomyUserActionTime < 2500) return true;
  return false;
}

export function syncLocalEconomyCache() {
  if (commandCenterDetail) {
    commandCenterDetail.economy_rate = taxRate;
    commandCenterDetail.investment = investmentRate;
    commandCenterDetail.social_costs = socialCostsRate;
  }
  if (state.myKingdom) {
    state.myKingdom.economy_rate = taxRate;
    state.myKingdom.investment = investmentRate;
    state.myKingdom.social_costs = socialCostsRate;
  }
  const activeId = activeCommandCenterKingdom?.id || state.myKingdom?.country_id;
  if (activeId && state.territoryDetails && state.territoryDetails[activeId]) {
    state.territoryDetails[activeId].economy_rate = taxRate;
    state.territoryDetails[activeId].investment = investmentRate;
    state.territoryDetails[activeId].social_costs = socialCostsRate;
  }
}

export function closeKingdomCommandCenter() {
  const cc = document.getElementById("kingdom-command-center");
  if (cc) cc.classList.add("hidden");
  stopTerritoryRoundRobinUpdater();
  stopPopulationMileometerTicker();
  activeCommandCenterKingdom = null;
  lastEconomyUserActionTime = 0;
  if (debouncedPushSettingsTimer) {
    clearTimeout(debouncedPushSettingsTimer);
    debouncedPushSettingsTimer = null;
  }
  isPushingEconomySettings = false;
}

export function getPlayerOwnedTerritories() {
  if (typeof isPureOverseer === "function" && isPureOverseer()) return [];
  const owned = (state.kingdoms || []).filter((k) => isCountryOwnedByCurrentUser(k));
  if (owned.length > 0) return owned;
  if (state.myKingdom && state.myKingdom.country_id) {
    const mk = (state.kingdoms || []).find((k) => k.id === state.myKingdom.country_id) || state.myKingdom;
    return [mk];
  }
  return [];
}

export function renderTerritoryPills() {
  const container = document.getElementById("cc-territory-pills");
  if (!container) return;
  const owned = getPlayerOwnedTerritories();
  if (!owned || owned.length <= 1) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";
  const activeId = activeCommandCenterKingdom?.id || state.myKingdom?.country_id;

  container.innerHTML = owned.map((t) => {
    const isActive = t.id === activeId;
    const name = t.name || t.code;
    const color = t.color || "#ffd700";
    return `
      <button type="button" class="cc-territory-pill ${isActive ? "active" : ""}" data-territory-id="${t.id}" onclick="switchActiveTerritory(${t.id})">
        <span class="cc-territory-dot" style="background-color: ${color}"></span>
        <span>${escapeHtml(name)}</span>
      </button>
    `;
  }).join("");
}

export function switchActiveTerritory(territoryId) {
  const territory = (state.kingdoms || []).find((k) => k.id === territoryId);
  if (!territory) return;
  lastEconomyUserActionTime = 0;
  if (debouncedPushSettingsTimer) {
    clearTimeout(debouncedPushSettingsTimer);
    debouncedPushSettingsTimer = null;
  }
  isPushingEconomySettings = false;
  activeCommandCenterKingdom = territory;
  renderTerritoryPills();
  applyLiveCommandCenterUpdate(territory);
  stepTerritoryRoundRobin(true);
}
window.switchActiveTerritory = switchActiveTerritory;

export async function openKingdomCommandCenter(kingdom, bay = "all") {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal) return;

  if (!kingdom) {
    const owned = getPlayerOwnedTerritories();
    kingdom = activeCommandCenterKingdom || (owned.length > 0 ? owned[0] : null);
  }
  if (!kingdom) return;

  lastEconomyUserActionTime = 0;
  if (debouncedPushSettingsTimer) {
    clearTimeout(debouncedPushSettingsTimer);
    debouncedPushSettingsTimer = null;
  }
  isPushingEconomySettings = false;

  activeCommandCenterKingdom = kingdom;
  renderTerritoryPills();
  applyLiveCommandCenterUpdate(kingdom);

  // Initialize and start rotational mileometer ticker for population
  const popVal = document.getElementById("cc-meter-pop-val");
  if (popVal) {
    syncPopulationMileometerAnchor(kingdom.population ?? 1000);
    startPopulationMileometerTicker(popVal);
  }

  // Wire controls and meters
  renderMeters();
  wireConsoleDials();
  setCompassSide(compassDirection, true);
  switchConsoleBay(bay);
  modal.classList.remove("hidden");

  // Start non-queuing round-robin background updater & do immediate initial fetch
  startTerritoryRoundRobinUpdater();
  stepTerritoryRoundRobin(true);

  // Fetch diplomatic relations
  try {
    const res = await apiGetDiplomacy();
    if (res.ok) {
      const relations = await res.json();
      renderDiplomacyLedger(relations);
    }
  } catch (err) {
    console.error("Error fetching diplomacy:", err);
  }

  selectRecruitTier(selectedRecruitTier || "levy");
}

export function applyLiveCommandCenterUpdate(kingdom) {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal || modal.classList.contains("hidden")) return;
  if (!kingdom) return;

  const pop = kingdom.population ?? 1000;
  const resAmt = kingdom.resources ?? 500;
  const central = kingdom.troops ?? state.troops[kingdom.id]?.central ?? 0;
  const borders = state.troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };
  if (typeof kingdom.markets === "number") marketsLevel = kingdom.markets;
  if (typeof kingdom.infrastructure === "number") infraLevel = kingdom.infrastructure;

  renderMeters();
  setMeter("cc-meter-population", pop, 5000);
  setMeter("cc-meter-resources", resAmt, 3000);
  setMeter("cc-meter-troops", central, 200);

  const popVal = document.getElementById("cc-meter-pop-val");
  if (popVal) syncPopulationMileometerAnchor(pop);
  const resVal = document.getElementById("cc-meter-res-val");
  if (resVal) resVal.textContent = resAmt.toLocaleString();
  const troopVal = document.getElementById("cc-meter-troop-val");
  if (troopVal) troopVal.textContent = central.toLocaleString();

  // Safely sync detailed cache with live broadcast
  const detail = commandCenterDetail || kingdom;
  if (commandCenterDetail) {
    if (kingdom.troops_levy !== undefined) commandCenterDetail.troops_levy = kingdom.troops_levy;
    if (kingdom.troops_regular !== undefined) commandCenterDetail.troops_regular = kingdom.troops_regular;
    if (kingdom.troops_elite !== undefined) commandCenterDetail.troops_elite = kingdom.troops_elite;
    if (kingdom.fort_n !== undefined) commandCenterDetail.fort_n = kingdom.fort_n;
    if (kingdom.fort_s !== undefined) commandCenterDetail.fort_s = kingdom.fort_s;
    if (kingdom.fort_e !== undefined) commandCenterDetail.fort_e = kingdom.fort_e;
    if (kingdom.fort_w !== undefined) commandCenterDetail.fort_w = kingdom.fort_w;
    if (kingdom.economy) commandCenterDetail.economy = kingdom.economy;
  }

  const levy = kingdom.troops_levy ?? detail?.troops_levy ?? 0;
  const regular = kingdom.troops_regular ?? detail?.troops_regular ?? (kingdom.troops ?? central);
  const elite = kingdom.troops_elite ?? detail?.troops_elite ?? 0;
  const levyEl = document.getElementById("cc-troops-levy");
  if (levyEl) levyEl.textContent = levy.toLocaleString();
  const regEl = document.getElementById("cc-troops-regular");
  if (regEl) regEl.textContent = regular.toLocaleString();
  const eliteEl = document.getElementById("cc-troops-elite");
  if (eliteEl) eliteEl.textContent = elite.toLocaleString();

  const tierBadge = document.getElementById("cc-army-tier");
  if (tierBadge) {
    let tier = "MILITIA";
    if (elite >= 20) tier = "ROYAL GUARD";
    else if (regular >= 50) tier = "TERCIOS";
    else if (regular > 0) tier = "LINE REGULARS";
    else if (levy > 0) tier = "CONSCRIPT LEVY";
    tierBadge.textContent = tier;
  }

  const fortN = kingdom.fort_n ?? detail?.fort_n ?? 0;
  const fortS = kingdom.fort_s ?? detail?.fort_s ?? 0;
  const fortE = kingdom.fort_e ?? detail?.fort_e ?? 0;
  const fortW = kingdom.fort_w ?? detail?.fort_w ?? 0;
  const fortNames = ["Outpost", "Bastion", "Citadel", "Star Fort", "Imperial Stronghold"];
  const updateBadge = (dir, val) => {
    const el = document.getElementById(`cc-fort-badge-${dir.toLowerCase()}`);
    if (el) {
      const name = fortNames[Math.min(val, fortNames.length - 1)];
      el.textContent = `🏰 Tier ${val} (${name})`;
      if (val > 0) el.classList.add("fort-active");
      else el.classList.remove("fort-active");
    }
  };
  updateBadge("N", fortN);
  updateBadge("S", fortS);
  updateBadge("E", fortE);
  updateBadge("W", fortW);

  updateFortifyButtonLabel();

  if (kingdom.economy) {
    updateDerivedEconomyUI(
      kingdom.economy.gdp,
      kingdom.economy.currency_value,
      kingdom.economy.inflation_rate,
      kingdom.economy.effective_balance ?? kingdom.economy.budget_balance
    );
    const balEl = document.getElementById("cc-budget-balance");
    if (balEl) {
      const b = kingdom.economy.effective_balance ?? Math.max(0, kingdom.economy.budget_balance || 0);
      balEl.textContent = `+${b.toLocaleString()}/tick`;
      balEl.classList.remove("negative");
    }
  }

  updateStepperDisplay();
  updateBorderGarrisonPods(borders);
  updateEconomyHintsLive();

  const minimap = document.getElementById("cc-minimap");
  if (minimap) {
    const ctx = minimap.getContext("2d");
    ctx.clearRect(0, 0, minimap.width, minimap.height);
    renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
  }
}

export function applyDetailedCommandCenterData(kingdom, detail) {
  commandCenterDetail = detail;

  const kingdomNameEl = document.getElementById("cc-kingdom-name");
  if (kingdomNameEl) kingdomNameEl.textContent = (detail?.name || kingdom.name || "My Kingdom");

  const codeEl = document.getElementById("cc-kingdom-code");
  if (codeEl) codeEl.textContent = (detail?.code || kingdom.code || "REALM");

  const rulerEl = document.getElementById("cc-ruler-name");
  if (rulerEl) {
    rulerEl.textContent = state.currentUser ? `Lord ${state.currentUser.username}` : "Sovereign";
  }

  const crestEl = document.getElementById("cc-realm-crest");
  if (crestEl && (detail?.color || kingdom.color)) {
    crestEl.style.filter = `drop-shadow(0 0 10px ${detail?.color || kingdom.color})`;
  }

  const pop = detail?.population ?? kingdom.population ?? 1000;
  const resAmt = detail?.resources ?? kingdom.resources ?? 500;
  const central = detail?.central_troops ?? state.troops[kingdom.id]?.central ?? 0;
  const borders = detail?.border_troops ?? state.troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };
  marketsLevel = detail?.markets || 0;
  infraLevel = detail?.infrastructure || 0;

  renderMeters();
  setMeter("cc-meter-population", pop, 5000);
  setMeter("cc-meter-resources", resAmt, 3000);
  setMeter("cc-meter-troops", central, 200);

  const popVal = document.getElementById("cc-meter-pop-val");
  if (popVal) syncPopulationMileometerAnchor(pop);
  const resVal = document.getElementById("cc-meter-res-val");
  if (resVal) resVal.textContent = resAmt.toLocaleString();
  const troopVal = document.getElementById("cc-meter-troop-val");
  if (troopVal) troopVal.textContent = central.toLocaleString();

  const levy = detail?.troops_levy ?? 0;
  const regular = detail?.troops_regular ?? (detail?.troops ?? central);
  const elite = detail?.troops_elite ?? 0;
  const levyEl = document.getElementById("cc-troops-levy");
  if (levyEl) levyEl.textContent = levy.toLocaleString();
  const regEl = document.getElementById("cc-troops-regular");
  if (regEl) regEl.textContent = regular.toLocaleString();
  const eliteEl = document.getElementById("cc-troops-elite");
  if (eliteEl) eliteEl.textContent = elite.toLocaleString();

  const tierBadge = document.getElementById("cc-army-tier");
  if (tierBadge) {
    let tier = "MILITIA";
    if (elite >= 20) tier = "ROYAL GUARD";
    else if (regular >= 50) tier = "TERCIOS";
    else if (regular > 0) tier = "LINE REGULARS";
    else if (levy > 0) tier = "CONSCRIPT LEVY";
    tierBadge.textContent = tier;
  }

  const fortN = detail?.fort_n ?? 0;
  const fortS = detail?.fort_s ?? 0;
  const fortE = detail?.fort_e ?? 0;
  const fortW = detail?.fort_w ?? 0;
  const fortNames = ["Outpost", "Bastion", "Citadel", "Star Fort", "Imperial Stronghold"];
  const updateBadge = (dir, val) => {
    const el = document.getElementById(`cc-fort-badge-${dir.toLowerCase()}`);
    if (el) {
      const name = fortNames[Math.min(val, fortNames.length - 1)];
      el.textContent = `🏰 Tier ${val} (${name})`;
      if (val > 0) el.classList.add("fort-active");
      else el.classList.remove("fort-active");
    }
  };
  updateBadge("N", fortN);
  updateBadge("S", fortS);
  updateBadge("E", fortE);
  updateBadge("W", fortW);

  updateFortifyButtonLabel();

  if (!isUserAdjustingEconomy()) {
    if (typeof detail?.economy_rate === "number") setTaxRate(detail.economy_rate, false);
    if (typeof detail?.investment === "number") setInvestmentRate(detail.investment, false);
    if (typeof detail?.social_costs === "number") setSocialRate(detail.social_costs, false);
  } else {
    // Keep local cache synced with user's active choice
    if (detail) {
      detail.economy_rate = taxRate;
      detail.investment = investmentRate;
      detail.social_costs = socialCostsRate;
    }
  }

  updateStepperDisplay();
  updateBorderGarrisonPods(borders);
  updateEconomyHintsLive();

  const minimap = document.getElementById("cc-minimap");
  if (minimap) {
    const ctx = minimap.getContext("2d");
    ctx.clearRect(0, 0, minimap.width, minimap.height);
    renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
  }
}

export async function stepTerritoryRoundRobin(forceActive = false) {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal || modal.classList.contains("hidden")) {
    stopTerritoryRoundRobinUpdater();
    return;
  }

  const owned = getPlayerOwnedTerritories();
  if (!owned || owned.length === 0) return;

  // Non-queuing check: if a fetch is already in flight, mark pending and skip
  if (isTerritoryFetching) {
    isTerritoryFetchPending = true;
    return;
  }

  isTerritoryFetching = true;
  isTerritoryFetchPending = false;

  // Round-robin selection: cycle through all owned territories so each is updated every period
  let targetTerritory = activeCommandCenterKingdom || owned[0];
  if (!forceActive && owned.length > 1) {
    targetTerritory = owned[roundRobinTerritoryIndex % owned.length];
    roundRobinTerritoryIndex = (roundRobinTerritoryIndex + 1) % owned.length;
  }

  try {
    const res = await apiGetKingdomDetail(targetTerritory.id);
    if (res.ok) {
      const detail = await res.json();
      if (!state.territoryDetails) state.territoryDetails = {};
      state.territoryDetails[targetTerritory.id] = detail;

      if (detail.central_troops != null || detail.border_troops) {
        state.troops[targetTerritory.id] = {
          central: detail.central_troops ?? 0,
          borders: detail.border_troops ?? { N: 0, S: 0, E: 0, W: 0 },
        };
      }

      const activeId = activeCommandCenterKingdom?.id || state.myKingdom?.country_id;
      if (targetTerritory.id === activeId) {
        applyDetailedCommandCenterData(targetTerritory, detail);
      }
      renderTerritoryPills();
    }
  } catch (err) {
    console.error("Round-robin territory update error:", err);
  } finally {
    isTerritoryFetching = false;
    if (isTerritoryFetchPending) {
      isTerritoryFetchPending = false;
      setTimeout(() => stepTerritoryRoundRobin(), 200);
    }
  }
}

export function startTerritoryRoundRobinUpdater() {
  if (territoryPeriodicTimer) return;
  // Non-queuing periodic round-robin updater: runs every 1.5s
  territoryPeriodicTimer = setInterval(() => {
    stepTerritoryRoundRobin();
  }, 1500);
}

export function stopTerritoryRoundRobinUpdater() {
  if (territoryPeriodicTimer) {
    clearInterval(territoryPeriodicTimer);
    territoryPeriodicTimer = null;
  }
  isTerritoryFetchPending = false;
}

export function refreshKingdomCommandCenter(liveKingdom = null) {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal || modal.classList.contains("hidden")) return;

  const kingdom = liveKingdom || activeCommandCenterKingdom || (state.myKingdom ? ((state.kingdoms || []).find((k) => k.id === state.myKingdom.country_id) || state.myKingdom) : null);
  if (!kingdom) return;

  // Apply instant zero-lag update from authoritative WebSocket state
  applyLiveCommandCenterUpdate(kingdom);
}

export function dialValueFromPoint(dialEl, clientX, clientY) {
  const rect = dialEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (deg < DIAL_BASE_DEG) return deg <= DIAL_BASE_DEG / 2 ? 100 : 0;
  const raw = (deg - DIAL_BASE_DEG) / DIAL_DEG_PER_UNIT;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function wireConsoleDials() {
  if (dialsWired) return;
  dialsWired = true;

  const dialConfigs = [
    { id: "cc-economy-dial", type: "tax", set: setTaxRate, get: () => taxRate },
    { id: "cc-investment-dial", type: "investment", set: setInvestmentRate, get: () => investmentRate },
    { id: "cc-social-dial", type: "social", set: setSocialRate, get: () => socialCostsRate },
  ];

  dialConfigs.forEach((cfg) => {
    const dial = document.getElementById(cfg.id);
    if (!dial) return;

    const ticks = dial.querySelector(".dial-ticks");
    if (ticks && !ticks.children.length) {
      ticks.style.transform = `rotate(${DIAL_BASE_DEG}deg)`;
      for (let v = 0; v <= 100; v += 10) {
        const t = document.createElement("span");
        if (v % 25 === 0) t.className = "tick-major";
        t.style.transform = `rotate(${v * DIAL_DEG_PER_UNIT}deg)`;
        ticks.appendChild(t);
      }
    }

    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.transform = `rotate(${DIAL_BASE_DEG}deg)`;

    const onStart = (e) => {
      activeDial = cfg;
      lastEconomyUserActionTime = Date.now();
      const pt = e.touches && e.touches.length ? e.touches[0] : e;
      cfg.set(dialValueFromPoint(dial, pt.clientX, pt.clientY), false);
      syncLocalEconomyCache();
      e.preventDefault();
    };

    dial.addEventListener("mousedown", onStart);
    dial.addEventListener("touchstart", onStart, { passive: false });

    dial.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        lastEconomyUserActionTime = Date.now();
        const delta = e.deltaY < 0 ? 2 : -2;
        cfg.set(cfg.get() + delta, true);
        syncLocalEconomyCache();
      },
      { passive: false }
    );

    dial.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        lastEconomyUserActionTime = Date.now();
        cfg.set(cfg.get() + step, true);
        syncLocalEconomyCache();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        lastEconomyUserActionTime = Date.now();
        cfg.set(cfg.get() - step, true);
        syncLocalEconomyCache();
      }
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (!activeDial) return;
    lastEconomyUserActionTime = Date.now();
    const dial = document.getElementById(activeDial.id);
    if (dial) {
      activeDial.set(dialValueFromPoint(dial, e.clientX, e.clientY), false);
      syncLocalEconomyCache();
    }
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!activeDial || !e.touches.length) return;
      lastEconomyUserActionTime = Date.now();
      const dial = document.getElementById(activeDial.id);
      if (dial) {
        activeDial.set(dialValueFromPoint(dial, e.touches[0].clientX, e.touches[0].clientY), false);
        syncLocalEconomyCache();
      }
    },
    { passive: false }
  );

  const onEnd = () => {
    if (!activeDial) return;
    activeDial = null;
    lastEconomyUserActionTime = Date.now();
    syncLocalEconomyCache();
    schedulePushEconomySettings(50);
  };
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);

  wireCompassDial();
  wireTargetDial();
}

export function setTaxRate(value, push = true) {
  taxRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-economy-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + taxRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${taxRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-economy-dial-value");
  if (readout) readout.textContent = taxRate;

  updateEconomyHintsLive();
  if (push) {
    lastEconomyUserActionTime = Date.now();
    syncLocalEconomyCache();
    schedulePushEconomySettings(200);
  }
}

export function setInvestmentRate(value, push = true) {
  investmentRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-investment-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + investmentRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${investmentRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-investment-dial-value");
  if (readout) readout.textContent = investmentRate;

  updateEconomyHintsLive();
  if (push) {
    lastEconomyUserActionTime = Date.now();
    syncLocalEconomyCache();
    schedulePushEconomySettings(200);
  }
}

export function setSocialRate(value, push = true) {
  socialCostsRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-social-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + socialCostsRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${socialCostsRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-social-dial-value");
  if (readout) readout.textContent = socialCostsRate;

  updateEconomyHintsLive();
  if (push) {
    lastEconomyUserActionTime = Date.now();
    syncLocalEconomyCache();
    schedulePushEconomySettings(200);
  }
}

export function schedulePushEconomySettings(delayMs = 200) {
  if (debouncedPushSettingsTimer) clearTimeout(debouncedPushSettingsTimer);
  debouncedPushSettingsTimer = setTimeout(() => {
    debouncedPushSettingsTimer = null;
    pushEconomySettings();
  }, delayMs);
}

export function pushEconomySettings() {
  if (!state.token || !state.myKingdom) return;
  const pushedTax = taxRate;
  const pushedInv = investmentRate;
  const pushedSoc = socialCostsRate;
  isPushingEconomySettings = true;
  lastEconomyUserActionTime = Date.now();

  apiSetEconomySettings(pushedTax, pushedInv, pushedSoc)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to persist economy settings");
      return res.json();
    })
    .then((data) => {
      logMessage(`Annual Budget updated: Tax ${pushedTax}%, Inv ${pushedInv}%, Social ${pushedSoc}%`);
      if (data) {
        const econObj = data.economy || data;
        const finalTax = data.economy_rate ?? pushedTax;
        const finalInv = data.investment ?? pushedInv;
        const finalSoc = data.social_costs ?? pushedSoc;

        if (commandCenterDetail) {
          commandCenterDetail.economy = econObj;
          commandCenterDetail.economy_rate = finalTax;
          commandCenterDetail.investment = finalInv;
          commandCenterDetail.social_costs = finalSoc;
        }
        if (state.myKingdom) {
          state.myKingdom.economy_rate = finalTax;
          state.myKingdom.investment = finalInv;
          state.myKingdom.social_costs = finalSoc;
        }
        const activeId = activeCommandCenterKingdom?.id || state.myKingdom?.country_id;
        if (activeId && state.territoryDetails && state.territoryDetails[activeId]) {
          state.territoryDetails[activeId].economy_rate = finalTax;
          state.territoryDetails[activeId].investment = finalInv;
          state.territoryDetails[activeId].social_costs = finalSoc;
        }

        updateDerivedEconomyUI(
          data.gdp ?? econObj.gdp,
          data.currency_value ?? econObj.currency_value,
          data.inflation_rate ?? econObj.inflation_rate,
          econObj.effective_balance ?? Math.max(0, econObj.budget_balance || 0)
        );
        updateEconomyHintsLive();
      }
    })
    .catch((err) => console.error("Error setting economy settings:", err))
    .finally(() => {
      isPushingEconomySettings = false;
    });
}

export function adjustBudgetDial(type, delta) {
  lastEconomyUserActionTime = Date.now();
  if (type === "tax") {
    setTaxRate(taxRate + delta, false);
  } else if (type === "investment") {
    setInvestmentRate(investmentRate + delta, false);
  } else if (type === "social") {
    setSocialRate(socialCostsRate + delta, false);
  }
  syncLocalEconomyCache();
  schedulePushEconomySettings(200);
}
window.adjustBudgetDial = adjustBudgetDial;

export function triggerAutoBalanceBudget() {
  const kingdom =
    activeCommandCenterKingdom ||
    (state.myKingdom && state.kingdoms.find((k) => k.id === state.myKingdom.country_id)) ||
    state.myKingdom ||
    {};
  const pop = commandCenterDetail?.population ?? kingdom.population ?? 1000;
  const tr = commandCenterDetail?.central_troops ?? kingdom.troops ?? state.troops[kingdom.id]?.central ?? 0;

  // Set tax rate to optimal non-emigration sweet spot (48%)
  const optimalTax = 48;
  const baseProductivity = 0.08;
  const infraBonus = 1.0 + (infraLevel || 0) * 0.03;
  const mktBonus = 1.0 + (marketsLevel || 0) * 0.05;
  const civilianWorkforce = Math.max(0, pop - tr);
  const estGdp = civilianWorkforce * baseProductivity * infraBonus * mktBonus * lafferJs(optimalTax);
  const estTaxRev = Math.round(estGdp * (optimalTax / 100.0) + 0.5);
  const estMktRev = (marketsLevel || 0) * 4;
  const totalRev = estTaxRev + estMktRev;
  const milUpkeep = Math.round(tr * 0.5 + 0.5);

  const availDiscretionary = Math.max(0, totalRev - milUpkeep);
  // Each 5% of investment or social costs ~1 ducat/tick (0.2 * rate)
  const maxCombinedRate = Math.min(200, Math.floor(availDiscretionary / 0.2));
  // Keep a small exchequer surplus buffer (~20% of discretionary capacity)
  const safeCombinedRate = Math.floor(maxCombinedRate * 0.8);
  const newInv = Math.min(100, Math.round(safeCombinedRate * 0.55));
  const newSoc = Math.min(100, Math.max(0, safeCombinedRate - newInv));

  lastEconomyUserActionTime = Date.now();
  setTaxRate(optimalTax, false);
  setInvestmentRate(newInv, false);
  setSocialRate(newSoc, false);
  syncLocalEconomyCache();
  schedulePushEconomySettings(50);
  showToast(`⚖️ Budget Balanced: Tax ${optimalTax}%, Investment ${newInv}%, Social ${newSoc}% (Zero Deficit)`, "success");
}
window.triggerAutoBalanceBudget = triggerAutoBalanceBudget;

export function enforceClientBalancedBudget(resOrRev, totalRevenueOrMil, militaryUpkeepOrSoc, socialExpOrInv, investmentExp) {
  let res = 0;
  let totalRevenue, militaryUpkeep, socialExp, invExp;
  if (investmentExp === undefined) {
    // 4 arguments: (totalRevenue, militaryUpkeep, socialExp, investmentExp)
    totalRevenue = resOrRev;
    militaryUpkeep = totalRevenueOrMil;
    socialExp = militaryUpkeepOrSoc;
    invExp = socialExpOrInv;
  } else {
    // 5 arguments: (res, totalRevenue, militaryUpkeep, socialExp, investmentExp)
    res = resOrRev;
    totalRevenue = totalRevenueOrMil;
    militaryUpkeep = militaryUpkeepOrSoc;
    socialExp = socialExpOrInv;
    invExp = investmentExp;
  }

  if (totalRevenue < 0) totalRevenue = 0;
  const plannedTotal = militaryUpkeep + socialExp + invExp;

  // If the kingdom has gold reserves in its treasury (res > 0), deficit spending is allowed
  // and is funded by drawing down treasury reserves.
  if (res > 0) {
    return {
      effMil: militaryUpkeep,
      effSoc: socialExp,
      effInv: invExp,
      effTotal: plannedTotal,
      effBalance: totalRevenue - plannedTotal,
      capped: false,
    };
  }

  // Once treasury is exhausted (res <= 0), no loans/debt exist in Era 1 (Hard-Specie Rule).
  // Spending is strictly clamped to total revenue.
  if (plannedTotal <= totalRevenue) {
    return {
      effMil: militaryUpkeep,
      effSoc: socialExp,
      effInv: invExp,
      effTotal: plannedTotal,
      effBalance: totalRevenue - plannedTotal,
      capped: false,
    };
  }
  if (militaryUpkeep >= totalRevenue) {
    return {
      effMil: totalRevenue,
      effSoc: 0,
      effInv: 0,
      effTotal: totalRevenue,
      effBalance: 0,
      capped: true,
    };
  }
  const remaining = totalRevenue - militaryUpkeep;
  const discretionary = socialExp + invExp;
  let effSoc = 0;
  let effInv = 0;
  if (discretionary > 0) {
    effSoc = Math.round((remaining * socialExp) / discretionary);
    if (effSoc > remaining) effSoc = remaining;
    effInv = remaining - effSoc;
  }
  const effTotal = militaryUpkeep + effSoc + effInv;
  return {
    effMil: militaryUpkeep,
    effSoc,
    effInv,
    effTotal,
    effBalance: 0,
    capped: true,
  };
}

export function computeClientPopulationPressure(pop, troops, tax, social, infra) {
  if (pop <= 0) return 0;
  let taxStress = 0;
  if (tax > 35) {
    taxStress = (tax - 35) * 1.1;
  }
  const conscriptionRatio = troops / pop;
  const milStress = conscriptionRatio * 120.0;
  const relief = social * 0.35 + infra * 4.0;
  return Math.round(Math.max(0, Math.min(100, taxStress + milStress - relief)));
}

export function computeClientMigration(pop, tax, social, infra, gdp = 0, res = 0, markets = 0, pride = 100) {
  if (pop <= 0) {
    return {
      netMigration: 0,
      wealthyMigration: 0,
      generalMigration: 0,
      wealthFactor: 0.1,
      wealthyRatio: 0.02,
      capitalDrain: 0,
      status: "STABLE",
    };
  }

  const gdpPerCap = gdp > 0 ? (gdp / pop) : 0.08;
  const gdpScore = Math.min(2.5, gdpPerCap / 0.08);
  const commScore = 1.0 + (markets || 0) * 0.20 + (infra || 0) * 0.10;
  const resPerCap = pop > 0 ? (res / pop) : 0;
  const solvencyScore = Math.min(2.0, 0.5 + resPerCap * 1000.0);
  const prideScore = 0.60 + 0.40 * (pride / 100.0);

  const composite = (gdpScore * 0.35 + commScore * 0.35 + solvencyScore * 0.15) * (prideScore * 0.15 + 0.85);
  const wealthFactor = Math.max(0.0, Math.min(1.0, (composite - 0.50) / 2.0));
  const wealthyRatio = 0.02 + wealthFactor * 0.16;

  const wealthyPop = Math.round(pop * wealthyRatio);
  const generalPop = Math.max(0, pop - wealthyPop);

  let wealthyMig = 0;
  let generalMig = 0;
  let capitalDrain = 0;
  let status = "STABLE";

  if (tax <= 20) {
    status = "CAPITAL_HAVEN";
    const shelterPull = (21 - tax) / 20.0;
    const commPull = 1.0 + (markets || 0) * 0.25 + (infra || 0) * 0.15;
    const prideBonus = 0.70 + 0.30 * (pride / 100.0);
    const wRate = 0.015 * shelterPull * commPull * prideBonus;
    wealthyMig = Math.round(wealthyPop * wRate);
    if (wealthyMig < 1 && tax <= 15 && wealthyPop > 10) wealthyMig = 1;

    const gRate = 0.003 * shelterPull * (1.0 + (infra || 0) * 0.20 + (social || 0) * 0.005);
    generalMig = Math.round(generalPop * gRate);
    capitalDrain = wealthyMig * 5;
  } else if (tax <= 35) {
    status = "FAIR_PROSPERITY";
    const taxAdvantage = (36 - tax) / 15.0;
    const civicFactor = 1.0 + (infra || 0) * 0.20 + (social || 0) * 0.015;
    const prideBonus = 0.70 + 0.30 * (pride / 100.0);
    const gRate = 0.005 * taxAdvantage * civicFactor * prideBonus;
    generalMig = Math.round(generalPop * gRate);
    if (generalMig < 1) generalMig = 1;

    const wRate = 0.002 * taxAdvantage * (1.0 + (markets || 0) * 0.15) * prideBonus;
    wealthyMig = Math.round(wealthyPop * wRate);
    capitalDrain = wealthyMig * 3;
  } else if (tax <= 58) {
    status = "MODERATE_TAX";
    if (social >= 50) {
      const welfarePull = (social - 50) * 0.00004;
      generalMig = Math.round(generalPop * welfarePull);
    }
  } else if (tax <= 68) {
    status = "HEAVY_DRAG";
    const excess = tax - 58;
    const relief = (social || 0) * 0.10;
    const effExcess = Math.max(0, excess - relief);
    const wRate = (effExcess / 10.0) * 0.008;
    wealthyMig = -Math.ceil(wealthyPop * wRate);
    const gRate = (effExcess / 10.0) * 0.004;
    generalMig = -Math.ceil(generalPop * gRate);
    capitalDrain = wealthyMig * 5;
  } else {
    status = "WEALTH_FLIGHT";
    const excess = tax - 60;
    const relief = (social || 0) * 0.12;
    const effExcess = Math.max(1.0, excess - relief);
    const prideDrag = 1.0 + (1.0 - pride / 100.0) * 0.5;
    const wRate = (effExcess / 32.0) * 0.030 * prideDrag;
    wealthyMig = -Math.ceil(wealthyPop * wRate);
    if (wealthyMig > -1) wealthyMig = -1;

    const gRate = (effExcess / 32.0) * 0.012 * prideDrag;
    generalMig = -Math.ceil(generalPop * gRate);
    if (generalMig > -1) generalMig = -1;
    capitalDrain = wealthyMig * 10;
  }

  const netMigration = wealthyMig + generalMig;
  return {
    netMigration,
    wealthyMigration: wealthyMig,
    generalMigration: generalMig,
    wealthFactor,
    wealthyRatio,
    capitalDrain,
    status,
  };
}

export function setEconomyRate(value, push = true) {
  setTaxRate(value, push);
}

export function pushEconomyRate() {
  schedulePushEconomySettings();
}

export function performEconomyAction(direction) {
  setTaxRate(taxRate + (direction === "increase" ? 5 : -5));
}

export function lafferJs(rate) {
  const peak = 58.0;
  const alpha = 1.35;
  const beta = 0.98;
  const r = Math.max(0, Math.min(100, rate));
  const term1 = Math.pow(r / peak, alpha);
  const term2 = Math.pow((100.0 - r) / (100.0 - peak), beta);
  return term1 * term2;
}

export function updateEconomyHintsLive() {
  const kingdom =
    activeCommandCenterKingdom ||
    (state.myKingdom && state.kingdoms.find((k) => k.id === state.myKingdom.country_id)) ||
    state.myKingdom ||
    {};
  const pop = commandCenterDetail?.population ?? kingdom.population ?? 1000;
  const res = commandCenterDetail?.resources ?? kingdom.resources ?? 500;
  const tr = commandCenterDetail?.central_troops ?? kingdom.troops ?? state.troops[kingdom.id]?.central ?? 0;

  const baseProductivity = 0.08;
  const infraBonus = 1.0 + (infraLevel || 0) * 0.03;
  const mktBonus = 1.0 + (marketsLevel || 0) * 0.05;
  const invBonus = 1.0 + (investmentRate || 0) * 0.002;
  const laffer = lafferJs(taxRate);

  // Mobilized troops reduce productive civilian workforce, directly reducing GDP and tax revenue
  const civilianWorkforce = Math.max(0, pop - tr);
  const gdp = civilianWorkforce * baseProductivity * infraBonus * mktBonus * invBonus * laffer;
  const taxRevenue = Math.round(gdp * (taxRate / 100.0) + 0.5);
  const marketRevenue = (marketsLevel || 0) * 4;
  const totalRevenue = taxRevenue + marketRevenue;

  const levy = commandCenterDetail?.troops_levy ?? 0;
  const regular = commandCenterDetail?.troops_regular ?? tr;
  const elite = commandCenterDetail?.troops_elite ?? 0;
  const milUpkeep = (levy + regular + elite > 0)
    ? Math.round(levy * 2.0 + regular * 6.0 + elite * 18.0)
    : Math.round(tr * 4.0);

  const socExp = Math.round(socialCostsRate * 2.0 + gdp * (socialCostsRate / 100.0) * 0.30);
  const invExp = Math.round(investmentRate * 2.0 + gdp * (investmentRate / 100.0) * 0.30);

  // Enforce Layer 1 Hard-Specie Fiscal Rules
  const cappedBudget = enforceClientBalancedBudget(res, totalRevenue, milUpkeep, socExp, invExp);
  const popPressure = computeClientPopulationPressure(pop, tr, taxRate, socialCostsRate, infraLevel || 0);
  const pride = commandCenterDetail?.entrepreneurial_pride ?? kingdom.entrepreneurial_pride ?? 100;
  const migInfo = computeClientMigration(pop, taxRate, socialCostsRate, infraLevel || 0, gdp, res, marketsLevel || 0, pride);
  const netMigration = migInfo.netMigration;

  let value = 1.0;
  if (gdp > 0) value = res / gdp / 5.0;

  let inflation = socialCostsRate * 0.02 + investmentRate * 0.005;
  if (inflation > 100) inflation = 100;

  const taxHint = document.getElementById("cc-tax-impact-hint");
  if (taxHint) {
    if (migInfo.status === "WEALTH_FLIGHT") {
      taxHint.textContent = `Rev: +${taxRevenue.toLocaleString()}/yr (🚨 Wealth Flight: ${migInfo.wealthyMigration.toLocaleString()}/yr)`;
      taxHint.style.color = "#ff6b6b";
    } else if (migInfo.status === "CAPITAL_HAVEN") {
      taxHint.textContent = `Rev: +${taxRevenue.toLocaleString()}/yr (🏛️ Capital Haven: +${migInfo.wealthyMigration.toLocaleString()} magnates/yr)`;
      taxHint.style.color = "#38bdf8";
    } else if (migInfo.status === "FAIR_PROSPERITY") {
      taxHint.textContent = `Rev: +${taxRevenue.toLocaleString()}/yr (✨ Settlers: +${netMigration.toLocaleString()}/yr)`;
      taxHint.style.color = "#4ade80";
    } else {
      taxHint.textContent = `Tax Revenue: +${taxRevenue.toLocaleString()}/yr`;
      taxHint.style.color = "#4ecdc4";
    }
  }

  const invHint = document.getElementById("cc-investment-hint");
  if (invHint) {
    const capNote = cappedBudget.effInv < invExp ? ` (Capped: -${cappedBudget.effInv})` : ` (-${cappedBudget.effInv} ducats/yr)`;
    invHint.textContent = `Colonial Ventures: ${capNote}`;
  }

  const socHint = document.getElementById("cc-social-hint");
  if (socHint) {
    const capNote = cappedBudget.effSoc < socExp ? ` (Capped: -${cappedBudget.effSoc})` : `-${cappedBudget.effSoc} ducats/yr`;
    socHint.textContent = `Cathedrals & Guilds: ${capNote}`;
  }

  const popGrowthEl = document.getElementById("cc-pop-growth");
  if (popGrowthEl) {
    const baseCap = 15000000 * (1.0 + (infraLevel || 0) * 0.15 + (marketsLevel || 0) * 0.10);
    const effectiveCap = Math.max(baseCap, 3000000);
    let growth = pop * 0.005 * (gdp / (pop * 0.08 || 1));
    growth += (investmentRate + socialCostsRate) * 0.0005;
    if (taxRate > 50) {
      growth *= Math.max(0.15, 1.0 - (taxRate - 50) / 50.0);
    }
    growth *= Math.max(0, 1.0 - pop / effectiveCap);
    const naturalGrowth = Math.max(0, Math.round(growth));
    const netPopChange = naturalGrowth + netMigration;
    setPopulationMileometerRate(netPopChange);
    popGrowthEl.textContent = `${netPopChange >= 0 ? "+" : ""}${netPopChange.toLocaleString()}/yr (Mig: ${netMigration >= 0 ? "+" : ""}${netMigration.toLocaleString()})`;
    popGrowthEl.style.color = netPopChange < 0 ? "#ff6b6b" : "#4ade80";
  }

  // Update Dynamic Table Header with actual simulation years
  const curSimYear = Math.floor(getCurrentGameYear() || state.timeline?.sim_year || 1500);
  const lastSimYear = curSimYear - 1;
  const thLast = document.getElementById("cc-th-last-year");
  if (thLast) {
    thLast.textContent = `Last Year (${lastSimYear >= 1500 ? lastSimYear : 1500} Actual)`;
  }
  const thThis = document.getElementById("cc-th-this-year");
  if (thThis) {
    thThis.textContent = `This Year (${curSimYear} Projected / Capped)`;
  }

  // Populate Last Year vs. This Year Annual Budget Comparison Table
  const srvEcon = commandCenterDetail?.economy || kingdom.economy || {};
  const hasRecordedActuals = srvEcon.last_tax_revenue != null && (srvEcon.last_tax_revenue > 0 || srvEcon.last_total_exp > 0 || srvEcon.last_market_income > 0);
  const lyTax = hasRecordedActuals ? srvEcon.last_tax_revenue : (srvEcon.last_tax_revenue ?? taxRevenue);
  const lyMkt = hasRecordedActuals ? srvEcon.last_market_income : (srvEcon.last_market_income ?? marketRevenue);
  const lyTotalRev = lyTax + lyMkt;
  const lyMil = hasRecordedActuals ? srvEcon.last_military_exp : (srvEcon.last_military_exp ?? cappedBudget.effMil);
  const lyInv = hasRecordedActuals ? srvEcon.last_investment_exp : (srvEcon.last_investment_exp ?? cappedBudget.effInv);
  const lySoc = hasRecordedActuals ? srvEcon.last_social_exp : (srvEcon.last_social_exp ?? cappedBudget.effSoc);
  const lyTotalExp = hasRecordedActuals ? srvEcon.last_total_exp : (lyMil + lyInv + lySoc);
  const lyBal = hasRecordedActuals ? srvEcon.last_budget_balance : (srvEcon.last_budget_balance ?? (lyTotalRev - lyTotalExp));
  const lyMig = hasRecordedActuals ? srvEcon.last_migration : (srvEcon.last_migration ?? netMigration);

  const setCell = (id, html, className = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (className !== undefined) {
      el.className = className;
    }
  };

  setCell("cc-ly-tax-rev", `+${lyTax.toLocaleString()}`, "val-pos");
  setCell("cc-ty-tax-rev", `+${taxRevenue.toLocaleString()}`, "val-pos");

  setCell("cc-ly-mkt-rev", `+${lyMkt.toLocaleString()}`, "val-pos");
  setCell("cc-ty-mkt-rev", `+${marketRevenue.toLocaleString()}`, "val-pos");

  setCell("cc-ly-total-rev", `<strong>+${lyTotalRev.toLocaleString()}</strong>`, "val-pos");
  setCell("cc-ty-total-rev", `<strong>+${totalRevenue.toLocaleString()}</strong>`, "val-pos");

  const milCapBadge = cappedBudget.effMil < milUpkeep ? ` <span class="cap-tag" title="Planned ${milUpkeep}; unpaid troops demobilize">⚠️ RATIONED</span>` : "";
  setCell("cc-ly-mil-exp", `-${lyMil.toLocaleString()}`, "val-neg");
  setCell("cc-ty-mil-exp", `-${cappedBudget.effMil.toLocaleString()}${milCapBadge}`, "val-neg");

  const invCapBadge = cappedBudget.effInv < invExp ? ` <span class="cap-tag" title="Planned ${invExp}; capped to prevent deficit">CAPPED</span>` : "";
  setCell("cc-ly-inv-exp", `-${lyInv.toLocaleString()}`, "val-neg");
  setCell("cc-ty-inv-exp", `-${cappedBudget.effInv.toLocaleString()}${invCapBadge}`, "val-neg");

  const socCapBadge = cappedBudget.effSoc < socExp ? ` <span class="cap-tag" title="Planned ${socExp}; capped to prevent deficit">CAPPED</span>` : "";
  setCell("cc-ly-soc-exp", `-${lySoc.toLocaleString()}`, "val-neg");
  setCell("cc-ty-soc-exp", `-${cappedBudget.effSoc.toLocaleString()}${socCapBadge}`, "val-neg");

  setCell("cc-ly-total-exp", `<strong>-${lyTotalExp.toLocaleString()}</strong>`, "val-neg");
  setCell("cc-ty-total-exp", `<strong>-${cappedBudget.effTotal.toLocaleString()}</strong>`, "val-neg");

  const tyBal = cappedBudget.effBalance;
  const lyBalSign = lyBal < 0 ? "-" : "+";
  const tyBalSign = tyBal < 0 ? "-" : "+";
  const lyBalClass = lyBal < 0 ? "val-neg" : "val-surplus";
  const tyBalClass = tyBal < 0 ? "val-neg" : "val-surplus";
  const tyBalSuffix = (tyBal < 0 && res > 0) ? " (Draining Reserves)" : "";

  setCell("cc-ly-balance", `<strong>${lyBalSign}${Math.abs(lyBal).toLocaleString()}</strong>`, lyBalClass);
  setCell("cc-ty-balance", `<strong>${tyBalSign}${Math.abs(tyBal).toLocaleString()}${tyBalSuffix}</strong>`, tyBalClass);

  const balRow = document.getElementById("cc-balance-row");
  const balLabel = document.getElementById("cc-balance-label");
  if (balRow) {
    if (tyBal < 0) {
      balRow.className = "row-deficit";
      if (balLabel) balLabel.innerHTML = `<strong>Exchequer Deficit (Draining Reserves)</strong>`;
    } else {
      balRow.className = "row-surplus";
      if (balLabel) balLabel.innerHTML = `<strong>Exchequer Surplus (No Deficit)</strong>`;
    }
  }

  const popPressEl = document.getElementById("cc-pop-pressure-val");
  if (popPressEl) {
    popPressEl.textContent = `Stress ${popPressure}%`;
    popPressEl.style.color = popPressure >= 65 ? "#ff6b6b" : popPressure >= 35 ? "#fbbf24" : "#4ade80";
  }

  setCell(
    "cc-ly-migration",
    `${lyMig > 0 ? "+" : ""}${lyMig.toLocaleString()}/yr`,
    lyMig < 0 ? "val-neg" : lyMig > 0 ? "val-pos" : ""
  );
  const migBreakdownBadge = (migInfo.wealthyMigration !== 0)
    ? ` <span class="cap-tag" title="👑 ${(migInfo.wealthyRatio * 100).toFixed(1)}% Wealthy class (${migInfo.wealthyMigration >= 0 ? "+" : ""}${migInfo.wealthyMigration.toLocaleString()}/yr), 👥 Settlers: ${migInfo.generalMigration >= 0 ? "+" : ""}${migInfo.generalMigration.toLocaleString()}/yr">👑 ${(migInfo.wealthyRatio * 100).toFixed(1)}% Wealthy</span>`
    : ` <span class="cap-tag" title="👑 ${(migInfo.wealthyRatio * 100).toFixed(1)}% Wealthy class">👑 ${(migInfo.wealthyRatio * 100).toFixed(1)}% Wealthy</span>`;
  setCell(
    "cc-ty-migration",
    `${netMigration > 0 ? "+" : ""}${netMigration.toLocaleString()}/yr${migBreakdownBadge}`,
    netMigration < 0 ? "val-neg" : netMigration > 0 ? "val-pos" : ""
  );

  // Alert banner for No-Deficit Rationing, Deficit Drain & Tax Migration
  const alertBanner = document.getElementById("cc-budget-alert-banner");
  if (alertBanner) {
    const alerts = [];
    if (res <= 0 && (milUpkeep + invExp + socExp) > totalRevenue) {
      if (cappedBudget.effMil < milUpkeep) {
        alerts.push(`🚨 <strong>TREASURY EXHAUSTED & UNPAID TROOPS:</strong> Zero gold reserves in treasury! Revenue (${totalRevenue.toLocaleString()}) cannot cover military upkeep (${milUpkeep.toLocaleString()}). Unpaid troops are deserting!`);
      } else {
        alerts.push(`⚖️ <strong>TREASURY EXHAUSTED (NO BORROWING):</strong> Zero gold reserves remaining! Discretionary civic spending capped to ${(cappedBudget.effInv + cappedBudget.effSoc).toLocaleString()} ducats to prevent deficits until 1860.`);
      }
    } else if (res > 0 && cappedBudget.effBalance < 0) {
      alerts.push(`📉 <strong>DEFICIT FINANCING:</strong> Operating at an annual deficit of <strong>-${Math.abs(cappedBudget.effBalance).toLocaleString()} ducats/yr</strong>! Draining treasury reserves (holds ${res.toLocaleString()} gold).`);
    }

    if (migInfo.status === "WEALTH_FLIGHT") {
      alerts.push(`🚨 <strong>CAPITAL & WEALTH FLIGHT:</strong> Punitive ${taxRate}% tax rate is driving <strong>${Math.abs(migInfo.wealthyMigration).toLocaleString()} wealthy burghers/yr</strong> into foreign exile (${migInfo.capitalDrain.toLocaleString()} ducats capital drain)!`);
    } else if (migInfo.status === "CAPITAL_HAVEN") {
      alerts.push(`🏛️ <strong>CAPITAL HAVEN:</strong> Competitive ${taxRate}% tax rate is attracting foreign merchant capital and <strong>+${migInfo.wealthyMigration.toLocaleString()} wealthy magnates/yr</strong> (+${migInfo.capitalDrain.toLocaleString()} ducats capital injection)!`);
    } else if (migInfo.status === "FAIR_PROSPERITY") {
      alerts.push(`✨ <strong>FAIR TAXATION PROSPERITY:</strong> Balanced ${taxRate}% tax rate encourages civic immigration of <strong>+${netMigration.toLocaleString()} settlers/yr</strong>.`);
    } else if (migInfo.status === "HEAVY_DRAG") {
      alerts.push(`⚠️ <strong>HEAVY TAX BURDEN:</strong> High ${taxRate}% tax rate is discouraging commerce and causing <strong>${Math.abs(netMigration).toLocaleString()} emigrants/yr</strong> to seek opportunity abroad.`);
    }

    if (alerts.length > 0) {
      alertBanner.innerHTML = alerts.join("<br>");
      alertBanner.classList.remove("hidden");
      alertBanner.classList.toggle("alert-danger", taxRate > 68 || cappedBudget.effMil < milUpkeep || (res <= 0 && (milUpkeep + invExp + socExp) > totalRevenue));
    } else {
      alertBanner.classList.add("hidden");
    }
  }

  updateDerivedEconomyUI(Math.round(gdp), value, inflation, cappedBudget.effBalance);
}

export function updateDerivedEconomyUI(gdp, currencyVal, inflationRate, balance) {
  const gdpValEl = document.getElementById("cc-meter-gdp-val");
  if (gdpValEl && typeof gdp === "number") {
    gdpValEl.textContent = gdp.toLocaleString();
    setMeter("cc-meter-gdp", gdp, 500);
  }

  const curEl = document.getElementById("cc-currency-val");
  if (curEl && typeof currencyVal === "number") {
    curEl.textContent = `${currencyVal.toFixed(2)} ducats`;
  }

  const balEl = document.getElementById("cc-budget-balance");
  if (balEl && typeof balance === "number") {
    balEl.textContent = `${balance >= 0 ? "+" : ""}${balance}/tick`;
    balEl.classList.toggle("negative", balance < 0);
  }
}

export function updateStepperDisplay() {
  const mktLabel = document.getElementById("cc-market-level-label");
  if (mktLabel) mktLabel.textContent = `Tier ${marketsLevel}`;

  const mktPips = document.querySelectorAll("#cc-market-pips .pip");
  mktPips.forEach((pip, idx) => {
    pip.classList.toggle("active", idx < marketsLevel);
  });

  const infraLabel = document.getElementById("cc-infra-level-label");
  if (infraLabel) infraLabel.textContent = `Tier ${infraLevel}`;

  const infraPips = document.querySelectorAll("#cc-infra-pips .pip");
  infraPips.forEach((pip, idx) => {
    pip.classList.toggle("active", idx < infraLevel);
  });
}

export function wireCompassDial() {
  const dial = document.getElementById("cc-compass-dial");
  if (!dial || dial.dataset.wired) return;
  dial.dataset.wired = "1";

  const onStart = (e) => {
    compassDragging = true;
    updateCompassFromEvent(e);
    e.preventDefault();
  };

  dial.addEventListener("mousedown", onStart);
  dial.addEventListener("touchstart", onStart, { passive: false });

  window.addEventListener("mousemove", (e) => {
    if (!compassDragging) return;
    updateCompassFromEvent(e);
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!compassDragging || !e.touches.length) return;
      updateCompassFromEvent(e.touches[0]);
    },
    { passive: false }
  );

  const onEnd = () => {
    compassDragging = false;
  };
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);
}

export function updateCompassFromEvent(e) {
  const dial = document.getElementById("cc-compass-dial");
  if (!dial) return;
  const rect = dial.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  setCompassAngle(deg, true);
}

export function setCompassAngle(deg, syncBorder = true) {
  compassAngle = Math.round(((deg % 360) + 360) % 360);
  const needle = document.getElementById("cc-compass-needle");
  if (needle) needle.style.transform = `rotate(${compassAngle}deg)`;

  const degEl = document.getElementById("cc-compass-deg");
  if (degEl) degEl.textContent = `${compassAngle}°`;

  let side = "N";
  if (compassAngle >= 315 || compassAngle < 45) side = "N";
  else if (compassAngle >= 45 && compassAngle < 135) side = "E";
  else if (compassAngle >= 135 && compassAngle < 225) side = "S";
  else side = "W";

  if (syncBorder && side !== compassDirection) {
    setCompassSide(side, false);
  }
}

export function setCompassSide(side, updateAngle = true) {
  compassDirection = side;
  const sideNames = { N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST" };
  const labelEl = document.getElementById("cc-compass-direction-label");
  if (labelEl) labelEl.textContent = sideNames[side] || side;

  document.querySelectorAll(".cardinal-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.classList.contains(`card-${side.toLowerCase()}`));
  });

  document.querySelectorAll(".border-gauge-pod").forEach((pod) => {
    pod.classList.toggle("selected-frontier", pod.classList.contains(`pod-${side.toLowerCase()}`));
  });

  updateFortifyButtonLabel();

  if (updateAngle) {
    const angleMap = { N: 0, E: 90, S: 180, W: 270 };
    setCompassAngle(angleMap[side] || 0, false);
  }

  const kingdom =
    (state.myKingdom && state.kingdoms.find((k) => k.id === state.myKingdom.country_id)) || state.myKingdom;
  if (kingdom) {
    const minimap = document.getElementById("cc-minimap");
    if (minimap) {
      const ctx = minimap.getContext("2d");
      ctx.clearRect(0, 0, minimap.width, minimap.height);
      const borders =
        commandCenterDetail?.border_troops || state.troops[kingdom.id]?.borders || { N: 0, S: 0, E: 0, W: 0 };
      const central = commandCenterDetail?.central_troops || state.troops[kingdom.id]?.central || 0;
      renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
    }
  }

  updateOrderPreview();
}

export function selectCompassSide(side, e) {
  if (e) e.stopPropagation();
  setCompassSide(side, true);
}

export function toggleMovementMode() {
  movementMode = movementMode === "interior" ? "target" : "interior";
  const rocker = document.getElementById("cc-mode-rocker");
  if (rocker) {
    document.getElementById("rocker-pos-interior")?.classList.toggle("active", movementMode === "interior");
    document.getElementById("rocker-pos-target")?.classList.toggle("active", movementMode === "target");
  }

  const desc = document.getElementById("cc-mode-description");
  if (desc) {
    desc.textContent =
      movementMode === "interior"
        ? `Station 10 troops on selected ${compassDirection} frontier`
        : `March expeditionary force to ${getTargetCountryName()}`;
  }

  updateOrderPreview();
}

export function toggleMarchSpeed() {
  marchSpeed = marchSpeed === "Slow" ? "Fast" : "Slow";
  const handle = document.getElementById("cc-throttle-handle");
  if (handle) {
    handle.classList.toggle("speed-fast", marchSpeed === "Fast");
  }

  document.getElementById("th-label-slow")?.classList.toggle("active", marchSpeed === "Slow");
  document.getElementById("th-label-fast")?.classList.toggle("active", marchSpeed === "Fast");

  updateOrderPreview();
}

export function updateOrderPreview() {
  const orderEl = document.getElementById("cc-deploy-order-preview");
  if (!orderEl) return;
  const sideNames = { N: "North", S: "South", E: "East", W: "West" };
  if (movementMode === "interior") {
    orderEl.textContent = `March to ${sideNames[compassDirection]} Border (${marchSpeed})`;
  } else {
    orderEl.textContent = `Expedition to ${getTargetCountryName()} (${marchSpeed})`;
  }
}

export function updateBorderGarrisonPods(borders) {
  const sides = ["N", "S", "E", "W"];
  sides.forEach((s) => {
    const count = (borders && borders[s]) || 0;
    const valEl = document.getElementById(`cc-border-${s.toLowerCase()}`);
    if (valEl) valEl.textContent = count.toLocaleString();

    const barEl = document.getElementById(`bar-fill-${s.toLowerCase()}`);
    if (barEl) {
      const pct = Math.min(100, Math.round((count / 50) * 100));
      if (barEl.parentElement && barEl.parentElement.classList.contains("vertical")) {
        barEl.style.height = `${pct}%`;
      } else {
        barEl.style.width = `${pct}%`;
      }
    }
  });
}

export function getAvailableTargets() {
  return state.kingdoms.filter((k) => !state.myKingdom || k.id !== state.myKingdom.country_id);
}

export function getTargetCountryName() {
  const targets = getAvailableTargets();
  const t = targets.find((k) => k.id === selectedTargetCountryId) || targets[0];
  return t ? t.name : "Target Realm";
}

export function stepTargetKingdom(delta) {
  const targets = getAvailableTargets();
  if (!targets.length) return;
  targetCountryIndex = (targetCountryIndex + delta + targets.length) % targets.length;
  selectedTargetCountryId = targets[targetCountryIndex].id;
  updateTargetKingdomDisplay();
}

export function updateTargetKingdomDisplay() {
  const targets = getAvailableTargets();
  if (!targets.length) return;
  if (targetCountryIndex >= targets.length) targetCountryIndex = 0;
  const target = targets[targetCountryIndex] || targets[0];
  if (!target) return;
  selectedTargetCountryId = target.id;

  const codeEl = document.getElementById("cc-target-code");
  if (codeEl) codeEl.textContent = target.code || "---";

  const shieldEl = document.getElementById("cc-target-color-shield");
  if (shieldEl) {
    shieldEl.style.color = target.color || "#ffd700";
    shieldEl.style.filter = `drop-shadow(0 0 8px ${target.color || "#ffd700"})`;
  }

  const nameEl = document.getElementById("cc-target-name");
  if (nameEl) nameEl.textContent = target.name || "Target Realm";

  const ownerEl = document.getElementById("cc-target-owner");
  if (ownerEl) ownerEl.textContent = target.owner_name || (target.owner_id ? "Occupied" : "Unclaimed");

  const popEl = document.getElementById("cc-target-pop");
  if (popEl) popEl.textContent = (target.population || 0).toLocaleString();

  const resEl = document.getElementById("cc-target-res");
  if (resEl) resEl.textContent = `${(target.resources || 0).toLocaleString()} ducats`;

  const statusEl = document.getElementById("cc-target-status");
  if (statusEl) {
    statusEl.textContent = target.owner_name ? "Sovereign State" : "Unclaimed Territory";
  }

  updateOrderPreview();
  updateDiploPreview();
}

export function wireTargetDial() {
  const dial = document.getElementById("cc-target-dial");
  if (!dial || dial.dataset.wired) return;
  dial.dataset.wired = "1";

  dial.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stepTargetKingdom(e.deltaY < 0 ? -1 : 1);
    },
    { passive: false }
  );

  let startX = 0;
  let isDraggingTarget = false;
  let hasMoved = false;

  dial.addEventListener("mousedown", (e) => {
    isDraggingTarget = true;
    hasMoved = false;
    startX = e.clientX;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingTarget) return;
    const diff = e.clientX - startX;
    if (Math.abs(diff) > 25) {
      hasMoved = true;
      stepTargetKingdom(diff > 0 ? 1 : -1);
      startX = e.clientX;
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingTarget && !hasMoved) {
      stepTargetKingdom(1);
    }
    isDraggingTarget = false;
  });
}

export function selectDiploStance(stance) {
  diplomaticStance = stance;
  const stances = ["envoy", "alliance", "trade", "war"];
  stances.forEach((s) => {
    const btn = document.querySelector(`.stance-pos-btn.pos-${s}`);
    if (btn) btn.classList.toggle("active", s === stance);
  });

  const pointer = document.getElementById("cc-stance-pointer");
  if (pointer) {
    const angles = { envoy: 0, alliance: 90, trade: 180, war: 270 };
    pointer.style.transform = `rotate(${angles[stance] || 0}deg)`;
  }

  const descEl = document.getElementById("cc-stance-description");
  if (descEl) {
    const descs = {
      envoy: "Dispatch royal envoy to initiate formal diplomatic relations and establish emissary presence.",
      alliance: "Propose mutual defense and non-aggression alliance with the targeted realm.",
      trade: "Dispatch an authorized merchant caravan to trade 50 resources with target realm.",
      war: "Formal declaration of hostilities: sound the war drums against enemy frontier.",
    };
    descEl.textContent = descs[stance] || "";
  }

  updateDiploPreview();
}

export function updateDiploPreview() {
  const preview = document.getElementById("cc-diplo-mission-preview");
  if (!preview) return;
  const targetName = getTargetCountryName();
  const missions = {
    envoy: `Send Royal Envoy to ${targetName}`,
    alliance: `Propose Alliance with ${targetName}`,
    trade: `Dispatch 50 Ducat Merchant Fleet to ${targetName}`,
    war: `Declare War Against ${targetName}`,
  };
  preview.textContent = missions[diplomaticStance] || `Mission to ${targetName}`;
}

export function renderDiplomacyLedger(relations) {
  const list = document.getElementById("cc-diplomacy-list");
  const empty = document.getElementById("cc-diplomacy-empty");
  if (!list) return;
  list.innerHTML = "";
  if (relations && relations.length) {
    if (empty) empty.style.display = "none";
    relations.forEach((rel) => {
      const row = document.createElement("div");
      row.className = "diplomacy-row";
      let badgeClass = "rel-badge envoy";
      let badgeText = "ENVOY";
      const desc = (rel.description || "").toLowerCase();
      if (desc.includes("alliance")) {
        badgeClass = "rel-badge alliance";
        badgeText = "ALLIANCE";
      } else if (desc.includes("war") || desc.includes("declare")) {
        badgeClass = "rel-badge war";
        badgeText = "WAR";
      } else if (desc.includes("trade")) {
        badgeClass = "rel-badge trade";
        badgeText = "TRADE";
      } else if (desc.includes("envoy")) {
        badgeClass = "rel-badge envoy";
        badgeText = "ENVOY";
      }
      row.innerHTML = `
        <span class="rel-country">${escapeHtml(rel.target_name || "Unknown")}</span>
        <span class="rel-action">${escapeHtml(rel.description || "")}</span>
        <span class="rel-badge ${badgeClass}">${badgeText}</span>
      `;
      list.appendChild(row);
    });
  } else {
    if (empty) empty.style.display = "block";
  }
}

export async function performActionDirect(actionType, description, extraParams = {}) {
  if (!state.token || !state.myKingdom) {
    showToast("Claim a kingdom first", "error");
    return;
  }

  const payload = {
    action_type: actionType,
    type: actionType,
    description: description,
    ...extraParams,
  };

  try {
    const res = await apiSendAction(payload);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Action failed"));
    }

    const data = await res.json();
    logMessage(`Order executed: ${description}`);
    applyActionResult(data);
    refreshKingdomCommandCenter();
    showToast(`Order executed: ${description}`, "success");
  } catch (err) {
    const msg = err.message || "Action failed";
    logMessage(`Order failed: ${msg}`);
    showToast(msg, "error");
  }
}

export function triggerCollectTaxes() {
  const lever = document.getElementById("cc-lever-collect-taxes");
  if (lever) {
    lever.classList.add("pulled");
    setTimeout(() => {
      lever.classList.remove("pulled");
    }, 350);
  }
  performActionDirect("economy", "Collect Taxes");
}

export function triggerUpgradeMarket() {
  performActionDirect("economy", "Build Market");
}

export function triggerUpgradeInfra() {
  performActionDirect("economy", "Invest in Infrastructure");
}

export function updateFortifyButtonLabel() {
  const fortifyLabel = document.getElementById("cc-fortify-border-label");
  if (!fortifyLabel) return;
  const side = compassDirection || "N";
  const sideNames = { N: "North", S: "South", E: "East", W: "West" };
  const currentFort = (commandCenterDetail && commandCenterDetail[`fort_${side.toLowerCase()}`]) || 0;
  const nextTier = currentFort + 1;
  const cost = 500 * nextTier;
  fortifyLabel.textContent = `Cost: ${cost.toLocaleString()} Ducats · Fortify ${sideNames[side]} Frontier (Tier ${currentFort} ➔ ${nextTier})`;
}

export let selectedRecruitTier = "levy";

export function selectRecruitTier(tier) {
  selectedRecruitTier = tier;
  const tabs = ["levy", "regular", "elite", "drill"];
  tabs.forEach((t) => {
    const tabEl = document.getElementById(`tab-recruit-${t}`);
    if (tabEl) {
      if (t === tier) tabEl.classList.add("active");
      else tabEl.classList.remove("active");
    }
  });

  const btnText = document.getElementById("cc-recruit-btn-text");
  const costLabel = document.getElementById("cc-recruit-cost-label");
  if (tier === "levy") {
    if (btnText) btnText.textContent = "MUSTER RECRUITS";
    if (costLabel) costLabel.textContent = "Cost: 150 Ducats · +10 Conscripts";
  } else if (tier === "regular") {
    if (btnText) btnText.textContent = "ENLIST LINE REGULARS";
    if (costLabel) costLabel.textContent = "Cost: 450 Ducats · +10 Trained Regulars";
  } else if (tier === "elite") {
    if (btnText) btnText.textContent = "COMMISSION ROYAL GUARD";
    if (costLabel) costLabel.textContent = "Cost: 1,200 Ducats · +10 Elite Tercios";
  } else if (tier === "drill") {
    if (btnText) btnText.textContent = "DRILL & PROMOTE RANKS";
    if (costLabel) costLabel.textContent = "Cost: 300 Ducats · 10 Levies ➔ Regulars / 5 Regs ➔ Elites";
  }
}

export function triggerRecruitTroops() {
  const btn = document.getElementById("cc-lever-recruit");
  if (btn) {
    btn.style.transform = "scale(0.96)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 180);
  }
  if (selectedRecruitTier === "drill") {
    performActionDirect("military", "Drill & Promote", {
      troop_tier: "drill",
    });
  } else {
    performActionDirect("military", "Recruit Troops", {
      troop_tier: selectedRecruitTier,
    });
  }
}

export function triggerFortifyBorder() {
  const btn = document.getElementById("cc-lever-fortify");
  if (btn) {
    btn.style.transform = "scale(0.96)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 180);
  }
  performActionDirect("military", "Fortify Borders", {
    direction: compassDirection,
  });
}

export function triggerDispatchTroops() {
  const lever = document.getElementById("cc-lever-deploy");
  if (lever) {
    lever.style.transform = "translateY(3px)";
    setTimeout(() => {
      lever.style.transform = "";
    }, 250);
  }

  if (movementMode === "interior") {
    performActionDirect("military", "Move Army", {
      movement_type: "interior",
      direction: compassDirection,
      speed: marchSpeed,
    });
  } else {
    if (!selectedTargetCountryId) {
      showToast("Please select a target country on the radar", "error");
      return;
    }
    performActionDirect("military", "Move Army", {
      movement_type: "target",
      target_country_id: selectedTargetCountryId,
    });
  }
}

export function triggerDispatchDiplomacy() {
  if (!selectedTargetCountryId) {
    showToast("Please select a target country on the radar", "error");
    return;
  }
  const lever = document.getElementById("cc-lever-dispatch-diplo");
  if (lever) {
    lever.style.transform = "translateY(3px)";
    setTimeout(() => {
      lever.style.transform = "";
    }, 250);
  }

  const actionMap = {
    envoy: { type: "diplomacy", desc: "Send Envoy" },
    alliance: { type: "diplomacy", desc: "Propose Alliance" },
    trade: { type: "economy", desc: "Trade Resources" },
    war: { type: "diplomacy", desc: "Declare War" },
  };
  const act = actionMap[diplomaticStance] || actionMap.envoy;
  performActionDirect(act.type, act.desc, {
    target_country_id: selectedTargetCountryId,
  });
}

export function switchConsoleBay(bay) {
  currentConsoleBay = bay;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.bay === bay);
  });

  const bays = {
    fiscal: document.getElementById("bay-fiscal"),
    military: document.getElementById("bay-military"),
    diplomacy: document.getElementById("bay-diplomacy"),
  };
  Object.keys(bays).forEach((b) => {
    if (!bays[b]) return;
    bays[b].style.display = bay === "all" || bay === b ? "block" : "none";
  });
}

export function renderMeters() {
  ["cc-meter-population", "cc-meter-resources", "cc-meter-troops", "cc-meter-gdp"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    let ticks = el.querySelector(".meter-ticks");
    if (!ticks) {
      ticks = document.createElement("div");
      ticks.className = "meter-ticks";
      el.appendChild(ticks);
    }
    if (!ticks.children.length) {
      for (let v = 0; v <= 100; v += 10) {
        const t = document.createElement("span");
        if (v % 25 === 0) t.className = "tick-major";
        t.style.transform = `rotate(${v * DIAL_DEG_PER_UNIT}deg)`;
        ticks.appendChild(t);
      }
    }

    let needle = el.querySelector(".meter-needle");
    if (!needle) {
      needle = document.createElement("div");
      needle.className = "meter-needle";
      el.appendChild(needle);
    }
  });
}

export function setMeter(elementId, value, max) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const pct = Math.min(Math.max(value / (max || 1), 0), 1);
  const deg = Math.round(pct * 240);
  el.style.background = `conic-gradient(from 120deg, #ffd700 0deg, #ffd700 ${deg}deg, rgba(255,215,0,0.12) ${deg}deg, rgba(255,215,0,0.12) 360deg)`;
  const needle = el.querySelector(".meter-needle");
  if (needle) {
    needle.style.transform = `rotate(${DIAL_BASE_DEG + pct * 240}deg)`;
  }
}

export function renderKingdomMinimap(ctx, kingdom, borders, central, activeBorder = "N") {
  const poly = kingdomPolygons[kingdom.code];
  if (!poly) return;

  const w = 240;
  const h = 180;
  const pad = 20;

  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  poly.forEach(([px, py]) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((w - 2 * pad) / rangeX, (h - 2 * pad) / rangeY);
  const offX = (w - rangeX * scale) / 2;
  const offY = (h - rangeY * scale) / 2;

  const proj = (px, py) => [offX + (px - minX) * scale, offY + (py - minY) * scale];

  ctx.beginPath();
  poly.forEach(([px, py], i) => {
    const [x, y] = proj(px, py);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = kingdom.color || "#4ecdc4";
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (central && central > 0) {
    const cx = poly.reduce((s, [px]) => s + px, 0) / poly.length;
    const cy = poly.reduce((s, [, py]) => s + py, 0) / poly.length;
    const [mx, my] = proj(cx, cy);
    const dotCount = Math.min(Math.max(Math.ceil(central / 10), 1), 12);
    const spread = Math.min(central / 60, 8);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      ctx.beginPath();
      ctx.arc(mx + Math.cos(angle) * r, my + Math.sin(angle) * r, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const sides = ["N", "S", "E", "W"];
  sides.forEach((side) => {
    const count = (borders && borders[side]) || 0;
    let p1, p2;
    if (side === "N") {
      p1 = poly.reduce((a, b) => (b[1] < a[1] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    } else if (side === "S") {
      p1 = poly.reduce((a, b) => (b[1] > a[1] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    } else if (side === "E") {
      p1 = poly.reduce((a, b) => (b[0] > a[0] ? b : a), poly[0]);
      p2 = poly[0];
    } else {
      p1 = poly.reduce((a, b) => (b[0] < a[0] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    }
    const [x1, y1] = proj(p1[0], p1[1]);
    const [x2, y2] = proj(p2[0], p2[1]);

    if (side === activeBorder) {
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (count > 0) {
      const dotCount = Math.min(Math.max(Math.ceil(count / 5), 1), 10);
      ctx.fillStyle = side === activeBorder ? "#00f0ff" : "#ffffff";
      for (let i = 0; i < dotCount; i++) {
        const t = (i + 0.5) / dotCount;
        const jitter = (Math.random() - 0.5) * 3;
        ctx.beginPath();
        ctx.arc(x1 + (x2 - x1) * t + jitter, y1 + (y2 - y1) * t + jitter, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}


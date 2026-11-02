// main.js - Application bootstrap & orchestrator for Kingdom Conquest

import { state, clearSession, syncKingdomsForYear } from "./state.js";
import {
  apiGetCountries,
  apiGetTroops,
  apiGetMyCountry,
  apiAssignCountry,
  readErrorMessage,
} from "./api.js";
import {
  showRegister,
  showLogin,
  register as authRegister,
  login as authLogin,
  logout as authLogout,
} from "./auth.js";
import {
  connectWebSocket,
  disconnectWebSocket,
  onSocketStateChange,
} from "./socket.js";
import {
  initRenderer,
  resizeCanvas,
  renderMap,
  getKingdomAtPosition,
} from "./map/renderer.js";
import { showToast, logMessage } from "./ui/toast.js";
import {
  startClock,
  stopClock,
  tickClock,
  onEraChange,
  toggleDevChronoControl,
  setChronoScale,
  setStartYear,
  applyStartYearInput,
  resetToDefaultStartYear,
  jumpToYear,
  stepYearOffset,
  resetYearOffset,
  getCurrentGameYear,
} from "./ui/clock.js";
import {
  showAction,
  onActionOption,
  performAction,
  closeModal,
  registerActionCallbacks,
} from "./ui/actions.js";
import {
  openKingdomCommandCenter,
  closeKingdomCommandCenter,
  refreshKingdomCommandCenter,
  switchConsoleBay,
  triggerCollectTaxes,
  triggerUpgradeMarket,
  triggerUpgradeInfra,
  triggerRecruitTroops,
  triggerFortifyBorder,
  triggerDispatchTroops,
  stepTargetKingdom,
  selectDiploStance,
  triggerDispatchDiplomacy,
  selectCompassSide,
  toggleMovementMode,
  toggleMarchSpeed,
  setTaxRate,
  setInvestmentRate,
  setSocialRate,
} from "./ui/console.js";

// Wire module callbacks
registerActionCallbacks({
  openKingdomCommandCenter,
  closeKingdomCommandCenter,
  refreshKingdomCommandCenter,
  renderKingdomList,
  refreshMyKingdomStats,
  checkMyKingdom,
});

// React to live WebSocket broadcasts
onSocketStateChange(() => {
  renderMap();
  renderKingdomList();
  refreshMyKingdomStats();
  if (state.myKingdom && state.myKingdom.country_id) {
    updateEconomyPanel(state.kingdoms.find((k) => k.id === state.myKingdom.country_id));
    refreshKingdomCommandCenter();
  }
});

// React to Historical Era transitions (adding new unowned countries to the map in each Age)
onEraChange((newEra, yearInt, prevEraId) => {
  syncKingdomsForYear(state.allKingdoms, yearInt);
  renderMap();
  renderKingdomList();
  refreshMyKingdomStats();
  if (state.myKingdom && state.myKingdom.country_id) {
    refreshKingdomCommandCenter();
  }

  if (prevEraId !== null && prevEraId !== newEra.id) {
    const emergedInEra = state.kingdoms.filter(
      (k) => k.unlock_era === newEra.id && !k.owner_id
    );
    if (emergedInEra.length > 0) {
      const names = emergedInEra.map((k) => k.name).join(", ");
      logMessage(
        `[${newEra.name} · ${newEra.startYear}] New unowned nations emerged: ${names}`
      );
      showToast(
        `${newEra.name}: ${emergedInEra.length} new unowned nations emerged!`,
        "info"
      );
    } else if (newEra.id === "discovery") {
      logMessage(
        `[${newEra.name} · 1500] Map restored to the 11 founding Sovereign Empires.`
      );
    }
  }
});

// Screen transitions & lifecycle
export function showGameScreen() {
  closeModal();
  document.getElementById("auth-screen")?.classList.remove("active");
  document.getElementById("game-screen")?.classList.add("active");
  const playerNameEl = document.getElementById("player-name");
  if (playerNameEl && state.currentUser) {
    playerNameEl.textContent = state.currentUser.username;
  }
  resizeCanvas();
  startClock();
  connectWebSocket();
  loadKingdoms();
  checkMyKingdom();
}

export function showAuthScreen() {
  closeModal();
  stopClock();
  disconnectWebSocket();
  document.getElementById("game-screen")?.classList.remove("active");
  document.getElementById("auth-screen")?.classList.add("active");
  showLogin();
}

export async function loadKingdoms() {
  try {
    const res = await apiGetCountries("medieval");
    if (!res.ok) throw new Error("Failed to load kingdoms");
    const rawCountries = await res.json();
    syncKingdomsForYear(rawCountries, getCurrentGameYear());

    renderMap();
    renderKingdomList();
    await loadAllTroops();
  } catch (err) {
    logMessage("Error loading kingdoms: " + err.message);
  }
}

export async function loadAllTroops() {
  if (!state.myKingdom || !state.myKingdom.country_id) return;
  try {
    const res = await apiGetTroops();
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.country_id === state.myKingdom.country_id) {
      state.troops[data.country_id] = {
        central: data.central || 0,
        borders: data.borders || { N: 0, S: 0, E: 0, W: 0 },
      };
    }
  } catch (err) {
    console.error("Error loading troops:", err);
  }
}

export async function checkMyKingdom() {
  try {
    const res = await apiGetMyCountry();
    if (!res.ok) return;
    const data = await res.json();
    if (data.has_country) {
      state.myKingdom = data;
      const playerKingdom = document.getElementById("player-kingdom");
      if (playerKingdom) playerKingdom.textContent = data.country_name;

      document.getElementById("country-selection")?.classList.add("hidden");
      document.getElementById("my-kingdom")?.classList.remove("hidden");

      const nameEl = document.getElementById("my-kingdom-name");
      if (nameEl) nameEl.textContent = data.country_name;

      const activeEl = document.getElementById("my-kingdom-active");
      if (activeEl) activeEl.textContent = new Date(data.last_active).toLocaleString();

      refreshMyKingdomStats();
    } else {
      state.myKingdom = null;
      const playerKingdom = document.getElementById("player-kingdom");
      if (playerKingdom) playerKingdom.textContent = "No Kingdom";

      document.getElementById("country-selection")?.classList.remove("hidden");
      document.getElementById("my-kingdom")?.classList.add("hidden");
      closeModal();
    }
  } catch (err) {
    console.error("Error checking kingdom:", err);
  }
}

export function renderKingdomList() {
  const list = document.getElementById("available-kingdoms");
  if (!list) return;
  list.innerHTML = "";
  const available = state.kingdoms.filter((k) => !k.owner_id);
  available.forEach((kingdom) => {
    const div = document.createElement("div");
    const isNewInEra =
      state.currentEraId &&
      state.currentEraId !== "discovery" &&
      kingdom.unlock_era === state.currentEraId;
    div.className = isNewInEra ? "kingdom-item newly-emerged" : "kingdom-item";
    div.dataset.kingdomId = kingdom.id;
    const eraBadge =
      kingdom.birth_year && kingdom.birth_year > 1500
        ? `<span class="era-origin-badge ${isNewInEra ? "new-era" : ""}" title="${kingdom.historical_note || ""}">${isNewInEra ? "★ NEW" : "c." + kingdom.birth_year}</span>`
        : "";
    div.innerHTML = `<div class="kingdom-color" style="background: ${kingdom.color || "#4ecdc4"}"></div><span class="kingdom-list-name">${kingdom.name}</span>${eraBadge}`;
    div.onclick = () => selectKingdom(kingdom.id, div);
    list.appendChild(div);
  });

  if (state.selectedKingdomId) {
    const selected = list.querySelector(`.kingdom-item[data-kingdom-id="${state.selectedKingdomId}"]`);
    if (selected) selected.classList.add("selected");
  }
}

export function selectKingdom(id, listItem) {
  state.selectedKingdomId = id;
  document.querySelectorAll(".kingdom-item").forEach((el) => el.classList.remove("selected"));
  if (listItem) listItem.classList.add("selected");
  const claimBtn = document.getElementById("claim-btn");
  if (claimBtn) claimBtn.disabled = false;
}

export async function claimKingdom() {
  if (!state.selectedKingdomId) {
    showToast("Select a kingdom first", "error");
    return;
  }
  try {
    const res = await apiAssignCountry(state.selectedKingdomId);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Could not claim kingdom"));
    }
    logMessage("Kingdom claimed successfully!");
    showToast("Kingdom claimed!", "success");
    await checkMyKingdom();
    await loadKingdoms();
  } catch (err) {
    const msg = err.message || "Could not claim kingdom";
    logMessage("Error claiming kingdom: " + msg);
    showToast(msg, "error");
  }
}

export function refreshMyKingdomStats() {
  if (!state.myKingdom || !state.myKingdom.country_id) return;
  const country = state.kingdoms.find((k) => k.id === state.myKingdom.country_id);
  if (!country) return;
  const popEl = document.getElementById("my-kingdom-pop");
  const resEl = document.getElementById("my-kingdom-res");
  if (popEl) popEl.textContent = country.population ? country.population.toLocaleString() : "0";
  if (resEl) resEl.textContent = country.resources ? country.resources.toLocaleString() : "0";
}

export function updateEconomyPanel(country) {
  const panel = document.getElementById("economy-panel");
  if (!panel) return;
  if (!country || !country.economy) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const e = country.economy;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("econ-currency", Number(e.currency_value).toFixed(2));
  set("econ-gdp", e.gdp.toLocaleString());
  set("econ-revenue", e.tax_revenue.toLocaleString());
  set("econ-military", e.military_expenditure.toLocaleString());
  const bal = document.getElementById("econ-balance");
  if (bal) {
    bal.textContent = (e.budget_balance >= 0 ? "+" : "") + e.budget_balance.toLocaleString();
    bal.classList.toggle("econ-positive", e.budget_balance >= 0);
    bal.classList.toggle("econ-negative", e.budget_balance < 0);
  }
  set("econ-reserve", e.gold_reserve.toLocaleString());
  set("econ-rate", e.tax_rate);
  set("econ-levels", `Markets ${e.markets} · Infrastructure ${e.infrastructure}`);

  if (state.lastEconomy) {
    setTrend("econ-currency-trend", e.currency_value, state.lastEconomy.currency_value);
    setTrend("econ-gdp-trend", e.gdp, state.lastEconomy.gdp);
    setTrend("econ-balance-trend", e.budget_balance, state.lastEconomy.budget_balance);
  }
  state.lastEconomy = e;
}

export function setTrend(id, now, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  if (now > prev) {
    el.textContent = "▲";
    el.className = "econ-trend econ-positive";
  } else if (now < prev) {
    el.textContent = "▼";
    el.className = "econ-trend econ-negative";
  } else {
    el.textContent = "";
    el.className = "econ-trend";
  }
}

// Wrapper for auth functions with UI flow
function doRegister() {
  authRegister();
}

function doLogin() {
  authLogin(() => {
    showGameScreen();
  });
}

function doLogout() {
  authLogout(() => {
    showAuthScreen();
  });
}

// Wire canvas click hit-testing
function setupCanvasInteractions(canvas) {
  canvas.addEventListener("click", (e) => {
    const kingdom = getKingdomAtPosition(e.clientX, e.clientY);
    if (kingdom) {
      // If clicking your own country, open the command center view
      if (state.myKingdom && kingdom.id === state.myKingdom.country_id) {
        openKingdomCommandCenter(kingdom);
        return;
      }
      const info = document.getElementById("kingdom-info");
      const nameEl = document.getElementById("kingdom-name");
      const popEl = document.getElementById("kingdom-population");
      const resEl = document.getElementById("kingdom-resources");
      const ownerEl = document.getElementById("kingdom-owner");

      if (nameEl) nameEl.textContent = kingdom.name;
      if (popEl) popEl.textContent = (kingdom.population || 0).toLocaleString();
      if (resEl) resEl.textContent = (kingdom.resources || 0).toLocaleString();

      const ownerLabel = kingdom.owner_name
        ? "Owner: " + kingdom.owner_name
        : kingdom.owner_id
        ? "Owned"
        : kingdom.birth_year && kingdom.birth_year > 1500
        ? `Unclaimed · Emerged c.${kingdom.birth_year}${kingdom.parent ? ` (from ${kingdom.parent})` : ""}`
        : "Unclaimed · Sovereign Empire (1500)";
      if (ownerEl) ownerEl.textContent = ownerLabel;

      if (info) info.classList.remove("hidden");
      state.shownKingdomId = kingdom.id;

      if (!kingdom.owner_id) {
        const listItem = document.querySelector(`.kingdom-item[data-kingdom-id="${kingdom.id}"]`);
        selectKingdom(kingdom.id, listItem);
      }
    }
  });
}

// Expose functions globally to window so HTML inline onclick="..." always resolve
window.login = doLogin;
window.register = doRegister;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.logout = doLogout;
window.claimKingdom = claimKingdom;
window.showAction = showAction;
window.onActionOption = onActionOption;
window.performAction = performAction;
window.closeModal = closeModal;
window.closeKingdomCommandCenter = closeKingdomCommandCenter;
window.openKingdomCommandCenter = openKingdomCommandCenter;
window.refreshKingdomCommandCenter = refreshKingdomCommandCenter;
window.switchConsoleBay = switchConsoleBay;
window.triggerCollectTaxes = triggerCollectTaxes;
window.triggerUpgradeMarket = triggerUpgradeMarket;
window.triggerUpgradeInfra = triggerUpgradeInfra;
window.selectCompassSide = selectCompassSide;
window.toggleMovementMode = toggleMovementMode;
window.toggleMarchSpeed = toggleMarchSpeed;
window.triggerRecruitTroops = triggerRecruitTroops;
window.triggerFortifyBorder = triggerFortifyBorder;
window.triggerDispatchTroops = triggerDispatchTroops;
window.stepTargetKingdom = stepTargetKingdom;
window.selectDiploStance = selectDiploStance;
window.triggerDispatchDiplomacy = triggerDispatchDiplomacy;
window.setTaxRate = setTaxRate;
window.setInvestmentRate = setInvestmentRate;
window.setSocialRate = setSocialRate;
window.toggleDevChronoControl = toggleDevChronoControl;
window.setChronoScale = setChronoScale;
window.setStartYear = setStartYear;
window.applyStartYearInput = applyStartYearInput;
window.resetToDefaultStartYear = resetToDefaultStartYear;
window.jumpToYear = jumpToYear;
window.stepYearOffset = stepYearOffset;
window.resetYearOffset = resetYearOffset;
window.getCurrentGameYear = getCurrentGameYear;

// Initialize when DOM is ready
function initApp() {
  const canvas = document.getElementById("world-map");
  if (canvas) {
    initRenderer(canvas);
    setupCanvasInteractions(canvas);
  }

  window.addEventListener("resize", resizeCanvas);
  tickClock();

  if (state.token && state.currentUser) {
    showGameScreen();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}


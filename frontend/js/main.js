// main.js - Application bootstrap & orchestrator for Kingdom Conquest

import { state, clearSession, syncKingdomsForYear } from "./state.js";

// Optional Polynesian / Pacific island nations (Advanced Play Meta Theme)
const POLYNESIAN_ISLES = new Set(["WSM", "TON", "FJI", "VUT", "SLB", "FSM"]);
import {
  apiGetCountries,
  apiGetTroops,
  apiGetMyCountry,
  apiAssignCountry,
  apiGetAdminDashboard,
  readErrorMessage,
  onUnauthorized,
} from "./api.js";
import {
  showRegister,
  showLogin,
  register as authRegister,
  login as authLogin,
  logout as authLogout,
  setAuthMessage,
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
  syncViewport,
  getKingdomAtPosition,
  magnifierState,
  setMagnifier,
  updateMagnifierPosition,
  panCamera,
  zoomCamera,
  resetCamera,
} from "./map/renderer.js";
import { showToast, logMessage } from "./ui/toast.js";
import {
  startClock,
  stopClock,
  tickClock,
  onEraChange,
  isTimelineAdmin,
  toggleDevChronoControl,
  setChronoScale,
  setStartYear,
  applyStartYearInput,
  resetToDefaultStartYear,
  jumpToYear,
  setTimelinePause,
  stepYearOffset,
  resetYearOffset,
  getCurrentGameYear,
  syncTimelineFromServer,
  initServerTimelineSync,
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
  resizeCanvas();
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
let isSessionExpiring = false;

export function handleSessionExpired(
  reason = "Your session has expired. Please log in again to command your kingdom."
) {
  if (isSessionExpiring) return;
  isSessionExpiring = true;
  setTimeout(() => {
    isSessionExpiring = false;
  }, 1000);

  const previousUsername = state.currentUser?.username || "";
  clearSession();
  showAuthScreen(reason);

  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  if (usernameInput && previousUsername) {
    usernameInput.value = previousUsername;
  }
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.focus();
  }

  logMessage("Session expired. Please log in again.");
  showToast("Login session expired — please log in again", "warning");
}

// Automatically catch 401 Unauthorized responses across all protected endpoints
onUnauthorized((endpoint, res) => {
  handleSessionExpired();
});

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

export function showAuthScreen(message = "") {
  closeModal();
  stopClock();
  disconnectWebSocket();
  document.getElementById("game-screen")?.classList.remove("active");
  document.getElementById("auth-screen")?.classList.add("active");
  showLogin();
  if (message) {
    setAuthMessage(message, "error");
  }
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
  if (!state.token) {
    handleSessionExpired("Please log in to claim or command your kingdom.");
    return false;
  }

  // The admin user is NOT a player: show "👑 Overseer", hide country claiming, show admin console button
  if (isTimelineAdmin()) {
    const playerKingdom = document.getElementById("player-kingdom");
    if (playerKingdom) {
      playerKingdom.textContent = "👑 Overseer";
      playerKingdom.className = "admin-badge";
    }
    document.getElementById("admin-console-btn")?.classList.remove("hidden");
    document.getElementById("country-selection")?.classList.add("hidden");
    document.getElementById("my-kingdom")?.classList.add("hidden");
    state.myKingdom = null;
    return true;
  } else {
    document.getElementById("admin-console-btn")?.classList.add("hidden");
  }

  try {
    const res = await apiGetMyCountry();
    if (res.status === 401) {
      handleSessionExpired("Your session has expired. Please log in again to command your kingdom.");
      return false;
    }
    if (!res.ok) return false;

    const data = await res.json();
    if (data.email && state.currentUser) {
      state.currentUser.email = data.email;
      if (isTimelineAdmin()) {
        const playerKingdom = document.getElementById("player-kingdom");
        if (playerKingdom) {
          playerKingdom.textContent = "👑 Overseer";
          playerKingdom.className = "admin-badge";
        }
        document.getElementById("admin-console-btn")?.classList.remove("hidden");
        document.getElementById("country-selection")?.classList.add("hidden");
        document.getElementById("my-kingdom")?.classList.add("hidden");
        state.myKingdom = null;
        return true;
      }
    }
    if (data.has_country) {
      state.myKingdom = data;
      const playerKingdom = document.getElementById("player-kingdom");
      if (playerKingdom) {
        playerKingdom.textContent = data.country_name;
        playerKingdom.className = "kingdom-badge";
      }

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
      if (playerKingdom) {
        playerKingdom.textContent = "No Kingdom";
        playerKingdom.className = "kingdom-badge";
      }

      document.getElementById("country-selection")?.classList.remove("hidden");
      document.getElementById("my-kingdom")?.classList.add("hidden");
      closeModal();
    }
    return true;
  } catch (err) {
    console.error("Error checking kingdom:", err);
    return false;
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

// Wire canvas interactions: click selection, drag-to-pan, right-click Loupe, wheel scroll
function setupCanvasInteractions(canvas) {
  let isDragging = false;
  let hasDragged = false;
  let lastX = 0;
  let lastY = 0;
  let rightClickDown = false;
  let loupeToggleLocked = false;

  const toggleBtn = document.getElementById("toggle-loupe-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      loupeToggleLocked = !loupeToggleLocked;
      toggleBtn.classList.toggle("active", loupeToggleLocked);
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      setMagnifier(loupeToggleLocked, cx, cy);
    });
  }

  // Prevent default context menu on canvas so right-click is dedicated to the magnifier loupe
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Mousedown: Left-click starts drag-to-pan, Right-click triggers Loupe, Middle-click resets zoom
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (e.button === 1) {
      // Middle-click: Reset zoom and camera to default era framing
      e.preventDefault();
      resetCamera(true);
      showToast("Camera Reset to Era Framing 🧭", "info");
      return;
    }

    if (e.button === 2) {
      // Right-click: Activate Victorian Steampunk Brass Loupe
      e.preventDefault();
      rightClickDown = true;
      setMagnifier(true, cx, cy);
      return;
    }

    if (e.button === 0) {
      // Left-click: Start canvas drag-to-pan
      isDragging = true;
      hasDragged = false;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  // Auxclick: capture middle-click release / click in modern browsers
  canvas.addEventListener("auxclick", (e) => {
    if (e.button === 1) {
      e.preventDefault();
      resetCamera(true);
      showToast("Camera Reset to Era Framing 🧭", "info");
    }
  });

  // Mousemove: update Loupe or perform canvas panning
  window.addEventListener("mousemove", (e) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Update Loupe position if active
    if (magnifierState.active) {
      updateMagnifierPosition(cx, cy);
    }

    // Drag-to-pan handling on canvas
    if (isDragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged = true;
        panCamera(dx, dy);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    }
  });

  // Mouseup: release drag-to-pan or release Loupe
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2 && rightClickDown) {
      rightClickDown = false;
      if (!loupeToggleLocked) {
        setMagnifier(false);
      }
    }
    if (e.button === 0) {
      isDragging = false;
    }
  });

  // Mousewheel (third/middle mouse dial): zoom in/out centered on cursor position without bouncing/resetting
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Proportional geometric zoom anchored at exact cursor position
      const zoomIntensity = 0.0015;
      const factor = Math.exp(e.deltaY * zoomIntensity);
      zoomCamera(factor, sx, sy);
    },
    { passive: false }
  );

  // Keyboard navigation: Arrow keys pan map smoothly within frame; Esc closes modal
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleProgressModal(false);
      return;
    }

    // Ignore arrow navigation if user is typing in form inputs
    const activeTag = document.activeElement ? document.activeElement.tagName : "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) {
      return;
    }

    const panStep = e.shiftKey ? 90 : 45;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      panCamera(0, panStep);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      panCamera(0, -panStep);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      panCamera(panStep, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      panCamera(-panStep, 0);
    }
  });

  // Click on kingdom (only if not dragging)
  canvas.addEventListener("click", (e) => {
    if (hasDragged) {
      hasDragged = false;
      return;
    }
    if (e.button !== 0) return;

    const kingdom = getKingdomAtPosition(e.clientX, e.clientY);
    if (kingdom) {
      if (POLYNESIAN_ISLES.has(kingdom.code) && !state.metaThemes?.polynesiaIsles) {
        showToast(
          `🏝️ ${kingdom.name} (${kingdom.code}) is in the Polynesian Isles Advanced Meta Theme. Click the ribbon button to activate full oceanic theater!`,
          "info"
        );
      }
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
        // If player has not yet claimed a realm, open the progress modal so they can claim it easily
        if (!state.myKingdom) {
          toggleProgressModal(true);
        }
      }
    }
  });
}

export function toggleProgressModal(forceOpen) {
  const modal = document.getElementById("progress-modal-overlay");
  const toggleBtn = document.getElementById("progress-modal-toggle-btn");
  if (!modal) return;
  const isCurrentlyOpen = !modal.classList.contains("hidden");
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !isCurrentlyOpen;

  if (shouldOpen) {
    modal.classList.remove("hidden");
    if (toggleBtn) toggleBtn.classList.add("active");
  } else {
    modal.classList.add("hidden");
    if (toggleBtn) toggleBtn.classList.remove("active");
  }
}

export function handleProgressModalBackdrop(e) {
  if (e.target && e.target.id === "progress-modal-overlay") {
    toggleProgressModal(false);
  }
}

// Meta Theme: Polynesian & Pacific Island Kingdoms (Advanced Play)
export function togglePolynesiaMetaTheme(forceState) {
  if (typeof forceState === "boolean") {
    state.metaThemes.polynesiaIsles = forceState;
  } else {
    state.metaThemes.polynesiaIsles = !state.metaThemes.polynesiaIsles;
  }
  const isActive = Boolean(state.metaThemes.polynesiaIsles);
  const btn = document.getElementById("toggle-polynesia-btn");
  const label = document.getElementById("polynesia-btn-label");
  if (btn) {
    btn.classList.toggle("active", isActive);
  }
  if (label) {
    label.textContent = isActive ? "Polynesia: Active" : "Polynesia: Off";
  }
  showToast(
    isActive
      ? "Advanced Play: Polynesian & Pacific Isle Kingdoms Activated 🏝️"
      : "Standard Play: Polynesian Isles Muted & Camera Refocused",
    "info"
  );
  syncViewport();
  renderMap();
}

// Toggle Kingdom Name Plate Badges on Base Map
export function toggleMapLabels(forceState) {
  if (typeof forceState === "boolean") {
    state.showMapLabels = forceState;
  } else {
    state.showMapLabels = state.showMapLabels === false;
  }
  const isShown = Boolean(state.showMapLabels);
  const btn = document.getElementById("toggle-labels-btn");
  const label = document.getElementById("labels-btn-label");
  if (btn) {
    btn.classList.toggle("active", isShown);
  }
  if (label) {
    label.textContent = isShown ? "Labels: On" : "Labels: Off";
  }
  showToast(
    isShown
      ? "Cartographic Name Plate Badges Enabled 🏷️"
      : "Labels Hidden: Pristine Cartography Active (Use Loupe for Names) 🗺️",
    "info"
  );
  renderMap();
}

// Expose functions globally to window so HTML inline onclick="..." always resolve
window.toggleMapLabels = toggleMapLabels;
window.resetCamera = resetCamera;
window.togglePolynesiaMetaTheme = togglePolynesiaMetaTheme;
window.toggleProgressModal = toggleProgressModal;
window.handleProgressModalBackdrop = handleProgressModalBackdrop;
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
window.setTimelinePause = setTimelinePause;
window.syncTimelineFromServer = syncTimelineFromServer;
window.initServerTimelineSync = initServerTimelineSync;
window.stepYearOffset = stepYearOffset;
window.resetYearOffset = resetYearOffset;
window.getCurrentGameYear = getCurrentGameYear;
window.toggleAdminDashboard = toggleAdminDashboard;
window.handleAdminDashboardBackdrop = handleAdminDashboardBackdrop;
window.refreshAdminDashboard = refreshAdminDashboard;
window.adminJumpEra = adminJumpEra;
window.adminSetSpeed = adminSetSpeed;
window.adminTogglePause = adminTogglePause;

// -------------------------------------------------------------
// IMPERIAL OVERSEER & ADMIN DASHBOARD CONTROLLER
// -------------------------------------------------------------

let isAdminDashboardOpen = false;
let currentAdminDashboardData = null;

export function toggleAdminDashboard(forceOpen) {
  if (typeof forceOpen === "boolean") {
    isAdminDashboardOpen = forceOpen;
  } else {
    isAdminDashboardOpen = !isAdminDashboardOpen;
  }

  const modal = document.getElementById("admin-dashboard-modal");
  if (modal) {
    modal.classList.toggle("hidden", !isAdminDashboardOpen);
  }

  if (isAdminDashboardOpen) {
    refreshAdminDashboard();
  }
}

export function handleAdminDashboardBackdrop(event) {
  if (event.target && event.target.id === "admin-dashboard-modal") {
    toggleAdminDashboard(false);
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function refreshAdminDashboard() {
  const tbody = document.getElementById("admin-users-tbody");
  try {
    const res = await apiGetAdminDashboard();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to load admin dashboard"));
    }
    const data = await res.json();
    currentAdminDashboardData = data;

    // Update Telemetry Grid
    const simYearEl = document.getElementById("admin-sim-year");
    if (simYearEl) simYearEl.textContent = data.timeline.sim_year ? Number(data.timeline.sim_year).toFixed(2) : "—";

    const eraNameEl = document.getElementById("admin-era-name");
    if (eraNameEl) eraNameEl.textContent = `${data.timeline.era_name || "Era"} (${data.timeline.era_id || ""})`;

    const chronoScaleEl = document.getElementById("admin-chrono-scale");
    if (chronoScaleEl) chronoScaleEl.textContent = data.timeline.chrono_scale || "—";

    const ticksEl = document.getElementById("admin-ticks-count");
    if (ticksEl) ticksEl.textContent = `Server Tick #${data.timeline.tick || 0}`;

    const simStatusEl = document.getElementById("admin-sim-status");
    if (simStatusEl) {
      simStatusEl.textContent = data.timeline.is_paused ? "⏸️ PAUSED" : "▶️ RUNNING";
      simStatusEl.style.color = data.timeline.is_paused ? "#ff8b7b" : "#4ade80";
    }

    const pauseToggleBtn = document.getElementById("admin-pause-toggle-btn");
    if (pauseToggleBtn) {
      pauseToggleBtn.textContent = data.timeline.is_paused ? "▶️ Resume Simulation" : "⏸️ Pause Simulation";
    }

    const userCountEl = document.getElementById("admin-user-count");
    if (userCountEl) userCountEl.textContent = `${(data.users || []).length} Users`;

    const claimedCount = (data.users || []).filter((u) => u.country_id).length;
    const realmsClaimedEl = document.getElementById("admin-realms-claimed");
    if (realmsClaimedEl) realmsClaimedEl.textContent = `${claimedCount} of ${data.total_countries || 32} Realms Claimed`;

    const rosterCountEl = document.getElementById("admin-roster-count");
    if (rosterCountEl) rosterCountEl.textContent = `${(data.users || []).length} Users / ${claimedCount} Active Realms`;

    const syncTimeEl = document.getElementById("admin-timeline-sync-time");
    if (syncTimeEl) syncTimeEl.textContent = `Live · ${new Date().toLocaleTimeString()}`;

    // Highlight active era button
    document.querySelectorAll(".admin-era-btn").forEach((btn) => {
      const eraId = data.timeline.era_id;
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle("active", text.includes(eraId));
    });

    // Highlight active speed button
    document.querySelectorAll(".admin-speed-btn").forEach((btn) => {
      const scale = data.timeline.chrono_scale;
      btn.classList.toggle("active", btn.textContent.startsWith(scale));
    });

    // Populate Users Table
    if (tbody) {
      tbody.innerHTML = "";
      if (!data.users || data.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No registered users in database.</td></tr>`;
      } else {
        data.users.forEach((u) => {
          const tr = document.createElement("tr");
          const isUserAdmin = isTimelineAdmin(u);
          const roleBadgeClass = isUserAdmin ? "role-admin" : "role-player";
          const roleLabel = isUserAdmin ? "👑 Admin / Overseer" : "Player";

          const hasCountry = u.country_id && u.country_name;
          const realmDisplay = hasCountry
            ? `<span class="admin-realm-tag">
                 <span class="admin-realm-swatch" style="background-color: ${u.country_color || '#d4af37'}"></span>
                 <span>${escapeHTML(u.country_name)} (${escapeHTML(u.country_code || '---')})</span>
               </span>`
            : (isUserAdmin ? `<span class="admin-spectator-tag">👑 Non-Player Overseer</span>` : `<span class="admin-spectator-tag">Spectator / Unclaimed</span>`);

          const popDisplay = hasCountry ? Number(u.population || 0).toLocaleString() : "—";
          const resDisplay = hasCountry ? Number(u.resources || 0).toLocaleString() + " G" : "—";
          const troopDisplay = hasCountry ? Number(u.troops || 0).toLocaleString() : "—";
          const taxDisplay = hasCountry ? `${(Number(u.economy_rate || 1.0) * 10).toFixed(0)}%` : "—";
          const lastLoginDisplay = u.last_login ? new Date(u.last_login).toLocaleString() : "Never";

          tr.innerHTML = `
            <td>#${u.id}</td>
            <td>
              <span class="admin-user-pill">
                ${isUserAdmin ? "👑" : "👤"} ${escapeHTML(u.username)}
              </span>
              <span class="admin-email-sub">${escapeHTML(u.email)}</span>
            </td>
            <td><span class="admin-role-badge ${roleBadgeClass}">${roleLabel}</span></td>
            <td>${realmDisplay}</td>
            <td>${popDisplay}</td>
            <td>${resDisplay}</td>
            <td>${troopDisplay}</td>
            <td>${taxDisplay}</td>
            <td><small>${lastLoginDisplay}</small></td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error("Error refreshing admin dashboard:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-cell" style="color:#ff8b7b;">Error loading telemetry: ${escapeHTML(err.message)}</td></tr>`;
    }
  }
}

export function adminJumpEra(year) {
  jumpToYear(year);
  setTimeout(refreshAdminDashboard, 200);
}

export function adminSetSpeed(scale) {
  setChronoScale(scale);
  setTimeout(refreshAdminDashboard, 200);
}

export function adminTogglePause() {
  const isCurrentlyPaused = currentAdminDashboardData?.timeline?.is_paused;
  setTimelinePause(!isCurrentlyPaused);
  setTimeout(refreshAdminDashboard, 200);
}

// Initialize when DOM is ready
async function initApp() {
  const canvas = document.getElementById("world-map");
  if (canvas) {
    initRenderer(canvas);
    setupCanvasInteractions(canvas);
  }

  window.addEventListener("resize", resizeCanvas);

  // 1. Authoritative Server Timeline is the Single Source of Truth: sync before starting clock
  await initServerTimelineSync();
  startClock();

  if (state.token && state.currentUser) {
    // Validate session with server before entering game screen
    const authenticated = await checkMyKingdom();
    if (authenticated) {
      showGameScreen();
    }
  } else {
    showAuthScreen();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}


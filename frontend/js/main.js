// main.js - Application bootstrap & orchestrator for Kingdom Conquest

import { state, clearSession, syncKingdomsForYear, clearAllMilitaryVariables } from "./state.js";

// Optional Polynesian / Pacific island nations (Advanced Play Meta Theme)
const POLYNESIAN_ISLES = new Set(["WSM", "TON", "FJI", "VUT", "SLB", "FSM"]);
import {
  apiGetCountries,
  apiGetTroops,
  apiGetMyCountry,
  apiAssignCountry,
  apiGetAdminDashboard,
  apiGetAdminGameMonitor,
  apiPostScenarioTune,
  apiAdminResetGame,
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
  isCountryOwnedByCurrentUser,
  setMapResolution,
} from "./map/renderer.js";
import { showToast, logMessage } from "./ui/toast.js";
import {
  startClock,
  stopClock,
  tickClock,
  onEraChange,
  isTimelineAdmin,
  isPureOverseer,
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
  resetCommandCenterMilitaryState,
  switchConsoleBay,
  triggerCollectTaxes,
  triggerUpgradeMarket,
  triggerUpgradeInfra,
  triggerRecruitTroops,
  selectRecruitTier,
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
  adjustBudgetDial,
  triggerAutoBalanceBudget,
} from "./ui/console.js";
import {
  initAdminCharts,
  updateAdminCharts,
  switchAdminChartTab,
  switchAdminChartScope,
} from "./ui/admin_charts.js";

// Wire module callbacks
registerActionCallbacks({
  openKingdomCommandCenter,
  closeKingdomCommandCenter,
  refreshKingdomCommandCenter,
  resetCommandCenterMilitaryState,
  renderKingdomList,
  refreshMyKingdomStats,
  checkMyKingdom,
});

// React to live WebSocket broadcasts across every open browser session
onSocketStateChange((payload) => {
  renderMap();
  renderKingdomList();
  refreshMyKingdomStats();
  if (isAdminDashboardOpen) {
    refreshAdminDashboard();
  }
  if (isOverseerAnalyticsOpen) {
    refreshOverseerAnalytics();
  }
  if (state.myKingdom && state.myKingdom.country_id) {
    const mk = state.kingdoms.find((k) => k.id === state.myKingdom.country_id);
    if (!mk || !mk.owner_id || !isCountryOwnedByCurrentUser(mk)) {
      checkMyKingdom();
    } else {
      updateEconomyPanel(mk);
      refreshKingdomCommandCenter(mk);
    }
  }
  if (state.shownKingdomId) {
    const shown = state.kingdoms.find((k) => k.id === state.shownKingdomId);
    if (shown) {
      const popEl = document.getElementById("kingdom-population");
      const resEl = document.getElementById("kingdom-resources");
      if (popEl) popEl.textContent = (shown.population || 0).toLocaleString();
      if (resEl) resEl.textContent = (shown.resources !== undefined ? shown.resources : 0).toLocaleString();
    }
  }
});

// React to Historical Era transitions (adding new unowned countries to the map in each Age)
onEraChange((newEra, yearInt, prevEraId) => {
  if (newEra.id === "discovery" || yearInt <= 1500) {
    clearAllMilitaryVariables();
    resetCommandCenterMilitaryState();
  }
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
  toggleAdminDashboard(false);
  toggleOverseerAnalytics(false);
  document.getElementById("admin-console-btn")?.classList.add("hidden");
  document.getElementById("admin-analytics-quick-btn")?.classList.add("hidden");
  document.getElementById("dev-chrono-toggle-btn")?.classList.add("hidden");
  document.getElementById("dev-chrono-drawer")?.classList.add("hidden");
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

  const isAdmin = isTimelineAdmin();
  if (isAdmin) {
    document.getElementById("admin-console-btn")?.classList.remove("hidden");
    document.getElementById("admin-analytics-quick-btn")?.classList.remove("hidden");
    document.getElementById("dev-chrono-toggle-btn")?.classList.remove("hidden");
  } else {
    document.getElementById("admin-console-btn")?.classList.add("hidden");
    document.getElementById("admin-analytics-quick-btn")?.classList.add("hidden");
    document.getElementById("dev-chrono-toggle-btn")?.classList.add("hidden");
    document.getElementById("dev-chrono-drawer")?.classList.add("hidden");
  }

  // Pure Overseer (admin@sfsw.net / admin): neutral game monitor without property
  if (isPureOverseer()) {
    state.myKingdom = null;
    const playerKingdom = document.getElementById("player-kingdom");
    if (playerKingdom) {
      playerKingdom.textContent = "👑 Pure Overseer";
      playerKingdom.className = "admin-badge pure-overseer-badge";
    }
    const overseerBadge = document.getElementById("admin-overseer-badge");
    if (overseerBadge) {
      overseerBadge.textContent = "👑 PURE OVERSEER: PLANETARY SURVEILLANCE";
      overseerBadge.style.color = "#ffd700";
      overseerBadge.style.borderColor = "rgba(212, 175, 55, 0.7)";
      overseerBadge.style.background = "rgba(212, 175, 55, 0.15)";
    }
    document.getElementById("country-selection")?.classList.add("hidden");
    document.getElementById("my-kingdom")?.classList.add("hidden");
    closeModal();
    return true;
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
    }

    if (data.has_country) {
      state.myKingdom = data;
      const playerKingdom = document.getElementById("player-kingdom");
      if (playerKingdom) {
        if (isAdmin) {
          playerKingdom.innerHTML = `${escapeHTML(data.country_name)} <span class="admin-crown-tag" title="Imperial Admin Authority">👑</span>`;
          playerKingdom.className = "kingdom-badge player-admin-badge";
        } else {
          playerKingdom.textContent = data.country_name;
          playerKingdom.className = "kingdom-badge";
        }
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
        if (isAdmin) {
          playerKingdom.textContent = "No Kingdom 👑";
          playerKingdom.className = "kingdom-badge player-admin-badge";
        } else {
          playerKingdom.textContent = "No Kingdom";
          playerKingdom.className = "kingdom-badge";
        }
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
  const nameEl = document.getElementById("my-kingdom-name");
  const popEl = document.getElementById("my-kingdom-pop");
  const resEl = document.getElementById("my-kingdom-res");
  if (nameEl) nameEl.textContent = country.name || state.myKingdom.country_name || "";
  if (popEl) popEl.textContent = country.population !== undefined ? country.population.toLocaleString() : "0";
  if (resEl) resEl.textContent = country.resources !== undefined ? country.resources.toLocaleString() : "0";
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
  const totalRev = e.total_revenue ?? e.tax_revenue ?? 0;
  set("econ-revenue", totalRev.toLocaleString());
  const lastExp = e.last_total_exp ?? e.effective_total_exp ?? e.military_expenditure ?? 0;
  set("econ-last-exp", lastExp.toLocaleString());
  const thisExp = e.effective_total_exp ?? e.military_expenditure ?? 0;
  set("econ-military", thisExp.toLocaleString() + (e.deficit_capped ? " (Capped)" : ""));
  const effBal = e.effective_balance ?? Math.max(0, e.budget_balance ?? 0);
  const bal = document.getElementById("econ-balance");
  if (bal) {
    bal.textContent = "+" + effBal.toLocaleString();
    bal.classList.add("econ-positive");
    bal.classList.remove("econ-negative");
  }
  const popPress = e.population_pressure ?? 0;
  set("econ-pop-pressure", `${popPress}% Stress`);
  const mig = e.net_migration ?? 0;
  const migEl = document.getElementById("econ-migration");
  if (migEl) {
    migEl.textContent = `${mig > 0 ? "+" : ""}${mig}/yr`;
    migEl.classList.toggle("econ-positive", mig > 0);
    migEl.classList.toggle("econ-negative", mig < 0);
  }
  set("econ-reserve", e.gold_reserve.toLocaleString());
  set("econ-rate", e.tax_rate);
  set("econ-levels", `Markets ${e.markets} · Infrastructure ${e.infrastructure}`);

  if (state.lastEconomy) {
    setTrend("econ-currency-trend", e.currency_value, state.lastEconomy.currency_value);
    setTrend("econ-gdp-trend", e.gdp, state.lastEconomy.gdp);
    setTrend("econ-balance-trend", effBal, state.lastEconomy.effective_balance ?? state.lastEconomy.budget_balance);
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
      toggleAdminDashboard(false);
      toggleOverseerAnalytics(false);
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
      // If clicking any country you own, open the command center view
      if (isCountryOwnedByCurrentUser(kingdom)) {
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

      const isOwnedByMe = isCountryOwnedByCurrentUser(kingdom);
      const ownerLabel = isOwnedByMe
        ? "Owner: " + (state.currentUser?.username || "You") + " (Your Dominion)"
        : kingdom.owner_name
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
window.selectRecruitTier = selectRecruitTier;
window.triggerFortifyBorder = triggerFortifyBorder;
window.triggerDispatchTroops = triggerDispatchTroops;
window.stepTargetKingdom = stepTargetKingdom;
window.selectDiploStance = selectDiploStance;
window.triggerDispatchDiplomacy = triggerDispatchDiplomacy;
window.setTaxRate = setTaxRate;
window.setInvestmentRate = setInvestmentRate;
window.setSocialRate = setSocialRate;
window.adjustBudgetDial = adjustBudgetDial;
window.triggerAutoBalanceBudget = triggerAutoBalanceBudget;
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
window.toggleOverseerAnalytics = toggleOverseerAnalytics;
window.handleOverseerAnalyticsBackdrop = handleOverseerAnalyticsBackdrop;
window.refreshOverseerAnalytics = refreshOverseerAnalytics;
window.adminJumpEra = adminJumpEra;
window.adminSetSpeed = adminSetSpeed;
window.adminTogglePause = adminTogglePause;

// -------------------------------------------------------------
// IMPERIAL GAME MASTER & ADMIN CONSOLE CONTROLLER
// -------------------------------------------------------------

let isAdminDashboardOpen = false;
let currentAdminDashboardData = null;
let isAdminRefreshing = false;
let isAdminRefreshPending = false;
let adminRefreshTimer = null;

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
    if (!adminRefreshTimer) {
      // Live background update pulse every 1 second without queuing
      adminRefreshTimer = setInterval(() => {
        if (isAdminDashboardOpen) {
          refreshAdminDashboard();
        }
      }, 1000);
    }
  } else {
    if (adminRefreshTimer) {
      clearInterval(adminRefreshTimer);
      adminRefreshTimer = null;
    }
    isAdminRefreshPending = false;
    adminResetAbort(false);
  }
}

export function handleAdminDashboardBackdrop(event) {
  if (event.target && event.target.id === "admin-dashboard-modal") {
    toggleAdminDashboard(false);
  }
}

// -------------------------------------------------------------
// PLANETARY OVERSEER MACRO ANALYTICS & SURVEILLANCE CONTROLLER
// -------------------------------------------------------------

let isOverseerAnalyticsOpen = false;
let isOverseerRefreshing = false;
let isOverseerRefreshPending = false;
let overseerRefreshTimer = null;

export function toggleOverseerAnalytics(forceOpen) {
  if (typeof forceOpen === "boolean") {
    isOverseerAnalyticsOpen = forceOpen;
  } else {
    isOverseerAnalyticsOpen = !isOverseerAnalyticsOpen;
  }

  const modal = document.getElementById("overseer-analytics-modal");
  if (modal) {
    modal.classList.toggle("hidden", !isOverseerAnalyticsOpen);
  }

  if (isOverseerAnalyticsOpen) {
    refreshOverseerAnalytics();
    if (!overseerRefreshTimer) {
      overseerRefreshTimer = setInterval(() => {
        if (isOverseerAnalyticsOpen) {
          refreshOverseerAnalytics();
        }
      }, 1000);
    }
  } else {
    if (overseerRefreshTimer) {
      clearInterval(overseerRefreshTimer);
      overseerRefreshTimer = null;
    }
    isOverseerRefreshPending = false;
  }
}

export function handleOverseerAnalyticsBackdrop(event) {
  if (event.target && event.target.id === "overseer-analytics-modal") {
    toggleOverseerAnalytics(false);
  }
}

export async function refreshOverseerAnalytics() {
  if (!isOverseerAnalyticsOpen) return;
  if (isOverseerRefreshing) {
    isOverseerRefreshPending = true;
    return;
  }
  isOverseerRefreshing = true;
  isOverseerRefreshPending = false;

  try {
    const resMon = await apiGetAdminGameMonitor();
    if (!resMon.ok) {
      throw new Error(await readErrorMessage(resMon, "Failed to load overseer telemetry"));
    }
    const monData = await resMon.json();
    currentMonitorData = monData;
    renderGameMonitor(monData);
  } catch (err) {
    console.error("Error refreshing overseer analytics:", err);
  } finally {
    isOverseerRefreshing = false;
    if (isOverseerRefreshPending && isOverseerAnalyticsOpen) {
      isOverseerRefreshPending = false;
      setTimeout(refreshOverseerAnalytics, 200);
    }
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
  if (!isAdminDashboardOpen) return;
  // Non-queuing: if an update is currently in flight, record pending and skip spawning another request
  if (isAdminRefreshing) {
    isAdminRefreshPending = true;
    return;
  }
  isAdminRefreshing = true;
  isAdminRefreshPending = false;

  const tbody = document.getElementById("admin-users-tbody");
  try {
    const res = await apiGetAdminDashboard();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to load admin dashboard"));
    }
    const data = await res.json();
    currentAdminDashboardData = data;
    renderAdminDashboardData(data, tbody);
  } catch (err) {
    console.error("Error refreshing admin dashboard:", err);
    if (tbody && !currentAdminDashboardData) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-cell" style="color:#ff8b7b;">Error loading telemetry: ${escapeHTML(err.message)}</td></tr>`;
    }
  } finally {
    isAdminRefreshing = false;
    if (isAdminRefreshPending && isAdminDashboardOpen) {
      isAdminRefreshPending = false;
      setTimeout(refreshAdminDashboard, 200);
    }
  }
}

function renderAdminDashboardData(data, tbody) {
  if (!data) return;

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

  // Populate Users Table (in-place cell updates when rows match, preventing scroll jumping or row flicker)
  if (tbody) {
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No registered users in database.</td></tr>`;
      return;
    }

    const existingRows = tbody.querySelectorAll("tr[data-user-id]");
    if (existingRows.length === data.users.length) {
      let allFound = true;
      data.users.forEach((u) => {
        const row = tbody.querySelector(`tr[data-user-id="${u.id}"]`);
        if (!row) {
          allFound = false;
          return;
        }
        const cells = row.children;
        if (cells.length >= 9) {
          const hasCountry = u.country_id && u.country_name;
          const popDisplay = hasCountry ? Number(u.population || 0).toLocaleString() : "—";
          const resDisplay = hasCountry ? Number(u.resources || 0).toLocaleString() + " G" : "—";
          const troopDisplay = hasCountry ? Number(u.troops || 0).toLocaleString() : "—";
          const taxDisplay = hasCountry ? `${Math.round(Number(u.economy_rate ?? 50))}%` : "—";
          if (cells[4].textContent !== popDisplay) cells[4].textContent = popDisplay;
          if (cells[5].textContent !== resDisplay) cells[5].textContent = resDisplay;
          if (cells[6].textContent !== troopDisplay) cells[6].textContent = troopDisplay;
          if (cells[7].textContent !== taxDisplay) cells[7].textContent = taxDisplay;
        }
      });
      if (allFound) return;
    }

    tbody.innerHTML = "";
    data.users.forEach((u) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-user-id", String(u.id));
      const isUserAdmin = isTimelineAdmin(u);
      const isOverseer = isPureOverseer(u);
      const roleBadgeClass = isUserAdmin ? "role-admin" : "role-player";
      const roleLabel = isOverseer
        ? "👑 Pure Overseer"
        : (isUserAdmin ? "👑 Player-Admin" : "Player");

      const hasCountry = u.country_id && u.country_name;
      const realmDisplay = hasCountry
        ? `<span class="admin-realm-tag">
             <span class="admin-realm-swatch" style="background-color: ${u.country_color || '#d4af37'}"></span>
             <span>${escapeHTML(u.country_name)} (${escapeHTML(u.country_code || '---')})</span>
           </span>`
        : (isOverseer ? `<span class="admin-spectator-tag">👑 Overseer (Monitor)</span>` : `<span class="admin-spectator-tag">Spectator / Unclaimed</span>`);

      const popDisplay = hasCountry ? Number(u.population || 0).toLocaleString() : "—";
      const resDisplay = hasCountry ? Number(u.resources || 0).toLocaleString() + " G" : "—";
      const troopDisplay = hasCountry ? Number(u.troops || 0).toLocaleString() : "—";
      const taxDisplay = hasCountry ? `${Math.round(Number(u.economy_rate ?? 50))}%` : "—";
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

// ----------------------------------------------------------------------------
// PROTECTED 3-STAGE GAME RESET WORKFLOW
// ----------------------------------------------------------------------------
let adminResetStage = 1;

export function adminResetSetStage(stage) {
  adminResetStage = stage;
  const s1 = document.getElementById("admin-reset-stage-1");
  const s2 = document.getElementById("admin-reset-stage-2");
  const s3 = document.getElementById("admin-reset-stage-3");
  const b1 = document.getElementById("reset-step-1");
  const b2 = document.getElementById("reset-step-2");
  const b3 = document.getElementById("reset-step-3");
  const l1 = document.getElementById("reset-line-1");
  const l2 = document.getElementById("reset-line-2");
  const badge = document.getElementById("admin-reset-stage-badge");

  if (s1) s1.classList.toggle("hidden", stage !== 1);
  if (s2) s2.classList.toggle("hidden", stage !== 2);
  if (s3) s3.classList.toggle("hidden", stage !== 3);

  if (b1) b1.className = stage >= 1 ? "reset-step active" : "reset-step";
  if (b2) b2.className = stage >= 2 ? "reset-step active" : "reset-step";
  if (b3) b3.className = stage >= 3 ? "reset-step active" : "reset-step";
  if (l1) l1.classList.toggle("active", stage >= 2);
  if (l2) l2.classList.toggle("active", stage >= 3);

  if (badge) {
    if (stage === 1) {
      badge.textContent = "STAGE 1: LATCH SECURED 🔒";
      badge.className = "admin-stage-indicator stage-locked";
    } else if (stage === 2) {
      badge.textContent = "STAGE 2: DISARMED / VERIFYING ⚠️";
      badge.className = "admin-stage-indicator stage-verifying";
    } else if (stage === 3) {
      badge.textContent = "STAGE 3: MASTER TRIGGER ARMED 🚨";
      badge.className = "admin-stage-indicator stage-critical";
    }
  }
}

export function adminResetStage1Unlock() {
  adminResetSetStage(2);
  const input = document.getElementById("admin-reset-confirm-input");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 60);
  }
  const btn2 = document.getElementById("admin-reset-btn-stage2");
  if (btn2) btn2.disabled = true;
}

export function adminResetCheckInput(val) {
  const btn2 = document.getElementById("admin-reset-btn-stage2");
  const matches = (val || "").trim().toUpperCase() === "RESET WORLD 1500";
  if (btn2) {
    btn2.disabled = !matches;
  }
}

export function adminResetStage2Verify() {
  const input = document.getElementById("admin-reset-confirm-input");
  const matches = (input?.value || "").trim().toUpperCase() === "RESET WORLD 1500";
  if (!matches) {
    showToast("Authorization phrase must be 'RESET WORLD 1500'", "error");
    return;
  }
  const clearClaims = document.getElementById("admin-reset-clear-claims")?.checked ?? true;
  const summary = document.getElementById("admin-reset-stage3-summary");
  if (summary) {
    summary.textContent = `Rewind to 1500.0 · Reset All Players to Initial Values · Claims: ${clearClaims ? "Unassigned (Full Realm Wipe)" : "Retained with 1500 Starting Vitals"}`;
  }
  adminResetSetStage(3);
}

export function adminResetAbort(notify = true) {
  const input = document.getElementById("admin-reset-confirm-input");
  if (input) input.value = "";
  adminResetSetStage(1);
  if (notify) {
    showToast("World Reset Aborted. Safety Latch Re-Engaged 🔒", "info");
  }
}

export async function adminResetStage3Execute() {
  const btn = document.getElementById("admin-reset-btn-stage3");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ DISPATCHING MASTER PURGE...";
  }
  const clearClaims = document.getElementById("admin-reset-clear-claims")?.checked ?? true;
  try {
    const res = await apiAdminResetGame("RESET WORLD 1500", clearClaims);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to execute world reset"));
    }
    const data = await res.json();
    showToast("🔥 " + (data.message || "World reset to Year 1500!"), "success");
    logMessage("CRITICAL: Master World Reset to Year 1500 executed by Imperial Admin.");
    clearAllMilitaryVariables();
    resetCommandCenterMilitaryState();
    adminResetSetStage(1);
    const input = document.getElementById("admin-reset-confirm-input");
    if (input) input.value = "";
    refreshAdminDashboard();
    checkMyKingdom();
    renderMap();
  } catch (err) {
    console.error("Error executing world reset:", err);
    showToast(err.message || "Error executing world reset", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔥 STAGE 3: EXECUTE TOTAL WORLD RESET (1500)";
    }
  }
}

window.adminResetStage1Unlock = adminResetStage1Unlock;
window.adminResetCheckInput = adminResetCheckInput;
window.adminResetStage2Verify = adminResetStage2Verify;
window.adminResetAbort = adminResetAbort;
window.adminResetStage3Execute = adminResetStage3Execute;

// ==========================================================================
// Admin Game Monitor & 5-Tier Variable Classification Matrix Logic
// ==========================================================================

let currentMonitorData = null;
let selectedMonitorClass = "all";
let selectedMonitorRealm = "ALL";

function renderGameMonitor(data) {
  if (!data) return;

  const syncTag = document.getElementById("admin-monitor-last-sync");
  if (syncTag) {
    const d = data.timestamp ? new Date(data.timestamp * 1000) : new Date();
    syncTag.textContent = `Telemetry: ${d.toLocaleTimeString()}`;
  }

  // Render Seasonal & Climatic Atmospheric Gauge Bar
  const season = data.seasonal_climatic;
  if (season) {
    const seasonBadge = document.getElementById("admin-climate-season");
    const seasonName = document.getElementById("admin-climate-season-name");
    if (seasonBadge && seasonName) {
      seasonName.textContent = season.season || "Spring";
      seasonBadge.className = "seasonal-pill season-badge";
      const sLower = (season.season || "").toLowerCase();
      const iconSpan = seasonBadge.querySelector(".pill-icon");
      if (sLower.includes("spring")) {
        seasonBadge.classList.add("season-spring");
        if (iconSpan) iconSpan.textContent = "🌱";
      } else if (sLower.includes("summer")) {
        seasonBadge.classList.add("season-summer");
        if (iconSpan) iconSpan.textContent = "☀️";
      } else if (sLower.includes("autumn") || sLower.includes("harvest")) {
        seasonBadge.classList.add("season-autumn");
        if (iconSpan) iconSpan.textContent = "🌾";
      } else if (sLower.includes("winter")) {
        seasonBadge.classList.add("season-winter");
        if (iconSpan) iconSpan.textContent = "❄️";
      }
    }

    const phaseBox = document.getElementById("admin-climate-phase-box");
    const phaseVal = document.getElementById("admin-climate-phase");
    if (phaseVal) {
      phaseVal.textContent = season.little_ice_age_phase || "Baseline Holocene";
      if (phaseBox) {
        if (season.is_little_ice_age) {
          phaseBox.classList.add("little-ice-age-active");
        } else {
          phaseBox.classList.remove("little-ice-age-active");
        }
      }
    }

    const harvestVal = document.getElementById("admin-climate-harvest");
    if (harvestVal) {
      const hPct = Math.round((season.harvest_yield_factor || 1.0) * 100);
      harvestVal.textContent = `${hPct}%`;
      harvestVal.style.color = hPct < 95 ? "#f87171" : (hPct > 105 ? "#4ade80" : "#f8fafc");
    }

    const winterLogisticsVal = document.getElementById("admin-climate-winter-logistics");
    if (winterLogisticsVal) {
      const wMod = season.winter_logistics_modifier || 1.0;
      winterLogisticsVal.textContent = `${wMod.toFixed(2)}x`;
      winterLogisticsVal.style.color = wMod > 1.05 ? "#67e8f9" : "#f8fafc";
    }

    const velocityVal = document.getElementById("admin-climate-velocity");
    if (velocityVal) {
      const vMod = season.commercial_velocity || 1.0;
      velocityVal.textContent = `${vMod.toFixed(2)}x`;
      velocityVal.style.color = vMod < 0.9 ? "#fbbf24" : (vMod > 1.05 ? "#4ade80" : "#f8fafc");
    }

    const orbitalVal = document.getElementById("admin-climate-orbital");
    if (orbitalVal) {
      orbitalVal.textContent = season.orbital_forcing_description || "Neutral";
    }
  }

  // Populate realm selects if empty or count changed
  populateMonitorRealms(data.kingdoms || []);

  // Render cards
  renderGameMonitorCards();

  // Render pure overseer deep visual analytics charts
  updateAdminCharts(data);
}

function populateMonitorRealms(kingdoms) {
  const selectFilter = document.getElementById("admin-monitor-realm-select");
  const selectTune = document.getElementById("tune-realm-id");
  if (!selectFilter || !selectTune) return;

  const currentFilterVal = selectFilter.value;
  const currentTuneVal = selectTune.value;

  if (selectFilter.options.length > 1 && selectFilter.options.length === kingdoms.length + 1) {
    return;
  }

  selectFilter.innerHTML = '<option value="ALL">🌐 All Realms Matrix</option>';
  selectTune.innerHTML = '';

  kingdoms.forEach(k => {
    const realmName = k.name || k.country_name || "Realm";
    const realmCode = k.code || k.country_id;
    const realmVal = String(k.country_id);

    const opt1 = document.createElement("option");
    opt1.value = realmVal;
    opt1.textContent = `${realmName} (${realmCode})`;
    selectFilter.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = realmVal;
    opt2.textContent = `${realmName} (${realmCode})`;
    selectTune.appendChild(opt2);
  });

  if (currentFilterVal && Array.from(selectFilter.options).some(o => o.value === currentFilterVal)) {
    selectFilter.value = currentFilterVal;
  }
  if (currentTuneVal && Array.from(selectTune.options).some(o => o.value === currentTuneVal)) {
    selectTune.value = currentTuneVal;
  }
}

export function setMonitorClassFilter(cls) {
  selectedMonitorClass = cls;
  const buttons = document.querySelectorAll(".monitor-pill-btn");
  buttons.forEach(btn => {
    if (btn.getAttribute("data-class") === cls) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderGameMonitorCards();
}

export function renderGameMonitorCards() {
  const container = document.getElementById("admin-monitor-cards-container");
  if (!container || !currentMonitorData) return;

  const realmSelect = document.getElementById("admin-monitor-realm-select");
  selectedMonitorRealm = realmSelect ? realmSelect.value : "ALL";

  const cards = [];
  const cls = selectedMonitorClass;
  const data = currentMonitorData;

  // 1. Game State (Global Macro)
  if ((cls === "all" || cls === "game_state") && selectedMonitorRealm === "ALL") {
    const macro = data.global_macro_metrics || {};
    const gState = data.game_state || {};
    const worldPop = macro.total_world_population || gState.global_population || 0;
    const worldGold = macro.total_global_treasury || gState.global_treasury_gold || 0;
    const stressRatio = macro.world_carrying_capacity_stress || 0.71;

    cards.push(`
      <div class="monitor-card">
        <div class="card-header-bar">
          <span class="class-tier-tag class-game_state">3. Game State</span>
          <span class="card-realm-name">Global World State</span>
        </div>
        <div class="card-var-title">Global Carrying Capacity Stress</div>
        <div class="card-var-val ${stressRatio > 0.85 ? 'val-danger' : (stressRatio > 0.65 ? 'val-warn' : 'val-good')}">
          ${(stressRatio * 100).toFixed(1)}%
        </div>
        <div class="card-meter-track">
          <div class="card-meter-fill ${stressRatio > 0.85 ? 'fill-red' : (stressRatio > 0.65 ? 'fill-yellow' : 'fill-green')}" style="width: ${Math.min(100, stressRatio * 100)}%;"></div>
        </div>
        <div class="card-meta-notes">
          World Pop: ${Number(worldPop).toLocaleString()} across ${macro.total_realms || (data.kingdoms || []).length} sovereign territories.
        </div>
      </div>
    `);

    cards.push(`
      <div class="monitor-card">
        <div class="card-header-bar">
          <span class="class-tier-tag class-game_state">3. Game State</span>
          <span class="card-realm-name">Global World State</span>
        </div>
        <div class="card-var-title">Global Specie Liquidity &amp; Chrono</div>
        <div class="card-var-val val-good">
          $${Number(worldGold).toLocaleString()}
        </div>
        <div class="card-meta-notes">
          Sim Year: ${data.sim_year ? Number(data.sim_year).toFixed(2) : (gState.sim_year ? Number(gState.sim_year).toFixed(2) : "1500.00")} | Era: ${data.era || gState.authoritative_era?.name || "Discovery"} | Pace: ${data.chrono_scale || gState.chrono_scale || "1s"}
        </div>
      </div>
    `);
  }

  // 2. Seasonal Variables
  if ((cls === "all" || cls === "seasonal") && selectedMonitorRealm === "ALL") {
    const s = data.seasonal_climatic || data.seasonal_state || {};
    const harvestPct = Math.round((s.harvest_yield_factor || s.HarvestYieldFactor || 1.0) * 100);
    const winterMod = s.winter_logistics_modifier || s.WinterSeverity || 1.0;
    const velocity = s.commercial_velocity || s.CommercialVelocity || 1.0;
    const orbitalVal = s.milankovitch_eccentricity_factor || s.MilankovitchEccentricity || 1.0;
    const forcing = s.orbital_forcing_description || s.OrbitalForcingDescription || "Neutral";

    cards.push(`
      <div class="monitor-card">
        <div class="card-header-bar">
          <span class="class-tier-tag class-seasonal">4. Seasonal Cycles</span>
          <span class="card-realm-name">Milankovitch Orbital Forcing</span>
        </div>
        <div class="card-var-title">Eccentricity Oscillation Factor</div>
        <div class="card-var-val">
          ${Number(orbitalVal).toFixed(4)}
        </div>
        <div class="card-meta-notes">
          Forcing state: ${escapeHTML(forcing)}. Drives multi-decadal solar irradiance and Little Ice Age vulnerability.
        </div>
      </div>
    `);

    cards.push(`
      <div class="monitor-card">
        <div class="card-header-bar">
          <span class="class-tier-tag class-seasonal">4. Seasonal Cycles</span>
          <span class="card-realm-name">${escapeHTML(s.season || s.SeasonName || "Spring")} Yield &amp; Logistics</span>
        </div>
        <div class="card-var-title">Harvest Yield vs Winter Attrition</div>
        <div class="card-var-val ${harvestPct < 95 ? 'val-warn' : 'val-good'}">
          ${harvestPct}% / ${Number(winterMod).toFixed(2)}x
        </div>
        <div class="card-meta-notes">
          Trade velocity: ${Number(velocity).toFixed(2)}x. Winter logistics levies severe quarterly attrition unless border garrisons are fortified.
        </div>
      </div>
    `);
  }

  // 3. Kingdom-Specific Variables (Classes 1, 2, 5)
  const kingdoms = data.kingdoms || [];
  kingdoms.forEach(k => {
    const kIdStr = String(k.country_id);
    const kCode = k.code || "";
    if (selectedMonitorRealm !== "ALL" && selectedMonitorRealm !== kIdStr && selectedMonitorRealm !== kCode) return;

    const realmName = k.name || k.country_name || "Realm";
    const realmCode = k.code || k.country_id;

    // Class 2: User State (Hidden)
    if (cls === "all" || cls === "user_state") {
      const pride = k.user_state?.entrepreneurial_pride ?? 100.0;
      const prideColor = pride < 40 ? "val-danger" : (pride < 70 ? "val-warn" : "val-good");
      const prideFill = pride < 40 ? "fill-red" : (pride < 70 ? "fill-yellow" : "fill-green");

      cards.push(`
        <div class="monitor-card">
          <div class="card-header-bar">
            <span class="class-tier-tag class-user_state">2. User State (Hidden)</span>
            <span class="card-realm-name">${escapeHTML(realmName)} (${realmCode})</span>
          </div>
          <div class="card-var-title">Entrepreneurial Pride &amp; Risk Willingness</div>
          <div class="card-var-val ${prideColor}">
            ${Number(pride).toFixed(1)}%
          </div>
          <div class="card-meter-track">
            <div class="card-meter-fill ${prideFill}" style="width: ${Math.min(100, Math.max(0, pride))}%;"></div>
          </div>
          <div class="card-meta-notes">
            Intangible commercial vitality. Erodes when tax &gt; 40%. Recovers at lower rates. Blunts venture investment and risk appetite if depressed.
          </div>
        </div>
      `);

      const delayed = k.user_state?.military_delayed_costs ?? k.user_state?.military_delayed_liabilities ?? 0;
      cards.push(`
        <div class="monitor-card">
          <div class="card-header-bar">
            <span class="class-tier-tag class-user_state">2. User State (Hidden)</span>
            <span class="card-realm-name">${escapeHTML(realmName)} (${realmCode})</span>
          </div>
          <div class="card-var-title">Delayed Military Tail Liabilities</div>
          <div class="card-var-val ${delayed > 5000 ? 'val-danger' : (delayed > 1000 ? 'val-warn' : 'val-good')}">
            $${Number(delayed).toLocaleString()}
          </div>
          <div class="card-meta-notes">
            Long-tail liability incurred from prior military expansions. Decays smoothly at 20%/year (t½ ≈ 3.1 yrs) into the annual state budget.
          </div>
        </div>
      `);
    }

    // Class 1: User Setting
    if (cls === "all" || cls === "user_setting") {
      const settings = k.user_settings || {};
      const taxRate = settings.tax_rate_display ?? settings.tax_rate ?? 10;
      const invRate = settings.investment_rate ?? settings.investment ?? 0;
      const socRate = settings.social_costs_rate ?? settings.social_costs ?? 0;
      const central = settings.troops_central ?? settings.mobilized_central_troops ?? 0;
      const border = settings.troops_border ?? settings.mobilized_border_troops ?? 0;
      const fortsCount = settings.fortified_borders_count ?? ((settings.fort_n?1:0)+(settings.fort_s?1:0)+(settings.fort_e?1:0)+(settings.fort_w?1:0));

      cards.push(`
        <div class="monitor-card">
          <div class="card-header-bar">
            <span class="class-tier-tag class-user_setting">1. User Setting</span>
            <span class="card-realm-name">${escapeHTML(realmName)} (${realmCode})</span>
          </div>
          <div class="card-var-title">Fiscal &amp; Military Directives</div>
          <div class="card-var-val">
            ${Number(taxRate).toFixed(1)}% Tax
          </div>
          <div class="card-meta-notes">
            Invest: ${Number(invRate).toFixed(1)}% | Social: ${Number(socRate).toFixed(1)}%<br>
            Troops: ${Number(central).toLocaleString()} central / ${Number(border).toLocaleString()} border | ${fortsCount} forts
          </div>
        </div>
      `);
    }

    // Class 5: Population Pressure
    if (cls === "all" || cls === "population_pressure") {
      const pop = k.population_pressure || {};
      const discount = pop.manpower_recruitment_discount ?? 1.0;
      const discountPct = Math.round((1 - discount) * 100);
      const ratio = pop.carrying_capacity_ratio ?? pop.population_pressure_index ?? 0.5;
      const ratioFill = ratio > 0.9 ? "fill-red" : (ratio > 0.75 ? "fill-yellow" : "fill-green");
      const squalor = pop.welfare_squalor_burden ?? 0;
      const popCount = pop.population ?? 0;

      cards.push(`
        <div class="monitor-card">
          <div class="card-header-bar">
            <span class="class-tier-tag class-population_pressure">5. Population Pressure</span>
            <span class="card-realm-name">${escapeHTML(realmName)} (${realmCode})</span>
          </div>
          <div class="card-var-title">Manpower Discount vs Squalor Burden</div>
          <div class="card-var-val ${discountPct > 20 ? 'val-good' : ''}">
            -${discountPct}% Troop Cost
          </div>
          <div class="card-meter-track">
            <div class="card-meter-fill ${ratioFill}" style="width: ${Math.min(100, ratio * 100)}%;"></div>
          </div>
          <div class="card-meta-notes">
            Population: ${Number(popCount).toLocaleString()}<br>
            Welfare Squalor Burden: $${Math.round(squalor).toLocaleString()}/yr | Manpower Cost Mod: ${(discount * 100).toFixed(0)}%
          </div>
        </div>
      `);
    }
  });

  if (cards.length === 0) {
    container.innerHTML = `<div class="loading-cell" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #8da4b8;">No variables matching the selected filter criteria.</div>`;
  } else {
    container.innerHTML = cards.join("");
  }
}

export async function applyScenarioPreset(presetName) {
  const statusEl = document.getElementById("scenario-tune-status");
  const tuneRealmSelect = document.getElementById("tune-realm-id");
  const countryId = tuneRealmSelect ? tuneRealmSelect.value : "ENG";

  if (!countryId) {
    if (statusEl) {
      statusEl.textContent = "Please select a target realm first.";
      statusEl.style.color = "#f87171";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = `Injecting preset '${presetName}' into ${countryId}...`;
    statusEl.style.color = "#ffd700";
  }

  try {
    const res = await apiPostScenarioTune({
      country_id: countryId,
      preset: presetName,
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Preset injection failed"));
    }
    const result = await res.json();
    if (statusEl) {
      statusEl.textContent = `✓ ${result.message || "Scenario injected successfully"}`;
      statusEl.style.color = "#4ade80";
    }
    await refreshOverseerAnalytics();
    if (isAdminDashboardOpen) {
      refreshAdminDashboard();
    }
  } catch (err) {
    console.error("Scenario preset injection error:", err);
    if (statusEl) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = "#f87171";
    }
  }
}

export async function submitCustomScenarioTune() {
  const statusEl = document.getElementById("scenario-tune-status");
  const realmSelect = document.getElementById("tune-realm-id");
  const prideInput = document.getElementById("tune-pride");
  const delayedInput = document.getElementById("tune-delayed-costs");
  const resInput = document.getElementById("tune-resources");

  const countryId = realmSelect ? realmSelect.value : "";
  if (!countryId) {
    if (statusEl) {
      statusEl.textContent = "Please select a target realm.";
      statusEl.style.color = "#f87171";
    }
    return;
  }

  const payload = { country_id: countryId };
  if (prideInput && prideInput.value !== "") {
    payload.entrepreneurial_pride = parseFloat(prideInput.value);
  }
  if (delayedInput && delayedInput.value !== "") {
    payload.military_delayed_costs = parseInt(delayedInput.value, 10);
  }
  if (resInput && resInput.value !== "") {
    payload.resources = parseInt(resInput.value, 10);
  }

  if (statusEl) {
    statusEl.textContent = `Applying variable calibration to ${countryId}...`;
    statusEl.style.color = "#ffd700";
  }

  try {
    const res = await apiPostScenarioTune(payload);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Calibration failed"));
    }
    const result = await res.json();
    if (statusEl) {
      statusEl.textContent = `✓ ${result.message || "Calibration applied"}`;
      statusEl.style.color = "#4ade80";
    }
    await refreshOverseerAnalytics();
    if (isAdminDashboardOpen) {
      refreshAdminDashboard();
    }
  } catch (err) {
    console.error("Custom scenario tune error:", err);
    if (statusEl) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = "#f87171";
    }
  }
}

export function openPureAdminAnalytics() {
  toggleAdminDashboard(false);
  toggleOverseerAnalytics(true);
}

window.openPureAdminAnalytics = openPureAdminAnalytics;
window.setMonitorClassFilter = setMonitorClassFilter;
window.renderGameMonitorCards = renderGameMonitorCards;
window.applyScenarioPreset = applyScenarioPreset;
window.submitCustomScenarioTune = submitCustomScenarioTune;
window.setMapResolution = (mode) => {
  const activeMode = setMapResolution(mode);
  const labels = {
    fast: "Fast (Low-Poly)",
    high_res: "High-Res (Historical)",
    realistic: "Realistic (Ultra-HD)",
  };
  showToast(`Cartography switched to ${labels[activeMode] || activeMode}`, "info");
};

// Initialize when DOM is ready
async function initApp() {
  const resSelect = document.getElementById("map-resolution-select");
  if (resSelect && state.mapResolution) {
    resSelect.value = state.mapResolution;
  }

  const canvas = document.getElementById("world-map");
  if (canvas) {
    initRenderer(canvas);
    setupCanvasInteractions(canvas);
  }

  // Initialize pure overseer macro visualizer charts
  initAdminCharts();

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


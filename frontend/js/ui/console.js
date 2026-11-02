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

const DIAL_BASE_DEG = 120;
const DIAL_DEG_PER_UNIT = 2.4; // 240 deg sweep for 0..100 range

export function closeKingdomCommandCenter() {
  const cc = document.getElementById("kingdom-command-center");
  if (cc) cc.classList.add("hidden");
}

export async function openKingdomCommandCenter(kingdom, bay = "all") {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal) return;

  if (!kingdom) {
    kingdom = state.myKingdom
      ? state.kingdoms.find((k) => k.id === state.myKingdom.country_id) || state.myKingdom
      : null;
  }
  if (!kingdom) return;

  const kingdomNameEl = document.getElementById("cc-kingdom-name");
  if (kingdomNameEl) kingdomNameEl.textContent = kingdom.name || "My Kingdom";

  const codeEl = document.getElementById("cc-kingdom-code");
  if (codeEl) codeEl.textContent = kingdom.code || "REALM";

  const rulerEl = document.getElementById("cc-ruler-name");
  if (rulerEl) {
    rulerEl.textContent = state.currentUser ? `Lord ${state.currentUser.username}` : "Sovereign";
  }

  const crestEl = document.getElementById("cc-realm-crest");
  if (crestEl && kingdom.color) {
    crestEl.style.filter = `drop-shadow(0 0 10px ${kingdom.color})`;
  }

  // Fetch consolidated kingdom detail
  let detail = null;
  try {
    const res = await apiGetKingdomDetail();
    if (res.ok) {
      detail = await res.json();
      commandCenterDetail = detail;
    }
  } catch (err) {
    console.error("Error fetching kingdom detail:", err);
  }

  // Fetch diplomatic relations
  let relations = [];
  try {
    const res = await apiGetDiplomacy();
    if (res.ok) {
      relations = await res.json();
    }
  } catch (err) {
    console.error("Error fetching diplomacy:", err);
  }

  // Bind values from server detail or fallbacks
  const pop = detail?.population ?? kingdom.population ?? 1000;
  const resAmt = detail?.resources ?? kingdom.resources ?? 500;
  const central = detail?.central_troops ?? state.troops[kingdom.id]?.central ?? 0;
  const borders = detail?.border_troops ?? state.troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };

  taxRate = typeof detail?.economy_rate === "number" ? detail.economy_rate : 50;
  investmentRate = typeof detail?.investment === "number" ? detail.investment : 0;
  socialCostsRate = typeof detail?.social_costs === "number" ? detail.social_costs : 0;
  marketsLevel = typeof detail?.markets === "number" ? detail.markets : 0;
  infraLevel = typeof detail?.infrastructure === "number" ? detail.infrastructure : 0;

  // Initialize and render all meters
  renderMeters();
  setMeter("cc-meter-population", pop, 5000);
  setMeter("cc-meter-resources", resAmt, 3000);
  setMeter("cc-meter-troops", central, 200);

  const popVal = document.getElementById("cc-meter-pop-val");
  if (popVal) popVal.textContent = pop.toLocaleString();
  const resVal = document.getElementById("cc-meter-res-val");
  if (resVal) resVal.textContent = resAmt.toLocaleString();
  const troopVal = document.getElementById("cc-meter-troop-val");
  if (troopVal) troopVal.textContent = central.toLocaleString();

  // Military Tier Label
  const tierBadge = document.getElementById("cc-army-tier");
  if (tierBadge) {
    let tier = "LEVY";
    if (central >= 5000) tier = "HORDE";
    else if (central >= 1000) tier = "LEGION";
    else if (central >= 500) tier = "BATTALION";
    else if (central >= 100) tier = "COMPANY";
    tierBadge.textContent = tier;
  }

  updateStepperDisplay();
  wireConsoleDials();

  setTaxRate(taxRate, false);
  setInvestmentRate(investmentRate, false);
  setSocialRate(socialCostsRate, false);
  updateEconomyHintsLive();

  updateBorderGarrisonPods(borders);
  setCompassSide(compassDirection, true);

  const minimap = document.getElementById("cc-minimap");
  if (minimap) {
    const ctx = minimap.getContext("2d");
    ctx.clearRect(0, 0, minimap.width, minimap.height);
    renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
  }

  updateTargetKingdomDisplay();
  selectDiploStance(diplomaticStance);
  renderDiplomacyLedger(relations);

  const recruitCostLabel = document.getElementById("cc-recruit-cost-label");
  if (recruitCostLabel) {
    const cost = Math.max(1, Math.floor(pop / 100));
    recruitCostLabel.textContent = `Cost: ${cost} Ducats · +10 Troops`;
  }

  switchConsoleBay(bay);
  modal.classList.remove("hidden");
}

export async function refreshKingdomCommandCenter() {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal || modal.classList.contains("hidden")) return;
  if (!state.myKingdom) return;

  try {
    const res = await apiGetKingdomDetail();
    if (!res.ok) return;
    const detail = await res.json();
    commandCenterDetail = detail;

    const kingdom = state.kingdoms.find((k) => k.id === state.myKingdom.country_id) || state.myKingdom;
    const pop = detail.population ?? kingdom.population ?? 1000;
    const resAmt = detail.resources ?? kingdom.resources ?? 500;
    const central = detail.central_troops ?? state.troops[kingdom.id]?.central ?? 0;
    const borders = detail.border_troops ?? state.troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };
    marketsLevel = detail.markets || 0;
    infraLevel = detail.infrastructure || 0;

    renderMeters();
    setMeter("cc-meter-population", pop, 5000);
    setMeter("cc-meter-resources", resAmt, 3000);
    setMeter("cc-meter-troops", central, 200);

    const popVal = document.getElementById("cc-meter-pop-val");
    if (popVal) popVal.textContent = pop.toLocaleString();
    const resVal = document.getElementById("cc-meter-res-val");
    if (resVal) resVal.textContent = resAmt.toLocaleString();
    const troopVal = document.getElementById("cc-meter-troop-val");
    if (troopVal) troopVal.textContent = central.toLocaleString();

    const tierBadge = document.getElementById("cc-army-tier");
    if (tierBadge) {
      let tier = "LEVY";
      if (central >= 5000) tier = "HORDE";
      else if (central >= 1000) tier = "LEGION";
      else if (central >= 500) tier = "BATTALION";
      else if (central >= 100) tier = "COMPANY";
      tierBadge.textContent = tier;
    }

    if (!activeDial) {
      if (typeof detail.economy_rate === "number") setTaxRate(detail.economy_rate, false);
      if (typeof detail.investment === "number") setInvestmentRate(detail.investment, false);
      if (typeof detail.social_costs === "number") setSocialRate(detail.social_costs, false);
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
  } catch (err) {
    console.error("Error refreshing command center:", err);
  }
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
      const pt = e.touches && e.touches.length ? e.touches[0] : e;
      cfg.set(dialValueFromPoint(dial, pt.clientX, pt.clientY), false);
      e.preventDefault();
    };

    dial.addEventListener("mousedown", onStart);
    dial.addEventListener("touchstart", onStart, { passive: false });

    dial.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 2 : -2;
        cfg.set(cfg.get() + delta, true);
      },
      { passive: false }
    );

    dial.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        cfg.set(cfg.get() + step, true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        cfg.set(cfg.get() - step, true);
      }
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (!activeDial) return;
    const dial = document.getElementById(activeDial.id);
    if (dial) {
      activeDial.set(dialValueFromPoint(dial, e.clientX, e.clientY), false);
    }
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!activeDial || !e.touches.length) return;
      const dial = document.getElementById(activeDial.id);
      if (dial) {
        activeDial.set(dialValueFromPoint(dial, e.touches[0].clientX, e.touches[0].clientY), false);
      }
    },
    { passive: false }
  );

  const onEnd = () => {
    if (!activeDial) return;
    activeDial = null;
    schedulePushEconomySettings();
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
  if (push) schedulePushEconomySettings();
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
  if (push) schedulePushEconomySettings();
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
  if (push) schedulePushEconomySettings();
}

export function schedulePushEconomySettings() {
  if (debouncedPushSettingsTimer) clearTimeout(debouncedPushSettingsTimer);
  debouncedPushSettingsTimer = setTimeout(() => {
    pushEconomySettings();
  }, 350);
}

export function pushEconomySettings() {
  if (!state.token || !state.myKingdom) return;
  apiSetEconomySettings(taxRate, investmentRate, socialCostsRate)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to persist economy settings");
      return res.json();
    })
    .then((data) => {
      logMessage(`Economy updated: Tax ${taxRate}%, Inv ${investmentRate}%, Social ${socialCostsRate}%`);
      if (data) {
        updateDerivedEconomyUI(data.gdp, data.currency_value, data.inflation_rate, data.budget_balance);
      }
    })
    .catch((err) => console.error("Error setting economy settings:", err));
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
    (state.myKingdom && state.kingdoms.find((k) => k.id === state.myKingdom.country_id)) ||
    state.myKingdom ||
    {};
  const pop = commandCenterDetail?.population ?? kingdom.population ?? 1000;
  const res = commandCenterDetail?.resources ?? kingdom.resources ?? 500;
  const tr = commandCenterDetail?.central_troops ?? 0;

  const baseProductivity = 0.08;
  const infraBonus = 1.0 + (infraLevel || 0) * 0.03;
  const mktBonus = 1.0 + (marketsLevel || 0) * 0.05;
  const invBonus = 1.0 + (investmentRate || 0) * 0.002;
  const laffer = lafferJs(taxRate);

  const gdp = pop * baseProductivity * infraBonus * mktBonus * invBonus * laffer;
  const revenue = Math.round(gdp * (taxRate / 100.0) + 0.5);
  const expenditure = Math.round(tr * 0.5 + (socialCostsRate + investmentRate) * 0.2 + 0.5);
  const balance = revenue - expenditure;

  let value = 1.0;
  if (gdp > 0) value = res / gdp / 5.0;

  let inflation = 0.0;
  if (balance < 0) inflation = -balance * 0.05;
  inflation += socialCostsRate * 0.02 + investmentRate * 0.005;
  if (inflation > 100) inflation = 100;

  const taxHint = document.getElementById("cc-tax-impact-hint");
  if (taxHint) {
    if (taxRate > 62) {
      taxHint.textContent = `Rev: +${revenue}/tick (⚠️ Tax Drag)`;
      taxHint.style.color = "#ff6b6b";
    } else {
      taxHint.textContent = `Tax Revenue: +${revenue}/tick`;
      taxHint.style.color = "#4ecdc4";
    }
  }

  const invHint = document.getElementById("cc-investment-hint");
  if (invHint) {
    invHint.textContent = `+${(investmentRate * 0.2).toFixed(1)}% GDP Multiplier`;
  }

  const socHint = document.getElementById("cc-social-hint");
  if (socHint) {
    socHint.textContent = `Spend: -${Math.round(socialCostsRate * 0.2)} ducats · Infl: +${(socialCostsRate * 0.02).toFixed(1)}%`;
  }

  const popGrowthEl = document.getElementById("cc-pop-growth");
  if (popGrowthEl) {
    let growth = pop * 0.005 * (gdp / (pop * 0.02 || 1));
    growth += (investmentRate + socialCostsRate) * 0.0005;
    growth *= Math.max(0, 1.0 - pop / 1000000);
    const g = Math.max(1, Math.round(growth));
    popGrowthEl.textContent = `+${g}/tick`;
  }

  updateDerivedEconomyUI(Math.round(gdp), value, inflation, balance);
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

  const fortifyLabel = document.getElementById("cc-fortify-border-label");
  if (fortifyLabel) {
    fortifyLabel.textContent = `Reinforce ${sideNames[side]} Frontier`;
  }

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

export function triggerRecruitTroops() {
  const btn = document.getElementById("cc-lever-recruit");
  if (btn) {
    btn.style.transform = "scale(0.96)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 180);
  }
  performActionDirect("military", "Recruit Troops");
}

export function triggerFortifyBorder() {
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


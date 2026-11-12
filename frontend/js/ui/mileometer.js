// mileometer.js - Vintage Mechanical Rotational Drum Odometer for Kingdom Conquest
import { getCurrentScaleSeconds } from "./clock.js";

const DIGIT_HEIGHT = 24; // px height of one tumbler cell
let mileometerTimer = null;

// Population Drum State
let anchorPopulation = 0;
let anchorTimestamp = Date.now();
let annualNetRate = 0;
let currentDisplayedPop = 0;
let activePopContainerEl = null;

// Gold Reserves Drum State
let anchorGold = 0;
let anchorGoldTimestamp = Date.now();
let annualGoldRate = 0;
let currentDisplayedGold = 0;
let activeGoldContainerEl = null;

// Track last rendered value per container element to prevent redundant re-renders
const containerValues = new WeakMap();

/**
 * Creates or updates mechanical rotational drum reels inside target container.
 * Renders individual cylindrical drums with 0-9 strips that rotate via translateY.
 */
export function renderMileometer(containerEl, value, animate = true) {
  if (!containerEl) return;
  const num = Math.max(0, Math.round(Number(value) || 0));
  containerValues.set(containerEl, num);

  const formattedStr = num.toLocaleString("en-US");
  const chars = formattedStr.split("");

  // Check if we need to rebuild the drum housing (length or comma structure changed)
  const existingReels = containerEl.querySelectorAll(".mileometer-reel, .mileometer-sep");
  let needsRebuild = existingReels.length !== chars.length;

  if (!needsRebuild) {
    chars.forEach((ch, idx) => {
      const node = existingReels[idx];
      if (ch === "," && !node.classList.contains("mileometer-sep")) needsRebuild = true;
      if (ch !== "," && !node.classList.contains("mileometer-reel")) needsRebuild = true;
    });
  }

  if (needsRebuild) {
    containerEl.innerHTML = "";
    containerEl.classList.add("mileometer-housing");

    chars.forEach((ch) => {
      if (ch === ",") {
        const sep = document.createElement("span");
        sep.className = "mileometer-sep";
        sep.textContent = ",";
        containerEl.appendChild(sep);
      } else {
        const reel = document.createElement("div");
        reel.className = "mileometer-reel";
        reel.dataset.val = ch;

        const strip = document.createElement("div");
        strip.className = "mileometer-strip";
        for (let d = 0; d <= 10; d++) {
          const cell = document.createElement("div");
          cell.className = "mileometer-cell";
          cell.textContent = d === 10 ? "0" : d.toString();
          strip.appendChild(cell);
        }
        reel.appendChild(strip);
        containerEl.appendChild(reel);

        const digit = parseInt(ch, 10) || 0;
        strip.style.transform = `translateY(-${digit * DIGIT_HEIGHT}px)`;
      }
    });
    return;
  }

  // Update existing drums with smooth mechanical tumble
  chars.forEach((ch, idx) => {
    const node = existingReels[idx];
    if (ch === ",") return;

    const strip = node.querySelector(".mileometer-strip");
    if (!strip) return;

    const oldDigit = parseInt(node.dataset.val, 10) || 0;
    const newDigit = parseInt(ch, 10) || 0;

    if (oldDigit !== newDigit) {
      node.dataset.val = ch;
      if (!animate) {
        strip.style.transition = "none";
        strip.style.transform = `translateY(-${newDigit * DIGIT_HEIGHT}px)`;
      } else {
        strip.style.transition = "transform 0.45s cubic-bezier(0.25, 1, 0.5, 1.05)";
        strip.style.transform = `translateY(-${newDigit * DIGIT_HEIGHT}px)`;
      }
    }
  });
}

// Track last synced server numbers so background polls don't reset anchor timestamps
let lastSyncedServerPop = null;
let lastSyncedServerGold = null;

/**
 * Sets the authoritative server baseline population anchor.
 * If force is false and serverPop has not changed, the current smooth
 * sub-annual interpolation timestamp is preserved to prevent drum stutter.
 */
export function syncPopulationMileometerAnchor(serverPop, force = false) {
  const numericPop = Math.max(0, Math.round(Number(serverPop) || 0));
  const now = Date.now();

  if (!activePopContainerEl) {
    activePopContainerEl = document.getElementById("cc-meter-pop-val");
  }

  // Initial setup or explicit forced reset (e.g. modal open, realm switch)
  if (force || lastSyncedServerPop === null || anchorTimestamp === 0) {
    anchorPopulation = numericPop;
    anchorTimestamp = now;
    lastSyncedServerPop = numericPop;
    currentDisplayedPop = numericPop;
    if (activePopContainerEl) {
      renderMileometer(activePopContainerEl, numericPop, true);
    }
    return;
  }

  // If server population has not changed, keep the smooth real-time interpolation running
  if (numericPop === lastSyncedServerPop) {
    return;
  }

  // Server population has updated (e.g. annual rollover or discrete migration wave)
  lastSyncedServerPop = numericPop;
  anchorPopulation = numericPop;
  anchorTimestamp = now;
  currentDisplayedPop = numericPop;
  if (activePopContainerEl) {
    renderMileometer(activePopContainerEl, numericPop, true);
  }
}

/**
 * Updates the projected annual net growth rate (natural growth + net migration).
 * Crystallizes accumulated population under the previous rate up to this exact
 * millisecond so changing dials never causes population to jump or reset.
 */
export function setPopulationMileometerRate(newRate) {
  const nextRate = Number(newRate) || 0;
  if (nextRate === annualNetRate) return;

  const now = Date.now();
  const scaleSec = getCurrentScaleSeconds();

  if (anchorTimestamp > 0 && scaleSec > 0 && annualNetRate !== 0) {
    const elapsedSec = Math.max(0, (now - anchorTimestamp) / 1000);
    const deltaYears = elapsedSec / scaleSec;
    anchorPopulation = Math.max(0, Math.round(anchorPopulation + annualNetRate * deltaYears));
    currentDisplayedPop = anchorPopulation;
  } else if (currentDisplayedPop > 0) {
    anchorPopulation = currentDisplayedPop;
  }

  anchorTimestamp = now;
  annualNetRate = nextRate;
}

/**
 * Sets the authoritative server baseline gold reserves anchor.
 * If force is false and serverGold has not changed, the current smooth
 * sub-annual interpolation timestamp is preserved to prevent drum stutter.
 */
export function syncGoldMileometerAnchor(serverGold, force = false) {
  const numericGold = Math.max(0, Math.round(Number(serverGold) || 0));
  const now = Date.now();

  if (!activeGoldContainerEl) {
    activeGoldContainerEl = document.getElementById("cc-meter-res-val");
  }

  // Initial setup or explicit forced reset (e.g. modal open, realm switch, discrete action)
  if (force || lastSyncedServerGold === null || anchorGoldTimestamp === 0) {
    anchorGold = numericGold;
    anchorGoldTimestamp = now;
    lastSyncedServerGold = numericGold;
    currentDisplayedGold = numericGold;
    if (activeGoldContainerEl) {
      renderMileometer(activeGoldContainerEl, numericGold, true);
    }
    return;
  }

  // If server gold has not changed, keep the smooth real-time interpolation running
  if (numericGold === lastSyncedServerGold) {
    return;
  }

  // Server gold has updated (e.g. annual rollover, tax collection, or military expense)
  lastSyncedServerGold = numericGold;
  anchorGold = numericGold;
  anchorGoldTimestamp = now;
  currentDisplayedGold = numericGold;
  if (activeGoldContainerEl) {
    renderMileometer(activeGoldContainerEl, numericGold, true);
  }
}

/**
 * Updates the projected annual net gold balance rate (surplus or deficit).
 * Crystallizes accumulated treasury gold under the previous rate up to this exact
 * millisecond so changing the Royal Tithe & Tariff dial never causes accumulated
 * gold reserves to jump or reset, acting strictly as a flow rate per annum.
 */
export function setGoldMileometerRate(newRate) {
  const nextRate = Number(newRate) || 0;
  if (nextRate === annualGoldRate) return;

  const now = Date.now();
  const scaleSec = getCurrentScaleSeconds();

  if (anchorGoldTimestamp > 0 && scaleSec > 0 && annualGoldRate !== 0) {
    const elapsedSec = Math.max(0, (now - anchorGoldTimestamp) / 1000);
    const deltaYears = elapsedSec / scaleSec;
    anchorGold = Math.max(0, Math.round(anchorGold + annualGoldRate * deltaYears));
    currentDisplayedGold = anchorGold;
  } else if (currentDisplayedGold > 0) {
    anchorGold = currentDisplayedGold;
  }

  anchorGoldTimestamp = now;
  annualGoldRate = nextRate;
}

/**
 * Starts continuous unified sub-annual interpolation ticker for both Population and Gold Reserves.
 */
function ensureUnifiedMileometerTicker() {
  if (mileometerTimer) return;

  mileometerTimer = setInterval(() => {
    const modal = document.getElementById("kingdom-command-center");
    if (!modal || modal.classList.contains("hidden")) {
      return;
    }

    const scaleSec = getCurrentScaleSeconds();
    if (scaleSec <= 0) return;

    // 1. Ticker for Population (if active & rate != 0)
    if (!activePopContainerEl) {
      activePopContainerEl = document.getElementById("cc-meter-pop-val");
    }
    if (activePopContainerEl && annualNetRate !== 0 && anchorTimestamp > 0) {
      const elapsedPopSec = Math.max(0, (Date.now() - anchorTimestamp) / 1000);
      const deltaPopYears = elapsedPopSec / scaleSec;
      const projectedPop = Math.max(0, Math.round(anchorPopulation + annualNetRate * deltaPopYears));
      if (projectedPop !== currentDisplayedPop) {
        currentDisplayedPop = projectedPop;
        renderMileometer(activePopContainerEl, projectedPop, true);
      }
    }

    // 2. Ticker for Gold Reserves (if active & rate != 0)
    if (!activeGoldContainerEl) {
      activeGoldContainerEl = document.getElementById("cc-meter-res-val");
    }
    if (activeGoldContainerEl && annualGoldRate !== 0 && anchorGoldTimestamp > 0) {
      const elapsedGoldSec = Math.max(0, (Date.now() - anchorGoldTimestamp) / 1000);
      const deltaGoldYears = elapsedGoldSec / scaleSec;
      // Reserves drain down to 0 minimum in Era 1
      const projectedGold = Math.max(0, Math.round(anchorGold + annualGoldRate * deltaGoldYears));
      if (projectedGold !== currentDisplayedGold) {
        currentDisplayedGold = projectedGold;
        renderMileometer(activeGoldContainerEl, projectedGold, true);
      }
    }
  }, 1000);
}

/**
 * Starts the continuous 1-second mileometer sub-annual interpolation ticker for population.
 */
export function startPopulationMileometerTicker(containerEl) {
  if (containerEl) {
    activePopContainerEl = containerEl;
  }
  ensureUnifiedMileometerTicker();
}

/**
 * Starts the continuous 1-second mileometer sub-annual interpolation ticker for gold reserves.
 */
export function startGoldMileometerTicker(containerEl) {
  if (containerEl) {
    activeGoldContainerEl = containerEl;
  }
  ensureUnifiedMileometerTicker();
}

/**
 * Stops the continuous mileometer tickers.
 */
export function stopPopulationMileometerTicker() {
  activePopContainerEl = null;
  lastSyncedServerPop = null;
  anchorTimestamp = 0;
  if (!activeGoldContainerEl && mileometerTimer) {
    clearInterval(mileometerTimer);
    mileometerTimer = null;
  }
}

export function stopGoldMileometerTicker() {
  activeGoldContainerEl = null;
  lastSyncedServerGold = null;
  anchorGoldTimestamp = 0;
  if (!activePopContainerEl && mileometerTimer) {
    clearInterval(mileometerTimer);
    mileometerTimer = null;
  }
}

export function stopAllMileometerTickers() {
  activePopContainerEl = null;
  activeGoldContainerEl = null;
  lastSyncedServerPop = null;
  lastSyncedServerGold = null;
  anchorTimestamp = 0;
  anchorGoldTimestamp = 0;
  if (mileometerTimer) {
    clearInterval(mileometerTimer);
    mileometerTimer = null;
  }
}

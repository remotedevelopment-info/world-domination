// mileometer.js - Vintage Mechanical Rotational Drum Odometer for Kingdom Conquest
import { getCurrentScaleSeconds } from "./clock.js";

const DIGIT_HEIGHT = 24; // px height of one tumbler cell
let mileometerTimer = null;
let anchorPopulation = 0;
let anchorTimestamp = Date.now();
let annualNetRate = 0;
let currentDisplayedPop = 0;
let activeContainerEl = null;

/**
 * Creates or updates the mechanical rotational drums inside target container.
 * Renders individual cylindrical drums with 0-9 strips that rotate via translateY.
 */
export function renderMileometer(containerEl, value, animate = true) {
  if (!containerEl) return;
  activeContainerEl = containerEl;
  const num = Math.max(0, Math.round(value));
  currentDisplayedPop = num;

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
        // Numerals 0..9 plus wrap-around 0
        for (let d = 0; d <= 10; d++) {
          const cell = document.createElement("div");
          cell.className = "mileometer-cell";
          cell.textContent = d === 10 ? "0" : d.toString();
          strip.appendChild(cell);
        }
        reel.appendChild(strip);
        containerEl.appendChild(reel);

        // Position initial digit without animation
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
        // Fast rotational transition for snappy mechanical feedback
        strip.style.transition = "transform 0.45s cubic-bezier(0.25, 1, 0.5, 1.05)";
        strip.style.transform = `translateY(-${newDigit * DIGIT_HEIGHT}px)`;
      }
    }
  });
}

/**
 * Sets the authoritative server baseline population anchor.
 * Called whenever authoritative state arrives via WebSocket or API.
 */
export function syncPopulationMileometerAnchor(serverPop) {
  anchorPopulation = Math.max(0, Math.round(serverPop));
  anchorTimestamp = Date.now();
  currentDisplayedPop = anchorPopulation;
  if (activeContainerEl) {
    renderMileometer(activeContainerEl, anchorPopulation, true);
  }
}

/**
 * Updates the projected annual net growth rate (natural growth + net migration).
 */
export function setPopulationMileometerRate(rate) {
  annualNetRate = rate;
}

/**
 * Starts the continuous 1-second mileometer sub-annual interpolation ticker.
 * Slowly or quickly rolls the rotational drums between annual server updates,
 * adjusting accurately to scale and aligning cleanly on annual rollovers.
 */
export function startPopulationMileometerTicker(containerEl) {
  if (containerEl) {
    activeContainerEl = containerEl;
  }
  if (mileometerTimer) return;

  mileometerTimer = setInterval(() => {
    if (!activeContainerEl) return;
    const modal = document.getElementById("kingdom-command-center");
    if (!modal || modal.classList.contains("hidden")) {
      return; // Pause animation when command center is closed
    }

    if (annualNetRate === 0) return;

    const elapsedSec = Math.max(0, (Date.now() - anchorTimestamp) / 1000);
    const scaleSec = getCurrentScaleSeconds();
    if (scaleSec <= 0) return;

    // Fractional years elapsed since anchor was committed
    const deltaYears = elapsedSec / scaleSec;
    const projectedPop = Math.max(0, Math.round(anchorPopulation + annualNetRate * deltaYears));

    if (projectedPop !== currentDisplayedPop) {
      renderMileometer(activeContainerEl, projectedPop, true);
    }
  }, 1000); // Ticks every 1 second
}

/**
 * Stops the continuous mileometer ticker.
 */
export function stopPopulationMileometerTicker() {
  if (mileometerTimer) {
    clearInterval(mileometerTimer);
    mileometerTimer = null;
  }
}

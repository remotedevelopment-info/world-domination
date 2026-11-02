// actions.js - Modal actions (Diplomacy, Economy, Military) & result application

import { state } from "../state.js";
import { apiSendAction, readErrorMessage } from "../api.js";
import { showToast, logMessage } from "./toast.js";
import { renderMap } from "../map/renderer.js";

export const ACTION_SETS = {
  diplomacy: {
    title: "Diplomacy Actions",
    options: ["Send Envoy", "Propose Alliance", "Declare War", "Request Trade"],
  },
  economy: {
    title: "Economic Actions",
    options: [
      "Collect Taxes",
      "Build Market",
      "Trade Resources",
      "Invest in Infrastructure",
    ],
  },
  military: {
    title: "Military Actions",
    options: ["Recruit Troops", "Move Army", "Fortify Borders", "Scout Enemy"],
  },
};

export const ACTION_META = {
  "Send Envoy": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
  "Propose Alliance": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
  "Declare War": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
  "Request Trade": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
  "Collect Taxes": { targetRequired: false, interiorSupported: false, requiresMovementChoice: false },
  "Build Market": { targetRequired: false, interiorSupported: false, requiresMovementChoice: false },
  "Trade Resources": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
  "Invest in Infrastructure": { targetRequired: false, interiorSupported: false, requiresMovementChoice: false },
  "Recruit Troops": { targetRequired: false, interiorSupported: false, requiresMovementChoice: false },
  "Move Army": { targetRequired: false, interiorSupported: true, requiresMovementChoice: true },
  "Fortify Borders": { targetRequired: false, interiorSupported: true, requiresMovementChoice: false },
  "Scout Enemy": { targetRequired: true, interiorSupported: false, requiresMovementChoice: false },
};

let callbacks = {
  openKingdomCommandCenter: null,
  closeKingdomCommandCenter: null,
  refreshKingdomCommandCenter: null,
  renderKingdomList: null,
  refreshMyKingdomStats: null,
  checkMyKingdom: null,
};

export function registerActionCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

export function showAction(type) {
  if (callbacks.closeKingdomCommandCenter) {
    callbacks.closeKingdomCommandCenter();
  }

  if (!state.myKingdom) {
    showToast("Claim a kingdom first", "error");
    return;
  }

  const modal = document.getElementById("action-modal");
  const title = document.getElementById("action-title");
  const options = document.getElementById("action-options");
  const feedback = document.getElementById("action-feedback");
  const action = ACTION_SETS[type];
  if (!action) return;

  if (title) title.textContent = action.title;
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.add("hidden");
  }

  const targetSelect = document.getElementById("action-target-country");
  if (targetSelect) {
    targetSelect.innerHTML = '<option value="">-- Select a country --</option>';
    state.kingdoms.forEach((k) => {
      if (state.myKingdom && k.id === state.myKingdom.country_id) return;
      const opt = document.createElement("option");
      opt.value = k.id;
      opt.textContent = k.name;
      targetSelect.appendChild(opt);
    });
  }

  if (options) {
    options.innerHTML = action.options
      .map(
        (opt) =>
          `<button class="action-option" style="display:block;width:100%;text-align:left;margin:4px 0" ` +
          `onclick='onActionOption("${type}", ${JSON.stringify(opt)})'>${opt}</button>`
      )
      .join("");
  }

  onActionOption(type, action.options[0]);

  if (modal) modal.classList.remove("hidden");

  const bayMap = {
    economy: "fiscal",
    military: "military",
    diplomacy: "diplomacy",
  };
  const kingdom = state.kingdoms.find((k) => k.id === state.myKingdom.country_id) || state.myKingdom;
  if (callbacks.openKingdomCommandCenter) {
    callbacks.openKingdomCommandCenter(kingdom, bayMap[type] || "all");
  }
}

export function onActionOption(type, label) {
  const meta = ACTION_META[label] || {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  };

  const targetField = document.getElementById("action-field-target");
  const movementField = document.getElementById("action-field-movement");
  const directionField = document.getElementById("action-field-direction");
  const speedField = document.getElementById("action-field-speed");
  const feedback = document.getElementById("action-feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.add("hidden");
  }

  if (targetField) {
    targetField.classList.toggle("hidden", !meta.targetRequired);
  }

  if (movementField) {
    movementField.classList.toggle("hidden", !meta.requiresMovementChoice);
  }

  if (directionField) {
    if (meta.interiorSupported && !meta.requiresMovementChoice) {
      directionField.classList.remove("hidden");
    } else if (meta.requiresMovementChoice) {
      const interiorRadio = document.querySelector('input[name="action-movement-type"][value="interior"]');
      directionField.classList.toggle("hidden", !(interiorRadio && interiorRadio.checked));
    } else {
      directionField.classList.add("hidden");
    }
  }

  if (speedField) {
    if (meta.interiorSupported && !meta.requiresMovementChoice) {
      speedField.classList.remove("hidden");
    } else if (meta.requiresMovementChoice) {
      const interiorRadio = document.querySelector('input[name="action-movement-type"][value="interior"]');
      speedField.classList.toggle("hidden", !(interiorRadio && interiorRadio.checked));
    } else {
      speedField.classList.add("hidden");
    }
  }

  const radios = document.querySelectorAll('input[name="action-movement-type"]');
  radios.forEach((radio) => {
    radio.onchange = () => {
      if (directionField) directionField.classList.toggle("hidden", radio.value !== "interior");
      if (speedField) speedField.classList.toggle("hidden", radio.value !== "interior");
    };
  });
}

export async function performAction(type, description) {
  if (!state.myKingdom) {
    showToast("You must own a kingdom to perform actions", "error");
    closeModal();
    return;
  }

  const options = document.getElementById("action-options");
  const feedback = document.getElementById("action-feedback");
  if (state.actionBusy) return;
  state.actionBusy = true;

  const buttons = options ? options.querySelectorAll("button") : [];
  buttons.forEach((b) => {
    b.disabled = true;
  });

  try {
    const payload = { action_type: type, description };
    const meta = ACTION_META[description] || {};

    if (meta.targetRequired) {
      const targetSelect = document.getElementById("action-target-country");
      const targetId = targetSelect ? parseInt(targetSelect.value, 10) : NaN;
      if (!targetId || Number.isNaN(targetId)) {
        throw new Error("Target country is required for this action.");
      }
      if (state.myKingdom && targetId === state.myKingdom.country_id) {
        throw new Error("Cannot target your own country.");
      }
      payload.target_country_id = targetId;
    }

    if (meta.requiresMovementChoice) {
      const movementType = document.querySelector('input[name="action-movement-type"]:checked');
      if (movementType) {
        payload.movement_type = movementType.value;
      }
      if (movementType && movementType.value === "interior") {
        const directionSelect = document.getElementById("action-direction");
        const speedSelect = document.getElementById("action-speed");
        if (!directionSelect || !directionSelect.value) {
          throw new Error("Direction is required for interior movement.");
        }
        if (!speedSelect || !speedSelect.value) {
          throw new Error("Speed is required for interior movement.");
        }
        payload.direction = directionSelect.value;
        payload.speed = speedSelect.value;
      }
    } else if (meta.interiorSupported) {
      const directionSelect = document.getElementById("action-direction");
      const speedSelect = document.getElementById("action-speed");
      if (!directionSelect || !directionSelect.value) {
        throw new Error("Border side (direction) is required for this action.");
      }
      payload.direction = directionSelect.value;
      if (speedSelect && speedSelect.value) {
        payload.speed = speedSelect.value;
      }
    }

    const res = await apiSendAction(payload);
    if (!res.ok) throw new Error(await readErrorMessage(res, "Action failed"));
    const data = await res.json();
    logMessage(`Action sent: ${description}`);
    applyActionResult(data);
    closeModal();
    showToast(`Action complete: ${description}`, "success");
  } catch (err) {
    const msg = err.message || "Action failed";
    logMessage(`Action failed: ${msg}`);
    if (msg.includes("no country assigned") && callbacks.checkMyKingdom) {
      callbacks.checkMyKingdom();
    }
    if (feedback) {
      feedback.textContent = msg;
      feedback.classList.remove("hidden");
    }
  } finally {
    state.actionBusy = false;
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

export function applyActionResult(data) {
  if (!data) return;
  if (typeof data.tick === "number" && data.tick > 0) {
    state.currentTick = data.tick;
    const tickEl = document.getElementById("tick-display");
    const match = tickEl ? tickEl.textContent.match(/\d+ ruler/) : null;
    const rulerCount = match ? match[0].replace(/\D/g, "") : 0;
    if (tickEl) {
      tickEl.textContent = `Turn ${data.tick} · ${rulerCount} ruler${rulerCount === 1 ? "" : "s"}`;
    }
  }

  if (!data.country_id) return;
  const kingdom = state.kingdoms.find((k) => k.id === data.country_id);
  if (kingdom) {
    if (typeof data.population === "number") kingdom.population = data.population;
    if (typeof data.resources === "number") kingdom.resources = data.resources;
    if (typeof data.country_name === "string") kingdom.name = data.country_name;
  } else {
    state.kingdoms.push({
      id: data.country_id,
      name: data.country_name || "Kingdom",
      population: typeof data.population === "number" ? data.population : 0,
      resources: typeof data.resources === "number" ? data.resources : 0,
    });
  }

  if (state.myKingdom && state.myKingdom.country_id === data.country_id) {
    if (typeof data.population === "number") state.myKingdom.population = data.population;
    if (typeof data.resources === "number") state.myKingdom.resources = data.resources;
    if (callbacks.refreshKingdomCommandCenter) callbacks.refreshKingdomCommandCenter();
  }

  if (data.troops) {
    state.troops[data.country_id] = data.troops;
  }

  renderMap();
  if (callbacks.renderKingdomList) callbacks.renderKingdomList();
  if (callbacks.refreshMyKingdomStats) callbacks.refreshMyKingdomStats();

  const info = document.getElementById("kingdom-info");
  if (info && !info.classList.contains("hidden") && state.shownKingdomId === data.country_id) {
    const popEl = document.getElementById("kingdom-population");
    const resEl = document.getElementById("kingdom-resources");
    if (popEl) popEl.textContent = (typeof data.population === "number" ? data.population : 0).toLocaleString();
    if (resEl) resEl.textContent = (typeof data.resources === "number" ? data.resources : 0).toLocaleString();
  }
}

export function closeModal() {
  const am = document.getElementById("action-modal");
  if (am) am.classList.add("hidden");
  if (callbacks.closeKingdomCommandCenter) {
    callbacks.closeKingdomCommandCenter();
  }
}


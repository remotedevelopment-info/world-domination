// api.js - REST client for Kingdom Conquest backend

import { API_URL } from "./config.js";
import { state } from "./state.js";

export async function readErrorMessage(res, fallback) {
  let body = "";
  try {
    body = (await res.text()).trim();
  } catch (_) {
    // Body unreadable; fall through to fallback
  }
  if (body) {
    try {
      const data = JSON.parse(body);
      if (data && (data.error || data.message)) {
        return data.error || data.message;
      }
    } catch (_) {
      return body;
    }
  }
  return fallback;
}

let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export async function apiFetch(endpoint, options = {}) {
  const headers = { ...options.headers };
  if (state.token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Automatically recognize expired or invalid sessions on protected routes
  if (res.status === 401 && endpoint !== "/login" && endpoint !== "/register") {
    if (typeof unauthorizedHandler === "function") {
      unauthorizedHandler(endpoint, res);
    }
  }

  return res;
}

export async function apiRegister(username, email, password) {
  return apiFetch("/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function apiLogin(username, password) {
  return apiFetch("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function apiLogout() {
  return apiFetch("/logout", {
    method: "POST",
  }).catch(() => {});
}

export async function apiGetCountries(era = "medieval") {
  return apiFetch(`/countries?era=${encodeURIComponent(era)}`);
}

export async function apiGetTroops() {
  return apiFetch("/troops");
}

export async function apiGetMyCountry() {
  return apiFetch("/my-country");
}

export async function apiAssignCountry(countryId) {
  return apiFetch(`/assign-country?country_id=${encodeURIComponent(countryId)}`, {
    method: "POST",
  });
}

export async function apiGetKingdomDetail() {
  return apiFetch("/kingdom-detail");
}

export async function apiGetDiplomacy() {
  return apiFetch("/diplomacy");
}

export async function apiSendHeartbeat() {
  return apiFetch("/heartbeat", {
    method: "POST",
  }).catch(() => {});
}

export async function apiSendAction(payload) {
  return apiFetch("/action", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiSetEconomyRate(economyRate) {
  return apiFetch("/set-economy-rate", {
    method: "POST",
    body: JSON.stringify({ economy_rate: economyRate }),
  });
}

export async function apiSetEconomySettings(economyRate, investment, socialCosts) {
  return apiFetch("/set-economy-settings", {
    method: "POST",
    body: JSON.stringify({
      economy_rate: economyRate,
      investment: investment,
      social_costs: socialCosts,
    }),
  });
}

export async function apiGetTimeline() {
  return apiFetch("/timeline");
}

export async function apiJumpTimeline(year) {
  return apiFetch("/timeline/jump", {
    method: "POST",
    body: JSON.stringify({ year: parseFloat(year) }),
  });
}

export async function apiSetChronoScale(scale) {
  return apiFetch("/timeline/scale", {
    method: "POST",
    body: JSON.stringify({ scale }),
  });
}

export async function apiSetTimelinePause(paused) {
  return apiFetch("/timeline/pause", {
    method: "POST",
    body: JSON.stringify({ paused: Boolean(paused) }),
  });
}

// state.js - Centralized application state store

export const state = {
  token: null,
  currentUser: null,
  kingdoms: [],
  myKingdom: null,
  kingdomBorders: {},
  troops: {},
  currentTick: 0,
  shownKingdomId: null,
  selectedKingdomId: null,
  lastStateAt: Date.now(),
  lastEconomy: null,
  loggedOut: false,
  authBusy: false,
  actionBusy: false,
};

// Initialize session from localStorage if available
if (typeof localStorage !== "undefined") {
  state.token = localStorage.getItem("token") || null;
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    try {
      state.currentUser = JSON.parse(storedUser);
    } catch (_) {
      state.currentUser = null;
    }
  }
}

export function setToken(token) {
  state.token = token;
  if (typeof localStorage !== "undefined") {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }
}

export function setCurrentUser(user) {
  state.currentUser = user;
  if (typeof localStorage !== "undefined") {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
  }
}

export function clearSession() {
  state.token = null;
  state.currentUser = null;
  state.myKingdom = null;
  state.loggedOut = true;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
}

export function setMyKingdom(kingdom) {
  state.myKingdom = kingdom;
}

export function setKingdoms(kingdoms) {
  state.kingdoms = kingdoms;
}

export function setTroops(troops) {
  state.troops = troops;
}


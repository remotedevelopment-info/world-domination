// socket.js - Real-time WebSocket connection, heartbeat, and state synchronization

import { WS_URL, HEARTBEAT_INTERVAL_MS } from "./config.js";
import { state, syncKingdomsForYear } from "./state.js";
import { apiSendHeartbeat } from "./api.js";
import { logMessage } from "./ui/toast.js";
import { syncTimelineFromServer } from "./ui/clock.js";

let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let lastLoggedActionKey = null;
let stateChangeCallback = null;

export function onSocketStateChange(callback) {
  stateChangeCallback = callback;
}

export function connectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  state.loggedOut = false;
  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error("Failed to construct WebSocket:", err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    const statusEl = document.getElementById("connection-status");
    if (statusEl) statusEl.classList.remove("disconnected");
    logMessage("Connected to game server");

    sendHeartbeat();
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
  };

  ws.onclose = () => {
    const statusEl = document.getElementById("connection-status");
    if (statusEl) statusEl.classList.add("disconnected");

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (state.loggedOut) return; // Do not reconnect after explicit logout
    logMessage("Disconnected from server");
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // Ignore malformed frames
    }

    const payload = msg && msg.type === "init" ? msg.state : msg;
    if (!payload || !Array.isArray(payload.countries)) return;

    if (typeof payload.sim_year === "number") {
      syncTimelineFromServer(payload);
    }

    state.lastStateAt = Date.now();
    state.currentTick = payload.tick || 0;
    syncKingdomsForYear(payload.countries, state.currentSimYear);

    const rulers = Array.isArray(payload.players) ? payload.players.length : 0;
    const tickDisplay = document.getElementById("tick-display");
    if (tickDisplay) {
      tickDisplay.textContent = `Turn ${state.currentTick} · ${rulers} ruler${rulers === 1 ? "" : "s"}`;
    }

    if (Array.isArray(payload.actions) && payload.actions.length) {
      const latest = payload.actions[0];
      const actionKey = JSON.stringify(latest);
      if (actionKey !== lastLoggedActionKey) {
        lastLoggedActionKey = actionKey;
        logMessage(`${latest.action_type}: ${latest.description}`);
      }
    }

    if (typeof stateChangeCallback === "function") {
      stateChangeCallback(payload);
    }
  };
}

function scheduleReconnect() {
  if (state.loggedOut) return;
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWebSocket();
    }, 5000);
  }
}

export function disconnectWebSocket() {
  state.loggedOut = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

export function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN && state.token) {
    apiSendHeartbeat();
  }
}


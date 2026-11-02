// clock.js - Header clock & turn urgency countdown

import { TICK_INTERVAL_S } from "../config.js";
import { state } from "../state.js";

let clockTimer = null;

export function startClock() {
  if (clockTimer) return;
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

export function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

export function tickClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const h = document.getElementById("clock-hours");
  const m = document.getElementById("clock-mins");
  const s = document.getElementById("clock-seconds");
  if (h) h.textContent = pad(now.getHours());
  if (m) m.textContent = pad(now.getMinutes());
  if (s) s.textContent = pad(now.getSeconds());

  const sweep = document.getElementById("clock-sweep");
  if (sweep) sweep.style.transform = `rotate(${now.getSeconds() * 6}deg)`;

  const urg = document.getElementById("urgency-tick");
  if (urg) {
    const elapsed = Math.floor((Date.now() - state.lastStateAt) / 1000);
    const remain = Math.max(0, TICK_INTERVAL_S - (elapsed % TICK_INTERVAL_S));
    urg.textContent = `Next state update in ${remain}s`;
    urg.classList.toggle("urgent", remain <= 10);
  }
}


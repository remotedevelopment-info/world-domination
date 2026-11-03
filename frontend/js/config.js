// config.js - Global configuration & protocol-relative endpoint URLs

const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
const host = typeof window !== "undefined" ? window.location.host : "localhost:8080";
const protocol = isHttps ? "https:" : "http:";
const wsProtocol = isHttps ? "wss:" : "ws:";

export const API_URL = `${protocol}//${host}/api`;
export const WS_URL = `${wsProtocol}//${host}/ws`;
export const TICK_INTERVAL_S = 15; // Server broadcasts state every ~15s tick
export const HEARTBEAT_INTERVAL_MS = 30000;


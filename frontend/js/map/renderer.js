// renderer.js - Canvas rendering engine for the world map and territory units

import { state } from "../state.js";
import { kingdomPolygons } from "./polygons.js";
import { getCentroid, pointInPolygon } from "./geometry.js";

let canvas = null;
let ctx = null;
let canvasWidth = 0;
let canvasHeight = 0;

export function initRenderer(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext("2d");
  resizeCanvas();
}

export function resizeCanvas() {
  if (!canvas) return;
  const container = document.querySelector(".map-container");
  if (!container) return;
  canvasWidth = container.clientWidth;
  canvasHeight = container.clientHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  renderMap();
}

export function project(x, y) {
  return [x * canvasWidth, y * canvasHeight];
}

export function renderMap() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw ocean background
  ctx.fillStyle = "#1a4d6e";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw each kingdom
  state.kingdoms.forEach((kingdom) => {
    const poly = kingdomPolygons[kingdom.code];
    if (!poly) return;

    ctx.beginPath();
    const [startX, startY] = project(poly[0][0], poly[0][1]);
    ctx.moveTo(startX, startY);

    for (let i = 1; i < poly.length; i++) {
      const [x, y] = project(poly[i][0], poly[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill with kingdom color
    ctx.fillStyle = kingdom.color || "#4ecdc4";
    ctx.fill();

    // Calculate polygon side count
    const sideCount = poly.length;

    // Calculate border style weight based on side count and ownership
    const isIsland = Boolean(kingdom.isIsland || kingdom.is_island);
    let borderWeight = 1;
    if (isIsland) {
      borderWeight = 4; // Island countries get thicker gold borders
    } else if (sideCount > 50) {
      borderWeight = 3;
    } else if (sideCount > 25) {
      borderWeight = 2;
    } else {
      borderWeight = 1;
    }

    // Border color based on ownership & island status
    let borderColor;
    if (isIsland) {
      borderColor = "#FFD700"; // Gold for islands
    } else if (kingdom.owner_id) {
      borderColor = "#fff"; // White for owned kingdoms
    } else {
      const alpha = Math.max(0.1, 0.3 - (sideCount - 25) / 100);
      borderColor = `rgba(255,255,255,${alpha})`;
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWeight;
    ctx.stroke();

    // Draw kingdom code label
    const [labelX, labelY] = getCentroid(poly);
    ctx.fillStyle = "#000";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const [pxX, pxY] = project(labelX, labelY);
    ctx.fillText(kingdom.code, pxX, pxY);

    // Draw troop dots: central troops at centroid, border troops along edges
    renderTroopDots(ctx, kingdom, poly);
  });
}

// renderTroopDots draws white dot markers for troop presence
export function renderTroopDots(ctx, kingdom, poly) {
  const t = state.troops[kingdom.id];
  if (!t) return;

  const central = t.central || 0;
  const borders = t.borders || { N: 0, S: 0, E: 0, W: 0 };

  // ---- Central troops: dots at centroid ----
  if (central > 0) {
    const [cxNorm, cyNorm] = getCentroid(poly);
    const [cx, cy] = project(cxNorm, cyNorm);
    const dotCount = Math.min(Math.max(Math.ceil(central / 10), 1), 20);
    const spread = Math.min(central / 50, 12);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      const dx = cx + Math.cos(angle) * r;
      const dy = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Border troops: dots along each border side ----
  const sides = ["N", "S", "E", "W"];
  sides.forEach((side) => {
    const count = borders[side] || 0;
    if (!count) return;

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

    const [x1, y1] = project(p1[0], p1[1]);
    const [x2, y2] = project(p2[0], p2[1]);

    const dotCount = Math.min(Math.max(Math.ceil(count / 5), 1), 15);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const t = (i + 0.5) / dotCount;
      const jitter = (Math.random() - 0.5) * 4;
      const dx = x1 + (x2 - x1) * t + jitter;
      const dy = y1 + (y2 - y1) * t + jitter;
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function getKingdomAtPosition(clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  for (const kingdom of state.kingdoms) {
    const poly = kingdomPolygons[kingdom.code];
    if (!poly) continue;
    if (pointInPolygon(x, y, poly)) {
      return kingdom;
    }
  }
  return null;
}


// renderer.js - Steampunk Cartographic Rendering Engine with Dynamic Era Scaling
// Shows full-screen projection of the known world in each Age, scaling smoothly as territories emerge

import { state } from "../state.js";
import {
  kingdomPolygons,
  getKingdomLabelPosition,
  POLYNESIAN_ISLES,
} from "./polygons.js";
import { getCentroid, pointInPolygon, getPolygonBounds } from "./geometry.js";

let canvas = null;
let ctx = null;
let canvasWidth = 0;
let canvasHeight = 0;

let currentViewport = null;
let targetViewport = null;
let viewportAnimFrame = null;

const boundsCache = new Map();

function getPolygonBoundsCached(code, poly) {
  let b = boundsCache.get(code);
  if (!b) {
    b = getPolygonBounds(poly);
    boundsCache.set(code, b);
  }
  return b;
}

export function computeTargetViewport(
  kingdoms = state.kingdoms,
  canvasW = canvasWidth,
  canvasH = canvasHeight
) {
  if (!kingdoms || kingdoms.length === 0 || canvasW <= 0 || canvasH <= 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1, w: 1, h: 1 };
  }

  // If Polynesia meta-theme is inactive (default), exclude remote isles from camera bounds
  const isPolynesiaActive = Boolean(state?.metaThemes?.polynesiaIsles);

  let minX = 1,
    maxX = 0,
    minY = 1,
    maxY = 0;
  for (let i = 0; i < kingdoms.length; i++) {
    const k = kingdoms[i];
    if (!isPolynesiaActive && POLYNESIAN_ISLES?.has(k.code)) {
      continue;
    }
    const poly = kingdomPolygons[k.code];
    if (!poly) continue;
    for (let j = 0; j < poly.length; j++) {
      const px = poly[j][0];
      const py = poly[j][1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  let rawW = maxX - minX;
  let rawH = maxY - minY;

  // For early discovery / revolt eras, expand margins so Europe feels desktop-scale
  const count = kingdoms.length;
  if (count <= 15) {
    rawW = Math.max(rawW, 0.28);
    rawH = Math.max(rawH, 0.24);
  } else if (count <= 30) {
    rawW = Math.max(rawW, 0.32);
    rawH = Math.max(rawH, 0.26);
  }

  // Tight margins: no huge empty ocean padding
  const padX = Math.max(0.018, rawW * 0.05);
  const padY = Math.max(0.018, rawH * 0.05);

  const bMinX = minX - padX;
  const bMaxX = maxX + padX;
  const bMinY = minY - padY;
  const bMaxY = maxY + padY;

  let bW = bMaxX - bMinX;
  let bH = bMaxY - bMinY;
  const cx = (bMinX + bMaxX) / 2;
  const cy = (bMinY + bMaxY) / 2;

  const canvasAspect = canvasW / Math.max(1, canvasH);

  // Focus directly on the active theater without rendering vast empty oceans.
  // On widescreen desktop (16:9, 16:10), tightly bound w so landmass fills ~80% of width
  let w = bW;
  let h = bH;

  if (w / h < canvasAspect) {
    const tightMaxW = Math.max(bW * 1.15, bW + 0.06);
    w = Math.min(h * canvasAspect * 0.72, tightMaxW);
    h = w / canvasAspect;
  } else {
    h = w / canvasAspect;
  }

  const vMinX = cx - w / 2;
  const vMaxX = cx + w / 2;
  const vMinY = cy - h / 2;
  const vMaxY = cy + h / 2;

  return { minX: vMinX, maxX: vMaxX, minY: vMinY, maxY: vMaxY, w, h };
}

export function syncViewport(immediate = false) {
  const newTarget = computeTargetViewport(state.kingdoms, canvasWidth, canvasHeight);
  targetViewport = newTarget;

  if (!currentViewport || immediate) {
    currentViewport = { ...targetViewport };
    if (viewportAnimFrame) {
      cancelAnimationFrame(viewportAnimFrame);
      viewportAnimFrame = null;
    }
    return;
  }

  if (!viewportAnimFrame) {
    viewportAnimFrame = requestAnimationFrame(animateViewportStep);
  }
}

function animateViewportStep() {
  if (!currentViewport || !targetViewport) {
    viewportAnimFrame = null;
    return;
  }

  const lerp = 0.12;
  const dxMin = targetViewport.minX - currentViewport.minX;
  const dxMax = targetViewport.maxX - currentViewport.maxX;
  const dyMin = targetViewport.minY - currentViewport.minY;
  const dyMax = targetViewport.maxY - currentViewport.maxY;

  const totalDiff =
    Math.abs(dxMin) + Math.abs(dxMax) + Math.abs(dyMin) + Math.abs(dyMax);

  if (totalDiff < 0.0006) {
    currentViewport = { ...targetViewport };
    viewportAnimFrame = null;
    renderMap();
    return;
  }

  currentViewport.minX += dxMin * lerp;
  currentViewport.maxX += dxMax * lerp;
  currentViewport.minY += dyMin * lerp;
  currentViewport.maxY += dyMax * lerp;

  renderMap();
  viewportAnimFrame = requestAnimationFrame(animateViewportStep);
}

export function getEraMinWidth(year = state.currentSimYear || 1500) {
  if (year >= 1989) return 2600; // Modern global view with 200 nations: ultra-wide theater
  if (year >= 1920) return 2200; // Decolonisation view
  if (year >= 1860) return 1750; // Independence view: Europe + Americas
  if (year >= 1750) return 1350; // Revolt view
  return 1100; // Discovery view
}

// Steampunk Brass Loupe Magnifier state
export let magnifierState = {
  active: false,
  x: 0,
  y: 0,
  radius: 125,
  zoom: 2.4,
};

export function setMagnifier(active, x, y) {
  magnifierState.active = active;
  if (typeof x === "number" && typeof y === "number") {
    magnifierState.x = x;
    magnifierState.y = y;
  }
  renderMap();
}

export function updateMagnifierPosition(x, y) {
  magnifierState.x = x;
  magnifierState.y = y;
  if (magnifierState.active) {
    renderMap();
  }
}

export function initRenderer(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext("2d");
  resizeCanvas();
}

export function resizeCanvas() {
  if (!canvas) return;
  const container = document.querySelector(".map-container");
  if (!container) return;

  canvasWidth = container.clientWidth || 1200;
  canvasHeight = container.clientHeight || 700;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = canvasWidth + "px";
  canvas.style.height = canvasHeight + "px";

  syncViewport(true);
  renderMap(true);
}

export function panCamera(deltaScreenX, deltaScreenY) {
  if (!currentViewport || canvasWidth <= 0 || canvasHeight <= 0) return;
  const vpW = currentViewport.maxX - currentViewport.minX;
  const vpH = currentViewport.maxY - currentViewport.minY;
  const dxWorld = (deltaScreenX / canvasWidth) * vpW;
  const dyWorld = (deltaScreenY / canvasHeight) * vpH;

  currentViewport.minX -= dxWorld;
  currentViewport.maxX -= dxWorld;
  currentViewport.minY -= dyWorld;
  currentViewport.maxY -= dyWorld;
  targetViewport = { ...currentViewport };

  renderMap();
}

export function zoomCamera(factor, screenX, screenY) {
  if (!currentViewport || canvasWidth <= 0 || canvasHeight <= 0) return;
  const vpW = currentViewport.maxX - currentViewport.minX;
  const vpH = currentViewport.maxY - currentViewport.minY;

  const pivotU = (screenX ?? canvasWidth / 2) / canvasWidth;
  const pivotV = (screenY ?? canvasHeight / 2) / canvasHeight;

  const newW = vpW * factor;
  const newH = vpH * factor;

  if (newW < 0.05 || newW > 2.0) return;

  const pivotX = currentViewport.minX + pivotU * vpW;
  const pivotY = currentViewport.minY + pivotV * vpH;

  currentViewport.minX = pivotX - pivotU * newW;
  currentViewport.maxX = currentViewport.minX + newW;
  currentViewport.minY = pivotY - pivotV * newH;
  currentViewport.maxY = currentViewport.minY + newH;
  targetViewport = { ...currentViewport };

  renderMap();
}

export function project(x, y) {
  const vp =
    currentViewport || targetViewport || { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const vpW = vp.maxX - vp.minX || 1;
  const vpH = vp.maxY - vp.minY || 1;
  const u = (x - vp.minX) / vpW;
  const v = (y - vp.minY) / vpH;
  return [u * canvasWidth, v * canvasHeight];
}

// -------------------------------------------------------------
// STEAMPUNK CARTOGRAPHIC ELEMENTS (Age of Discovery c. 1500)
// -------------------------------------------------------------

/**
 * Draws aged ocean background with vignette & subtle water currents
 */
function drawOcean(ctx, width, height) {
  const grad = ctx.createRadialGradient(
    width * 0.45,
    height * 0.45,
    width * 0.1,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.8
  );
  grad.addColorStop(0, "#19364a"); // Lighter nautical deep-blue/slate
  grad.addColorStop(0.5, "#132838");
  grad.addColorStop(1, "#0a1721"); // Dark vignette edge

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draws subtle latitude & longitude graticule lines across the current viewport
 */
function drawGraticule(ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.07)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);

  const vp =
    currentViewport || targetViewport || { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const span = Math.max(vp.maxX - vp.minX, vp.maxY - vp.minY);
  const step = span < 0.6 ? 0.05 : 0.1;

  const startY = Math.floor(vp.minY / step) * step;
  for (let y = startY; y <= vp.maxY + step; y += step) {
    const [x0, py] = project(vp.minX - 0.2, y);
    const [x1] = project(vp.maxX + 0.2, y);
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
    ctx.stroke();
  }

  const startX = Math.floor(vp.minX / step) * step;
  for (let x = startX; x <= vp.maxX + step; x += step) {
    const [px, y0] = project(x, vp.minY - 0.2);
    const [, y1] = project(x, vp.maxY + 0.2);
    ctx.beginPath();
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws authentic Portolan chart radiating rhumb lines from oceanic loci in the known world
 */
function drawRhumbLines(ctx) {
  const isEarlyEra =
    !state.currentEraId ||
    state.currentEraId === "discovery" ||
    state.currentEraId === "revolt";

  const centers = isEarlyEra
    ? [
      { x: 0.44, y: 0.32 }, // Lisbon / Atlantic Gateway
      { x: 0.53, y: 0.27 }, // Venice / Mediterranean Hub
    ]
    : [
      { x: 0.38, y: 0.48 }, // Mid-Atlantic Hub
      { x: 0.53, y: 0.27 }, // Mediterranean Hub
      { x: 0.72, y: 0.72 }, // Indian Ocean Hub
      { x: 0.08, y: 0.7 }, // South Pacific Hub
    ];

  ctx.save();
  const maxLen = Math.hypot(canvasWidth, canvasHeight);

  centers.forEach((centerNorm) => {
    const [cx, cy] = project(centerNorm.x, centerNorm.y);
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI * 2) / 32;
      const endX = cx + Math.cos(angle) * maxLen;
      const endY = cy + Math.sin(angle) * maxLen;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(endX, endY);

      if (i % 8 === 0) {
        // Principal 4 cardinal rays (bold gold)
        ctx.strokeStyle = "rgba(218, 165, 32, 0.16)";
        ctx.lineWidth = 1.2;
      } else if (i % 4 === 0) {
        // Intercardinal rays (warm amber)
        ctx.strokeStyle = "rgba(205, 133, 63, 0.10)";
        ctx.lineWidth = 0.9;
      } else {
        // Half-wind / quarter-wind rays (faint bronze)
        ctx.strokeStyle = "rgba(160, 130, 80, 0.04)";
        ctx.lineWidth = 0.6;
      }
      ctx.stroke();
    }
  });

  ctx.restore();
}

/**
 * Draws an authentic Victorian Steampunk Astrolabe Compass Rose fixed neatly in the top-left corner
 */
function drawCompassRose(ctx, cx, cy, radius = 22) {
  ctx.save();

  // Outer brass astrolabe ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(212, 175, 55, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Secondary inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(212, 175, 55, 0.35)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Degree graduation ticks along outer ring (every 15 degrees)
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 90 === 0;
    const isMid = deg % 45 === 0;
    const tickLen = isMajor ? radius * 0.22 : isMid ? radius * 0.14 : radius * 0.08;
    const r1 = radius - tickLen;
    const r2 = radius;

    const x1 = cx + Math.cos(rad) * r1;
    const y1 = cy + Math.sin(rad) * r1;
    const x2 = cx + Math.cos(rad) * r2;
    const y2 = cy + Math.sin(rad) * r2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isMajor
      ? "rgba(255, 215, 0, 0.9)"
      : isMid
        ? "rgba(212, 175, 55, 0.6)"
        : "rgba(180, 140, 60, 0.35)";
    ctx.lineWidth = isMajor ? 1.4 : 0.8;
    ctx.stroke();
  }

  // Draw 16 faceted points of the compass star
  const points = 16;
  const rMajor = radius * 0.74;
  const rInter = radius * 0.52;
  const rMinor = radius * 0.36;
  const rBase = radius * 0.16;

  for (let i = 0; i < points; i++) {
    const angle = (i * Math.PI * 2) / points - Math.PI / 2;
    const halfStep = Math.PI / points;

    let tipR;
    if (i % 4 === 0) tipR = rMajor; // N, E, S, W
    else if (i % 2 === 0) tipR = rInter; // NE, SE, SW, NW
    else tipR = rMinor; // secondary

    const tipX = cx + Math.cos(angle) * tipR;
    const tipY = cy + Math.sin(angle) * tipR;

    const leftX = cx + Math.cos(angle - halfStep) * rBase;
    const leftY = cy + Math.sin(angle - halfStep) * rBase;

    const rightX = cx + Math.cos(angle + halfStep) * rBase;
    const rightY = cy + Math.sin(angle + halfStep) * rBase;

    // Light half (gold)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? "#ffd700" : i % 2 === 0 ? "#f0c354" : "#d4af37";
    ctx.fill();

    // Dark/shaded half (bronze/sepia)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? "#8b6508" : i % 2 === 0 ? "#6d4c10" : "#4a330b";
    ctx.fill();
  }

  // Small North Arrow Tip
  const northTipY = cy - rMajor - radius * 0.15;
  ctx.beginPath();
  ctx.moveTo(cx, northTipY);
  ctx.lineTo(cx - radius * 0.09, cy - rMajor + 1);
  ctx.lineTo(cx + radius * 0.09, cy - rMajor + 1);
  ctx.closePath();
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  ctx.strokeStyle = "#8b6508";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Central Brass Rivet
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  ctx.strokeStyle = "#5a3a06";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cardinal Labels: N, E, S, W (crisp, small, centered)
  ctx.font = `bold ${Math.max(8, Math.round(radius * 0.36))}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const labelOffset = radius * 0.92;
  const labels = [
    { text: "N", x: cx, y: cy - labelOffset, color: "#ffd700" },
    { text: "E", x: cx + labelOffset, y: cy, color: "#e8c368" },
    { text: "S", x: cx, y: cy + labelOffset, color: "#e8c368" },
    { text: "W", x: cx - labelOffset, y: cy, color: "#e8c368" },
  ];

  labels.forEach((l) => {
    ctx.fillStyle = "rgba(10, 15, 20, 0.85)";
    ctx.fillText(l.text, l.x + 0.6, l.y + 0.6);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
  });

  ctx.restore();
}

/**
 * Draws vintage cartographic latitude/longitude graduation border framing the full screen
 */
function drawCartographicBorder(ctx, width, height) {
  const margin = 3;
  const borderThick = 12;
  const bx = margin;
  const by = margin;
  const bw = width - margin * 2;
  const bh = height - margin * 2;

  ctx.save();

  // Outer brass frame
  ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);

  // Inner border frame
  ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    bx + borderThick,
    by + borderThick,
    bw - borderThick * 2,
    bh - borderThick * 2
  );

  // Alternating degree blocks along top and bottom borders
  const numDivsX = 36;
  const stepX = (bw - borderThick * 2) / numDivsX;
  for (let i = 0; i < numDivsX; i++) {
    const x = bx + borderThick + i * stepX;
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(212, 175, 55, 0.35)" : "rgba(10, 20, 30, 0.5)";
    ctx.fillRect(x, by, stepX, borderThick);
    ctx.fillRect(x, by + bh - borderThick, stepX, borderThick);
  }

  // Alternating degree blocks along left and right borders
  const numDivsY = 18;
  const stepY = (bh - borderThick * 2) / numDivsY;
  for (let j = 0; j < numDivsY; j++) {
    const y = by + borderThick + j * stepY;
    ctx.fillStyle =
      j % 2 === 0 ? "rgba(212, 175, 55, 0.35)" : "rgba(10, 20, 30, 0.5)";
    ctx.fillRect(bx, y, borderThick, stepY);
    ctx.fillRect(bx + bw - borderThick, y, borderThick, stepY);
  }

  // Corner Brass Rosettes with Rivets
  const corners = [
    [bx + borderThick / 2, by + borderThick / 2],
    [bx + bw - borderThick / 2, by + borderThick / 2],
    [bx + borderThick / 2, by + bh - borderThick / 2],
    [bx + bw - borderThick / 2, by + bh - borderThick / 2],
  ];

  corners.forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, borderThick * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "#b8860b";
    ctx.fill();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, borderThick * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "#fff2a8";
    ctx.fill();
  });

  ctx.restore();
}

// -------------------------------------------------------------
// MAIN MAP RENDER LOOP
// -------------------------------------------------------------

export function renderMap(immediate = false) {
  if (!ctx || !canvas) return;

  // Auto-synchronize camera viewport when kingdoms emerge or era advances
  const newTarget = computeTargetViewport(state.kingdoms, canvasWidth, canvasHeight);
  if (!currentViewport || immediate) {
    currentViewport = { ...newTarget };
    targetViewport = { ...newTarget };
    if (viewportAnimFrame) {
      cancelAnimationFrame(viewportAnimFrame);
      viewportAnimFrame = null;
    }
  } else if (
    !targetViewport ||
    Math.abs(targetViewport.minX - newTarget.minX) > 0.001 ||
    Math.abs(targetViewport.maxX - newTarget.maxX) > 0.001 ||
    Math.abs(targetViewport.minY - newTarget.minY) > 0.001 ||
    Math.abs(targetViewport.maxY - newTarget.maxY) > 0.001
  ) {
    targetViewport = newTarget;
    if (!viewportAnimFrame) {
      viewportAnimFrame = requestAnimationFrame(animateViewportStep);
    }
  }

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Deep antique ocean background with radial gradient (covers whole viewport)
  drawOcean(ctx, canvasWidth, canvasHeight);

  // 2. Graticule coordinate grid (parallels & meridians across current viewport)
  drawGraticule(ctx);

  // 3. Portolan navigational rhumb lines radiating across known seas
  drawRhumbLines(ctx);

  // 4. Nautical Astrolabe Compass Rose fixed in top-left corner (small, elegant, permanent)
  const compassX = 46;
  const compassY = 46;
  const compassRadius = 22;
  drawCompassRose(ctx, compassX, compassY, compassRadius);

  // Determine badge sizing based on era nation count (discovery=11, modern=200)
  const count = state.kingdoms.length;
  let fontSize = 14;
  let badgePadX = 6;
  let badgePadY = 3;
  let badgeHeight = 18;

  if (count > 120) {
    fontSize = 9.5;
    badgePadX = 3;
    badgePadY = 1;
    badgeHeight = 13;
  } else if (count > 50) {
    fontSize = 11;
    badgePadX = 4;
    badgePadY = 2;
    badgeHeight = 15;
  } else if (count > 20) {
    fontSize = 12.5;
    badgePadX = 5;
    badgePadY = 2.5;
    badgeHeight = 16.5;
  }

  // 5. Draw each sovereign kingdom with Steampunk cartography
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

    // Subtle coastline ripple glow (cartographic double contour)
    ctx.save();
    ctx.strokeStyle = "rgba(212, 175, 55, 0.16)";
    ctx.lineWidth = count > 50 ? 4 : 6;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();

    // Fill with kingdom realm color
    const isPolynesian = POLYNESIAN_ISLES?.has(kingdom.code);
    const isPolynesiaActive = Boolean(state?.metaThemes?.polynesiaIsles);

    if (isPolynesian && !isPolynesiaActive) {
      ctx.fillStyle = "rgba(65, 120, 145, 0.35)";
    } else if (isPolynesian && isPolynesiaActive) {
      ctx.fillStyle = kingdom.color || "#00d2d3";
    } else {
      ctx.fillStyle = kingdom.color || "#4ecdc4";
    }
    ctx.fill();

    // Border calculation
    const isIsland = Boolean(kingdom.isIsland || kingdom.is_island);
    const isMyKingdom =
      state.myKingdom &&
      (kingdom.id === state.myKingdom.country_id ||
        kingdom.code === state.myKingdom.country_code);
    const isNewlyEmergedInEra =
      state.currentEraId &&
      state.currentEraId !== "discovery" &&
      kingdom.unlock_era === state.currentEraId &&
      !kingdom.owner_id;

    let borderColor;
    let borderWidth;

    if (isMyKingdom) {
      borderColor = "#ffd700"; // Gleaming gold for player's own realm
      borderWidth = 3.2;
    } else if (isPolynesian && isPolynesiaActive) {
      borderColor = "#00f0ff"; // Vivid luminous turquoise for active Polynesian meta theme
      borderWidth = 2.4;
    } else if (isPolynesian && !isPolynesiaActive) {
      borderColor = "rgba(100, 160, 190, 0.4)"; // Soft muted oceanic border when inactive
      borderWidth = 1.0;
    } else if (isNewlyEmergedInEra) {
      borderColor = "#f5d76e"; // Illuminated brass border for newly emerged nations in this era
      borderWidth = 2.2;
    } else if (isIsland) {
      borderColor = "#e67e22"; // Warm brass/amber for maritime island realms
      borderWidth = 2.2;
    } else if (kingdom.owner_id) {
      borderColor = "#ffffff"; // Bright silver for player-claimed realms
      borderWidth = 1.8;
    } else {
      borderColor = "rgba(20, 15, 10, 0.78)"; // Vintage ink pen stroke for neutral realms
      borderWidth = 1.2;
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Kingdom Code Cartographic Plaque & Typography
    const [labelX, labelY] = getKingdomLabelPosition(
      kingdom.code,
      poly,
      state.currentSimYear || 1500
    );
    const [pxX, pxY] = project(labelX, labelY);

    ctx.save();
    // Parchment badge under label for crisp visibility
    ctx.font = `bold ${fontSize}px Georgia, 'Times New Roman', serif`;
    const displayLabel = isPolynesian && isPolynesiaActive
      ? `🏝️${kingdom.code}`
      : isPolynesian && !isPolynesiaActive
        ? `⚓${kingdom.code}`
        : isNewlyEmergedInEra
          ? `★${kingdom.code}`
          : kingdom.code;
    const textWidth = ctx.measureText(displayLabel).width;

    ctx.fillStyle = isPolynesian && !isPolynesiaActive
      ? "rgba(15, 23, 30, 0.55)"
      : isPolynesian && isPolynesiaActive
        ? "rgba(10, 35, 45, 0.9)"
        : isNewlyEmergedInEra
          ? "rgba(38, 28, 12, 0.88)"
          : "rgba(15, 23, 30, 0.75)";
    ctx.beginPath();
    ctx.roundRect(
      pxX - textWidth / 2 - badgePadX,
      pxY - badgeHeight / 2 - badgePadY,
      textWidth + badgePadX * 2,
      badgeHeight + badgePadY * 2,
      3
    );
    ctx.fill();
    ctx.strokeStyle = isMyKingdom
      ? "#ffd700"
      : isPolynesian && isPolynesiaActive
        ? "#00f0ff"
        : isNewlyEmergedInEra
          ? "#f5d76e"
          : "rgba(212, 175, 55, 0.4)";
    ctx.lineWidth = (isNewlyEmergedInEra || (isPolynesian && isPolynesiaActive)) ? 1.2 : 0.8;
    ctx.stroke();

    // Text in antique gold/ivory
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isMyKingdom
      ? "#ffe44d"
      : isPolynesian && isPolynesiaActive
        ? "#80fcff"
        : isPolynesian && !isPolynesiaActive
          ? "rgba(220, 235, 245, 0.7)"
          : isNewlyEmergedInEra
            ? "#fff2a8"
            : "#f5f0db";
    ctx.fillText(displayLabel, pxX, pxY);

    // Crown insignia if owned by a player
    if (kingdom.owner_id || isMyKingdom) {
      ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
      ctx.fillText("👑", pxX, pxY - badgeHeight / 2 - 6);
    }
    ctx.restore();

    // 6. Draw Troop Miniatures (Brass tokens & border rivets)
    renderTroopDots(ctx, kingdom, poly);
  });

  // 7. Cartographic Latitude/Longitude graduated degree border framing full screen
  drawCartographicBorder(ctx, canvasWidth, canvasHeight);

  // 8. Steampunk Brass Loupe Magnifier overlay (when active)
  if (magnifierState.active) {
    drawMagnifierLoupe(ctx, magnifierState.x, magnifierState.y);
  }
}


// -------------------------------------------------------------
// TROOP MINIATURES & GARRISON MARKERS
// -------------------------------------------------------------

export function renderTroopDots(ctx, kingdom, poly) {
  const t = state.troops[kingdom.id];
  if (!t) return;

  const central = t.central || 0;
  const borders = t.borders || { N: 0, S: 0, E: 0, W: 0 };

  // Central garrison tokens (brass war tokens at label anchor)
  if (central > 0) {
    const [cxNorm, cyNorm] = getKingdomLabelPosition(
      kingdom.code,
      poly,
      state.currentSimYear || 1500
    );
    const [cx, cy] = project(cxNorm, cyNorm);
    const dotCount = Math.min(Math.max(Math.ceil(central / 10), 1), 16);
    const spread = Math.min(central / 50, 14);

    ctx.save();
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const r = spread * Math.sqrt((i + 1) / dotCount);
      const dx = cx + Math.cos(angle) * r;
      const dy = cy + 12 + Math.sin(angle) * r;

      // Outer brass ring
      ctx.beginPath();
      ctx.arc(dx, dy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#d4af37";
      ctx.fill();
      ctx.strokeStyle = "#3e2704";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Inner rivet core
      ctx.beginPath();
      ctx.arc(dx, dy, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();
  }

  // Border defense garrison tokens
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

    const dotCount = Math.min(Math.max(Math.ceil(count / 5), 1), 12);
    ctx.save();
    for (let i = 0; i < dotCount; i++) {
      const tNorm = (i + 0.5) / dotCount;
      const jitter = (Math.random() - 0.5) * 3;
      const dx = x1 + (x2 - x1) * tNorm + jitter;
      const dy = y1 + (y2 - y1) * tNorm + jitter;

      // Iron border token
      ctx.beginPath();
      ctx.arc(dx, dy, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#c0392b";
      ctx.fill();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.restore();
  });
}

/**
 * Draws an authentic Victorian Steampunk Brass Magnifying Loupe
 * with beveled brass rim, optical glass glint, astrolabe reticle & vector-scaled map.
 */
function drawMagnifierLoupe(ctx, mx, my) {
  const radius = magnifierState.radius;
  const zoom = magnifierState.zoom;

  ctx.save();

  // 1. Drop shadow beneath the heavy brass loupe
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, radius + 4, 0, Math.PI * 2);
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fill();
  ctx.restore();

  // 2. Circular clip for magnified optical lens
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.clip();

  // Magnification transform centered around (mx, my)
  ctx.translate(mx, my);
  ctx.scale(zoom, zoom);
  ctx.translate(-mx, -my);

  // Re-render crisp ocean & navigational graticule within the lens
  drawOcean(ctx, canvasWidth, canvasHeight);
  drawGraticule(ctx);
  drawRhumbLines(ctx);

  // Re-draw kingdoms in magnified space with bold high-legibility badges
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

    ctx.fillStyle = kingdom.color || "#4ecdc4";
    ctx.fill();

    ctx.strokeStyle = "#ffe57f";
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Magnified realm label with parchment badge
    const [lxNorm, lyNorm] = getKingdomLabelPosition(
      kingdom.code,
      poly,
      state.currentSimYear || 1500
    );
    const [pxX, pxY] = project(lxNorm, lyNorm);

    ctx.save();
    ctx.font = "bold 13px 'Cinzel', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const labelText = kingdom.name;
    const txtMetrics = ctx.measureText(labelText);
    const badgeW = txtMetrics.width + 12;
    const badgeH = 18;

    ctx.fillStyle = "rgba(10, 15, 22, 0.88)";
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pxX - badgeW / 2, pxY - badgeH / 2, badgeW, badgeH, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(labelText, pxX, pxY);

    if (kingdom.owner_id) {
      ctx.font = "10px sans-serif";
      ctx.fillText("👑", pxX, pxY - badgeH / 2 - 7);
    }
    ctx.restore();

    renderTroopDots(ctx, kingdom, poly);
  });

  ctx.restore(); // Exit optical clip

  // 3. Antique Beveled Brass Rim
  const rimGrad = ctx.createLinearGradient(
    mx - radius,
    my - radius,
    mx + radius,
    my + radius
  );
  rimGrad.addColorStop(0, "#fff0a3"); // Polished brass highlight
  rimGrad.addColorStop(0.25, "#d4af37"); // Golden brass
  rimGrad.addColorStop(0.7, "#8b6508"); // Aged brass
  rimGrad.addColorStop(1, "#3e2704"); // Deep bronze shadow

  ctx.beginPath();
  ctx.arc(mx, my, radius + 7, 0, Math.PI * 2);
  ctx.arc(mx, my, radius - 1, 0, Math.PI * 2, true);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  // Inner gold ring
  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffe57f";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Outer bronze rim
  ctx.beginPath();
  ctx.arc(mx, my, radius + 7, 0, Math.PI * 2);
  ctx.strokeStyle = "#2a1a02";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Brass Rivets around the circumference
  const rivetCount = 14;
  for (let i = 0; i < rivetCount; i++) {
    const angle = (i / rivetCount) * Math.PI * 2;
    const rx = mx + Math.cos(angle) * (radius + 3);
    const ry = my + Math.sin(angle) * (radius + 3);
    ctx.beginPath();
    ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#3e2704";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // 4. Astrolabe Reticle & Ticks
  ctx.save();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(mx - radius * 0.72, my);
  ctx.lineTo(mx + radius * 0.72, my);
  ctx.moveTo(mx, my - radius * 0.72);
  ctx.lineTo(mx, my + radius * 0.72);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(mx, my, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 215, 0, 0.45)";
  ctx.stroke();
  ctx.restore();

  // 5. Optical glass glare arc (curved surface reflection)
  const glintGrad = ctx.createLinearGradient(mx - radius, my - radius, mx, my);
  glintGrad.addColorStop(0, "rgba(255, 255, 255, 0.32)");
  glintGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  glintGrad.addColorStop(1, "transparent");

  ctx.beginPath();
  ctx.arc(mx, my, radius - 4, -Math.PI * 0.88, -Math.PI * 0.12);
  ctx.strokeStyle = glintGrad;
  ctx.lineWidth = 5;
  ctx.stroke();

  // 6. Engraved Brass Loupe Plaque
  ctx.fillStyle = "#1e1302";
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(mx - 34, my - radius - 14, 68, 16, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 9px 'Cinzel', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("2.4× LOUPE", mx, my - radius - 6);

  ctx.restore();
}

export function getKingdomAtPosition(clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  let canvasX = clientX - rect.left;
  let canvasY = clientY - rect.top;

  // If clicking through the magnifier lens, transform coordinates
  if (magnifierState.active) {
    const dx = canvasX - magnifierState.x;
    const dy = canvasY - magnifierState.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= magnifierState.radius * magnifierState.radius) {
      canvasX = magnifierState.x + dx / magnifierState.zoom;
      canvasY = magnifierState.y + dy / magnifierState.zoom;
    }
  }

  const u = canvasX / canvasWidth;
  const v = canvasY / canvasHeight;

  if (u < 0 || u > 1 || v < 0 || v > 1) return null;

  const vp =
    currentViewport || targetViewport || { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const vpW = vp.maxX - vp.minX || 1;
  const vpH = vp.maxY - vp.minY || 1;
  const x = vp.minX + u * vpW;
  const y = vp.minY + v * vpH;

  // Iterate in reverse order (newest era countries on top of older parent empires)
  for (let i = state.kingdoms.length - 1; i >= 0; i--) {
    const kingdom = state.kingdoms[i];
    const poly = kingdomPolygons[kingdom.code];
    if (!poly) continue;

    // Fast bounding box check before raycasting
    const b = getPolygonBoundsCached(kingdom.code, poly);
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) {
      continue;
    }

    if (pointInPolygon(x, y, poly)) {
      return kingdom;
    }
  }
  return null;
}



// renderer.js - Steampunk Cartographic Rendering Engine for the Age of Discovery (c. 1500)

import { state } from "../state.js";
import { kingdomPolygons, getKingdomLabelPosition } from "./polygons.js";
import { getCentroid, pointInPolygon, getPolygonBounds } from "./geometry.js";

let canvas = null;
let ctx = null;
let canvasWidth = 0;
let canvasHeight = 0;
let mapOffsetX = 0;
let mapOffsetY = 0;
let mapDrawWidth = 0;
let mapDrawHeight = 0;

const TARGET_ASPECT = 2.15;
const boundsCache = new Map();

function getPolygonBoundsCached(code, poly) {
  let b = boundsCache.get(code);
  if (!b) {
    b = getPolygonBounds(poly);
    boundsCache.set(code, b);
  }
  return b;
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
  canvasWidth = container.clientWidth;
  canvasHeight = container.clientHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const containerAspect = canvasWidth / Math.max(1, canvasHeight);
  if (containerAspect > TARGET_ASPECT) {
    mapDrawHeight = canvasHeight;
    mapDrawWidth = canvasHeight * TARGET_ASPECT;
    mapOffsetX = (canvasWidth - mapDrawWidth) / 2;
    mapOffsetY = 0;
  } else {
    mapDrawWidth = canvasWidth;
    mapDrawHeight = canvasWidth / TARGET_ASPECT;
    mapOffsetX = 0;
    mapOffsetY = (canvasHeight - mapDrawHeight) / 2;
  }

  renderMap();
}

export function project(x, y) {
  return [mapOffsetX + x * mapDrawWidth, mapOffsetY + y * mapDrawHeight];
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
 * Draws subtle latitude & longitude graticule lines across the world grid
 */
function drawGraticule(ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.07)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);

  // Parallels (latitude)
  for (let y = 0.1; y < 1.0; y += 0.1) {
    const [x0, py] = project(0, y);
    const [x1] = project(1, y);
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
    ctx.stroke();
  }

  // Meridians (longitude)
  for (let x = 0.1; x < 1.0; x += 0.1) {
    const [px, y0] = project(x, 0);
    const [, y1] = project(x, 1);
    ctx.beginPath();
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws authentic Portolan chart radiating rhumb lines from 3 global oceanic loci
 */
function drawRhumbLines(ctx) {
  const centers = [
    { x: 0.38, y: 0.48 }, // Mid-Atlantic Hub
    { x: 0.72, y: 0.72 }, // Indian Ocean Hub
    { x: 0.08, y: 0.70 }, // South Pacific Hub
  ];

  ctx.save();
  const maxLen = Math.hypot(mapDrawWidth, mapDrawHeight);

  centers.forEach((centerNorm) => {
    const [cx, cy] = project(centerNorm.x, centerNorm.y);
    // 32-bearing navigation rays
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
 * Draws an elaborate 16-point Nautical Astrolabe Compass Rose in the Atlantic
 */
function drawCompassRose(ctx, cx, cy, radius) {
  ctx.save();

  // Outer brass astrolabe ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(212, 175, 55, 0.55)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Secondary inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(212, 175, 55, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Degree graduation ticks along outer ring (every 10 degrees)
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 90 === 0;
    const isMid = deg % 45 === 0;
    const tickLen = isMajor ? radius * 0.18 : isMid ? radius * 0.12 : radius * 0.07;
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
      ? "rgba(255, 215, 0, 0.85)"
      : isMid
      ? "rgba(212, 175, 55, 0.6)"
      : "rgba(180, 140, 60, 0.35)";
    ctx.lineWidth = isMajor ? 1.8 : 1;
    ctx.stroke();
  }

  // Draw 16 faceted points of the compass star
  // 16 points: 4 major cardinals, 4 intercardinals, 8 secondary points
  const points = 16;
  const rMajor = radius * 0.78;
  const rInter = radius * 0.58;
  const rMinor = radius * 0.42;
  const rBase = radius * 0.18;

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

  // Ornate Fleur-de-lis / North Arrow Tip
  const northTipY = cy - rMajor - radius * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx, northTipY);
  ctx.lineTo(cx - radius * 0.08, cy - rMajor + 2);
  ctx.lineTo(cx + radius * 0.08, cy - rMajor + 2);
  ctx.closePath();
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  ctx.strokeStyle = "#8b6508";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Central Brass Astrolabe Hub & Rivet
  const hubGrad = ctx.createRadialGradient(
    cx - 2,
    cy - 2,
    1,
    cx,
    cy,
    radius * 0.16
  );
  hubGrad.addColorStop(0, "#fff2a8");
  hubGrad.addColorStop(0.4, "#d4af37");
  hubGrad.addColorStop(0.8, "#8b6508");
  hubGrad.addColorStop(1, "#3e2704");

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cardinal Labels: N, E, S, W
  ctx.font = `bold ${Math.max(11, Math.round(radius * 0.22))}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const labelOffset = radius * 0.95;
  const labels = [
    { text: "N", x: cx, y: cy - labelOffset, color: "#ffd700" },
    { text: "E", x: cx + labelOffset, y: cy, color: "#e8c368" },
    { text: "S", x: cx, y: cy + labelOffset, color: "#e8c368" },
    { text: "W", x: cx - labelOffset, y: cy, color: "#e8c368" },
  ];

  labels.forEach((l) => {
    ctx.fillStyle = "rgba(10, 15, 20, 0.7)";
    ctx.fillText(l.text, l.x + 1, l.y + 1);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
  });

  ctx.restore();
}

/**
 * Draws vintage cartographic latitude/longitude graduation border framing the world map
 */
function drawCartographicBorder(ctx, ox, oy, w, h) {
  const margin = 2;
  const borderThick = 10;
  const bx = ox + margin;
  const by = oy + margin;
  const bw = w - margin * 2;
  const bh = h - margin * 2;

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
  const numDivsX = 36; // 36 divisions for 360 degrees of longitude (10 deg each)
  const stepX = (bw - borderThick * 2) / numDivsX;
  for (let i = 0; i < numDivsX; i++) {
    const x = bx + borderThick + i * stepX;
    ctx.fillStyle = i % 2 === 0 ? "rgba(212, 175, 55, 0.35)" : "rgba(10, 20, 30, 0.5)";
    // Top strip
    ctx.fillRect(x, by, stepX, borderThick);
    // Bottom strip
    ctx.fillRect(x, by + bh - borderThick, stepX, borderThick);
  }

  // Alternating degree blocks along left and right borders
  const numDivsY = 18; // 18 divisions for latitude
  const stepY = (bh - borderThick * 2) / numDivsY;
  for (let j = 0; j < numDivsY; j++) {
    const y = by + borderThick + j * stepY;
    ctx.fillStyle = j % 2 === 0 ? "rgba(212, 175, 55, 0.35)" : "rgba(10, 20, 30, 0.5)";
    // Left strip
    ctx.fillRect(bx, y, borderThick, stepY);
    // Right strip
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

export function renderMap() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Deep antique ocean background with radial gradient (covers whole viewport)
  drawOcean(ctx, canvasWidth, canvasHeight);

  // 2. Graticule coordinate grid (parallels & meridians across world map)
  drawGraticule(ctx);

  // 3. Portolan navigational rhumb lines radiating across global oceans
  drawRhumbLines(ctx);

  // 4. Nautical Astrolabe Compass Rose in open South Pacific waters
  const roseRadius = Math.min(mapDrawWidth, mapDrawHeight) * 0.09;
  const [roseX, roseY] = project(0.08, 0.72);
  if (roseRadius > 20) {
    drawCompassRose(ctx, roseX, roseY, roseRadius);
  }

  // Determine badge sizing based on era nation count (discovery=11, modern=200)
  const isDenseEra = state.kingdoms.length > 80;
  const fontSize = isDenseEra ? 10 : 12;
  const badgePadX = isDenseEra ? 3 : 5;
  const badgePadY = isDenseEra ? 1 : 2;
  const badgeHeight = isDenseEra ? 13 : 16;

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
    ctx.lineWidth = isDenseEra ? 4 : 6;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();

    // Fill with kingdom realm color
    ctx.fillStyle = kingdom.color || "#4ecdc4";
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
    const displayLabel = isNewlyEmergedInEra ? `★${kingdom.code}` : kingdom.code;
    const textWidth = ctx.measureText(displayLabel).width;

    ctx.fillStyle = isNewlyEmergedInEra
      ? "rgba(38, 28, 12, 0.88)"
      : "rgba(15, 23, 30, 0.75)";
    ctx.beginPath();
    ctx.roundRect(
      pxX - textWidth / 2 - badgePadX,
      pxY - (badgeHeight / 2) - badgePadY,
      textWidth + badgePadX * 2,
      badgeHeight + badgePadY * 2,
      3
    );
    ctx.fill();
    ctx.strokeStyle = isMyKingdom
      ? "#ffd700"
      : isNewlyEmergedInEra
      ? "#f5d76e"
      : "rgba(212, 175, 55, 0.4)";
    ctx.lineWidth = isNewlyEmergedInEra ? 1.2 : 0.8;
    ctx.stroke();

    // Text in antique gold/ivory
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isMyKingdom
      ? "#ffe44d"
      : isNewlyEmergedInEra
      ? "#fff2a8"
      : "#f5f0db";
    ctx.fillText(displayLabel, pxX, pxY);

    // Crown insignia if owned by a player
    if (kingdom.owner_id || isMyKingdom) {
      ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
      ctx.fillText("👑", pxX, pxY - (badgeHeight / 2) - 6);
    }
    ctx.restore();

    // 6. Draw Troop Miniatures (Brass tokens & border rivets)
    renderTroopDots(ctx, kingdom, poly);
  });

  // 7. Cartographic Latitude/Longitude graduated degree border framing world map
  drawCartographicBorder(ctx, mapOffsetX, mapOffsetY, mapDrawWidth, mapDrawHeight);
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

export function getKingdomAtPosition(clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  if (mapDrawWidth === 0 || mapDrawHeight === 0) return null;

  const canvasX = clientX - rect.left;
  const canvasY = clientY - rect.top;

  // Unproject from letterboxed canvas space to normalized [0, 1] world coordinates
  const x = (canvasX - mapOffsetX) / mapDrawWidth;
  const y = (canvasY - mapOffsetY) / mapDrawHeight;

  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

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



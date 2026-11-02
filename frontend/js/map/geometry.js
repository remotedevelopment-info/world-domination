// geometry.js - Geometric math, projection, and point-in-polygon raycasting

export function project(x, y, canvasWidth, canvasHeight, padding = 20) {
  const w = canvasWidth - padding * 2;
  const h = canvasHeight - padding * 2;
  return [padding + x * w, padding + y * h];
}

export function getCentroid(poly) {
  if (!poly || !poly.length) return [0, 0];
  let x = 0;
  let y = 0;
  poly.forEach(([px, py]) => {
    x += px;
    y += py;
  });
  return [x / poly.length, y / poly.length];
}

export function pointInPolygon(px, py, poly) {
  if (!poly || !poly.length) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function getPolygonBounds(poly) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  poly.forEach(([px, py]) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    rangeX: maxX - minX || 1,
    rangeY: maxY - minY || 1,
  };
}


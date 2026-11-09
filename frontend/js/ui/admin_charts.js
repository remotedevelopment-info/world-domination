// admin_charts.js - High-fidelity interactive analytics & visualizer deck for Kingdom Conquest pure overseer / admin

let activeChartTab = "wealth_gdp"; // 'wealth_gdp', 'solvency_matrix', 'tax_pride', 'demographics', 'climatic_wave'
let activeChartScope = "top10"; // 'top10', 'top20', 'all'
let cachedMonitorData = null;
let chartCanvas = null;
let chartCtx = null;
let chartTooltip = null;
let hoverElements = [];
let hoveredElement = null;

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initAdminCharts() {
  chartCanvas = document.getElementById("admin-analytics-canvas");
  chartTooltip = document.getElementById("admin-chart-tooltip");
  if (!chartCanvas) return;

  chartCtx = chartCanvas.getContext("2d");

  // Setup mouse interaction for interactive hover tooltips and selection clicks
  chartCanvas.addEventListener("mousemove", handleChartMouseMove);
  chartCanvas.addEventListener("mouseleave", handleChartMouseLeave);
  chartCanvas.addEventListener("click", handleChartClick);

  window.addEventListener("resize", () => {
    if (cachedMonitorData) {
      renderActiveChart();
    }
  });
}

export function updateAdminCharts(monitorData) {
  if (!monitorData) return;
  cachedMonitorData = monitorData;
  renderActiveChart();
  renderChartSummaryKPIs();
}

export function switchAdminChartTab(tabName) {
  activeChartTab = tabName;
  const buttons = document.querySelectorAll(".analytics-tab-btn");
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-chart") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  if (cachedMonitorData) {
    renderActiveChart();
    renderChartSummaryKPIs();
  }
}

export function switchAdminChartScope(scope) {
  activeChartScope = scope;
  if (cachedMonitorData) {
    renderActiveChart();
    renderChartSummaryKPIs();
  }
}

function resizeCanvasToDisplay(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, Math.floor(rect.width || 800));
  const height = Math.max(220, Math.floor(rect.height || 340));
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  chartCtx.resetTransform();
  chartCtx.scale(dpr, dpr);
  return { width, height };
}

function filterKingdomsByScope(kingdoms, sortFn) {
  const sorted = [...kingdoms].sort(sortFn);
  if (activeChartScope === "top10") return sorted.slice(0, 10);
  if (activeChartScope === "top20") return sorted.slice(0, 20);
  return sorted;
}

export function renderActiveChart() {
  if (!chartCanvas || !chartCtx || !cachedMonitorData) return;
  const { width, height } = resizeCanvasToDisplay(chartCanvas);

  hoverElements = [];
  hoveredElement = null;
  hideTooltip();

  // Clear background
  chartCtx.fillStyle = "#091019";
  chartCtx.fillRect(0, 0, width, height);

  const kingdoms = cachedMonitorData.kingdoms || [];

  switch (activeChartTab) {
    case "wealth_gdp":
      renderWealthGdpChart(width, height, kingdoms);
      break;
    case "solvency_matrix":
      renderSolvencyMatrixChart(width, height, kingdoms);
      break;
    case "tax_pride":
      renderTaxPrideCurveChart(width, height, kingdoms);
      break;
    case "demographics":
      renderDemographicLoadChart(width, height, kingdoms);
      break;
    case "climatic_wave":
      renderClimaticHarmonicWaveChart(width, height, cachedMonitorData);
      break;
    default:
      renderWealthGdpChart(width, height, kingdoms);
  }
}

// -------------------------------------------------------------
// 1. WEALTH & REAL GDP COMPARATIVE DOUBLE BAR CHART
// -------------------------------------------------------------
function renderWealthGdpChart(width, height, kingdoms) {
  const padLeft = 90;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const data = filterKingdomsByScope(kingdoms, (a, b) => {
    const goldA = a.user_state?.resources ?? 0;
    const goldB = b.user_state?.resources ?? 0;
    return goldB - goldA;
  });

  if (data.length === 0) {
    drawEmptyState("No kingdom telemetry available for wealth analysis");
    return;
  }

  let maxVal = 1000;
  data.forEach((k) => {
    const gold = k.user_state?.resources ?? 0;
    const gdp = k.user_state?.gdp ?? 0;
    if (gold > maxVal) maxVal = gold;
    if (gdp > maxVal) maxVal = gdp;
  });
  maxVal = Math.ceil(maxVal * 1.15);

  // Draw chart header
  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "11px 'Cinzel', Georgia, serif";
  chartCtx.fillText("TOP SOVEREIGN POWERS: SPECIE RESERVES ($ GOLD) VS REAL GDP", padLeft, 20);

  // Draw legend
  chartCtx.fillStyle = "#ffd700";
  chartCtx.fillRect(width - 240, 10, 10, 10);
  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "10px monospace";
  chartCtx.fillText("Treasury Reserves ($)", width - 225, 19);

  chartCtx.fillStyle = "#34d399";
  chartCtx.fillRect(width - 120, 10, 10, 10);
  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.fillText("Real GDP ($)", width - 105, 19);

  // Horizontal Grid Lines & Y-Axis Labels
  const gridTicks = 4;
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "9px monospace";
  chartCtx.textAlign = "right";

  for (let i = 0; i <= gridTicks; i++) {
    const val = (maxVal / gridTicks) * i;
    const y = padTop + plotHeight - (plotHeight / gridTicks) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(padLeft, y);
    chartCtx.lineTo(width - padRight, y);
    chartCtx.stroke();

    const label = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`;
    chartCtx.fillText(label, padLeft - 8, y + 3);
  }

  // Draw Bars
  const count = data.length;
  const groupWidth = plotWidth / count;
  const barWidth = Math.max(4, Math.min(22, (groupWidth - 8) / 2));

  data.forEach((k, idx) => {
    const centerX = padLeft + idx * groupWidth + groupWidth / 2;
    const gold = Math.max(0, k.user_state?.resources ?? 0);
    const gdp = Math.max(0, k.user_state?.gdp ?? 0);

    const goldH = (gold / maxVal) * plotHeight;
    const gdpH = (gdp / maxVal) * plotHeight;

    const goldX = centerX - barWidth - 1;
    const goldY = padTop + plotHeight - goldH;

    const gdpX = centerX + 1;
    const gdpY = padTop + plotHeight - gdpH;

    // Gold bar
    chartCtx.fillStyle = "#ffd700";
    chartCtx.fillRect(goldX, goldY, barWidth, goldH);

    // GDP bar
    chartCtx.fillStyle = "#10b981";
    chartCtx.fillRect(gdpX, gdpY, barWidth, gdpH);

    // Realm Code Label below
    chartCtx.fillStyle = k.color || "#e2e8f0";
    chartCtx.font = "bold 9px monospace";
    chartCtx.textAlign = "center";
    chartCtx.fillText(k.code || String(k.country_id), centerX, padTop + plotHeight + 14);

    // Record hit area for tooltips
    hoverElements.push({
      x: goldX,
      y: Math.min(goldY, gdpY),
      w: barWidth * 2 + 2,
      h: Math.max(goldH, gdpH) + 15,
      kingdom: k,
      text: `<strong>${escapeHTML(k.name || k.country_name)} (${k.code || k.country_id})</strong><br>💰 Specie Reserves: $${gold.toLocaleString()}<br>📈 Real GDP: $${gdp.toLocaleString()}<br>Tax Rate: ${k.user_settings?.tax_rate ?? 10}% | Pride: ${Number(k.user_state?.entrepreneurial_pride ?? 100).toFixed(1)}%`,
    });
  });
}

// -------------------------------------------------------------
// 2. MACRO RISK MATRIX: SOLVENCY VS MILITARY LIABILITIES SCATTER
// -------------------------------------------------------------
function renderSolvencyMatrixChart(width, height, kingdoms) {
  const padLeft = 80;
  const padRight = 40;
  const padTop = 40;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "11px 'Cinzel', Georgia, serif";
  chartCtx.fillText("SOLVENCY VS MILITARY DRAG MATRIX: SPECIE RESERVES ($) VS LIABILITIES ($)", padLeft, 22);

  // Compute maximum values
  let maxRes = 50000;
  let maxMilitary = 10000;

  kingdoms.forEach((k) => {
    const res = k.user_state?.resources ?? 0;
    const delayed = k.user_state?.military_delayed_costs ?? k.user_state?.military_delayed_liabilities ?? 0;
    const upkeep = k.user_state?.military_upkeep ?? 0;
    const totalMilDrag = delayed + upkeep * 2;
    if (res > maxRes) maxRes = res;
    if (totalMilDrag > maxMilitary) maxMilitary = totalMilDrag;
  });

  const midX = padLeft + plotWidth / 2;
  const midY = padTop + plotHeight / 2;

  // Draw 4 Quadrant Backgrounds
  // 1. Top-Left: Sustainable (High Gold, Low Drag)
  chartCtx.fillStyle = "rgba(16, 185, 129, 0.05)";
  chartCtx.fillRect(padLeft, padTop, plotWidth / 2, plotHeight / 2);

  // 2. Top-Right: Hegemon Overextension (High Gold, High Drag)
  chartCtx.fillStyle = "rgba(245, 158, 11, 0.05)";
  chartCtx.fillRect(midX, padTop, plotWidth / 2, plotHeight / 2);

  // 3. Bottom-Left: Austere (Low Gold, Low Drag)
  chartCtx.fillStyle = "rgba(56, 189, 248, 0.05)";
  chartCtx.fillRect(padLeft, midY, plotWidth / 2, plotHeight / 2);

  // 4. Bottom-Right: CRITICAL INSOLVENCY (Low Gold, High Drag)
  chartCtx.fillStyle = "rgba(239, 68, 68, 0.08)";
  chartCtx.fillRect(midX, midY, plotWidth / 2, plotHeight / 2);

  // Axis Dividers
  chartCtx.strokeStyle = "rgba(212, 175, 55, 0.35)";
  chartCtx.lineWidth = 1.5;
  chartCtx.setLineDash([4, 4]);
  chartCtx.beginPath();
  chartCtx.moveTo(midX, padTop);
  chartCtx.lineTo(midX, padTop + plotHeight);
  chartCtx.moveTo(padLeft, midY);
  chartCtx.lineTo(padLeft + plotWidth, midY);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  // Quadrant Labels
  chartCtx.font = "bold 9px monospace";
  chartCtx.fillStyle = "rgba(52, 211, 153, 0.7)";
  chartCtx.fillText("🟢 SUSTAINABLE EMPIRES", padLeft + 10, padTop + 16);

  chartCtx.fillStyle = "rgba(251, 191, 36, 0.7)";
  chartCtx.fillText("🟡 MILITARY EXPANSION (HEAVY UPKEEP)", midX + 10, padTop + 16);

  chartCtx.fillStyle = "rgba(56, 189, 248, 0.7)";
  chartCtx.fillText("🔵 AUSTERE PEACEKEEPERS", padLeft + 10, midY + 18);

  chartCtx.fillStyle = "rgba(248, 113, 113, 0.85)";
  chartCtx.fillText("🔴 INSOLVENCY / TROOP DESERTION PERIL", midX + 10, midY + 18);

  // Axis lines & labels
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(padLeft, padTop + plotHeight);
  chartCtx.lineTo(padLeft + plotWidth, padTop + plotHeight);
  chartCtx.moveTo(padLeft, padTop);
  chartCtx.lineTo(padLeft, padTop + plotHeight);
  chartCtx.stroke();

  chartCtx.fillStyle = "#94a3b8";
  chartCtx.font = "9px monospace";
  chartCtx.textAlign = "center";
  chartCtx.fillText("MILITARY UPKEEP + DELAYED LIABILITIES TAIL ($) →", padLeft + plotWidth / 2, height - 12);

  chartCtx.save();
  chartCtx.translate(20, padTop + plotHeight / 2);
  chartCtx.rotate(-Math.PI / 2);
  chartCtx.fillText("SPECIE GOLD RESERVES ($) →", 0, 0);
  chartCtx.restore();

  // Plot kingdoms
  kingdoms.forEach((k) => {
    const res = Math.max(0, k.user_state?.resources ?? 0);
    const delayed = k.user_state?.military_delayed_costs ?? k.user_state?.military_delayed_liabilities ?? 0;
    const upkeep = k.user_state?.military_upkeep ?? 0;
    const totalMilDrag = delayed + upkeep * 2;

    const x = padLeft + (Math.min(totalMilDrag, maxMilitary) / maxMilitary) * plotWidth;
    const y = padTop + plotHeight - (Math.min(res, maxRes) / maxRes) * plotHeight;

    const color = k.color || "#38bdf8";
    const radius = 5;

    // Glowing dot
    chartCtx.beginPath();
    chartCtx.arc(x, y, radius, 0, Math.PI * 2);
    chartCtx.fillStyle = color;
    chartCtx.shadowColor = color;
    chartCtx.shadowBlur = 6;
    chartCtx.fill();
    chartCtx.shadowBlur = 0;

    chartCtx.strokeStyle = "#ffffff";
    chartCtx.lineWidth = 1;
    chartCtx.stroke();

    hoverElements.push({
      x: x - radius - 2,
      y: y - radius - 2,
      w: radius * 2 + 4,
      h: radius * 2 + 4,
      kingdom: k,
      text: `<strong>${escapeHTML(k.name || k.country_name)} (${k.code || k.country_id})</strong><br>💰 Specie Reserves: $${res.toLocaleString()}<br>⚔️ Military Drag: $${totalMilDrag.toLocaleString()} (Tail: $${delayed.toLocaleString()})<br>Troops: ${(k.user_settings?.troops_central ?? 0).toLocaleString()} central / ${(k.user_settings?.troops_border ?? 0).toLocaleString()} border`,
    });
  });
}

// -------------------------------------------------------------
// 3. LAFFER & RISK VITALITY: TAXATION VS ENTREPRENEURIAL PRIDE
// -------------------------------------------------------------
function renderTaxPrideCurveChart(width, height, kingdoms) {
  const padLeft = 70;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "11px 'Cinzel', Georgia, serif";
  chartCtx.fillText("HISTORICAL LAFFER / RISK CURVE: TAX RATE (%) VS ENTREPRENEURIAL PRIDE (%)", padLeft, 22);

  // Zone Background Shading across 5 Empirical Tax Thresholds
  const x20 = padLeft + (20 / 100) * plotWidth;
  const x35 = padLeft + (35 / 100) * plotWidth;
  const x58 = padLeft + (58 / 100) * plotWidth;
  const x68 = padLeft + (68 / 100) * plotWidth;

  // 0-20%: Capital Haven (Cyan)
  chartCtx.fillStyle = "rgba(56, 189, 248, 0.09)";
  chartCtx.fillRect(padLeft, padTop, x20 - padLeft, plotHeight);

  // 20-35%: Fair Prosperity (Green)
  chartCtx.fillStyle = "rgba(16, 185, 129, 0.08)";
  chartCtx.fillRect(x20, padTop, x35 - x20, plotHeight);

  // 35-58%: Balanced Zone (Yellow)
  chartCtx.fillStyle = "rgba(245, 158, 11, 0.06)";
  chartCtx.fillRect(x35, padTop, x58 - x35, plotHeight);

  // 58-68%: Pride Erosion & Drag (Orange)
  chartCtx.fillStyle = "rgba(249, 115, 22, 0.08)";
  chartCtx.fillRect(x58, padTop, x68 - x58, plotHeight);

  // >68%: Wealth Flight Cliff (Red)
  chartCtx.fillStyle = "rgba(239, 68, 68, 0.14)";
  chartCtx.fillRect(x68, padTop, padLeft + plotWidth - x68, plotHeight);

  // Zone threshold dashed lines
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  chartCtx.setLineDash([3, 3]);
  [x20, x35, x58, x68].forEach((xVal) => {
    chartCtx.beginPath();
    chartCtx.moveTo(xVal, padTop);
    chartCtx.lineTo(xVal, padTop + plotHeight);
    chartCtx.stroke();
  });
  chartCtx.setLineDash([]);

  // Zone labels
  chartCtx.font = "8px monospace";
  chartCtx.fillStyle = "#38bdf8";
  chartCtx.fillText("HAVEN (<20%)", padLeft + 4, padTop + 14);

  chartCtx.fillStyle = "#34d399";
  chartCtx.fillText("FAIR (<35%)", x20 + 4, padTop + 14);

  chartCtx.fillStyle = "#fbbf24";
  chartCtx.fillText("BALANCED", x35 + 4, padTop + 14);

  chartCtx.fillStyle = "#fb923c";
  chartCtx.fillText("EROSION", x58 + 4, padTop + 14);

  chartCtx.fillStyle = "#f87171";
  chartCtx.fillText("WEALTH FLIGHT (>68%)", x68 + 4, padTop + 14);

  // Draw Theoretical Pride Decay Curve
  chartCtx.strokeStyle = "rgba(56, 189, 248, 0.6)";
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  for (let tax = 0; tax <= 100; tax++) {
    const x = padLeft + (tax / 100) * plotWidth;
    let expectedPride = 100;
    if (tax > 40) {
      expectedPride = Math.max(0, 100 - Math.pow(tax - 40, 1.25) * 2.2);
    }
    const y = padTop + plotHeight - (expectedPride / 100) * plotHeight;
    if (tax === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  }
  chartCtx.stroke();

  // Axis grid lines
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "9px monospace";
  chartCtx.textAlign = "right";

  for (let p = 0; p <= 100; p += 25) {
    const y = padTop + plotHeight - (p / 100) * plotHeight;
    chartCtx.beginPath();
    chartCtx.moveTo(padLeft, y);
    chartCtx.lineTo(padLeft + plotWidth, y);
    chartCtx.stroke();
    chartCtx.fillText(`${p}%`, padLeft - 6, y + 3);
  }

  chartCtx.textAlign = "center";
  for (let t = 0; t <= 100; t += 20) {
    const x = padLeft + (t / 100) * plotWidth;
    chartCtx.fillText(`${t}% Tax`, x, padTop + plotHeight + 15);
  }

  // Plot kingdoms
  kingdoms.forEach((k) => {
    const tax = k.user_settings?.tax_rate ?? 10;
    const pride = k.user_state?.entrepreneurial_pride ?? 100;

    const x = padLeft + (Math.min(100, Math.max(0, tax)) / 100) * plotWidth;
    const y = padTop + plotHeight - (Math.min(100, Math.max(0, pride)) / 100) * plotHeight;

    const color = pride < 40 ? "#ef4444" : pride < 70 ? "#f59e0b" : "#10b981";

    chartCtx.beginPath();
    chartCtx.arc(x, y, 5, 0, Math.PI * 2);
    chartCtx.fillStyle = color;
    chartCtx.fill();
    chartCtx.strokeStyle = "#ffffff";
    chartCtx.lineWidth = 1;
    chartCtx.stroke();

    const wRatio = k.user_state?.wealthy_ratio != null ? (k.user_state.wealthy_ratio * 100).toFixed(1) : null;
    const migStatus = k.user_state?.migration_status || (tax <= 20 ? "Capital Haven" : tax <= 35 ? "Fair Prosperity" : tax <= 58 ? "Moderate Tax" : tax <= 68 ? "Heavy Drag" : "Wealth Flight");
    const wealthyTip = wRatio ? `<br>👑 Wealthy Class: ${wRatio}%` : "";

    hoverElements.push({
      x: x - 6,
      y: y - 6,
      w: 12,
      h: 12,
      kingdom: k,
      text: `<strong>${escapeHTML(k.name || k.country_name)} (${k.code || k.country_id})</strong><br>Tax Rate: ${tax}%<br>Entrepreneurial Pride: ${Number(pride).toFixed(1)}%${wealthyTip}<br>Threshold Status: ${migStatus}`,
    });
  });
}

// -------------------------------------------------------------
// 4. DEMOGRAPHIC CARRYING CAPACITY & WELFARE SQUALOR LOAD
// -------------------------------------------------------------
function renderDemographicLoadChart(width, height, kingdoms) {
  const padLeft = 85;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const data = filterKingdomsByScope(kingdoms, (a, b) => {
    const popA = a.population_pressure?.population ?? 0;
    const popB = b.population_pressure?.population ?? 0;
    return popB - popA;
  });

  if (data.length === 0) {
    drawEmptyState("No demographic telemetry available");
    return;
  }

  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "11px 'Cinzel', Georgia, serif";
  chartCtx.fillText("DEMOGRAPHIC STRESS: POPULATION LOAD VS MANPOWER DISCOUNT", padLeft, 20);

  // Draw legend
  chartCtx.fillStyle = "#38bdf8";
  chartCtx.fillRect(width - 260, 10, 10, 10);
  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "10px monospace";
  chartCtx.fillText("Population Stress Ratio (%)", width - 245, 19);

  chartCtx.fillStyle = "#a855f7";
  chartCtx.fillRect(width - 110, 10, 10, 10);
  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.fillText("Troop Discount (%)", width - 95, 19);

  // Grid
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "9px monospace";
  chartCtx.textAlign = "right";

  for (let p = 0; p <= 100; p += 25) {
    const y = padTop + plotHeight - (p / 100) * plotHeight;
    chartCtx.beginPath();
    chartCtx.moveTo(padLeft, y);
    chartCtx.lineTo(padLeft + plotWidth, y);
    chartCtx.stroke();
    chartCtx.fillText(`${p}%`, padLeft - 8, y + 3);
  }

  const count = data.length;
  const groupWidth = plotWidth / count;
  const barWidth = Math.max(4, Math.min(20, (groupWidth - 8) / 2));

  data.forEach((k, idx) => {
    const centerX = padLeft + idx * groupWidth + groupWidth / 2;
    const popObj = k.population_pressure || {};
    const ratio = Math.min(1.0, popObj.carrying_capacity_ratio ?? popObj.population_pressure_index ?? 0.5) * 100;
    const discount = Math.round((1.0 - (popObj.manpower_recruitment_discount ?? 1.0)) * 100);

    const ratioH = (ratio / 100) * plotHeight;
    const discH = (discount / 100) * plotHeight;

    const bar1X = centerX - barWidth - 1;
    const bar1Y = padTop + plotHeight - ratioH;

    const bar2X = centerX + 1;
    const bar2Y = padTop + plotHeight - discH;

    // Population pressure bar
    chartCtx.fillStyle = ratio > 80 ? "#f87171" : "#38bdf8";
    chartCtx.fillRect(bar1X, bar1Y, barWidth, ratioH);

    // Manpower discount bar
    chartCtx.fillStyle = "#a855f7";
    chartCtx.fillRect(bar2X, bar2Y, barWidth, discH);

    // Label
    chartCtx.fillStyle = k.color || "#e2e8f0";
    chartCtx.font = "bold 9px monospace";
    chartCtx.textAlign = "center";
    chartCtx.fillText(k.code || String(k.country_id), centerX, padTop + plotHeight + 14);

    hoverElements.push({
      x: bar1X,
      y: Math.min(bar1Y, bar2Y),
      w: barWidth * 2 + 2,
      h: Math.max(ratioH, discH) + 15,
      kingdom: k,
      text: `<strong>${escapeHTML(k.name || k.country_name)} (${k.code || k.country_id})</strong><br>👥 Population: ${Number(popObj.population || 0).toLocaleString()}<br>Carrying Capacity Stress: ${ratio.toFixed(1)}%<br>⚡ Manpower Troop Discount: -${discount}%<br>Welfare Squalor Burden: $${Math.round(popObj.welfare_squalor_burden || 0).toLocaleString()}/yr`,
    });
  });
}

// -------------------------------------------------------------
// 5. MILANKOVITCH ORBITAL FORCING & LITTLE ICE AGE HARMONIC WAVE
// -------------------------------------------------------------
function renderClimaticHarmonicWaveChart(width, height, monitorData) {
  const padLeft = 70;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const currentYear = monitorData.sim_year || 1500;
  const startYear = 1450;
  const endYear = 1950;
  const totalYears = endYear - startYear;

  chartCtx.fillStyle = "#cbd5e1";
  chartCtx.font = "11px 'Cinzel', Georgia, serif";
  chartCtx.fillText("MILANKOVITCH ORBITAL FORCING & LITTLE ICE AGE SOLAR DEEP FREEZE CYCLES", padLeft, 22);

  // Shading for Historical Minima
  const getXForYear = (yr) => padLeft + ((yr - startYear) / totalYears) * plotWidth;

  const zones = [
    { start: 1460, end: 1550, name: "Spörer Minimum ❄️", color: "rgba(6, 182, 212, 0.12)" },
    { start: 1645, end: 1715, name: "Maunder Minimum (Deep Freeze) 🧊", color: "rgba(59, 130, 246, 0.16)" },
    { start: 1790, end: 1830, name: "Dalton Minimum ❄️", color: "rgba(6, 182, 212, 0.12)" },
  ];

  zones.forEach((z) => {
    const x1 = Math.max(padLeft, getXForYear(z.start));
    const x2 = Math.min(padLeft + plotWidth, getXForYear(z.end));
    if (x2 > x1) {
      chartCtx.fillStyle = z.color;
      chartCtx.fillRect(x1, padTop, x2 - x1, plotHeight);

      chartCtx.fillStyle = "#67e8f9";
      chartCtx.font = "8px monospace";
      chartCtx.textAlign = "left";
      chartCtx.fillText(z.name, x1 + 4, padTop + 14);
    }
  });

  // Zero-line (Holocene Baseline)
  const zeroY = padTop + plotHeight / 2;
  chartCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  chartCtx.setLineDash([4, 4]);
  chartCtx.beginPath();
  chartCtx.moveTo(padLeft, zeroY);
  chartCtx.lineTo(padLeft + plotWidth, zeroY);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  // Draw Harmonic Temperature & Solar Forcing Wave
  chartCtx.strokeStyle = "#67e8f9";
  chartCtx.lineWidth = 2.5;
  chartCtx.shadowColor = "#38bdf8";
  chartCtx.shadowBlur = 8;
  chartCtx.beginPath();

  for (let yr = startYear; yr <= endYear; yr += 2) {
    const x = getXForYear(yr);

    // Multi-frequency solar and orbital synthesis
    const sporFactor = Math.exp(-Math.pow(yr - 1500, 2) / 1200);
    const maunderFactor = Math.exp(-Math.pow(yr - 1680, 2) / 1500);
    const daltonFactor = Math.exp(-Math.pow(yr - 1810, 2) / 800);
    const milankovitch = Math.sin((yr - 1450) / 70) * 0.04;

    const totalAnomaly = milankovitch - sporFactor * 0.08 - maunderFactor * 0.14 - daltonFactor * 0.07;
    // Map -0.15 to +0.10 to Y
    const y = zeroY - (totalAnomaly / 0.15) * (plotHeight / 2);

    if (yr === startYear) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  }
  chartCtx.stroke();
  chartCtx.shadowBlur = 0;

  // Year tick markers
  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "9px monospace";
  chartCtx.textAlign = "center";
  for (let yr = 1500; yr <= 1900; yr += 100) {
    const x = getXForYear(yr);
    chartCtx.beginPath();
    chartCtx.moveTo(x, padTop + plotHeight);
    chartCtx.lineTo(x, padTop + plotHeight + 5);
    chartCtx.stroke();
    chartCtx.fillText(`AD ${yr}`, x, padTop + plotHeight + 15);
  }

  // Draw Current Simulation Year Needle
  const needleX = getXForYear(Math.min(endYear, Math.max(startYear, currentYear)));
  chartCtx.strokeStyle = "#fbbf24";
  chartCtx.lineWidth = 2;
  chartCtx.shadowColor = "#f59e0b";
  chartCtx.shadowBlur = 10;
  chartCtx.beginPath();
  chartCtx.moveTo(needleX, padTop);
  chartCtx.lineTo(needleX, padTop + plotHeight);
  chartCtx.stroke();
  chartCtx.shadowBlur = 0;

  // Needle Head / Pin
  chartCtx.fillStyle = "#ffd700";
  chartCtx.beginPath();
  chartCtx.arc(needleX, padTop + 6, 6, 0, Math.PI * 2);
  chartCtx.fill();
  chartCtx.strokeStyle = "#000000";
  chartCtx.lineWidth = 1.5;
  chartCtx.stroke();

  chartCtx.fillStyle = "#fef08a";
  chartCtx.font = "bold 9px monospace";
  chartCtx.textAlign = "center";
  chartCtx.fillText(`AD ${currentYear.toFixed(1)}`, needleX, padTop - 5);

  const clim = monitorData.seasonal_climatic || {};
  hoverElements.push({
    x: needleX - 15,
    y: padTop,
    w: 30,
    h: plotHeight,
    text: `<strong>CURRENT CLIMATIC STATE (AD ${currentYear.toFixed(2)})</strong><br>Season: ${clim.season || "Summer"} | Phase: ${clim.little_ice_age_phase || "Baseline"}<br>🌾 Harvest Yield Factor: ${Math.round((clim.harvest_yield_factor || 1.0) * 100)}%<br>❄️ Winter Logistics Upkeep: ${Number(clim.winter_logistics_modifier || 1.0).toFixed(2)}x<br>Commercial Velocity: ${Number(clim.commercial_velocity || 1.0).toFixed(2)}x`,
  });
}

function drawEmptyState(msg) {
  if (!chartCtx || !chartCanvas) return;
  const { width, height } = chartCanvas;
  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "11px monospace";
  chartCtx.textAlign = "center";
  chartCtx.fillText(msg, width / 2, height / 2);
}

// -------------------------------------------------------------
// INTERACTIVE MOUSE TOOLTIPS & CLICKS
// -------------------------------------------------------------
function handleChartMouseMove(e) {
  if (!chartCanvas || hoverElements.length === 0) return;
  const rect = chartCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  let found = null;
  for (let i = hoverElements.length - 1; i >= 0; i--) {
    const el = hoverElements[i];
    if (mouseX >= el.x && mouseX <= el.x + el.w && mouseY >= el.y && mouseY <= el.y + el.h) {
      found = el;
      break;
    }
  }

  if (found) {
    chartCanvas.style.cursor = "pointer";
    showTooltip(e.clientX, e.clientY, found.text);
  } else {
    chartCanvas.style.cursor = "default";
    hideTooltip();
  }
}

function handleChartMouseLeave() {
  hideTooltip();
  if (chartCanvas) chartCanvas.style.cursor = "default";
}

function handleChartClick(e) {
  if (!chartCanvas || hoverElements.length === 0) return;
  const rect = chartCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  for (let i = hoverElements.length - 1; i >= 0; i--) {
    const el = hoverElements[i];
    if (mouseX >= el.x && mouseX <= el.x + el.w && mouseY >= el.y && mouseY <= el.y + el.h) {
      if (el.kingdom) {
        selectKingdomInScenarioTuner(el.kingdom);
      }
      break;
    }
  }
}

function selectKingdomInScenarioTuner(kingdom) {
  const kIdStr = String(kingdom.country_id);
  const tuneSelect = document.getElementById("tune-realm-id");
  const monitorFilter = document.getElementById("admin-monitor-realm-select");

  if (tuneSelect) {
    tuneSelect.value = kIdStr;
  }
  if (monitorFilter) {
    monitorFilter.value = kIdStr;
    if (typeof window.renderGameMonitorCards === "function") {
      window.renderGameMonitorCards();
    }
  }

  // Populate form with this kingdom's values
  const prideInput = document.getElementById("tune-pride");
  const delayedInput = document.getElementById("tune-delayed-costs");
  const resInput = document.getElementById("tune-resources");

  if (prideInput) prideInput.value = Math.round(kingdom.user_state?.entrepreneurial_pride ?? 100);
  if (delayedInput) delayedInput.value = kingdom.user_state?.military_delayed_costs ?? kingdom.user_state?.military_delayed_liabilities ?? 0;
  if (resInput) resInput.value = kingdom.user_state?.resources ?? 0;

  const statusEl = document.getElementById("scenario-tune-status");
  if (statusEl) {
    statusEl.textContent = `Selected ${kingdom.name || kingdom.country_name} (${kingdom.code || kingdom.country_id}) from analytics chart for inspection.`;
    statusEl.style.color = "#ffd700";
  }
}

function showTooltip(clientX, clientY, html) {
  if (!chartTooltip) return;
  chartTooltip.innerHTML = html;
  chartTooltip.classList.remove("hidden");

  const offset = 14;
  chartTooltip.style.left = `${clientX + offset}px`;
  chartTooltip.style.top = `${clientY + offset}px`;
}

function hideTooltip() {
  if (chartTooltip) {
    chartTooltip.classList.add("hidden");
  }
}

// -------------------------------------------------------------
// MACRO KPI SUMMARY BAR UPDATER
// -------------------------------------------------------------
function renderChartSummaryKPIs() {
  const bar = document.getElementById("admin-chart-summary-bar");
  if (!bar || !cachedMonitorData) return;

  const kingdoms = cachedMonitorData.kingdoms || [];
  const gState = cachedMonitorData.game_state || {};
  const macro = cachedMonitorData.global_macro_metrics || {};

  let totalGold = 0;
  let totalGDP = 0;
  let criticalInsolventCount = 0;
  let highPrideCount = 0;

  kingdoms.forEach((k) => {
    const gold = k.user_state?.resources ?? 0;
    const gdp = k.user_state?.gdp ?? 0;
    const pride = k.user_state?.entrepreneurial_pride ?? 100;
    const delayed = k.user_state?.military_delayed_costs ?? k.user_state?.military_delayed_liabilities ?? 0;
    totalGold += gold;
    totalGDP += gdp;
    if (gold <= 1000 && delayed > 5000) criticalInsolventCount++;
    if (pride >= 80) highPrideCount++;
  });

  const top1Gold = kingdoms.reduce((max, k) => Math.max(max, k.user_state?.resources ?? 0), 0);
  const top1Share = totalGold > 0 ? ((top1Gold / totalGold) * 100).toFixed(1) : 0;

  bar.innerHTML = `
    <div class="analytics-kpi-item">
      <span class="kpi-label">GLOBAL SPECIE:</span>
      <span class="kpi-val">$${Number(totalGold || macro.total_global_treasury || gState.global_treasury_gold || 0).toLocaleString()}</span>
    </div>
    <div class="analytics-kpi-item">
      <span class="kpi-label">AGGREGATE REAL GDP:</span>
      <span class="kpi-val">$${Number(totalGDP).toLocaleString()}</span>
    </div>
    <div class="analytics-kpi-item">
      <span class="kpi-label">TOP HEGEMON WEALTH SHARE:</span>
      <span class="kpi-val">${top1Share}%</span>
    </div>
    <div class="analytics-kpi-item">
      <span class="kpi-label">INSOLVENCY RISK REALMS:</span>
      <span class="kpi-val ${criticalInsolventCount > 0 ? 'kpi-warn' : 'kpi-good'}">${criticalInsolventCount} realms</span>
    </div>
    <div class="analytics-kpi-item">
      <span class="kpi-label">HIGH VITALITY EMPIRES:</span>
      <span class="kpi-val kpi-good">${highPrideCount} / ${kingdoms.length}</span>
    </div>
  `;
}

// Window bindings for inline HTML handlers
window.switchAdminChartTab = switchAdminChartTab;
window.switchAdminChartScope = switchAdminChartScope;


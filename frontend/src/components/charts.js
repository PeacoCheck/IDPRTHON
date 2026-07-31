const chartRecords = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let chartModulePromise = null;
let chartRetryUrl = "";
let chartImportAttempt = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function boundedPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function nonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

function chartPayload(element) {
  try {
    return JSON.parse(element.dataset.chartPayload || "{}");
  } catch {
    return {};
  }
}

function cssToken(style, name, fallback) {
  return style.getPropertyValue(name).trim() || fallback;
}

function chartTheme() {
  const style = getComputedStyle(document.documentElement);
  const tokens = {
    accent: cssToken(style, "--accent", "#d1490a"),
    accentDecorative: cssToken(style, "--accent-decorative", cssToken(style, "--accent", "#e8550f")),
    ready: cssToken(style, "--status-ready", "#1d7a4f"),
    warning: cssToken(style, "--status-warning", "#96540a"),
    surface: cssToken(style, "--surface", "#ffffff"),
    surfaceStrong: cssToken(style, "--surface-strong", "#eae7df"),
    text: cssToken(style, "--text", "#17191c"),
    textSoft: cssToken(style, "--text-soft", "#55585e"),
    borderStrong: cssToken(style, "--border-strong", "#c9c5ba"),
    mono: cssToken(style, "--font-mono", "monospace"),
  };
  return {
    tokens,
    signature: JSON.stringify(tokens),
  };
}

function tooltipOptions(tokens, callbacks = {}) {
  return {
    enabled: true,
    displayColors: false,
    backgroundColor: tokens.surface,
    titleColor: tokens.text,
    bodyColor: tokens.textSoft,
    borderColor: tokens.borderStrong,
    borderWidth: 1,
    cornerRadius: 3,
    padding: 10,
    titleFont: { family: tokens.mono, size: 11, weight: "600" },
    bodyFont: { family: tokens.mono, size: 11 },
    callbacks,
  };
}

function baseOptions(tokens) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion.matches ? false : { duration: 320, easing: "easeOutQuart" },
    transitions: {
      active: { animation: { duration: reducedMotion.matches ? 0 : 140 } },
      resize: { animation: { duration: 0 } },
    },
    plugins: {
      legend: { display: false },
      tooltip: tooltipOptions(tokens),
    },
  };
}

function doughnutConfig(payload, tokens) {
  const total = nonNegative(payload.total);
  const satisfied = Math.min(total, nonNegative(payload.satisfied));
  const missing = Math.max(0, total - satisfied);
  return {
    type: "doughnut",
    data: {
      labels: ["Выполнено", "Осталось"],
      datasets: [{
        data: total ? [satisfied, missing] : [0, 1],
        backgroundColor: total ? [tokens.ready, tokens.surfaceStrong] : [tokens.surfaceStrong],
        hoverBackgroundColor: total ? [tokens.accentDecorative, tokens.surfaceStrong] : [tokens.surfaceStrong],
        borderWidth: 0,
        spacing: 0,
      }],
    },
    options: {
      ...baseOptions(tokens),
      cutout: "76%",
      plugins: {
        legend: { display: false },
        tooltip: tooltipOptions(tokens, {
          label: (context) => total
            ? `${context.label}: ${context.raw} из ${total}`
            : "Требования ещё не заданы",
        }),
      },
    },
  };
}

function barScales(tokens, { horizontal = false } = {}) {
  const valueAxis = {
    beginAtZero: true,
    min: 0,
    max: 100,
    border: { display: false },
    grid: { display: false },
    ticks: {
      color: tokens.textSoft,
      font: { family: tokens.mono, size: 11 },
      padding: 6,
      callback: (value) => `${value}%`,
    },
  };
  const categoryAxis = {
    border: { display: false },
    grid: { display: false },
    ticks: {
      color: tokens.textSoft,
      font: { family: tokens.mono, size: 11 },
      padding: 6,
      autoSkip: false,
      callback(value) {
        const label = this.getLabelForValue(value);
        return label.length > 24 ? `${label.slice(0, 23)}…` : label;
      },
    },
  };
  return horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis };
}

function groupsBarConfig(payload, tokens) {
  const labels = Array.isArray(payload.labels) ? payload.labels.map(String) : [];
  const values = Array.isArray(payload.values) ? payload.values.map(boundedPercent) : [];
  const present = Array.isArray(payload.present) ? payload.present.map(nonNegative) : [];
  const totals = Array.isArray(payload.totals) ? payload.totals.map(nonNegative) : [];
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: tokens.accentDecorative,
        hoverBackgroundColor: tokens.accent,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        barThickness: 8,
      }],
    },
    options: {
      ...baseOptions(tokens),
      indexAxis: "y",
      layout: { padding: { left: 0, right: 4, top: 2, bottom: 2 } },
      scales: barScales(tokens, { horizontal: true }),
      plugins: {
        legend: { display: false },
        tooltip: tooltipOptions(tokens, {
          label: (context) => {
            const index = context.dataIndex;
            return `${present[index] || 0}/${totals[index] || 0} файлов · ${values[index] || 0}%`;
          },
        }),
      },
    },
  };
}

function objectsBarConfig(payload, tokens) {
  const labels = Array.isArray(payload.labels) ? payload.labels.map(String) : [];
  const values = Array.isArray(payload.values) ? payload.values.map(boundedPercent) : [];
  const present = Array.isArray(payload.present) ? payload.present.map(nonNegative) : [];
  const totals = Array.isArray(payload.totals) ? payload.totals.map(nonNegative) : [];
  const issues = Array.isArray(payload.issues) ? payload.issues.map(nonNegative) : [];
  const names = Array.isArray(payload.names) ? payload.names.map(String) : labels;
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map((value) => value >= 100 ? tokens.ready : value < 50 ? tokens.warning : tokens.accentDecorative),
        hoverBackgroundColor: tokens.accent,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 42,
      }],
    },
    options: {
      ...baseOptions(tokens),
      layout: { padding: { left: 4, right: 4, top: 8, bottom: 0 } },
      scales: barScales(tokens),
      plugins: {
        legend: { display: false },
        tooltip: tooltipOptions(tokens, {
          title: (items) => names[items[0]?.dataIndex] || items[0]?.label || "",
          label: (context) => {
            const index = context.dataIndex;
            return [
              `Комплектность: ${values[index] || 0}%`,
              `Файлы: ${present[index] || 0}/${totals[index] || 0}`,
              `Разрывы: ${issues[index] || 0}`,
            ];
          },
        }),
      },
    },
  };
}

function sectionsDoughnutConfig(payload, tokens) {
  const labels = Array.isArray(payload.labels) ? payload.labels.map(String) : [];
  const values = Array.isArray(payload.values) ? payload.values.map(nonNegative) : [];
  const colors = Array.isArray(payload.colors) ? payload.colors.map(String) : [];
  const completeness = Array.isArray(payload.completeness) ? payload.completeness.map(boundedPercent) : [];
  const present = Array.isArray(payload.present) ? payload.present.map(nonNegative) : [];
  const totals = Array.isArray(payload.totals) ? payload.totals.map(nonNegative) : [];

  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: colors.length ? colors : [tokens.surfaceStrong],
        hoverBackgroundColor: colors.length ? colors : [tokens.surfaceStrong],
        borderWidth: 2,
        borderColor: tokens.surface,
      }],
    },
    options: {
      ...baseOptions(tokens),
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: tooltipOptions(tokens, {
          label: (context) => {
            const index = context.dataIndex;
            if (!values.length) return "Нет документов в разделах";
            return [
              `Раздел: ${context.label}`,
              `Готовность: ${completeness[index] || 0}%`,
              `Файлы: ${present[index] || 0} из ${totals[index] || 0}`,
            ];
          },
        }),
      },
    },
  };
}

function configFor(kind, payload, tokens) {
  if (kind === "object-doughnut") return doughnutConfig(payload, tokens);
  if (kind === "groups-bar") return groupsBarConfig(payload, tokens);
  if (kind === "objects-bar") return objectsBarConfig(payload, tokens);
  if (kind === "sections-doughnut") return sectionsDoughnutConfig(payload, tokens);
  return null;
}

function updateRecord(record, payload, payloadString, theme, animate = true) {
  const config = configFor(record.kind, payload, theme.tokens);
  if (!config) return;
  record.chart.data = config.data;
  record.chart.options = config.options;
  record.payload = payloadString;
  record.themeSignature = theme.signature;
  record.chart.update(!animate || reducedMotion.matches ? "none" : undefined);
}

function destroyChart(element) {
  const record = chartRecords.get(element);
  if (!record) return;
  record.chart.destroy();
  chartRecords.delete(element);
  delete element.dataset.chartHydrated;
}

function sweepDetachedCharts() {
  chartRecords.forEach((_record, element) => {
    if (!element.isConnected) destroyChart(element);
  });
}

function chartElements(root) {
  const elements = [];
  if (root instanceof Element && root.matches("[data-chart]")) elements.push(root);
  root?.querySelectorAll?.("[data-chart]").forEach((element) => elements.push(element));
  return elements;
}

function importUrlFromError(error) {
  const match = String(error?.message || error || "").match(/https?:\/\/[^\s)]+\.js(?:\?[^\s)]*)?/i);
  if (!match) return "";
  try {
    const url = new URL(match[0], location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith(".js")) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function importChartModule() {
  if (!chartRetryUrl) return import("chart.js/auto");
  const retryUrl = `${chartRetryUrl}?retry=${++chartImportAttempt}`;
  return import(/* @vite-ignore */ retryUrl);
}

async function chartConstructor() {
  if (!chartModulePromise) {
    chartModulePromise = importChartModule()
      .then((module) => module.default)
      .catch((error) => {
        chartRetryUrl ||= importUrlFromError(error);
        chartModulePromise = null;
        throw error;
      });
  }
  return chartModulePromise;
}

export function renderChartCanvas({ id, kind, payload, className = "" }) {
  const payloadString = JSON.stringify(payload || {});
  return `<div id="${escapeHtml(id)}" class="chart-canvas${className ? ` ${escapeHtml(className)}` : ""}" data-chart="${escapeHtml(kind)}" data-chart-payload="${escapeHtml(payloadString)}" aria-hidden="true"><canvas aria-hidden="true"></canvas></div>`;
}

export async function hydrateCharts(root = document) {
  sweepDetachedCharts();
  const elements = chartElements(root);
  if (!elements.length) return;
  const Chart = await chartConstructor();
  const theme = chartTheme();
  elements.forEach((element) => {
    if (!element.isConnected) return;
    const kind = element.dataset.chart;
    const payloadString = element.dataset.chartPayload || "{}";
    const payload = chartPayload(element);
    const existing = chartRecords.get(element);
    if (existing) {
      if (existing.payload !== payloadString || existing.themeSignature !== theme.signature) {
        updateRecord(existing, payload, payloadString, theme, existing.payload !== payloadString);
      }
      return;
    }
    const canvas = element.querySelector("canvas");
    const config = configFor(kind, payload, theme.tokens);
    if (!canvas || !config) return;
    const chart = new Chart(canvas, config);
    chartRecords.set(element, {
      chart,
      kind,
      payload: payloadString,
      themeSignature: theme.signature,
    });
    element.dataset.chartHydrated = "true";
  });
}

export function beforeChartNodeMorphed(oldNode, newNode) {
  if (!(oldNode instanceof Element) || !(newNode instanceof Element)) return undefined;
  const oldIsChart = oldNode.matches("[data-chart]");
  const newIsChart = newNode.matches("[data-chart]");
  if (!oldIsChart && !newIsChart) return undefined;
  if (oldIsChart && !newIsChart) {
    destroyChart(oldNode);
    return true;
  }
  if (!oldIsChart || !newIsChart) return true;
  const record = chartRecords.get(oldNode);
  if (!record || oldNode.dataset.chartHydrated !== "true") return true;
  const nextKind = newNode.dataset.chart;
  if (record.kind !== nextKind) {
    destroyChart(oldNode);
    return true;
  }
  const payloadString = newNode.dataset.chartPayload || "{}";
  if (record.payload !== payloadString) {
    oldNode.dataset.chartPayload = payloadString;
    updateRecord(record, chartPayload(newNode), payloadString, chartTheme());
  }
  return false;
}

export function destroyChartsWithin(node) {
  if (!(node instanceof Element)) return;
  chartElements(node).forEach(destroyChart);
}

import { renderChartCanvas } from "../components/charts.js";
import { icon } from "../components/icons.js";
import { badge, button, escapeHtml, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

const SECTION_COLOR_VARS = [
  "#4f46e5",
  "#0891b2",
  "#0d9488",
  "#ca8a04",
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#db2777",
  "#475569"
];

function getSectionColor(index) {
  return SECTION_COLOR_VARS[index % SECTION_COLOR_VARS.length];
}

function percent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function count(value) {
  return Math.max(0, Number(value) || 0);
}

export function renderReportsCompletenessView(state) {
  const objects = (Array.isArray(state.objects) ? state.objects : [])
    .map((object) => {
      const documents = count(object.documents_count);
      const present = Math.min(documents, count(object.present_files ?? object.present_count ?? object.files_count ?? object.ready_count));
      return {
        ...object,
        documents,
        present,
        integrity: percent(object.integrity),
        issues: count(object.issues_count),
      };
    })
    .sort((left, right) => {
      const statusOrder = Number(left.status === "archived") - Number(right.status === "archived");
      if (statusOrder) return statusOrder;
      return String(left.code || left.short_name || "").localeCompare(
        String(right.code || right.short_name || ""),
        "ru"
      );
    });

  if (!objects.length) {
    return `<div class="view-frame reports-view" data-view="reports-completeness">
      <header class="reports-header">
        <div>
          <span class="technical-eyebrow">Сводный контроль</span>
          <h1>Комплектность объектов</h1>
        </div>
      </header>
      <div class="reports-empty">Нет доступных объектов для анализа</div>
    </div>`;
  }

  const activeId = state.selectedReportObjectId || state.app?.activeObjectId || objects[0]?.id;
  const activeObject = objects.find((o) => o.id === activeId) || objects[0];

  const report = state.completenessReport;
  const isReportLoading = state.loading || !report || report.object_id !== activeObject.id;

  const sidebarHtml = `
    <div class="reports-sidebar">
      <div class="reports-sidebar-title">Объекты в архиве</div>
      <div class="reports-sidebar-list" role="tablist" aria-label="Список объектов">
        ${objects.map((obj) => `
          <button class="reports-sidebar-item${obj.id === activeObject.id ? " is-active" : ""}" data-select-report-object="${obj.id}" type="button" role="tab" aria-selected="${obj.id === activeObject.id}">
            <span class="item-code mono">${escapeHtml(obj.code || "БЕЗ КОДА")}</span>
            <span class="item-title">${escapeHtml(obj.short_name || obj.name)}</span>
            <span class="item-meta">
              <span>Готовность: ${obj.integrity}%</span>
              <span>Разрывы: ${obj.issues}</span>
            </span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  let mainContentHtml = "";

  if (isReportLoading) {
    mainContentHtml = `
      <div class="reports-loading-box">
        ${skeleton("line", 1)}
        <div class="reports-loading-grid">
          ${skeleton("card", 1)}
          ${skeleton("row", 4)}
        </div>
      </div>
    `;
  } else {
    const donutLabels = report.sections.map((s) => s.title);
    const donutValues = report.sections.map((s) => s.total || 1);
    const donutColors = report.sections.map((_, idx) => getSectionColor(idx));
    const donutCompleteness = report.sections.map((s) => s.total ? Math.round((s.present_files / s.total) * 100) : 0);
    const donutPresent = report.sections.map((s) => s.present_files);
    const donutTotals = report.sections.map((s) => s.total);

    const donutPayload = {
      labels: donutLabels,
      values: donutValues,
      colors: donutColors,
      completeness: donutCompleteness,
      present: donutPresent,
      totals: donutTotals,
    };

    const criticalChecks = report.checks.filter((c) => ["error", "critical", "warning"].includes(c.status));

    mainContentHtml = `
      <div class="reports-main">
        <header class="reports-header">
          <div>
            <span class="technical-eyebrow">Анализ объекта</span>
            <h1>${escapeHtml(activeObject.short_name || activeObject.name)}</h1>
            <p>${escapeHtml(activeObject.address || "Адрес не указан")}</p>
          </div>
          <span class="badge badge--ready">Соответствие эталону: ${report.progress}%</span>
        </header>

        <div class="reports-dashboard-grid">
          <!-- Primary Actionable Section: Critical Gaps Checklist -->
          <section class="reports-checks-section" aria-label="Критические разрывы и проверки">
            <div class="reports-section-title">
              <strong>Неотложные проверки комплектности (${criticalChecks.length})</strong>
              <small>Позиции, требующие прикрепления файлов или официального исключения</small>
            </div>

            <div class="reports-check-list">
              ${report.checks.map((check) => {
                const isError = check.status === "error" || check.status === "critical";
                const isWarning = check.status === "warning" || check.status === "pending";
                const badgeTone = isError ? "error" : isWarning ? "warning" : "ready";
                const iconName = isError ? "alertTriangle" : isWarning ? "clock" : "checkCircle";

                return `
                  <div class="reports-check-item">
                    <div class="reports-check-status reports-check-status--${badgeTone}">${icon(iconName, 14)}</div>
                    <div class="reports-check-body">
                      <div class="reports-check-title">${escapeHtml(check.title)}</div>
                      <div class="reports-check-desc">${escapeHtml(check.description || "Обязательное требование структуры")}</div>
                      <div class="reports-check-meta mono">
                        Требуется: ${check.required} · Найдено: ${check.found} ${check.status === "waived" ? "(Принято исключение)" : ""}
                      </div>
                    </div>
                    <div class="reports-check-action">
                      <a href="#/objects/${activeObject.id}" class="button button--secondary button--sm" data-open-object="${activeObject.id}">
                        Исправить ${icon("arrowRight", 14)}
                      </a>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </section>

          <!-- Secondary Overview: Breakdown -->
          <section class="reports-sections-breakdown" aria-label="Разбивка по разделам">
            <div class="reports-section-title">
              <strong>Состав и готовность по разделам</strong>
            </div>

            <div class="reports-split-panel">
              <div class="reports-donut-panel">
                <div class="reports-donut-wrapper">
                  ${renderChartCanvas({
                    id: `chart-donut-${report.object_id}`,
                    kind: "sections-doughnut",
                    payload: donutPayload,
                    className: "ac-donut-canvas",
                  })}
                  <div class="reports-donut-center">
                    <strong>${report.progress}%</strong>
                    <small>комплектность</small>
                  </div>
                </div>
              </div>

              <div class="reports-chart-legend">
                ${report.sections.map((s, idx) => {
                  const color = donutColors[idx];
                  const pct = donutCompleteness[idx];
                  return `
                    <div class="reports-legend-item">
                      <span class="reports-legend-item-left">
                        <span class="reports-legend-color" style="background:${color}"></span>
                        <span class="reports-legend-name" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
                      </span>
                      <span class="reports-legend-val mono">${s.present_files}/${s.total} (${pct}%)</span>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  return `
    <div class="reports-layout" data-view="reports-completeness">
      ${sidebarHtml}
      <div class="reports-content-wrapper">
        <div class="reports-summary">
          <article class="reports-summary-card">
            <span class="reports-summary-card__icon text-accent">${icon("fileText", 18)}</span>
            <div>
              <strong class="tabular font-h3 text-main">${numberFormat.format(activeObject.documents)}</strong>
              <small class="text-soft font-xs">Документов в структуре</small>
            </div>
          </article>
          <article class="reports-summary-card">
            <span class="reports-summary-card__icon text-ready">${icon("checkCircle", 18)}</span>
            <div>
              <strong class="tabular font-h3 text-main">${numberFormat.format(activeObject.present)}</strong>
              <small class="text-soft font-xs">Файлов в архиве</small>
            </div>
          </article>
          <article class="reports-summary-card">
            <span class="reports-summary-card__icon text-stamp">${icon("chartNoAxesColumn", 18)}</span>
            <div>
              <strong class="tabular font-h3 text-main">${numberFormat.format(activeObject.integrity)}%</strong>
              <small class="text-soft font-xs">Соответствие эталону</small>
            </div>
          </article>
          <article class="reports-summary-card ${activeObject.issues ? "has-issues" : ""}">
            <span class="reports-summary-card__icon text-warning">${icon("alertTriangle", 18)}</span>
            <div>
              <strong class="tabular font-h3 text-main">${numberFormat.format(activeObject.issues)}</strong>
              <small class="text-soft font-xs">Незакрытые требования</small>
            </div>
          </article>
        </div>

        <div class="reports-body-container">
          ${mainContentHtml}
        </div>
      </div>
    </div>
  `;
}

import { renderChartCanvas } from "../components/charts.js";
import { icon } from "../components/icons.js";
import { button, escapeHtml, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

const SECTION_COLORS = {
  "Реестр": "#4f46e5",                          // Indigo
  "Проектная и рабочая документация": "#0891b2", // Cyan
  "Разрешительная документация": "#0d9488",      // Teal
  "Журналы": "#ca8a04",                          // Gold
  "Акты и испытания": "#e11d48",                  // Rose
  "Исполнительные схемы": "#2563eb",             // Blue
  "Материалы и паспорта": "#16a34a",             // Green
  "ППР, графики и дефектные": "#7c3aed",         // Purple
  "Фото и подтверждения": "#db2777",             // Pink
  "Архив заменённых версий": "#475569",          // Slate
  "Прочее": "#6b7280"                            // Gray
};

function getSectionColor(title, index) {
  const cleanTitle = String(title || "").trim();
  if (SECTION_COLORS[cleanTitle]) {
    return SECTION_COLORS[cleanTitle];
  }
  const fallbackColors = [
    "#2563eb", "#0d9488", "#16a34a", "#ca8a04", "#e11d48",
    "#7c3aed", "#db2777", "#0891b2", "#4f46e5", "#475569"
  ];
  return fallbackColors[index % fallbackColors.length];
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
    return `<div class="view-frame reports-view" style="padding:var(--space-6)" data-view="reports-completeness">
      <header class="reports-header">
        <div>
          <span class="technical-eyebrow">Сводный контроль</span>
          <h1>Комплектность объектов</h1>
        </div>
      </header>
      <div style="text-align:center;padding:64px;color:var(--text-soft)">Нет доступных объектов для анализа</div>
    </div>`;
  }

  // Determine active object
  const activeId = state.selectedReportObjectId || state.app?.activeObjectId || objects[0]?.id;
  const activeObject = objects.find((o) => o.id === activeId) || objects[0];

  // Check if active object's report is loading/missing
  const report = state.completenessReport;
  const isReportLoading = state.loading || !report || report.object_id !== activeObject.id;

  // Sidebar HTML
  const sidebarHtml = `
    <div class="reports-sidebar">
      <div class="reports-sidebar-title">Объекты в архиве</div>
      <div class="reports-sidebar-list">
        ${objects.map((obj) => `
          <button class="reports-sidebar-item ${obj.id === activeObject.id ? "is-active" : ""}" data-select-report-object="${obj.id}" type="button">
            <span class="item-code">${escapeHtml(obj.code || "БЕЗ КОДА")}</span>
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

  // Main area content
  let mainContentHtml = "";

  if (isReportLoading) {
    mainContentHtml = `
      <div style="padding:var(--space-4)">
        ${skeleton("line", 1)}
        <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:var(--space-4);margin-top:var(--space-4)">
          ${skeleton("card", 1)}
          ${skeleton("row", 4)}
        </div>
      </div>
    `;
  } else {
    // Round chart data preparation with unique colors per section
    const donutLabels = report.sections.map((s) => s.title);
    const donutValues = report.sections.map((s) => s.total || 1); // fallback to 1 so empty segments display
    const donutColors = report.sections.map((s, idx) => getSectionColor(s.title, idx));
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

    mainContentHtml = `
      <div class="reports-main">
        <header class="reports-header" style="padding:var(--space-4)">
          <div>
            <span class="technical-eyebrow">Анализ объекта</span>
            <h1 style="font-size:20px">${escapeHtml(activeObject.short_name || activeObject.name)}</h1>
            <p style="margin-top:4px">${escapeHtml(activeObject.address || "Адрес не указан")}</p>
          </div>
          <span class="ac-status-badge ac-status-badge--ok" style="font-size:13px;padding:6px 12px">Комплектность: ${report.progress}%</span>
        </header>

        <div class="reports-split-panel">
          <!-- Donut Panel -->
          <div class="reports-donut-panel">
            <div style="font-weight:600;font-size:13px;width:100%;text-align:left;color:var(--text-soft);margin-bottom:var(--space-2)">
              Состав и готовность по разделам
            </div>

            <div style="width:220px;height:220px;position:relative;margin:var(--space-3) 0">
              ${renderChartCanvas({
                id: `chart-donut-${report.object_id}`,
                kind: "sections-doughnut",
                payload: donutPayload,
                className: "ac-donut-canvas",
              })}
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
                <div style="font-size:28px;font-weight:700;line-height:1;color:var(--text)">${report.progress}%</div>
                <div style="font-size:10px;color:var(--text-faint);margin-top:2px">комплектность</div>
              </div>
            </div>

            <!-- Legend List -->
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
                    <span class="reports-legend-val">${s.present_files}/${s.total} файлов (${pct}%)</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Rules Checklist -->
          <div class="reports-check-list">
            <div style="font-weight:600;font-size:13px;color:var(--text-soft)">Проверки структуры комплекта</div>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2)">
              ${report.checks.map((check) => {
                let statusClass = "reports-check-status--ok";
                let statusContent = "✓";
                if (check.status === "error" || check.status === "critical") {
                  statusClass = "reports-check-status--error";
                  statusContent = `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><polygon points="12,2 22,22 2,22" fill="#d1490a" /><text x="12" y="19" font-family="sans-serif" font-size="14" font-weight="900" fill="#000000" text-anchor="middle">!</text></svg>`;
                } else if (check.status === "warning" || check.status === "pending") {
                  statusClass = "reports-check-status--warning";
                  statusContent = `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><polygon points="12,2 22,22 2,22" fill="#ca8a04" /><text x="12" y="19" font-family="sans-serif" font-size="14" font-weight="900" fill="#000000" text-anchor="middle">!</text></svg>`;
                }

                return `
                  <div class="reports-check-item">
                    <div class="reports-check-status ${statusClass}">${statusContent}</div>
                    <div class="reports-check-body">
                      <div class="reports-check-title">${escapeHtml(check.title)}</div>
                      <div class="reports-check-desc">${escapeHtml(check.description || "Обязательное требование структуры")}</div>
                      <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-faint);margin-top:4px">
                        Требуется: ${check.required} · Найдено: ${check.found} ${check.status === 'waived' ? '(Принято исключение)' : ''}
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Return the master 1-page reports layout with statistics reflecting the CURRENT SELECTED object
  return `
    <div class="reports-layout" data-view="reports-completeness">
      ${sidebarHtml}
      <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
        <!-- Summary bar (fixed top) showing details of the SELECTED object -->
        <div class="reports-summary" style="padding:var(--space-4);background:var(--surface);border-bottom:1px solid var(--border);grid-template-columns:repeat(4,1fr)">
          <article style="min-height:auto;padding:var(--space-3);flex-direction:row;align-items:center;gap:var(--space-3)">
            <span style="flex-shrink:0;color:var(--accent);background:color-mix(in srgb, var(--accent) 10%, transparent)">${icon("fileText", 18)}</span>
            <div>
              <strong class="tabular" style="font-size:20px;display:block">${numberFormat.format(activeObject.documents)}</strong>
              <small style="font-size:10px">документов в структуре</small>
            </div>
          </article>
          <article style="min-height:auto;padding:var(--space-3);flex-direction:row;align-items:center;gap:var(--space-3)">
            <span style="flex-shrink:0;color:var(--status-ready);background:color-mix(in srgb, var(--status-ready) 10%, transparent)">${icon("checkCircle", 18)}</span>
            <div>
              <strong class="tabular" style="font-size:20px;display:block">${numberFormat.format(activeObject.present)}</strong>
              <small style="font-size:10px">файлов загружено</small>
            </div>
          </article>
          <article style="min-height:auto;padding:var(--space-3);flex-direction:row;align-items:center;gap:var(--space-3)">
            <span style="flex-shrink:0;color:var(--accent);background:color-mix(in srgb, var(--accent) 10%, transparent)">${icon("chartNoAxesColumn", 18)}</span>
            <div>
              <strong class="tabular" style="font-size:20px;display:block">${numberFormat.format(activeObject.integrity)}%</strong>
              <small style="font-size:10px">комплектность объекта</small>
            </div>
          </article>
          <article class="${activeObject.issues ? "has-issues" : ""}" style="min-height:auto;padding:var(--space-3);flex-direction:row;align-items:center;gap:var(--space-3)">
            <span style="flex-shrink:0">${icon("alertTriangle", 18)}</span>
            <div>
              <strong class="tabular" style="font-size:20px;display:block">${numberFormat.format(activeObject.issues)}</strong>
              <small style="font-size:10px">разрывов структуры</small>
            </div>
          </article>
        </div>

        <!-- Main Panel wrapper -->
        <div style="flex:1;overflow-y:auto;background:var(--surface-alt)">
          ${mainContentHtml}
        </div>
      </div>
    </div>
  `;
}

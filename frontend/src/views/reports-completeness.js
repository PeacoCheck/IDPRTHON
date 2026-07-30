import { renderChartCanvas } from "../components/charts.js";
import { icon } from "../components/icons.js";
import { button, emptyState, escapeHtml, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

function percent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function count(value) {
  return Math.max(0, Number(value) || 0);
}

function reportObjects(state) {
  return (Array.isArray(state.objects) ? state.objects : [])
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
      return String(left.code || left.short_name || left.name || "").localeCompare(
        String(right.code || right.short_name || right.name || ""),
        "ru",
        { sensitivity: "base" },
      );
    });
}

function renderReportRow(object) {
  const title = object.short_name || object.name || "Объект без названия";
  return `<button class="report-object-row" type="button" data-open-object="${escapeHtml(object.id)}" aria-label="Открыть объект ${escapeHtml(title)}: комплектность ${object.integrity}%, файлов ${object.present} из ${object.documents}, разрывов ${object.issues}">
    <span class="report-object-row__identity"><span class="mono">${escapeHtml(object.code || "Без кода")}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(object.address || "Адрес не указан")}</small></span>
    <span class="report-object-row__value"><strong class="tabular">${numberFormat.format(object.integrity)}%</strong><small>${numberFormat.format(object.present)}/${numberFormat.format(object.documents)} файлов</small></span>
    <span class="report-object-row__issues${object.issues ? " has-issues" : ""}"><strong class="tabular">${numberFormat.format(object.issues)}</strong><small>разрывов</small></span>
    <span class="report-object-row__open" aria-hidden="true">${icon("chevronRight", 17)}</span>
  </button>`;
}

export function renderReportsCompletenessView(state) {
  if (state.loading && !state.objects?.length) {
    return `<section class="view-frame reports-view" data-view="reports-completeness">${skeleton("line", 2)}${skeleton("card", 3)}${skeleton("row", 6)}</section>`;
  }

  const objects = reportObjects(state);
  if (!objects.length) {
    return `<section class="view-frame reports-view" data-view="reports-completeness">
      <header class="reports-header"><div><span class="technical-eyebrow">Сводный контроль</span><h1>Комплектность объектов</h1><p>Сравнение фактического архива с эталонной структурой.</p></div></header>
      ${emptyState({
        iconName: "chartNoAxesColumn",
        title: "Для отчёта пока нет объектов",
        description: "Добавьте объект и документы — диаграмма соберётся автоматически.",
        action: button({ label: "К объектам", action: "go-objects", iconName: "arrowLeft", variant: "secondary" }),
      })}
    </section>`;
  }

  const average = Math.round(objects.reduce((sum, object) => sum + object.integrity, 0) / objects.length);
  const fullyReady = objects.filter((object) => object.integrity >= 100).length;
  const issues = objects.reduce((sum, object) => sum + object.issues, 0);
  const payload = {
    labels: objects.map((object) => object.code || object.short_name || `ID-${object.id}`),
    names: objects.map((object) => object.short_name || object.name || "Объект без названия"),
    values: objects.map((object) => object.integrity),
    present: objects.map((object) => object.present),
    totals: objects.map((object) => object.documents),
    issues: objects.map((object) => object.issues),
  };

  return `<section class="view-frame reports-view" data-view="reports-completeness">
    <header class="reports-header">
      <div><span class="technical-eyebrow">Сводный контроль</span><h1>Комплектность объектов</h1><p>Сравнение фактического архива с эталонной структурой по каждому объекту.</p></div>
      ${button({ label: "Открыть объекты", action: "go-objects", iconName: "objects", variant: "secondary" })}
    </header>
    <div class="reports-summary" aria-label="Сводка комплектности">
      <article><span>${icon("objects", 18)}</span><strong class="tabular">${numberFormat.format(objects.length)}</strong><small>объектов в отчёте</small></article>
      <article><span>${icon("chartNoAxesColumn", 18)}</span><strong class="tabular">${numberFormat.format(average)}%</strong><small>средняя комплектность</small></article>
      <article><span>${icon("checkCircle", 18)}</span><strong class="tabular">${numberFormat.format(fullyReady)}</strong><small>полностью собрано</small></article>
      <article class="${issues ? "has-issues" : ""}"><span>${icon("alertTriangle", 18)}</span><strong class="tabular">${numberFormat.format(issues)}</strong><small>разрывов структуры</small></article>
    </div>
    <section class="reports-chart-panel" aria-labelledby="reportsChartTitle">
      <header><div><span class="technical-eyebrow">Диаграмма</span><h2 id="reportsChartTitle">Готовность по объектам</h2></div><span class="reports-chart-panel__hint">Наведите на столбец для подробностей</span></header>
      ${renderChartCanvas({
        id: "chart-report-objects",
        kind: "objects-bar",
        payload,
        className: "reports-chart",
      })}
    </section>
    <section class="reports-list-panel" aria-labelledby="reportsListTitle">
      <header><div><span class="technical-eyebrow">Доступная расшифровка</span><h2 id="reportsListTitle">Все объекты</h2></div><span>${numberFormat.format(objects.length)}</span></header>
      <div class="report-object-list">${objects.map(renderReportRow).join("")}</div>
    </section>
  </section>`;
}

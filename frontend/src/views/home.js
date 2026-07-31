import { icon } from "../components/icons.js";
import { badge, button, escapeHtml } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

export function renderHomeView(state) {
  const objects = Array.isArray(state.objects) ? state.objects : [];
  const activeObjects = objects.filter((o) => o.status !== "archived");

  const currentObjId = Number(state.app?.activeObjectId || state.workspace?.object?.id || activeObjects[0]?.id || 0);
  const currentObj = objects.find((o) => Number(o.id) === currentObjId) || activeObjects[0] || null;

  let currentObjHtml = "";
  if (currentObj) {
    const docs = Math.max(0, Number(currentObj.documents_count) || 0);
    const present = Math.min(docs, Math.max(0, Number(currentObj.present_files ?? currentObj.present_count ?? currentObj.files_count ?? currentObj.ready_count) || 0));
    const integrity = Math.min(100, Math.max(0, Number(currentObj.integrity) || 0));
    const title = currentObj.short_name || currentObj.name || "Объект";

    currentObjHtml = `
      <div class="home-current-card" style="background:var(--surface); border:1px solid var(--border-strong); border-radius:var(--radius-lg); padding:24px; display:flex; align-items:center; justify-content:space-between; gap:24px; flex-wrap:wrap; margin-bottom:24px; box-shadow:var(--shadow-sm);">
        <div style="display:flex; align-items:center; gap:16px; min-width:280px;">
          <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${icon("building", 24)}
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px;">
              <span class="mono" style="font-size:13px; font-weight:600; color:var(--text-soft); line-height:1.2;">${escapeHtml(currentObj.code || "Без кода")}</span>
              ${badge({ label: "Текущий объект", tone: "primary" })}
            </div>
            <h2 style="font-size:18px; font-weight:600; margin:2px 0 0 0; color:var(--text); line-height:1.3;">${escapeHtml(title)}</h2>
            <small style="color:var(--text-soft); font-size:12px;">${escapeHtml(currentObj.address || "Адрес не указан")}</small>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:32px; flex-wrap:wrap;">
          <div>
            <span style="font-size:11px; color:var(--text-soft); display:block;">Готовность комплекта</span>
            <strong class="tabular" style="font-size:20px; font-weight:700; color:var(--text);">${integrity}%</strong>
          </div>
          <div>
            <span style="font-size:11px; color:var(--text-soft); display:block;">Файлов на месте</span>
            <strong class="tabular" style="font-size:20px; font-weight:700; color:var(--text);">${numberFormat.format(present)} / ${numberFormat.format(docs)}</strong>
          </div>
          <button type="button" class="button button--primary" data-open-object="${escapeHtml(currentObj.id)}">
            ${icon("folderOpen", 16)} <span class="button__label">Открыть документы</span>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <section class="view-frame home-view" style="max-width:1280px; margin:0 auto; padding:24px; display:flex; flex-direction:column; gap:24px;" data-view="home">
      <header class="objects-header">
        <div>
          <span class="technical-eyebrow">ID Vault</span>
          <h1>ID Vault</h1>
          <p>Главный пульт управления техническим архивом и скиллами AutoCAD.</p>
        </div>
        ${button({ label: "Добавить объект", action: "new-object", iconName: "plus", variant: "primary" })}
      </header>

      ${currentObjHtml}

      <!-- Main Navigation Hub Cards -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:20px;">
        <!-- Card 1: Objects -->
        <a href="#/objects" class="home-nav-card" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:16px; text-decoration:none; color:inherit; transition:border-color 0.15s, transform 0.15s, box-shadow 0.15s;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">
            <div class="home-nav-card__icon" style="background:var(--accent-soft); color:var(--accent); width:44px; height:44px; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${icon("building", 22)}
            </div>
            <span style="font-size:12px; font-weight:600; color:var(--text-soft); white-space:nowrap;" class="tabular">${activeObjects.length} объектов</span>
          </div>
          <div>
            <strong style="font-size:16px; font-weight:600; color:var(--text); display:block; margin-bottom:4px;">Реестр объектов</strong>
            <small style="color:var(--text-soft); font-size:13px; line-height:1.4; display:block;">Просмотр всех объектов, файлов, групп и подготовка документации.</small>
          </div>
          <span style="font-size:13px; font-weight:600; color:var(--accent); margin-top:auto; display:flex; align-items:center; gap:6px;">
            Перейти к объектам ${icon("arrowRight", 14)}
          </span>
        </a>

        <!-- Card 2: Reports -->
        <a href="#/reports/completeness" class="home-nav-card" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:16px; text-decoration:none; color:inherit; transition:border-color 0.15s, transform 0.15s, box-shadow 0.15s;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">
            <div class="home-nav-card__icon" style="background:var(--stamp-soft); color:var(--stamp); width:44px; height:44px; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${icon("chartNoAxesColumn", 22)}
            </div>
            <span style="font-size:12px; font-weight:600; color:var(--text-soft); white-space:nowrap;">10 разделов</span>
          </div>
          <div>
            <strong style="font-size:16px; font-weight:600; color:var(--text); display:block; margin-bottom:4px;">Отчёт о комплектности</strong>
            <small style="color:var(--text-soft); font-size:13px; line-height:1.4; display:block;">Анализ заполнения разделов, круглые диаграммы готовности и проверка разрывов.</small>
          </div>
          <span style="font-size:13px; font-weight:600; color:var(--stamp); margin-top:auto; display:flex; align-items:center; gap:6px;">
            Открыть отчёт ${icon("arrowRight", 14)}
          </span>
        </a>

        <!-- Card 3: AutoCAD -->
        <a href="#/autocad" class="home-nav-card" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:16px; text-decoration:none; color:inherit; transition:border-color 0.15s, transform 0.15s, box-shadow 0.15s;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">
            <div class="home-nav-card__icon" style="background:var(--primary-soft); color:var(--primary); width:44px; height:44px; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${icon("autocad", 22)}
            </div>
            <span style="font-size:12px; font-weight:600; color:var(--text-soft); white-space:nowrap;">AutoLISP</span>
          </div>
          <div>
            <strong style="font-size:16px; font-weight:600; color:var(--text); display:block; margin-bottom:4px;">Скиллы AutoCAD</strong>
            <small style="color:var(--text-soft); font-size:13px; line-height:1.4; display:block;">Высотные отметки, суммирование полилиний, штампы и пакетный экспорт в PDF.</small>
          </div>
          <span style="font-size:13px; font-weight:600; color:var(--primary); margin-top:auto; display:flex; align-items:center; gap:6px;">
            Запустить скиллы ${icon("arrowRight", 14)}
          </span>
        </a>

        <!-- Card 4: Diagnostics -->
        <button type="button" data-action="open-diagnostics" class="home-nav-card" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:16px; text-align:left; cursor:pointer; color:inherit; transition:border-color 0.15s, transform 0.15s, box-shadow 0.15s;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">
            <div class="home-nav-card__icon" style="background:var(--status-ready-soft); color:var(--status-ready); width:44px; height:44px; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${icon("server", 22)}
            </div>
            <span class="badge badge--ready" style="white-space:nowrap;">В норме</span>
          </div>
          <div>
            <strong style="font-size:16px; font-weight:600; color:var(--text); display:block; margin-bottom:4px;">Диагностика систем</strong>
            <small style="color:var(--text-soft); font-size:13px; line-height:1.4; display:block;">Проверка подключения к AutoCAD, COM-портов, процессов и базы данных.</small>
          </div>
          <span style="font-size:13px; font-weight:600; color:var(--status-ready); margin-top:auto; display:flex; align-items:center; gap:6px;">
            Проверить статус ${icon("arrowRight", 14)}
          </span>
        </button>
      </div>

      <!-- Quick Objects Selector Table/Grid -->
      <div style="margin-top:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div>
            <h2 style="font-size:18px; font-weight:600; margin:0; color:var(--text);">Выбор объекта</h2>
            <small style="color:var(--text-soft); font-size:12px;">Быстрый выбор объекта для начала работы</small>
          </div>
          <a href="#/objects" class="button button--secondary button--sm">
            ${icon("building", 14)} <span class="button__label">Все объекты (${objects.length})</span>
          </a>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${activeObjects.slice(0, 6).map((obj) => `
            <div class="home-object-item" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; display:flex; flex-direction:column; gap:12px; cursor:pointer; transition:border-color 0.15s, transform 0.15s;" data-open-object="${escapeHtml(obj.id)}">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span class="mono" style="font-size:12px; font-weight:600; color:var(--text-soft);">${escapeHtml(obj.code || "Без кода")}</span>
                <span style="font-size:12px; font-weight:600; color:var(--status-ready);" class="tabular">Готовность ${Math.min(100, Math.max(0, Number(obj.integrity) || 0))}%</span>
              </div>
              <strong style="font-size:15px; color:var(--text); line-height:1.3;">${escapeHtml(obj.short_name || obj.name)}</strong>
              <small style="color:var(--text-soft); font-size:12px;">${escapeHtml(obj.address || "Адрес не указан")}</small>
              <div style="margin-top:auto; padding-top:8px; border-top:1px dashed var(--border); display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--text-soft);">
                <span>Файлов: <strong class="tabular">${obj.documents_count || 0}</strong></span>
                <span style="color:var(--accent); font-weight:600; display:flex; align-items:center; gap:4px;">Открыть ${icon("chevronRight", 14)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

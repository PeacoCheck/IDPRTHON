import { icon } from "../components/icons.js";
import { badge, button, emptyState, escapeHtml, modal, skeleton } from "../components/ui.js";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DOC_TYPE_LABELS = {
  aosr: "АОСР",
  appointment_order: "Приказы",
  certificate: "Сертификаты",
  defect_statement: "Дефектные ведомости",
  dismantling_act: "Акты демонтажа",
  equipment_acceptance: "Приёмка оборудования",
  executive_scheme: "Исполнительные схемы",
  general_journal: "Общие журналы",
  hydro: "Гидравлические испытания",
  incoming_control: "Входной контроль",
  incoming_journal: "Журналы входного контроля",
  installation_act: "Акты монтажа",
  method_statement: "Технологические карты",
  passport: "Паспорта",
  ppr: "ППР",
  project: "Проектная документация",
  registry: "Реестры",
  repair_readiness: "Готовность к ремонту",
  vik: "ВИК",
  welding_journal: "Сварочные журналы",
  working_documentation: "Рабочая документация",
};

const BUILTIN_MAPPINGS = [
  ["document.number", "Документ — номер"],
  ["document.date", "Документ — дата"],
  ["document.title", "Документ — наименование"],
  ["document.work_title", "Документ — выполненные работы"],
  ["object.code", "Объект — код"],
  ["object.name", "Объект — полное наименование"],
  ["object.address", "Объект — адрес"],
  ["object.meta.work_kind", "Объект — вид работ"],
  ["object.meta.construction_permit", "Объект — разрешение на строительство"],
  ["object.meta.project_documentation", "Объект — рабочая документация"],
  ["object.meta.project_expertise", "Объект — экспертиза проекта"],
  ["object.meta.start_date", "Объект — дата начала"],
  ["object.meta.end_date", "Объект — дата окончания"],
  ["customer.name", "Заказчик — организация"],
  ["contractor.name", "Подрядчик — организация"],
  ["object.meta.designer.name", "Проектировщик — организация"],
  ["object.meta.technical_customer.name", "Технический заказчик — организация"],
  ["responsible.fio", "Ответственный — ФИО"],
  ["object.meta.responsible_person.position", "Ответственный — должность"],
  ["object.meta.responsible_person.order", "Ответственный — приказ"],
];

const MARKER_ALIASES = {
  construction_type: "object.meta.work_kind",
  journal_date: "document.date",
  journal_number: "document.number",
  object_address: "object.address",
  object_name: "object.name",
  podryad: "contractor.name",
  zakaz: "customer.name",
};

function templatesFrom(state) {
  return Array.isArray(state.templates) ? state.templates : [];
}

function normalizedQuery(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function docTypeLabel(value) {
  const type = String(value || "other");
  if (DOC_TYPE_LABELS[type]) return DOC_TYPE_LABELS[type];
  return "Другие документы";
}

function formatTemplateDate(template) {
  const value = template?.updated_at || template?.created_at;
  if (!value) return "Дата не указана";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата не указана" : dateFormat.format(date);
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function plural(value, one, few, many) {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (last === 1) return one;
  if (last > 1 && last < 5) return few;
  return many;
}

function isBusy(state, ...actions) {
  const busy = String(state.busyAction || "");
  return actions.some((action) => busy === action || busy.startsWith(`${action}:`) || busy.startsWith(`${action}-`));
}

function templateStatusBadges(template) {
  const active = template?.is_active !== false;
  return `<span class="template-card__badges">
    ${badge({
      label: active ? "Активен" : "Неактивен",
      tone: active ? "ready" : "neutral",
      iconName: active ? "checkCircle" : "circle",
    })}
    ${template?.is_default ? badge({ label: "Основной", tone: "primary", iconName: "check" }) : ""}
  </span>`;
}

function templateMatches(template, query, category) {
  if (category !== "all" && String(template.doc_type || "other") !== category) return false;
  if (!query) return true;
  const fields = Array.isArray(template.fields_json) ? template.fields_json : [];
  return [
    template.title,
    template.doc_type,
    docTypeLabel(template.doc_type),
    ...fields.flatMap((field) => [field?.key, field?.label]),
  ].some((value) => String(value || "").toLocaleLowerCase("ru-RU").includes(query));
}

function renderTemplateCard(template) {
  const fields = Array.isArray(template.fields_json) ? template.fields_json : [];
  const requiredCount = fields.filter((field) => field?.required).length;
  const templateId = escapeHtml(template.id);
  const title = template.title || "Шаблон без названия";
  const fileConnected = Boolean(template.template_file);

  return `<article class="template-card" data-template-card="${templateId}">
    <div class="template-docx-preview" aria-label="Предпросмотр DOCX-шаблона">
      <span class="template-docx-preview__file">${icon("fileText", 24)}<strong>DOCX</strong></span>
      <span class="template-docx-preview__state">${icon(fileConnected ? "checkCircle" : "alertCircle", 14)}${escapeHtml(fileConnected ? "Файл подключён" : "Файл не загружен")}</span>
    </div>
    <div class="template-card__body">
      ${templateStatusBadges(template)}
      <div class="template-card__identity">
        <h2>${escapeHtml(title)}</h2>
        <span class="template-card__type">${escapeHtml(docTypeLabel(template.doc_type))}</span>
      </div>
      <dl class="template-card__facts">
        <div><dt>Версия</dt><dd class="mono">v${escapeHtml(numeric(template.version, 1))}</dd></div>
        <div><dt>Обновлён</dt><dd><time>${escapeHtml(formatTemplateDate(template))}</time></dd></div>
        <div><dt>Поля</dt><dd class="tabular">${escapeHtml(fields.length)}</dd></div>
        <div><dt>Обязательные</dt><dd class="tabular">${escapeHtml(requiredCount)}</dd></div>
      </dl>
    </div>
    <footer class="template-card__footer">
      <span>${escapeHtml(fileConnected ? "Готов к сопоставлению маркеров" : "Требуется файл Word")}</span>
      ${button({
        label: "Подробнее",
        action: "template-details",
        iconName: "chevronRight",
        variant: "secondary",
        size: "sm",
        attributes: `data-template-id="${templateId}"`,
      })}
    </footer>
  </article>`;
}

function renderTemplatesContent(state, templates, visibleTemplates, query, category) {
  if (state.loading) {
    return `<div class="templates-grid templates-grid--skeleton">${skeleton("card", 6)}</div>`;
  }

  if (state.error && !templates.length) {
    return `<div class="templates-feedback templates-feedback--error">${emptyState({
      iconName: "alertCircle",
      title: "Не удалось загрузить шаблоны",
      description: state.error,
      action: button({ label: "Повторить", action: "retry-templates", iconName: "refresh", variant: "secondary" }),
    })}</div>`;
  }

  if (!templates.length) {
    return `<div class="templates-feedback">${emptyState({
      iconName: "fileText",
      title: "Шаблонов пока нет",
      description: "Добавьте DOCX к существующей форме, чтобы использовать её для документов объекта.",
      action: button({ label: "Загрузить DOCX", action: "upload-template", iconName: "upload", variant: "secondary" }),
    })}</div>`;
  }

  if (!visibleTemplates.length) {
    const filtered = category !== "all" || Boolean(query);
    return `<div class="templates-feedback">${emptyState({
      iconName: "search",
      title: "Шаблоны не найдены",
      description: filtered
        ? "Измените запрос или сбросьте выбранную категорию."
        : "Для этого раздела пока нет доступных шаблонов.",
      action: button({ label: "Сбросить фильтры", action: "clear-template-filters", variant: "secondary" }),
    })}</div>`;
  }

  return `<div class="templates-grid">${visibleTemplates.map(renderTemplateCard).join("")}</div>`;
}

export function renderTemplatesView(state) {
  const templates = templatesFrom(state);
  const templateState = { ...state, error: state.templateError || null };
  const query = normalizedQuery(state.templateQuery);
  const categories = [...new Set(templates.map((template) => String(template.doc_type || "other")))]
    .sort((left, right) => docTypeLabel(left).localeCompare(docTypeLabel(right), "ru"));
  const requestedCategory = String(state.templateCategory || "all");
  const category = categories.includes(requestedCategory) ? requestedCategory : "all";
  const visibleTemplates = templates.filter((template) => templateMatches(template, query, category));
  const uploading = isBusy(state, "upload-template", "upload-template-file");

  return `<section class="view-frame templates-view" data-view="templates">
    <header class="templates-header">
      <div>
        <h1>Шаблоны документов</h1>
        <p>DOCX-формы и их связь с данными исполнительной документации.</p>
      </div>
      ${button({
        label: "Загрузить DOCX",
        action: "upload-template",
        iconName: "upload",
        variant: "primary",
        disabled: uploading,
        attributes: `aria-busy="${uploading}"`,
      })}
    </header>

    <div class="templates-toolbar">
      <label class="templates-search" for="templateSearch">
        <span class="sr-only">Найти шаблон</span>
        ${icon("search", 16)}
        <input id="templateSearch" class="control" type="search" value="${escapeHtml(state.templateQuery || "")}" placeholder="Название, тип или поле" autocomplete="off">
      </label>
      <div class="templates-categories" role="tablist" aria-label="Тип документа">
        <button class="templates-category${category === "all" ? " is-active" : ""}" type="button" role="tab" aria-selected="${category === "all"}" data-action="filter-templates" data-template-category="all">Все <span class="tabular">${escapeHtml(templates.length)}</span></button>
        ${categories.map((docType) => {
          const count = templates.filter((template) => String(template.doc_type || "other") === docType).length;
          return `<button class="templates-category${category === docType ? " is-active" : ""}" type="button" role="tab" aria-selected="${category === docType}" data-action="filter-templates" data-template-category="${escapeHtml(docType)}">${escapeHtml(docTypeLabel(docType))} <span class="tabular">${escapeHtml(count)}</span></button>`;
        }).join("")}
      </div>
      <span class="templates-result-count" aria-live="polite">${state.loading ? "Загрузка" : `${escapeHtml(visibleTemplates.length)} из ${escapeHtml(templates.length)}`}</span>
    </div>

    ${templateState.error && templates.length ? `<div class="templates-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(templateState.error)}</span>${button({ label: "Повторить", action: "retry-templates", variant: "secondary", size: "sm" })}</div>` : ""}
    ${renderTemplatesContent(templateState, templates, visibleTemplates, query, category)}
  </section>`;
}

function renderUploadModal(state) {
  const templates = templatesFrom(state);
  const selectedId = String(state.modalData?.templateId ?? state.templateDetails?.template?.id ?? "");
  const uploading = isBusy(state, "upload-template", "upload-template-file");
  const hasTemplates = templates.length > 0;
  const fileName = state.modalData?.fileName || "Файл не выбран";
  const formError = state.modalData?.error || "";

  const body = `<form id="uploadTemplateForm" class="template-upload-form">
    ${formError ? `<div class="template-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(formError)}</span></div>` : ""}
    <label class="field">
      <span class="field__label">Форма документа</span>
      <select class="select" name="template_id" required autofocus${hasTemplates ? "" : " disabled"}>
        <option value="">Выберите существующий шаблон</option>
        ${templates.map((template) => `<option value="${escapeHtml(template.id)}"${String(template.id) === selectedId ? " selected" : ""}>${escapeHtml(template.title || "Шаблон без названия")} · ${escapeHtml(docTypeLabel(template.doc_type))}</option>`).join("")}
      </select>
      <span class="field__helper">Файл привязывается к выбранной форме документа</span>
    </label>

    <div class="template-replace-note" role="note">
      ${icon("alertTriangle", 18)}
      <span><strong>Файл заменит текущий DOCX выбранного шаблона.</strong><small>Версия формы увеличится, после загрузки откроется сопоставление маркеров.</small></span>
    </div>

    <label class="template-dropzone" for="templateFile">
      <span class="template-dropzone__icon">${icon("upload", 24)}</span>
      <span class="template-dropzone__copy"><strong>Выберите файл Word</strong><small>Только DOCX, до 25 МБ</small></span>
      <input id="templateFile" class="template-file-control" name="file" type="file" accept=".docx" required aria-describedby="templateFileHelp">
      <span id="templateFileHelp" class="template-dropzone__filename">${escapeHtml(fileName)}</span>
    </label>
  </form>`;

  return modal({
    title: "Загрузить DOCX",
    description: "Подключите файл Word к существующей форме документа.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: uploading })}${button({
      label: "Загрузить и проверить",
      iconName: "upload",
      variant: "primary",
      type: "submit",
      disabled: uploading || !hasTemplates,
      attributes: `form="uploadTemplateForm" aria-busy="${uploading}"`,
    })}`,
    size: "md",
    labelledBy: "uploadTemplateModalTitle",
  });
}

function markerMappingLabel(mapping) {
  if (typeof mapping === "string") return mapping || "Не сопоставлен";
  if (!mapping || typeof mapping !== "object") return "Не сопоставлен";
  if (mapping.field || mapping.source) return String(mapping.field || mapping.source);
  if (Object.hasOwn(mapping, "value")) return "Фиксированное значение";
  return "Не сопоставлен";
}

function humanizeLocation(value) {
  const location = String(value || "");
  const parts = [];
  if (/header/i.test(location)) parts.push("Верхний колонтитул");
  else if (/footer/i.test(location)) parts.push("Нижний колонтитул");
  else if (/table/i.test(location)) parts.push(`Таблица ${numeric(location.match(/table\[(\d+)\]/i)?.[1]) + 1}`);
  else parts.push("Текст документа");

  const cell = location.match(/cell\[(\d+)\s*,\s*(\d+)\]/i);
  if (cell) parts.push(`строка ${numeric(cell[1]) + 1}, столбец ${numeric(cell[2]) + 1}`);
  const paragraphMatches = [...location.matchAll(/paragraph\[(\d+)\]/gi)];
  const paragraph = paragraphMatches.at(-1)?.[1];
  if (paragraph !== undefined) parts.push(`абзац ${numeric(paragraph) + 1}`);
  return parts.join(" · ");
}

function renderMarkerLocations(marker) {
  const locations = Array.isArray(marker?.locations) ? marker.locations : [];
  if (!locations.length) return "Расположение не определено";
  const shown = locations.slice(0, 3).map(humanizeLocation);
  if (locations.length > shown.length) shown.push(`ещё ${locations.length - shown.length}`);
  return shown.join("; ");
}

function renderDetailsBody(state) {
  const details = state.templateDetails;
  if (!details || details.loading) return `<div class="template-details-loading">${skeleton("row", 5)}</div>`;
  if (details.error) {
    return `<div class="template-modal-feedback template-modal-feedback--error">${emptyState({
      iconName: "alertCircle",
      title: "Не удалось открыть шаблон",
      description: details.error,
      action: button({
        label: "Повторить",
        action: "retry-template-details",
        iconName: "refresh",
        variant: "secondary",
        attributes: details.template?.id ? `data-template-id="${escapeHtml(details.template.id)}"` : "",
      }),
    })}</div>`;
  }

  const template = details.template || {};
  const markers = Array.isArray(details.markers) ? details.markers : [];
  const fields = Array.isArray(template.fields_json) ? template.fields_json : [];
  return `<div class="template-details">
    <section class="template-details__summary" aria-label="Сводка шаблона">
      <div class="template-details__title">
        <span class="template-details__icon">${icon("fileText", 20)}</span>
        <span><strong>${escapeHtml(template.title || "Шаблон без названия")}</strong><small>${escapeHtml(docTypeLabel(template.doc_type))}</small></span>
      </div>
      ${templateStatusBadges(template)}
      <dl>
        <div><dt>Версия</dt><dd class="mono">v${escapeHtml(numeric(template.version, 1))}</dd></div>
        <div><dt>Обновлён</dt><dd><time>${escapeHtml(formatTemplateDate(template))}</time></dd></div>
        <div><dt>Полей формы</dt><dd class="tabular">${escapeHtml(fields.length)}</dd></div>
        <div><dt>Маркеров DOCX</dt><dd class="tabular">${escapeHtml(markers.length)}</dd></div>
      </dl>
    </section>
    <section class="template-marker-section">
      <header><div><h3>Маркеры DOCX</h3><p>Где используются значения формы внутри документа.</p></div><span class="tabular">${escapeHtml(markers.length)}</span></header>
      ${markers.length ? `<div class="template-marker-list">${markers.map((marker) => {
        const occurrences = Math.max(0, numeric(marker.occurrences));
        return `<article class="template-marker-item">
          <div><code>${escapeHtml(marker.name || "Без имени")}</code><span>${escapeHtml(occurrences)} ${escapeHtml(plural(occurrences, "вхождение", "вхождения", "вхождений"))}</span></div>
          <p>${escapeHtml(renderMarkerLocations(marker))}</p>
          <span class="template-marker-item__mapping">${icon(marker.mapping ? "checkCircle" : "alertCircle", 14)}${escapeHtml(markerMappingLabel(marker.mapping))}</span>
        </article>`;
      }).join("")}</div>` : `<div class="template-marker-empty">${icon("info", 20)}<span><strong>Маркеры не найдены</strong><small>В DOCX нет конструкций для автоматической подстановки.</small></span></div>`}
    </section>
  </div>`;
}

function renderDetailsModal(state) {
  const loading = !state.templateDetails || state.templateDetails.loading;
  return modal({
    title: "Карточка шаблона",
    description: loading ? "Получаю сведения о форме и маркерах." : "Версия, поля и сопоставления DOCX.",
    body: renderDetailsBody(state),
    footer: button({ label: "Закрыть", action: "close-modal", variant: "secondary" }),
    size: "lg",
    labelledBy: "templateDetailsModalTitle",
  });
}

function currentMarkerMapping(marker, markerMap) {
  const mapping = markerMap?.[marker?.name] ?? marker?.mapping;
  if (typeof mapping === "string") return mapping;
  if (mapping && typeof mapping === "object") return String(mapping.field || mapping.source || "");
  return "";
}

function mappingOptions(state, wizard, currentValue = "") {
  const options = new Map(BUILTIN_MAPPINGS);
  const templates = [...templatesFrom(state), wizard?.template].filter(Boolean);
  templates.forEach((template) => {
    const fields = Array.isArray(template.fields_json) ? template.fields_json : [];
    fields.forEach((field) => {
      const key = String(field?.key || "").trim();
      const source = String(field?.source || "").trim();
      const label = String(field?.label || key || source || "Поле документа");
      if (key) options.set(key, `${label} — поле документа`);
      if (source && !["manual", "default"].includes(source)) options.set(source, `${label} — данные объекта`);
    });
  });
  if (currentValue && !options.has(currentValue)) options.set(currentValue, `Текущее сопоставление — ${currentValue}`);
  return options;
}

function inferredMarkerMapping(marker, markerMap, options) {
  const configured = currentMarkerMapping(marker, markerMap);
  if (configured) return configured;
  const name = String(marker?.name || "");
  const alias = MARKER_ALIASES[name.toLocaleLowerCase("ru-RU")];
  if (alias && options.has(alias)) return alias;
  return [...options.keys()].find((value) => value.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU")) || "";
}

function renderMarkerMapRow(state, wizard, marker, markerMap, index) {
  const initialOptions = mappingOptions(state, wizard, currentMarkerMapping(marker, markerMap));
  const selected = inferredMarkerMapping(marker, markerMap, initialOptions);
  const options = mappingOptions(state, wizard, selected);
  const occurrences = Math.max(0, numeric(marker.occurrences));
  const markerName = escapeHtml(marker.name || "");
  const selectId = `markerMapping-${index}`;

  return `<div class="marker-map-row" data-marker-name="${markerName}">
    <div class="marker-map-row__marker">
      <code>${escapeHtml(marker.name || "Без имени")}</code>
      <span>${escapeHtml(occurrences)} ${escapeHtml(plural(occurrences, "вхождение", "вхождения", "вхождений"))}</span>
      <small>${escapeHtml(renderMarkerLocations(marker))}</small>
    </div>
    <label class="field" for="${selectId}">
      <span class="field__label">Источник значения</span>
      <select id="${selectId}" class="select" name="mapping" data-marker-name="${markerName}"${index === 0 ? " autofocus" : ""}>
        <option value="">Не сопоставлять</option>
        ${[...options.entries()].map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
      </select>
      <span class="field__helper">Значение подставится при формировании документа</span>
    </label>
  </div>`;
}

function renderMarkerMapModal(state) {
  const wizard = state.templateWizard || {};
  const markers = Array.isArray(wizard.markers) ? wizard.markers : [];
  const rawMap = wizard.marker_map?.markers || wizard.marker_map;
  const markerMap = rawMap && typeof rawMap === "object" ? rawMap : {};
  const saving = isBusy(state, "save-marker-map", "bind-template");
  const wizardError = wizard.error || state.modalData?.error || "";
  const body = `<form id="markerMapForm" class="marker-map-form">
    ${wizardError ? `<div class="template-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(wizardError)}</span></div>` : ""}
    <div class="marker-map-intro">
      <span>${icon("checkCircle", 18)}</span>
      <div><strong>${escapeHtml(wizard.template?.title || "DOCX загружен")}</strong><p>${escapeHtml(markers.length)} ${escapeHtml(plural(markers.length, "маркер найден", "маркера найдено", "маркеров найдено"))}. Проверьте источник каждого значения.</p></div>
    </div>
    ${markers.length ? `<div class="marker-map-list">${markers.map((marker, index) => renderMarkerMapRow(state, wizard, marker, markerMap, index)).join("")}</div>` : `<div class="template-marker-empty">${icon("info", 20)}<span><strong>В файле нет маркеров</strong><small>Сохранение сопоставлений не требуется.</small></span></div>`}
    <p class="marker-map-footnote">Маркеры без сопоставления останутся незаполненными и могут заблокировать формирование документа.</p>
  </form>`;

  return modal({
    title: "Сопоставить маркеры",
    description: "Свяжите поля DOCX с данными объекта и документа.",
    body,
    footer: `${button({ label: "Закрыть", action: "close-modal", variant: "secondary", disabled: saving })}${button({
      label: "Сохранить сопоставления",
      action: "save-marker-map",
      iconName: "save",
      variant: "primary",
      type: "submit",
      disabled: saving || !markers.length,
      attributes: `form="markerMapForm" aria-busy="${saving}"`,
    })}`,
    size: "lg",
    labelledBy: "markerMapModalTitle",
  });
}

export function renderTemplateModal(state) {
  if (state.modal === "upload-template") return renderUploadModal(state);
  if (state.modal === "template-details") return renderDetailsModal(state);
  if (state.modal === "marker-map") return renderMarkerMapModal(state);
  return "";
}

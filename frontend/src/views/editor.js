import { icon } from "../components/icons.js";
import { badge, button, emptyState, escapeHtml, modal, skeleton } from "../components/ui.js";

const completionOptions = [
  ["not_started", "Не начат"],
  ["in_progress", "В работе"],
  ["needs_revision", "Нужны правки"],
  ["completed", "Готов"],
];

function isBusy(state, action, documentId = null) {
  const busyAction = String(state.busyAction || "");
  return busyAction === action
    || (documentId !== null && (busyAction === `${action}:${documentId}` || busyAction === `${action}-${documentId}`));
}

function isDirty(state) {
  return Boolean(state.editorDirty || state.editorDraft?._dirty);
}

function issueWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "замечание";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "замечания";
  return "замечаний";
}

function errorWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "ошибка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "ошибки";
  return "ошибок";
}

function warningWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "предупреждение";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "предупреждения";
  return "предупреждений";
}

function hasValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function documentFileName(document) {
  const path = String(document?.source_file || document?.output_file || "");
  return path.split(/[\\/]/).filter(Boolean).at(-1) || document?.title || "Документ";
}

function completionSelect(document, state) {
  const value = completionOptions.some(([status]) => status === document?.completion_status)
    ? document.completion_status
    : "not_started";
  const busy = isBusy(state, "change-completion", document?.id);
  return `<label class="editor-completion">
    <span>Состояние</span>
    <select class="select editor-completion__select editor-completion__select--${escapeHtml(value)}" name="completion_status" data-action="change-completion" data-document="${escapeHtml(document?.id)}" aria-label="Состояние документа" ${busy ? "disabled" : ""}>
      ${completionOptions.map(([status, label]) => `<option value="${status}" ${value === status ? "selected" : ""}>${label}</option>`).join("")}
    </select>
  </label>`;
}

function linkButton({ label, href, iconName = "external", variant = "secondary" }) {
  return `<a class="button button--${variant} button--md" href="${escapeHtml(href)}" target="_blank" rel="noopener">
    <span class="button__label">${icon(iconName, 18)}<span>${escapeHtml(label)}</span></span>
  </a>`;
}

function dirtyIndicator(dirty) {
  return `<span class="editor-dirty${dirty ? " is-dirty" : ""}" role="status">
    ${icon(dirty ? "clock" : "checkCircle", 14)}
    <span>${dirty ? "Есть несохранённые изменения" : "Изменения сохранены"}</span>
  </span>`;
}

function renderEditorHeader(state, document, draft, { imported = false } = {}) {
  const deleting = isBusy(state, "delete-document", document.id);
  const sourceAction = document.source_file
    ? linkButton({ label: imported ? "Открыть файл" : "Исходный файл", href: `/api/source/${document.id}` })
    : "";
  const outputAction = document.output_file
    ? linkButton({ label: "Открыть DOCX", href: `/api/files/${document.id}`, iconName: "fileText" })
    : "";
  return `<header class="editor-header">
    <div class="editor-header__identity">
      <button class="editor-back" type="button" data-route="object">${icon("arrowLeft", 18)}<span>К реестру</span></button>
      <div class="editor-title">
        <span class="editor-title__icon">${icon(imported ? "file" : "fileText", 20)}</span>
        <div>
          <span class="editor-title__number mono">${escapeHtml(draft.number || document.number || "Без номера")}</span>
          <h1>${escapeHtml(document.title || "Документ")}</h1>
          ${dirtyIndicator(isDirty(state))}
        </div>
      </div>
    </div>
    <div class="editor-header__actions">
      ${sourceAction}${outputAction}
      ${button({
        label: "Удалить",
        action: "delete-document",
        iconName: "trash",
        variant: "ghost",
        size: "sm",
        disabled: deleting,
        attributes: `data-document="${escapeHtml(document.id)}" aria-busy="${deleting}"`,
      })}
    </div>
  </header>`;
}

function issueForKey(issues, key) {
  const matches = issues.filter((issue) => String(issue.key || "") === String(key));
  return matches.find((issue) => issue.tone === "error") || matches[0] || null;
}

function fieldMessage(field, issue, objectBound, documentBound) {
  if (issue) {
    const iconName = issue.tone === "warning" ? "alertTriangle" : "alertCircle";
    return `${icon(iconName, 14)}<span>${escapeHtml(issue.message || "Проверьте значение")}</span>`;
  }
  if (objectBound) return `${icon("info", 14)}<span>Из карточки объекта · изменяется в карточке объекта</span>`;
  if (documentBound) return `${icon("info", 14)}<span>Связано с основными реквизитами документа</span>`;
  if (field.required) return `<span>Обязательное поле</span>`;
  return `<span aria-hidden="true">&nbsp;</span>`;
}

function documentAlias(key, state, document) {
  const draft = state.editorDraft || {};
  const number = draft.number ?? document.number ?? "";
  const documentDate = draft.document_date ?? document.document_date ?? "";
  const workTitle = draft.work_title ?? document.work_title ?? "";
  const aliases = {
    "act.number": number,
    "order.number": number,
    "scheme.number": number,
    "journal.number": number,
    "act.date": documentDate,
    "order.date": documentDate,
    works: workTitle,
    scope: workTitle,
  };
  return Object.hasOwn(aliases, key) ? { bound: true, value: aliases[key] } : { bound: false, value: undefined };
}

function fieldValue(field, state, document) {
  const key = String(field.key || "");
  const source = String(field.source || "manual");
  const draftValues = state.editorDraft?.values_json || {};
  const resolvedValues = state.editorResolved?.values || {};
  const documentValues = document.values_json || {};
  if (source.startsWith("object.")) {
    if (hasValue(field.value)) return field.value;
    if (Object.hasOwn(resolvedValues, key)) return resolvedValues[key];
    return documentValues[key];
  }
  const alias = documentAlias(key, state, document);
  if (alias.bound) return alias.value;
  if (Object.hasOwn(draftValues, key)) return draftValues[key];
  if (Object.hasOwn(resolvedValues, key)) return resolvedValues[key];
  if (hasValue(field.value)) return field.value;
  return documentValues[key];
}

function isLongField(field, value) {
  const key = String(field.key || "").toLocaleLowerCase("ru-RU");
  return typeof value === "object"
    || String(value || "").length > 72
    || /works|materials|rows|scope|result|norms|defects|responsibilities|deviations|documentation|description|summary/.test(key);
}

function renderTemplateField(field, index, state, document, issues) {
  const key = String(field.key || `field-${index + 1}`);
  const value = fieldValue(field, state, document);
  const valueText = displayValue(value);
  const source = String(field.source || "manual");
  const objectBound = source.startsWith("object.");
  const documentBound = documentAlias(key, state, document).bound;
  const issue = issueForKey(issues, key);
  const long = isLongField(field, value);
  const required = Boolean(field.required);
  const stateClass = issue ? ` is-${issue.tone === "warning" ? "warning" : "error"}` : "";
  const controlAttributes = `name="field:${escapeHtml(key)}" data-template-field="${escapeHtml(key)}" data-field-key="${escapeHtml(key)}" ${objectBound || documentBound ? "readonly" : ""} ${required ? "required" : ""} aria-describedby="editor-field-message-${index}"`;
  const control = long
    ? `<textarea class="textarea" id="editor-field-${index}" rows="4" ${controlAttributes}>${escapeHtml(valueText)}</textarea>`
    : `<input class="control" id="editor-field-${index}" value="${escapeHtml(valueText)}" ${controlAttributes}>`;

  return `<label class="field editor-field${stateClass}${long ? " editor-field--wide" : ""}" data-editor-field="${escapeHtml(key)}">
    <span class="editor-field__label"><span>${escapeHtml(field.label || key)}${required ? '<i aria-label="обязательное поле">*</i>' : ""}</span>${objectBound ? badge({ label: "Из объекта", tone: "primary", iconName: "building" }) : documentBound ? badge({ label: "Связано", tone: "neutral", iconName: "layers" }) : ""}</span>
    ${control}
    <span class="field__message editor-field__message" id="editor-field-message-${index}">${fieldMessage(field, issue, objectBound, documentBound)}</span>
  </label>`;
}

function sectionHeader({ key, title, description, complete, total, collapsed }) {
  return `<button class="editor-section__toggle" type="button" data-action="toggle-editor-section" data-editor-section="${escapeHtml(key)}" aria-expanded="${!collapsed}">
    <span class="editor-section__chevron">${icon(collapsed ? "chevronRight" : "chevronDown", 18)}</span>
    <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
    <span class="editor-section__count tabular">${complete}/${total}</span>
  </button>`;
}

function renderMainSection(state, draft, issues) {
  const collapsed = Boolean(state.collapsedSections?.main);
  const values = [draft.number, draft.document_date, draft.work_title];
  const complete = values.filter(hasValue).length;
  const controls = [
    ["number", "Номер документа", draft.number, "АОСР-ВК-017", false],
    ["document_date", "Дата документа", draft.document_date, "ДД.ММ.ГГГГ", false],
    ["work_title", "Наименование работ", draft.work_title, "Опишите выполненные работы", true],
  ];
  return `<section class="editor-section" data-section-key="main">
    ${sectionHeader({ key: "main", title: "Основные реквизиты", description: "Номер, дата и содержание документа", complete, total: controls.length, collapsed })}
    <div class="editor-section__body" ${collapsed ? "hidden" : ""}>
      <div class="editor-field-grid">
        ${controls.map(([key, label, value, placeholder, long], index) => {
          const issue = issueForKey(issues, key);
          const stateClass = issue ? ` is-${issue.tone === "warning" ? "warning" : "error"}` : "";
          const message = issue
            ? `${icon(issue.tone === "warning" ? "alertTriangle" : "alertCircle", 14)}<span>${escapeHtml(issue.message || "Проверьте значение")}</span>`
            : `<span aria-hidden="true">&nbsp;</span>`;
          const attributes = `name="${key}" data-field-key="${key}" aria-describedby="editor-main-message-${index}" placeholder="${placeholder}"`;
          const control = long
            ? `<textarea class="textarea" rows="3" ${attributes}>${escapeHtml(value || "")}</textarea>`
            : `<input class="control${key === "number" ? " mono" : ""}" value="${escapeHtml(value || "")}" ${attributes}>`;
          return `<label class="field editor-field${stateClass}${long ? " editor-field--wide" : ""}" data-editor-field="${key}"><span class="field__label">${label}</span>${control}<span class="field__message editor-field__message" id="editor-main-message-${index}">${message}</span></label>`;
        }).join("")}
      </div>
    </div>
  </section>`;
}

function renderTemplateSection(state, document, fields, issues) {
  const collapsed = Boolean(state.collapsedSections?.template);
  const complete = fields.filter((field) => hasValue(fieldValue(field, state, document))).length;
  const content = fields.length
    ? `<div class="editor-field-grid">${fields.map((field, index) => renderTemplateField(field, index, state, document, issues)).join("")}</div>`
    : `<div class="editor-section__empty">${icon("info", 18)}<span>У шаблона нет дополнительных полей. Основные реквизиты можно сохранить и сформировать как обычный документ.</span></div>`;
  return `<section class="editor-section" data-section-key="template">
    ${sectionHeader({ key: "template", title: "Поля шаблона", description: "Значения исходной формы DOCX", complete, total: fields.length, collapsed })}
    <div class="editor-section__body" ${collapsed ? "hidden" : ""}>${content}</div>
  </section>`;
}

function markerSummary(editorMarkers) {
  const markers = Array.isArray(editorMarkers) ? editorMarkers : (editorMarkers?.markers || []);
  const occurrences = markers.reduce((sum, marker) => sum + (Number(marker.occurrences) || 0), 0);
  return { markers: markers.length, occurrences };
}

function renderOutline(state, draft, fields, issues) {
  const mainComplete = [draft.number, draft.document_date, draft.work_title].filter(hasValue).length;
  const fieldComplete = fields.filter((field) => hasValue(fieldValue(field, state, state.selectedDocument || {}))).length;
  return `<aside class="editor-outline" aria-label="Разделы документа">
    <span class="editor-panel-label">Структура</span>
    <nav>
      <button type="button" data-action="focus-editor-section" data-editor-section="main"><span>01</span><strong>Основные реквизиты</strong><em class="tabular">${mainComplete}/3</em></button>
      <button type="button" data-action="focus-editor-section" data-editor-section="template"><span>02</span><strong>Поля шаблона</strong><em class="tabular">${fieldComplete}/${fields.length}</em></button>
    </nav>
    <div class="editor-outline__meta">
      <span>Проверка</span>
      <strong>${issues.length ? `${issues.length} ${issueWord(issues.length)}` : "Замечаний нет"}</strong>
      <small>${isDirty(state) ? "Сначала сохраните изменения" : "Данные синхронизированы"}</small>
    </div>
  </aside>`;
}

export function renderEditorValidation(state, issues) {
  const markers = markerSummary(state.editorMarkers);
  const blocking = issues.filter((issue) => issue.tone === "error").length;
  const warnings = issues.filter((issue) => issue.tone === "warning").length;
  return `<aside class="editor-validation${state.validationPanelOpen === false ? "" : " is-open"}" aria-label="Проверка документа" ${state.validationPanelOpen === false ? "hidden" : ""}>
    <header>
      <div><span class="editor-panel-label">Проверка</span><h2>${blocking ? "Нужно исправить" : warnings ? "Есть предупреждения" : "Документ готов"}</h2></div>
      ${badge({ label: blocking ? `${blocking} ${errorWord(blocking)}` : warnings ? `${warnings} ${warningWord(warnings)}` : "Ошибок нет", tone: blocking ? "error" : warnings ? "warning" : "ready", iconName: blocking ? "alertCircle" : warnings ? "alertTriangle" : "checkCircle" })}
    </header>
    <div class="editor-issue-list">
      ${issues.length ? issues.map((issue) => `<button type="button" class="editor-issue editor-issue--${issue.tone === "warning" ? "warning" : "error"}" data-action="focus-editor-field" data-field-key="${escapeHtml(issue.key || "")}">
        <span>${icon(issue.tone === "warning" ? "alertTriangle" : "alertCircle", 16)}</span>
        <span><strong>${escapeHtml(issue.label || issue.key || "Поле документа")}</strong><small>${escapeHtml(issue.message || "Проверьте значение")}</small></span>
        ${icon("chevronRight", 16)}
      </button>`).join("") : `<div class="editor-validation__empty">${icon("checkCircle", 24)}<strong>Обязательные поля заполнены</strong><span>Можно сформировать итоговый DOCX.</span></div>`}
    </div>
    <footer><span>Маркеры DOCX</span><strong class="tabular">${markers.markers} · ${markers.occurrences} вхождений</strong></footer>
  </aside>`;
}

function renderActionBar(state, document, blockingErrors) {
  const saving = isBusy(state, "save-document", document.id);
  const generating = isBusy(state, "generate-document", document.id);
  const busy = saving || generating;
  const validationOpen = state.validationPanelOpen !== false;
  return `<div class="editor-actionbar">
    ${completionSelect(document, state)}
    <span class="editor-actionbar__spacer"></span>
    ${button({ label: validationOpen ? "Скрыть проверку" : "Показать проверку", action: "toggle-validation-panel", iconName: "panelRight", variant: "secondary", size: "sm", attributes: `aria-pressed="${validationOpen}"` })}
    ${button({ label: "Сохранить", action: "save-document", iconName: "save", variant: "secondary", disabled: busy, attributes: `data-document="${escapeHtml(document.id)}" aria-busy="${saving}"` })}
    ${button({
      label: document.output_file ? "Обновить DOCX" : "Сформировать DOCX",
      action: "generate-document",
      iconName: "generate",
      variant: "primary",
      disabled: busy || blockingErrors > 0,
      attributes: `data-document="${escapeHtml(document.id)}" aria-busy="${generating}" ${blockingErrors ? `title="Сначала исправьте ${blockingErrors} обязательных полей"` : ""}`,
    })}
  </div>`;
}

function renderImportedEditor(state, document, draft) {
  const sourceAvailable = Boolean(document.source_file);
  return `<section class="view-frame editor-view editor-view--imported" data-view="editor">
    ${renderEditorHeader(state, document, draft, { imported: true })}
    ${state.error ? `<div class="editor-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span></div>` : ""}
    <div class="imported-file-state">
      <span class="imported-file-state__icon">${icon("file", 24)}</span>
      <div class="imported-file-state__body">
        <span class="editor-panel-label">Добавленный файл</span>
        <h2>${escapeHtml(documentFileName(document))}</h2>
        <p>Файл хранится в объекте как готовый документ. Поля шаблона и формирование DOCX для него не применяются.</p>
        <dl>
          <div><dt>Номер</dt><dd class="mono">${escapeHtml(document.number || "—")}</dd></div>
          <div><dt>Дата</dt><dd class="tabular">${escapeHtml(document.document_date || "—")}</dd></div>
          <div><dt>Тип</dt><dd>${escapeHtml(document.doc_type || "Файл")}</dd></div>
        </dl>
      </div>
      <div class="imported-file-state__actions">
        ${completionSelect(document, state)}
        ${badge({ label: sourceAvailable ? "Оригинал доступен" : "Файл недоступен", tone: sourceAvailable ? "ready" : "error", iconName: sourceAvailable ? "checkCircle" : "alertCircle" })}
      </div>
    </div>
  </section>`;
}

function renderEditorLoading() {
  return `<section class="view-frame editor-view" data-view="editor" aria-label="Загрузка редактора">
    <div class="editor-loading__header">${skeleton("line", 2)}</div>
    <div class="editor-layout editor-layout--loading has-validation">
      <aside>${skeleton("row", 3)}</aside>
      <main>${skeleton("row", 1)}${skeleton("card", 2)}</main>
      <aside>${skeleton("row", 4)}</aside>
    </div>
  </section>`;
}

export function renderEditorView(state) {
  if (state.loading) return renderEditorLoading();
  const document = state.selectedDocument;
  if (!document) {
    return `<section class="view-frame editor-view" data-view="editor">${emptyState({
      iconName: state.error ? "alertCircle" : "fileText",
      title: state.error ? "Не удалось открыть документ" : "Документ не выбран",
      description: state.error || "Вернитесь в реестр объекта и выберите документ для работы.",
      action: button({ label: "К реестру", action: "back-to-object", iconName: "arrowLeft", variant: "secondary", attributes: 'data-route="object"' }),
    })}</section>`;
  }

  const draft = {
    number: state.editorDraft?.number ?? document.number ?? "",
    work_title: state.editorDraft?.work_title ?? document.work_title ?? "",
    document_date: state.editorDraft?.document_date ?? document.document_date ?? "",
    values_json: state.editorDraft?.values_json || document.values_json || {},
  };
  if (document.source_kind === "imported") return renderImportedEditor(state, document, draft);

  const fields = Array.isArray(state.editorResolved?.fields) ? state.editorResolved.fields : [];
  const issues = Array.isArray(state.editorIssues) ? state.editorIssues : [];
  const blockingErrors = issues.filter((issue) => issue.tone === "error").length;
  const validationOpen = state.validationPanelOpen !== false;

  return `<section class="view-frame editor-view" data-view="editor">
    ${renderEditorHeader(state, document, draft)}
    ${state.error ? `<div class="editor-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span>${button({ label: "Повторить", action: "retry-editor", variant: "secondary", size: "sm" })}</div>` : ""}
    <div class="editor-layout${validationOpen ? " has-validation" : ""}">
      ${renderOutline(state, draft, fields, issues)}
      <main class="editor-center">
        ${renderActionBar(state, document, blockingErrors)}
        <form id="documentForm" class="editor-form" novalidate>
          ${renderMainSection(state, draft, issues)}
          ${renderTemplateSection(state, document, fields, issues)}
        </form>
      </main>
      ${renderEditorValidation(state, issues)}
    </div>
  </section>`;
}

export function renderEditorModal(state) {
  if (state.modal !== "delete-document") return "";
  const document = state.selectedDocument || {};
  const documentId = state.modalData?.documentId ?? document.id ?? "";
  const title = state.modalData?.title || document.title || "Документ";
  const imported = document.source_kind === "imported";
  const deleting = isBusy(state, "confirm-delete-document", documentId) || isBusy(state, "delete-document", documentId);
  const body = `<div class="delete-document-copy">
    <span>${icon("alertTriangle", 20)}</span>
    <div><strong>${escapeHtml(title)}</strong><p>${imported
      ? "Запись исчезнет из объекта, но исходный импортированный файл останется в локальном хранилище."
      : "Запись и сформированная приложением копия DOCX будут удалены. Действие нельзя отменить."}</p></div>
  </div>`;
  return modal({
    title: "Удалить документ?",
    description: "Проверьте выбранный документ перед удалением.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: deleting })}${button({ label: "Удалить", action: "confirm-delete-document", iconName: "trash", variant: "danger", disabled: deleting, attributes: `data-document="${escapeHtml(documentId)}" aria-busy="${deleting}"` })}`,
    size: "sm",
    labelledBy: "deleteDocumentModalTitle",
  });
}

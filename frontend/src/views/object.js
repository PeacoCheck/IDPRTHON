import { icon } from "../components/icons.js";
import {
  documentFileInfo,
  formatFileDate,
  formatFileSize,
  previewUrl,
  renderFilePreview,
} from "../components/file-preview.js";
import { badge, button, emptyState, escapeHtml, iconButton, modal, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

const completionMeta = {
  not_started: { label: "Ожидается", tone: "neutral", iconName: "circle" },
  in_progress: { label: "В работе", tone: "warning", iconName: "clock" },
  needs_revision: { label: "На правках", tone: "error", iconName: "alertCircle" },
  completed: { label: "Готов", tone: "ready", iconName: "checkCircle" },
};

const integrityMeta = {
  ok: { label: "На месте", tone: "ready", iconName: "checkCircle" },
  waived: { label: "Исключено", tone: "neutral", iconName: "info" },
  pending: { label: "Ожидается", tone: "warning", iconName: "clock" },
  warning: { label: "Проверить", tone: "warning", iconName: "alertTriangle" },
  error: { label: "Не хватает", tone: "error", iconName: "alertCircle" },
};

const documentTypeLabels = {
  registry: "Реестр",
  general_journal: "Общий журнал работ",
  incoming_journal: "Журнал входного контроля",
  welding_journal: "Журнал сварочных работ",
  aosr: "АОСР",
  vik: "ВИК",
  hydro: "Испытания",
  incoming_control: "Входной контроль",
  executive_scheme: "Исполнительная схема",
  certificate: "Сертификат",
  passport: "Паспорт",
  appointment_order: "Приказ",
  project: "Проектная документация",
  working_documentation: "Рабочая документация",
  ppr: "ППР",
  method_statement: "Технологическая карта",
  imported: "Добавленный файл",
};

const groupKinds = [
  ["registry", "Реестр"],
  ["working", "Проектная и рабочая документация"],
  ["permits", "Разрешительная документация"],
  ["journals", "Журналы"],
  ["acts", "Акты и испытания"],
  ["schemes", "Исполнительные схемы"],
  ["quality", "Материалы и паспорта"],
  ["source", "ППР и исходные документы"],
  ["evidence", "Подтверждающие материалы"],
  ["archive", "Архив"],
  ["other", "Прочее"],
];

function safePercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function normalizedQuery(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function isBusy(state, action, id = null) {
  const busy = String(state.busyAction || "");
  return busy === action || (id !== null && [
    `${action}:${id}`,
    `${action}-${id}`,
  ].includes(busy));
}

function option(value, label, selectedValue = null) {
  const selected = selectedValue !== null && selectedValue !== undefined && String(value) === String(selectedValue);
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function objectStatusBadge(object) {
  if (object?.status === "archived") return badge({ label: "В архиве", tone: "neutral", iconName: "archive" });
  return badge({ label: "Активный", tone: "ready", iconName: "checkCircle" });
}

function completionBadge(status) {
  return badge(completionMeta[status] || completionMeta.not_started);
}

function integrityBadge(status) {
  return badge(integrityMeta[status] || integrityMeta.pending);
}

function hasFile(document) {
  return documentFileInfo(document).hasFile;
}

function groupDocuments(documents, groupId) {
  if (String(groupId) === "all") return documents;
  return documents.filter((document) => String(document.group_id ?? "") === String(groupId));
}

function renderHeader(state, object) {
  const objectId = escapeHtml(object.id);
  const openingFolder = isBusy(state, "open-object-folder", object.id);
  return `<header class="object-header">
    <div class="object-header__identity">
      <div class="object-header__eyebrow"><span class="mono">${escapeHtml(object.code || "БЕЗ КОДА")}</span>${objectStatusBadge(object)}</div>
      <h1>${escapeHtml(object.name || object.short_name || "Объект без названия")}</h1>
      <p>${icon("mapPin", 15)}<span>${escapeHtml(object.address || "Адрес не указан")}</span></p>
    </div>
    <div class="object-header__actions" aria-label="Действия с объектом">
      ${iconButton({ label: "Открыть папку объекта", action: "open-object-folder", iconName: "folderOpen", disabled: openingFolder, attributes: `data-object-id="${objectId}" aria-busy="${openingFolder}"` })}
      ${iconButton({ label: "Карточка объекта", action: "open-object-profile", iconName: "edit", attributes: `data-object-id="${objectId}"` })}
      ${button({ label: "Ожидаемый документ", action: "open-new-document", iconName: "plus", variant: "secondary", attributes: `data-object-id="${objectId}"` })}
      ${button({ label: "Добавить файлы", action: "open-import-document", iconName: "upload", variant: "primary", attributes: `data-object-id="${objectId}"` })}
      ${iconButton({ label: object.status === "archived" ? "Восстановить объект" : "Архивировать объект", action: object.status === "archived" ? "restore-object" : "archive-object", iconName: object.status === "archived" ? "restore" : "archive", attributes: `data-object-id="${objectId}"` })}
    </div>
  </header>`;
}

function integrityNumbers(workspace, documents) {
  const integrity = workspace.integrity || {};
  const checks = Array.isArray(integrity.checks) ? integrity.checks : [];
  const fallbackTotal = checks.length || documents.length;
  const total = Math.max(0, Number(integrity.total ?? fallbackTotal) || 0);
  const satisfied = Math.min(total, Math.max(0, Number(integrity.satisfied ?? checks.filter((check) => ["ok", "waived"].includes(check.status)).length) || 0));
  const present = documents.filter(hasFile).length;
  const ready = documents.filter((document) => document.completion_status === "completed").length;
  const revision = documents.filter((document) => document.completion_status === "needs_revision").length;
  const score = total ? Math.round((satisfied / total) * 100) : safePercent(integrity.score);
  return { total, satisfied, missing: Math.max(0, total - satisfied), present, ready, revision, score };
}

function renderCompletenessBoard(state, workspace, documents) {
  const values = integrityNumbers(workspace, documents);
  return `<section class="completeness-board" aria-label="Комплектность объекта">
    <div class="completeness-stamp" aria-label="Выполнено ${values.satisfied} из ${values.total} требований">
      <span>КОМПЛЕКТ</span>
      <strong class="tabular">${numberFormat.format(values.satisfied)}<i>/</i>${numberFormat.format(values.total)}</strong>
      <small>${values.score}% собрано</small>
    </div>
    <div class="completeness-board__body">
      <div class="completeness-board__heading">
        <div><span class="technical-eyebrow">Контроль архива</span><h2>${values.missing ? `Не хватает ${values.missing}` : "Структура собрана"}</h2></div>
        <button type="button" class="text-action" data-action="set-object-tab" data-object-tab="integrity">Открыть проверку ${icon("arrowRight", 15)}</button>
      </div>
      <div class="completeness-track" role="progressbar" aria-label="Комплектность" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${values.score}"><span style="--progress:${values.score}%"></span></div>
      <div class="completeness-metrics">
        <div><span>${icon("file", 16)}</span><strong class="tabular">${values.present}</strong><small>файлов на месте</small></div>
        <div><span>${icon("checkCircle", 16)}</span><strong class="tabular">${values.ready}</strong><small>помечено готовыми</small></div>
        <div class="${values.revision ? "is-warning" : ""}"><span>${icon("edit", 16)}</span><strong class="tabular">${values.revision}</strong><small>на правках</small></div>
      </div>
    </div>
  </section>`;
}

function renderTabs(state, workspace, documents) {
  const tab = state.objectTab === "integrity" ? "integrity" : "registry";
  const issues = Number(workspace.integrity?.issues) || integrityNumbers(workspace, documents).missing;
  return `<div class="object-tabs tabs" role="tablist" aria-label="Разделы объекта">
    <button class="tabs__button${tab === "registry" ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab === "registry"}" data-action="set-object-tab" data-object-tab="registry">Реестр <span class="tabular">${numberFormat.format(documents.length)}</span></button>
    <button class="tabs__button${tab === "integrity" ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab === "integrity"}" data-action="set-object-tab" data-object-tab="integrity">Проверка комплекта <span class="tabular">${numberFormat.format(issues)}</span></button>
  </div>`;
}

function renderGroups(state, workspace, documents) {
  const selected = String(state.selectedGroupId ?? "all");
  const groups = Array.isArray(workspace.groups) ? workspace.groups : [];
  const renderGroup = (group, id, iconName) => {
    const subset = groupDocuments(documents, id);
    const present = subset.filter(hasFile).length;
    const total = subset.length;
    const percent = total ? Math.round((present / total) * 100) : 0;
    return `<button class="archive-group${selected === String(id) ? " is-active" : ""}" type="button" data-action="select-group" data-group="${escapeHtml(id)}" aria-current="${selected === String(id) ? "true" : "false"}">
      <span class="archive-group__icon">${icon(iconName, 16)}</span>
      <span class="archive-group__copy"><strong title="${escapeHtml(group.title)}">${escapeHtml(group.title)}</strong><span class="archive-group__track"><i style="--group-progress:${percent}%"></i></span></span>
      <span class="archive-group__count mono">${present}/${total}</span>
    </button>`;
  };

  return `<aside class="archive-groups" aria-label="Группы документов">
    <header><div><span class="technical-eyebrow">Структура</span><h2>Группы</h2></div>${iconButton({ label: "Добавить группу", action: "open-new-group", iconName: "plus" })}</header>
    <nav class="archive-groups__list" data-auto-animate="groups">
      ${renderGroup({ title: "Все документы" }, "all", "layers")}
      ${groups.map((group) => renderGroup(group, group.id, "folder")).join("")}
    </nav>
  </aside>`;
}

function documentMatches(document, query) {
  if (!query) return true;
  const file = documentFileInfo(document);
  return [document.number, document.title, document.doc_type, document.work_title, document.document_date, file.fileName]
    .some((value) => String(value || "").toLocaleLowerCase("ru-RU").includes(query));
}

function filterDocuments(documents, filter) {
  if (filter === "no_file") return documents.filter((document) => !hasFile(document));
  if (filter === "needs_revision") return documents.filter((document) => document.completion_status === "needs_revision");
  if (filter === "completed") return documents.filter((document) => document.completion_status === "completed");
  return documents;
}

function renderQuickFilters(state, documents) {
  const filter = ["all", "no_file", "needs_revision", "completed"].includes(state.completionFilter) ? state.completionFilter : "all";
  const items = [
    ["all", "Все", documents.length],
    ["no_file", "Без файла", documents.filter((document) => !hasFile(document)).length],
    ["needs_revision", "На правках", documents.filter((document) => document.completion_status === "needs_revision").length],
    ["completed", "Готово", documents.filter((document) => document.completion_status === "completed").length],
  ];
  return `<div class="registry-quick-filters" role="tablist" aria-label="Быстрые фильтры">${items.map(([value, label, count]) => `<button class="registry-quick-filter${filter === value ? " is-active" : ""}" type="button" role="tab" aria-selected="${filter === value}" data-action="set-completeness-filter" data-filter="${value}">${label}<span class="tabular">${count}</span></button>`).join("")}</div>`;
}

function renderDocumentRow(document, state) {
  const file = documentFileInfo(document);
  const extension = file.extension ? file.extension.toLocaleUpperCase("ru-RU") : "—";
  const selected = Number(state.previewDocumentId) === Number(document.id);
  return `<article class="archive-document${selected ? " is-selected" : ""}${file.hasFile ? "" : " is-expected"}" id="document-row-${escapeHtml(document.id)}" tabindex="0" data-document="${escapeHtml(document.id)}" aria-label="Открыть ${escapeHtml(document.title || file.fileName)}">
    <span class="archive-document__filemark mono" aria-hidden="true">${escapeHtml(extension.slice(0, 4))}</span>
    <div class="archive-document__identity">
      <span class="archive-document__number mono">${escapeHtml(document.number || `ID-${document.id}`)}</span>
      <strong>${escapeHtml(document.title || file.fileName || "Документ без названия")}</strong>
      <small title="${escapeHtml(file.fileName)}">${file.hasFile ? escapeHtml(file.fileName) : "Ожидаемая запись — файл ещё не добавлен"}</small>
    </div>
    <div class="archive-document__type"><span>${escapeHtml(documentTypeLabels[document.doc_type] || "Документ")}</span><small>${escapeHtml(document.document_date || "Без даты")}</small></div>
    <div class="archive-document__state">${file.hasFile ? completionBadge(document.completion_status) : badge({ label: "Нет файла", tone: "warning", iconName: "upload" })}<small>${file.hasFile ? formatFileSize(file.size) : "ожидается"}</small></div>
    <div class="archive-document__actions">
      ${file.hasFile ? iconButton({ label: "Скачать файл", action: "download-source-document", iconName: "download", attributes: `data-document-id="${escapeHtml(document.id)}"` }) : ""}
      ${iconButton({ label: "Убрать из реестра", action: "delete-document", iconName: "trash", attributes: `data-document-id="${escapeHtml(document.id)}"` })}
      <span class="archive-document__open">${icon("chevronRight", 17)}</span>
    </div>
  </article>`;
}

function renderRegistry(state, workspace, documents) {
  const selectedGroup = String(state.selectedGroupId ?? "all");
  const query = normalizedQuery(state.documentQuery);
  const grouped = groupDocuments(documents, selectedGroup);
  const filtered = filterDocuments(grouped, state.completionFilter);
  const visible = filtered.filter((document) => documentMatches(document, query));

  let content;
  if (!documents.length) {
    content = emptyState({
      iconName: "fileText",
      title: "Архив пока пуст",
      description: "Добавьте готовые файлы или создайте ожидаемые позиции, чтобы видеть, чего не хватает до полного комплекта.",
      action: button({ label: "Добавить файлы", action: "open-import-document", iconName: "upload", variant: "primary" }),
    });
  } else if (!visible.length) {
    content = emptyState({
      iconName: "search",
      title: "В этом срезе ничего нет",
      description: "Смените группу, быстрый фильтр или поисковый запрос.",
      action: button({ label: "Сбросить фильтры", action: "clear-document-filters", variant: "secondary" }),
    });
  } else {
    content = `<div class="archive-document-list" data-auto-animate="documents">${visible.map((document) => renderDocumentRow(document, state)).join("")}</div>`;
  }

  return `<section class="archive-workspace" id="objectRegistry" role="tabpanel">
    ${renderGroups(state, workspace, documents)}
    <div class="archive-registry" data-object-drop data-object-id="${escapeHtml(workspace.object.id)}">
      <header class="archive-registry__toolbar">
        <div class="registry-search-wrap">
          <label class="registry-search" for="documentSearch">${icon("search", 16)}<span class="sr-only">Найти документ</span><input id="documentSearch" class="control" type="search" value="${escapeHtml(state.documentQuery || "")}" placeholder="Номер, название или имя файла" autocomplete="off"></label>
          ${renderQuickFilters(state, grouped)}
        </div>
        <div class="registry-result"><strong class="tabular">${numberFormat.format(visible.length)}</strong><span>из ${numberFormat.format(grouped.length)}</span></div>
      </header>
      <div class="archive-registry__content">${content}</div>
      <div class="object-drop-overlay" aria-hidden="true"><span>${icon("upload", 30)}</span><strong>Добавить файлы в ${selectedGroup === "all" ? "объект" : "выбранную группу"}</strong><small>Можно отпустить сразу несколько файлов</small></div>
    </div>
  </section>`;
}

function renderIntegrityCheck(state, check) {
  const status = integrityMeta[check.status] ? check.status : "pending";
  const ruleId = escapeHtml(check.id);
  const restoring = isBusy(state, "restore-integrity-rule", check.id);
  const action = check.status === "waived"
    ? button({ label: "Вернуть", action: "restore-integrity-rule", iconName: "restore", variant: "secondary", size: "sm", disabled: restoring, attributes: `data-rule-id="${ruleId}" aria-busy="${restoring}"` })
    : status === "ok"
      ? ""
      : button({ label: "Объяснить отсутствие", action: "open-waive-rule", iconName: "edit", variant: "secondary", size: "sm", attributes: `data-rule-id="${ruleId}"` });
  return `<article class="integrity-check integrity-check--${status}" id="integrity-rule-${ruleId}" data-integrity-rule="${ruleId}">
    <span class="integrity-check__status" aria-hidden="true">${icon(integrityMeta[status].iconName, 18)}</span>
    <div class="integrity-check__content"><div class="integrity-check__heading"><h3>${escapeHtml(check.title || check.code || "Требование комплекта")}</h3>${integrityBadge(status)}</div>${check.description ? `<p>${escapeHtml(check.description)}</p>` : ""}${check.reason ? `<div class="integrity-check__reason"><strong>Причина:</strong> ${escapeHtml(check.reason)}${check.evidence ? `<span><strong>Подтверждение:</strong> ${escapeHtml(check.evidence)}</span>` : ""}</div>` : ""}</div>
    <div class="integrity-check__count"><strong class="tabular">${numberFormat.format(Math.max(0, Number(check.found) || 0))}/${numberFormat.format(Math.max(0, Number(check.required) || 0))}</strong><span>файлов</span></div>
    <div class="integrity-check__action">${action}</div>
  </article>`;
}

function renderIntegrity(state, workspace, documents) {
  const checks = Array.isArray(workspace.integrity?.checks) ? workspace.integrity.checks : [];
  const numbers = integrityNumbers(workspace, documents);
  return `<section class="object-integrity" id="objectIntegrity" role="tabpanel">
    <header class="integrity-heading"><div><span class="technical-eyebrow">Эталонная структура</span><h2>${numbers.missing ? "Есть разрывы в комплекте" : "Комплект соответствует структуре"}</h2><p>Файл на месте закрывает требование. Рабочий статус документа учитывается отдельно.</p></div><div class="integrity-heading__stamp"><strong class="tabular">${numbers.satisfied}/${numbers.total}</strong><span>${numbers.score}%</span></div></header>
    <div class="integrity-list" data-auto-animate="integrity">${checks.length ? checks.map((check) => renderIntegrityCheck(state, check)).join("") : emptyState({ iconName: "checkCircle", title: "Правила структуры не заданы", description: "Добавленные файлы остаются в реестре, но эталонный комплект для этого профиля пока не настроен." })}</div>
  </section>`;
}

function renderPreviewDrawer(state, documents) {
  const document = documents.find((item) => Number(item.id) === Number(state.previewDocumentId));
  if (!document) return "";
  const file = documentFileInfo(document);
  const busy = isBusy(state, "upload-document-file", document.id);
  return `<div class="preview-drawer-layer" data-preview-layer>
    <button class="preview-drawer-backdrop" type="button" data-action="close-document-preview" aria-label="Закрыть предпросмотр"></button>
    <aside class="preview-drawer" data-preview-drawer aria-label="Предпросмотр документа">
      <header class="preview-drawer__header">
        <div><span class="mono">${escapeHtml(document.number || `ID-${document.id}`)}</span><h2>${escapeHtml(document.title || file.fileName)}</h2><small>${escapeHtml(file.fileName)}${file.hasFile ? ` · ${escapeHtml(formatFileSize(file.size))}` : ""}</small></div>
        ${iconButton({ label: "Закрыть предпросмотр", action: "close-document-preview", iconName: "close" })}
      </header>
      <div class="preview-drawer__status"><span>${completionBadge(document.completion_status)}</span><label><span class="sr-only">Состояние документа</span><select class="select" data-action="change-completion" data-document="${escapeHtml(document.id)}">${Object.entries(completionMeta).map(([value, meta]) => `<option value="${value}"${value === document.completion_status ? " selected" : ""}>${meta.label}</option>`).join("")}</select></label></div>
      <div class="preview-drawer__body">${renderFilePreview(document, { compact: true })}</div>
      <footer class="preview-drawer__footer">
        ${file.hasFile ? `<a class="button button--secondary button--sm" href="${escapeHtml(document.file_info?.download_url || previewUrl(document.id))}" download="${escapeHtml(file.fileName)}">${icon("download", 16)}<span class="button__label">Скачать</span></a>` : ""}
        ${file.hasFile ? `<label class="button button--secondary button--sm${busy ? " is-busy" : ""}">${icon("refresh", 16)}<span class="button__label">Заменить</span><input type="file" data-document-file-input data-document-id="${escapeHtml(document.id)}" hidden ${busy ? "disabled" : ""}></label>` : ""}
        ${button({ label: "Открыть полностью", action: "open-document-full", iconName: "external", variant: "primary", size: "sm", attributes: `data-document-id="${escapeHtml(document.id)}"` })}
      </footer>
    </aside>
  </div>`;
}

function renderLoadingView() {
  return `<section class="view-frame object-view" data-view="object"><div class="object-view__loading">${skeleton("card", 1)}<div class="object-view__loading-grid">${skeleton("card", 2)}${skeleton("row", 6)}</div></div></section>`;
}

function renderErrorView(state) {
  return `<section class="view-frame object-view" data-view="object">${emptyState({ iconName: "alertCircle", title: "Не удалось открыть объект", description: state.error || "Рабочее пространство объекта недоступно.", action: button({ label: "Повторить", action: "retry-object-workspace", iconName: "refresh", variant: "secondary" }) })}</section>`;
}

export function renderObjectView(state) {
  const workspace = state.workspace;
  if (state.loading && !workspace) return renderLoadingView();
  if (!workspace?.object) return renderErrorView(state);
  const documents = Array.isArray(state.documents) ? state.documents : (workspace.documents || []);
  const tab = state.objectTab === "integrity" ? "integrity" : "registry";
  return `<section class="view-frame object-view${state.previewDocumentId ? " has-preview" : ""}" data-view="object">
    ${renderHeader(state, workspace.object)}
    ${renderCompletenessBoard(state, workspace, documents)}
    <div class="object-view__navigation">${renderTabs(state, workspace, documents)}</div>
    ${state.error ? `<div class="object-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span>${button({ label: "Повторить", action: "retry-object-workspace", variant: "secondary", size: "sm" })}</div>` : ""}
    ${tab === "integrity" ? renderIntegrity(state, workspace, documents) : renderRegistry(state, workspace, documents)}
    ${renderPreviewDrawer(state, documents)}
  </section>`;
}

function modalError(state) {
  const message = state.modalData?.error;
  return message ? `<div class="object-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(message)}</span></div>` : "";
}

function renderObjectProfileModal(state) {
  const object = state.modalData?.object || state.workspace?.object;
  if (!object) return "";
  const meta = object.meta_json && typeof object.meta_json === "object" ? object.meta_json : {};
  const customer = meta.customer && typeof meta.customer === "object" ? meta.customer : {};
  const contractor = meta.contractor && typeof meta.contractor === "object" ? meta.contractor : {};
  const responsible = meta.responsible_person && typeof meta.responsible_person === "object" ? meta.responsible_person : {};
  const saving = isBusy(state, "save-object-profile", object.id);
  const body = `<form id="objectProfileForm" class="object-modal-form">${modalError(state)}
    <input type="hidden" name="object_id" value="${escapeHtml(object.id)}"><input type="hidden" name="profile" value="${escapeHtml(object.profile || "industrial_repair")}">
    <section class="object-form-section"><header><h3>Объект</h3><span class="mono">${escapeHtml(object.code || "Без кода")}</span></header><div class="object-form-grid">
      <label class="field object-form-grid__wide"><span class="field__label">Полное наименование</span><input class="control" name="name" required minlength="2" value="${escapeHtml(object.name || "")}"></label>
      <label class="field"><span class="field__label">Короткое название</span><input class="control" name="short_name" value="${escapeHtml(object.short_name || "")}"></label>
      <label class="field"><span class="field__label">Вид работ</span><input class="control" name="work_kind" value="${escapeHtml(meta.work_kind || "")}" placeholder="Капитальный ремонт"></label>
      <label class="field object-form-grid__wide"><span class="field__label">Адрес или площадка</span><input class="control" name="address" value="${escapeHtml(object.address || "")}"></label>
      <label class="field object-form-grid__wide"><span class="field__label">Комментарий</span><textarea class="textarea" name="comment" rows="2">${escapeHtml(object.comment || "")}</textarea></label>
    </div></section>
    <section class="object-form-section"><header><h3>Организации</h3></header><div class="object-form-grid">
      <label class="field"><span class="field__label">Заказчик</span><input class="control" name="customer_name" value="${escapeHtml(customer.name || "")}"></label><label class="field"><span class="field__label">ИНН заказчика</span><input class="control mono" name="customer_inn" value="${escapeHtml(customer.inn || "")}"></label>
      <label class="field"><span class="field__label">Подрядчик</span><input class="control" name="contractor_name" value="${escapeHtml(contractor.name || "")}"></label><label class="field"><span class="field__label">ИНН подрядчика</span><input class="control mono" name="contractor_inn" value="${escapeHtml(contractor.inn || "")}"></label>
    </div></section>
    <section class="object-form-section"><header><h3>Основания работ</h3></header><div class="object-form-grid"><label class="field object-form-grid__wide"><span class="field__label">Договор</span><input class="control" name="contract" value="${escapeHtml(meta.contract || "")}"></label><label class="field object-form-grid__wide"><span class="field__label">Проектная документация</span><textarea class="textarea" name="project_documentation" rows="2">${escapeHtml(meta.project_documentation || "")}</textarea></label></div></section>
    <section class="object-form-section"><header><h3>Ответственное лицо</h3></header><div class="object-form-grid"><label class="field object-form-grid__wide"><span class="field__label">ФИО</span><input class="control" name="responsible_fio" value="${escapeHtml(responsible.fio || "")}"></label><label class="field"><span class="field__label">Должность</span><input class="control" name="responsible_position" value="${escapeHtml(responsible.position || "")}"></label><label class="field"><span class="field__label">Приказ</span><input class="control" name="responsible_order" value="${escapeHtml(responsible.order || "")}"></label></div></section>
  </form>`;
  return modal({ title: "Карточка объекта", description: "Паспорт объекта для поиска, реестра и печатных отчётов.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: saving })}${button({ label: "Сохранить", action: "save-object-profile", iconName: "save", variant: "primary", type: "submit", disabled: saving, attributes: `form="objectProfileForm" data-object-id="${escapeHtml(object.id)}" aria-busy="${saving}"` })}`, size: "lg", labelledBy: "objectProfileModalTitle" });
}

function renderNewGroupModal(state) {
  const draft = state.modalData || {};
  const creating = isBusy(state, "create-group");
  const body = `<form id="newGroupForm" class="object-modal-form">${modalError(state)}<label class="field"><span class="field__label">Название группы</span><input class="control" name="title" required minlength="2" autofocus value="${escapeHtml(draft.title || "")}" placeholder="Протоколы испытаний"></label><label class="field"><span class="field__label">Раздел комплекта</span><select class="select" name="kind">${groupKinds.map(([value, label]) => option(value, label, draft.kind || "other")).join("")}</select></label><label class="field"><span class="field__label">Описание</span><textarea class="textarea" name="description" rows="3" placeholder="Что хранится в этой группе">${escapeHtml(draft.description || "")}</textarea></label><label class="object-checkbox"><input type="checkbox" name="is_required" value="true"${draft.is_required ? " checked" : ""}><span><strong>Обязательная группа</strong><small>Отсутствие файлов будет видно в контроле комплекта</small></span></label></form>`;
  return modal({ title: "Новая группа", description: "Добавьте раздел в структуру архива объекта.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Добавить группу", action: "create-group", iconName: "plus", variant: "primary", type: "submit", disabled: creating, attributes: `form="newGroupForm" aria-busy="${creating}"` })}`, labelledBy: "newGroupModalTitle" });
}

function groupOptions(state, selected = null, emptyLabel = "Определить автоматически") {
  const groups = Array.isArray(state.workspace?.groups) ? state.workspace.groups : [];
  return `${option("", emptyLabel, selected)}${groups.map((group) => option(group.id, group.title || "Группа без названия", selected)).join("")}`;
}

function renderImportDocumentModal(state) {
  const draft = state.modalData || {};
  const importing = isBusy(state, "import-document-file");
  const body = `<form id="importDocumentForm" class="object-modal-form" enctype="multipart/form-data">${modalError(state)}<label class="object-file-field">${icon("upload", 24)}<span><strong>Выберите один или несколько файлов</strong><small>PDF, Word, Excel, изображения, чертежи и текст до 100 МБ каждый</small></span><input name="files" type="file" multiple required accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.txt"></label><div class="import-file-list" data-import-file-list></div><label class="field"><span class="field__label">Группа</span><select class="select" name="group_id">${groupOptions(state, draft.group_id)}</select><span class="field__helper">Если не выбрать, ID Vault попробует определить раздел по имени и типу файла</span></label></form>`;
  return modal({ title: "Добавить файлы", description: "Оригиналы сохранятся в локальном архиве выбранного объекта.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: importing })}${button({ label: "Добавить в архив", action: "import-document-file", iconName: "upload", variant: "primary", type: "submit", disabled: importing, attributes: `form="importDocumentForm" aria-busy="${importing}"` })}`, labelledBy: "importDocumentModalTitle" });
}

function renderWaiveRuleModal(state) {
  const rule = state.modalData?.rule || state.modalData || {};
  const saving = isBusy(state, "waive-integrity-rule", rule.id);
  const selectedType = rule.resolution_type || "not_applicable";
  const body = `<form id="waiveRuleForm" class="object-modal-form">${modalError(state)}<input type="hidden" name="rule_id" value="${escapeHtml(rule.id || "")}"><div class="waive-rule-summary"><span>${icon("alertTriangle", 18)}</span><div><strong>${escapeHtml(rule.title || "Требование комплектности")}</strong>${rule.description ? `<p>${escapeHtml(rule.description)}</p>` : ""}</div></div><label class="field"><span class="field__label">Решение</span><select class="select" name="resolution_type" required>${option("not_applicable", "Не применяется к объекту", selectedType)}${option("equivalent", "Заменено эквивалентным документом", selectedType)}${option("justified_exception", "Обоснованное исключение", selectedType)}${option("pending", "Ожидается позднее", selectedType)}</select></label><label class="field"><span class="field__label">Причина</span><textarea class="textarea" name="reason" required minlength="5" rows="4" placeholder="Почему документ отсутствует или не требуется">${escapeHtml(rule.reason || "")}</textarea></label><label class="field"><span class="field__label">Подтверждение</span><input class="control" name="evidence" value="${escapeHtml(rule.evidence || "")}" placeholder="Номер письма, акта или заменяющего документа"></label></form>`;
  return modal({ title: "Объяснить отсутствие", description: "Причина останется в проверке комплекта и её можно отменить.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: saving })}${button({ label: "Сохранить решение", action: "waive-integrity-rule", iconName: "check", variant: "primary", type: "submit", disabled: saving, attributes: `form="waiveRuleForm" data-rule-id="${escapeHtml(rule.id || "")}" aria-busy="${saving}"` })}`, labelledBy: "waiveRuleModalTitle" });
}

function renderNewDocumentModal(state) {
  const draft = state.modalData || {};
  const creating = isBusy(state, "create-document");
  const groupId = draft.group_id ?? draft.groupId ?? state.selectedGroupId;
  const body = `<form id="newDocumentForm" class="object-modal-form">${modalError(state)}<input type="hidden" name="object_id" value="${escapeHtml(state.workspace?.object?.id || "")}"><div class="expected-document-note">${icon("info", 18)}<p><strong>Это место под будущий файл.</strong> Запись сразу появится в реестре и покажет, чего ещё не хватает.</p></div><div class="object-form-grid"><label class="field"><span class="field__label">Группа</span><select class="select" name="group_id">${groupOptions(state, groupId === "all" ? null : groupId)}</select></label><label class="field"><span class="field__label">Тип документа</span><select class="select" name="doc_type">${Object.entries(documentTypeLabels).filter(([value]) => value !== "imported").map(([value, label]) => option(value, label, draft.doc_type || "aosr")).join("")}</select></label><label class="field"><span class="field__label">Номер</span><input class="control mono" name="number" value="${escapeHtml(draft.number || "")}" placeholder="Можно добавить позже"></label><label class="field"><span class="field__label">Дата</span><input class="control tabular" name="document_date" value="${escapeHtml(draft.document_date || "")}" placeholder="ДД.ММ.ГГГГ"></label><label class="field object-form-grid__wide"><span class="field__label">Наименование</span><input class="control" name="title" required value="${escapeHtml(draft.title || "")}" placeholder="Акт освидетельствования скрытых работ"></label><label class="field object-form-grid__wide"><span class="field__label">Примечание</span><textarea class="textarea" name="work_title" rows="2" placeholder="Что должно быть в этом документе">${escapeHtml(draft.work_title || "")}</textarea></label></div></form>`;
  return modal({ title: "Ожидаемый документ", description: "Создайте позицию без файла и закройте её позже перетаскиванием или заменой.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Добавить в реестр", action: "create-document", iconName: "plus", variant: "primary", type: "submit", disabled: creating, attributes: `form="newDocumentForm" aria-busy="${creating}"` })}`, size: "lg", labelledBy: "newDocumentModalTitle" });
}

export function renderObjectModal(state) {
  if (state.modal === "object-profile") return renderObjectProfileModal(state);
  if (state.modal === "new-group") return renderNewGroupModal(state);
  if (state.modal === "import-document") return renderImportDocumentModal(state);
  if (state.modal === "waive-rule") return renderWaiveRuleModal(state);
  if (state.modal === "new-document") return renderNewDocumentModal(state);
  return "";
}

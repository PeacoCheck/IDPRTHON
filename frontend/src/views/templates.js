import { icon } from "../components/icons.js";
import {
  documentFileInfo,
  formatFileDate,
  formatFileSize,
  renderFilePreview,
} from "../components/file-preview.js";
import { badge, button, emptyState, escapeHtml, iconButton, modal, skeleton } from "../components/ui.js";

const DOC_TYPE_LABELS = {
  aosr: "АОСР",
  appointment_order: "Приказы",
  certificate: "Сертификаты",
  defect_statement: "Дефектные ведомости",
  dismantling_act: "Акты демонтажа",
  equipment_acceptance: "Приёмка оборудования",
  executive_scheme: "Исполнительные схемы",
  general_journal: "Общие журналы",
  hydro: "Испытания",
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

const GROUP_LABELS = {
  acts: "Акты и испытания",
  journals: "Журналы",
  permits: "Разрешительная документация",
  quality: "Материалы и паспорта",
  registry: "Реестр",
  schemes: "Исполнительные схемы",
  source: "Исходные документы",
  working: "Рабочая документация",
  other: "Прочее",
};

function templatesFrom(state) {
  return Array.isArray(state.templates) ? state.templates : [];
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

function docTypeLabel(value) {
  return DOC_TYPE_LABELS[value] || "Документ";
}

function templateMatches(template, query, category) {
  if (category !== "all" && template.doc_type !== category) return false;
  if (!query) return true;
  const file = documentFileInfo(template);
  return [template.title, template.doc_type, template.notes, template.source_example, file.fileName]
    .some((value) => String(value || "").toLocaleLowerCase("ru-RU").includes(query));
}

function templateDownloadUrl(templateId) {
  return `/api/templates/${encodeURIComponent(templateId)}/file`;
}

function renderTemplateCard(state, template) {
  const file = documentFileInfo(template);
  const extension = file.extension ? file.extension.toLocaleUpperCase("ru-RU") : "—";
  const replacing = isBusy(state, "replace-template-file", template.id);
  const templateId = escapeHtml(template.id);
  const addButton = button({
    label: "Добавить в объект",
    action: "add-template-to-object",
    iconName: "plus",
    variant: "primary",
    size: "sm",
    disabled: !file.hasFile,
    attributes: `data-template-id="${templateId}"`,
  });
  return `<article class="archive-template-card${file.hasFile ? "" : " is-fileless"}" id="template-card-${escapeHtml(template.id)}" data-template-card data-template-id="${escapeHtml(template.id)}">
    <header class="archive-template-card__header">
      <span class="template-file-stamp mono${file.hasFile ? "" : " is-empty"}">${file.hasFile ? escapeHtml(extension.slice(0, 5)) : "НЕТ<br>ФАЙЛА"}</span>
      <div><span class="technical-eyebrow">${escapeHtml(GROUP_LABELS[template.group_kind] || "Библиотека")}</span><h2>${escapeHtml(template.title || "Шаблон без названия")}</h2></div>
      ${template.is_default ? badge({ label: "Основной", tone: "primary" }) : ""}
    </header>
    <div class="archive-template-card__file">
      <span>${icon(file.hasFile ? "fileText" : "alertCircle", 18)}</span>
      <div><strong title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</strong><small>${file.hasFile ? `${escapeHtml(formatFileSize(file.size))} · обновлён ${escapeHtml(formatFileDate(file.updatedAt))}` : "Загрузите DOCX, XLSX или PDF"}</small></div>
      <span class="template-version mono">v${escapeHtml(template.version || 1)}</span>
    </div>
    <p class="archive-template-card__note">${escapeHtml(template.notes || template.source_example || "Готовый файл для копирования в архив объекта.")}</p>
    <footer class="archive-template-card__footer">
      <div>
        ${file.hasFile ? "" : button({ label: "Загрузить файл", action: "replace-template", iconName: "upload", variant: "secondary", size: "sm", disabled: replacing, attributes: `data-template-id="${templateId}" aria-busy="${replacing}"` })}
        ${file.hasFile ? iconButton({ label: "Предпросмотр", action: "preview-template", iconName: "search", attributes: `data-template-id="${escapeHtml(template.id)}"` }) : ""}
        ${file.hasFile ? `<a class="icon-button" href="${templateDownloadUrl(template.id)}" download aria-label="Скачать шаблон">${icon("download", 17)}</a>` : ""}
        ${file.hasFile ? iconButton({ label: "Заменить файл", action: "replace-template", iconName: "refresh", disabled: replacing, attributes: `data-template-id="${templateId}" aria-busy="${replacing}"` }) : ""}
        ${iconButton({ label: "Дублировать шаблон", action: "duplicate-template", iconName: "copy", attributes: `data-template-id="${escapeHtml(template.id)}"` })}
        ${iconButton({ label: "Удалить шаблон", action: "archive-template", iconName: "trash", attributes: `data-template-id="${escapeHtml(template.id)}"` })}
      </div>
      ${file.hasFile ? addButton : `<span class="template-add-disabled" data-tooltip="Сначала загрузите файл шаблона" tabindex="0" aria-label="Добавить в объект недоступно: сначала загрузите файл шаблона">${addButton}</span>`}
    </footer>
  </article>`;
}

function renderLoading() {
  return `<section class="view-frame templates-view" data-view="templates"><div class="templates-header">${skeleton("line", 2)}</div><div class="template-library-grid">${skeleton("card", 6)}</div></section>`;
}

export function renderTemplatesView(state) {
  if (state.loading && !state.templates?.length) return renderLoading();
  const templates = templatesFrom(state).filter((template) => template.is_active !== false);
  const query = normalizedQuery(state.templateQuery);
  const category = state.templateCategory || "all";
  const categories = [...new Set(templates.map((template) => template.doc_type).filter(Boolean))].sort((a, b) => docTypeLabel(a).localeCompare(docTypeLabel(b), "ru"));
  const visible = templates
    .filter((template) => templateMatches(template, query, category))
    .sort((left, right) => {
      const fileOrder = Number(documentFileInfo(right).hasFile) - Number(documentFileInfo(left).hasFile);
      if (fileOrder) return fileOrder;
      return String(left.title || "").localeCompare(String(right.title || ""), "ru", { sensitivity: "base" });
    });

  let content;
  if (state.templateError) {
    content = emptyState({ iconName: "alertCircle", title: "Не удалось открыть библиотеку", description: state.templateError, action: button({ label: "Повторить", action: "retry-templates", iconName: "refresh", variant: "secondary" }) });
  } else if (!templates.length) {
    content = emptyState({ iconName: "templates", title: "Библиотека пока пуста", description: "Добавьте готовый DOCX, XLSX или PDF. ID Vault сохранит оригинал без изменения содержимого.", action: button({ label: "Добавить шаблон", action: "new-template", iconName: "upload", variant: "primary" }) });
  } else if (!visible.length) {
    content = emptyState({ iconName: "search", title: "Шаблоны не найдены", description: "Измените запрос или категорию.", action: button({ label: "Сбросить фильтры", action: "clear-template-filters", variant: "secondary" }) });
  } else {
    content = `<div class="template-library-grid" data-auto-animate="templates">${visible.map((template) => renderTemplateCard(state, template)).join("")}</div>`;
  }

  return `<section class="view-frame templates-view" data-view="templates">
    <header class="templates-header"><div><span class="technical-eyebrow">Файловая библиотека</span><h1>Шаблоны документов</h1><p>Готовые оригиналы — скачать, заменить или скопировать в архив объекта.</p></div>${button({ label: "Добавить шаблон", action: "new-template", iconName: "upload", variant: "primary" })}</header>
    <div class="templates-toolbar">
      <label class="templates-search" for="templateSearch">${icon("search", 16)}<span class="sr-only">Найти шаблон</span><input id="templateSearch" class="control" type="search" value="${escapeHtml(state.templateQuery || "")}" placeholder="Название или имя файла" autocomplete="off"></label>
      <select class="select" id="templateCategorySelect" style="max-width:240px; cursor:pointer;"><option value="all" ${category === "all" ? "selected" : ""}>Все типы (${templates.length})</option>${categories.map((value) => `<option value="${escapeHtml(value)}" ${category === value ? "selected" : ""}>${escapeHtml(docTypeLabel(value))} (${templates.filter((item) => item.doc_type === value).length})</option>`).join("")}</select>
      <span class="templates-result"><strong class="tabular">${visible.length}</strong> шаблонов</span>
    </div>
    ${content}
  </section>`;
}

function templateById(state, id) {
  return templatesFrom(state).find((template) => Number(template.id) === Number(id));
}

function renderPreviewModal(state) {
  const template = templateById(state, state.modalData?.templateId);
  if (!template) return "";
  const file = documentFileInfo(template);
  return modal({
    title: template.title || "Предпросмотр шаблона",
    description: `${file.fileName} · версия ${template.version || 1}`,
    body: `<div class="template-preview-modal">${renderFilePreview(template, { template: true })}</div>`,
    footer: `${button({ label: "Закрыть", action: "close-modal", variant: "secondary" })}<a class="button button--primary" href="${templateDownloadUrl(template.id)}" download>${icon("download", 16)}<span class="button__label">Скачать оригинал</span></a>`,
    size: "xl",
    labelledBy: "templatePreviewModalTitle",
  });
}

function renderNewTemplateModal(state) {
  const creating = isBusy(state, "create-template-file");
  const draft = state.modalData || {};
  const body = `<form id="newTemplateFileForm" class="template-modal-form" enctype="multipart/form-data">
    ${draft.error ? `<div class="template-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(draft.error)}</span></div>` : ""}
    <label class="template-dropzone">${icon("upload", 26)}<span><strong>Готовый файл шаблона</strong><small>DOCX, XLSX или PDF до 25 МБ</small><em class="template-dropzone__filename">Файл не выбран</em></span><input name="file" type="file" required accept=".docx,.xlsx,.pdf"></label>
    <div class="template-modal-grid"><label class="field template-modal-grid__wide"><span class="field__label">Название</span><input class="control" name="title" required value="${escapeHtml(draft.title || "")}" placeholder="Журнал общих работ"></label><label class="field"><span class="field__label">Тип</span><select class="select" name="doc_type">${Object.entries(DOC_TYPE_LABELS).map(([value, label]) => option(value, label, draft.doc_type || "aosr")).join("")}</select></label><label class="field"><span class="field__label">Раздел</span><select class="select" name="group_kind">${Object.entries(GROUP_LABELS).map(([value, label]) => option(value, label, draft.group_kind || "acts")).join("")}</select></label><label class="field template-modal-grid__wide"><span class="field__label">Заметка</span><textarea class="textarea" name="notes" rows="2" placeholder="Когда применять этот файл">${escapeHtml(draft.notes || "")}</textarea></label></div>
  </form>`;
  return modal({ title: "Новый шаблон", description: "ID Vault сохранит файл как обычный оригинал без изменения содержимого.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Добавить в библиотеку", action: "create-template-file", iconName: "upload", variant: "primary", type: "submit", disabled: creating, attributes: `form="newTemplateFileForm" aria-busy="${creating}"` })}`, size: "lg", labelledBy: "newTemplateModalTitle" });
}

function renderReplaceTemplateModal(state) {
  const template = templateById(state, state.modalData?.templateId);
  if (!template) return "";
  const hasFile = documentFileInfo(template).hasFile;
  const replacing = isBusy(state, "replace-template-file", template.id);
  const body = `<form id="replaceTemplateFileForm" class="template-modal-form" enctype="multipart/form-data"><input type="hidden" name="template_id" value="${escapeHtml(template.id)}">${state.modalData?.error ? `<div class="template-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(state.modalData.error)}</span></div>` : ""}<div class="replace-template-current"><span class="template-file-stamp mono${hasFile ? "" : " is-empty"}">${hasFile ? escapeHtml(documentFileInfo(template).extension.toLocaleUpperCase("ru-RU") || "—") : "НЕТ<br>ФАЙЛА"}</span><div><strong>${escapeHtml(template.title)}</strong><small>${hasFile ? `Текущая версия: ${escapeHtml(template.version || 1)}` : "Файл ещё не загружен"}</small></div></div><label class="template-dropzone">${icon(hasFile ? "refresh" : "upload", 26)}<span><strong>${hasFile ? "Выберите новую версию" : "Выберите файл шаблона"}</strong><small>DOCX, XLSX или PDF. ${hasFile ? "Новый файл станет текущей версией шаблона." : "После загрузки шаблон можно будет добавить в объект."}</small><em class="template-dropzone__filename">Файл не выбран</em></span><input name="file" type="file" required accept=".docx,.xlsx,.pdf"></label></form>`;
  return modal({ title: hasFile ? "Заменить файл шаблона" : "Загрузить файл шаблона", description: "Метаданные и место в библиотеке сохранятся.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: replacing })}${button({ label: hasFile ? "Сохранить новую версию" : "Загрузить файл", action: "replace-template-file", iconName: hasFile ? "refresh" : "upload", variant: "primary", type: "submit", disabled: replacing, attributes: `form="replaceTemplateFileForm" aria-busy="${replacing}"` })}`, size: "lg", labelledBy: "replaceTemplateModalTitle" });
}

function renderAddToObjectModal(state) {
  const template = templateById(state, state.modalData?.templateId);
  if (!template) return "";
  const copying = isBusy(state, "copy-template-to-object", template.id);
  const objects = (Array.isArray(state.objects) ? state.objects : []).filter((object) => object.status !== "archived");
  const selectedObjectId = state.modalData?.objectId || state.workspace?.object?.id || objects[0]?.id || "";
  const groups = Number(state.workspace?.object?.id) === Number(selectedObjectId) ? (state.workspace?.groups || []) : (state.templateTargetGroups || []);
  const body = `<form id="addTemplateToObjectForm" class="template-modal-form"><input type="hidden" name="template_id" value="${escapeHtml(template.id)}">${state.modalData?.error ? `<div class="template-modal-error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(state.modalData.error)}</span></div>` : ""}<div class="template-copy-source"><span class="template-file-stamp mono">${escapeHtml(documentFileInfo(template).extension.toLocaleUpperCase("ru-RU") || "—")}</span><div><span class="technical-eyebrow">Источник</span><strong>${escapeHtml(template.title)}</strong></div></div><div class="template-modal-grid"><label class="field template-modal-grid__wide"><span class="field__label">Объект</span><select class="select" name="object_id" required>${objects.map((object) => option(object.id, `${object.code || "Без кода"} · ${object.short_name || object.name}`, selectedObjectId)).join("")}</select></label><label class="field"><span class="field__label">Группа</span><select class="select" name="group_id">${option("", "Определить по типу", state.modalData?.groupId)}${groups.map((group) => option(group.id, group.title || "Группа", state.modalData?.groupId)).join("")}</select></label><label class="field"><span class="field__label">Номер</span><input class="control mono" name="number" value="${escapeHtml(state.modalData?.number || "")}" placeholder="Можно добавить позже"></label><label class="field template-modal-grid__wide"><span class="field__label">Название в объекте</span><input class="control" name="title" required value="${escapeHtml(state.modalData?.title || template.title || "")}"></label></div></form>`;
  return modal({ title: "Добавить шаблон в объект", description: "Будет создана запись и независимая копия файла в архиве объекта.", body, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: copying })}${button({ label: "Добавить в объект", action: "copy-template-to-object", iconName: "copy", variant: "primary", type: "submit", disabled: copying || !objects.length, attributes: `form="addTemplateToObjectForm" aria-busy="${copying}"` })}`, size: "lg", labelledBy: "addTemplateToObjectModalTitle" });
}

function renderArchiveTemplateModal(state) {
  const template = templateById(state, state.modalData?.templateId);
  if (!template) return "";
  const archiving = isBusy(state, "archive-template", template.id);
  return modal({ title: "Удалить шаблон?", description: "Он будет удалён из библиотеки шаблонов.", body: `<div class="archive-template-confirm"><span>${icon("trash", 22)}</span><div><strong>${escapeHtml(template.title)}</strong><small>Версия ${escapeHtml(template.version || 1)}</small></div></div>`, footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: archiving })}${button({ label: "Удалить шаблон", action: "confirm-archive-template", iconName: "trash", variant: "danger", disabled: archiving, attributes: `data-template-id="${escapeHtml(template.id)}" aria-busy="${archiving}"` })}`, size: "sm", labelledBy: "archiveTemplateModalTitle" });
}

export function renderTemplateModal(state) {
  if (state.modal === "template-preview") return renderPreviewModal(state);
  if (state.modal === "new-template") return renderNewTemplateModal(state);
  if (state.modal === "replace-template") return renderReplaceTemplateModal(state);
  if (state.modal === "add-template-to-object") return renderAddToObjectModal(state);
  if (state.modal === "archive-template") return renderArchiveTemplateModal(state);
  return "";
}

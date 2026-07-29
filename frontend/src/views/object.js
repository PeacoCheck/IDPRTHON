import { icon } from "../components/icons.js";
import { badge, button, emptyState, escapeHtml, iconButton, modal, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

function pluralRu(value, one, few, many) {
  const absolute = Math.abs(Number(value) || 0) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (last === 1) return one;
  if (last > 1 && last < 5) return few;
  return many;
}

const completionMeta = {
  not_started: { label: "Не начат", tone: "neutral", iconName: "circle" },
  in_progress: { label: "В работе", tone: "warning", iconName: "clock" },
  needs_revision: { label: "Требует правок", tone: "error", iconName: "alertCircle" },
  completed: { label: "Готов", tone: "ready", iconName: "checkCircle" },
};

const integrityMeta = {
  ok: { label: "Пройдено", tone: "ready", iconName: "checkCircle" },
  waived: { label: "Исключено", tone: "neutral", iconName: "info" },
  pending: { label: "Ожидает", tone: "warning", iconName: "clock" },
  warning: { label: "Проверьте", tone: "warning", iconName: "alertTriangle" },
  error: { label: "Не хватает", tone: "error", iconName: "alertCircle" },
};

const documentTypeLabels = {
  registry: "Реестр",
  general_journal: "Общий журнал",
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
  project: "Проект",
  working_documentation: "Рабочая документация",
  ppr: "ППР",
  method_statement: "Технологическая карта",
  imported: "Импортированный файл",
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
  return busy === action
    || (id !== null && [
      `${action}:${id}`,
      `${action}-${id}`,
      `${action}-${String(id)}`,
    ].includes(busy));
}

function option(value, label, selectedValue = null) {
  const selected = selectedValue !== null && selectedValue !== undefined && String(value) === String(selectedValue);
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function objectStatusBadge(object) {
  if (object?.status === "archived") {
    return badge({ label: "В архиве", tone: "neutral", iconName: "archive" });
  }
  if (!object?.status || object.status === "active") {
    return badge({ label: "Активный", tone: "ready", iconName: "checkCircle" });
  }
  return badge({ label: "Статус не указан", tone: "neutral", iconName: "info" });
}

function completionBadge(status) {
  const meta = completionMeta[status] || {
    label: "Статус не указан",
    tone: "neutral",
    iconName: "info",
  };
  return badge(meta);
}

function integrityBadge(status) {
  const meta = integrityMeta[status] || {
    label: "Не определено",
    tone: "neutral",
    iconName: "info",
  };
  return badge(meta);
}

function documentMatches(document, query) {
  if (!query) return true;
  return [document.number, document.title, document.doc_type, document.work_title, document.document_date]
    .some((value) => String(value || "").toLocaleLowerCase("ru-RU").includes(query));
}

function renderHeader(state, object) {
  const objectId = escapeHtml(object.id);
  const openingFolder = isBusy(state, "open-object-folder", object.id);
  return `<header class="object-header">
    <div class="object-header__identity">
      <div class="object-header__eyebrow">
        <span class="mono">${escapeHtml(object.code || "Без кода")}</span>
        ${objectStatusBadge(object)}
      </div>
      <h1>${escapeHtml(object.name || object.short_name || "Объект без названия")}</h1>
      <p>${icon("mapPin", 16)}<span>${escapeHtml(object.address || "Адрес не указан")}</span></p>
    </div>
    <div class="object-header__actions" aria-label="Действия с объектом">
      ${button({
        label: "Открыть папку",
        action: "open-object-folder",
        iconName: "folderOpen",
        variant: "secondary",
        disabled: openingFolder,
        attributes: `data-object-id="${objectId}" aria-busy="${openingFolder}"`,
      })}
      ${button({
        label: "Карточка объекта",
        action: "open-object-profile",
        iconName: "edit",
        variant: "secondary",
        attributes: `data-object-id="${objectId}"`,
      })}
      ${button({
        label: "Импорт",
        action: "open-import-document",
        iconName: "upload",
        variant: "secondary",
        attributes: `data-object-id="${objectId}"`,
      })}
      ${button({
        label: "Добавить документ",
        action: "open-new-document",
        iconName: "plus",
        variant: "primary",
        attributes: `data-object-id="${objectId}"`,
      })}
      ${iconButton({
        label: object.status === "archived" ? "Восстановить объект" : "Архивировать объект",
        action: object.status === "archived" ? "restore-object" : "archive-object",
        iconName: object.status === "archived" ? "restore" : "archive",
        attributes: `data-object-id="${objectId}"`,
      })}
    </div>
  </header>`;
}

function renderTabs(state, workspace) {
  const tab = state.objectTab === "integrity" ? "integrity" : "registry";
  const documents = Array.isArray(state.documents) ? state.documents : (workspace.documents || []);
  const issues = Number(workspace.integrity?.issues) || 0;
  return `<div class="object-tabs tabs" role="tablist" aria-label="Рабочее пространство объекта">
    <button class="tabs__button${tab === "registry" ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab === "registry"}" aria-controls="objectRegistry" data-action="set-object-tab" data-object-tab="registry">
      Реестр документов <span class="tabular">${numberFormat.format(documents.length)}</span>
    </button>
    <button class="tabs__button${tab === "integrity" ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab === "integrity"}" aria-controls="objectIntegrity" data-action="set-object-tab" data-object-tab="integrity">
      Комплектность <span class="tabular">${numberFormat.format(issues)}</span>
    </button>
  </div>`;
}

function renderGroups(state, workspace, documents) {
  const selected = String(state.selectedGroupId ?? "all");
  const groups = Array.isArray(workspace.groups) ? workspace.groups : [];
  return `<aside class="object-groups" aria-label="Группы документов">
    <header class="object-groups__header">
      <div><h2>Группы</h2><span>${numberFormat.format(groups.length)}</span></div>
      ${iconButton({ label: "Добавить группу", action: "open-new-group", iconName: "plus" })}
    </header>
    <nav class="object-groups__list">
      <button class="object-group${selected === "all" ? " is-active" : ""}" type="button" data-action="select-group" data-group="all" aria-current="${selected === "all" ? "true" : "false"}">
        <span class="object-group__icon">${icon("layers", 16)}</span>
        <span>Все документы</span>
        <strong class="tabular">${numberFormat.format(documents.length)}</strong>
      </button>
      ${groups.map((group) => `<button class="object-group${selected === String(group.id) ? " is-active" : ""}" type="button" data-action="select-group" data-group="${escapeHtml(group.id)}" aria-current="${selected === String(group.id) ? "true" : "false"}">
        <span class="object-group__icon">${icon("folder", 16)}</span>
        <span title="${escapeHtml(group.title)}">${escapeHtml(group.title || "Группа без названия")}</span>
        <strong class="tabular">${numberFormat.format(Math.max(0, Number(group.documents_count) || 0))}</strong>
      </button>`).join("")}
    </nav>
    ${button({ label: "Добавить группу", action: "open-new-group", iconName: "plus", variant: "ghost", size: "sm" })}
  </aside>`;
}

function renderDocumentActions(document) {
  const documentId = escapeHtml(document.id);
  return `<div class="data-table__actions">
    ${iconButton({
      label: "Открыть документ",
      action: "open-document",
      iconName: "edit",
      attributes: `data-document-id="${documentId}"`,
    })}
    ${document.source_file ? iconButton({
      label: "Открыть исходный файл",
      action: "open-source-document",
      iconName: "external",
      attributes: `data-document-id="${documentId}"`,
    }) : ""}
    ${document.output_file ? iconButton({
      label: "Скачать сформированный файл",
      action: "download-document",
      iconName: "download",
      attributes: `data-document-id="${documentId}"`,
    }) : ""}
    ${iconButton({
      label: "Удалить документ",
      action: "delete-document",
      iconName: "trash",
      attributes: `data-document-id="${documentId}"`,
    })}
  </div>`;
}

function renderDocumentsTable(documents) {
  return `<div class="data-table-wrap" tabindex="0" aria-label="Таблица документов">
    <table class="data-table">
      <thead>
        <tr>
          <th class="data-table__number">Номер</th>
          <th class="data-table__title">Документ</th>
          <th class="data-table__type">Тип</th>
          <th class="data-table__date">Дата</th>
          <th class="data-table__status">Готовность</th>
          <th class="data-table__menu"><span class="sr-only">Действия</span></th>
        </tr>
      </thead>
      <tbody>
        ${documents.map((document) => `<tr tabindex="0" data-document="${escapeHtml(document.id)}" aria-label="Открыть документ ${escapeHtml(document.number || document.title || document.id)}">
          <td class="data-table__number mono">${escapeHtml(document.number || "Без номера")}</td>
          <td class="data-table__title">
            <strong title="${escapeHtml(document.title || "")}">${escapeHtml(document.title || "Без названия")}</strong>
            <span title="${escapeHtml(document.work_title || "")}">${escapeHtml(document.work_title || "Описание работ не указано")}</span>
          </td>
          <td class="data-table__type">${escapeHtml(documentTypeLabels[document.doc_type] || "Документ")}</td>
          <td class="data-table__date tabular">${escapeHtml(document.document_date || "—")}</td>
          <td class="data-table__status">${completionBadge(document.completion_status)}</td>
          <td class="data-table__menu">${renderDocumentActions(document)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderRegistry(state, workspace) {
  const documents = Array.isArray(state.documents) ? state.documents : (workspace.documents || []);
  const selectedGroup = String(state.selectedGroupId ?? "all");
  const completionFilter = completionMeta[state.completionFilter] ? state.completionFilter : "all";
  const query = normalizedQuery(state.documentQuery);
  const grouped = selectedGroup === "all"
    ? documents
    : documents.filter((document) => String(document.group_id ?? "") === selectedGroup);
  const completed = completionFilter === "all"
    ? grouped
    : grouped.filter((document) => document.completion_status === completionFilter);
  const visible = completed.filter((document) => documentMatches(document, query));

  let content;
  if (!documents.length) {
    content = emptyState({
      iconName: "fileText",
      title: "Пока нет документов",
      description: "Добавьте документ из шаблона или импортируйте готовый файл.",
      action: button({ label: "Добавить документ", action: "open-new-document", iconName: "plus", variant: "secondary" }),
    });
  } else if (!visible.length) {
    content = emptyState({
      iconName: "search",
      title: "Документы не найдены",
      description: "Измените группу, статус готовности или поисковый запрос.",
      action: button({ label: "Сбросить фильтры", action: "clear-document-filters", variant: "secondary" }),
    });
  } else {
    content = renderDocumentsTable(visible);
  }

  return `<section class="object-registry" id="objectRegistry" role="tabpanel">
    ${renderGroups(state, workspace, documents)}
    <div class="registry-panel">
      <header class="registry-toolbar">
        <label class="registry-search" for="documentSearch">
          <span class="sr-only">Найти документ</span>
          ${icon("search", 16)}
          <input id="documentSearch" class="control" type="search" value="${escapeHtml(state.documentQuery || "")}" placeholder="Номер, название или работа" autocomplete="off">
        </label>
        <label class="registry-filter" for="completionFilter">
          <span class="sr-only">Статус готовности</span>
          ${icon("filter", 16)}
          <select id="completionFilter" class="select">
            ${option("all", "Все статусы", completionFilter)}
            ${option("not_started", "Не начат", completionFilter)}
            ${option("in_progress", "В работе", completionFilter)}
            ${option("needs_revision", "Требует правок", completionFilter)}
            ${option("completed", "Готов", completionFilter)}
          </select>
        </label>
        <span class="registry-result" aria-live="polite"><strong class="tabular">${numberFormat.format(visible.length)}</strong> из ${numberFormat.format(grouped.length)}</span>
      </header>
      <div class="registry-content">${content}</div>
    </div>
  </section>`;
}

function renderIntegrityCheck(state, check) {
  const status = integrityMeta[check.status] ? check.status : "pending";
  const ruleId = escapeHtml(check.id);
  const actionBusy = isBusy(state, check.status === "waived" ? "restore-integrity-rule" : "waive-integrity-rule", check.id);
  const action = check.status === "waived"
    ? button({
      label: "Восстановить",
      action: "restore-integrity-rule",
      iconName: "restore",
      variant: "secondary",
      size: "sm",
      disabled: actionBusy,
      attributes: `data-rule-id="${ruleId}" aria-busy="${actionBusy}"`,
    })
    : status === "ok"
      ? ""
      : button({
        label: "Исключить",
        action: "open-waive-rule",
        iconName: "archive",
        variant: "secondary",
        size: "sm",
        attributes: `data-rule-id="${ruleId}"`,
      });

  return `<article class="integrity-check integrity-check--${status}" data-integrity-rule="${ruleId}">
    <span class="integrity-check__status" aria-hidden="true">${icon(integrityMeta[status].iconName, 18)}</span>
    <div class="integrity-check__content">
      <div class="integrity-check__heading">
        <h3>${escapeHtml(check.title || check.code || "Правило комплектности")}</h3>
        ${integrityBadge(check.status)}
      </div>
      ${check.description ? `<p>${escapeHtml(check.description)}</p>` : ""}
      ${check.reason ? `<div class="integrity-check__reason"><strong>Причина:</strong> ${escapeHtml(check.reason)}${check.evidence ? `<span><strong>Подтверждение:</strong> ${escapeHtml(check.evidence)}</span>` : ""}</div>` : ""}
    </div>
    <div class="integrity-check__count">
      <strong class="tabular">${numberFormat.format(Math.max(0, Number(check.found) || 0))} / ${numberFormat.format(Math.max(0, Number(check.required) || 0))}</strong>
      <span>найдено</span>
    </div>
    <div class="integrity-check__action">${action}</div>
  </article>`;
}

function renderIntegrity(state, workspace) {
  const integrity = workspace.integrity || {};
  const checks = Array.isArray(integrity.checks) ? integrity.checks : [];
  const score = safePercent(integrity.score);
  const total = Math.max(0, Number(integrity.total) || 0);
  const satisfied = Math.min(total, Math.max(0, Number(integrity.satisfied) || 0));
  const issues = Math.max(0, Number(integrity.issues) || 0);

  return `<section class="object-integrity" id="objectIntegrity" role="tabpanel">
    <header class="integrity-summary">
      <div class="integrity-summary__copy">
        <span class="integrity-summary__eyebrow">Комплектность структуры</span>
        <div><strong class="tabular">${numberFormat.format(score)}%</strong><span>${numberFormat.format(satisfied)} из ${numberFormat.format(total)} требований выполнено</span></div>
      </div>
      <div class="integrity-summary__issues">
        ${issues ? icon("alertTriangle", 18) : icon("checkCircle", 18)}
        <span><strong class="tabular">${numberFormat.format(issues)}</strong> ${pluralRu(issues, "замечание", "замечания", "замечаний")}</span>
      </div>
      <div class="integrity-progress" role="progressbar" aria-label="Комплектность структуры" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"><span style="--integrity-progress:${score}%"></span></div>
    </header>
    <div class="integrity-list">
      ${checks.length
        ? checks.map((check) => renderIntegrityCheck(state, check)).join("")
        : emptyState({
          iconName: "checkCircle",
          title: "Правила не заданы",
          description: "Для профиля этого объекта нет обязательных правил комплектности.",
        })}
    </div>
  </section>`;
}

function renderLoadingView() {
  return `<section class="view-frame object-view" data-view="object">
    <div class="object-view__loading">
      ${skeleton("card", 1)}
      <div class="object-view__loading-grid">${skeleton("card", 1)}${skeleton("row", 7)}</div>
    </div>
  </section>`;
}

function renderErrorView(state) {
  return `<section class="view-frame object-view" data-view="object">
    <div class="object-feedback object-feedback--error">
      ${emptyState({
        iconName: "alertCircle",
        title: "Не удалось открыть объект",
        description: state.error || "Рабочее пространство объекта недоступно.",
        action: button({ label: "Повторить", action: "retry-object-workspace", iconName: "refresh", variant: "secondary" }),
      })}
    </div>
  </section>`;
}

export function renderObjectView(state) {
  const workspace = state.workspace;
  if (state.loading && !workspace) return renderLoadingView();
  if (!workspace?.object) return renderErrorView(state);

  const tab = state.objectTab === "integrity" ? "integrity" : "registry";
  return `<section class="view-frame object-view" data-view="object">
    ${renderHeader(state, workspace.object)}
    <div class="object-view__navigation">${renderTabs(state, workspace)}</div>
    ${state.error ? `<div class="object-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span>${button({ label: "Повторить", action: "retry-object-workspace", variant: "secondary", size: "sm" })}</div>` : ""}
    ${tab === "integrity" ? renderIntegrity(state, workspace) : renderRegistry(state, workspace)}
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
  const body = `<form id="objectProfileForm" class="object-modal-form">
    ${modalError(state)}
    <input type="hidden" name="object_id" value="${escapeHtml(object.id)}">
    <input type="hidden" name="profile" value="${escapeHtml(object.profile || "industrial_repair")}">
    <section class="object-form-section">
      <header><h3>Объект</h3><span class="mono">${escapeHtml(object.code || "Без кода")}</span></header>
      <div class="object-form-grid">
        <label class="field object-form-grid__wide"><span class="field__label">Полное наименование</span><input class="control" name="name" required minlength="2" value="${escapeHtml(object.name || "")}" autocomplete="organization"></label>
        <label class="field"><span class="field__label">Короткое название</span><input class="control" name="short_name" value="${escapeHtml(object.short_name || "")}" autocomplete="off"></label>
        <label class="field"><span class="field__label">Вид работ</span><input class="control" name="work_kind" value="${escapeHtml(meta.work_kind || "")}" placeholder="Капитальный ремонт"></label>
        <label class="field object-form-grid__wide"><span class="field__label">Адрес или площадка</span><input class="control" name="address" value="${escapeHtml(object.address || "")}" autocomplete="street-address"></label>
        <label class="field object-form-grid__wide"><span class="field__label">Комментарий</span><textarea class="textarea" name="comment" rows="2">${escapeHtml(object.comment || "")}</textarea></label>
      </div>
    </section>
    <section class="object-form-section">
      <header><h3>Организации</h3></header>
      <div class="object-form-grid">
        <label class="field"><span class="field__label">Заказчик</span><input class="control" name="customer_name" value="${escapeHtml(customer.name || "")}" autocomplete="organization"></label>
        <label class="field"><span class="field__label">ИНН заказчика</span><input class="control mono" name="customer_inn" value="${escapeHtml(customer.inn || "")}" inputmode="numeric"></label>
        <label class="field"><span class="field__label">Подрядчик</span><input class="control" name="contractor_name" value="${escapeHtml(contractor.name || "")}" autocomplete="organization"></label>
        <label class="field"><span class="field__label">ИНН подрядчика</span><input class="control mono" name="contractor_inn" value="${escapeHtml(contractor.inn || "")}" inputmode="numeric"></label>
      </div>
    </section>
    <section class="object-form-section">
      <header><h3>Основания работ</h3></header>
      <div class="object-form-grid">
        <label class="field object-form-grid__wide"><span class="field__label">Договор</span><input class="control" name="contract" value="${escapeHtml(meta.contract || "")}" placeholder="Договор № …"></label>
        <label class="field object-form-grid__wide"><span class="field__label">Проектная документация</span><textarea class="textarea" name="project_documentation" rows="2">${escapeHtml(meta.project_documentation || "")}</textarea></label>
      </div>
    </section>
    <section class="object-form-section">
      <header><h3>Ответственное лицо</h3></header>
      <div class="object-form-grid">
        <label class="field object-form-grid__wide"><span class="field__label">ФИО</span><input class="control" name="responsible_fio" value="${escapeHtml(responsible.fio || "")}" autocomplete="name"></label>
        <label class="field"><span class="field__label">Должность</span><input class="control" name="responsible_position" value="${escapeHtml(responsible.position || "")}" autocomplete="organization-title"></label>
        <label class="field"><span class="field__label">Приказ</span><input class="control" name="responsible_order" value="${escapeHtml(responsible.order || "")}" placeholder="Приказ № …"></label>
      </div>
    </section>
  </form>`;
  return modal({
    title: "Карточка объекта",
    description: "Эти данные автоматически подставляются в документы объекта.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: saving })}${button({ label: "Сохранить", action: "save-object-profile", iconName: "save", variant: "primary", type: "submit", disabled: saving, attributes: `form="objectProfileForm" data-object-id="${escapeHtml(object.id)}" aria-busy="${saving}"` })}`,
    size: "lg",
    labelledBy: "objectProfileModalTitle",
  });
}

function renderNewGroupModal(state) {
  const draft = state.modalData || {};
  const creating = isBusy(state, "create-group");
  const body = `<form id="newGroupForm" class="object-modal-form">
    ${modalError(state)}
    <label class="field"><span class="field__label">Название группы</span><input class="control" name="title" required minlength="2" autofocus value="${escapeHtml(draft.title || "")}" placeholder="Протоколы испытаний"><span class="field__helper">Группа появится в списке объекта</span></label>
    <label class="field"><span class="field__label">Раздел комплекта</span><select class="select" name="kind">${groupKinds.map(([value, label]) => option(value, label, draft.kind || "other")).join("")}</select></label>
    <label class="field"><span class="field__label">Описание</span><textarea class="textarea" name="description" rows="3" placeholder="Какие документы относятся к этой группе">${escapeHtml(draft.description || "")}</textarea></label>
    <label class="object-checkbox"><input type="checkbox" name="is_required" value="true"${draft.is_required ? " checked" : ""}><span><strong>Обязательная группа</strong><small>Учитывать отсутствие документов при проверке комплекта</small></span></label>
  </form>`;
  return modal({
    title: "Новая группа",
    description: "Группы помогают разделить документы и быстро переходить по реестру.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Добавить группу", action: "create-group", iconName: "plus", variant: "primary", type: "submit", disabled: creating, attributes: `form="newGroupForm" aria-busy="${creating}"` })}`,
    labelledBy: "newGroupModalTitle",
  });
}

function groupOptions(state, selected = null, emptyLabel = "Определить автоматически") {
  const groups = Array.isArray(state.workspace?.groups) ? state.workspace.groups : [];
  return `${option("", emptyLabel, selected)}${groups.map((group) => option(group.id, group.title || "Группа без названия", selected)).join("")}`;
}

function renderImportDocumentModal(state) {
  const draft = state.modalData || {};
  const importing = isBusy(state, "import-document-file");
  const body = `<form id="importDocumentForm" class="object-modal-form" enctype="multipart/form-data">
    ${modalError(state)}
    <label class="object-file-field">
      ${icon("upload", 24)}
      <span><strong>Выберите файл</strong><small>Документы, таблицы, PDF, изображения и чертежи до 100 МБ</small></span>
      <input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.jpg,.jpeg,.png,.dwg,.dxf,.txt">
    </label>
    <label class="field"><span class="field__label">Группа</span><select class="select" name="group_id">${groupOptions(state, draft.group_id)}</select><span class="field__helper">Если группу не выбрать, ID Vault определит её по имени и типу файла</span></label>
  </form>`;
  return modal({
    title: "Импорт документа",
    description: "Исходный файл будет сохранён в локальном хранилище объекта.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: importing })}${button({ label: "Импортировать", action: "import-document-file", iconName: "upload", variant: "primary", type: "submit", disabled: importing, attributes: `form="importDocumentForm" aria-busy="${importing}"` })}`,
    labelledBy: "importDocumentModalTitle",
  });
}

function renderWaiveRuleModal(state) {
  const rule = state.modalData?.rule || state.modalData || {};
  const saving = isBusy(state, "waive-integrity-rule", rule.id);
  const selectedType = rule.resolution_type || "not_applicable";
  const body = `<form id="waiveRuleForm" class="object-modal-form">
    ${modalError(state)}
    <input type="hidden" name="rule_id" value="${escapeHtml(rule.id || "")}">
    <div class="waive-rule-summary"><span>${icon("alertTriangle", 18)}</span><div><strong>${escapeHtml(rule.title || "Требование комплектности")}</strong>${rule.description ? `<p>${escapeHtml(rule.description)}</p>` : ""}</div></div>
    <label class="field"><span class="field__label">Решение</span><select class="select" name="resolution_type" required>${option("not_applicable", "Не применяется к объекту", selectedType)}${option("equivalent", "Заменено эквивалентным документом", selectedType)}${option("justified_exception", "Обоснованное исключение", selectedType)}${option("pending", "Ожидается позднее", selectedType)}</select></label>
    <label class="field"><span class="field__label">Причина</span><textarea class="textarea" name="reason" required minlength="5" rows="4" placeholder="Почему документ отсутствует или не требуется">${escapeHtml(rule.reason || "")}</textarea><span class="field__helper">Минимум 5 символов. Причина останется в проверке комплекта.</span></label>
    <label class="field"><span class="field__label">Подтверждающий документ</span><input class="control" name="evidence" value="${escapeHtml(rule.evidence || "")}" placeholder="Номер письма, акта или заменяющего документа"><span class="field__helper">Обязательно для замены эквивалентным документом</span></label>
  </form>`;
  return modal({
    title: "Исключить требование",
    description: "Исключение фиксируется вместе с причиной и остаётся обратимым.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: saving })}${button({ label: "Сохранить исключение", action: "waive-integrity-rule", iconName: "check", variant: "primary", type: "submit", disabled: saving, attributes: `form="waiveRuleForm" data-rule-id="${escapeHtml(rule.id || "")}" aria-busy="${saving}"` })}`,
    labelledBy: "waiveRuleModalTitle",
  });
}

function renderNewDocumentModal(state) {
  const draft = state.modalData || {};
  const templates = (Array.isArray(state.templates) ? state.templates : []).filter((template) => template.is_active !== false);
  const presets = Array.isArray(state.presets) ? state.presets : [];
  const creating = isBusy(state, "create-document");
  const templateId = draft.template_id ?? draft.templateId ?? null;
  const presetId = draft.preset_id ?? draft.presetId ?? null;
  const groupId = draft.group_id ?? draft.groupId ?? state.selectedGroupId;
  const body = `<form id="newDocumentForm" class="object-modal-form">
    ${modalError(state)}
    <input type="hidden" name="object_id" value="${escapeHtml(state.workspace?.object?.id || "")}">
    <div class="object-form-grid">
      <label class="field object-form-grid__wide"><span class="field__label">Шаблон</span><select class="select" name="template_id">${option("", "Без шаблона", templateId)}${templates.map((template) => option(template.id, `${template.title || "Шаблон без названия"} · версия ${template.version || 1}`, templateId)).join("")}</select><span class="field__helper">Поля объекта подставятся автоматически после создания</span></label>
      <label class="field"><span class="field__label">Пресет</span><select class="select" name="preset_id">${option("", "Без пресета", presetId)}${presets.map((preset) => option(preset.id, `${preset.title || "Пресет"} · ${documentTypeLabels[preset.doc_type] || "Документ"}`, presetId)).join("")}</select></label>
      <label class="field"><span class="field__label">Группа</span><select class="select" name="group_id">${groupOptions(state, groupId === "all" ? null : groupId)}</select></label>
      <label class="field"><span class="field__label">Номер</span><input class="control mono" name="number" value="${escapeHtml(draft.number || "")}" placeholder="Создастся автоматически"></label>
      <label class="field"><span class="field__label">Дата</span><input class="control tabular" name="document_date" value="${escapeHtml(draft.document_date || "")}" placeholder="ДД.ММ.ГГГГ" inputmode="numeric"></label>
      <label class="field object-form-grid__wide"><span class="field__label">Наименование документа</span><input class="control" name="title" required value="${escapeHtml(draft.title || "")}" placeholder="Акт освидетельствования скрытых работ"></label>
      <label class="field object-form-grid__wide"><span class="field__label">Работа или содержание</span><textarea class="textarea" name="work_title" rows="3" placeholder="Кратко опишите выполненные работы">${escapeHtml(draft.work_title || "")}</textarea></label>
    </div>
  </form>`;
  return modal({
    title: "Новый документ",
    description: "Создайте черновик, затем заполните обязательные поля в редакторе.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Создать документ", action: "create-document", iconName: "plus", variant: "primary", type: "submit", disabled: creating, attributes: `form="newDocumentForm" aria-busy="${creating}"` })}`,
    size: "lg",
    labelledBy: "newDocumentModalTitle",
  });
}

export function renderObjectModal(state) {
  if (state.modal === "object-profile") return renderObjectProfileModal(state);
  if (state.modal === "new-group") return renderNewGroupModal(state);
  if (state.modal === "import-document") return renderImportDocumentModal(state);
  if (state.modal === "waive-rule") return renderWaiveRuleModal(state);
  if (state.modal === "new-document") return renderNewDocumentModal(state);
  return "";
}

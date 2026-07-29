import { icon } from "../components/icons.js";

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const completionMap = {
  not_started: ["Не начат", "neutral"],
  in_progress: ["В работе", "progress"],
  needs_revision: ["Нужны правки", "warning"],
  completed: ["Готов", "success"],
};

const legacyCompletion = {
  draft: "not_started",
  review: "needs_revision",
  ready: "completed",
  generated: "completed",
  signed: "completed",
};

const groupIcons = {
  registry: "documents",
  journals: "templates",
  permits: "check",
  acts: "documents",
  quality: "catalog",
  schemes: "overview",
  source: "folder",
  working: "folder",
  evidence: "check",
  archive: "folder",
  acceptance: "check",
  issues: "warning",
  other: "folder",
};

function completionStatus(doc) {
  return doc.completion_status || legacyCompletion[doc.status] || "not_started";
}

function completionLabel(doc) {
  return completionMap[completionStatus(doc)]?.[0] || "Не начат";
}

function completionOptions(doc, includeAll = false) {
  const selected = doc ? completionStatus(doc) : "";
  return `${includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>Все статусы</option>` : ""}${Object.entries(completionMap)
    .map(([value, [label]]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("")}`;
}

function completionBadge(doc) {
  const [label, tone] = completionMap[completionStatus(doc)] || completionMap.not_started;
  return `<span class="status status--${tone}"><span class="status__dot"></span>${label}</span>`;
}

function integrityBadge(status) {
  const map = {
    ok: ["Есть", "success", "check"],
    waived: ["Не требуется", "muted", "check"],
    warning: ["Требует внимания", "warning", "warning"],
    error: ["Не найдено", "danger", "warning"],
    pending: ["Ожидается", "warning", "warning"],
  };
  const [label, tone, ico] = map[status] || map.error;
  return `<span class="integrity-badge integrity-badge--${tone}">${icon(ico)}${label}</span>`;
}

function documentKind(doc) {
  const title = `${doc.doc_type || ""} ${doc.title || ""}`.toLowerCase();
  if (title.includes("журнал")) return "ЖУРНАЛ";
  if (title.includes("акт")) return "АКТ";
  if (title.includes("схем")) return "СХЕМА";
  if (title.includes("приказ")) return "ПРИКАЗ";
  if (title.includes("реестр")) return "РЕЕСТР";
  return "ДОКУМЕНТ";
}

export function objectsView(state) {
  const objects = state.objects.filter((obj) => state.objectFilter === "archived" ? obj.status === "archived" : obj.status === "active");
  const activeObjects = state.objects.filter((obj) => obj.status === "active");
  const documentCount = activeObjects.reduce((sum, obj) => sum + Number(obj.documents_count || 0), 0);
  const issueCount = activeObjects.reduce((sum, obj) => sum + Number(obj.issues_count || 0), 0);
  const averageIntegrity = activeObjects.length
    ? Math.round(activeObjects.reduce((sum, obj) => sum + Number(obj.integrity || 0), 0) / activeObjects.length)
    : 0;
  const focusObject = activeObjects[0] || objects[0];
  return `<section class="surface-page workspace-home page-enter">
    <header class="hero-header hero-header--workspace">
      <div><span class="eyebrow">Рабочее пространство</span><h1>Исполнительная документация</h1><p>Объекты, комплекты и документы в одном понятном контуре.</p></div>
      <button class="button button--primary button--pill" data-action="new-object">${icon("plus")}Добавить объект</button>
    </header>
    <div class="bento-dashboard">
      ${focusObject ? `<button class="bento-tile bento-focus" data-open-object="${focusObject.id}"><div class="bento-focus__copy"><span class="eyebrow">Фокус сейчас</span><span class="bento-object-code">${esc(focusObject.code)}</span><h2>${esc(focusObject.short_name)}</h2><p>${esc(focusObject.name)}</p><small>${icon("folder")}${esc(focusObject.address)}</small></div><div class="bento-focus__footer"><span><strong>${focusObject.documents_count}</strong> документов</span><span><strong>${focusObject.issues_count}</strong> замечаний</span><em>Открыть объект ${icon("arrow")}</em></div><div class="bento-ring" style="--value:${focusObject.integrity}"><span>${focusObject.integrity}%</span><small>готово</small></div></button>` : `<article class="bento-tile bento-focus bento-focus--empty"><span class="eyebrow">Начало работы</span><h2>Создайте первый объект</h2><p>Стандартная структура разделов появится автоматически.</p></article>`}
      <article class="bento-tile bento-metric"><span class="metric-icon metric-icon--blue">${icon("overview")}</span><div><small>Активные объекты</small><strong>${activeObjects.length}</strong><p>комплектов в работе</p></div></article>
      <article class="bento-tile bento-metric"><span class="metric-icon metric-icon--violet">${icon("documents")}</span><div><small>Документы</small><strong>${documentCount}</strong><p>в реестрах объектов</p></div></article>
      <article class="bento-tile bento-metric"><span class="metric-icon metric-icon--green">${icon("check")}</span><div><small>Комплектность</small><strong>${averageIntegrity}%</strong><p>в среднем по объектам</p></div></article>
      <article class="bento-tile bento-metric ${issueCount ? "bento-metric--attention" : ""}"><span class="metric-icon metric-icon--amber">${icon("warning")}</span><div><small>Требует внимания</small><strong>${issueCount}</strong><p>пунктов без решения</p></div></article>
    </div>
    <div class="objects-toolbar">
      <label class="soft-search">${icon("search")}<input id="objectSearch" type="search" placeholder="Найти объект, код или адрес"></label>
      <div class="filter-pills"><button class="${state.objectFilter === "active" ? "is-active" : ""}" data-object-filter="active">Активные</button><button class="${state.objectFilter === "archived" ? "is-active" : ""}" data-object-filter="archived">Архив</button></div>
      <span class="objects-toolbar__count">${objects.length} ${objects.length === 1 ? "объект" : "объекта"}</span>
    </div>
    <div class="object-grid">
      ${objects.map((obj) => `<button class="object-card" data-open-object="${obj.id}">
        <div class="object-card__top"><span class="object-monogram">${esc(obj.code.slice(-3))}</span><span class="object-status object-status--${obj.status}"><i></i>${obj.status === "archived" ? "Архив" : "Активный"}</span><span class="object-card__arrow">${icon("arrow")}</span></div>
        <div class="object-card__body"><span>${esc(obj.code)}</span><h2>${esc(obj.short_name)}</h2><p>${esc(obj.name)}</p><small>${icon("folder")}${esc(obj.address)}</small></div>
        <div class="object-card__footer">
          <div><strong>${obj.documents_count}</strong><span>документов</span></div>
          <div><strong>${obj.integrity}%</strong><span>комплектность</span></div>
          <div class="${obj.issues_count ? "has-issues" : ""}"><strong>${obj.issues_count}</strong><span>замечаний</span></div>
        </div>
        <div class="object-card__progress"><i style="--value:${obj.integrity}"></i></div>
      </button>`).join("")}
      ${state.objectFilter === "active" ? `<button class="object-card object-card--add" data-action="new-object">${icon("plus")}<strong>Новый объект</strong><span>Добавить комплект документов</span></button>` : ""}
      ${state.objectFilter === "archived" && !objects.length ? `<div class="objects-empty">${icon("folder")}<strong>Архив пуст</strong><span>Здесь появятся завершённые объекты.</span></div>` : ""}
    </div>
  </section>`;
}

function registryPanel(state) {
  const workspace = state.workspace;
  const selected = state.selectedGroupId;
  const groupDocuments = selected === "all" ? workspace.documents : workspace.documents.filter((doc) => doc.group_id === Number(selected));
  const documents = state.completionFilter === "all"
    ? groupDocuments
    : groupDocuments.filter((doc) => completionStatus(doc) === state.completionFilter);
  const groups = new Map(workspace.groups.map((group) => [group.id, group]));
  const completed = groupDocuments.filter((doc) => completionStatus(doc) === "completed" && !doc.missing_fields_json?.length).length;
  const needsRevision = groupDocuments.filter((doc) => completionStatus(doc) === "needs_revision").length;
  const missingCount = groupDocuments.reduce((sum, doc) => sum + (doc.missing_fields_json?.length || 0), 0);
  return `<div class="object-layout">
    <aside class="group-nav">
      <div class="group-nav__header"><div><span>Разделы объекта</span><small>Пакеты документов</small></div><button class="icon-button" data-action="new-group" aria-label="Добавить группу">${icon("plus")}</button></div>
      <button class="${selected === "all" ? "is-active" : ""}" data-group="all">${icon("documents")}<span>Весь комплект</span><strong>${workspace.documents.length}</strong></button>
      ${workspace.groups.map((group) => `<button class="${String(selected) === String(group.id) ? "is-active" : ""}" data-group="${group.id}">${icon(groupIcons[group.kind] || "folder")}<span>${esc(group.title)}</span><strong>${group.documents_count}</strong>${group.issues_count ? '<i class="issue-dot"></i>' : ""}</button>`).join("")}
      <button class="group-nav__add" data-action="new-group">${icon("plus")}Своя группа</button>
      <div class="group-health"><span><i style="--value:${workspace.integrity.score}"></i></span><div><strong>${workspace.integrity.score}% готово</strong><small>${workspace.integrity.issues ? `${workspace.integrity.issues} пункта требуют решения` : "Комплект собран"}</small></div></div>
    </aside>
    <section class="registry">
      <div class="registry-overview">
        <div><span class="eyebrow">${selected === "all" ? "Реестр объекта" : "Раздел комплекта"}</span><h2>${selected === "all" ? "Весь комплект" : esc(groups.get(Number(selected))?.title || "Документы")}</h2><p>${groupDocuments.length} документов · статусы, обязательные поля и готовность</p></div>
        <div class="registry-kpis"><span><strong>${completed}</strong>готово</span><span class="${needsRevision ? "is-warning" : ""}"><strong>${needsRevision}</strong>на правках</span><span class="${missingCount ? "is-danger" : ""}"><strong>${missingCount}</strong>полей пусто</span></div>
      </div>
      <div class="registry-toolbar">
        <label class="soft-search">${icon("search")}<input id="workspaceSearch" placeholder="Поиск в объекте"></label>
        <label class="registry-filter"><span>Статус</span><select id="completionFilter">${completionOptions({ completion_status: state.completionFilter }, true)}</select></label>
        <div class="registry-toolbar__spacer"></div><button class="button button--primary button--pill" data-action="new-document">${icon("plus")}Добавить документ</button>
      </div>
      <div class="registry-table-wrap"><table class="registry-table"><thead><tr><th class="registry-index">№</th><th>Документ и работа</th><th>Раздел</th><th>Дата</th><th>Заполнение</th><th>Состояние</th><th></th></tr></thead><tbody>
        ${documents.map((doc) => `<tr>
          <td class="registry-index">${String(doc.id).padStart(2, "0")}</td>
          <td><button class="document-cell" data-document="${doc.id}"><span class="doc-icon">${icon(groupIcons[groups.get(doc.group_id)?.kind] || "documents")}</span><span><strong>${esc(doc.title)}</strong><small>${esc(doc.number)} · ${esc(doc.work_title)}</small></span></button></td>
          <td><span class="quiet-label">${esc(groups.get(doc.group_id)?.title || "Без группы")}</span></td>
          <td class="cell-nowrap">${esc(doc.document_date || "—")}</td>
          <td>${doc.missing_fields_json?.length ? `<span class="validation-chip validation-chip--warning">${icon("warning")}${doc.missing_fields_json.length} не заполнено</span>` : `<span class="validation-chip validation-chip--success">${icon("check")}Поля готовы</span>`}</td>
          <td><select class="completion-select completion-select--${completionStatus(doc)}" data-completion-document="${doc.id}" aria-label="Статус документа">${completionOptions(doc)}</select></td>
          <td><button class="row-arrow" data-document="${doc.id}" aria-label="Открыть документ">${icon("chevron")}</button></td>
        </tr>`).join("")}
      </tbody></table></div>
      ${documents.length ? "" : `<div class="registry-empty">${icon("documents")}<h3>${groupDocuments.length ? "Нет документов с таким статусом" : "В этой группе пока пусто"}</h3><p>${groupDocuments.length ? "Выберите другой статус." : "Добавьте готовый файл или создайте документ из шаблона."}</p><button class="button button--primary button--pill" data-action="new-document">Добавить документ</button></div>`}
    </section>
  </div>`;
}

function integrityPanel(state) {
  const integrity = state.workspace.integrity;
  const ready = integrity.checks.filter((check) => check.status === "ok").length;
  const pending = integrity.checks.filter((check) => check.status === "pending").length;
  const waived = integrity.checks.filter((check) => check.status === "waived").length;
  const blocking = integrity.checks.filter((check) => check.status === "error" || check.status === "warning").length;
  return `<section class="integrity-view page-enter">
    <div class="integrity-hero">
      <div class="clean-progress" style="--value:${integrity.score}"><span>${integrity.score}%</span></div>
      <div><span class="eyebrow">Контроль структуры</span><h2>Готовность и легитимность комплекта</h2><p>${integrity.issues ? "Каждое замечание можно закрыть документом или обоснованным исключением." : "Все обязательные разделы заполнены."}</p></div>
      <button class="button button--pill" data-action="refresh-integrity">Обновить</button>
    </div>
    <div class="integrity-metrics"><article><span>Готово</span><strong>${ready}</strong><small>правил подтверждено</small></article><article class="${blocking ? "has-warning" : ""}"><span>Блокеры</span><strong>${blocking}</strong><small>нужны документы</small></article><article><span>В работе</span><strong>${pending}</strong><small>черновики найдены</small></article><article><span>Исключения</span><strong>${waived}</strong><small>есть обоснование</small></article></div>
    <div class="integrity-list-header"><div><h3>Проверки комплекта</h3><p>Что требуется, что найдено и какое решение принято.</p></div><span>${integrity.checks.length} правил</span></div>
    <div class="integrity-list">
      ${integrity.checks.map((check) => `<article class="integrity-row">
        <span class="integrity-row__icon integrity-row__icon--${check.status}">${icon(check.status === "ok" || check.status === "waived" ? "check" : "warning")}</span>
        <div><strong>${esc(check.title)}</strong><p>${esc(check.description)}</p>${check.reason ? `<small>Обоснование: ${esc(check.reason)}${check.evidence ? ` · Подтверждение: ${esc(check.evidence)}` : ""}</small>` : ""}</div>
        <div class="integrity-row__count"><strong>${check.found}/${check.required}</strong><span>найдено</span></div>
        ${integrityBadge(check.status)}
        <div class="integrity-row__actions">
          ${check.status === "ok" ? `<button class="text-button" data-group-kind="${check.group_kind}">Показать</button>` : check.status === "waived" ? `<button class="text-button" data-action="restore-rule" data-rule="${check.id}">Снова учитывать</button>` : check.status === "pending" && check.pending_document_id ? `<button class="button button--small" data-document="${check.pending_document_id}">Открыть и заполнить</button>` : `<button class="button button--small" data-action="add-for-rule" data-rule="${check.id}">Добавить</button><button class="text-button" data-action="waive-rule" data-rule="${check.id}" data-rule-title="${esc(check.title)}">Указать причину</button>`}
        </div>
      </article>`).join("")}
    </div>
    <div class="integrity-legend"><strong>Обозначения</strong><span>${integrityBadge("ok")} документ добавлен</span><span>${integrityBadge("warning")} рекомендуется</span><span>${integrityBadge("error")} обязательно</span><span>${integrityBadge("pending")} в работе</span><span>${integrityBadge("waived")} не требуется</span></div>
  </section>`;
}

function profilePanel(state) {
  const obj = state.workspace.object;
  const meta = obj.meta_json || {};
  const constructionType = meta.construction_type ?? meta.work_kind ?? "";
  return `<section class="profile-view page-enter"><div class="profile-intro"><div><h2>Данные объекта</h2><p>Сведения, которые используются в новых документах.</p></div></div>
    <form id="objectProfileForm" class="profile-form">
      <section><header><span>01</span><div><h3>Объект</h3><p>Основные сведения</p></div></header><div class="form-grid"><label class="span-2"><span>Полное наименование</span><input name="name" value="${esc(obj.name)}"></label><label><span>Код объекта</span><input value="${esc(obj.code)}" disabled></label><label><span>Вид работ</span><input name="construction_type" value="${esc(constructionType)}" placeholder="Строительство, реконструкция или ремонт"></label><label class="span-2"><span>Адрес</span><input name="address" value="${esc(obj.address)}"></label><label class="span-2"><span>Краткая характеристика</span><textarea name="object_summary" rows="3" placeholder="Назначение, основные параметры и состав объекта">${esc(meta.object_summary)}</textarea></label><label><span>Дата начала работ</span><input type="date" name="start_date" value="${esc(meta.start_date)}"></label><label><span>Дата окончания работ</span><input type="date" name="end_date" value="${esc(meta.end_date)}"></label><label class="span-2"><span>Шифр рабочей документации</span><input name="project_documentation" value="${esc(meta.project_documentation)}"></label></div></section>
      <section><header><span>02</span><div><h3>Организации</h3><p>Участники строительства</p></div></header><div class="form-grid"><label><span>Заказчик</span><input name="customer_name" value="${esc(meta.customer?.name)}"></label><label><span>ИНН заказчика</span><input name="customer_inn" value="${esc(meta.customer?.inn)}"></label><label class="span-2"><span>Технический заказчик</span><input name="technical_customer_name" value="${esc(meta.technical_customer?.name)}"></label><label class="span-2"><span>Проектировщик</span><input name="designer_name" value="${esc(meta.designer?.name)}"></label><label><span>Подрядчик</span><input name="contractor_name" value="${esc(meta.contractor?.name)}"></label><label><span>ИНН подрядчика</span><input name="contractor_inn" value="${esc(meta.contractor?.inn)}"></label></div></section>
      <section><header><span>03</span><div><h3>Разрешительные документы</h3><p>Реквизиты для общего журнала работ</p></div></header><div class="form-grid"><label class="span-2"><span>Разрешение на строительство</span><input name="construction_permit" value="${esc(meta.construction_permit)}" placeholder="Номер, дата и кем выдано"></label><label class="span-2"><span>Заключение экспертизы</span><input name="project_expertise" value="${esc(meta.project_expertise)}" placeholder="Номер и дата заключения"></label></div></section>
      <section><header><span>04</span><div><h3>Ответственный</h3><p>Подписант и подтверждение полномочий</p></div></header><div class="form-grid"><label><span>ФИО</span><input name="responsible_fio" value="${esc(meta.responsible_person?.fio)}"></label><label><span>Должность</span><input name="responsible_position" value="${esc(meta.responsible_person?.position)}"></label><label class="span-2"><span>Приказ</span><input name="responsible_order" value="${esc(meta.responsible_person?.order)}"></label></div></section>
      <footer><span>${icon("check")}Изменения применятся к новым документам</span><button type="button" class="button button--primary button--pill" data-action="save-object-profile">Сохранить карточку</button></footer>
    </form>
  </section>`;
}

export function objectView(state) {
  const obj = state.workspace?.object;
  if (!obj) return `<div class="screen-loader">Открываю объект…</div>`;
  const canArchive = state.objects.filter((item) => item.status === "active").length > 1;
  const tabs = [["registry", "Реестр"], ["integrity", `Готовность ${state.workspace.integrity.issues ? `<span>${state.workspace.integrity.issues}</span>` : ""}`], ["profile", "Карточка объекта"]];
  return `<section class="object-workspace page-enter">
    <header class="object-header">
      <button class="back-link" data-route="objects">${icon("arrow")}Все объекты</button>
      <div class="object-header__main"><span class="object-monogram object-monogram--large">${esc(obj.code.slice(-3))}</span><div><span class="overline">${esc(obj.code)} · ${obj.status === "archived" ? "Архив" : "Активный объект"}</span><h1>${esc(obj.short_name)}</h1><p>${esc(obj.name)}</p><small class="object-address">${icon("folder")}${esc(obj.address || "Адрес не указан")}</small></div><div class="object-header__side"><div class="object-quick-stats"><span><strong>${state.workspace.documents.length}</strong>документов</span><span><strong>${state.workspace.integrity.score}%</strong>готово</span><span class="${state.workspace.integrity.issues ? "has-issues" : ""}"><strong>${state.workspace.integrity.issues}</strong>замечаний</span></div>${obj.status === "archived" ? `<button class="button button--pill object-header__archive" data-action="restore-object">Вернуть из архива</button>` : canArchive ? `<button class="text-button object-header__archive" data-action="archive-object">Переместить в архив</button>` : ""}</div></div>
      <nav class="object-tabs">${tabs.map(([key, label]) => `<button class="${state.objectTab === key ? "is-active" : ""}" data-object-tab="${key}">${label}</button>`).join("")}</nav>
    </header>
    ${state.objectTab === "registry" ? registryPanel(state) : state.objectTab === "integrity" ? integrityPanel(state) : profilePanel(state)}
  </section>`;
}

export function editorView(state) {
  const doc = state.selectedDocument || state.workspace?.documents?.[0];
  if (!doc) return `<div class="screen-loader">Документ не выбран</div>`;
  if (doc.source_kind === "imported") {
    return `<section class="document-editor page-enter">
      <header class="document-editor__header"><button class="back-link" data-route="object">${icon("arrow")}К реестру</button><div class="document-editor__title"><span class="doc-icon">${icon("folder")}</span><div><span class="overline">${esc(doc.number)} · ${completionLabel(doc)}</span><h1>${esc(doc.title)}</h1><p>${esc(state.workspace?.object?.short_name)}</p></div></div><div class="document-editor__actions"><select class="completion-select completion-select--${completionStatus(doc)}" data-completion-document="${doc.id}" aria-label="Статус документа">${completionOptions(doc)}</select><a class="button button--primary button--pill" href="/api/source/${doc.id}" target="_blank">${icon("arrow")}Открыть файл</a><details class="action-menu"><summary class="icon-button" aria-label="Другие действия">${icon("more")}</summary><div><button data-action="delete-document">${icon("close")}Удалить документ</button></div></details></div></header>
      <div class="imported-document"><span class="imported-document__icon">${icon("documents")}</span><div><h2>${esc(doc.title)}</h2><dl><div><dt>Группа</dt><dd>${esc(state.workspace?.groups?.find((group) => group.id === doc.group_id)?.title || "Без группы")}</dd></div><div><dt>Добавлен</dt><dd>${esc(doc.document_date)}</dd></div><div><dt>Статус</dt><dd>${esc(completionLabel(doc))}</dd></div></dl><a class="button button--pill" href="/api/source/${doc.id}" target="_blank">Скачать или открыть оригинал</a></div></div>
    </section>`;
  }
  const values = doc.values_json || {};
  const missing = doc.missing_fields_json || [];
  const template = state.templates.find((item) => item.id === doc.template_id);
  const fallbackFields = [
    { key: "project_doc", label: "Проектная документация", source: "object.meta.project_documentation" },
    { key: "materials", label: "Материалы", source: "manual", required: true },
    { key: "norms", label: "Нормативы", source: "preset.norms" },
  ];
  const fields = template?.fields_json?.length ? template.fields_json : fallbackFields;
  const linkedValues = {
    "act.number": doc.number,
    "order.number": doc.number,
    "scheme.number": doc.number,
    "journal.number": doc.number,
    "act.date": doc.document_date,
    "order.date": doc.document_date,
    "journal.date": doc.document_date,
    works: doc.work_title,
    scope: doc.work_title,
  };
  const fieldValue = (field) => linkedValues[field.key] ?? values[field.key] ?? "";
  const longField = (field) => /works|materials|rows|scope|result|norms|defects|responsibilities|deviations|documentation/.test(field.key);
  const completedFields = Math.max(0, fields.length - missing.length);
  const progress = fields.length ? Math.round((completedFields / fields.length) * 100) : 100;
  return `<section class="document-editor page-enter">
    <header class="document-editor__header">
      <div class="editor-heading"><button class="back-link" data-route="object">${icon("arrow")}К реестру</button><div class="document-editor__title"><span class="doc-icon">${icon("documents")}</span><div><span class="overline">${esc(doc.number || "Без номера")} · ${completionLabel(doc)}</span><h1>${esc(doc.title)}</h1><p>${esc(doc.work_title || "Описание работ не заполнено")}</p></div></div></div>
      <div class="document-editor__actions"><select id="editorCompletionStatus" class="completion-select completion-select--${completionStatus(doc)}" aria-label="Статус документа">${completionOptions(doc)}</select>${doc.status === "generated" && doc.output_file ? `<a class="button button--pill" href="/api/files/${doc.id}" target="_blank">${icon("arrow")}Открыть DOCX</a>` : ""}<button class="button button--pill" data-action="save-document">${icon("save")}Сохранить черновик</button><button class="button button--primary button--pill" data-action="generate-document">${icon("documents")}${doc.status === "generated" && doc.output_file ? "Обновить DOCX" : "Сформировать DOCX"}</button><details class="action-menu"><summary class="icon-button" aria-label="Другие действия">${icon("more")}</summary><div><button data-action="delete-document">${icon("close")}Удалить документ</button></div></details></div>
    </header>
    <div class="editor-progress"><span style="--value:${progress}"></span><p>${missing.length ? `${completedFields} из ${fields.length} полей готовы · ${missing.length} требуют заполнения` : "Все обязательные поля заполнены — документ готов к формированию"}</p><strong>${progress}%</strong></div>
    <div class="simple-editor-layout">
      <aside class="editor-outline"><span class="eyebrow">Структура</span><nav><button class="is-active" data-editor-section="editor-main-section"><span>01</span>Основные данные</button><button data-editor-section="editor-data-section"><span>02</span>Поля документа <em>${missing.length || "✓"}</em></button><button data-editor-section="editor-signers-section"><span>03</span>Подписанты</button></nav><div class="editor-outline__meta"><span>Шаблон</span><strong>${esc(template?.title || doc.doc_type || "Документ")}</strong><small>${fields.length} полей · ${completedFields} заполнено</small></div></aside>
      <form class="editor-form editor-form--clean" id="documentForm">
        <section id="editor-main-section" class="form-section form-section--clean"><header><span>01</span><div><h2>Основные данные</h2><p>Номер, дата и содержание документа</p></div></header><div class="form-grid"><label><span>Номер</span><input name="number" value="${esc(doc.number)}" placeholder="Можно заполнить позже"></label><label><span>Дата</span><input name="document_date" value="${esc(doc.document_date)}" placeholder="ДД.ММ.ГГГГ"></label><label class="span-2"><span>Наименование работ</span><textarea name="work_title" rows="3" placeholder="Опишите выполненные работы">${esc(doc.work_title)}</textarea></label></div></section>
        <section id="editor-data-section" class="form-section form-section--clean"><header><span>02</span><div><h2>Данные документа</h2><p>${esc(template?.title || "Поля документа")}</p></div><span class="section-counter">${completedFields}/${fields.length}</span></header><div class="template-field-grid">${fields.map((field) => {
          const value = fieldValue(field);
          const displayValue = typeof value === "object" ? JSON.stringify(value) : value;
          const isLinked = Object.hasOwn(linkedValues, field.key);
          const isStructured = typeof value === "object" && value !== null;
          const isManual = !isLinked && !isStructured && (field.source === "manual" || value === "");
          const isMissing = missing.includes(field.key);
          const binding = isLinked || isStructured ? "readonly" : `data-template-field="${esc(field.key)}"`;
          const control = longField(field)
            ? `<textarea name="${esc(field.key)}" ${binding} rows="3" ${field.required ? "required" : ""}>${esc(displayValue)}</textarea>`
            : `<input name="${esc(field.key)}" ${binding} value="${esc(displayValue)}" ${field.required ? "required" : ""}>`;
          return `<label class="${isMissing ? "field-missing" : ""}"><span>${esc(field.label)}${field.required ? " *" : ""}<em class="${isManual ? "is-manual" : ""}">${isManual ? "Ввести вручную" : "Связано с объектом"}</em></span>${control}${isMissing && !isLinked ? "<small>Нужно заполнить перед формированием DOCX</small>" : isLinked ? '<small class="field-source">Источник: карточка объекта</small>' : ""}</label>`;
        }).join("")}</div></section>
        <section id="editor-signers-section" class="form-section form-section--clean"><header><span>03</span><div><h2>Подписанты</h2><p>Ответственное лицо и основание полномочий</p></div></header><div class="resolved-person"><span class="avatar">КО</span><div><strong>${esc(state.workspace?.object?.meta_json?.responsible_person?.fio || "Ответственный не указан")}</strong><p>${esc(state.workspace?.object?.meta_json?.responsible_person?.position || "Должность не указана")} · ${esc(state.workspace?.object?.meta_json?.responsible_person?.order || "Приказ не указан")}</p></div><span class="linked-badge">${icon("check")}Из объекта</span></div></section>
      </form>
      <aside class="document-summary">
        <div class="document-summary__head"><div><span class="eyebrow">Предпросмотр</span><strong>Документ</strong></div><span>${missing.length ? `${missing.length} поля пусты` : "Поля готовы"}</span></div>
        <div class="summary-source"><span>${icon("check")}</span><div><strong>Объект и адрес</strong><p>${esc(state.workspace?.object?.short_name)}</p></div><em>Связано</em></div>
        <div class="summary-source"><span>${icon(missing.length ? "warning" : "check")}</span><div><strong>Работы и материалы</strong><p>Даты, объёмы и документы</p></div><em>${missing.length ? "Заполнить" : "Готово"}</em></div>
        <div class="mini-paper"><span>${documentKind(doc)}</span><strong>${esc(doc.title)}</strong><small>№ ${esc(doc.number || "—")} от ${esc(doc.document_date || "—")}</small><hr><p>${esc(doc.work_title || "Наименование работ будет показано здесь")}</p><div class="paper-lines"><i></i><i></i><i></i><i></i></div></div>
        <p class="preview-note">Предпросмотр структуры. Итоговый файл формируется из исходного шаблона Word.</p>
      </aside>
    </div>
  </section>`;
}

export function templatesView(state) {
  const groups = {};
  state.templates.forEach((template) => (groups[template.group_kind] ||= []).push(template));
  const labels = { registry: "Реестры", journals: "Журналы", permits: "Разрешительная документация", acts: "Акты и испытания", schemes: "Исполнительные схемы", quality: "Материалы и качество", source: "ППР и исходные документы" };
  return `<section class="surface-page template-library page-enter">
    <header class="hero-header hero-header--workspace"><div><span class="eyebrow">Библиотека</span><h1>Шаблоны документов</h1><p>Проверенные формы Word с привязкой к данным выбранного объекта.</p></div><span class="template-count">${state.templates.length} форм</span></header>
    <div class="library-toolbar"><label class="soft-search">${icon("search")}<input id="templateSearch" type="search" placeholder="Название, тип или поле документа"></label><div class="library-filters"><button class="is-active" data-template-group-filter="all">Все</button>${Object.keys(groups).map((kind) => `<button data-template-group-filter="${kind}">${labels[kind] || "Другие"}<span>${groups[kind].length}</span></button>`).join("")}</div></div>
    <div class="template-intro"><span>${icon("wand")}</span><div><strong>Шаблон не начинается с пустого листа</strong><p>Перед созданием ID Vault показывает, что будет взято из карточки объекта и какие значения нужно ввести вручную.</p></div><div class="template-intro__steps"><span><i>1</i>Выбрать форму</span><span><i>2</i>Проверить данные</span><span><i>3</i>Создать DOCX</span></div></div>
    <div id="templateSections">${Object.entries(groups).map(([kind, templates]) => `<section class="template-section" data-template-section="${kind}"><header><div><span class="template-section__icon">${icon(groupIcons[kind] || "documents")}</span><div><h2>${labels[kind] || "Другие документы"}</h2><p>Формы и готовые поля раздела</p></div></div><span>${templates.length} шаблонов</span></header><div class="template-grid">${templates.map((template) => { const total = template.fields_json?.length || 0; const required = template.fields_json?.filter((field) => field.required).length || 0; const automatic = template.fields_json?.filter((field) => field.source && field.source !== "manual").length || 0; return `<article class="template-card" data-template-card><div class="template-card__top"><div class="template-card__icon">${icon(groupIcons[kind] || "documents")}</div><span class="template-filetype">${template.template_file ? "DOCX" : "ФОРМА"}</span></div><h3>${esc(template.title)}</h3><p>${automatic} полей подставятся из объекта, ${Math.max(0, total - automatic)} останется проверить.</p><div class="template-card__meta"><span>${icon("check")}${automatic} связанных</span><span>${icon("warning")}${required} обязательных</span></div><div class="template-card__progress"><i style="--value:${total ? Math.round((automatic / total) * 100) : 0}"></i></div><footer><span class="template-card__hint">${total} полей · выбранный объект</span><button class="button button--small button--pill" data-action="use-template" data-template="${template.id}">Создать ${icon("arrow")}</button></footer></article>`; }).join("")}</div></section>`).join("")}</div>
    <div class="library-empty" hidden>${icon("search")}<strong>Шаблоны не найдены</strong><span>Попробуйте изменить запрос или фильтр.</span></div>
  </section>`;
}

export function commandPalette(state) {
  if (!state.commandOpen) return "";
  return `<div class="overlay" data-action="close-command"><section class="command command--soft" role="dialog" aria-modal="true" aria-label="Поиск" data-command><label>${icon("search")}<input id="globalSearch" autocomplete="off" placeholder="Объект, акт или документ…"><kbd>Esc</kbd></label><div id="searchResults"><div class="command-hint"><span>Быстрые переходы</span><button data-route="objects">${icon("overview")}Объекты</button><button data-route="templates">${icon("templates")}Шаблоны</button></div></div></section></div>`;
}

export function searchResultsView(results) {
  const group = (title, items, mapper) => items?.length ? `<div class="result-group"><span>${title}</span>${items.map(mapper).join("")}</div>` : "";
  return `${group("Объекты", results.objects, (item) => `<button data-open-object="${item.id}">${icon("overview")}<span><strong>${esc(item.short_name)}</strong><small>${esc(item.code)} · ${esc(item.address)}</small></span><em>Объект</em></button>`)}${group("Документы", results.documents, (item) => `<button data-document="${item.id}" data-object-id="${item.object_id}">${icon("documents")}<span><strong>${esc(item.number)}</strong><small>${esc(item.work_title)}</small></span><em>Документ</em></button>`)}${group("Шаблоны работ", results.presets, (item) => `<button data-route="templates">${icon("presets")}<span><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small></span><em>Шаблон</em></button>`)}${!results.objects?.length && !results.documents?.length && !results.presets?.length ? '<div class="no-results">Ничего не найдено</div>' : ""}`;
}

function modalView(state) {
  if (!state.modal) return "";
  if (state.modal === "new-object") {
    return `<div class="overlay" data-action="close-modal"><section class="sheet sheet--small" role="dialog" aria-modal="true" data-modal><header><div><h2>Добавить объект</h2><p>Укажите основные сведения.</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button></header><form id="newObjectForm"><label><span>Короткое название</span><input name="short_name" placeholder="Котельная № 4" required autofocus></label><label><span>Полное наименование</span><textarea name="name" rows="3" placeholder="Капитальный ремонт…" required></textarea></label><label><span>Адрес или площадка</span><input name="address" placeholder="ЦЭОТ № 2, котельная № 4"></label><footer><button type="button" class="button button--pill" data-action="close-modal">Отмена</button><button type="button" class="button button--primary button--pill" data-action="create-object">Создать объект</button></footer></form></section></div>`;
  }
  if (state.modal === "new-group") {
    return `<div class="overlay" data-action="close-modal"><section class="sheet sheet--small" role="dialog" aria-modal="true" data-modal><header><div><h2>Добавить группу</h2><p>Создайте свой раздел для документов.</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button></header><form id="newGroupForm"><label><span>Название</span><input name="title" placeholder="Котёл № 2 · сварка" required autofocus></label><label><span>Описание</span><textarea name="description" rows="3" placeholder="Что хранится в этой группе"></textarea></label><label><span>Тип</span><select name="kind"><option value="other">Своя группа</option><option value="acts">Акты и испытания</option><option value="journals">Журналы</option><option value="quality">Материалы и паспорта</option><option value="schemes">Исполнительные схемы</option></select></label><footer><button type="button" class="button button--pill" data-action="close-modal">Отмена</button><button type="button" class="button button--primary button--pill" data-action="create-group">Добавить группу</button></footer></form></section></div>`;
  }
  if (state.modal === "new-document") {
    const resolution = state.modalData?.resolution;
    const selectedPresetId = state.modalData?.presetId || null;
    const compatiblePresets = resolution ? state.presets.filter((preset) => preset.doc_type === resolution.template.doc_type) : [];
    return `<div class="overlay" data-action="close-modal"><section class="sheet sheet--document" role="dialog" aria-modal="true" data-modal><header><div><h2>${resolution ? esc(resolution.template.title) : "Добавить документ"}</h2><p>${resolution ? `${resolution.resolved_count} полей заполнено · ${resolution.manual_count} нужно указать` : "Добавьте готовый файл или создайте документ по шаблону."}</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button></header>
      ${resolution ? `<button class="back-link" data-action="back-to-templates">${icon("arrow")}Другой шаблон</button>${compatiblePresets.length ? `<div class="preset-choice"><span>Вариант работ</span><button class="${!selectedPresetId ? "is-active" : ""}" data-action="select-preset" data-template="${resolution.template.id}">Без варианта</button>${compatiblePresets.map((preset) => `<button class="${Number(selectedPresetId) === preset.id ? "is-active" : ""}" data-action="select-preset" data-template="${resolution.template.id}" data-preset="${preset.id}">${esc(preset.title)}</button>`).join("")}</div>` : ""}<div class="resolution-grid"><section><h3>Уже заполнено</h3>${resolution.fields.filter((field) => field.status === "resolved").map((field) => `<div class="resolution-row resolution-row--ready">${icon("check")}<span><strong>${esc(field.label)}</strong><small>${esc(typeof field.value === "object" ? JSON.stringify(field.value) : field.value)}</small></span><em>Готово</em></div>`).join("")}</section><section><h3>Нужно заполнить</h3>${resolution.fields.filter((field) => field.status === "manual").map((field) => `<div class="resolution-row">${icon("warning")}<span><strong>${esc(field.label)}</strong><small>Укажите значение в документе</small></span><em>Заполнить</em></div>`).join("")}</section></div><footer><button class="button button--primary button--pill" data-action="confirm-template" data-template="${resolution.template.id}">Создать документ ${icon("arrow")}</button></footer>` : `<div class="add-document-options"><button class="add-document-option" data-action="choose-document-file"><span class="add-document-option__icon">${icon("folder")}</span><span><strong>Добавить готовый файл</strong><small>PDF, Word, Excel, изображение или чертёж</small></span>${icon("arrow")}</button></div><div class="add-document-divider"><span>или выберите шаблон</span></div><div class="template-picker">${state.templates.map((template) => { const required = template.fields_json?.filter((field) => field.required).length || 0; return `<button data-action="select-template" data-template="${template.id}"><span class="template-picker__icon">${icon(groupIcons[template.group_kind] || "documents")}</span><span><strong>${esc(template.title)}</strong><small>${template.fields_json?.length || 0} полей${template.template_file ? " · Файл Word" : ""}</small></span><span class="required-count">${required} обязательных</span>${icon("chevron")}</button>`; }).join("")}</div>`}
    </section></div>`;
  }
  if (state.modal === "waive-rule") {
    return `<div class="overlay" data-action="close-modal"><section class="sheet sheet--small" role="dialog" aria-modal="true" data-modal><header><div><h2>Указать причину</h2><p>${esc(state.modalData?.title)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button></header><label><span>Решение</span><select id="waiverType"><option value="not_applicable">Не требуется</option><option value="equivalent">Заменено другим документом</option><option value="justified_exception">Есть обоснование</option><option value="pending">Будет добавлено позже</option></select></label><label><span>Причина</span><textarea id="waiverReason" rows="4" placeholder="Например: сварочные работы на объекте не выполняются" autofocus></textarea><small>Причина сохранится в комплектности объекта.</small></label><label><span>Подтверждение или ссылка</span><input id="waiverEvidence" placeholder="Номер письма, акта или путь к файлу"></label><footer><button class="button button--pill" data-action="close-modal">Отмена</button><button class="button button--primary button--pill" data-action="confirm-waiver" data-rule="${state.modalData?.ruleId}">Сохранить решение</button></footer></section></div>`;
  }
  if (state.modal === "delete-document") {
    return `<div class="overlay" data-action="close-modal"><section class="sheet sheet--small" role="dialog" aria-modal="true" aria-labelledby="deleteDocumentTitle" data-modal><header><div><h2 id="deleteDocumentTitle">Удалить документ?</h2><p>«${esc(state.modalData?.title || "Документ")}» будет удалён из объекта.</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button></header><p class="delete-document-note">Это действие нельзя отменить.</p><footer><button class="button button--pill" data-action="close-modal">Отмена</button><button class="button button--danger button--pill" data-action="confirm-delete-document" data-document="${state.modalData?.documentId}">${icon("close")}Удалить</button></footer></section></div>`;
  }
  return "";
}

export function shell(state, content) {
  const nav = [["objects", "overview", "Объекты"], ["templates", "templates", "Шаблоны"]];
  const title = { objects: "Объекты", object: state.workspace?.object?.short_name || "Объект", editor: "Документ", templates: "Шаблоны" }[state.route];
  const activeRoute = state.route === "object" || state.route === "editor" ? "objects" : state.route;
  const currentObject = state.workspace?.object;
  const quickAction = state.route === "objects"
    ? `<button class="button button--primary topbar-action" data-action="new-object">${icon("plus")}Новый объект</button>`
    : state.route === "object" || state.route === "editor"
      ? `<button class="button button--primary topbar-action" data-action="new-document">${icon("plus")}Документ</button>`
      : "";
  return `<div class="light-shell">
    <input id="documentFileInput" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.tif,.tiff,.dwg,.dxf" hidden>
    <aside class="light-rail"><button class="brand brand--light" data-route="objects" aria-label="ID Vault"><span>${icon("vault")}</span><div><strong>ID Vault</strong><small>Исполнительная документация</small></div></button><div class="rail-section"><span>Работа</span><nav>${nav.map(([route, ico, label]) => `<button data-route="${route}" class="${activeRoute === route ? "is-active" : ""}" aria-label="${label}" ${activeRoute === route ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span>${route === "objects" ? `<em>${state.objects.filter((item) => item.status === "active").length}</em>` : ""}</button>`).join("")}</nav></div>${currentObject ? `<div class="rail-section rail-context"><span>Текущий объект</span><button data-open-object="${currentObject.id}"><i class="object-mini-mark">${esc(currentObject.code.slice(-3))}</i><span><strong>${esc(currentObject.short_name)}</strong><small>${esc(currentObject.code)}</small></span>${icon("chevron")}</button></div>` : ""}<div class="light-rail__bottom"><span class="avatar avatar--small">ОК</span><div><strong>Рабочий профиль</strong><small>Локальное хранилище</small></div></div></aside>
    <main class="light-main"><header class="light-topbar"><div class="light-topbar__title"><span>Рабочее пространство</span><i>/</i><p>${esc(title)}</p></div><div>${quickAction}<button class="top-search" data-action="open-command">${icon("search")}<span>Найти документ</span><kbd>Ctrl K</kbd></button><button class="icon-button" data-action="toggle-theme" aria-label="Сменить тему">${icon(state.theme === "dark" ? "sun" : "moon")}</button></div></header><div class="light-content">${content}</div></main>
    ${commandPalette(state)}${modalView(state)}
  </div>`;
}

export function toastView(state) {
  if (!state.toast) return "";
  return `<div class="toast toast--${state.toast.tone}" role="status">${state.toast.tone === "error" ? icon("warning") : icon("check")}<span>${esc(state.toast.message)}</span><button class="icon-button" data-action="close-toast">${icon("close")}</button></div>`;
}

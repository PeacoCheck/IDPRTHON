import { icon } from "../components/icons.js";
import {
  documentFileInfo,
  formatFileDate,
  formatFileSize,
  previewUrl,
  renderFilePreview,
} from "../components/file-preview.js";
import { badge, button, emptyState, escapeHtml, modal, skeleton } from "../components/ui.js";

const completionMeta = {
  not_started: { label: "Ожидается", tone: "neutral", iconName: "circle" },
  in_progress: { label: "В работе", tone: "warning", iconName: "clock" },
  needs_revision: { label: "На правках", tone: "error", iconName: "alertCircle" },
  completed: { label: "Готов", tone: "ready", iconName: "checkCircle" },
};

const docTypeLabels = {
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

function isBusy(state, action, id) {
  const busy = String(state.busyAction || "");
  return busy === action || busy === `${action}-${id}` || busy === `${action}:${id}`;
}

function completionBadge(value) {
  return badge(completionMeta[value] || completionMeta.not_started);
}

function completionSelect(document, state) {
  const value = completionMeta[document?.completion_status] ? document.completion_status : "not_started";
  const busy = isBusy(state, "change-completion", document?.id);
  return `<label class="file-status-control">
    <span>Состояние</span>
    <select class="select file-status-control__select file-status-control__select--${escapeHtml(value)}" name="completion_status" data-action="change-completion" data-document="${escapeHtml(document?.id)}" aria-label="Состояние документа" ${busy ? "disabled" : ""}>
      ${Object.entries(completionMeta).map(([key, meta]) => `<option value="${key}"${key === value ? " selected" : ""}>${meta.label}</option>`).join("")}
    </select>
  </label>`;
}

function groupTitle(state, document) {
  return state.workspace?.groups?.find((group) => Number(group.id) === Number(document.group_id))?.title || "Без группы";
}

function formatDate(value) {
  if (!value) return "Не указана";
  const direct = String(value);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(direct)) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? direct : new Intl.DateTimeFormat("ru-RU").format(date);
}

function renderInspectorHeader(state, document) {
  const file = documentFileInfo(document);
  const busy = isBusy(state, "upload-document-file", document.id);
  return `<header class="file-inspector-header">
    <div class="file-inspector-header__identity">
      <button class="file-inspector-back" type="button" data-route="object" aria-label="К реестру">${icon("arrowLeft", 18)}<span>К реестру</span></button>
      <span class="file-inspector-header__rule" aria-hidden="true"></span>
      <div>
        <div class="file-inspector-header__eyebrow"><span class="mono">${escapeHtml(document.number || `ID-${document.id}`)}</span>${completionBadge(document.completion_status)}</div>
        <h1>${escapeHtml(document.title || file.fileName)}</h1>
      </div>
    </div>
    <div class="file-inspector-header__actions">
      ${file.hasFile ? `<a class="button button--secondary button--sm" href="${escapeHtml(document.file_info?.download_url || previewUrl(document.id))}" download="${escapeHtml(file.fileName)}">${icon("download", 16)}<span class="button__label">Скачать</span></a>` : ""}
      <label class="button button--primary button--sm${busy ? " is-busy" : ""}">
        ${icon(file.hasFile ? "refresh" : "upload", 16)}<span class="button__label">${file.hasFile ? "Заменить файл" : "Добавить файл"}</span>
        <input type="file" data-document-file-input data-document-id="${escapeHtml(document.id)}" hidden ${busy ? "disabled" : ""}>
      </label>
      ${button({ label: "Убрать из реестра", action: "delete-document", iconName: "trash", variant: "ghost", size: "sm", attributes: `data-document="${escapeHtml(document.id)}"` })}
    </div>
  </header>`;
}

function renderFileFacts(state, document) {
  const file = documentFileInfo(document);
  const extension = file.extension ? file.extension.toLocaleUpperCase("ru-RU") : "—";
  return `<section class="file-facts" aria-label="Сведения о документе">
    <header><span class="file-panel-label">Карточка</span><strong>${escapeHtml(docTypeLabels[document.doc_type] || "Документ")}</strong></header>
    <dl>
      <div><dt>Группа</dt><dd>${escapeHtml(groupTitle(state, document))}</dd></div>
      <div><dt>Дата документа</dt><dd class="tabular">${escapeHtml(formatDate(document.document_date))}</dd></div>
      <div><dt>Имя файла</dt><dd title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</dd></div>
      <div><dt>Формат</dt><dd class="mono">${escapeHtml(extension)}</dd></div>
      <div><dt>Размер</dt><dd>${escapeHtml(formatFileSize(file.size))}</dd></div>
      <div><dt>Обновлён</dt><dd>${escapeHtml(formatFileDate(file.updatedAt))}</dd></div>
    </dl>
    ${document.work_title ? `<div class="file-facts__note"><span>Примечание</span><p>${escapeHtml(document.work_title)}</p></div>` : ""}
  </section>`;
}

function renderVersions(state, document) {
  const versions = state.fileVersionsDocumentId === document.id && Array.isArray(state.fileVersions)
    ? state.fileVersions
    : [];
  const loading = isBusy(state, "load-file-versions", document.id);
  const open = state.fileVersionsOpen !== false;
  return `<section class="file-versions${open ? " is-open" : ""}">
    <button type="button" class="file-versions__toggle" data-action="toggle-file-versions" data-document-id="${escapeHtml(document.id)}" aria-expanded="${open}">
      <span>${icon("history", 17)}<strong>Версии файла</strong></span>
      <span>${versions.length ? versions.length : ""}${icon(open ? "chevronDown" : "chevronRight", 16)}</span>
    </button>
    ${open ? `<div class="file-versions__list" data-auto-animate="versions">
      ${loading
        ? `${skeleton("row", 3)}`
        : versions.length
          ? versions.map((version, index) => `<a class="file-version${version.current ? " is-current" : ""}" href="${escapeHtml(version.download_url || `/api/documents/${document.id}/versions/${version.id}`)}" download>
              <span class="file-version__index mono">${version.current ? "ТЕК" : `V${escapeHtml(version.version || versions.length - index)}`}</span>
              <span><strong>${escapeHtml(version.file_name || version.name || "Версия файла")}</strong><small>${escapeHtml(formatFileDate(version.created_at || version.date))} · ${escapeHtml(formatFileSize(version.file_size ?? version.size))}</small></span>
              ${version.current ? badge({ label: "Текущая", tone: "primary" }) : icon("download", 16)}
            </a>`).join("")
          : `<div class="file-versions__empty"><span>${icon("history", 20)}</span><p>Предыдущих замен пока нет. После замены исходная версия останется здесь.</p></div>`}
    </div>` : ""}
  </section>`;
}

function renderEditorLoading() {
  return `<section class="view-frame file-inspector-view" data-view="editor" aria-label="Загрузка файла">
    <div class="file-inspector-loading__header">${skeleton("line", 2)}</div>
    <div class="file-inspector-layout">${skeleton("card", 1)}<aside>${skeleton("row", 5)}</aside></div>
  </section>`;
}

export function renderEditorView(state) {
  if (state.loading) return renderEditorLoading();
  const document = state.selectedDocument;
  if (!document) {
    return `<section class="view-frame file-inspector-view" data-view="editor">${emptyState({
      iconName: state.error ? "alertCircle" : "fileText",
      title: state.error ? "Не удалось открыть документ" : "Документ не выбран",
      description: state.error || "Вернитесь в реестр объекта и выберите запись.",
      action: button({ label: "К реестру", action: "back-to-object", iconName: "arrowLeft", variant: "secondary", attributes: 'data-route="object"' }),
    })}</section>`;
  }

  const file = documentFileInfo(document);
  return `<section class="view-frame file-inspector-view" data-view="editor" data-document-inspector="${escapeHtml(document.id)}">
    ${renderInspectorHeader(state, document)}
    ${state.error ? `<div class="file-inspector-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span>${button({ label: "Повторить", action: "retry-editor", variant: "secondary", size: "sm" })}</div>` : ""}
    <div class="file-inspector-layout">
      <main class="file-inspector-preview" data-file-drop data-document-id="${escapeHtml(document.id)}">
        <header class="file-inspector-preview__bar">
          <div><span class="file-panel-label">Предпросмотр</span><strong title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</strong></div>
          <span class="file-inspector-preview__format mono">${escapeHtml(file.extension ? `.${file.extension}` : "ОЖИДАЕТСЯ")}</span>
        </header>
        ${renderFilePreview(document)}
        <div class="file-drop-overlay" aria-hidden="true"><span>${icon("upload", 28)}</span><strong>${file.hasFile ? "Заменить этим файлом" : "Добавить файл в документ"}</strong><small>Отпустите файл, чтобы сохранить его в локальном архиве</small></div>
      </main>
      <aside class="file-inspector-side">
        ${completionSelect(document, state)}
        ${renderFileFacts(state, document)}
        ${renderVersions(state, document)}
      </aside>
    </div>
  </section>`;
}

// Legacy export kept so older application glue can update without exposing the former field editor.
export function renderEditorValidation() {
  return "";
}

export function renderEditorModal(state) {
  if (state.modal !== "delete-document") return "";
  const document = state.modalData?.document || state.selectedDocument || {};
  const documentId = state.modalData?.documentId ?? document.id ?? "";
  const title = state.modalData?.title || document.title || "Документ";
  const deleting = isBusy(state, "confirm-delete-document", documentId) || isBusy(state, "delete-document", documentId);
  const body = `<div class="delete-document-copy">
    <span>${icon("alertTriangle", 20)}</span>
    <div><strong>${escapeHtml(title)}</strong><p>Запись исчезнет из реестра объекта. Сохранённый оригинал не удаляется с диска без отдельного подтверждения.</p></div>
  </div>`;
  return modal({
    title: "Убрать документ из реестра?",
    description: "Проверьте выбранную запись перед удалением.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: deleting })}${button({ label: "Убрать", action: "confirm-delete-document", iconName: "trash", variant: "danger", disabled: deleting, attributes: `data-document="${escapeHtml(documentId)}" aria-busy="${deleting}"` })}`,
    size: "sm",
    labelledBy: "deleteDocumentModalTitle",
  });
}

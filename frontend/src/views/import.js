import { icon } from "../components/icons.js";
import { badge, button, escapeHtml, emptyState } from "../components/ui.js";
import { renderBulkMatchingTable } from "../components/bulk-import.js";

export function renderBatchImportView(state) {
  const object = state.workspace?.object;
  const objectId = object?.id || "current";

  return `
    <div class="view-frame import-view" data-view="import">
      <header class="objects-header">
        <div>
          <span class="technical-eyebrow">Массовая загрузка файлов</span>
          <h1>Импорт в ${escapeHtml(object?.name || "Текущий объект")}</h1>
          <p>Автоматическое сопоставление файлов с ожидаемыми документами по именам</p>
        </div>
        <a href="#/objects/${objectId}" class="button button--secondary">
          ${icon("arrowLeft", 14)} <span class="button__label">Вернуться к объекту</span>
        </a>
      </header>

      <form id="standaloneBatchImportForm" class="import-standalone-form" enctype="multipart/form-data">
        <input type="hidden" name="object_id" value="${escapeHtml(objectId)}">
        <label class="object-file-field">
          ${icon("upload", 32)}
          <span>
            <strong>Перетащите файлы сюда или нажмите для выбора</strong>
            <small>Выберите несколько документов (PDF, Word, Excel, изображения, чертежи)</small>
          </span>
          <input name="files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.txt">
        </label>

        <div class="import-file-list" data-import-file-list>
          ${emptyState({
            iconName: "uploadCloud",
            title: "Файлы не выбраны",
            description: "После выбора файлов здесь появится таблица предпросмотра и автоматического сопоставления с разделами и документами объекта."
          })}
        </div>

        <div class="import-form-footer">
          ${button({ label: "Подтвердить массовый импорт", action: "submit-batch-import", iconName: "check", variant: "primary", type: "submit", attributes: 'form="standaloneBatchImportForm"' })}
        </div>
      </form>
    </div>
  `;
}

import { escapeHtml } from "./ui.js";

const keywordGroupRules = [
  { keywords: ["аоср", "акт", "испытани", "проток", "авк", "освидетельствов"], groupId: "acts" },
  { keywords: ["вик", "контроль", "ультразвук", "рентген"], groupId: "acts" },
  { keywords: ["журнал", "кс-6", "сварк", "входного"], groupId: "journals" },
  { keywords: ["схема", "чертеж", "план", "разрез", "геодез"], groupId: "schemes" },
  { keywords: ["паспорт", "сертификат", "качество", "деклараци", "шифр"], groupId: "quality" },
  { keywords: ["ппр", "техкарта", "проект", "рд", "пд"], groupId: "source" },
  { keywords: ["приказ", "разрешен", "лицензи", "допуск", "сро"], groupId: "permits" },
];

export function detectFileGroup(filename, defaultGroupId = "other") {
  const nameLower = String(filename || "").toLocaleLowerCase("ru-RU");
  for (const rule of keywordGroupRules) {
    if (rule.keywords.some((kw) => nameLower.includes(kw))) {
      return rule.groupId;
    }
  }
  return defaultGroupId || "other";
}

export function findMatchingDocument(filename, documents = []) {
  const nameLower = String(filename || "").toLocaleLowerCase("ru-RU");
  return documents.find((doc) => {
    if (!doc.title) return false;
    const titleLower = String(doc.title).toLocaleLowerCase("ru-RU");
    return nameLower.includes(titleLower) || (doc.number && nameLower.includes(String(doc.number).toLocaleLowerCase("ru-RU")));
  }) || null;
}

export function isDuplicateFile(filename, documents = []) {
  const nameLower = String(filename || "").toLocaleLowerCase("ru-RU");
  return documents.some((doc) => {
    const docFile = doc.filename || doc.original_name;
    if (!docFile) return false;
    return String(docFile).toLocaleLowerCase("ru-RU") === nameLower;
  });
}

export function renderBulkMatchingTable(filesList, groups = [], documents = []) {
  if (!filesList || filesList.length === 0) return "";

  const rowsHtml = Array.from(filesList).map((file, index) => {
    const filename = file.name;
    const detectedGroup = detectFileGroup(filename);
    const matchedDoc = findMatchingDocument(filename, documents);
    const duplicate = isDuplicateFile(filename, documents);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

    return `
      <tr class="bulk-match-row${duplicate ? " is-duplicate" : ""}" data-file-index="${index}">
        <td>
          <input type="checkbox" class="checkbox bulk-file-select" name="file_selected_${index}" value="1" checked aria-label="Выбрать файл ${escapeHtml(filename)}">
        </td>
        <td>
          <div class="bulk-file-name">
            <strong>${escapeHtml(filename)}</strong>
            <small>${sizeMb} МБ ${duplicate ? `<span class="badge badge--error">Дубликат</span>` : ""}</small>
          </div>
        </td>
        <td>
          <select class="select select--sm bulk-group-select" name="group_id_${index}">
            <option value="">-- Авто --</option>
            ${groups.map((g) => `<option value="${escapeHtml(g.id)}"${String(g.id) === String(detectedGroup) ? " selected" : ""}>${escapeHtml(g.name || g.title)}</option>`).join("")}
          </select>
        </td>
        <td>
          <span class="bulk-matched-pos">
            ${matchedDoc ? `<span class="badge badge--ready">${escapeHtml(matchedDoc.title)}</span>` : `<span class="text-soft font-sm">Новая позиция</span>`}
          </span>
        </td>
        <td>
          <select class="select select--sm bulk-status-select" name="status_${index}">
            <option value="completed" selected>Готов</option>
            <option value="in_progress">В работе</option>
            <option value="needs_revision">На правках</option>
            <option value="not_started">Ожидается</option>
          </select>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="bulk-import-container">
      <div class="bulk-import-toolbar">
        <label class="checkbox-label">
          <input type="checkbox" class="checkbox" id="bulkSelectAll" checked>
          <span>Выбрать все (${filesList.length})</span>
        </label>
        <div class="bulk-batch-actions">
          <select class="select select--sm" id="bulkApplyGroup">
            <option value="">Назначить группу всем выбранным...</option>
            ${groups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name || g.title)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="table-frame">
        <table class="table bulk-match-table">
          <thead>
            <tr>
              <th style="width: 40px;"></th>
              <th>Имя файла</th>
              <th>Назначенная группа</th>
              <th>Сопоставление с позицией</th>
              <th>Рабочий статус</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

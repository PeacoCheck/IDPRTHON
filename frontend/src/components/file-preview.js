import { renderAsync as renderDocx } from "docx-preview";

import { icon } from "./icons.js";
import { escapeHtml } from "./ui.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const WORD_EXTENSIONS = new Set(["docx"]);
const SHEET_EXTENSIONS = new Set(["xlsx", "xlsm"]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function basename(value) {
  return String(value || "").split(/[\\/]/).at(-1) || "";
}

function extensionOf(value) {
  const match = String(value || "").toLocaleLowerCase("ru-RU").match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function parseFileInfo(document) {
  const values = document?.values_json && typeof document.values_json === "object" ? document.values_json : {};
  const info = document?.file_info && typeof document.file_info === "object" ? document.file_info : {};
  const rawName = info.file_name
    || document?.file_name
    || values.file_name
    || basename(document?.source_file)
    || basename(document?.output_file);
  const extension = String(info.file_extension || info.extension || document?.file_extension || extensionOf(rawName)).replace(/^\./, "").toLocaleLowerCase("ru-RU");
  const size = Number(info.file_size ?? document?.file_size ?? values.file_size);
  const hasFile = Boolean(info.exists ?? info.has_file ?? document?.has_file ?? rawName);
  return {
    fileName: rawName || "Файл не добавлен",
    extension,
    size: Number.isFinite(size) && size >= 0 ? size : null,
    updatedAt: info.updated_at || document?.file_updated_at || document?.updated_at || null,
    hasFile,
    mediaType: info.media_type || info.content_type || "",
  };
}

export function documentFileInfo(document) {
  return parseFileInfo(document);
}

export function previewUrl(documentId) {
  return `/api/preview/${encodeURIComponent(documentId)}`;
}

function spreadsheetPreviewUrl(id, template) {
  return template
    ? `/api/templates/${encodeURIComponent(id)}/spreadsheet-preview`
    : `/api/preview/${encodeURIComponent(id)}/spreadsheet`;
}

export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Размер не определён";
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`.replace(".0 ", " ");
}

export function formatFileDate(value) {
  if (!value) return "Дата не определена";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function previewKind(extension) {
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (WORD_EXTENSIONS.has(extension)) return "docx";
  if (SHEET_EXTENSIONS.has(extension)) return "sheet";
  if (extension === "txt" || extension === "md") return "text";
  return "fallback";
}

function loadingState(label) {
  return `<div class="file-preview__loading" role="status"><span class="file-preview__spinner" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong><small>Подготавливаем локальный предпросмотр</small></div>`;
}

function noFileState(document, compact) {
  return `<div class="file-preview__empty${compact ? " file-preview__empty--compact" : ""}">
    <span class="file-preview__empty-icon">${icon("upload", compact ? 22 : 30)}</span>
    <div><strong>Файл пока не добавлен</strong><p>Запись уже учитывается в реестре как ожидаемый документ. Перетащите файл сюда или выберите его с диска.</p></div>
    <label class="button button--primary button--sm file-preview__pick">
      ${icon("upload", 16)}<span>Добавить файл</span>
      <input type="file" data-document-file-input data-document-id="${escapeHtml(document?.id)}" hidden>
    </label>
  </div>`;
}

export function renderFilePreview(document, { compact = false, template = false } = {}) {
  const info = parseFileInfo(document);
  const id = document?.id;
  if (!info.hasFile || !id) return noFileState(document, compact);

  const url = template
    ? `/api/templates/${encodeURIComponent(id)}/preview`
    : previewUrl(id);
  const kind = previewKind(info.extension);
  const classes = `file-preview file-preview--${kind}${compact ? " file-preview--compact" : ""}`;
  if (kind === "pdf") {
    return `<div class="${classes}" data-preview-kind="pdf"><iframe src="${escapeHtml(url)}#toolbar=0&navpanes=0" title="Предпросмотр ${escapeHtml(info.fileName)}" loading="lazy"></iframe></div>`;
  }
  if (kind === "image") {
    return `<div class="${classes}" data-preview-kind="image"><button class="file-preview__image-button" type="button" data-action="toggle-preview-zoom" aria-label="Увеличить изображение"><img src="${escapeHtml(url)}" alt="Предпросмотр ${escapeHtml(info.fileName)}" loading="lazy"></button><span class="file-preview__zoom-hint">Нажмите, чтобы увеличить</span></div>`;
  }
  if (["docx", "sheet", "text"].includes(kind)) {
    const dataUrl = kind === "sheet" ? ` data-preview-data-url="${escapeHtml(spreadsheetPreviewUrl(id, template))}"` : "";
    return `<div class="${classes}" data-file-preview data-preview-kind="${kind}" data-preview-url="${escapeHtml(url)}"${dataUrl} data-preview-name="${escapeHtml(info.fileName)}">${loadingState(kind === "docx" ? "Открываем документ" : kind === "sheet" ? "Открываем таблицу" : "Открываем текст")}</div>`;
  }
  return `<div class="${classes}"><div class="file-preview__fallback"><span>${icon("file", compact ? 28 : 38)}</span><strong>Предпросмотр недоступен</strong><p>Формат .${escapeHtml(info.extension || "файл")} сохранён без изменений. Его можно скачать и открыть в исходной программе.</p><a class="button button--secondary button--sm" href="${escapeHtml(url)}" download>${icon("download", 16)}<span>Скачать файл</span></a></div></div>`;
}

function errorState(container, message) {
  container.dataset.previewHydrated = "error";
  container.innerHTML = `<div class="file-preview__fallback file-preview__fallback--error"><span>${icon("alertCircle", 30)}</span><strong>Не удалось показать файл</strong><p>${escapeHtml(message || "Файл сохранён и доступен для скачивания.")}</p><a class="button button--secondary button--sm" href="${escapeHtml(container.dataset.previewUrl || "#")}" download>${icon("download", 16)}<span>Скачать</span></a></div>`;
}

function appendSheetTable(container, preview) {
  const sheetName = String(preview?.sheet_name || "Лист 1");
  const rows = Array.isArray(preview?.rows)
    ? preview.rows.slice(0, 50).map((row) => (Array.isArray(row) ? row.slice(0, 30) : []))
    : [];
  container.replaceChildren();
  const chrome = document.createElement("div");
  chrome.className = "sheet-preview__chrome";
  const title = document.createElement("strong");
  title.textContent = sheetName || "Лист 1";
  const meta = document.createElement("span");
  meta.textContent = preview?.truncated_rows || rows.length >= 50 ? "Показаны первые 50 строк" : `${rows.length} строк`;
  chrome.append(title, meta);
  container.append(chrome);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "sheet-preview__empty";
    empty.textContent = "В первом листе нет заполненных ячеек";
    container.append(empty);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "sheet-preview__table-wrap";
  const table = document.createElement("table");
  table.className = "sheet-preview__table";
  const width = Math.min(30, Math.max(...rows.map((row) => row.length), 1));
  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    const indexCell = document.createElement("th");
    indexCell.scope = "row";
    indexCell.textContent = String(rowIndex + 1);
    tr.append(indexCell);
    for (let column = 0; column < width; column += 1) {
      const cell = rowIndex === 0 ? document.createElement("th") : document.createElement("td");
      if (rowIndex === 0) cell.scope = "col";
      cell.textContent = row[column] === null || row[column] === undefined ? "" : String(row[column]);
      tr.append(cell);
    }
    table.append(tr);
  });
  wrap.append(table);
  container.append(wrap);
}

function safeLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (raw.startsWith("#")) return true;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(raw, window.location.origin).protocol);
  } catch (_error) {
    return false;
  }
}

function safeAsset(value) {
  const raw = String(value || "").trim();
  if (/^data:image\//i.test(raw) || /^blob:/i.test(raw)) return true;
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.origin === window.location.origin && ["http:", "https:"].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

export function sanitizeDocxPreview(root) {
  root.querySelectorAll("script, iframe, object, embed, form, meta, base").forEach((element) => element.remove());
  root.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLocaleLowerCase("en-US");
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      } else if (["href", "xlink:href"].includes(name) && !safeLink(attribute.value)) {
        element.removeAttribute(attribute.name);
      } else if (name === "src" && !safeAsset(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A" && element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
}

async function hydratePreview(container) {
  if (container.dataset.previewHydrated) return;
  const requestedUrl = container.dataset.previewUrl;
  const dataUrl = container.dataset.previewDataUrl || requestedUrl;
  container.dataset.previewHydrated = "loading";
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(response.status === 404 ? "Файл не найден в локальном архиве" : "Сервер не вернул файл");
    if (!container.isConnected || container.dataset.previewUrl !== requestedUrl) return;
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > 40 * 1024 * 1024) throw new Error("Файл больше 40 МБ — скачайте его для просмотра");
    const kind = container.dataset.previewKind;
    if (kind === "sheet") {
      appendSheetTable(container, await response.json());
    } else if (kind === "text") {
      const pre = document.createElement("pre");
      pre.className = "text-preview";
      pre.textContent = (await response.text()).slice(0, 250000);
      container.replaceChildren(pre);
    } else {
      const buffer = await response.arrayBuffer();
      if (!container.isConnected || container.dataset.previewUrl !== requestedUrl) return;
      if (kind === "docx") {
        const host = document.createElement("div");
        host.className = "docx-preview__host";
        await renderDocx(buffer, host, null, {
          className: "docx-page",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          useBase64URL: true,
        });
        sanitizeDocxPreview(host);
        if (!container.isConnected || container.dataset.previewUrl !== requestedUrl) return;
        container.replaceChildren(host);
      }
    }
    container.dataset.previewHydrated = "true";
  } catch (error) {
    errorState(container, error?.message);
  }
}

export function hydrateFilePreviews(scope = document) {
  const containers = [...scope.querySelectorAll?.("[data-file-preview]") || []];
  containers.forEach((container) => hydratePreview(container));
}

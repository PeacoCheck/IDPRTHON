function errorMessage(data, fallback) {
  const detail = data?.detail ?? data?.error;
  const serverMessage = typeof detail === "string"
    ? detail
    : typeof detail?.message === "string"
      ? detail.message
      : "";
  const looksTechnical = /[/\\]|\b(?:traceback|exception|stack|sql|sqlite|validation error)\b|[a-z0-9]+_[a-z0-9_]+/i.test(serverMessage);
  if (serverMessage && serverMessage.length <= 320 && /[а-яё]/i.test(serverMessage) && !looksTechnical) return serverMessage;
  if (Array.isArray(detail)) return fallback;
  return fallback;
}

function missingFields(data) {
  const raw = data?.missing_fields ?? data?.detail?.missing_fields ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.flatMap((item) => {
    if (typeof item === "string") return [item];
    return Array.isArray(item?.missing_fields) ? item.missing_fields : [];
  }))];
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isJsonBody(value) {
  if (!value || typeof value !== "object" || isFormData(value)) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return false;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return false;
  return true;
}

async function responseData(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => "");
}

async function request(path, options = {}, fallback = "Не удалось выполнить запрос") {
  const { headers: optionHeaders, body: optionBody, ...fetchOptions } = options;
  const headers = new Headers(optionHeaders || {});
  let body = optionBody;

  if (isFormData(body)) {
    headers.delete("Content-Type");
  } else if (isJsonBody(body)) {
    body = JSON.stringify(body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(path, { ...fetchOptions, headers, body });
  } catch (cause) {
    const error = new Error(fallback, { cause });
    error.status = 0;
    error.data = {};
    error.missingFields = [];
    throw error;
  }

  const data = await responseData(response);
  if (!response.ok) {
    const error = new Error(errorMessage(data, fallback));
    error.status = response.status;
    error.data = data;
    error.missingFields = missingFields(data);
    throw error;
  }
  return data;
}

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export const sourceUrl = (documentId) => `/api/source/${encodeURIComponent(documentId)}`;
export const fileUrl = (documentId) => `/api/files/${encodeURIComponent(documentId)}`;
export const previewUrl = (documentId) => `/api/preview/${encodeURIComponent(documentId)}`;
export const templateFileUrl = (templateId) => `/api/templates/${encodeURIComponent(templateId)}/file`;
export const templatePreviewUrl = (templateId) => `/api/templates/${encodeURIComponent(templateId)}/preview`;

export const api = {
  state: () => request("/api/app-state", {}, "Не удалось загрузить состояние приложения"),
  objects: (includeArchived = false) =>
    request(`/api/objects${queryString({ include_archived: includeArchived || undefined })}`, {}, "Не удалось загрузить объекты"),
  objectSummaries: () => request("/api/objects/summary", {}, "Не удалось загрузить сводку по объектам"),
  workspace: (id) => request(`/api/objects/${id}/workspace`, {}, "Не удалось загрузить рабочее пространство объекта"),
  updateObject: (id, payload) =>
    request(`/api/objects/${id}`, { method: "PATCH", body: payload }, "Не удалось сохранить данные объекта"),
  addObject: (payload) => request("/api/object/add", { method: "POST", body: payload }, "Не удалось добавить объект"),
  archiveObject: (id) =>
    request("/api/object/archive", { method: "POST", body: { id } }, "Не удалось архивировать объект"),
  restoreObject: (id) =>
    request("/api/object/unarchive", { method: "POST", body: { id } }, "Не удалось восстановить объект"),
  addGroup: (objectId, payload) =>
    request(`/api/objects/${objectId}/groups`, { method: "POST", body: payload }, "Не удалось добавить группу"),
  importFile: (objectId, file, groupId = null) => {
    const body = new FormData();
    body.append("file", file);
    if (groupId !== null && groupId !== undefined) body.append("group_id", String(groupId));
    return request(`/api/objects/${objectId}/import`, { method: "POST", body }, "Не удалось импортировать файл");
  },
  documents: (q = "", objectId = null) =>
    request(`/api/documents${queryString({ q, object_id: objectId })}`, {}, "Не удалось загрузить документы"),
  createDocument: (payload) =>
    request("/api/documents", { method: "POST", body: payload }, "Не удалось создать документ"),
  updateDocument: (id, payload) =>
    request(`/api/documents/${id}`, { method: "PATCH", body: payload }, "Не удалось сохранить документ"),
  updateCompletion: (id, completionStatus) =>
    request(
      `/api/documents/${id}`,
      { method: "PATCH", body: { completion_status: completionStatus } },
      "Не удалось изменить статус готовности документа",
    ),
  uploadDocumentFile: (id, file) => {
    const body = new FormData();
    body.append("file", file);
    return request(`/api/documents/${id}/file`, { method: "POST", body }, "Не удалось сохранить файл документа");
  },
  documentVersions: (id) =>
    request(`/api/documents/${id}/versions`, {}, "Не удалось загрузить версии файла"),
  deleteDocument: (id) =>
    request(`/api/documents/${id}`, { method: "DELETE" }, "Не удалось удалить документ"),
  templates: () => request("/api/templates", {}, "Не удалось загрузить шаблоны"),
  createTemplate: ({ file, title, docType, groupKind, notes }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", title);
    body.append("doc_type", docType);
    body.append("group_kind", groupKind);
    if (notes) body.append("notes", notes);
    return request("/api/templates", { method: "POST", body }, "Не удалось добавить шаблон");
  },
  templateMarkers: (id) =>
    request(`/api/templates/${id}/markers`, {}, "Не удалось прочитать маркеры шаблона"),
  uploadTemplateFile: (id, file, markerMap = undefined) => {
    const body = new FormData();
    body.append("file", file);
    if (markerMap !== undefined && markerMap !== null) {
      body.append("marker_map", typeof markerMap === "string" ? markerMap : JSON.stringify(markerMap));
    }
    return request(`/api/templates/${id}/file`, { method: "POST", body }, "Не удалось загрузить файл шаблона");
  },
  updateTemplate: (id, payload) =>
    request(`/api/templates/${id}`, { method: "PATCH", body: payload }, "Не удалось обновить шаблон"),
  archiveTemplate: (id) =>
    request(`/api/templates/${id}`, { method: "DELETE" }, "Не удалось архивировать шаблон"),
  duplicateTemplate: (id, payload = {}) =>
    request(`/api/templates/${id}/duplicate`, { method: "POST", body: payload }, "Не удалось дублировать шаблон"),
  copyTemplate: (id, payload) =>
    request(`/api/templates/${id}/copy`, { method: "POST", body: payload }, "Не удалось добавить шаблон в объект"),
  bindTemplate: (id, payload) =>
    request(`/api/templates/${id}/bind`, { method: "POST", body: payload }, "Не удалось привязать файл шаблона"),
  resolveTemplate: (templateId, objectId, presetId = null) =>
    request(
      `/api/templates/${templateId}/resolve${queryString({ object_id: objectId, preset_id: presetId })}`,
      {},
      "Не удалось подставить данные в шаблон",
    ),
  presets: (q = "") => request(`/api/presets${queryString({ q })}`, {}, "Не удалось загрузить пресеты"),
  catalog: (name) => request(`/api/catalogs/${encodeURIComponent(name)}`, {}, "Не удалось загрузить каталог"),
  report: () => request("/api/reports/completeness", {}, "Не удалось загрузить отчёт о комплектности"),
  waiveIntegrity: (objectId, ruleId, payload) =>
    request(
      `/api/objects/${objectId}/integrity/${ruleId}/waive`,
      { method: "POST", body: payload },
      "Не удалось сохранить исключение проверки",
    ),
  restoreIntegrity: (objectId, ruleId) =>
    request(
      `/api/objects/${objectId}/integrity/${ruleId}/restore`,
      { method: "POST", body: {} },
      "Не удалось восстановить правило проверки",
    ),
  search: (q) => request(`/api/search${queryString({ q })}`, {}, "Не удалось выполнить поиск"),
  generate: (ids) => request("/api/generate", { method: "POST", body: { ids } }, "Не удалось сформировать документы"),
  selectObject: (id) =>
    request("/api/object/select", { method: "POST", body: { id } }, "Не удалось выбрать объект"),
  openObject: (id) =>
    request("/api/open-object-folder", { method: "POST", body: { id } }, "Не удалось открыть папку объекта"),
  corpusInsights: () => request("/api/corpus/insights", {}, "Не удалось загрузить сведения об источниках"),
  sourceUrl,
  fileUrl,
  previewUrl,
  templateFileUrl,
  templatePreviewUrl,
};

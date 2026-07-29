function errorMessage(data, fallback) {
  const detail = data?.detail ?? data?.error;
  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;
  return fallback;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(errorMessage(data, "Не удалось выполнить запрос"));
    error.status = response.status;
    error.data = data;
    const rawMissing = data?.missing_fields || data?.detail?.missing_fields || [];
    error.missingFields = Array.isArray(rawMissing)
      ? rawMissing.flatMap((item) => typeof item === "string" ? item : (item?.missing_fields || []))
      : [];
    throw error;
  }
  return data;
}

export const api = {
  state: () => request("/api/app-state"),
  objectSummaries: () => request("/api/objects/summary"),
  workspace: (id) => request(`/api/objects/${id}/workspace`),
  updateObject: (id, payload) => request(`/api/objects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addObject: (payload) => request("/api/object/add", { method: "POST", body: JSON.stringify(payload) }),
  archiveObject: (id) => request("/api/object/archive", { method: "POST", body: JSON.stringify({ id }) }),
  restoreObject: (id) => request("/api/object/unarchive", { method: "POST", body: JSON.stringify({ id }) }),
  addGroup: (objectId, payload) => request(`/api/objects/${objectId}/groups`, { method: "POST", body: JSON.stringify(payload) }),
  importFile: async (objectId, file, groupId = null) => {
    const body = new FormData();
    body.append("file", file);
    if (groupId) body.append("group_id", groupId);
    const response = await fetch(`/api/objects/${objectId}/import`, { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(data, "Не удалось импортировать файл"));
    return data;
  },
  documents: (q = "") => request(`/api/documents${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createDocument: (payload) => request("/api/documents", { method: "POST", body: JSON.stringify(payload) }),
  updateDocument: (id, payload) => request(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  updateCompletion: (id, completionStatus) =>
    request(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ completion_status: completionStatus }) }),
  deleteDocument: (id) => request(`/api/documents/${id}`, { method: "DELETE" }),
  templates: () => request("/api/templates"),
  resolveTemplate: (templateId, objectId, presetId = null) =>
    request(`/api/templates/${templateId}/resolve?object_id=${objectId}${presetId ? `&preset_id=${presetId}` : ""}`),
  presets: (q = "") => request(`/api/presets${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  catalog: (name) => request(`/api/catalogs/${name}`),
  report: () => request("/api/reports/completeness"),
  waiveIntegrity: (objectId, ruleId, payload) =>
    request(`/api/objects/${objectId}/integrity/${ruleId}/waive`, { method: "POST", body: JSON.stringify(payload) }),
  restoreIntegrity: (objectId, ruleId) =>
    request(`/api/objects/${objectId}/integrity/${ruleId}/restore`, { method: "POST", body: "{}" }),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  generate: (ids) => request("/api/generate", { method: "POST", body: JSON.stringify({ ids }) }),
  selectObject: (id) => request("/api/object/select", { method: "POST", body: JSON.stringify({ id }) }),
  openObject: (id) => request("/api/open-object-folder", { method: "POST", body: JSON.stringify({ id }) }),
};

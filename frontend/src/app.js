import "@fontsource-variable/manrope";
import "./styles/tokens.css";
import "./styles/theme-dark.css";
import "./styles/reset.css";
import "./styles/typography.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/table.css";
import "./styles/views/objects.css";
import "./styles/views/object.css";
import "./styles/views/editor.css";
import "./styles/views/templates.css";
import "./styles/utilities.css";

import { api } from "./api.js";
import { shell } from "./components/shell.js";
import { button, emptyState, escapeHtml, modal, skeleton, toastView } from "./components/ui.js";
import { initRouter, navigate } from "./router.js";
import { notify, state, subscribe } from "./store.js";
import { renderEditorModal, renderEditorValidation, renderEditorView } from "./views/editor.js";
import { renderObjectModal, renderObjectView } from "./views/object.js";
import { renderNewObjectModal, renderObjectsView } from "./views/objects.js";

const root = document.getElementById("app");
const toastHost = document.createElement("div");
toastHost.id = "toastHost";
toastHost.setAttribute("aria-live", "polite");
document.body.append(toastHost);

let renderQueued = false;

function applyTheme() {
  const theme = state.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function pendingView() {
  if (state.loading) {
    return `<div class="view-frame component-stage"><div class="component-stage__grid">${skeleton("card", 4)}</div></div>`;
  }
  return emptyState({
    iconName: "fileText",
    title: "Раздел временно недоступен",
    description: "Вернитесь к объектам и откройте рабочее пространство из карточки объекта.",
    action: button({ label: "К объектам", action: "go-objects", variant: "primary" }),
  });
}

function routeView() {
  if (state.route === "objects") return renderObjectsView(state);
  if (state.route === "object") return renderObjectView(state);
  if (state.route === "editor") return renderEditorView(state);
  return pendingView();
}

function archiveModal() {
  const object = state.modalData?.object;
  if (!object) return "";
  return modal({
    title: "Архивировать объект?",
    description: "Объект останется в ID Vault и его можно будет восстановить.",
    body: `<div class="confirm-copy"><strong>${escapeHtml(object.name)}</strong><span class="mono">${escapeHtml(object.code)}</span></div>`,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary" })}${button({
      label: "Архивировать",
      action: "confirm-archive-object",
      iconName: "archive",
      variant: "danger",
      attributes: `data-object-id="${object.id}"`,
    })}`,
  });
}

function modalView() {
  if (state.modal === "new-object") return renderNewObjectModal(state);
  if (state.modal === "archive-object") return archiveModal();
  const objectModal = renderObjectModal(state);
  if (objectModal) return objectModal;
  const editorModal = renderEditorModal(state);
  if (editorModal) return editorModal;
  return "";
}

function captureUiPosition() {
  const active = document.activeElement;
  const main = document.getElementById("mainContent");
  if (!active || !root.contains(active)) return { mainScroll: main?.scrollTop || 0 };
  let selector = null;
  if (active.id) selector = `#${CSS.escape(active.id)}`;
  else if (active.name) selector = `[name="${CSS.escape(active.name)}"]`;
  else if (active.dataset.action) {
    selector = `[data-action="${CSS.escape(active.dataset.action)}"]`;
    ["document", "documentId", "editorSection", "fieldKey", "objectTab", "group"].forEach((key) => {
      if (active.dataset[key]) selector += `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLocaleLowerCase()}`)}="${CSS.escape(active.dataset[key])}"]`;
    });
  }
  return {
    selector,
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
    mainScroll: main?.scrollTop || 0,
  };
}

function restoreUiPosition(position) {
  const main = document.getElementById("mainContent");
  if (main) main.scrollTop = position.mainScroll || 0;
  if (state.modal) {
    const target = root.querySelector("[data-modal] [autofocus]")
      || root.querySelector('[data-modal] input:not([type="hidden"]), [data-modal] select, [data-modal] textarea')
      || root.querySelector("[data-modal] button");
    target?.focus();
    return;
  }
  if (!position.selector) return;
  const active = root.querySelector(position.selector);
  if (!active) {
    if (state.route === "editor") root.querySelector('[data-action="save-document"]')?.focus({ preventScroll: true });
    return;
  }
  active.focus({ preventScroll: true });
  if (position.selectionStart !== null && typeof active.setSelectionRange === "function") {
    active.setSelectionRange(position.selectionStart, position.selectionEnd);
  }
}

function renderToast() {
  toastHost.innerHTML = toastView(state.toast);
}

function render() {
  renderQueued = false;
  const position = captureUiPosition();
  applyTheme();
  root.innerHTML = shell(state, routeView()) + modalView();
  renderToast();
  requestAnimationFrame(() => restoreUiPosition(position));
}

subscribe((key) => {
  if (key === "toast") {
    renderToast();
    return;
  }
  if (key === "theme") applyTheme();
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(render);
  }
});

async function refreshObjects() {
  const objects = await api.objectSummaries();
  state.objects = objects;
  return objects;
}

async function refreshWorkspace(objectId = state.selectedObjectId || state.workspace?.object?.id) {
  if (!objectId) throw new Error("Объект не выбран");
  const workspace = await api.workspace(objectId);
  state.workspace = workspace;
  state.selectedObjectId = objectId;
  state.documents = workspace.documents || [];
  if (state.selectedDocument) {
    state.selectedDocument = state.documents.find((document) => document.id === state.selectedDocument.id) || null;
  }
  state.error = null;
  return workspace;
}

function currentObject() {
  return state.workspace?.object || state.objects.find((object) => object.id === state.selectedObjectId) || null;
}

function optionalNumber(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? Number(normalized) : null;
}

function setFormBusy(form, busy) {
  const submit = root.querySelector(`[type="submit"][form="${CSS.escape(form.id)}"]`) || form.querySelector('[type="submit"]');
  if (!submit) return;
  submit.disabled = busy;
  if (busy) submit.setAttribute("aria-busy", "true");
  else submit.removeAttribute("aria-busy");
}

function hasEditorValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function editorIssueCountText(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "замечание"
    : [2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)
      ? "замечания"
      : "замечаний";
  return `${count} ${word}`;
}

function editorAliasValue(key, document, draft) {
  const aliases = {
    "act.number": draft.number ?? document.number ?? "",
    "order.number": draft.number ?? document.number ?? "",
    "scheme.number": draft.number ?? document.number ?? "",
    "journal.number": draft.number ?? document.number ?? "",
    "act.date": draft.document_date ?? document.document_date ?? "",
    "order.date": draft.document_date ?? document.document_date ?? "",
    works: draft.work_title ?? document.work_title ?? "",
    scope: draft.work_title ?? document.work_title ?? "",
  };
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
}

function editorFieldValue(field, document, draft, resolved) {
  const key = String(field?.key || "");
  const alias = editorAliasValue(key, document, draft);
  if (alias !== undefined) return alias;
  if (String(field?.source || "").startsWith("object.")) {
    return field.value ?? resolved?.values?.[key] ?? document.values_json?.[key];
  }
  if (Object.hasOwn(draft.values_json || {}, key)) return draft.values_json[key];
  if (Object.hasOwn(resolved?.values || {}, key)) return resolved.values[key];
  return field?.value ?? document.values_json?.[key];
}

function issueDescriptor(item, tone) {
  if (typeof item === "string") {
    return { key: item, label: item, message: tone === "error" ? "Обязательное поле не заполнено" : "Проверьте значение", tone };
  }
  if (!item || typeof item !== "object") return null;
  const key = String(item.key || item.field || item.name || item.marker || "");
  if (!key) return null;
  return {
    key,
    label: item.label || key,
    message: item.message || item.detail || (tone === "error" ? "Обязательное поле не заполнено" : "Проверьте значение"),
    tone,
  };
}

function buildEditorIssues(document = state.selectedDocument, draft = state.editorDraft, resolved = state.editorResolved) {
  if (!document || document.source_kind === "imported") return [];
  const safeDraft = draft || { values_json: {} };
  const issues = new Map();
  const fields = Array.isArray(resolved?.fields) ? resolved.fields : [];
  fields.forEach((field) => {
    const key = String(field.key || "");
    if (field.required && key && !hasEditorValue(editorFieldValue(field, document, safeDraft, resolved))) {
      issues.set(`error:${key}`, {
        key,
        label: field.label || key,
        message: "Обязательное поле не заполнено",
        tone: "error",
      });
    }
  });
  (Array.isArray(document.missing_fields_json) ? document.missing_fields_json : []).forEach((item) => {
    const issue = issueDescriptor(item, "error");
    if (issue && !hasEditorValue(safeDraft.values_json?.[issue.key]) && !issues.has(`error:${issue.key}`)) {
      issues.set(`error:${issue.key}`, issue);
    }
  });
  (Array.isArray(document.warnings_json) ? document.warnings_json : []).forEach((item) => {
    const issue = issueDescriptor(item, "warning");
    if (issue && !issues.has(`error:${issue.key}`)) issues.set(`warning:${issue.key}`, issue);
  });
  return [...issues.values()];
}

function newEditorDraft(document) {
  return {
    number: document.number || "",
    work_title: document.work_title || "",
    document_date: document.document_date || "",
    values_json: { ...(document.values_json || {}) },
    _dirty: false,
  };
}

async function loadEditorDocument(document) {
  if (!document) return;
  state.loading = true;
  state.error = null;
  state.selectedDocument = document;
  state.requestedDocumentId = document.id;
  state.editorDraft = newEditorDraft(document);
  state.editorResolved = null;
  state.editorMarkers = null;
  state.editorIssues = [];
  state.editorDirty = false;

  if (document.source_kind !== "imported" && document.template_id) {
    const objectId = document.object_id || state.workspace?.object?.id;
    const [resolvedResult, markersResult] = await Promise.allSettled([
      api.resolveTemplate(document.template_id, objectId),
      api.templateMarkers(document.template_id),
    ]);
    const template = state.templates.find((item) => item.id === document.template_id);
    state.editorResolved = resolvedResult.status === "fulfilled"
      ? resolvedResult.value
      : { fields: template?.fields_json || [], values: {} };
    state.editorMarkers = markersResult.status === "fulfilled" ? markersResult.value : { markers: [] };
    if (resolvedResult.status === "rejected") state.error = resolvedResult.reason.message;
  } else {
    state.editorResolved = { fields: [], values: {} };
    state.editorMarkers = { markers: [] };
  }

  state.editorIssues = buildEditorIssues(document, state.editorDraft, state.editorResolved);
  state.loading = false;
}

function syncEditorDraftFromForm(form = document.getElementById("documentForm")) {
  if (!form || !state.selectedDocument) return state.editorDraft;
  const missingDraft = !state.editorDraft;
  const draft = state.editorDraft || newEditorDraft(state.selectedDocument);
  const formData = new FormData(form);
  draft.number = String(formData.get("number") || "");
  draft.document_date = String(formData.get("document_date") || "");
  draft.work_title = String(formData.get("work_title") || "");
  draft.values_json = { ...(draft.values_json || {}) };
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("field:")) draft.values_json[name.slice(6)] = String(value);
  }
  if (missingDraft) state.editorDraft = draft;
  return draft;
}

function openDocumentEditor(documentId) {
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) {
    notify("Документ не найден в текущем объекте", "error");
    return;
  }
  state.selectedDocument = document;
  state.requestedDocumentId = document.id;
  navigate("editor", { document });
  loadEditorDocument(document);
}

async function openObjectFolder(objectId) {
  if (!objectId || state.busyAction) return;
  state.busyAction = `open-object-folder-${objectId}`;
  try {
    await api.openObject(objectId);
    notify("Папка объекта открыта");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function restoreIntegrityRule(ruleId) {
  const objectId = state.workspace?.object?.id;
  if (!objectId || !ruleId || state.busyAction) return;
  state.busyAction = `restore-integrity-rule-${ruleId}`;
  try {
    const integrity = await api.restoreIntegrity(objectId, ruleId);
    state.workspace = { ...state.workspace, integrity };
    await refreshObjects();
    notify("Требование восстановлено");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

function markEditorDirty(target) {
  if (!state.editorDraft || !target?.name) return;
  if (target.name.startsWith("field:")) {
    state.editorDraft.values_json[target.name.slice(6)] = target.value;
  } else if (["number", "document_date", "work_title"].includes(target.name)) {
    state.editorDraft[target.name] = target.value;
  } else {
    return;
  }
  state.editorDraft._dirty = true;
  const indicator = root.querySelector(".editor-dirty");
  indicator?.classList.add("is-dirty");
  const label = indicator?.querySelector("span:last-child");
  if (label) label.textContent = "Есть несохранённые изменения";
  const outlineState = root.querySelector(".editor-outline__meta small");
  if (outlineState) outlineState.textContent = "Сначала сохраните изменения";

  const field = target.closest(".editor-field");
  if (field && target.value.trim()) {
    field.classList.remove("is-error");
    const message = field.querySelector(".editor-field__message");
    if (message && message.textContent.includes("Обязательное поле")) message.innerHTML = '<span aria-hidden="true">&nbsp;</span>';
  }

  updateEditorIssuePresentation(buildEditorIssues());
}

function updateEditorIssuePresentation(issues) {
  const nextIssues = Array.isArray(issues) ? issues : [];
  if (Array.isArray(state.editorIssues)) {
    state.editorIssues.splice(0, state.editorIssues.length, ...nextIssues);
  }

  root.querySelectorAll("[data-editor-field]").forEach((field) => {
    const key = field.dataset.editorField;
    const issue = nextIssues.find((item) => String(item.key) === String(key));
    const control = field.querySelector("input, textarea, select");
    const message = field.querySelector(".editor-field__message");
    const isError = issue?.tone === "error";
    field.classList.toggle("is-error", isError);
    if (control) {
      if (isError) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
    if (message && issue) message.textContent = issue.message || "Проверьте значение";
  });

  const validation = root.querySelector(".editor-validation");
  if (validation) validation.outerHTML = renderEditorValidation(state, nextIssues);

  const blocking = nextIssues.filter((issue) => issue.tone === "error").length;
  const generate = root.querySelector('[data-action="generate-document"]');
  if (generate && !String(state.busyAction || "").startsWith("generate-document")) {
    generate.disabled = blocking > 0;
    if (blocking) generate.title = `Сначала исправьте ${blocking} обязательных полей`;
    else generate.removeAttribute("title");
  }

  const meta = root.querySelector(".editor-outline__meta");
  if (meta) {
    const count = meta.querySelector("strong");
    if (count) count.textContent = nextIssues.length ? editorIssueCountText(nextIssues.length) : "Замечаний нет";
  }


  const draft = state.editorDraft || {};
  const fields = Array.isArray(state.editorResolved?.fields) ? state.editorResolved.fields : [];
  const mainComplete = [draft.number, draft.document_date, draft.work_title].filter(hasEditorValue).length;
  const templateComplete = fields.filter((field) => hasEditorValue(editorFieldValue(field, state.selectedDocument || {}, draft, state.editorResolved))).length;
  const counters = [
    ["main", `${mainComplete}/3`],
    ["template", `${templateComplete}/${fields.length}`],
  ];
  counters.forEach(([key, value]) => {
    const outlineCount = root.querySelector(`[data-action="focus-editor-section"][data-editor-section="${key}"] em`);
    const sectionCount = root.querySelector(`[data-section-key="${key}"] .editor-section__count`);
    if (outlineCount) outlineCount.textContent = value;
    if (sectionCount) sectionCount.textContent = value;
  });
}

function focusEditorField(key) {
  if (!key) return;
  const field = root.querySelector(`[data-field-key="${CSS.escape(String(key))}"]`);
  if (!field) return;
  const section = field.closest("[data-section-key]");
  const sectionKey = section?.dataset.sectionKey;
  if (section?.querySelector(".editor-section__body[hidden]") && sectionKey) {
    state.collapsedSections = { ...state.collapsedSections, [sectionKey]: false };
    requestAnimationFrame(() => focusEditorField(key));
    return;
  }
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  field.focus({ preventScroll: true });
}

function focusEditorSection(sectionKey) {
  if (!sectionKey) return;
  if (state.collapsedSections?.[sectionKey]) {
    state.collapsedSections = { ...state.collapsedSections, [sectionKey]: false };
  }
  requestAnimationFrame(() => {
    const section = root.querySelector(`[data-section-key="${CSS.escape(String(sectionKey))}"]`);
    section?.scrollIntoView({ block: "start", behavior: "smooth" });
    section?.querySelector("input:not([readonly]), textarea:not([readonly]), select, button")?.focus({ preventScroll: true });
  });
}

async function saveEditorDocument({ silent = false } = {}) {
  const document = state.selectedDocument;
  if (!document || document.source_kind === "imported" || state.busyAction) return null;
  const draft = syncEditorDraftFromForm();
  if (!draft) return null;
  state.busyAction = `save-document-${document.id}`;
  try {
    await api.updateDocument(document.id, {
      number: draft.number,
      work_title: draft.work_title,
      document_date: draft.document_date,
      values_json: draft.values_json,
    });
    await Promise.all([refreshWorkspace(document.object_id), refreshObjects()]);
    const updated = state.documents.find((item) => item.id === document.id);
    if (!updated) throw new Error("Сохранённый документ не найден");
    state.selectedDocument = updated;
    state.editorDraft = newEditorDraft(updated);
    state.editorIssues = buildEditorIssues(updated, state.editorDraft, state.editorResolved);
    state.editorDirty = false;
    if (!silent) notify("Документ сохранён");
    return updated;
  } catch (error) {
    notify(error.message, "error");
    return null;
  } finally {
    state.busyAction = null;
  }
}

async function generateEditorDocument() {
  const document = state.selectedDocument;
  if (!document || document.source_kind === "imported" || state.busyAction) return;
  const draft = syncEditorDraftFromForm();
  const issues = buildEditorIssues(document, draft, state.editorResolved);
  const blocking = issues.filter((issue) => issue.tone === "error");
  if (blocking.length) {
    state.editorIssues = issues;
    notify(`Заполните обязательные поля: ${blocking.length}`, "error");
    requestAnimationFrame(() => focusEditorField(blocking[0].key));
    return;
  }
  if (draft?._dirty) {
    const saved = await saveEditorDocument({ silent: true });
    if (!saved) return;
  }
  state.busyAction = `generate-document-${document.id}`;
  try {
    const result = await api.generate([document.id]);
    await Promise.all([refreshWorkspace(document.object_id), refreshObjects()]);
    const updated = state.documents.find((item) => item.id === document.id);
    if (updated) {
      state.selectedDocument = updated;
      state.editorDraft = newEditorDraft(updated);
      state.editorIssues = buildEditorIssues(updated, state.editorDraft, state.editorResolved);
    }
    const made = Array.isArray(result.made) ? result.made.length : 0;
    notify(made ? "DOCX сформирован" : "Формирование завершено", result.warnings ? "warning" : "success");
  } catch (error) {
    if (error.missingFields?.length) {
      const fields = Array.isArray(state.editorResolved?.fields) ? state.editorResolved.fields : [];
      state.editorIssues = error.missingFields.map((key) => ({
        key,
        label: fields.find((field) => field.key === key)?.label || key,
        message: "Обязательное поле не заполнено",
        tone: "error",
      }));
      requestAnimationFrame(() => focusEditorField(error.missingFields[0]));
    }
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function changeDocumentCompletion(select) {
  const document = state.selectedDocument;
  if (!document || state.busyAction) return;
  const previous = document.completion_status || "not_started";
  select.disabled = true;
  try {
    const updated = await api.updateCompletion(document.id, select.value);
    state.documents = state.documents.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
    state.selectedDocument = { ...document, ...updated };
    await refreshObjects();
    notify("Статус готовности обновлён");
  } catch (error) {
    select.value = previous;
    if (error.missingFields?.length) {
      state.editorIssues = error.missingFields.map((key) => ({ key, label: key, message: "Обязательное поле не заполнено", tone: "error" }));
    }
    notify(error.message, "error");
    select.disabled = false;
  }
}

async function deleteSelectedDocument(documentId) {
  const document = state.documents.find((item) => item.id === documentId) || state.selectedDocument;
  if (!document || state.busyAction) return;
  state.busyAction = `confirm-delete-document-${document.id}`;
  try {
    await api.deleteDocument(document.id);
    await Promise.all([refreshWorkspace(document.object_id), refreshObjects()]);
    state.selectedDocument = null;
    state.requestedDocumentId = null;
    state.editorDraft = null;
    state.editorResolved = null;
    state.editorMarkers = null;
    state.editorIssues = [];
    state.modal = null;
    state.modalData = null;
    navigate("object");
    notify("Документ удалён");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function openObjectWorkspace(objectId) {
  const object = state.objects.find((item) => item.id === objectId);
  if (!object || state.busyAction) return;
  state.busyAction = `open-object-${objectId}`;
  try {
    if (object.status !== "archived" && state.app?.activeObjectId !== objectId) {
      state.app = await api.selectObject(objectId);
    }
    const workspace = await refreshWorkspace(objectId);
    state.selectedGroupId = "all";
    state.objectTab = "registry";
    navigate("object");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function restoreObject(objectId) {
  if (state.busyAction) return;
  state.busyAction = `restore-object-${objectId}`;
  try {
    state.app = await api.restoreObject(objectId);
    await refreshObjects();
    if (state.route === "object" && state.workspace?.object?.id === objectId) {
      await refreshWorkspace(objectId);
    }
    notify("Объект восстановлен");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function archiveObject(objectId) {
  if (state.busyAction) return;
  state.busyAction = `archive-object-${objectId}`;
  try {
    state.app = await api.archiveObject(objectId);
    await refreshObjects();
    state.modal = null;
    state.modalData = null;
    if (state.route === "object" && state.workspace?.object?.id === objectId) {
      state.workspace = null;
      state.selectedObjectId = null;
      state.documents = [];
      navigate("objects");
    }
    notify("Объект перемещён в архив");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

root.addEventListener("click", (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    navigate(routeTarget.dataset.route);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (action) {
    if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("idv-theme", state.theme);
    } else if (action === "new-object") {
      state.modalData = null;
      state.modal = "new-object";
    } else if (action === "filter-objects") {
      state.objectFilter = actionTarget.dataset.filter === "archived" ? "archived" : "active";
    } else if (action === "clear-object-search") {
      state.objectQuery = "";
      requestAnimationFrame(() => document.getElementById("objectSearch")?.focus());
    } else if (action === "archive-object") {
      const objectId = Number(actionTarget.dataset.objectId);
      const object = state.objects.find((item) => item.id === objectId);
      if (object) {
        state.modalData = { object };
        state.modal = "archive-object";
      }
    } else if (action === "confirm-archive-object") {
      archiveObject(Number(actionTarget.dataset.objectId));
    } else if (action === "restore-object") {
      restoreObject(Number(actionTarget.dataset.objectId));
    } else if (action === "open-object-folder") {
      openObjectFolder(Number(actionTarget.dataset.objectId || state.workspace?.object?.id));
    } else if (action === "open-object-profile") {
      state.modalData = { object: currentObject() };
      state.modal = "object-profile";
    } else if (action === "open-import-document") {
      state.modalData = { group_id: state.selectedGroupId === "all" ? null : state.selectedGroupId };
      state.modal = "import-document";
    } else if (action === "open-new-document") {
      state.modalData = { group_id: state.selectedGroupId === "all" ? null : state.selectedGroupId };
      state.modal = "new-document";
    } else if (action === "open-new-group") {
      state.modalData = null;
      state.modal = "new-group";
    } else if (action === "set-object-tab") {
      state.objectTab = actionTarget.dataset.objectTab === "integrity" ? "integrity" : "registry";
    } else if (action === "select-group") {
      state.selectedGroupId = actionTarget.dataset.group === "all" ? "all" : Number(actionTarget.dataset.group);
    } else if (action === "clear-document-filters") {
      state.selectedGroupId = "all";
      state.completionFilter = "all";
      state.documentQuery = "";
      requestAnimationFrame(() => document.getElementById("documentSearch")?.focus());
    } else if (action === "open-document") {
      openDocumentEditor(Number(actionTarget.dataset.documentId));
    } else if (action === "open-source-document") {
      window.open(api.sourceUrl(Number(actionTarget.dataset.documentId)), "_blank", "noopener,noreferrer");
    } else if (action === "download-document") {
      window.open(api.fileUrl(Number(actionTarget.dataset.documentId)), "_blank", "noopener,noreferrer");
    } else if (action === "delete-document") {
      const documentId = Number(actionTarget.dataset.documentId || actionTarget.dataset.document);
      const document = state.documents.find((item) => item.id === documentId) || (state.selectedDocument?.id === documentId ? state.selectedDocument : null);
      if (document) {
        state.selectedDocument = document;
        state.modalData = { document, documentId: document.id, title: document.title };
        state.modal = "delete-document";
      }
    } else if (action === "confirm-delete-document") {
      deleteSelectedDocument(Number(actionTarget.dataset.document));
    } else if (action === "save-document") {
      saveEditorDocument();
    } else if (action === "generate-document") {
      generateEditorDocument();
    } else if (action === "toggle-validation-panel") {
      state.validationPanelOpen = state.validationPanelOpen === false;
    } else if (action === "toggle-editor-section") {
      const sectionKey = actionTarget.dataset.editorSection;
      state.collapsedSections = { ...state.collapsedSections, [sectionKey]: !state.collapsedSections?.[sectionKey] };
    } else if (action === "focus-editor-section") {
      focusEditorSection(actionTarget.dataset.editorSection);
    } else if (action === "focus-editor-field") {
      focusEditorField(actionTarget.dataset.fieldKey);
    } else if (action === "open-waive-rule") {
      const rule = state.workspace?.integrity?.checks?.find((item) => item.id === Number(actionTarget.dataset.ruleId));
      if (rule) {
        state.modalData = { rule };
        state.modal = "waive-rule";
      }
    } else if (action === "restore-integrity-rule") {
      restoreIntegrityRule(Number(actionTarget.dataset.ruleId));
    } else if (action === "retry-load" || action === "retry-objects") {
      loadApplication();
    } else if (action === "retry-object-workspace") {
      refreshWorkspace().catch((error) => notify(error.message, "error"));
    } else if (action === "retry-editor") {
      const document = state.documents.find((item) => item.id === (state.requestedDocumentId || state.selectedDocument?.id));
      if (document) loadEditorDocument(document);
    } else if (action === "go-objects") {
      navigate("objects");
    } else if (action === "close-modal") {
      if (!event.target.closest("[data-modal]") || actionTarget.closest("button")) {
        state.modal = null;
        state.modalData = null;
      }
    }
    if (action !== "create-object") return;
  }

  const objectTarget = event.target.closest("[data-open-object]");
  if (objectTarget && !event.target.closest("[data-action]")) {
    openObjectWorkspace(Number(objectTarget.dataset.openObject));
  }
});

root.addEventListener("input", (event) => {
  if (event.target.matches("#objectSearch")) state.objectQuery = event.target.value;
  if (event.target.matches("#documentSearch")) state.documentQuery = event.target.value;
  if (event.target.closest("#documentForm")) markEditorDirty(event.target);
  if (event.target.matches('#importDocumentForm input[type="file"]')) {
    const file = event.target.files?.[0];
    const label = event.target.closest(".object-file-field")?.querySelector("strong");
    if (label) label.textContent = file?.name || "Выберите файл";
  }
});

root.addEventListener("change", (event) => {
  if (event.target.matches('[data-action="change-completion"]')) {
    changeDocumentCompletion(event.target);
    return;
  }
  if (event.target.matches("#completionFilter")) {
    state.completionFilter = event.target.value || "all";
  }
  if (event.target.matches('#newDocumentForm [name="template_id"]')) {
    const title = event.target.form?.elements.title;
    const template = state.templates.find((item) => item.id === Number(event.target.value));
    if (title && template && !title.value.trim()) title.value = template.title || "";
  }
});

root.addEventListener("dblclick", (event) => {
  const documentRow = event.target.closest("[data-document]");
  if (documentRow && !event.target.closest("[data-action]")) {
    openDocumentEditor(Number(documentRow.dataset.document));
  }
});

async function runFormAction(form, operation) {
  setFormBusy(form, true);
  try {
    await operation();
    return true;
  } catch (error) {
    notify(error.message, "error");
    return false;
  } finally {
    if (document.contains(form)) setFormBusy(form, false);
  }
}

async function createObjectFromForm(form) {
  const formData = new FormData(form);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    code: String(formData.get("code") || "").trim() || null,
    short_name: String(formData.get("short_name") || "").trim() || null,
    address: String(formData.get("address") || "").trim(),
    comment: String(formData.get("comment") || "").trim(),
  };
  if (payload.name.length < 2) {
    form.elements.name?.setAttribute("aria-invalid", "true");
    form.elements.name?.focus();
    notify("Укажите название объекта — минимум два символа", "error");
    return;
  }
  await runFormAction(form, async () => {
    const object = await api.addObject(payload);
    const [app] = await Promise.all([api.state(), refreshObjects()]);
    state.app = app;
    state.modal = null;
    state.modalData = null;
    notify("Объект добавлен");
    await openObjectWorkspace(object.id);
  });
}

async function saveObjectProfile(form) {
  const formData = new FormData(form);
  const object = currentObject();
  if (!object) return;
  const currentMeta = object.meta_json && typeof object.meta_json === "object" ? object.meta_json : {};
  const payload = {
    name: String(formData.get("name") || "").trim(),
    short_name: String(formData.get("short_name") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    comment: String(formData.get("comment") || "").trim(),
    profile: String(formData.get("profile") || object.profile || "industrial_repair"),
    meta_json: {
      ...currentMeta,
      work_kind: String(formData.get("work_kind") || "").trim(),
      contract: String(formData.get("contract") || "").trim(),
      project_documentation: String(formData.get("project_documentation") || "").trim(),
      customer: {
        ...(currentMeta.customer || {}),
        name: String(formData.get("customer_name") || "").trim(),
        inn: String(formData.get("customer_inn") || "").trim(),
      },
      contractor: {
        ...(currentMeta.contractor || {}),
        name: String(formData.get("contractor_name") || "").trim(),
        inn: String(formData.get("contractor_inn") || "").trim(),
      },
      responsible_person: {
        ...(currentMeta.responsible_person || {}),
        fio: String(formData.get("responsible_fio") || "").trim(),
        position: String(formData.get("responsible_position") || "").trim(),
        order: String(formData.get("responsible_order") || "").trim(),
      },
    },
  };
  await runFormAction(form, async () => {
    await api.updateObject(object.id, payload);
    await Promise.all([refreshWorkspace(object.id), refreshObjects()]);
    state.modal = null;
    state.modalData = null;
    notify("Карточка объекта сохранена");
  });
}

async function createGroupFromForm(form) {
  const objectId = state.workspace?.object?.id;
  if (!objectId) return;
  const formData = new FormData(form);
  const payload = {
    title: String(formData.get("title") || "").trim(),
    kind: String(formData.get("kind") || "other"),
    description: String(formData.get("description") || "").trim(),
    is_required: formData.has("is_required"),
  };
  await runFormAction(form, async () => {
    const group = await api.addGroup(objectId, payload);
    await refreshWorkspace(objectId);
    state.selectedGroupId = group.id;
    state.modal = null;
    state.modalData = null;
    notify("Группа добавлена");
  });
}

async function importDocumentFromForm(form) {
  const objectId = state.workspace?.object?.id;
  const formData = new FormData(form);
  const file = formData.get("file");
  if (!objectId || !(file instanceof File) || !file.name) {
    notify("Выберите файл для импорта", "error");
    return;
  }
  await runFormAction(form, async () => {
    await api.importFile(objectId, file, optionalNumber(formData.get("group_id")));
    await Promise.all([refreshWorkspace(objectId), refreshObjects()]);
    state.modal = null;
    state.modalData = null;
    notify("Документ импортирован");
  });
}

async function waiveRuleFromForm(form) {
  const objectId = state.workspace?.object?.id;
  const formData = new FormData(form);
  const ruleId = Number(formData.get("rule_id"));
  const payload = {
    reason: String(formData.get("reason") || "").trim(),
    resolution_type: String(formData.get("resolution_type") || "not_applicable"),
    evidence: String(formData.get("evidence") || "").trim(),
  };
  if (!objectId || !ruleId) return;
  if (payload.resolution_type === "equivalent" && payload.evidence.length < 3) {
    form.elements.evidence?.setAttribute("aria-invalid", "true");
    form.elements.evidence?.focus();
    notify("Укажите подтверждающий документ", "error");
    return;
  }
  await runFormAction(form, async () => {
    const integrity = await api.waiveIntegrity(objectId, ruleId, payload);
    state.workspace = { ...state.workspace, integrity };
    await refreshObjects();
    state.modal = null;
    state.modalData = null;
    notify("Исключение сохранено");
  });
}

async function createDocumentFromForm(form) {
  const formData = new FormData(form);
  const objectId = optionalNumber(formData.get("object_id")) || state.workspace?.object?.id;
  if (!objectId) return;
  const payload = {
    object_id: objectId,
    template_id: optionalNumber(formData.get("template_id")),
    preset_id: optionalNumber(formData.get("preset_id")),
    group_id: optionalNumber(formData.get("group_id")),
    number: String(formData.get("number") || "").trim() || null,
    title: String(formData.get("title") || "").trim(),
    work_title: String(formData.get("work_title") || "").trim(),
    document_date: String(formData.get("document_date") || "").trim(),
  };
  await runFormAction(form, async () => {
    const created = await api.createDocument(payload);
    await Promise.all([refreshWorkspace(objectId), refreshObjects()]);
    state.modal = null;
    state.modalData = null;
    notify("Черновик документа создан");
    openDocumentEditor(created.id);
  });
}

root.addEventListener("submit", (event) => {
  const form = event.target;
  const handlers = {
    newObjectForm: createObjectFromForm,
    objectProfileForm: saveObjectProfile,
    newGroupForm: createGroupFromForm,
    importDocumentForm: importDocumentFromForm,
    waiveRuleForm: waiveRuleFromForm,
    newDocumentForm: createDocumentFromForm,
  };
  const handler = handlers[form.id];
  if (!handler) return;
  event.preventDefault();
  handler(form);
});

root.addEventListener("keydown", (event) => {
  const objectTarget = event.target.closest("[data-open-object]");
  if (objectTarget && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openObjectWorkspace(Number(objectTarget.dataset.openObject));
    return;
  }
  const documentRow = event.target.closest("[data-document]");
  if (documentRow && !event.target.closest("[data-action]") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openDocumentEditor(Number(documentRow.dataset.document));
  }
});

toastHost.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close-toast"]')) state.toast = null;
});

async function loadApplication() {
  state.loading = true;
  state.error = null;
  const [appResult, objectsResult, templatesResult, presetsResult] = await Promise.allSettled([
    api.state(),
    api.objectSummaries(),
    api.templates(),
    api.presets(),
  ]);

  state.app = appResult.status === "fulfilled" ? appResult.value : null;
  state.objects = objectsResult.status === "fulfilled" ? objectsResult.value : [];
  state.templates = templatesResult.status === "fulfilled" ? templatesResult.value : [];
  state.presets = presetsResult.status === "fulfilled" ? presetsResult.value : [];
  state.backendOnline = [appResult, objectsResult, templatesResult, presetsResult].some((result) => result.status === "fulfilled");
  state.error = objectsResult.status === "rejected" ? objectsResult.reason.message : null;

  const currentObjectId = state.app?.activeObjectId || state.objects.find((object) => object.is_current)?.id;
  let editorLoaded = false;
  if (currentObjectId && ["object", "editor"].includes(state.route)) {
    try {
      await refreshWorkspace(currentObjectId);
      if (state.route === "editor") {
        const documentId = state.requestedDocumentId || Number(location.hash.split("/").at(-1));
        const document = state.documents.find((item) => item.id === documentId);
        if (!document) throw new Error("Документ не найден в текущем объекте");
        await loadEditorDocument(document);
        editorLoaded = true;
      }
    } catch (error) {
      state.error = error.message;
    }
  }
  if (!editorLoaded) state.loading = false;
}

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s" && state.route === "editor") {
    event.preventDefault();
    saveEditorDocument();
    return;
  }
  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    state.modalData = null;
    return;
  }
  if (event.key === "Escape" && state.route === "editor" && state.validationPanelOpen !== false) {
    state.validationPanelOpen = false;
    return;
  }
  if (event.key === "/" && !state.modal && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !target.isContentEditable) {
      const searchId = { objects: "objectSearch", object: "documentSearch", templates: "templateSearch" }[state.route];
      if (!searchId) return;
      event.preventDefault();
      document.getElementById(searchId)?.focus();
    }
  }
});

initRouter();
render();
loadApplication();

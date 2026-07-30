import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/pt-sans-narrow/400.css";
import "@fontsource/pt-sans-narrow/700.css";
import "./styles/tokens.css";
import "./styles/theme-dark.css";
import "./styles/reset.css";
import "./styles/typography.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/file-preview.css";
import "./styles/command.css";
import "./styles/table.css";
import "./styles/views/objects.css";
import "./styles/views/object.css";
import "./styles/views/editor.css";
import "./styles/views/templates.css";
import "./styles/utilities.css";

import autoAnimate from "@formkit/auto-animate";
import { Idiomorph } from "idiomorph";
import { api } from "./api.js";
import { renderCommandPalette } from "./components/command.js";
import { documentFileInfo, hydrateFilePreviews } from "./components/file-preview.js";
import { icon } from "./components/icons.js";
import { shell } from "./components/shell.js";
import { button, emptyState, escapeHtml, modal, skeleton, toastView } from "./components/ui.js";
import { initRouter, navigate } from "./router.js";
import { notify, state, subscribe } from "./store.js";
import { renderEditorModal, renderEditorValidation, renderEditorView } from "./views/editor.js";
import { renderObjectModal, renderObjectView } from "./views/object.js";
import { renderNewObjectModal, renderObjectsView } from "./views/objects.js";
import { renderTemplateModal, renderTemplatesView } from "./views/templates.js";

const root = document.getElementById("app");
const toastHost = document.createElement("div");
toastHost.id = "toastHost";
toastHost.setAttribute("aria-live", "polite");
document.body.append(toastHost);

let renderQueued = false;
let activeOverlayKey = "";
let overlayReturnPosition = null;
let commandSearchTimer = null;
let commandSearchSequence = 0;
let workspaceNavigationSequence = 0;
let routeWorkspaceRecovery = null;
let renderedRoute = null;
const dragDepth = new WeakMap();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const autoAnimatedContainers = new WeakSet();
const autoAnimateTargets = [
  ["objects", '.objects-grid'],
  ["documents", '.registry-content tbody'],
  ["templates", '.templates-grid'],
  ["integrity", '.integrity-list'],
];

const commandGroupOrder = ["objects", "documents"];

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
  if (state.route === "templates") return renderTemplatesView(state);
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
  const templateModal = renderTemplateModal(state);
  if (templateModal) return templateModal;
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
    ["document", "documentId", "editorSection", "fieldKey", "objectTab", "objectId", "group", "ruleId", "filter", "templateCategory", "templateId", "presetId", "commandIndex"].forEach((key) => {
      if (active.dataset[key]) selector += `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLocaleLowerCase()}`)}="${CSS.escape(active.dataset[key])}"]`;
    });
  } else if (active.dataset.route) selector = `[data-route="${CSS.escape(active.dataset.route)}"]`;
  else if (active.dataset.openObject) selector = `[data-open-object="${CSS.escape(active.dataset.openObject)}"]`;
  else if (active.dataset.document) selector = `[data-document="${CSS.escape(active.dataset.document)}"]`;
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
  if (!position.selector) return;
  const active = root.querySelector(position.selector);
  if (!active) return;
  active.focus({ preventScroll: true });
  if (position.selectionStart !== null && typeof active.setSelectionRange === "function") {
    active.setSelectionRange(position.selectionStart, position.selectionEnd);
  }
}

function focusActiveOverlay() {
  const container = root.querySelector(state.commandOpen ? "[data-command]" : "[data-modal]");
  const target = container?.querySelector("[autofocus]")
    || container?.querySelector('input:not([type="hidden"]), select, textarea')
    || container?.querySelector("button, [href], [tabindex]:not([tabindex='-1'])");
  target?.focus({ preventScroll: true });
}

function renderToast() {
  toastHost.innerHTML = toastView(state.toast);
}

function initAutoAnimate() {
  if (reducedMotion.matches) return;
  const targets = new Map();
  root.querySelectorAll("[data-auto-animate]").forEach((element) => targets.set(element, element.dataset.autoAnimate || "list"));
  autoAnimateTargets.forEach(([name, selector]) => {
    root.querySelectorAll(selector).forEach((element) => targets.set(element, name));
  });
  targets.forEach((name, element) => {
    if (!element.dataset.autoAnimate) element.dataset.autoAnimate = name;
    if (autoAnimatedContainers.has(element)) return;
    autoAnimate(element, { duration: 160, easing: "ease-out" });
    autoAnimatedContainers.add(element);
  });
}

function renderInner() {
  const position = captureUiPosition();
  const nextOverlayKey = state.commandOpen ? "command" : state.modal ? `modal:${state.modal}` : "";
  const openingOverlay = !activeOverlayKey && Boolean(nextOverlayKey);
  const closingOverlay = Boolean(activeOverlayKey) && !nextOverlayKey;
  const switchingOverlay = Boolean(activeOverlayKey) && Boolean(nextOverlayKey) && activeOverlayKey !== nextOverlayKey;
  if (openingOverlay) overlayReturnPosition = position;
  applyTheme();
  const nextHtml = shell(state, routeView()) + modalView() + renderCommandPalette(state);
  Idiomorph.morph(root, nextHtml, {
    morphStyle: "innerHTML",
    ignoreActiveValue: true,
    restoreFocus: true,
    callbacks: {
      beforeNodeMorphed(oldNode, newNode) {
        if (!(oldNode instanceof Element) || !(newNode instanceof Element)) return true;
        if (!oldNode.matches("[data-file-preview]") || !newNode.matches("[data-file-preview]")) return true;
        const isHydrated = oldNode.dataset.previewHydrated === "true";
        const sameSource = oldNode.dataset.previewUrl === newNode.dataset.previewUrl;
        const sameDataSource = (oldNode.dataset.previewDataUrl || "") === (newNode.dataset.previewDataUrl || "");
        return !(isHydrated && sameSource && sameDataSource);
      },
    },
  });
  initAutoAnimate();
  hydrateFilePreviews(root);
  renderToast();
  activeOverlayKey = nextOverlayKey;
  renderedRoute = state.route;
  requestAnimationFrame(() => {
    if (nextOverlayKey) {
      if (openingOverlay || switchingOverlay) focusActiveOverlay();
      else restoreUiPosition(position);
      return;
    }
    if (closingOverlay && overlayReturnPosition) {
      restoreUiPosition(overlayReturnPosition);
      overlayReturnPosition = null;
      return;
    }
    restoreUiPosition(position);
  });
}

function render() {
  renderQueued = false;
  const routeChanged = renderedRoute !== null && renderedRoute !== state.route;
  if (routeChanged && !reducedMotion.matches && typeof document.startViewTransition === "function") {
    document.startViewTransition(renderInner);
    return;
  }
  renderInner();
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

async function refreshTemplates() {
  const templates = await api.templates();
  state.templates = templates;
  state.templateError = null;
  return templates;
}

async function openTemplateDetails(templateId) {
  const template = state.templates.find((item) => item.id === Number(templateId));
  if (!template) {
    notify("Шаблон не найден", "error");
    return;
  }
  state.templateDetails = { template, loading: true, error: null, markers: [] };
  state.modalData = { templateId: template.id };
  state.modal = "template-details";
  try {
    const details = await api.templateMarkers(template.id);
    state.templateDetails = { ...details, template, loading: false, error: null };
  } catch (error) {
    state.templateDetails = { template, loading: false, error: error.message, markers: [] };
  }
}

async function retryTemplates() {
  state.loading = true;
  state.templateError = null;
  try {
    await refreshTemplates();
  } catch (error) {
    state.templateError = error.message;
  } finally {
    state.loading = false;
  }
}

function commandItems() {
  if (state.commandLoading) return [];
  const results = state.commandResults && typeof state.commandResults === "object" ? state.commandResults : {};
  return commandGroupOrder.flatMap((group) => (
    Array.isArray(results[group]) ? results[group].map((item) => ({ group, item })) : []
  ));
}

function openCommandPalette() {
  if (state.modal || state.commandOpen) return;
  window.clearTimeout(commandSearchTimer);
  commandSearchSequence += 1;
  state.commandQuery = "";
  state.commandResults = null;
  state.commandIndex = 0;
  state.commandLoading = false;
  state.commandError = null;
  state.commandOpen = true;
}

function closeCommandPalette() {
  if (!state.commandOpen) return;
  window.clearTimeout(commandSearchTimer);
  commandSearchSequence += 1;
  state.commandOpen = false;
  state.commandLoading = false;
  state.commandError = null;
}

function queueCommandSearch(query) {
  const value = String(query || "");
  const normalized = value.trim();
  window.clearTimeout(commandSearchTimer);
  const sequence = ++commandSearchSequence;
  state.commandQuery = value;
  state.commandIndex = 0;
  state.commandError = null;
  if (normalized.length < 2) {
    state.commandResults = null;
    state.commandLoading = false;
    return;
  }
  state.commandResults = null;
  state.commandLoading = true;
  commandSearchTimer = window.setTimeout(async () => {
    try {
      const results = await api.search(normalized);
      if (sequence !== commandSearchSequence || !state.commandOpen) return;
      state.commandResults = results;
      state.commandError = null;
    } catch (error) {
      if (sequence !== commandSearchSequence || !state.commandOpen) return;
      state.commandResults = null;
      state.commandError = error.message;
    } finally {
      if (sequence === commandSearchSequence && state.commandOpen) state.commandLoading = false;
    }
  }, 140);
}

function moveCommandSelection(delta) {
  const items = commandItems();
  if (!items.length) return;
  const current = Math.min(items.length - 1, Math.max(0, Number(state.commandIndex) || 0));
  const next = (current + delta + items.length) % items.length;
  state.commandIndex = next;
  requestAnimationFrame(() => document.getElementById(`command-option-${next}`)?.scrollIntoView({ block: "nearest" }));
}

async function openCommandSelection(index = state.commandIndex) {
  const selected = commandItems()[Number(index) || 0];
  if (!selected) return;
  const { group, item } = selected;
  if (group === "objects") {
    if (!confirmEditorNavigation()) return;
    closeCommandPalette();
    await openObjectWorkspace(Number(item.id));
    return;
  }
  if (group === "documents") {
    const objectId = Number(item.object_id || item.objectId);
    const documentId = Number(item.id);
    if (state.route === "editor" && state.selectedDocument?.id === documentId) {
      closeCommandPalette();
      return;
    }
    if (!confirmEditorNavigation()) return;
    closeCommandPalette();
    if (!objectId) {
      notify("У документа не указан объект", "error");
      return;
    }
    const selectionSequence = ++workspaceNavigationSequence;
    const routeAtSelection = state.route;
    const hashAtSelection = location.hash;
    if (!state.objects.some((object) => object.id === objectId)) await refreshObjects();
    if (selectionSequence !== workspaceNavigationSequence || state.route !== routeAtSelection || location.hash !== hashAtSelection) return;
    const opened = await openObjectWorkspace(objectId);
    if (opened && state.workspace?.object?.id === objectId) openDocumentEditor(documentId);
    return;
  }
  closeCommandPalette();
}

function confirmEditorNavigation(message = "Есть несохранённые изменения. Перейти без сохранения?") {
  if (state.route !== "editor" || !state.editorDraft?._dirty) return true;
  return window.confirm(message);
}

function applyWorkspace(workspace, objectId) {
  state.workspace = workspace;
  state.selectedObjectId = objectId;
  state.documents = workspace.documents || [];
  if (state.selectedDocument) {
    state.selectedDocument = state.documents.find((document) => document.id === state.selectedDocument.id) || null;
  }
  state.error = null;
}

async function refreshWorkspace(objectId = state.selectedObjectId || state.workspace?.object?.id) {
  if (!objectId) throw new Error("Объект не выбран");
  const workspace = await api.workspace(objectId);
  applyWorkspace(workspace, objectId);
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
    return { key: item, label: "Поле документа", message: tone === "error" ? "Обязательное поле не заполнено" : "Проверьте значение", tone };
  }
  if (!item || typeof item !== "object") return null;
  const key = String(item.key || item.field || item.name || item.marker || "");
  if (!key) return null;
  return {
    key,
    label: item.label || "Поле документа",
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
        label: field.label || "Поле документа",
        message: "Обязательное поле не заполнено",
        tone: "error",
      });
    }
  });
  (Array.isArray(document.missing_fields_json) ? document.missing_fields_json : []).forEach((item) => {
    const issue = issueDescriptor(item, "error");
    const field = fields.find((candidate) => String(candidate?.key || "") === issue?.key);
    const alias = issue ? editorAliasValue(issue.key, document, safeDraft) : undefined;
    const value = field
      ? editorFieldValue(field, document, safeDraft, resolved)
      : alias !== undefined
        ? alias
        : safeDraft.values_json?.[issue?.key];
    if (issue && !hasEditorValue(value) && !issues.has(`error:${issue.key}`)) {
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
  state.previewDocumentId = null;
  state.fileVersions = [];
  state.fileVersionsDocumentId = null;
  state.fileVersionsOpen = false;
  state.editorDraft = null;
  state.editorResolved = null;
  state.editorMarkers = null;
  state.editorIssues = [];
  state.editorDirty = false;
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

function openDocumentPreview(documentId) {
  const document = state.documents.find((item) => Number(item.id) === Number(documentId));
  if (!document) {
    notify("Документ не найден в текущем объекте", "error");
    return;
  }
  state.selectedDocument = document;
  state.previewDocumentId = document.id;
  state.fileVersions = [];
  state.fileVersionsDocumentId = null;
  state.fileVersionsOpen = false;
}

function closeDocumentPreview() {
  state.previewDocumentId = null;
  if (state.route === "object") state.selectedDocument = null;
}

async function uploadDocumentFile(documentId, file) {
  const document = state.documents.find((item) => Number(item.id) === Number(documentId))
    || (Number(state.selectedDocument?.id) === Number(documentId) ? state.selectedDocument : null);
  if (!document || !file || state.busyAction) return;
  if (file.size > 100 * 1024 * 1024) {
    notify("Файл больше 100 МБ", "error");
    return;
  }
  const replacing = Boolean(document.file_info?.file_name || document.source_file || document.output_file);
  state.busyAction = `upload-document-file-${document.id}`;
  state.uploadProgress = { documentId: document.id, fileName: file.name };
  try {
    await api.uploadDocumentFile(document.id, file);
    await Promise.all([refreshWorkspace(document.object_id), refreshObjects()]);
    const updated = state.documents.find((item) => Number(item.id) === Number(document.id));
    if (updated) state.selectedDocument = updated;
    if (state.fileVersionsOpen) {
      state.fileVersionsDocumentId = null;
      await loadFileVersions(document.id, true);
    }
    notify(replacing ? "Файл заменён, прежняя версия сохранена" : "Файл добавлен в архив");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.uploadProgress = null;
    state.busyAction = null;
  }
}

async function loadFileVersions(documentId, keepOpen = false) {
  if (!documentId || (state.busyAction && !String(state.busyAction).startsWith("upload-document-file"))) return;
  const previousBusy = state.busyAction;
  state.fileVersionsOpen = true;
  state.busyAction = `load-file-versions-${documentId}`;
  try {
    const result = await api.documentVersions(documentId);
    const current = result.current?.file_name
      ? [{
        ...result.current,
        id: "current",
        name: result.current.file_name,
        size: result.current.file_size,
        created_at: result.current.updated_at,
        download_url: result.current.download_url || api.previewUrl(documentId),
        current: true,
      }]
      : [];
    state.fileVersions = [...current, ...(Array.isArray(result.versions) ? result.versions : [])];
    state.fileVersionsDocumentId = Number(documentId);
    state.fileVersionsOpen = true;
  } catch (error) {
    notify(error.message, "error");
    if (!keepOpen) state.fileVersionsOpen = false;
  } finally {
    state.busyAction = previousBusy && String(previousBusy).startsWith("upload-document-file") ? previousBusy : null;
  }
}

function toggleFileVersions(documentId) {
  if (state.fileVersionsOpen) {
    state.fileVersionsOpen = false;
    return;
  }
  if (state.fileVersionsDocumentId === Number(documentId)) {
    state.fileVersionsOpen = true;
    return;
  }
  loadFileVersions(documentId);
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
  if (indicator) indicator.innerHTML = `${icon("clock", 14)}<span>Есть несохранённые изменения</span>`;
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
    const isWarning = issue?.tone === "warning";
    field.classList.toggle("is-error", isError);
    field.classList.toggle("is-warning", isWarning);
    if (control) {
      if (isError) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
    if (message) {
      if (issue) {
        message.innerHTML = `${icon(isWarning ? "alertTriangle" : "alertCircle", 14)}<span>${escapeHtml(issue.message || "Проверьте значение")}</span>`;
      } else {
        const templateField = (state.editorResolved?.fields || []).find((item) => String(item?.key || "") === String(key));
        const source = String(templateField?.source || "");
        const documentBound = editorAliasValue(String(key), state.selectedDocument || {}, state.editorDraft || {}) !== undefined;
        if (source.startsWith("object.")) message.innerHTML = `${icon("info", 14)}<span>Из карточки объекта · изменяется в карточке объекта</span>`;
        else if (documentBound) message.innerHTML = `${icon("info", 14)}<span>Связано с основными реквизитами документа</span>`;
        else if (templateField?.required) message.innerHTML = "<span>Обязательное поле</span>";
        else message.innerHTML = '<span aria-hidden="true">&nbsp;</span>';
      }
    }
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
  const documentId = Number(select.dataset.document || state.selectedDocument?.id);
  const document = state.documents.find((item) => Number(item.id) === documentId)
    || (Number(state.selectedDocument?.id) === documentId ? state.selectedDocument : null);
  if (!document || state.busyAction) return;
  const previous = document.completion_status || "not_started";
  state.busyAction = `change-completion-${document.id}`;
  try {
    await api.updateCompletion(document.id, select.value);
    await Promise.all([refreshWorkspace(document.object_id), refreshObjects()]);
    state.selectedDocument = state.documents.find((item) => Number(item.id) === Number(document.id)) || state.selectedDocument;
    notify("Статус документа обновлён");
  } catch (error) {
    if (error.missingFields?.length) {
      state.editorIssues = error.missingFields.map((key) => ({ key, label: key, message: "Обязательное поле не заполнено", tone: "error" }));
    }
    const current = root.querySelector(`[data-action="change-completion"][data-document="${CSS.escape(String(document.id))}"]`);
    if (current) current.value = previous;
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
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
    state.previewDocumentId = null;
    state.fileVersions = [];
    state.fileVersionsDocumentId = null;
    state.fileVersionsOpen = false;
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
  const navigationSequence = ++workspaceNavigationSequence;
  const routeAtStart = state.route;
  const hashAtStart = location.hash;
  const navigationChanged = () => navigationSequence !== workspaceNavigationSequence || state.route !== routeAtStart || location.hash !== hashAtStart;
  state.busyAction = `open-object-${objectId}`;
  try {
    if (object.status !== "archived" && state.app?.activeObjectId !== objectId) {
      state.app = await api.selectObject(objectId);
      if (navigationChanged()) return false;
    }
    const workspace = await api.workspace(objectId);
    if (navigationChanged()) return false;
    applyWorkspace(workspace, objectId);
    state.selectedGroupId = "all";
    state.objectTab = "registry";
    state.previewDocumentId = null;
    state.selectedDocument = null;
    navigate("object");
    return true;
  } catch (error) {
    notify(error.message, "error");
    return false;
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

async function duplicateTemplate(templateId) {
  if (!templateId || state.busyAction) return;
  state.busyAction = `duplicate-template-${templateId}`;
  try {
    await api.duplicateTemplate(templateId);
    await refreshTemplates();
    notify("Копия шаблона добавлена");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
  }
}

async function confirmArchiveTemplate(templateId) {
  if (!templateId || state.busyAction) return;
  state.busyAction = `archive-template-${templateId}`;
  try {
    await api.archiveTemplate(templateId);
    await refreshTemplates();
    state.modal = null;
    state.modalData = null;
    notify("Шаблон перемещён в архив");
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
    if (routeTarget.dataset.route !== state.route && !confirmEditorNavigation()) return;
    state.previewDocumentId = null;
    navigate(routeTarget.dataset.route);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (action) {
    if (action === "open-command") {
      openCommandPalette();
    } else if (action === "close-command") {
      closeCommandPalette();
    } else if (action === "command-result") {
      openCommandSelection(Number(actionTarget.dataset.commandIndex));
    } else if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("idv-theme", state.theme);
    } else if (action === "new-template") {
      state.modalData = null;
      state.modal = "new-template";
    } else if (action === "preview-template") {
      state.modalData = { templateId: Number(actionTarget.dataset.templateId) };
      state.modal = "template-preview";
    } else if (action === "replace-template") {
      state.modalData = { templateId: Number(actionTarget.dataset.templateId) };
      state.modal = "replace-template";
    } else if (action === "add-template-to-object") {
      state.modalData = {
        templateId: Number(actionTarget.dataset.templateId),
        objectId: state.workspace?.object?.id || state.objects.find((object) => object.status !== "archived")?.id || null,
      };
      state.templateTargetGroups = state.workspace?.groups || [];
      state.modal = "add-template-to-object";
    } else if (action === "duplicate-template") {
      duplicateTemplate(Number(actionTarget.dataset.templateId));
    } else if (action === "archive-template") {
      state.modalData = { templateId: Number(actionTarget.dataset.templateId) };
      state.modal = "archive-template";
    } else if (action === "confirm-archive-template") {
      confirmArchiveTemplate(Number(actionTarget.dataset.templateId));
    } else if (action === "filter-templates") {
      state.templateCategory = actionTarget.dataset.templateCategory || "all";
    } else if (action === "clear-template-filters") {
      state.templateQuery = "";
      state.templateCategory = "all";
      requestAnimationFrame(() => document.getElementById("templateSearch")?.focus());
    } else if (action === "template-details") {
      openTemplateDetails(Number(actionTarget.dataset.templateId));
    } else if (action === "retry-template-details") {
      openTemplateDetails(Number(actionTarget.dataset.templateId || state.templateDetails?.template?.id));
    } else if (action === "retry-templates") {
      retryTemplates();
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
    } else if (action === "set-completeness-filter") {
      state.completionFilter = actionTarget.dataset.filter || "all";
    } else if (action === "clear-document-filters") {
      state.selectedGroupId = "all";
      state.completionFilter = "all";
      state.documentQuery = "";
      requestAnimationFrame(() => document.getElementById("documentSearch")?.focus());
    } else if (action === "open-document") {
      openDocumentPreview(Number(actionTarget.dataset.documentId));
    } else if (action === "open-document-full") {
      openDocumentEditor(Number(actionTarget.dataset.documentId));
    } else if (action === "close-document-preview") {
      closeDocumentPreview();
    } else if (action === "toggle-file-versions") {
      toggleFileVersions(Number(actionTarget.dataset.documentId));
    } else if (action === "toggle-preview-zoom") {
      const preview = actionTarget.closest(".file-preview--image");
      preview?.classList.toggle("is-zoomed");
      actionTarget.setAttribute("aria-label", preview?.classList.contains("is-zoomed") ? "Уменьшить изображение" : "Увеличить изображение");
    } else if (action === "open-source-document") {
      window.open(api.sourceUrl(Number(actionTarget.dataset.documentId)), "_blank", "noopener,noreferrer");
    } else if (action === "download-document") {
      window.open(api.fileUrl(Number(actionTarget.dataset.documentId)), "_blank", "noopener,noreferrer");
    } else if (action === "download-source-document") {
      const documentId = Number(actionTarget.dataset.documentId);
      const sourceDocument = state.documents.find((item) => Number(item.id) === documentId);
      const file = sourceDocument ? documentFileInfo(sourceDocument) : null;
      const anchor = document.createElement("a");
      anchor.href = sourceDocument?.file_info?.download_url || api.previewUrl(documentId);
      anchor.download = file?.fileName || "";
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
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
    return;
  }
  const documentTarget = event.target.closest("[data-document]");
  if (documentTarget && !event.target.closest("[data-action]")) {
    openDocumentPreview(Number(documentTarget.dataset.document));
  }
});

root.addEventListener("input", (event) => {
  if (event.target.matches("#commandInput")) {
    queueCommandSearch(event.target.value);
    return;
  }
  if (event.target.matches("#objectSearch")) state.objectQuery = event.target.value;
  if (event.target.matches("#documentSearch")) state.documentQuery = event.target.value;
  if (event.target.matches("#templateSearch")) state.templateQuery = event.target.value;
  if (event.target.matches('#importDocumentForm input[type="file"]')) {
    const files = [...(event.target.files || [])];
    const label = event.target.closest(".object-file-field")?.querySelector("strong");
    if (label) label.textContent = files.length ? `${files.length} ${files.length === 1 ? "файл" : "файла"}` : "Выберите один или несколько файлов";
    const list = event.target.form?.querySelector("[data-import-file-list]");
    if (list) {
      list.replaceChildren(...files.map((file) => {
        const row = document.createElement("span");
        row.textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} КБ`;
        return row;
      }));
    }
  }
  if (event.target.matches('#newTemplateFileForm input[type="file"], #replaceTemplateFileForm input[type="file"]')) {
    const file = event.target.files?.[0];
    const label = event.target.closest(".template-dropzone")?.querySelector(".template-dropzone__filename");
    if (label) label.textContent = file?.name || "Файл не выбран";
  }
});

root.addEventListener("change", (event) => {
  if (event.target.matches("[data-document-file-input]")) {
    const file = event.target.files?.[0];
    if (file) uploadDocumentFile(Number(event.target.dataset.documentId), file);
    return;
  }
  if (event.target.matches('[data-action="change-completion"]')) {
    changeDocumentCompletion(event.target);
    return;
  }
  if (event.target.matches("#completionFilter")) {
    state.completionFilter = event.target.value || "all";
  }
  if (event.target.matches('#addTemplateToObjectForm [name="object_id"]')) {
    const objectId = Number(event.target.value);
    const formData = new FormData(event.target.form);
    state.modalData = {
      ...state.modalData,
      objectId,
      title: String(formData.get("title") || ""),
      number: String(formData.get("number") || ""),
    };
    state.templateTargetGroups = [];
    api.workspace(objectId).then((workspace) => {
      if (Number(state.modalData?.objectId) === objectId) state.templateTargetGroups = workspace.groups || [];
    }).catch((error) => notify(error.message, "error"));
  }
});

root.addEventListener("dblclick", (event) => {
  const documentRow = event.target.closest("[data-document]");
  if (documentRow && !event.target.closest("[data-action]")) {
    openDocumentEditor(Number(documentRow.dataset.document));
  }
});

root.addEventListener("dragenter", (event) => {
  const zone = event.target.closest("[data-object-drop], [data-file-drop]");
  if (!zone || !event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  dragDepth.set(zone, (dragDepth.get(zone) || 0) + 1);
  zone.classList.add("is-dragover");
});

root.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-object-drop], [data-file-drop]");
  if (!zone || !event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

root.addEventListener("dragleave", (event) => {
  const zone = event.target.closest("[data-object-drop], [data-file-drop]");
  if (!zone) return;
  const depth = Math.max(0, (dragDepth.get(zone) || 1) - 1);
  dragDepth.set(zone, depth);
  if (!depth) zone.classList.remove("is-dragover");
});

root.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-object-drop], [data-file-drop]");
  if (!zone) return;
  event.preventDefault();
  dragDepth.set(zone, 0);
  zone.classList.remove("is-dragover");
  const files = [...(event.dataTransfer?.files || [])];
  if (!files.length) return;
  if (zone.matches("[data-file-drop]")) {
    if (files.length > 1) notify("Для замены используется первый файл", "warning");
    uploadDocumentFile(Number(zone.dataset.documentId), files[0]);
    return;
  }
  const groupId = state.selectedGroupId === "all" ? null : Number(state.selectedGroupId);
  importDroppedFiles(files, groupId);
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
  const files = formData.getAll("files").filter((file) => file instanceof File && file.name);
  if (!objectId || !files.length) {
    notify("Выберите хотя бы один файл", "error");
    return;
  }
  await runFormAction(form, async () => {
    let imported = 0;
    const failed = [];
    for (const file of files) {
      try {
        await api.importFile(objectId, file, optionalNumber(formData.get("group_id")));
        imported += 1;
      } catch (error) {
        failed.push(`${file.name}: ${error.message}`);
      }
    }
    await Promise.all([refreshWorkspace(objectId), refreshObjects()]);
    if (imported) {
      state.modal = null;
      state.modalData = null;
      notify(imported === 1 ? "Файл добавлен в архив" : `Добавлено файлов: ${imported}`, failed.length ? "warning" : "success");
    }
    if (failed.length) throw new Error(`Не добавлено файлов: ${failed.length}. ${failed[0]}`);
  });
}

async function importDroppedFiles(files, groupId = null) {
  const objectId = state.workspace?.object?.id;
  const accepted = [...files].filter((file) => file instanceof File && file.name);
  if (!objectId || !accepted.length || state.busyAction) return;
  state.busyAction = "import-document-file";
  let imported = 0;
  const failed = [];
  try {
    for (const file of accepted) {
      try {
        await api.importFile(objectId, file, groupId);
        imported += 1;
      } catch (error) {
        failed.push(`${file.name}: ${error.message}`);
      }
    }
    await Promise.all([refreshWorkspace(objectId), refreshObjects()]);
    if (imported) notify(imported === 1 ? "Файл добавлен в архив" : `Добавлено файлов: ${imported}`, failed.length ? "warning" : "success");
    if (failed.length) notify(`Не добавлено файлов: ${failed.length}. ${failed[0]}`, "error");
  } finally {
    state.busyAction = null;
  }
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
    group_id: optionalNumber(formData.get("group_id")),
    number: String(formData.get("number") || "").trim() || null,
    title: String(formData.get("title") || "").trim(),
    doc_type: String(formData.get("doc_type") || "aosr"),
    work_title: String(formData.get("work_title") || "").trim(),
    document_date: String(formData.get("document_date") || "").trim(),
  };
  await runFormAction(form, async () => {
    const created = await api.createDocument(payload);
    await Promise.all([refreshWorkspace(objectId), refreshObjects()]);
    state.modal = null;
    state.modalData = null;
    notify("Ожидаемый документ добавлен в реестр");
    openDocumentPreview(created.id);
  });
}

function validTemplateFile(file) {
  if (!(file instanceof File) || !file.name) return "Выберите файл шаблона";
  if (!/\.(docx|xlsx|pdf)$/i.test(file.name)) return "Поддерживаются DOCX, XLSX и PDF";
  if (file.size > 25 * 1024 * 1024) return "Файл шаблона больше 25 МБ";
  return "";
}

async function createTemplateFromForm(form) {
  const formData = new FormData(form);
  const file = formData.get("file");
  const validation = validTemplateFile(file);
  if (validation) {
    notify(validation, "error");
    form.elements.file?.focus();
    return;
  }
  await runFormAction(form, async () => {
    await api.createTemplate({
      file,
      title: String(formData.get("title") || "").trim(),
      docType: String(formData.get("doc_type") || "other"),
      groupKind: String(formData.get("group_kind") || "other"),
      notes: String(formData.get("notes") || "").trim(),
    });
    await refreshTemplates();
    state.modal = null;
    state.modalData = null;
    notify("Шаблон добавлен в библиотеку");
  });
}

async function replaceTemplateFromForm(form) {
  const formData = new FormData(form);
  const templateId = optionalNumber(formData.get("template_id"));
  const file = formData.get("file");
  const validation = validTemplateFile(file);
  if (!templateId || validation) {
    notify(validation || "Шаблон не найден", "error");
    if (validation) form.elements.file?.focus();
    return;
  }
  await runFormAction(form, async () => {
    await api.uploadTemplateFile(templateId, file);
    await refreshTemplates();
    state.modal = null;
    state.modalData = null;
    notify("Новая версия шаблона сохранена");
  });
}

async function copyTemplateToObjectFromForm(form) {
  const formData = new FormData(form);
  const templateId = optionalNumber(formData.get("template_id"));
  const objectId = optionalNumber(formData.get("object_id"));
  if (!templateId || !objectId) {
    notify("Выберите объект", "error");
    return;
  }
  await runFormAction(form, async () => {
    const created = await api.copyTemplate(templateId, {
      object_id: objectId,
      group_id: optionalNumber(formData.get("group_id")),
      title: String(formData.get("title") || "").trim() || null,
      number: String(formData.get("number") || "").trim() || null,
    });
    if (Number(state.workspace?.object?.id) === objectId) await refreshWorkspace(objectId);
    await refreshObjects();
    state.modal = null;
    state.modalData = null;
    notify("Шаблон скопирован в объект");
    if (Number(state.workspace?.object?.id) === objectId && state.route === "object") openDocumentPreview(created.id);
  });
}

async function uploadTemplateFromForm(form) {
  if (state.busyAction) return;
  const formData = new FormData(form);
  const templateId = optionalNumber(formData.get("template_id"));
  const file = formData.get("file");
  if (!templateId) {
    form.elements.template_id?.focus();
    notify("Выберите форму документа", "error");
    return;
  }
  if (!(file instanceof File) || !file.name) {
    form.elements.file?.focus();
    notify("Выберите файл DOCX", "error");
    return;
  }
  if (!file.name.toLocaleLowerCase("ru-RU").endsWith(".docx")) {
    form.elements.file?.focus();
    notify("Шаблон должен быть файлом DOCX", "error");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    form.elements.file?.focus();
    notify("Файл DOCX больше 25 МБ", "error");
    return;
  }

  state.busyAction = "upload-template-file";
  setFormBusy(form, true);
  try {
    const result = await api.uploadTemplateFile(templateId, file);
    const templates = await api.templates();
    const template = result.template || templates.find((item) => item.id === templateId);
    state.templateWizard = { ...result, template, error: null };
    state.templateDetails = { ...result, template, loading: false, error: null };
    state.templates = templates;
    state.modalData = null;
    state.modal = "marker-map";
    notify("DOCX загружен — проверьте сопоставления");
  } catch (error) {
    state.modalData = { templateId, error: error.message };
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
    if (document.contains(form)) setFormBusy(form, false);
  }
}

async function saveMarkerMapFromForm(form) {
  if (state.busyAction) return;
  const wizard = state.templateWizard || {};
  const templateId = Number(wizard.template?.id || wizard.template_id);
  if (!templateId || !wizard.template_file) {
    notify("Не удалось определить загруженный шаблон", "error");
    return;
  }
  const markerMap = {};
  const rawMap = wizard.marker_map?.markers || wizard.marker_map || {};
  form.querySelectorAll('select[name="mapping"][data-marker-name]').forEach((select) => {
    const markerName = String(select.dataset.markerName || "").trim();
    const source = String(select.value || "").trim();
    if (!markerName) return;
    const marker = Array.isArray(wizard.markers)
      ? wizard.markers.find((item) => String(item?.name) === markerName)
      : null;
    const original = Object.hasOwn(rawMap, markerName) ? rawMap[markerName] : marker?.mapping;
    const originalSource = typeof original === "string"
      ? original
      : String(original?.field || original?.source || "");
    markerMap[markerName] = original && typeof original === "object" && source === originalSource
      ? original
      : source;
  });

  state.busyAction = "bind-template";
  setFormBusy(form, true);
  try {
    const result = await api.bindTemplate(templateId, {
      template_file: wizard.template_file,
      marker_map: markerMap,
    });
    const templates = await api.templates();
    const template = result.template || templates.find((item) => item.id === templateId);
    state.templates = templates;
    state.templateDetails = { ...result, template, loading: false, error: null };
    state.templateWizard = null;
    state.modal = null;
    state.modalData = null;
    notify("Сопоставления сохранены");
  } catch (error) {
    state.templateWizard = { ...wizard, marker_map: markerMap, error: error.message };
    notify(error.message, "error");
  } finally {
    state.busyAction = null;
    if (document.contains(form)) setFormBusy(form, false);
  }
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
    newTemplateFileForm: createTemplateFromForm,
    replaceTemplateFileForm: replaceTemplateFromForm,
    addTemplateToObjectForm: copyTemplateToObjectFromForm,
    uploadTemplateForm: uploadTemplateFromForm,
    markerMapForm: saveMarkerMapFromForm,
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
    openDocumentPreview(Number(documentRow.dataset.document));
  }
});

toastHost.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close-toast"]')) state.toast = null;
});

async function loadApplication() {
  state.loading = true;
  state.error = null;
  const [appResult, objectsResult, templatesResult] = await Promise.allSettled([
    api.state(),
    api.objectSummaries(),
    api.templates(),
  ]);

  state.app = appResult.status === "fulfilled" ? appResult.value : null;
  state.objects = objectsResult.status === "fulfilled" ? objectsResult.value : [];
  state.templates = templatesResult.status === "fulfilled" ? templatesResult.value : [];
  state.templateError = templatesResult.status === "rejected" ? templatesResult.reason.message : null;
  state.backendOnline = [appResult, objectsResult, templatesResult].some((result) => result.status === "fulfilled");
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

async function recoverWorkspaceForCurrentRoute() {
  const route = state.route;
  if (!["object", "editor"].includes(route) || state.workspace?.object || state.loading || routeWorkspaceRecovery) return;
  const objectId = Number(state.app?.activeObjectId || state.objects.find((object) => object.is_current)?.id || 0);
  if (!objectId) return;
  routeWorkspaceRecovery = (async () => {
    state.loading = true;
    state.error = null;
    try {
      const workspace = await api.workspace(objectId);
      if (state.route !== route) return;
      applyWorkspace(workspace, objectId);
      if (route === "editor") {
        const documentId = Number(state.requestedDocumentId || location.hash.split("/").at(-1));
        const document = state.documents.find((item) => Number(item.id) === documentId);
        if (!document) throw new Error("Документ не найден в текущем объекте");
        loadEditorDocument(document);
      }
    } catch (error) {
      if (state.route === route) state.error = error.message;
    } finally {
      if (state.route === route) state.loading = false;
      routeWorkspaceRecovery = null;
    }
  })();
  await routeWorkspaceRecovery;
}

function trapOverlayFocus(event) {
  if (event.key !== "Tab") return false;
  const selector = state.commandOpen ? "[data-command-dialog]" : state.modal ? "[data-modal]" : null;
  if (!selector) return false;
  const container = root.querySelector(selector);
  if (!container) return false;
  const focusable = [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function openQuickCreate() {
  if (state.route === "objects") {
    state.modalData = null;
    state.modal = "new-object";
    return;
  }
  if (["object", "editor"].includes(state.route) && state.workspace?.object?.status !== "archived") {
    if (!confirmEditorNavigation("Есть несохранённые изменения. Новый документ откроется в редакторе, а текущие правки будут потеряны. Продолжить?")) return;
    state.modalData = { group_id: state.selectedGroupId === "all" ? null : state.selectedGroupId };
    state.modal = "new-document";
    return;
  }
  if (state.route === "templates") {
    state.modalData = null;
    state.modal = "new-template";
  }
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLocaleLowerCase();
  const primaryModifier = event.ctrlKey || event.metaKey;

  if (primaryModifier && key === "k") {
    event.preventDefault();
    if (state.commandOpen) closeCommandPalette();
    else if (!state.modal) openCommandPalette();
    return;
  }

  if (trapOverlayFocus(event)) return;

  if (state.commandOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
    } else if (event.target.matches("#commandInput") && event.key === "ArrowDown") {
      event.preventDefault();
      moveCommandSelection(1);
    } else if (event.target.matches("#commandInput") && event.key === "ArrowUp") {
      event.preventDefault();
      moveCommandSelection(-1);
    } else if (event.target.matches("#commandInput") && event.key === "Enter" && commandItems().length) {
      event.preventDefault();
      openCommandSelection();
    }
    return;
  }

  if (primaryModifier && key === "n" && !state.modal) {
    event.preventDefault();
    openQuickCreate();
    return;
  }

  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    state.modalData = null;
    return;
  }
  if (event.key === "Escape" && state.previewDocumentId) {
    closeDocumentPreview();
    return;
  }
  if (event.key === "/" && !state.modal && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement) && !target.isContentEditable) {
      const searchId = { objects: "objectSearch", object: "documentSearch", templates: "templateSearch" }[state.route];
      if (!searchId) return;
      event.preventDefault();
      document.getElementById(searchId)?.focus();
    }
  }
});

initRouter();
addEventListener("hashchange", () => queueMicrotask(recoverWorkspaceForCurrentRoute));
addEventListener("popstate", () => queueMicrotask(recoverWorkspaceForCurrentRoute));
render();
loadApplication();

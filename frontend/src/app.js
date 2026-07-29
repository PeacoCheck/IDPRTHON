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
  return "";
}

function captureUiPosition() {
  const active = document.activeElement;
  const main = document.getElementById("mainContent");
  if (!active || !root.contains(active)) return { mainScroll: main?.scrollTop || 0 };
  const selector = active.id
    ? `#${CSS.escape(active.id)}`
    : active.name
      ? `[name="${CSS.escape(active.name)}"]`
      : null;
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
  if (!active) return;
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

function openDocumentEditor(documentId) {
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) {
    notify("Документ не найден в текущем объекте", "error");
    return;
  }
  state.selectedDocument = document;
  state.requestedDocumentId = document.id;
  navigate("editor", { document });
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
      const document = state.documents.find((item) => item.id === Number(actionTarget.dataset.documentId));
      if (document) {
        state.selectedDocument = document;
        state.modalData = { document };
        state.modal = "delete-document";
      }
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
  if (event.target.matches('#importDocumentForm input[type="file"]')) {
    const file = event.target.files?.[0];
    const label = event.target.closest(".object-file-field")?.querySelector("strong");
    if (label) label.textContent = file?.name || "Выберите файл";
  }
});

root.addEventListener("change", (event) => {
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
  state.loading = false;

  const currentObjectId = state.app?.activeObjectId;
  if (currentObjectId && ["object", "editor"].includes(state.route)) {
    try {
      const workspace = await api.workspace(currentObjectId);
      state.workspace = workspace;
      state.selectedObjectId = currentObjectId;
      state.documents = workspace.documents || [];
    } catch (error) {
      state.error = error.message;
    }
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    state.modalData = null;
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

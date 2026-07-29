import "@fontsource-variable/manrope";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/forms.css";
import "./styles/tables.css";
import "./styles/overlays.css";
import "./styles/themes.css";
import "./styles/utilities.css";
import "./styles/product.css";
import "./styles/polish.css";

import { api } from "./api.js";
import { icon } from "./components/icons.js";
import { initRouter, navigate } from "./router.js";
import { notify, state, subscribe } from "./store.js";
import {
  editorView,
  objectView,
  objectsView,
  searchResultsView,
  shell,
  templatesView,
  toastView,
} from "./views/views.js";

const root = document.getElementById("app");
const toastHost = document.createElement("div");
toastHost.id = "toastHost";
toastHost.setAttribute("aria-live", "polite");
document.body.append(toastHost);
let renderQueued = false;
let searchRequestId = 0;
let searchTimer = null;
let lastRenderedRoute = null;
let lastRenderIdentity = null;

function renderIdentity() {
  return [state.route, state.workspace?.object?.id || "", state.selectedDocument?.id || "", state.objectTab || ""].join(":");
}

function controlKey(control) {
  const form = control?.closest?.("form");
  if (!control) return null;
  const id = control.dataset?.templateField || control.name || control.id;
  return id ? `${form?.id || "page"}|${id}` : null;
}

function captureInteraction() {
  const content = root.querySelector(".light-content");
  const controls = root.querySelectorAll("#documentForm input, #documentForm textarea, #documentForm select, #objectProfileForm input, #objectProfileForm textarea, #objectProfileForm select, #editorCompletionStatus");
  const values = new Map();
  controls.forEach((control) => {
    const key = controlKey(control);
    if (key) values.set(key, control.type === "checkbox" ? control.checked : control.value);
  });
  const active = document.activeElement;
  return {
    scrollTop: content?.scrollTop || 0,
    scrollLeft: content?.scrollLeft || 0,
    values,
    activeKey: controlKey(active),
    selectionStart: active?.selectionStart,
    selectionEnd: active?.selectionEnd,
  };
}

function restoreInteraction(snapshot) {
  if (!snapshot) return;
  const content = root.querySelector(".light-content");
  if (content) {
    content.scrollTop = snapshot.scrollTop;
    content.scrollLeft = snapshot.scrollLeft;
  }
  const controls = root.querySelectorAll("#documentForm input, #documentForm textarea, #documentForm select, #objectProfileForm input, #objectProfileForm textarea, #objectProfileForm select, #editorCompletionStatus");
  controls.forEach((control) => {
    const key = controlKey(control);
    if (!key || !snapshot.values.has(key)) return;
    if (control.type === "checkbox") control.checked = snapshot.values.get(key);
    else control.value = snapshot.values.get(key);
  });
  const active = [...controls].find((control) => controlKey(control) === snapshot.activeKey);
  if (active) {
    active.focus({ preventScroll: true });
    if (typeof active.setSelectionRange === "function" && Number.isInteger(snapshot.selectionStart)) {
      active.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }
}

function routeView() {
  const views = {
    objects: objectsView,
    object: objectView,
    editor: editorView,
    templates: templatesView,
  };
  return (views[state.route] || objectsView)(state);
}

function render() {
  renderQueued = false;
  const sameRoute = lastRenderedRoute === state.route;
  const identity = renderIdentity();
  const interaction = lastRenderIdentity === identity ? captureInteraction() : null;
  document.documentElement.dataset.theme = state.theme;
  if (state.loading || !state.app) {
    root.innerHTML = `<div class="boot boot--clean"><span class="boot__mark">ID</span><div><strong>ID Vault</strong><small>Собираю структуру объектов…</small></div></div>`;
    return;
  }
  root.innerHTML = shell(state, routeView());
  const content = root.querySelector(".light-content");
  if (!sameRoute && content) {
    content.classList.add("is-route-entering");
    window.setTimeout(() => content.isConnected && content.classList.remove("is-route-entering"), 220);
  }
  if (interaction) requestAnimationFrame(() => restoreInteraction(interaction));
  lastRenderedRoute = state.route;
  lastRenderIdentity = identity;
  renderToast();
  if (state.commandOpen) requestAnimationFrame(() => document.getElementById("globalSearch")?.focus());
  if (state.modal) requestAnimationFrame(() => root.querySelector("[data-modal] [autofocus]")?.focus());
}

function renderToast() {
  toastHost.innerHTML = toastView(state);
}

function applyTemplateFilters() {
  const group = root.querySelector("[data-template-group-filter].is-active")?.dataset.templateGroupFilter || "all";
  const query = (document.getElementById("templateSearch")?.value || "").trim().toLowerCase();
  let visible = 0;
  root.querySelectorAll("[data-template-section]").forEach((section) => {
    const groupMatches = group === "all" || section.dataset.templateSection === group;
    let sectionVisible = 0;
    section.querySelectorAll("[data-template-card]").forEach((card) => {
      const matches = groupMatches && card.textContent.toLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) sectionVisible += 1;
    });
    section.hidden = !groupMatches || sectionVisible === 0;
    visible += sectionVisible;
  });
  const empty = root.querySelector(".library-empty");
  if (empty) empty.hidden = visible > 0;
}

subscribe((key) => {
  if (key === "toast") {
    renderToast();
    return;
  }
  if (key === "theme") {
    document.documentElement.dataset.theme = state.theme;
    const button = root.querySelector('[data-action="toggle-theme"]');
    if (button) button.innerHTML = icon(state.theme === "dark" ? "sun" : "moon");
    return;
  }
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(render);
  }
});

async function loadWorkspace(objectId) {
  const id = Number(objectId);
  const workspace = await api.workspace(id);
  state.selectedObjectId = id;
  state.workspace = workspace;
  state.documents = workspace.documents;
  state.app.currentObject = workspace.object;
}

async function refreshObjects() {
  state.objects = await api.objectSummaries();
}

async function load() {
  try {
    const [app, objects, templates, presets] = await Promise.all([
      api.state(),
      api.objectSummaries(),
      api.templates(),
      api.presets(),
    ]);
    state.app = app;
    state.objects = objects;
    state.templates = templates;
    state.presets = presets;
    await loadWorkspace(app.currentObject.id);
    if (state.route === "editor" && !state.selectedDocument) {
      state.selectedDocument = state.workspace.documents.find((item) => item.id === state.requestedDocumentId) || state.workspace.documents[0] || null;
    }
  } catch (error) {
    root.innerHTML = `<section class="fatal"><strong>Не удалось открыть ID Vault</strong><p>${error.message}</p><button onclick="location.reload()">Повторить</button></section>`;
  } finally {
    state.loading = false;
  }
}

root.addEventListener("click", async (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    navigate(routeTarget.dataset.route);
    return;
  }

  const objectTarget = event.target.closest("[data-open-object]");
  if (objectTarget) {
    try {
      const object = state.objects.find((item) => item.id === Number(objectTarget.dataset.openObject));
      if (object?.status === "active") await api.selectObject(object.id);
      await loadWorkspace(objectTarget.dataset.openObject);
      state.selectedDocument = null;
      state.objectTab = "registry";
      state.selectedGroupId = "all";
      state.completionFilter = "all";
      navigate("object");
    } catch (error) {
      notify(error.message, "error");
    }
    return;
  }

  const objectFilterTarget = event.target.closest("[data-object-filter]");
  if (objectFilterTarget) {
    state.objectFilter = objectFilterTarget.dataset.objectFilter;
    return;
  }

  const editorSectionTarget = event.target.closest("[data-editor-section]");
  if (editorSectionTarget) {
    const section = document.getElementById(editorSectionTarget.dataset.editorSection);
    root.querySelectorAll("[data-editor-section]").forEach((button) => button.classList.toggle("is-active", button === editorSectionTarget));
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const templateFilterTarget = event.target.closest("[data-template-group-filter]");
  if (templateFilterTarget) {
    root.querySelectorAll("[data-template-group-filter]").forEach((button) => button.classList.toggle("is-active", button === templateFilterTarget));
    applyTemplateFilters();
    return;
  }

  const groupTarget = event.target.closest("[data-group]");
  if (groupTarget) {
    state.selectedGroupId = groupTarget.dataset.group;
    return;
  }

  const tabTarget = event.target.closest("[data-object-tab]");
  if (tabTarget) {
    state.objectTab = tabTarget.dataset.objectTab;
    return;
  }

  const documentTarget = event.target.closest("[data-document]:not([data-action])");
  if (documentTarget) {
    try {
      const targetObjectId = Number(documentTarget.dataset.objectId);
      if (targetObjectId && targetObjectId !== state.workspace?.object?.id) {
        const targetObject = state.objects.find((item) => item.id === targetObjectId);
        if (targetObject?.status === "active") await api.selectObject(targetObjectId);
        await loadWorkspace(targetObjectId);
      }
      const doc = state.workspace?.documents.find((item) => item.id === Number(documentTarget.dataset.document));
      if (doc) {
        state.selectedDocument = doc;
        state.commandOpen = false;
        state.objectTab = "registry";
        state.selectedGroupId = doc.group_id || "all";
        navigate("editor", { document: doc });
      }
    } catch (error) {
      notify(error.message, "error");
    }
    return;
  }

  const groupKindTarget = event.target.closest("[data-group-kind]");
  if (groupKindTarget) {
    const group = state.workspace.groups.find((item) => item.kind === groupKindTarget.dataset.groupKind);
    state.selectedGroupId = group?.id || "all";
    state.objectTab = "registry";
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (!action) return;

  try {
    if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("idv-theme", state.theme);
    } else if (action === "open-command") {
      state.commandOpen = true;
    } else if (action === "close-command" && !event.target.closest("[data-command]")) {
      state.commandOpen = false;
    } else if (action === "close-toast") {
      state.toast = null;
    } else if (action === "new-object") {
      state.modal = "new-object";
      state.modalData = null;
    } else if (action === "new-group") {
      state.modal = "new-group";
      state.modalData = null;
    } else if (action === "choose-document-file") {
      state.modal = null;
      state.modalData = null;
      requestAnimationFrame(() => document.getElementById("documentFileInput")?.click());
    } else if (action === "refresh-integrity") {
      await loadWorkspace(state.workspace.object.id);
      await refreshObjects();
      notify("Комплектность обновлена");
    } else if (action === "archive-object") {
      const nextState = await api.archiveObject(state.workspace.object.id);
      state.app = nextState;
      await refreshObjects();
      await loadWorkspace(nextState.currentObject.id);
      state.objectFilter = "archived";
      navigate("objects");
      notify("Объект перемещён в архив");
    } else if (action === "restore-object") {
      const restoredId = state.workspace.object.id;
      await api.restoreObject(restoredId);
      await api.selectObject(restoredId);
      await refreshObjects();
      await loadWorkspace(restoredId);
      state.objectFilter = "active";
      notify("Объект возвращён из архива");
    } else if (action === "create-group") {
      const form = document.getElementById("newGroupForm");
      if (!form.reportValidity()) return;
      await api.addGroup(state.workspace.object.id, Object.fromEntries(new FormData(form)));
      await loadWorkspace(state.workspace.object.id);
      state.modal = null;
      notify("Группа добавлена в структуру объекта");
    } else if (action === "create-object") {
      const form = document.getElementById("newObjectForm");
      if (!form.reportValidity()) return;
      const created = await api.addObject(Object.fromEntries(new FormData(form)));
      await refreshObjects();
      await loadWorkspace(created.id);
      state.modal = null;
      state.objectTab = "profile";
      navigate("object");
      notify(`Объект ${created.code} создан со стандартной структурой`);
    } else if (action === "new-document" || action === "use-template" || action === "add-for-rule") {
      const selectedGroup = action === "new-document" && state.selectedGroupId !== "all" ? Number(state.selectedGroupId) : null;
      state.modalData = { groupId: selectedGroup || null };
      if (action === "use-template") await selectTemplate(Number(actionTarget.dataset.template));
      if (action === "add-for-rule") {
        const rule = state.workspace.integrity.checks.find((item) => item.id === Number(actionTarget.dataset.rule));
        const ruleGroup = state.workspace.groups.find((item) => item.kind === rule?.group_kind);
        state.modalData.groupId = ruleGroup?.id || null;
        const template = state.templates.find((item) => rule?.doc_types?.includes(item.doc_type));
        if (template) await selectTemplate(template.id);
      }
      state.modal = "new-document";
    } else if (action === "select-template") {
      await selectTemplate(Number(actionTarget.dataset.template));
    } else if (action === "select-preset") {
      await selectTemplate(Number(actionTarget.dataset.template), Number(actionTarget.dataset.preset) || null);
    } else if (action === "back-to-templates") {
      state.modalData = { groupId: state.modalData?.groupId || null };
    } else if (action === "confirm-template") {
      const templateId = Number(actionTarget.dataset.template);
      const doc = await api.createDocument({
        object_id: state.workspace.object.id,
        template_id: templateId,
        preset_id: state.modalData.presetId || null,
        group_id: state.modalData.groupId || null,
        title: state.modalData.resolution.template.title,
        doc_type: state.modalData.resolution.template.doc_type,
      });
      await loadWorkspace(state.workspace.object.id);
      state.selectedDocument = doc;
      state.modal = null;
      state.modalData = null;
      navigate("editor");
      notify(`Черновик «${doc.title}» создан`);
    } else if (action === "save-object-profile") {
      await saveObjectProfile();
    } else if (action === "waive-rule") {
      state.modal = "waive-rule";
      state.modalData = { ruleId: Number(actionTarget.dataset.rule), title: actionTarget.dataset.ruleTitle };
    } else if (action === "confirm-waiver") {
      const reason = document.getElementById("waiverReason").value.trim();
      const resolutionType = document.getElementById("waiverType").value;
      const evidence = document.getElementById("waiverEvidence").value.trim();
      const integrity = await api.waiveIntegrity(state.workspace.object.id, Number(actionTarget.dataset.rule), {
        reason,
        resolution_type: resolutionType,
        evidence,
      });
      state.workspace = { ...state.workspace, integrity };
      state.modal = null;
      state.modalData = null;
      await refreshObjects();
      notify("Исключение сохранено с обоснованием");
    } else if (action === "restore-rule") {
      const integrity = await api.restoreIntegrity(state.workspace.object.id, Number(actionTarget.dataset.rule));
      state.workspace = { ...state.workspace, integrity };
      await refreshObjects();
      notify("Пункт снова учитывается в комплектности");
    } else if (action === "delete-document") {
      const currentDocument = state.selectedDocument || state.workspace?.documents?.[0];
      if (!currentDocument) return;
      state.modal = "delete-document";
      state.modalData = {
        documentId: currentDocument.id,
        title: currentDocument.title,
      };
    } else if (action === "confirm-delete-document") {
      const objectId = state.workspace.object.id;
      await api.deleteDocument(Number(actionTarget.dataset.document));
      state.selectedDocument = null;
      state.modal = null;
      state.modalData = null;
      await loadWorkspace(objectId);
      await refreshObjects();
      state.objectTab = "registry";
      navigate("object");
      notify("Документ удалён");
    } else if (action === "save-document") {
      await saveCurrentDocument({ button: actionTarget });
    } else if (action === "generate-document") {
      const saved = await saveCurrentDocument({ silent: true, button: actionTarget });
      if (!saved) return;
      try {
        const documentId = state.selectedDocument.id;
        const result = await api.generate([documentId]);
        await loadWorkspace(state.workspace.object.id);
        state.selectedDocument = state.workspace.documents.find((item) => item.id === documentId);
        notify(`Документ ${state.selectedDocument.number} сформирован${result.warnings ? " с замечаниями" : ""}`, result.warnings ? "warning" : "success");
      } catch (error) {
        if (error.missingFields?.length) {
          requestAnimationFrame(() => markMissingFields(error.missingFields));
          notify(`Не заполнено обязательных полей: ${error.missingFields.length}`, "error");
          return;
        }
        throw error;
      }
    } else if (action === "close-modal") {
      if (!event.target.closest("[data-modal]") || actionTarget.closest("button")) {
        state.modal = null;
        state.modalData = null;
      }
    }
  } catch (error) {
    if (error.missingFields?.length) requestAnimationFrame(() => markMissingFields(error.missingFields));
    notify(error.message, "error");
  }
});

toastHost.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close-toast"]')) state.toast = null;
});

async function selectTemplate(templateId, presetId = null) {
  const resolution = await api.resolveTemplate(templateId, state.workspace.object.id, presetId);
  state.modalData = { resolution, presetId, groupId: state.modalData?.groupId || null };
}

async function saveObjectProfile() {
  const form = document.getElementById("objectProfileForm");
  const values = Object.fromEntries(new FormData(form));
  const current = state.workspace.object;
  const constructionType = values.construction_type || "";
  const meta = {
    ...(current.meta_json || {}),
    construction_type: constructionType,
    work_kind: constructionType,
    object_summary: values.object_summary,
    start_date: values.start_date,
    end_date: values.end_date,
    project_documentation: values.project_documentation,
    customer: { ...(current.meta_json?.customer || {}), name: values.customer_name, inn: values.customer_inn },
    technical_customer: { ...(current.meta_json?.technical_customer || {}), name: values.technical_customer_name },
    designer: { ...(current.meta_json?.designer || {}), name: values.designer_name },
    contractor: { ...(current.meta_json?.contractor || {}), name: values.contractor_name, inn: values.contractor_inn },
    construction_permit: values.construction_permit,
    project_expertise: values.project_expertise,
    responsible_person: {
      ...(current.meta_json?.responsible_person || {}),
      fio: values.responsible_fio,
      position: values.responsible_position,
      order: values.responsible_order,
    },
  };
  await api.updateObject(current.id, { name: values.name, address: values.address, meta_json: meta });
  await loadWorkspace(current.id);
  await refreshObjects();
  notify("Данные объекта сохранены");
}

function mergeDocument(updated) {
  const current = state.workspace?.documents?.find((item) => item.id === updated.id);
  if (current) Object.assign(current, updated);
  if (state.selectedDocument?.id === updated.id && state.selectedDocument !== current) {
    Object.assign(state.selectedDocument, updated);
  }
  state.documents = [...(state.workspace?.documents || [])];
}

function markMissingFields(fields) {
  const form = document.getElementById("documentForm");
  if (!form) return;
  const missing = new Set(fields);
  form.querySelectorAll("input[name], textarea[name]").forEach((control) => {
    const label = control.closest("label");
    const isMissing = missing.has(control.name) || missing.has(control.dataset.templateField);
    label?.classList.toggle("field-missing", isMissing);
    if (isMissing && label && !label.querySelector("small")) {
      label.insertAdjacentHTML("beforeend", "<small>Обязательное поле</small>");
    }
  });
  const first = [...form.querySelectorAll("input[name], textarea[name]")].find(
    (control) => missing.has(control.name) || missing.has(control.dataset.templateField),
  );
  first?.focus({ preventScroll: true });
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveCurrentDocument({ silent = false, button = null } = {}) {
  const form = document.getElementById("documentForm");
  if (!form || !state.selectedDocument) return false;
  const values = Object.fromEntries(new FormData(form));
  const templateValues = {};
  form.querySelectorAll("[data-template-field]").forEach((control) => {
    templateValues[control.dataset.templateField] = control.value;
  });
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    const updated = await api.updateDocument(state.selectedDocument.id, {
      number: values.number,
      document_date: values.document_date,
      work_title: values.work_title,
      completion_status: document.getElementById("editorCompletionStatus")?.value || state.selectedDocument.completion_status || "not_started",
      values_json: {
        ...state.selectedDocument.values_json,
        ...templateValues,
      },
    });
    mergeDocument(updated);
    if (!silent) notify(`Черновик ${updated.number || "без номера"} сохранён`);
    return true;
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

root.addEventListener("change", async (event) => {
  if (event.target.id === "completionFilter") {
    state.completionFilter = event.target.value;
    return;
  }
  if (event.target.matches("[data-completion-document]")) {
    try {
      const documentId = Number(event.target.dataset.completionDocument);
      const current = state.workspace.documents.find((item) => item.id === documentId) || {};
      const response = await api.updateCompletion(documentId, event.target.value);
      const updated = { ...current, ...(response || {}), id: documentId, completion_status: response?.completion_status || event.target.value };
      mergeDocument(updated);
      event.target.className = `completion-select completion-select--${updated.completion_status}`;
      notify("Статус документа изменён");
    } catch (error) {
      notify(error.message, "error");
      await loadWorkspace(state.workspace.object.id);
    }
    return;
  }
  if (event.target.id !== "documentFileInput" || !event.target.files?.length) return;
  try {
    const file = event.target.files[0];
    const groupId = state.selectedGroupId === "all" ? null : Number(state.selectedGroupId);
    const imported = await api.importFile(state.workspace.object.id, file, groupId);
    await loadWorkspace(state.workspace.object.id);
    await refreshObjects();
    notify(`Файл «${imported.title}» добавлен в объект`);
  } catch (error) {
    notify(error.message, "error");
  } finally {
    event.target.value = "";
  }
});

root.addEventListener("input", async (event) => {
  if (event.target.id === "objectSearch") {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll("[data-open-object]").forEach((card) => {
      card.hidden = !card.textContent.toLowerCase().includes(query);
    });
  } else if (event.target.id === "workspaceSearch") {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll(".registry-table tbody tr").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  } else if (event.target.id === "globalSearch") {
    const output = document.getElementById("searchResults");
    const query = event.target.value.trim();
    const requestId = ++searchRequestId;
    window.clearTimeout(searchTimer);
    if (query.length < 2) {
      output.innerHTML = `<div class="command-hint"><span>Введите минимум два символа</span></div>`;
      return;
    }
    output.innerHTML = `<div class="command-loading">Ищу…</div>`;
    searchTimer = window.setTimeout(async () => {
      try {
        const results = await api.search(query);
        if (requestId === searchRequestId && output.isConnected) output.innerHTML = searchResultsView(results);
      } catch (error) {
        if (requestId === searchRequestId && output.isConnected) output.innerHTML = `<div class="no-results">${error.message}</div>`;
      }
    }, 180);
  } else if (event.target.id === "templateSearch") {
    applyTemplateFilters();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    state.commandOpen = true;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    if (state.route === "objects") {
      state.modal = "new-object";
    } else {
      state.modal = "new-document";
      state.modalData = null;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (state.route === "editor") saveCurrentDocument();
    if (state.route === "object" && state.objectTab === "profile") saveObjectProfile();
  }
  if (event.key === "Escape") {
    state.commandOpen = false;
    state.modal = null;
    state.modalData = null;
  }
});

initRouter();
render();
load();

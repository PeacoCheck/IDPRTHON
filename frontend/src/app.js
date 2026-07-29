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
      || root.querySelector("[data-modal] input, [data-modal] select, [data-modal] textarea, [data-modal] button");
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

async function openObjectWorkspace(objectId) {
  const object = state.objects.find((item) => item.id === objectId);
  if (!object || state.busyAction) return;
  state.busyAction = `open-object-${objectId}`;
  try {
    if (object.status !== "archived" && state.app?.activeObjectId !== objectId) {
      state.app = await api.selectObject(objectId);
    }
    const workspace = await api.workspace(objectId);
    state.workspace = workspace;
    state.selectedObjectId = objectId;
    state.selectedGroupId = "all";
    state.objectTab = "registry";
    state.documents = workspace.documents || [];
    state.error = null;
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
    } else if (action === "retry-load" || action === "retry-objects") {
      loadApplication();
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
});

root.addEventListener("submit", async (event) => {
  if (!event.target.matches("#newObjectForm")) return;
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    code: String(formData.get("code") || "").trim() || null,
    short_name: String(formData.get("short_name") || "").trim() || null,
    address: String(formData.get("address") || "").trim(),
    comment: String(formData.get("comment") || "").trim(),
  };
  const nameInput = form.elements.name;
  if (payload.name.length < 2) {
    nameInput?.setAttribute("aria-invalid", "true");
    nameInput?.focus();
    notify("Укажите название объекта — минимум два символа", "error");
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit?.setAttribute("aria-busy", "true");
  if (submit) submit.disabled = true;
  try {
    const object = await api.addObject(payload);
    const [app] = await Promise.all([api.state(), refreshObjects()]);
    state.app = app;
    state.modal = null;
    state.modalData = null;
    notify("Объект добавлен");
    await openObjectWorkspace(object.id);
  } catch (error) {
    notify(error.message, "error");
    submit?.removeAttribute("aria-busy");
    if (submit) submit.disabled = false;
  }
});

root.addEventListener("keydown", (event) => {
  const objectTarget = event.target.closest("[data-open-object]");
  if (objectTarget && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openObjectWorkspace(Number(objectTarget.dataset.openObject));
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
  if (event.key === "/" && state.route === "objects" && !state.modal && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !target.isContentEditable) {
      event.preventDefault();
      document.getElementById("objectSearch")?.focus();
    }
  }
});

initRouter();
render();
loadApplication();

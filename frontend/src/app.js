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
import { badge, button, modal, skeleton, toastView } from "./components/ui.js";
import { initRouter, navigate } from "./router.js";
import { notify, state, subscribe } from "./store.js";

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

function componentShowcase() {
  if (state.loading) {
    return `<div class="view-frame component-stage"><div class="component-stage__grid">${skeleton("card", 4)}</div></div>`;
  }
  return `<section class="view-frame component-stage" data-view="foundation">
    <header class="component-stage__header">
      <div><h1>Системная оболочка</h1><p>Rail, topbar и базовые контролы собраны в единой визуальной системе.</p></div>
      ${button({ label: "Основное действие", action: "demo-toast", iconName: "check", variant: "primary" })}
    </header>
    <div class="component-stage__grid">
      <section class="component-stage__panel">
        <h2>Действия</h2>
        <div class="component-stage__row">
          ${button({ label: "Открыть модалку", action: "demo-modal", variant: "secondary" })}
          ${button({ label: "Недоступно", action: "noop", variant: "secondary", disabled: true })}
          ${button({ label: "Удалить", action: "noop", iconName: "trash", variant: "ghost", size: "sm" })}
        </div>
      </section>
      <section class="component-stage__panel">
        <h2>Статусы</h2>
        <div class="component-stage__row">
          ${badge({ label: "Готов", tone: "ready", iconName: "checkCircle" })}
          ${badge({ label: "Требует внимания", tone: "warning", iconName: "alertTriangle" })}
          ${badge({ label: "Ошибка", tone: "error", iconName: "alertCircle" })}
          ${badge({ label: "Черновик", iconName: "clock" })}
        </div>
      </section>
      <section class="component-stage__panel">
        <h2>Поле ввода</h2>
        <label class="field"><span class="field__label">Код объекта</span><input class="control mono" placeholder="2026-001"><span class="field__helper">Используется в реестре и документах</span></label>
      </section>
      <section class="component-stage__panel">
        <h2>Скелетон строки</h2>
        ${skeleton("row", 3)}
      </section>
    </div>
  </section>`;
}

function modalView() {
  if (state.modal !== "component-demo") return "";
  return modal({
    title: "Базовая модалка",
    description: "Проверка поверхности, отступов и фокуса в текущей теме.",
    body: '<label class="field"><span class="field__label">Название</span><input class="control" value="Исполнительная документация" autofocus><span class="field__helper">Подпись всегда остаётся видимой</span></label>',
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary" })}${button({ label: "Сохранить", action: "save-demo", variant: "primary" })}`,
  });
}

function renderToast() {
  toastHost.innerHTML = toastView(state.toast);
}

function render() {
  renderQueued = false;
  applyTheme();
  root.innerHTML = shell(state, componentShowcase()) + modalView();
  renderToast();
  if (state.modal) requestAnimationFrame(() => root.querySelector("[data-modal] [autofocus]")?.focus());
}

subscribe((key) => {
  if (key === "toast") {
    renderToast();
    return;
  }
  if (key === "theme") {
    applyTheme();
  }
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(render);
  }
});

root.addEventListener("click", (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    navigate(routeTarget.dataset.route);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (!action) return;

  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("idv-theme", state.theme);
  } else if (action === "demo-modal" || action === "open-command") {
    state.modal = "component-demo";
  } else if (action === "demo-toast" || action === "save-demo") {
    state.modal = null;
    notify("Компоненты работают в едином состоянии");
  } else if (action === "close-modal") {
    if (!event.target.closest("[data-modal]") || actionTarget.closest("button")) state.modal = null;
  }
});

toastHost.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close-toast"]')) state.toast = null;
});

async function loadFoundation() {
  state.loading = true;
  try {
    state.app = await api.state();
    state.backendOnline = true;
    state.error = null;
  } catch (error) {
    state.backendOnline = false;
    state.error = error.message;
  } finally {
    state.loading = false;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) state.modal = null;
});

initRouter();
render();
loadFoundation();

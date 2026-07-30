import { icon } from "./icons.js";
import { escapeHtml } from "./ui.js";

const routeTitles = {
  objects: "Объекты",
  object: "Рабочее пространство",
  editor: "Файл документа",
  templates: "Шаблоны",
  "reports/completeness": "Комплектность",
};

function railLink(route, label, iconName, activeRoute) {
  const active = route === "objects" ? ["objects", "object", "editor"].includes(activeRoute) : activeRoute === route;
  return `<a class="rail__button${active ? " is-active" : ""}" href="#/${route}" data-route="${route}" aria-label="${label}" title="${label}"${active ? ' aria-current="page"' : ""}>${icon(iconName)}</a>`;
}

export function shell(state, content, { actions = "" } = {}) {
  const title = routeTitles[state.route] || routeTitles.objects;
  const context = state.workspace?.object || state.app?.currentObject || null;
  const previewOpen = state.route === "object" && Boolean(state.previewDocumentId);
  return `<div class="shell${previewOpen ? " shell--preview-open" : ""}">
    <aside class="rail" aria-label="Основная навигация">
      <a class="rail__brand" href="#/objects" data-route="objects" aria-label="ID Vault"><span>ID</span></a>
      <nav class="rail__nav">
        ${railLink("objects", "Объекты", "objects", state.route)}
        ${railLink("templates", "Шаблоны", "templates", state.route)}
        ${railLink("reports/completeness", "Отчёт о комплектности", "chartNoAxesColumn", state.route)}
        <button class="rail__button" type="button" data-action="open-command" aria-label="Глобальный поиск" title="Глобальный поиск">${icon("search")}</button>
      </nav>
      <div class="rail__bottom">
        <span class="rail__status rail__status--${state.backendOnline === false ? "offline" : "online"}" role="status" aria-label="${state.backendOnline === false ? "Хранилище недоступно" : "Хранилище доступно"}" title="${state.backendOnline === false ? "Хранилище недоступно" : "Хранилище доступно"}">${icon("server", 17)}<span>${state.backendOnline === false ? "×" : "✓"}</span></span>
        <button class="rail__button" type="button" data-action="toggle-theme" aria-label="${state.theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}" title="${state.theme === "dark" ? "Светлая тема" : "Тёмная тема"}">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
      </div>
    </aside>
    <header class="topbar">
      <div class="topbar__title">
        <span>${title}</span>
        ${context && !["objects", "reports/completeness"].includes(state.route) ? `<span class="topbar__separator">/</span><span class="topbar__context mono">${escapeHtml(context.code || "")}</span>` : ""}
      </div>
      <button class="topbar__search" type="button" data-action="open-command">${icon("search", 16)}<span>Поиск по ID Vault</span><kbd>Ctrl K</kbd></button>
      <div class="topbar__actions">${actions}</div>
    </header>
    <main class="content" id="mainContent" tabindex="-1">${content}</main>
  </div>`;
}

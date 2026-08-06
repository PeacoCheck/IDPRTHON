import { icon } from "./icons.js";
import { escapeHtml } from "./ui.js";

const routeTitles = {
  home: "ID Vault",
  objects: "Объекты",
  object: "Рабочее пространство",
  editor: "Файл документа",
  templates: "Шаблоны",
  "reports/completeness": "Комплектность",
  autocad: "Скиллы AutoCAD",
};

function railLink(route, label, iconName, activeRoute) {
  const active = activeRoute === route || (route === "objects" && ["object", "editor"].includes(activeRoute));
  return `<a class="rail__button${active ? " is-active" : ""}" href="#/${route}" data-route="${route}" aria-label="${label}" title="${label}"${active ? ' aria-current="page"' : ""}>
    ${icon(iconName)}
    <span class="rail__label">${escapeHtml(label)}</span>
  </a>`;
}

export function shell(state, content, { actions = "" } = {}) {
  const title = routeTitles[state.route] || routeTitles.home;
  const context = state.workspace?.object || state.app?.currentObject || null;
  const previewOpen = state.route === "object" && Boolean(state.previewDocumentId);
  return `<div class="shell${previewOpen ? " shell--preview-open" : ""}">
    <aside class="rail" aria-label="Основная навигация">
      <a class="rail__brand" href="#/home" data-route="home" aria-label="ID Vault - Главная страница" title="Главная страница"><span>ID</span></a>
      <nav class="rail__nav">
        ${railLink("home", "Главная", "home", state.route)}
        ${railLink("objects", "Объекты", "objects", state.route)}
        ${railLink("templates", "Шаблоны", "templates", state.route)}
        ${railLink("reports/completeness", "Отчёт о комплектности", "chartNoAxesColumn", state.route)}
        ${railLink("autocad", "Скиллы AutoCAD", "autocad", state.route)}
      </nav>
      <div class="rail__bottom">
        <button class="rail__button rail__status rail__status--${state.backendOnline === false ? "offline" : "online"}" type="button" data-action="open-diagnostics" aria-label="Диагностика систем" title="Диагностика систем">${icon("server", 17)}<span>${state.backendOnline === false ? "×" : "✓"}</span></button>
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

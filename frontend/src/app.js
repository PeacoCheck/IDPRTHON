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

import { state } from "./store.js";

const root = document.getElementById("app");

function applyTheme() {
  const theme = state.theme === "dark" ? "dark" : "light";
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function renderFoundation() {
  applyTheme();
  root.innerHTML = `
    <main class="foundation">
      <section class="foundation__card" aria-labelledby="foundationTitle">
        <h1 id="foundationTitle">ID Vault</h1>
        <p>Новая визуальная система подключена. Рабочая оболочка собирается локально.</p>
        <button type="button" data-action="toggle-theme">
          ${state.theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
      </section>
    </main>
  `;
}

root.addEventListener("click", (event) => {
  if (!event.target.closest('[data-action="toggle-theme"]')) return;
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("idv-theme", state.theme);
  renderFoundation();
});

renderFoundation();

// AutoCAD Skills view — встроенный в основной проект
// Обращается к AutoCAD микросервису напрямую

const AUTOCAD_API = "/autocad-api";

const CATEGORIES = [
  { id: "all", label: "Все скиллы" },
  { id: "marks", label: "Высотные отметки" },
  { id: "polyline", label: "Длины & Трубопроводы" },
  { id: "blocks", label: "Спецификация блоков" },
  { id: "stamps", label: "Штампы ИД" },
  { id: "print", label: "Пакетная печать PDF" },
  { id: "general", label: "Общие утилиты" },
];

// Local reactive state for this view
let acState = {
  skills: [],
  loading: false,
  error: null,
  category: "all",
  query: "",
  cadStatus: null,
  modal: null, // { skill, history, historyLoading }
  executing: null,
};

let acRender = null; // callback to trigger re-render from outside

let acGlobalState = null;

export function initAutocadView(rerenderCallback, globalState = null) {
  acRender = rerenderCallback;
  if (globalState) acGlobalState = globalState;
  fetchAcSkills();
  fetchAcStatus();
}

async function fetchAcSkills() {
  acState.loading = true;
  acState.error = null;
  if (acRender) acRender();
  try {
    const params = new URLSearchParams({ category: acState.category, query: acState.query });
    const res = await fetch(`${AUTOCAD_API}/skills?${params}`);
    if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
    acState.skills = await res.json();
  } catch (e) {
    acState.error = e.message;
    acState.skills = [];
  } finally {
    acState.loading = false;
    if (acRender) acRender();
  }
}

async function fetchAcStatus() {
  try {
    const res = await fetch(`${AUTOCAD_API}/status`);
    if (res.ok) acState.cadStatus = await res.json();
  } catch (e) {
    acState.cadStatus = { connected: false, message: "Сервис AutoCAD недоступен" };
  }
  if (acRender) acRender();
}

export function getAcSkillById(id) {
  return acState.skills.find(s => Number(s.id) === Number(id));
}

export async function openSkillModal(skill) {
  acState.modal = { skill, history: [], historyLoading: true };
  if (acGlobalState) acGlobalState.modal = "autocad-skill";
  if (acRender) acRender();
  try {
    const res = await fetch(`${AUTOCAD_API}/skills/${skill.id}/history`);
    if (res.ok) acState.modal.history = await res.json();
  } catch (e) {
    acState.modal.history = [];
  } finally {
    acState.modal.historyLoading = false;
    if (acRender) acRender();
  }
}

export async function executeSkill(skillId, skillTitle) {
  acState.executing = skillId;
  if (acRender) acRender();
  try {
    const res = await fetch(`${AUTOCAD_API}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId }),
    });
    const data = await res.json();
    showAcToast(data.ok ? `✓ «${skillTitle}» передан в AutoCAD` : `✗ ${data.message}`, data.ok ? "ok" : "err");
  } catch (e) {
    showAcToast(`✗ ${e.message}`, "err");
  } finally {
    acState.executing = null;
    if (acRender) acRender();
  }
}

export function showAcToast(msg, type = "ok") {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const t = document.createElement("div");
  t.className = `toast toast--${type === "ok" ? "ready" : "error"}`;
  t.innerHTML = `<span class="toast__message">${msg}</span>`;
  host.append(t);
  setTimeout(() => t.remove(), 4000);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function cadIcon(size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 22h16"/><path d="M12 2L4 18h16L12 2z"/><path d="M9 14h6"/></svg>`;
}

function playIcon(size = 14) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

function historyIcon(size = 14) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/></svg>`;
}

function renderAcStatusBadge() {
  const s = acState.cadStatus;
  if (!s) return "";
  const ok = s.connected;
  return `<span class="ac-status-badge ac-status-badge--${ok ? "ok" : "off"}" title="${ok ? `Подключено: ${s.active_document}` : s.message}">${ok ? `✓ ${s.active_document || "AutoCAD"}` : "× AutoCAD не подключён"}</span>`;
}

function renderSkillCard(skill) {
  const busy = acState.executing === skill.id;
  const catLabel = CATEGORIES.find(c => c.id === skill.category)?.label || skill.category;
  return `
    <div class="ac-card" data-ac-card="${skill.id}">
      <div class="ac-card__head">
        <div class="ac-card__icon">${cadIcon(20)}</div>
        <div class="ac-card__meta">
          <span class="badge badge--primary">${catLabel}</span>
          ${skill.version ? `<span class="badge badge--warning">v${skill.version}</span>` : ""}
        </div>
      </div>
      <div class="ac-card__title">${skill.title}</div>
      <div class="ac-card__desc">${skill.description}</div>
      <div class="ac-card__foot">
        <span class="ac-card__cmd mono" data-ac-copy="${skill.command_name}" title="Скопировать команду">${skill.command_name}</span>
        <button class="button button--primary button--sm" data-ac-exec="${skill.id}" data-ac-title="${skill.title}" ${busy ? "disabled" : ""}>
          <span class="button__label">${busy ? "Загрузка..." : `${playIcon()} В AutoCAD`}</span>
        </button>
      </div>
    </div>
  `;
}

export function renderAcModal() {
  if (!acState.modal) return "";
  const { skill, history, historyLoading } = acState.modal;

  const historyContent = historyLoading
    ? `<span style="color:var(--text-faint)">Загрузка...</span>`
    : history.length === 0
      ? `<span style="color:var(--text-faint)">Нет сохранённых версий</span>`
      : `<select class="select" id="acHistoryDropdown" style="flex:1">
          ${history.map(h => `<option value="${h.version}" data-code="${encodeURIComponent(h.code_content)}">v${h.version} (${new Date(h.created_at * 1000).toLocaleDateString()})</option>`).join("")}
        </select>
        <button class="button button--secondary" id="acBtnRollback">${historyIcon()} Откатить</button>`;

  return `
    <div class="modal-layer is-active" id="acModalLayer">
      <div class="modal modal--lg">
        <div class="modal__header">
          <div>
            <div class="section-title">${skill.title}</div>
            <p>Просмотр и редактирование кода AutoLISP</p>
          </div>
          <button class="icon-button" id="acBtnCloseModal" aria-label="Закрыть">
            <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form class="modal__body" id="acSkillForm">
          <div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:var(--space-3)">
            <div class="field">
              <label class="field__label">Категория</label>
              <select class="select" id="acEditCategory">
                ${CATEGORIES.filter(c => c.id !== "all").map(c => `<option value="${c.id}" ${skill.category === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label class="field__label">Версия</label>
              <input type="text" class="control mono" id="acEditVersion" value="${skill.version || "1.0"}">
            </div>
            <div class="field">
              <label class="field__label">Команда</label>
              <input type="text" class="control mono" id="acEditCommand" value="${skill.command_name}">
            </div>
          </div>
          <div class="field">
            <label class="field__label">Предыдущие версии</label>
            <div style="display:flex;gap:var(--space-2);align-items:center">
              ${historyContent}
            </div>
          </div>
          <div class="field">
            <label class="field__label">Описание</label>
            <input type="text" class="control" id="acEditDesc" value="${skill.description || ""}">
          </div>
          <div class="field">
            <label class="field__label">Исходный код LISP (.lsp)</label>
            <textarea class="textarea mono" id="acEditCode" style="min-height:220px" required>${skill.code_content || ""}</textarea>
          </div>
          <div class="modal__footer" style="justify-content:space-between">
            <div></div>
            <div style="display:flex;gap:var(--space-2)">
              <button type="button" class="button button--secondary" id="acBtnCancel">Закрыть</button>
              <button type="submit" class="button button--primary">Сохранить изменения</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderAutocadView() {
  const { skills, loading, error, category, query } = acState;

  const grid = loading
    ? `<div class="ac-grid-empty">Загрузка скиллов...</div>`
    : error
      ? `<div class="ac-grid-empty ac-grid-empty--error">Сервис AutoCAD недоступен.<br><small>${error}</small><br><br><button class="button button--secondary" id="acBtnRetry">Повторить</button></div>`
      : skills.length === 0
        ? `<div class="ac-grid-empty">Скиллы не найдены</div>`
        : `<div class="ac-grid">${skills.map(renderSkillCard).join("")}</div>`;

  return `
    <div class="view-frame ac-view">
      <div class="ac-header">
        <div>
          <p class="technical-label">ID Vault</p>
          <h1>Библиотека скиллов AutoCAD</h1>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          ${renderAcStatusBadge()}
          <span class="objects-result-count" style="font-family:var(--font-mono)">Скиллов: ${skills.length}</span>
        </div>
      </div>

      <div class="ac-toolbar">
        <div class="topbar__search" style="max-width:360px">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="acSearch" class="control" placeholder="Поиск по скиллам..." style="border:none;background:transparent;padding:0;height:100%" value="${query}">
        </div>
        <select class="select" id="acCategorySelect" style="max-width:260px">
          ${CATEGORIES.map(c => `<option value="${c.id}" ${category === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
      </div>

      ${grid}
    </div>
  `;
}

// ─── EVENT HYDRATION ──────────────────────────────────────────────────────────

export function hydrateAutocadView() {
  // Search
  const searchEl = document.getElementById("acSearch");
  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      clearTimeout(searchEl._t);
      searchEl._t = setTimeout(() => {
        acState.query = e.target.value;
        fetchAcSkills();
      }, 250);
    });
  }

  // Category filter
  document.getElementById("acCategorySelect")?.addEventListener("change", (e) => {
    acState.category = e.target.value;
    fetchAcSkills();
  });

  // Retry
  document.getElementById("acBtnRetry")?.addEventListener("click", () => {
    fetchAcSkills();
    fetchAcStatus();
  });

  // Card clicks — open modal
  document.querySelectorAll("[data-ac-card]").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-ac-exec]") || e.target.closest("[data-ac-copy]")) return;
      const id = Number(card.dataset.acCard);
      const skill = acState.skills.find(s => s.id === id);
      if (skill) openSkillModal(skill);
    });
  });

  // Execute buttons
  document.querySelectorAll("[data-ac-exec]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      executeSkill(Number(btn.dataset.acExec), btn.dataset.acTitle);
    });
  });

  // Copy command
  document.querySelectorAll("[data-ac-copy]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(el.dataset.acCopy);
      showAcToast(`Команда «${el.dataset.acCopy}» скопирована`, "ok");
    });
  });

  // Modal close
  const closeModal = () => {
    acState.modal = null;
    if (acGlobalState && acGlobalState.modal === "autocad-skill") acGlobalState.modal = null;
    if (acRender) acRender();
  };
  document.getElementById("acBtnCloseModal")?.addEventListener("click", closeModal);
  document.getElementById("acBtnCancel")?.addEventListener("click", closeModal);
  document.getElementById("acModalLayer")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("acModalLayer")) closeModal();
  });

  // History dropdown preview
  const historyDrop = document.getElementById("acHistoryDropdown");
  if (historyDrop) {
    historyDrop.addEventListener("change", () => {
      const opt = historyDrop.options[historyDrop.selectedIndex];
      const code = decodeURIComponent(opt.dataset.code || "");
      const ver = opt.value;
      const codeEl = document.getElementById("acEditCode");
      const verEl = document.getElementById("acEditVersion");
      if (codeEl) codeEl.value = code;
      if (verEl) verEl.value = ver;
    });
  }

  // Rollback
  document.getElementById("acBtnRollback")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const sel = document.getElementById("acHistoryDropdown");
    if (!sel || !acState.modal) return;
    const version = sel.value;
    try {
      const res = await fetch(`${AUTOCAD_API}/skills/${acState.modal.skill.id}/rollback?version=${encodeURIComponent(version)}`, { method: "POST" });
      const d = await res.json();
      showAcToast(d.message, d.ok ? "ok" : "err");
      if (d.ok) { closeModal(); fetchAcSkills(); }
    } catch (e) {
      showAcToast(e.message, "err");
    }
  });

  // Save form
  document.getElementById("acSkillForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!acState.modal) return;
    const payload = {
      category: document.getElementById("acEditCategory")?.value,
      version: document.getElementById("acEditVersion")?.value,
      command_name: document.getElementById("acEditCommand")?.value,
      description: document.getElementById("acEditDesc")?.value,
      code_content: document.getElementById("acEditCode")?.value,
    };
    try {
      const res = await fetch(`${AUTOCAD_API}/skills/${acState.modal.skill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      showAcToast("Скилл сохранён!", "ok");
      closeModal();
      fetchAcSkills();
    } catch (err) {
      showAcToast(err.message, "err");
    }
  });
}

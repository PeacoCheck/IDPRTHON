import { api } from "./api.js";

const state = {
  status: {
    connected: false,
    running: false,
    active_document: null,
    mode: "simulation",
    message: "Подключение...",
  },
  category: "all",
  searchQuery: "",
  skills: [],
  loading: false,
  executingSkillId: null,
  activeSkillDetail: null,
  theme: localStorage.getItem("idv-theme") || "light",
};

// SVG icons matching main project style
const icons = {
  brand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  server: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
  cad: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16"/><path d="M12 2l-8 16h16L12 2z"/><path d="M8 14h8"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l5.64 5.36A9 9 0 0020.49 15"/></svg>`,
  code: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
  history: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/></svg>`,
};

const categories = [
  { id: "all", label: "Все скиллы" },
  { id: "marks", label: "Высотные отметки" },
  { id: "polyline", label: "Длины & Трубопроводы" },
  { id: "blocks", label: "Спецификация блоков" },
  { id: "stamps", label: "Штампы ИД" },
  { id: "print", label: "Пакетная печать PDF" },
];

function showToast(message, type = "ready") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__message">${message}</span>`;
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("idv-theme", state.theme);
}

async function fetchStatus() {
  try {
    const data = await api.getStatus();
    state.status = data;
    renderStatus();
  } catch (err) {
    state.status = {
      connected: false,
      running: false,
      active_document: null,
      mode: "simulation",
      message: "Бэкенд недоступен",
    };
    renderStatus();
  }
}

async function fetchSkills() {
  try {
    state.loading = true;
    renderSkillsGrid();
    const data = await api.getSkills(state.category, state.searchQuery);
    state.skills = data;
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    state.loading = false;
    renderSkillsGrid();
  }
}

async function handleExecuteSkill(skillId, title, e) {
  if (e) e.stopPropagation();
  state.executingSkillId = skillId;
  renderSkillsGrid();
  try {
    const res = await api.executeSkill(skillId);
    if (res.ok) {
      showToast(`Скилл «${title}» передан в AutoCAD! (DWG: ${res.dwg_name})`, "ready");
    } else {
      showToast(`Ошибка: ${res.message}`, "error");
    }
  } catch (err) {
    showToast(`Ошибка отправки: ${err.message}`, "error");
  } finally {
    state.executingSkillId = null;
    fetchSkills();
    fetchStatus();
  }
}

function openDetailModal(skill) {
  state.activeSkillDetail = skill;
  const modal = document.getElementById("detailModalLayer");
  if (!modal) return;

  document.getElementById("detailTitle").textContent = skill.title;
  document.getElementById("detailCategorySelect").value = skill.category;
  document.getElementById("detailCommand").value = skill.command_name;
  document.getElementById("detailVersion").value = skill.version || "1.0";
  document.getElementById("detailDesc").value = skill.description;
  document.getElementById("detailCode").value = skill.code_content || "";
  
  const deleteBtn = document.getElementById("btnDeleteSkill");
  if (deleteBtn) {
    deleteBtn.style.display = skill.is_builtin ? "none" : "inline-flex";
  }

  modal.classList.add("is-active");
  loadSkillHistory(skill.id);
}

let currentSkillHistory = [];

async function loadSkillHistory(skillId) {
  const historyDropdown = document.getElementById("historyDropdown");
  const btnRollback = document.getElementById("btnRollback");
  if (!historyDropdown || !btnRollback) return;
  
  historyDropdown.innerHTML = '<option value="">Загрузка...</option>';
  btnRollback.disabled = true;
  currentSkillHistory = [];
  
  try {
    const history = await api.getHistory(skillId);
    currentSkillHistory = history;

    if (history.length === 0) {
      historyDropdown.innerHTML = '<option value="">Нет прошлых версий</option>';
    } else {
      historyDropdown.innerHTML = history.map(h => `
        <option value="${h.version}">Версия: ${h.version} (от ${new Date(h.created_at * 1000).toLocaleString()})</option>
      `).join("");
      btnRollback.disabled = false;
      
      historyDropdown.onchange = () => {
        const selectedVer = historyDropdown.value;
        if (!selectedVer || selectedVer === "undefined") return;
        const found = currentSkillHistory.find(h => h.version === selectedVer);
        if (found) {
          document.getElementById("detailCode").value = found.code_content || "";
          document.getElementById("detailVersion").value = found.version || "1.0";
        }
      };
      
      btnRollback.onclick = async (e) => {
        e.preventDefault();
        const selectedVersion = historyDropdown.value;
        if (!selectedVersion) return;
        try {
          await api.rollbackSkill(skillId, selectedVersion);
          showToast(`Версия ${selectedVersion} загружена!`, 'ready');
          closeDetailModal();
          fetchSkills();
        } catch(err) {
          showToast(err.message, 'error');
        }
      };
    }
  } catch (err) {
    historyDropdown.innerHTML = '<option value="">Ошибка загрузки</option>';
  }
}

function closeDetailModal() {
  state.activeSkillDetail = null;
  document.getElementById("detailModalLayer")?.classList.remove("is-active");
}

function renderStatus() {
  const container = document.getElementById("statusRailHost");
  if (!container) return;
  const isOnline = state.status.connected;
  container.className = `rail__status ${isOnline ? "" : "rail__status--offline"}`;
  container.title = isOnline
    ? `Подключено: ${state.status.active_document} — кликните для диагностики`
    : "Нет подключения — кликните для диагностики";
  container.style.cursor = "pointer";
  container.innerHTML = `${icons.server}<span>${isOnline ? "✓" : "×"}</span>`;
  container.onclick = openDiagModal;

  const topbarContext = document.getElementById("topbarDocContext");
  if (topbarContext) {
    topbarContext.textContent = isOnline ? (state.status.active_document || "AutoCAD открыт") : "Эмуляция";
  }
}

async function openDiagModal() {
  const modal = document.getElementById("diagModalLayer");
  if (!modal) return;
  modal.classList.add("is-active");

  const body = document.getElementById("diagModalBody");
  body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-soft)">Диагностика...</div>`;

  try {
    const res = await fetch("/api/diagnostics");
    const data = await res.json();
    const status = data.status;

    body.innerHTML = `
      <div style="margin-bottom:var(--space-4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:10px;height:10px;border-radius:50%;background:${data.all_ok ? 'var(--status-ready)' : 'var(--status-error)'};"></div>
          <span style="font-weight:600;font-size:15px">${data.all_ok ? 'Всё в порядке!' : 'Есть проблемы'}</span>
        </div>
        ${data.checks.map(c => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="margin-top:2px;flex-shrink:0;width:16px;height:16px;border-radius:50%;background:${c.ok ? 'var(--status-ready)' : 'var(--status-error)'};"></div>
            <div>
              <div style="font-weight:500;font-size:13px">${c.label}</div>
              <div style="font-size:12px;color:var(--text-soft);margin-top:2px">${c.detail}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ${!status.connected ? `
        <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-top:8px">
          <div style="font-size:13px;color:var(--text-soft);margin-bottom:10px">АвтокАД не обнаружен. Можно запустить его:</div>
          <button class="button button--primary button--sm" id="btnLaunchAutocad">${icons.play} Запустить AutoCAD</button>
        </div>
      ` : `
        <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-top:8px">
          <div style="font-size:13px;color:var(--text-soft)">Подключено к: <b>${status.active_document}</b></div>
          ${status.version ? `<div style="font-size:12px;color:var(--text-faint);margin-top:4px">Версия: ${status.version}</div>` : ''}
        </div>
      `}
    `;

    document.getElementById("btnLaunchAutocad")?.addEventListener("click", async () => {
      const btn = document.getElementById("btnLaunchAutocad");
      btn.disabled = true;
      btn.innerHTML = "Запуск...";
      const r = await fetch("/api/diagnostics/open-autocad", { method: "POST" });
      const d = await r.json();
      showToast(d.message, d.ok ? "ready" : "error");
      btn.disabled = false;
      btn.innerHTML = `${icons.play} Запустить AutoCAD`;
    });
  } catch (e) {
    body.innerHTML = `<div style="color:var(--status-error)">Ошибка диагностики: ${e.message}</div>`;
  }
}

function closeDiagModal() {
  document.getElementById("diagModalLayer")?.classList.remove("is-active");
}

function renderSkillsGrid() {
  const grid = document.getElementById("skillsGrid");
  if (!grid) return;

  if (state.loading) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-soft)">Загрузка скиллов...</div>`;
    return;
  }

  if (state.skills.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:48px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg)">
        <p style="color:var(--text-soft)">Скиллы не найдены</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.skills.map(skill => {
    const isExecuting = state.executingSkillId === skill.id;
    return `
      <div class="skill-card" data-card-id="${skill.id}">
        <div class="skill-card__content">
          <div class="skill-card__header">
            <div class="skill-card__mark">${icons.cad}</div>
            <div style="display:flex; gap:6px;">
              <span class="badge badge--primary">${skill.category}</span>
              ${skill.version ? `<span class="badge badge--warning">v${skill.version}</span>` : ''}
            </div>
          </div>
          <div class="skill-card__title">${skill.title}</div>
          <div class="skill-card__desc">${skill.description}</div>
        </div>
        <div class="skill-card__footer">
          <span class="skill-card__cmd" data-copy-cmd="${skill.command_name}" title="Кликните, чтобы скопировать команду">${skill.command_name}</span>
          <button class="button button--primary button--sm" data-execute="${skill.id}" data-title="${skill.title}" ${isExecuting ? "disabled" : ""}>
            <span class="button__label">${isExecuting ? "Загрузка..." : `${icons.play} В AutoCAD`}</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Attach card click handlers (Opens LISP code detail modal)
  grid.querySelectorAll(".skill-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = Number(card.getAttribute("data-card-id"));
      const skill = state.skills.find(s => s.id === id);
      if (skill) openDetailModal(skill);
    });
  });

  // Attach execution click handlers with stopPropagation
  grid.querySelectorAll("[data-execute]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const skillId = Number(btn.getAttribute("data-execute"));
      const title = btn.getAttribute("data-title");
      handleExecuteSkill(skillId, title, e);
    });
  });

  // Attach command copy handler
  grid.querySelectorAll("[data-copy-cmd]").forEach(cmd => {
    cmd.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = cmd.getAttribute("data-copy-cmd");
      navigator.clipboard.writeText(text);
      showToast(`Команда «${text}» скопирована в буфер`, "ready");
    });
  });
}

function renderApp() {
  const app = document.getElementById("app");
  applyTheme();

  app.innerHTML = `
    <div class="shell">
      <!-- Fixed Left Rail -->
      <aside class="rail" aria-label="Основная навигация">
        <a class="rail__brand" href="#" title="ID Vault"><span>ID</span></a>
        <nav class="rail__nav">
          <button class="rail__button is-active" title="Скиллы AutoCAD">${icons.cad}</button>
        </nav>
        <div class="rail__bottom">
          <div id="statusRailHost" class="rail__status"></div>
          <button class="rail__button" id="btnToggleTheme" title="Сменить тему">${state.theme === "dark" ? icons.sun : icons.moon}</button>
        </div>
      </aside>

      <!-- Fixed Topbar -->
      <header class="topbar">
        <div class="topbar__title">
          <span>Скиллы AutoCAD</span>
          <span class="topbar__separator">/</span>
          <span class="topbar__context mono" id="topbarDocContext">...</span>
        </div>
        <div class="topbar__search">
          ${icons.search}
          <input type="text" id="searchInput" class="control" placeholder="Поиск скиллов по имени или команде..." style="border:none; background:transparent; padding:0; height:100%" value="${state.searchQuery}">
        </div>
        <div class="topbar__actions">
          <button class="icon-button" id="btnRefreshStatus" title="Обновить статус">${icons.refresh}</button>
          <button class="button button--primary button--sm" id="btnOpenAddModal">
            <span class="button__label">${icons.plus} Добавить скилл</span>
          </button>
        </div>
      </header>

      <!-- Main Workspace -->
      <main class="content">
        <div class="view-frame autocad-view">
          <div class="autocad-header">
            <div>
              <p class="technical-label">Исполнительная документация</p>
              <h1>Библиотека скиллов AutoCAD</h1>
            </div>
            <div class="objects-result-count" style="font-family:var(--font-mono)">
              Доступно скиллов: ${state.skills.length}
            </div>
          </div>

          <div class="autocad-toolbar">
            <select class="select" id="categorySelect" style="max-width:320px; cursor:pointer;">
              ${categories.map(cat => `
                <option value="${cat.id}" ${state.category === cat.id ? "selected" : ""}>
                  ${cat.label}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="autocad-grid" id="skillsGrid"></div>
        </div>
      </main>
    </div>

    <!-- Modal: Diagnostics -->
    <div class="modal-layer" id="diagModalLayer">
      <div class="modal">
        <div class="modal__header">
          <div>
            <div class="section-title">Диагностика AutoCAD</div>
            <p>Проверка подключения и состояния системы</p>
          </div>
          <button class="icon-button" id="btnCloseDiagModal">&times;</button>
        </div>
        <div class="modal__body" id="diagModalBody">
          <div style="text-align:center;padding:32px;color:var(--text-soft)">Загрузка...</div>
        </div>
        <div class="modal__footer">
          <button type="button" class="button button--secondary" id="btnRefreshDiag">${icons.refresh} Обновить</button>
          <button type="button" class="button button--primary" id="btnCloseDiagModalFooter">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Modal: Add New Skill -->
    <div class="modal-layer" id="addModalLayer">
      <div class="modal">
        <div class="modal__header">
          <div>
            <div class="section-title">Добавить AutoLISP Скилл</div>
            <p>Новый скрипт сохранится в локальную библиотеку vault</p>
          </div>
          <button class="icon-button" id="btnCloseAddModal">&times;</button>
        </div>
        <form id="addSkillForm" class="modal__body">
          <div class="field">
            <label class="field__label">Название скилла</label>
            <input type="text" class="control" id="skillTitle" placeholder="например: Расчёт площади помещений" required>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--space-3)">
            <div class="field">
              <label class="field__label">Категория</label>
              <select class="select" id="skillCategory">
                <option value="marks">Высотные отметки</option>
                <option value="polyline">Длины & Трубопроводы</option>
                <option value="blocks">Спецификация блоков</option>
                <option value="stamps">Штампы ИД</option>
                <option value="print">Пакетная печать PDF</option>
                <option value="general" selected>Общие утилиты</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label">Версия</label>
              <input type="text" class="control" id="skillVersion" placeholder="1.0" value="1.0" required>
            </div>
          </div>
          <div class="field">
            <label class="field__label">Имя AutoLISP команды (c:ИМЯ)</label>
            <input type="text" class="control" id="skillCommand" placeholder="например: ID_CalcArea" required>
          </div>
          <div class="field">
            <label class="field__label">Описание</label>
            <input type="text" class="control" id="skillDesc" placeholder="Краткое описание функционала">
          </div>
          <div class="field">
            <label class="field__label">Код AutoLISP (.lsp)</label>
            <textarea class="textarea mono" id="skillCode" placeholder="(defun c:ID_CalcArea () ...)" required></textarea>
          </div>
          <div class="modal__footer">
            <button type="button" class="button button--secondary" id="btnCancelAdd">Отмена</button>
            <button type="submit" class="button button--primary">Сохранить скилл</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: View/Edit Skill Detail -->
    <div class="modal-layer" id="detailModalLayer">
      <div class="modal modal--lg">
        <div class="modal__header">
          <div>
            <div class="section-title" id="detailTitle">Скилл</div>
            <p>Просмотр и редактирование кода AutoLISP</p>
          </div>
          <button class="icon-button" id="btnCloseDetailModal">&times;</button>
        </div>
        <form id="detailSkillForm" class="modal__body">
          <div style="display:grid; grid-template-columns: 1fr 120px 1fr; gap:var(--space-3)">
            <div class="field">
              <label class="field__label">Категория</label>
              <select class="select" id="detailCategorySelect">
                <option value="marks">Высотные отметки</option>
                <option value="polyline">Длины & Трубопроводы</option>
                <option value="blocks">Спецификация блоков</option>
                <option value="stamps">Штампы ИД</option>
                <option value="print">Пакетная печать PDF</option>
                <option value="general">Общие утилиты</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label">Версия</label>
              <input type="text" class="control mono" id="detailVersion" required>
            </div>
            <div class="field">
              <label class="field__label">Команда</label>
              <input type="text" class="control mono" id="detailCommand" required>
            </div>
          </div>
          <div class="field" style="margin-top: -4px;">
            <label class="field__label">Сохраненные прошлые версии</label>
            <div style="display:flex; gap:var(--space-2);">
              <select class="select" id="historyDropdown" style="flex:1;">
                <option value="">Загрузка...</option>
              </select>
              <button type="button" class="button button--secondary" id="btnRollback" disabled>
                ${icons.history} Откатить
              </button>
            </div>
          </div>
          <div class="field">
            <label class="field__label">Описание</label>
            <input type="text" class="control" id="detailDesc">
          </div>
          <div class="field">
            <label class="field__label">Исходный код LISP (.lsp)</label>
            <textarea class="textarea mono" id="detailCode" style="min-height:220px;" required></textarea>
          </div>
          <div class="modal__footer" style="justify-content:space-between">
            <button type="button" class="button button--danger" id="btnDeleteSkill">
              <span class="button__label">${icons.trash} Удалить</span>
            </button>
            <div style="display:flex; gap:var(--space-2)">
              <button type="button" class="button button--secondary" id="btnCancelDetail">Закрыть</button>
              <button type="submit" class="button button--primary">Сохранить изменения</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach Global Keyboard Shortcut: Ctrl + K
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      document.getElementById("searchInput")?.focus();
    }
    if (e.key === "Escape") {
      document.getElementById("addModalLayer")?.classList.remove("is-active");
      closeDetailModal();
      closeDiagModal();
    }
  });

  // Attach Backdrop Click Listeners
  document.getElementById("addModalLayer")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("addModalLayer")) {
      document.getElementById("addModalLayer").classList.remove("is-active");
    }
  });
  document.getElementById("detailModalLayer")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("detailModalLayer")) {
      closeDetailModal();
    }
  });

  // Diag modal
  document.getElementById("btnCloseDiagModal")?.addEventListener("click", closeDiagModal);
  document.getElementById("btnCloseDiagModalFooter")?.addEventListener("click", closeDiagModal);
  document.getElementById("btnRefreshDiag")?.addEventListener("click", openDiagModal);
  document.getElementById("diagModalLayer")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("diagModalLayer")) closeDiagModal();
  });

  // Theme Toggle
  document.getElementById("btnToggleTheme")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    document.getElementById("btnToggleTheme").innerHTML = state.theme === "dark" ? icons.sun : icons.moon;
  });

  document.getElementById("btnRefreshStatus")?.addEventListener("click", fetchStatus);

  // Add Modal
  document.getElementById("btnOpenAddModal")?.addEventListener("click", () => {
    document.getElementById("addModalLayer")?.classList.add("is-active");
  });
  document.getElementById("btnCloseAddModal")?.addEventListener("click", () => {
    document.getElementById("addModalLayer")?.classList.remove("is-active");
  });
  document.getElementById("btnCancelAdd")?.addEventListener("click", () => {
    document.getElementById("addModalLayer")?.classList.remove("is-active");
  });

  // Detail Modal
  document.getElementById("btnCloseDetailModal")?.addEventListener("click", closeDetailModal);
  document.getElementById("btnCancelDetail")?.addEventListener("click", closeDetailModal);

  // Save Detail Form
  document.getElementById("detailSkillForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeSkillDetail) return;
    try {
      await api.updateSkill(state.activeSkillDetail.id, {
        command_name: document.getElementById("detailCommand").value,
        category: document.getElementById("detailCategorySelect").value,
        version: document.getElementById("detailVersion").value,
        description: document.getElementById("detailDesc").value,
        code_content: document.getElementById("detailCode").value,
      });
      showToast("Изменения скилла сохранены!", "ready");
      closeDetailModal();
      fetchSkills();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Delete Custom Skill
  document.getElementById("btnDeleteSkill")?.addEventListener("click", async () => {
    if (!state.activeSkillDetail) return;
    if (!confirm(`Вы действительно хотите удалить скилл "${state.activeSkillDetail.title}"?`)) return;
    try {
      await api.deleteSkill(state.activeSkillDetail.id);
      showToast("Скилл удалён", "ready");
      closeDetailModal();
      fetchSkills();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Category Dropdown Filter
  document.getElementById("categorySelect")?.addEventListener("change", (e) => {
    state.category = e.target.value;
    fetchSkills();
  });

  // Search Input
  let searchTimer;
  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value;
      fetchSkills();
    }, 250);
  });

  // Add Skill Form Submit
  document.getElementById("addSkillForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById("skillTitle").value,
      category: document.getElementById("skillCategory").value,
      version: document.getElementById("skillVersion").value,
      command_name: document.getElementById("skillCommand").value,
      description: document.getElementById("skillDesc").value,
      code_content: document.getElementById("skillCode").value,
    };
    try {
      await api.createSkill(data);
      showToast("Скилл успешно добавлен!", "ready");
      document.getElementById("addModalLayer")?.classList.remove("is-active");
      fetchSkills();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  fetchStatus();
  fetchSkills();
}

setInterval(fetchStatus, 5000);
document.addEventListener("DOMContentLoaded", renderApp);

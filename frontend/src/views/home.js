import { icon } from "../components/icons.js";
import { button, escapeHtml } from "../components/ui.js";

export function renderHomeView(state) {
  const objects = Array.isArray(state.objects) ? state.objects : [];
  const activeObjects = objects.filter((o) => o.status !== "archived");

  const totalDocs = objects.reduce((sum, o) => sum + (Number(o.documents_count) || 0), 0);
  const totalFiles = objects.reduce((sum, o) => sum + (Number(o.present_files ?? o.present_count ?? o.files_count ?? 0)), 0);

  return `
    <section class="view-frame home-view" data-view="home">
      <header class="objects-header">
        <div>
          <span class="technical-eyebrow">ID Vault</span>
          <h1>ID Vault</h1>
          <p>Локальный технический архив и оперативный контроль комплектности объектов.</p>
        </div>
        ${button({ label: "Добавить объект", action: "new-object", iconName: "plus", variant: "primary" })}
      </header>

      <nav class="home-nav-grid" aria-label="Разделы">
        <a href="#/objects" class="home-nav-card">
          <div class="home-nav-card__header">
            <div class="home-nav-card__icon home-nav-card__icon--objects" aria-hidden="true">
              ${icon("building", 20)}
            </div>
            <span class="home-nav-card__title">Реестр объектов</span>
          </div>
          <span class="home-nav-card__desc">Структура групп, документы и файлы всех объектов.</span>
          <div class="home-nav-card__footer">
            <span class="home-nav-card__counter">${activeObjects.length} объектов</span>
            <span class="home-nav-card__action">Перейти ${icon("arrowRight", 14)}</span>
          </div>
        </a>

        <a href="#/reports/completeness" class="home-nav-card">
          <div class="home-nav-card__header">
            <div class="home-nav-card__icon home-nav-card__icon--reports" aria-hidden="true">
              ${icon("chartNoAxesColumn", 20)}
            </div>
            <span class="home-nav-card__title">Отчёт о комплектности</span>
          </div>
          <span class="home-nav-card__desc">Сводный анализ стандартов ИД, разрывы структуры и замечания.</span>
          <div class="home-nav-card__footer">
            <span class="home-nav-card__counter">${totalDocs} документов</span>
            <span class="home-nav-card__action">Открыть ${icon("arrowRight", 14)}</span>
          </div>
        </a>

        <a href="#/autocad" class="home-nav-card">
          <div class="home-nav-card__header">
            <div class="home-nav-card__icon home-nav-card__icon--tools" aria-hidden="true">
              ${icon("layers", 20)}
            </div>
            <span class="home-nav-card__title">Инструменты</span>
          </div>
          <span class="home-nav-card__desc">Интеграция с AutoCAD, скрипты AutoLISP и экспорт штампов.</span>
          <div class="home-nav-card__footer">
            <span class="home-nav-card__counter">AutoCAD</span>
            <span class="home-nav-card__action">Открыть ${icon("arrowRight", 14)}</span>
          </div>
        </a>
      </nav>

      <section class="home-objects-section" aria-label="Объекты">
        <div class="home-objects-header">
          <h2>Объекты</h2>
          <a href="#/objects" class="button button--secondary button--sm">
            ${icon("building", 14)} <span class="button__label">Все объекты (${objects.length})</span>
          </a>
        </div>

        ${activeObjects.length === 0
          ? `<div class="home-empty">
              <span class="home-empty__icon">${icon("building", 32)}</span>
              <p>Нет объектов. Создайте первый объект для начала работы.</p>
            </div>`
          : `<div class="home-objects-grid">
              ${activeObjects.map((obj) => {
                const docs = Number(obj.documents_count) || 0;
                const files = Number(obj.present_files ?? obj.present_count ?? obj.files_count ?? 0);
                const integrity = Math.min(100, Math.max(0, Number(obj.integrity) || 0));
                const name = obj.short_name || obj.name || "Без названия";
                const code = obj.code || "—";
                const address = obj.address || "";

                return `
                  <a href="#/objects/${obj.id}" class="home-object-card" data-open-object="${escapeHtml(obj.id)}">
                    <span class="home-object-card__code">${escapeHtml(code)}</span>
                    <strong class="home-object-card__name">${escapeHtml(name)}</strong>
                    ${address ? `<span class="home-object-card__address">${escapeHtml(address)}</span>` : ""}
                    <div class="home-object-card__stats">
                      <span class="home-object-card__stat">
                        ${icon("file", 13)}
                        Документов: <strong>${docs}</strong>
                      </span>
                      <span class="home-object-card__stat">
                        ${icon("download", 13)}
                        Файлов: <strong>${files}</strong>
                      </span>
                      <span class="home-object-card__stat">
                        Эталон: <strong>${integrity}%</strong>
                      </span>
                    </div>
                  </a>`;
              }).join("")}
            </div>`
        }
      </section>
    </section>
  `;
}

import { icon } from "../components/icons.js";
import { badge, button, emptyState, escapeHtml, modal, skeleton } from "../components/ui.js";

const numberFormat = new Intl.NumberFormat("ru-RU");

function normalizedStatus(object) {
  return object?.status === "archived" ? "archived" : "active";
}

function normalizedQuery(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function matchesQuery(object, query) {
  if (!query) return true;
  return [object.code, object.short_name, object.name, object.address, object.comment]
    .some((value) => String(value || "").toLocaleLowerCase("ru-RU").includes(query));
}

function isBusy(state, action, objectId = null) {
  const busyAction = String(state.busyAction || "");
  return busyAction === action
    || (objectId !== null && (busyAction === `${action}:${objectId}` || busyAction === `${action}-${objectId}`));
}

function objectStatusBadge(object) {
  const archived = normalizedStatus(object) === "archived";
  return badge({
    label: archived ? "В архиве" : "Активный",
    tone: archived ? "neutral" : "ready",
    iconName: archived ? "archive" : "checkCircle",
  });
}

function renderObjectCard(object, state) {
  const archived = normalizedStatus(object) === "archived";
  const action = archived ? "restore-object" : "archive-object";
  const actionBusy = isBusy(state, action, object.id);
  const documentsCount = Math.max(0, Number(object.documents_count) || 0);
  const readyCount = Math.min(documentsCount, Math.max(0, Number(object.ready_count) || 0));
  const integrity = Math.min(100, Math.max(0, Number(object.integrity) || 0));
  const issues = Math.max(0, Number(object.issues_count) || 0);
  const title = object.short_name || object.name || "Объект без названия";

  return `<article class="object-card" data-object-status="${archived ? "archived" : "active"}">
    <button class="object-card__open" type="button" data-open-object="${escapeHtml(object.id)}" aria-label="Открыть объект ${escapeHtml(title)}">
      <span class="object-card__topline">
        <span class="object-card__code mono">${escapeHtml(object.code || "Без кода")}</span>
        ${objectStatusBadge(object)}
      </span>
      <span class="object-card__identity">
        <span class="object-card__mark" aria-hidden="true">${icon("building", 20)}</span>
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(object.name && object.name !== title ? object.name : "Исполнительная документация объекта")}</small>
        </span>
        <span class="object-card__chevron" aria-hidden="true">${icon("chevronRight", 18)}</span>
      </span>
      <span class="object-card__address">${icon("mapPin", 16)}<span>${escapeHtml(object.address || "Адрес не указан")}</span></span>
      <span class="object-card__metrics">
        <span><strong class="tabular">${numberFormat.format(readyCount)} / ${numberFormat.format(documentsCount)}</strong><small>документов готово</small></span>
        <span><strong class="tabular">${numberFormat.format(integrity)}%</strong><small>комплектность</small></span>
        <span class="${issues ? "has-issues" : ""}"><strong class="tabular">${numberFormat.format(issues)}</strong><small>замечаний</small></span>
      </span>
      <span class="object-card__integrity">
        <span><span>Готовность комплекта</span><strong class="tabular">${numberFormat.format(integrity)}%</strong></span>
        <span class="object-card__progress" role="progressbar" aria-label="Готовность комплекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrity}"><i style="--object-progress:${integrity}%"></i></span>
      </span>
    </button>
    <footer class="object-card__footer">
      <span>${escapeHtml(object.updated_label || (archived ? "Хранится в архиве" : "Доступен для работы"))}</span>
      ${button({
        label: archived ? "Восстановить" : "В архив",
        action,
        iconName: archived ? "restore" : "archive",
        variant: "secondary",
        size: "sm",
        disabled: actionBusy,
        attributes: `data-object-id="${escapeHtml(object.id)}" aria-busy="${actionBusy}"`,
      })}
    </footer>
  </article>`;
}

function renderObjectsSkeleton() {
  return `<div class="objects-grid objects-grid--skeleton">${skeleton("card", 6)}</div>`;
}

function renderFeedback({ iconName, title, description, action = "", tone = "neutral" }) {
  return `<div class="objects-feedback objects-feedback--${tone}">${emptyState({ iconName, title, description, action })}</div>`;
}

function renderObjectsContent(state, scopedObjects, visibleObjects, query) {
  if (state.loading) return renderObjectsSkeleton();

  if (state.error && !state.objects?.length) {
    return renderFeedback({
      iconName: "alertCircle",
      title: "Не удалось загрузить объекты",
      description: state.error,
      tone: "error",
      action: button({ label: "Повторить", action: "retry-objects", iconName: "refresh", variant: "secondary" }),
    });
  }

  if (!scopedObjects.length) {
    const archived = state.objectFilter === "archived";
    return renderFeedback({
      iconName: archived ? "archive" : "building",
      title: archived ? "Архив пуст" : "Пока нет объектов",
      description: archived
        ? "Завершённые и временно скрытые объекты появятся здесь."
        : "Добавьте первый объект, чтобы начать работу с исполнительной документацией.",
      action: archived
        ? button({ label: "Показать активные", action: "filter-objects", variant: "secondary", attributes: 'data-filter="active"' })
        : button({ label: "Добавить объект", action: "new-object", iconName: "plus", variant: "secondary" }),
    });
  }

  if (!visibleObjects.length && query) {
    return renderFeedback({
      iconName: "search",
      title: "Ничего не найдено",
      description: "Проверьте код, название или адрес объекта и попробуйте снова.",
      action: button({ label: "Очистить поиск", action: "clear-object-search", variant: "secondary" }),
    });
  }

  return `<div class="objects-grid">${visibleObjects.map((object) => renderObjectCard(object, state)).join("")}</div>`;
}

export function renderObjectsView(state) {
  const objects = Array.isArray(state.objects) ? state.objects : [];
  const filter = state.objectFilter === "archived" ? "archived" : "active";
  const query = normalizedQuery(state.objectQuery);
  const activeCount = objects.filter((object) => normalizedStatus(object) === "active").length;
  const archivedCount = objects.filter((object) => normalizedStatus(object) === "archived").length;
  const scopedObjects = objects.filter((object) => normalizedStatus(object) === filter);
  const visibleObjects = scopedObjects.filter((object) => matchesQuery(object, query));

  return `<section class="view-frame objects-view" data-view="objects">
    <header class="objects-header">
      <div>
        <h1>Объекты</h1>
        <p>Реестры исполнительной документации и состояние комплектов.</p>
      </div>
      ${button({ label: "Добавить объект", action: "new-object", iconName: "plus", variant: "primary" })}
    </header>

    <div class="objects-toolbar">
      <label class="objects-search" for="objectSearch">
        <span class="sr-only">Найти объект</span>
        ${icon("search", 16)}
        <input id="objectSearch" class="control" type="search" value="${escapeHtml(state.objectQuery || "")}" placeholder="Код, название или адрес" autocomplete="off">
      </label>
      <div class="tabs objects-tabs" role="tablist" aria-label="Состояние объектов">
        <button class="tabs__button${filter === "active" ? " is-active" : ""}" type="button" role="tab" aria-selected="${filter === "active"}" data-action="filter-objects" data-filter="active">Активные <span class="tabular">${numberFormat.format(activeCount)}</span></button>
        <button class="tabs__button${filter === "archived" ? " is-active" : ""}" type="button" role="tab" aria-selected="${filter === "archived"}" data-action="filter-objects" data-filter="archived">Архив <span class="tabular">${numberFormat.format(archivedCount)}</span></button>
      </div>
      <span class="objects-result-count" aria-live="polite">${state.loading ? "Загрузка" : `${numberFormat.format(visibleObjects.length)} из ${numberFormat.format(scopedObjects.length)}`}</span>
    </div>

    ${state.error && objects.length ? `<div class="objects-inline-error" role="alert">${icon("alertCircle", 18)}<span>${escapeHtml(state.error)}</span>${button({ label: "Повторить", action: "retry-objects", variant: "secondary", size: "sm" })}</div>` : ""}
    ${renderObjectsContent(state, scopedObjects, visibleObjects, query)}
  </section>`;
}

export function renderNewObjectModal(state) {
  if (state.modal !== "new-object") return "";
  const creating = isBusy(state, "create-object");
  const body = `<form id="newObjectForm" class="new-object-form">
    ${state.error ? `<div class="new-object-form__error" role="alert">${icon("alertCircle", 16)}<span>${escapeHtml(state.error)}</span></div>` : ""}
    <label class="field new-object-form__wide">
      <span class="field__label">Полное наименование</span>
      <input class="control" name="name" required autofocus autocomplete="organization" placeholder="Капитальный ремонт котельной № 4">
      <span class="field__helper">Официальное наименование объекта или вида работ</span>
    </label>
    <label class="field">
      <span class="field__label">Код объекта</span>
      <input class="control mono" name="code" autocomplete="off" placeholder="2026-001">
      <span class="field__helper">Если оставить пустым, код создастся автоматически</span>
    </label>
    <label class="field">
      <span class="field__label">Короткое название</span>
      <input class="control" name="short_name" autocomplete="off" placeholder="Котельная № 4">
      <span class="field__helper">Для карточек, реестров и навигации</span>
    </label>
    <label class="field new-object-form__wide">
      <span class="field__label">Адрес или площадка</span>
      <input class="control" name="address" autocomplete="street-address" placeholder="г. Пермь, ул. Промышленная, 12">
      <span class="field__helper">Место выполнения работ</span>
    </label>
    <label class="field new-object-form__wide">
      <span class="field__label">Комментарий</span>
      <textarea class="textarea" name="comment" rows="3" placeholder="Внутренняя пометка по объекту"></textarea>
      <span class="field__helper">Необязательное служебное примечание</span>
    </label>
  </form>`;

  return modal({
    title: "Новый объект",
    description: "После создания появится стандартная структура групп документов.",
    body,
    footer: `${button({ label: "Отмена", action: "close-modal", variant: "secondary", disabled: creating })}${button({ label: "Создать объект", action: "create-object", iconName: "plus", variant: "primary", type: "submit", disabled: creating, attributes: `form="newObjectForm" aria-busy="${creating}"` })}`,
    size: "md",
    labelledBy: "newObjectModalTitle",
  });
}

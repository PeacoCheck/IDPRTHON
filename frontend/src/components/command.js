import { icon } from "./icons.js";
import { escapeHtml } from "./ui.js";

const groups = [
  {
    key: "objects",
    label: "Объекты",
    iconName: "building",
    title: (item) => firstText(item.short_name, item.name, item.code, "Объект"),
    description: (item) => joinText(item.code, item.address),
    meta: () => "Объект",
  },
  {
    key: "documents",
    label: "Документы",
    iconName: "fileText",
    title: (item) => firstText(item.title, item.number, "Документ"),
    description: (item) => joinText(item.number, item.work_title),
    meta: (item) => firstText(item.document_date, "Документ"),
  },
];

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined || typeof value === "object") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function joinText(...values) {
  const seen = new Set();
  return values
    .map((value) => firstText(value))
    .filter((value) => {
      const normalized = value.toLocaleLowerCase("ru-RU");
      if (!value || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(" · ");
}

function highlightText(value, query) {
  const text = firstText(value);
  const needle = String(query || "").trim();
  if (!text || !needle) return escapeHtml(text);

  const source = text.toLocaleLowerCase("ru-RU");
  const match = needle.toLocaleLowerCase("ru-RU");
  let cursor = 0;
  let index = source.indexOf(match);
  if (index === -1) return escapeHtml(text);

  const output = [];
  while (index !== -1) {
    output.push(escapeHtml(text.slice(cursor, index)));
    output.push(`<mark>${escapeHtml(text.slice(index, index + needle.length))}</mark>`);
    cursor = index + needle.length;
    index = source.indexOf(match, cursor);
  }
  output.push(escapeHtml(text.slice(cursor)));
  return output.join("");
}

function commandObjectId(groupKey, item) {
  if (groupKey === "objects") return item.id ?? "";
  return item.object_id ?? item.objectId ?? "";
}

function renderResult(group, item, index, activeIndex, query) {
  const title = group.title(item);
  const description = group.description(item);
  const meta = group.meta(item);
  const selected = index === activeIndex;
  const itemId = item.id ?? item.code ?? "";
  const objectId = commandObjectId(group.key, item);

  return `<button
    class="command-result${selected ? " is-active" : ""}"
    id="command-option-${index}"
    type="button"
    role="option"
    aria-selected="${selected}"
    data-action="command-result"
    data-command-index="${index}"
    data-command-group="${escapeHtml(group.key)}"
    data-command-id="${escapeHtml(itemId)}"
    data-command-object-id="${escapeHtml(objectId)}"
  >
    <span class="command-result__icon" aria-hidden="true">${icon(group.iconName, 18)}</span>
    <span class="command-result__copy">
      <strong>${highlightText(title, query)}</strong>
      ${description ? `<small>${highlightText(description, query)}</small>` : ""}
    </span>
    <span class="command-result__meta">${escapeHtml(meta)}</span>
    <span class="command-result__enter" aria-hidden="true">${icon("arrowRight", 15)}</span>
  </button>`;
}

function renderGroups(groupList, activeIndex, query) {
  let index = 0;
  return groupList.map(({ definition, items }) => {
    const startIndex = index;
    const options = items.map((item) => {
      const option = renderResult(definition, item, index, activeIndex, query);
      index += 1;
      return option;
    }).join("");

    return `<section class="command-group" role="group" aria-labelledby="command-group-${definition.key}">
      <header class="command-group__header" id="command-group-${definition.key}">
        <span>${escapeHtml(definition.label)}</span>
        <span class="tabular" aria-label="Результатов: ${items.length}">${items.length}</span>
      </header>
      <div class="command-group__items" data-command-start-index="${startIndex}">${options}</div>
    </section>`;
  }).join("");
}

function renderState({ iconName, title, description, tone = "neutral", loading = false }) {
  return `<div class="command-state command-state--${tone}" role="status">
    <span class="command-state__icon" aria-hidden="true">${loading ? '<span class="command-spinner"></span>' : icon(iconName, 22)}</span>
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(description)}</span>
  </div>`;
}

function errorMessage(error) {
  if (typeof error === "string") return error;
  return firstText(error?.message, "Попробуйте повторить поиск");
}

export function renderCommandPalette(state) {
  if (!state.commandOpen) return "";

  const query = String(state.commandQuery || "");
  const normalizedQuery = query.trim();
  const results = state.commandResults && typeof state.commandResults === "object"
    ? state.commandResults
    : {};
  const groupList = groups
    .map((definition) => ({
      definition,
      items: Array.isArray(results[definition.key]) ? results[definition.key] : [],
    }))
    .filter(({ items }) => items.length > 0);
  const resultCount = groupList.reduce((total, group) => total + group.items.length, 0);
  const requestedIndex = Number(state.commandIndex);
  const activeIndex = resultCount
    ? Math.min(resultCount - 1, Math.max(0, Number.isFinite(requestedIndex) ? requestedIndex : 0))
    : -1;
  const loading = Boolean(state.commandLoading);
  const error = state.commandError;
  const canShowResults = normalizedQuery.length >= 2 && !loading && !error && resultCount > 0;
  const activeDescendant = canShowResults ? `command-option-${activeIndex}` : "";

  let content;
  if (loading) {
    content = renderState({
      title: "Ищем в ID Vault",
      description: "Объекты и документы локального архива",
      loading: true,
    });
  } else if (error) {
    content = renderState({
      iconName: "alertCircle",
      title: "Не удалось выполнить поиск",
      description: errorMessage(error),
      tone: "error",
    });
  } else if (normalizedQuery.length < 2) {
    content = renderState({
      iconName: "search",
      title: "Быстрый переход",
      description: normalizedQuery.length ? "Введите ещё один символ" : "Введите минимум два символа для поиска",
    });
  } else if (!resultCount) {
    content = renderState({
      iconName: "search",
      title: "Ничего не найдено",
      description: "Измените запрос или проверьте написание",
    });
  } else {
    content = renderGroups(groupList, activeIndex, normalizedQuery);
  }

  return `<div class="command-layer" data-command data-command-layer>
    <div class="command-layer__backdrop" data-action="close-command" aria-hidden="true"></div>
    <section class="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title" data-command-dialog>
      <h2 class="sr-only" id="command-title">Глобальный поиск ID Vault</h2>
      <div class="command-palette__search">
        <span class="command-palette__search-icon" aria-hidden="true">${icon("search", 20)}</span>
        <input
          class="command-palette__input"
          id="commandInput"
          type="search"
          role="combobox"
          aria-label="Поиск по ID Vault"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="commandResults"
          ${activeDescendant ? `aria-activedescendant="${activeDescendant}"` : ""}
          autocomplete="off"
          spellcheck="false"
          placeholder="Объект или документ"
          value="${escapeHtml(query)}"
          autofocus
        >
        <button class="command-palette__close" type="button" data-action="close-command" aria-label="Закрыть поиск">
          <kbd>Esc</kbd>
        </button>
      </div>
      <div
        class="command-palette__results"
        id="commandResults"
        role="listbox"
        aria-label="Результаты поиска"
        aria-busy="${loading}"
      >${content}</div>
      <footer class="command-palette__footer">
        <span>${resultCount && canShowResults ? `${resultCount} найдено` : "Поиск по всему хранилищу"}</span>
        <span class="command-palette__hints" aria-label="Горячие клавиши">
          <span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>
          <span><kbd>Enter</kbd> открыть</span>
          <span><kbd>Esc</kbd> закрыть</span>
        </span>
      </footer>
    </section>
  </div>`;
}

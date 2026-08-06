import { icon } from "./icons.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function button({ label, action, iconName = "", variant = "secondary", size = "md", attributes = "", disabled = false, type = "button" }) {
  return `<button class="button button--${variant} button--${size}" type="${type}"${action ? ` data-action="${escapeHtml(action)}"` : ""}${disabled ? " disabled" : ""} ${attributes}>
    <span class="button__spinner" aria-hidden="true"></span>
    <span class="button__label">${iconName ? icon(iconName, size === "sm" ? 16 : 18) : ""}<span>${escapeHtml(label)}</span></span>
  </button>`;
}

export function iconButton({ label, action, iconName, attributes = "", active = false, disabled = false }) {
  return `<button class="icon-button${active ? " is-active" : ""}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${action ? ` data-action="${escapeHtml(action)}"` : ""}${disabled ? " disabled" : ""} ${attributes}>${icon(iconName)}</button>`;
}

export function badge({ label, tone = "neutral", iconName = "", mono = false }) {
  return `<span class="badge badge--${tone}${mono ? " mono" : ""}">${iconName ? icon(iconName, 14) : ""}<span>${escapeHtml(label)}</span></span>`;
}

export function tooltip({ text, label = "" }) {
  const escapedText = escapeHtml(text);
  return `<span class="tooltip-trigger" tabindex="0" role="button" aria-label="${escapedText}">
    ${label ? `<span>${escapeHtml(label)}</span>` : icon("info", 14)}
    <span class="tooltip-box" role="tooltip">${escapedText}</span>
  </span>`;
}

export function spinner(label = "Загрузка") {
  return `<span class="spinner" role="status"><span class="spinner__ring" aria-hidden="true"></span><span class="sr-only">${escapeHtml(label)}</span></span>`;
}

export function skeleton(kind = "row", count = 1) {
  return `<div class="skeleton-list" aria-label="Загрузка">${Array.from({ length: count }, (_, index) => `<div class="skeleton skeleton--${kind}" style="--skeleton-index:${index}" aria-hidden="true"></div>`).join("")}</div>`;
}

export function emptyState({ iconName = "file", title, description, action = "" }) {
  return `<section class="empty-state">
    <span class="empty-state__icon">${icon(iconName, 24)}</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
    ${action}
  </section>`;
}

export function modal({ title, description = "", body = "", footer = "", size = "md", labelledBy = "modalTitle" }) {
  return `<div class="modal-layer" data-action="close-modal">
    <section class="modal modal--${size}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}" data-modal>
      <header class="modal__header">
        <div><h2 id="${labelledBy}">${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>
        ${iconButton({ label: "Закрыть", action: "close-modal", iconName: "close" })}
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__footer">${footer}</footer>` : ""}
    </section>
  </div>`;
}

export function toastView(toast) {
  if (!toast) return "";
  const iconName = toast.tone === "error" ? "alertCircle" : toast.tone === "warning" ? "alertTriangle" : "checkCircle";
  const action = toast.action && typeof toast.action === "object"
    ? `<button type="button" class="toast__action" data-action="toast-action" data-toast-action="${escapeHtml(toast.action.name || "")}">${escapeHtml(toast.action.label || "Отменить")}</button>`
    : "";
  return `<div class="toast toast--${escapeHtml(toast.tone || "success")}" role="status">
    <span class="toast__icon">${icon(iconName, 18)}</span>
    <span class="toast__message">${escapeHtml(toast.message)}</span>
    ${action}
    ${iconButton({ label: "Закрыть уведомление", action: "close-toast", iconName: "close" })}
  </div>`;
}

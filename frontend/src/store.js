const listeners = new Set();
const state = new Proxy(
  {
    app: null,
    route: "objects",
    objects: [],
    objectFilter: "active",
    objectQuery: "",
    workspace: null,
    selectedObjectId: null,
    selectedGroupId: "all",
    completionFilter: "all",
    documentQuery: "",
    objectTab: "registry",
    documents: [],
    selectedDocument: null,
    requestedDocumentId: null,
    templates: [],
    presets: [],
    catalog: [],
    catalogName: "materials",
    report: null,
    loading: true,
    backendOnline: null,
    error: null,
    busyAction: null,
    theme: localStorage.getItem("idv-theme") || "light",
    commandOpen: false,
    commandQuery: "",
    commandResults: null,
    commandIndex: 0,
    objectOpen: false,
    editorDirty: false,
    collapsedSections: {},
    validationPanelOpen: true,
    modal: null,
    modalData: null,
    toast: null,
  },
  {
    set(target, key, value) {
      target[key] = value;
      listeners.forEach((listener) => listener(key, value));
      return true;
    },
  },
);

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(message, tone = "success", action = null) {
  state.toast = { message, tone, action };
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => (state.toast = null), tone === "error" ? 7000 : 3500);
}

export { state };

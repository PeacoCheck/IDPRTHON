import { state } from "./store.js";

const known = new Set(["objects", "object", "editor", "templates"]);

export function navigate(route, options = {}) {
  const clean = known.has(route) ? route : "objects";
  state.route = clean;
  if (options.document) {
    state.selectedDocument = options.document;
    state.requestedDocumentId = options.document.id;
  }
  const documentId = clean === "editor" ? (options.document?.id || state.selectedDocument?.id) : null;
  history.pushState({ route: clean, documentId }, "", `#/${clean}${documentId ? `/${documentId}` : ""}`);
  state.commandOpen = false;
}

export function initRouter() {
  const sync = () => {
    const [route = "objects", rawDocumentId] = (location.hash.replace("#/", "") || "objects").split("/");
    const clean = known.has(route) ? route : "objects";
    state.route = clean;
    if (clean === "editor") {
      const documentId = Number(rawDocumentId) || null;
      state.requestedDocumentId = documentId;
      const document = state.workspace?.documents?.find((item) => item.id === documentId);
      if (document) state.selectedDocument = document;
    }
    if (route !== clean) history.replaceState({ route: clean }, "", `#/${clean}`);
  };
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);
  sync();
}

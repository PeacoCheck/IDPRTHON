import { state } from "./store.js";

export function parseRoute(hash) {
  const cleanHash = (hash || location.hash || "#/home").replace(/^#\/?/, "");
  const parts = cleanHash.split("/").filter(Boolean);

  if (parts.length === 0) {
    return { route: "home" };
  }

  const first = parts[0];

  if (first === "home") {
    return { route: "home" };
  }

  if (first === "reports" && parts[1] === "completeness") {
    return { route: "reports/completeness" };
  }

  if (first === "templates") {
    return { route: "templates" };
  }

  if (first === "autocad") {
    return { route: "autocad" };
  }

  if (first === "objects") {
    if (parts.length === 1) {
      return { route: "objects" };
    }
    const objectId = Number(parts[1]);
    if (!isNaN(objectId) && objectId > 0) {
      const result = { route: "object", objectId };
      if (parts[2] === "registry") {
        result.objectTab = "registry";
      } else if (parts[2] === "groups" && parts[3]) {
        result.objectTab = "registry";
        result.groupId = parts[3];
      } else if (parts[2] === "documents" && parts[3]) {
        result.objectTab = "registry";
        result.documentId = Number(parts[3]);
      } else if (parts[2] === "completeness") {
        result.objectTab = "completeness";
      }
      return result;
    }
    return { route: "objects" };
  }

  if (first === "object") {
    const objectId = Number(parts[1]);
    if (!isNaN(objectId) && objectId > 0) {
      return { route: "object", objectId };
    }
    return { route: "object" };
  }

  if (first === "editor") {
    const documentId = Number(parts[1]);
    return { route: "editor", documentId };
  }

  return { route: "home" };
}

export function buildRouteUrl(route, options = {}) {
  if (route === "home") return "#/home";
  if (route === "objects") return "#/objects";
  if (route === "templates") return "#/templates";
  if (route === "autocad") return "#/autocad";
  if (route === "reports/completeness") return "#/reports/completeness";
  if (route === "object") {
    const objectId = options.objectId || state.selectedObjectId || state.workspace?.object?.id || state.app?.activeObjectId;
    if (!objectId) return "#/objects";
    if (options.documentId) {
      return `#/objects/${objectId}/documents/${options.documentId}`;
    }
    if (options.groupId && options.groupId !== "all") {
      return `#/objects/${objectId}/groups/${options.groupId}`;
    }
    if (options.tab === "completeness") {
      return `#/objects/${objectId}/completeness`;
    }
    return `#/objects/${objectId}`;
  }
  if (route === "editor" && options.documentId) {
    return `#/editor/${options.documentId}`;
  }
  return `#/${route}`;
}

function applyParsedRoute(parsed) {
  state.route = parsed.route;
  if (parsed.objectId) {
    state.selectedObjectId = parsed.objectId;
  }
  if (parsed.objectTab) {
    state.objectTab = parsed.objectTab;
  }
  if (parsed.groupId) {
    state.selectedGroupId = parsed.groupId;
  } else if (parsed.route === "object" && !parsed.groupId) {
    state.selectedGroupId = "all";
  }
  if (parsed.documentId) {
    state.previewDocumentId = parsed.documentId;
    state.requestedDocumentId = parsed.documentId;
  }
}

export function navigate(targetRoute, options = {}) {
  let url = "";
  if (typeof targetRoute === "string") {
    url = buildRouteUrl(targetRoute, options);
  }
  const parsed = parseRoute(url);
  applyParsedRoute(parsed);
  history.pushState(parsed, "", url);
  state.commandOpen = false;
}

export function initRouter() {
  const sync = () => {
    const parsed = parseRoute(location.hash);
    applyParsedRoute(parsed);
  };
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);
  sync();
}

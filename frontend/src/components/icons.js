import alertCircleSvg from "lucide-static/icons/circle-alert.svg?raw";
import alertTriangleSvg from "lucide-static/icons/triangle-alert.svg?raw";
import archiveSvg from "lucide-static/icons/archive.svg?raw";
import arrowLeftSvg from "lucide-static/icons/arrow-left.svg?raw";
import arrowRightSvg from "lucide-static/icons/arrow-right.svg?raw";
import buildingSvg from "lucide-static/icons/building-2.svg?raw";
import chartNoAxesColumnSvg from "lucide-static/icons/chart-no-axes-column.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";
import checkCircleSvg from "lucide-static/icons/circle-check.svg?raw";
import chevronDownSvg from "lucide-static/icons/chevron-down.svg?raw";
import chevronRightSvg from "lucide-static/icons/chevron-right.svg?raw";
import circleSvg from "lucide-static/icons/circle.svg?raw";
import clockSvg from "lucide-static/icons/clock.svg?raw";
import closeSvg from "lucide-static/icons/x.svg?raw";
import copySvg from "lucide-static/icons/copy.svg?raw";
import downloadSvg from "lucide-static/icons/download.svg?raw";
import editSvg from "lucide-static/icons/pencil.svg?raw";
import externalSvg from "lucide-static/icons/external-link.svg?raw";
import fileSvg from "lucide-static/icons/file.svg?raw";
import fileTextSvg from "lucide-static/icons/file-text.svg?raw";
import folderSvg from "lucide-static/icons/folder.svg?raw";
import folderOpenSvg from "lucide-static/icons/folder-open.svg?raw";
import historySvg from "lucide-static/icons/history.svg?raw";
import infoSvg from "lucide-static/icons/info.svg?raw";
import layersSvg from "lucide-static/icons/layers-3.svg?raw";
import moonSvg from "lucide-static/icons/moon.svg?raw";
import objectsSvg from "lucide-static/icons/layout-grid.svg?raw";
import mapPinSvg from "lucide-static/icons/map-pin.svg?raw";
import plusSvg from "lucide-static/icons/plus.svg?raw";
import refreshSvg from "lucide-static/icons/refresh-cw.svg?raw";
import restoreSvg from "lucide-static/icons/rotate-ccw.svg?raw";
import saveSvg from "lucide-static/icons/save.svg?raw";
import searchSvg from "lucide-static/icons/search.svg?raw";
import serverSvg from "lucide-static/icons/server.svg?raw";
import sunSvg from "lucide-static/icons/sun.svg?raw";
import trashSvg from "lucide-static/icons/trash-2.svg?raw";
import uploadSvg from "lucide-static/icons/upload.svg?raw";

import houseSvg from "lucide-static/icons/house.svg?raw";

const icons = {
  home: houseSvg,
  objects: objectsSvg,
  templates: fileTextSvg,
  search: searchSvg,
  sun: sunSvg,
  moon: moonSvg,
  plus: plusSvg,
  close: closeSvg,
  chevronDown: chevronDownSvg,
  chevronRight: chevronRightSvg,
  arrowLeft: arrowLeftSvg,
  arrowRight: arrowRightSvg,
  check: checkSvg,
  checkCircle: checkCircleSvg,
  alertCircle: alertCircleSvg,
  alertTriangle: alertTriangleSvg,
  info: infoSvg,
  clock: clockSvg,
  circle: circleSvg,
  folder: folderSvg,
  folderOpen: folderOpenSvg,
  file: fileSvg,
  fileText: fileTextSvg,
  upload: uploadSvg,
  download: downloadSvg,
  save: saveSvg,
  archive: archiveSvg,
  restore: restoreSvg,
  trash: trashSvg,
  refresh: refreshSvg,
  external: externalSvg,
  edit: editSvg,
  building: buildingSvg,
  mapPin: mapPinSvg,
  layers: layersSvg,
  server: serverSvg,
  history: historySvg,
  play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  copy: copySvg,
  chartNoAxesColumn: chartNoAxesColumnSvg,
  autocad: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16"/><path d="M12 2L4 18h16L12 2z"/><path d="M9 14h6"/></svg>`,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function svgBody(rawSvg) {
  return rawSvg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1]?.trim() || "";
}

export function icon(name, size = 18, label = "") {
  const numericSize = Number(size);
  const normalizedSize = Number.isFinite(numericSize) && numericSize > 0 ? numericSize : 18;
  const accessibleLabel = String(label || "").trim();
  const title = accessibleLabel ? `<title>${escapeHtml(accessibleLabel)}</title>` : "";
  const accessibility = accessibleLabel
    ? `role="img" aria-label="${escapeHtml(accessibleLabel)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon" width="${normalizedSize}" height="${normalizedSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${accessibility}>${title}${svgBody(icons[name] || circleSvg)}</svg>`;
}

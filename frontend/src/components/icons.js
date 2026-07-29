const paths = {
  vault: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18M8 12h4"/><circle cx="15" cy="12" r="3"/><path d="M15 9v6M12 12h6"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  templates: '<path d="M4 3h16v18H4zM8 7h8M8 11h8M8 15h5"/>',
  presets: '<path d="M4 4h16v5H4zM4 15h16v5H4zM8 9v6M16 9v6"/>',
  catalog: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  reports: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z"/>',
  folder: '<path d="M3 7h7l2 2h9v10H3z"/><path d="M3 7V5h7l2 2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5M12 18h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  save: '<path d="M4 3h14l2 2v16H4zM8 3v6h8V3M8 21v-7h8v7"/>',
  wand: '<path d="m15 4 5 5L8 21H3v-5zM13 6l5 5M6 3v3M4.5 4.5h3M19 16v4M17 18h4"/>',
};

export function icon(name, label = "") {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${label ? `aria-label="${label}" role="img"` : 'aria-hidden="true"'}>${paths[name] || paths.documents}</svg>`;
}

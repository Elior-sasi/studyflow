// Inline line icons (decorative: aria-hidden). Original drawings, stroke = currentColor.
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5h3v5h5V10"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"/><path d="M12 6.5v13"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="15.5" y="4.5" width="3" height="13.5" rx="1"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5.5-9.5v-6"/><path d="M7.5 15h9"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 4.5 3 3 0 0 0 3 2.5h.5V4.5Z"/><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 4.5 3 3 0 0 1-3 2.5h-.5V4.5Z"/><path d="M9.5 9H7.5M14.5 9h2M9.5 14H8M14.5 14H16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.2c2.8-.4 5 1.5 5 4.3"/>',
  code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7.5h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m14.5 6-6 6 6 6"/>',
  back: '<path d="m9.5 6 6 6-6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/>',
  pause: '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>',
  prev: '<path d="M17 6v12M6.5 12 15 6v12Z"/>',
  next: '<path d="M7 6v12M17.5 12 9 6v12Z"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  doc: '<path d="M6.5 3.5h7l4 4v13h-11Z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  flame: '<path d="M12 21c-3.5 0-6-2.5-6-6 0-4 3.5-6 3.5-10 2.5 1.5 4 3.5 4.5 6 1-1 1.5-2 1.5-3.5C17.5 9.5 18 12 18 15c0 3.5-2.5 6-6 6Z"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5"/>',
  exam: '<path d="M7 3.5h10v17H7z"/><path d="m9.5 9 1.5 1.5L14.5 7M9.5 15h5"/>',
  send: '<path d="M20 4 3.5 11l7 2.5L13 20.5Z"/><path d="m20 4-9.5 9.5"/>',
  edit: '<path d="M4 20h4.5L19 9.5 14.5 5 4 15.5Z"/><path d="m13 6.5 4.5 4.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9M10 13h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.5 0l3-3a4 4 0 0 0-5.5-5.5l-1 1"/><path d="M14 10a4 4 0 0 0-5.5 0l-3 3A4 4 0 0 0 11 18.5l1-1"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5V4.5M7 9l5-5 5 5M4.5 19.5h15"/>',
  sparkle: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2Z"/>',
  focus: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.5l2.5 2M9.5 3h5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  repeat: '<path d="M4 12a7 7 0 0 1 12-5l2.5 2.5M20 12a7 7 0 0 1-12 5L5.5 14.5"/><path d="M18.5 4.5v5h-5M5.5 19.5v-5h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.book}</svg>`;
}

export const ICON_LABELS = { chart: 'גרף', flask: 'מבחנה', brain: 'מוח', people: 'אנשים', book: 'ספר', code: 'קוד', globe: 'גלובוס', calc: 'מחשבון' };
export const COLOR_LABELS = { blue: 'כחול', purple: 'סגול', teal: 'טורקיז', amber: 'כתום-זהב', pink: 'ורוד', green: 'ירוק' };

/** Lumi mascot: an original rounded helper with a visor face. Decorative. */
export function lumi(size = 120) {
  return `<svg class="lumi" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="lg-glow" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#7fb2ff" stop-opacity=".55"/><stop offset="1" stop-color="#7fb2ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="lg-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7ff"/><stop offset="1" stop-color="#b9c6e6"/></linearGradient>
    <linearGradient id="lg-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2550"/><stop offset="1" stop-color="#0a0f26"/></linearGradient>
  </defs>
  <circle cx="60" cy="58" r="56" fill="url(#lg-glow)"/>
  <rect x="14" y="48" width="12" height="24" rx="6" fill="#8fb4ff"/><rect x="94" y="48" width="12" height="24" rx="6" fill="#8fb4ff"/>
  <rect x="20" y="22" width="80" height="74" rx="34" fill="url(#lg-shell)"/>
  <rect x="29" y="36" width="62" height="44" rx="21" fill="url(#lg-visor)" stroke="#5f8dff" stroke-width="2"/>
  <path d="M42 56q6-8 12 0M66 56q6-8 12 0" fill="none" stroke="#7fe3ff" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M52 66q8 7 16 0" fill="none" stroke="#7fe3ff" stroke-width="4" stroke-linecap="round"/>
  <circle cx="60" cy="16" r="5" fill="#8fb4ff"/><path d="M60 21v4" stroke="#8fb4ff" stroke-width="3"/>
</svg>`;
}

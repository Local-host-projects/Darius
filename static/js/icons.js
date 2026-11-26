// Inline SVG icon set — consistent 24px line icons, no emoji, no external deps.
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M3 16v-4h4M21 8V4h-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M16 3l5 5M19 6l-3 3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.6 6.6A17.8 17.8 0 0 0 2 12s3.5 7 10 7a10.3 10.3 0 0 0 4.2-.9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
};

export function icon(name, cls = '') {
  const body = P[name] || P.message;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function logoMark(cls = '') {
  return `<svg class="logo-mark ${cls}" viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">
    <rect x="8" y="8" width="496" height="496" rx="132" fill="#17161A"/>
    <rect x="8" y="8" width="496" height="496" rx="132" stroke="#FAF6EE" stroke-opacity=".14" stroke-width="4"/>
    <g transform="translate(33.75 53.89) scale(1.06)">
      <path fill="#FAF6EE" d="M353.778 236.537c-10.494 0-19 8.508-19 19 0 13.418-10.916 24.334-24.333 24.334s-24.333-10.916-24.333-24.334v-160.1C286.111 42.729 243.382 0 190.674 0S95.237 42.729 95.237 95.438v160.1c0 13.418-10.916 24.334-24.334 24.334S46.57 268.955 46.57 255.537c0-10.492-8.506-19-19-19s-19 8.508-19 19c0 34.371 27.963 62.334 62.333 62.334s62.334-27.963 62.334-62.334v-57.863h12.437v164.674c0 10.494 8.506 19 19 19s19-8.506 19-19V197.674h14v164.674c0 10.494 8.506 19 19 19s19-8.506 19-19V197.674h12.437v57.863c0 34.371 27.963 62.334 62.334 62.334s62.333-27.963 62.333-62.334c0-10.492-8.506-19-19-19z"/>
      <circle cx="112.058" cy="147.654" r="26" fill="#F7C948"/>
      <circle cx="112.058" cy="147.654" r="11.5" fill="#17161A"/>
      <circle cx="269.29" cy="147.654" r="26" fill="#F7C948"/>
      <circle cx="269.29" cy="147.654" r="11.5" fill="#17161A"/>
    </g>
  </svg>`;
}

export function brandLockup({ href = '/', linked = false, compact = false } = {}) {
  const tag = compact ? '' : '<span class="brand-tag">Interview engine</span>';
  const inner = `${logoMark()}<span class="brand-copy"><span class="brand-name">Darius</span>${tag}</span>`;
  return linked
    ? `<a class="brand" href="${href}" data-link aria-label="Darius home">${inner}</a>`
    : `<span class="brand">${inner}</span>`;
}

// Decorative ripple field used on login + empty states.
export function rippleArt(cls = '') {
  return `<svg class="ripple-art ${cls}" viewBox="0 0 520 360" fill="none" aria-hidden="true" focusable="false">
    <circle cx="260" cy="180" r="54" stroke="currentColor" stroke-width="2" opacity=".9"/>
    <circle cx="260" cy="180" r="96" stroke="currentColor" stroke-width="1.6" opacity=".55"/>
    <circle cx="260" cy="180" r="140" stroke="currentColor" stroke-width="1.4" opacity=".32"/>
    <circle cx="260" cy="180" r="186" stroke="currentColor" stroke-width="1.2" opacity=".18"/>
    <circle cx="260" cy="180" r="9" fill="#F7C948"/>
    <path d="M260 180 366 74" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 7" opacity=".4"/>
    <circle cx="366" cy="74" r="5" fill="#B9E3B4"/>
    <circle cx="89" cy="256" r="4" fill="#AFCBF1"/>
    <circle cx="432" cy="286" r="6" fill="#F3B6CF"/>
    <path d="M46 118c38-26 76-26 114 0" stroke="currentColor" stroke-width="1.2" opacity=".25"/>
    <path d="M374 314c36-24 72-24 108 0" stroke="currentColor" stroke-width="1.2" opacity=".25"/>
  </svg>`;
}

export function netArt(cls = '') {
  return `<svg class="net-art ${cls}" viewBox="0 0 260 160" fill="none" aria-hidden="true" focusable="false">
    <path d="M22 112c34-68 172-68 216 0" stroke="currentColor" stroke-width="1.6" opacity=".55"/>
    <path d="M42 118c24-40 62-60 88-60s64 20 88 60" stroke="currentColor" stroke-width="1.3" opacity=".35"/>
    <path d="M58 122c18-26 44-40 72-40s54 14 72 40" stroke="currentColor" stroke-width="1.2" opacity=".25"/>
    <path d="M130 72v58M90 82l18 48M170 82l-18 48M60 99l36 31M200 99l-36 31" stroke="currentColor" stroke-width="1.1" opacity=".22"/>
    <circle cx="130" cy="72" r="7" fill="#F7C948" stroke="#17161A" stroke-width="1.5"/>
    <circle cx="58" cy="122" r="3.5" fill="#B9E3B4"/>
    <circle cx="202" cy="122" r="3.5" fill="#F3B6CF"/>
  </svg>`;
}

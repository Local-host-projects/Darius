// Shared UI primitives — app shell, page headings, status pills, overlays.
import { esc, stickerFor } from './api.js';
import { icon, logoMark, netArt } from './icons.js';

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function avatar(name, cls = '') {
  const seed = stickerFor(name || '?');
  return `<span class="avatar ${cls}" style="--avatar:var(--${seed})" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function appShell(inner, { active = 'home', user = null } = {}) {
  const name = user?.display_name || user?.username || 'Account';
  const handle = user?.username ? `@${user.username}` : '';
  return `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="side-top">
        <a class="brand" href="/" data-link aria-label="Darius home">
          ${logoMark()}
          <span class="brand-copy">
            <span class="brand-name">Darius</span>
            <span class="brand-tag">Interview engine</span>
          </span>
        </a>
        <p class="side-kicker">Workspace</p>
        <nav class="side-nav" aria-label="Main">
          <a class="side-link ${active === 'home' ? 'active' : ''}" data-link href="/" ${active === 'home' ? 'aria-current="page"' : ''}>
            ${icon('users')}<span>Agents</span>
          </a>
          <a class="side-link ${active === 'settings' ? 'active' : ''}" data-link href="/settings" ${active === 'settings' ? 'aria-current="page"' : ''}>
            ${icon('settings')}<span>Settings</span>
          </a>
        </nav>
      </div>
      <div class="side-bottom">
        <div class="side-note">
          <span class="side-note-mark">${icon('sparkle')}</span>
          <p>Talk once.<br><b>Reach a thousand.</b></p>
        </div>
        <div class="user-card">
          ${avatar(name)}
          <span class="user-meta"><b>${esc(name)}</b><span>${esc(handle)}</span></span>
          <button class="icon-btn" id="logoutBtn" title="Log out" aria-label="Log out">${icon('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="app-main">${inner}</div>
  </div>`;
}

export function wireShell() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.onclick = () => window.dariusLogout?.();
}

export function pageHead({ eyebrow = '', title = '', sub = '', actions = '' } = {}) {
  return `<header class="page-head">
    <div class="page-head-copy">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1 class="page-title">${esc(title)}</h1>
      ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}
    </div>
    ${actions ? `<div class="head-actions">${actions}</div>` : ''}
  </header>`;
}

const STATUS_LABEL = { live: 'Live', draft: 'Draft', paused: 'Paused', active: 'Active', complete: 'Complete', archived: 'Archived' };

export function statusPill(status, cls = '') {
  const key = String(status || 'draft').toLowerCase();
  return `<span class="status-pill ${esc(key)} ${cls}"><i class="dot"></i>${esc(STATUS_LABEL[key] || status)}</span>`;
}

export function loadingBlock(label = 'Loading') {
  return `<div class="loading-block" role="status" aria-live="polite">
    <span class="sr-only">${esc(label)}</span>
    <span class="skeleton sk-title"></span>
    <span class="skeleton sk-line"></span>
    <span class="skeleton sk-line short"></span>
    <span class="skeleton sk-panel"></span>
  </div>`;
}

export function emptyState({ title, copy, action = '', art = true }) {
  return `<div class="empty-state">
    ${art ? netArt() : ''}
    <h2 class="display">${esc(title)}</h2>
    <p>${esc(copy)}</p>
    ${action}
  </div>`;
}

export function mountOverlay({ html, className = 'overlay', onClose = null }) {
  const ov = document.createElement('div');
  ov.className = className;
  ov.innerHTML = html;
  document.body.appendChild(ov);
  document.body.classList.add('has-overlay');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ov.classList.add('is-closing');
    setTimeout(() => {
      ov.remove();
      if (!document.querySelector('.overlay, .drawer-overlay')) document.body.classList.remove('has-overlay');
      onClose?.();
    }, 180);
  };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);
  const observer = new MutationObserver(() => {
    if (!ov.isConnected) {
      document.removeEventListener('keydown', onKey);
      observer.disconnect();
      if (!document.querySelector('.overlay, .drawer-overlay')) document.body.classList.remove('has-overlay');
    }
  });
  observer.observe(document.body, { childList: true });
  return { el: ov, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };
    const { el, close } = mountOverlay({
      onClose: () => { if (!settled) { settled = true; resolve(false); } },
      html: `<div class="modal modal-small" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="modal-head">
          <div><p class="eyebrow">${danger ? 'Destructive action' : 'Please confirm'}</p><h2 class="display" id="confirmTitle">${esc(title)}</h2></div>
          <button class="icon-btn" type="button" data-confirm="false" aria-label="Close">${icon('x')}</button>
        </div>
        <p class="modal-sub">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-confirm="false">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm="true">${esc(confirmLabel)}</button>
        </div>
      </div>`,
    });
    el.querySelectorAll('[data-confirm]').forEach((b) => {
      b.onclick = () => finish(b.dataset.confirm === 'true');
    });
  });
}

export function spinner(label = 'Working') {
  return `<span class="spinner" role="status" aria-label="${esc(label)}"></span>`;
}

export function iconButton(name, label, attrs = '') {
  return `<button class="icon-btn" type="button" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(name)}</button>`;
}

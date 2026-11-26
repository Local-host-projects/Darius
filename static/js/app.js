// Darius SPA — router, shell, login, dashboard, settings.
import { api, esc, getToken, setToken, toast, copyText } from './api.js';
import { icon, logoMark, rippleArt } from './icons.js';
import { appShell, wireShell, pageHead, avatar, emptyState, mountOverlay, spinner, statusPill } from './ui.js';
import { workspaceView } from './workspace.js';
import { publicChat } from './chat.js';

const app = document.getElementById('app');
const me = { user: null };
const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const MODEL_LABELS = {
  'gemini-3.5-flash': 'Gemini 3.5 Flash — recommended',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite — fastest',
  'gemini-3.8-flash': 'Gemini 3.8 Flash — newest',
};

const routes = [
  { re: /^\/login$/, view: loginView },
  { re: /^\/$/, view: dashboardView, auth: true },
  { re: /^\/settings$/, view: settingsView, auth: true },
  { re: /^\/agent\/(\d+)$/, view: (m) => workspaceView(app, m[1], me), auth: true },
  { re: /^\/c\/([a-z0-9-]+)$/, view: (m) => publicChat(app, m[1]) },
];

export function nav(url) { history.pushState({}, '', url); route(); }
window.dariusNav = nav;
window.dariusLogout = async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* local sign-out is enough */ }
  setToken(null); me.user = null; nav('/login');
};
window.addEventListener('popstate', route);

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) { e.preventDefault(); nav(a.getAttribute('href')); }
});

async function route() {
  const path = location.pathname;
  window.scrollTo({ top: 0, behavior: 'instant' });
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    if (r.auth && !getToken()) return nav('/login');
    try { await r.view(m); } catch (err) {
      app.innerHTML = errorCard(err.message);
      wireShell();
    }
    return;
  }
  return nav(getToken() ? '/' : '/login');
}

async function ensureMe() {
  if (me.user) return me.user;
  me.user = (await api('/api/auth/me')).user;
  return me.user;
}

function errorCard(msg) {
  const inner = `<main class="page narrow-page">
    <div class="card error-card">
      <span class="error-mark">${icon('alert')}</span>
      <p class="eyebrow">Something went wrong</p>
      <h1 class="display">A thread snapped</h1>
      <p class="muted">${esc(msg)}</p>
      <a class="btn btn-primary" data-link href="/">${icon('arrowLeft')} Back to dashboard</a>
    </div>
  </main>`;
  return getToken() ? appShell(inner, { active: 'home', user: me.user }) : inner;
}

// ---------------------------------------------------------------- login

async function loginView() {
  if (getToken()) {
    try { await ensureMe(); return nav('/'); } catch { setToken(null); }
  }
  let mode = 'signin';
  const render = () => {
    const signup = mode === 'signup';
    app.innerHTML = `
    <div class="login-shell">
      <section class="login-brand">
        <a class="brand brand-inverse" href="/" data-link aria-label="Darius home">
          ${logoMark()}
          <span class="brand-copy"><span class="brand-name">Darius</span><span class="brand-tag">Interview engine</span></span>
        </a>
        <div class="login-hero">
          <p class="eyebrow eyebrow-light">Conversational research</p>
          <h1>Talk once.<br><span>Reach a thousand.</span></h1>
          <p class="login-lede">Your agents interview people at scale, turn every answer into structured records, then let you reply to each person — one to one.</p>
          <ul class="feature-list">
            <li>${icon('link')}<span>One shareable link per agent</span></li>
            <li>${icon('table')}<span>Live, queryable spreadsheet</span></li>
            <li>${icon('message')}<span>Private replies in each thread</span></li>
          </ul>
        </div>
        <div class="login-art">${rippleArt()}</div>
        <p class="login-foot">Built for teams who would rather listen at scale than guess.</p>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <div class="segmented" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected="${!signup}" class="${!signup ? 'active' : ''}" id="mSign">Sign in</button>
            <button type="button" role="tab" aria-selected="${signup}" class="${signup ? 'active' : ''}" id="mUp">Create account</button>
          </div>
          <div class="login-card-copy">
            <p class="eyebrow">${signup ? 'Start listening' : 'Welcome back'}</p>
            <h2 class="display">${signup ? 'Create your workspace' : 'Sign in to Darius'}</h2>
            <p class="muted">${signup ? 'It takes about thirty seconds. No credit card.' : 'Pick up where your agents left off.'}</p>
          </div>
          <form id="authForm" class="form-stack">
            ${signup ? `<div class="field"><label for="displayName">Your name</label><input type="text" id="displayName" placeholder="Tunde Adeyemi" autocomplete="name" maxlength="60"></div>` : ''}
            <div class="field"><label for="username">Username</label><input type="text" id="username" autocomplete="username" placeholder="tunde" required maxlength="24" pattern="[a-zA-Z0-9_.\\-]{3,24}"><span class="field-hint">3–24 characters. Letters, numbers, dots, dashes.</span></div>
            <div class="field"><label for="password">Password</label>
              <div class="input-action">
                <input type="password" id="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="At least 6 characters" required minlength="6">
                <button type="button" class="input-action-btn" id="togglePw" aria-label="Show password">${icon('eye')}</button>
              </div>
            </div>
            <button class="btn btn-primary btn-block" type="submit" id="authSubmit">${signup ? 'Create account' : 'Sign in'}${icon('arrowRight')}</button>
          </form>
          <p class="login-legal">By continuing you agree to keep conversations private and respect the people your agents talk to.</p>
        </div>
      </section>
    </div>`;
    document.getElementById('mSign').onclick = () => { mode = 'signin'; render(); };
    document.getElementById('mUp').onclick = () => { mode = 'signup'; render(); };
    const pw = document.getElementById('password');
    document.getElementById('togglePw').onclick = () => {
      const showing = pw.type === 'text';
      pw.type = showing ? 'password' : 'text';
      document.getElementById('togglePw').innerHTML = icon(showing ? 'eye' : 'eyeOff');
      document.getElementById('togglePw').setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    };
    document.getElementById('authForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('authSubmit');
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = `${spinner('Signing in')} ${signup ? 'Creating account' : 'Signing in'}`;
      try {
        const body = {
          username: document.getElementById('username').value.trim(),
          password: document.getElementById('password').value,
        };
        if (signup) body.display_name = document.getElementById('displayName').value.trim();
        const res = await api(signup ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body });
        setToken(res.token); me.user = res.user;
        toast(signup ? `Welcome, ${res.user.display_name}` : `Welcome back, ${res.user.display_name}`);
        nav('/');
      } catch (err) {
        toast(err.message, false);
        btn.disabled = false;
        btn.innerHTML = original;
      }
    };
    setTimeout(() => document.getElementById(signup ? 'displayName' : 'username')?.focus(), 80);
  };
  render();
}

// ---------------------------------------------------------------- dashboard

async function dashboardView() {
  try { await ensureMe(); } catch { setToken(null); return nav('/login'); }
  const { agents } = await api('/api/agents');
  const totals = agents.reduce((acc, a) => {
    acc.convs += a.conv_count || 0;
    acc.msgs += a.msg_count || 0;
    if (a.status === 'live') acc.live += 1;
    return acc;
  }, { convs: 0, msgs: 0, live: 0 });

  app.innerHTML = appShell(`
    <main class="page dashboard-page">
      ${pageHead({
        eyebrow: 'Workspace',
        title: 'Agents',
        sub: 'Interview at scale. Every answer becomes a record you can query and act on.',
        actions: `<button class="btn btn-primary" id="newAgent">${icon('plus')} New agent</button>`,
      })}
      ${agents.length ? `
        <section class="stat-grid" aria-label="Workspace totals">
          ${statCard('users', agents.length, 'Agents')}
          ${statCard('message', totals.convs, 'Conversations')}
          ${statCard('inbox', totals.msgs, 'Messages')}
          ${statCard('broadcast', totals.live, 'Live now')}
        </section>
        <div class="section-bar">
          <div class="section-title"><h2>All agents</h2><span class="count-badge">${agents.length}</span></div>
          <label class="search-field" for="agentSearch">${icon('search')}<input id="agentSearch" type="search" placeholder="Search agents" autocomplete="off"><span class="sr-only">Search agents</span></label>
        </div>
        <section class="agent-grid" id="agentGrid">
          ${agents.map((a, i) => agentCard(a, i)).join('')}
        </section>
        <div class="empty-state compact is-hidden" id="noResults">
          <h2 class="display">No agents match</h2>
          <p>Try a different name, brief, or status.</p>
        </div>` : emptyState({
          title: 'No agents yet',
          copy: 'Create your first agent with a short brief. It will interview people for you and turn every conversation into a row of clean, queryable data.',
          action: `<button class="btn btn-primary" id="newAgentEmpty">${icon('plus')} Create your first agent</button>`,
        })}
    </main>`, { active: 'home', user: me.user });

  wireShell();
  (document.getElementById('newAgent') || document.getElementById('newAgentEmpty'))?.addEventListener('click', createModal);
  bindAgentCards();

  document.getElementById('agentSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#agentGrid .agent-card').forEach((card) => {
      const hit = !q || card.dataset.search.includes(q);
      card.classList.toggle('is-hidden', !hit);
      if (hit) shown += 1;
    });
    document.getElementById('noResults')?.classList.toggle('is-hidden', shown > 0);
  });

  document.querySelectorAll('[data-count]').forEach(countUp);
}

function statCard(iconName, value, label) {
  return `<article class="stat-card">
    <span class="stat-icon">${icon(iconName)}</span>
    <span class="stat-value" data-count="${value}">0</span>
    <span class="stat-label">${esc(label)}</span>
  </article>`;
}

function countUp(el) {
  const target = Number(el.dataset.count) || 0;
  if (target === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target.toLocaleString();
    return;
  }
  const duration = 700;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function agentCard(a, i) {
  const link = `${location.origin}/c/${a.slug}`;
  const search = `${a.name} ${a.brief || ''} ${a.status}`.toLowerCase();
  return `<article class="card agent-card" style="--i:${i}" data-search="${esc(search)}">
    <div class="agent-card-top">
      ${avatar(a.name, 'avatar-lg')}
      ${statusPill(a.status)}
    </div>
    <div class="agent-card-body">
      <h3 class="display">${esc(a.name)}</h3>
      <p class="agent-brief">${esc(a.brief || 'No brief yet. Open the workspace to give this agent its brief.')}</p>
    </div>
    <div class="agent-meta">
      <span>${icon('message')} ${a.conv_count} chat${a.conv_count === 1 ? '' : 's'}</span>
      <span>${icon('inbox')} ${a.msg_count} message${a.msg_count === 1 ? '' : 's'}</span>
    </div>
    <div class="agent-actions">
      <a class="btn btn-small btn-primary" data-link href="/agent/${a.id}">Open workspace ${icon('arrowRight')}</a>
      <button class="icon-btn" data-copy="${esc(link)}" data-copy-label="Copy chat link" title="Copy chat link" aria-label="Copy chat link">${icon('link')}</button>
      <a class="icon-btn" href="${esc(link)}" target="_blank" rel="noopener" title="Open public page" aria-label="Open public page">${icon('external')}</a>
    </div>
  </article>`;
}

function bindAgentCards() {
  document.querySelectorAll('[data-copy]').forEach((b) => {
    b.addEventListener('click', async () => {
      await copyText(b.dataset.copy);
      toast('Chat link copied');
      const old = b.innerHTML;
      b.innerHTML = icon('check');
      b.classList.add('is-success');
      setTimeout(() => { b.innerHTML = old; b.classList.remove('is-success'); }, 1400);
    });
  });
}

function createModal() {
  const { el, close } = mountOverlay({
    html: `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="newAgentTitle">
      <div class="modal-head">
        <div>
          <p class="eyebrow">New agent</p>
          <h2 class="display" id="newAgentTitle">Set the brief</h2>
        </div>
        <button class="icon-btn" type="button" id="modalClose" aria-label="Close dialog">${icon('x')}</button>
      </div>
      <p class="modal-sub">Name the agent and describe what you want to learn. Darius drafts the interview schema, persona, and opening message with AI. You can edit everything afterwards.</p>
      <div class="field">
        <label for="agName">Agent name</label>
        <input type="text" id="agName" placeholder="Ada Studio" maxlength="60" autocomplete="off">
        <span class="field-hint">Shown to respondents at the top of the chat.</span>
      </div>
      <div class="field">
        <label for="agBrief">What should it find out?</label>
        <textarea id="agBrief" rows="5" placeholder="What kind of photography people need, their budget and timeline, and the best way to reach them."></textarea>
        <span class="field-hint">Plain language is fine. The brief becomes the interview.</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" id="agCancel">Cancel</button>
        <button class="btn btn-primary" type="button" id="agGo">${icon('sparkle')} Create agent</button>
      </div>
    </div>`,
  });
  el.querySelector('#modalClose').onclick = close;
  el.querySelector('#agCancel').onclick = close;
  const nameEl = el.querySelector('#agName');
  setTimeout(() => nameEl.focus(), 80);
  el.querySelector('#agGo').onclick = async () => {
    const name = nameEl.value.trim();
    if (!name) { toast('Give the agent a name first', false); nameEl.focus(); return; }
    const btn = el.querySelector('#agGo');
    btn.disabled = true;
    btn.innerHTML = `${spinner('Creating agent')} Drafting…`;
    try {
      const res = await api('/api/agents', { method: 'POST', body: { name, brief: el.querySelector('#agBrief').value.trim(), autodraft: true } });
      close();
      if (res.agent.draft_error) toast('Agent created. AI drafting failed — you can retry in Setup.', false);
      else toast('Agent created and briefed');
      nav(`/agent/${res.agent.id}`);
    } catch (err) {
      toast(err.message, false);
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkle')} Create agent`;
    }
  };
}

// ---------------------------------------------------------------- settings

async function settingsView() {
  try { await ensureMe(); } catch { setToken(null); return nav('/login'); }
  const s = await api('/api/settings');
  app.innerHTML = appShell(`
    <main class="page settings-page">
      ${pageHead({
        eyebrow: 'Workspace',
        title: 'Settings',
        sub: 'Connect Gemini and choose the model that powers every interview, extraction, query, and reply.',
      })}
      <div class="settings-grid">
        <section class="card settings-card">
          <div class="card-head">
            <div><p class="eyebrow">AI provider</p><h2 class="display">Gemini</h2></div>
            <span class="chip cream">${icon('key')} ${s.has_user_key ? 'Your key' : s.server_key_active ? 'Server key' : 'No key'}</span>
          </div>
          <p class="card-lede">Interviewing, extraction, spreadsheet queries, and composed replies all run on Gemini. A key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> is free to create.</p>
          <div class="field">
            <label for="keyIn">API key</label>
            <div class="input-action">
              <input type="password" id="keyIn" placeholder="${s.has_user_key ? `Saved — ${esc(s.key_masked)}` : 'Paste your Google AI Studio key'}" autocomplete="off" spellcheck="false">
              <button type="button" class="input-action-btn" id="toggleKey" aria-label="Show API key">${icon('eye')}</button>
            </div>
            <span class="field-hint">${s.has_user_key ? 'A key is already saved. Leave this blank to keep it.' : 'Stored against your account and used for your agents only.'}</span>
          </div>
          <div class="field">
            <label for="modelIn">Model</label>
            <select id="modelIn">${MODELS.map((m) => `<option value="${m}" ${m === (s.model || MODELS[0]) ? 'selected' : ''}>${MODEL_LABELS[m] || m}</option>`).join('')}</select>
            <span class="field-hint">Flash is the best balance of speed, quality, and free-tier quota.</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" id="saveKey">${icon('check')} Save changes</button>
            <button class="btn btn-ghost" id="testKey">${icon('play')} Test connection</button>
          </div>
          <div class="test-result is-hidden" id="testOut" role="status" aria-live="polite"></div>
        </section>
        <aside class="stack">
          <section class="card">
            <div class="card-head"><div><p class="eyebrow">Status</p><h2 class="display">Key health</h2></div></div>
            <dl class="status-list">
              <div><dt>Your Gemini key</dt><dd>${s.has_user_key ? '<span class="inline-ok">' + icon('check') + ' Set</span>' : '<span class="inline-muted">Not set</span>'}</dd></div>
              <div><dt>Server fallback</dt><dd>${s.server_key_active ? '<span class="inline-ok">' + icon('check') + ' Active</span>' : '<span class="inline-muted">Unavailable</span>'}</dd></div>
              <div><dt>Currently using</dt><dd><span class="chip blue">${esc(s.will_use)}</span></dd></div>
            </dl>
            <div class="notice">${icon('shield')}<p>Keys are stored server-side and never sent to respondents. If neither key is available, AI features pause with a clear message instead of inventing data.</p></div>
          </section>
          <section class="card quiet-card">
            <p class="eyebrow">Need help?</p>
            <h2 class="display small-display">Free-tier limits</h2>
            <p class="muted small">Gemini free-tier quotas reset daily. If you hit a 429, wait a moment or switch to the Flash Lite model.</p>
            <a class="text-link" href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener">Read the quota guide ${icon('arrowUpRight')}</a>
          </section>
        </aside>
      </div>
    </main>`, { active: 'settings', user: me.user });

  wireShell();
  const keyEl = document.getElementById('keyIn');
  document.getElementById('toggleKey').onclick = () => {
    const showing = keyEl.type === 'text';
    keyEl.type = showing ? 'password' : 'text';
    document.getElementById('toggleKey').innerHTML = icon(showing ? 'eye' : 'eyeOff');
    document.getElementById('toggleKey').setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
  };
  document.getElementById('saveKey').onclick = async () => {
    const btn = document.getElementById('saveKey');
    const key = keyEl.value.trim();
    const body = { model: document.getElementById('modelIn').value };
    if (key) body.gemini_key = key;
    btn.disabled = true;
    btn.innerHTML = `${spinner('Saving settings')} Saving…`;
    try {
      await api('/api/settings', { method: 'PUT', body });
      toast('Settings saved');
      settingsView();
    } catch (err) {
      toast(err.message, false);
      btn.disabled = false;
      btn.innerHTML = `${icon('check')} Save changes`;
    }
  };
  document.getElementById('testKey').onclick = async () => {
    const out = document.getElementById('testOut');
    const btn = document.getElementById('testKey');
    out.className = 'test-result is-pending';
    out.innerHTML = `${spinner('Testing connection')} Testing Gemini connection…`;
    btn.disabled = true;
    try {
      const r = await api('/api/settings/test', { method: 'POST', body: { gemini_key: keyEl.value.trim(), model: document.getElementById('modelIn').value } });
      out.className = 'test-result ' + (r.ok ? 'is-ok' : 'is-bad');
      out.innerHTML = r.ok
        ? `${icon('check')}<span><b>Connection works.</b> ${esc(r.model)} via ${esc(r.source)}.</span>`
        : `${icon('alert')}<span><b>Connection failed.</b> ${esc(r.error)}</span>`;
    } catch (err) {
      out.className = 'test-result is-bad';
      out.innerHTML = `${icon('alert')}<span>${esc(err.message)}</span>`;
    }
    btn.disabled = false;
  };
}

// ---------------------------------------------------------------- boot

route();

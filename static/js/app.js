// Darius SPA — router + shell + login + dashboard + settings.
import { api, esc, getToken, setToken, toast, copyText, fmtDate, stickerFor } from './api.js';
import { workspaceView } from './workspace.js';
import { publicChat } from './chat.js';

const app = document.getElementById('app');
const me = { user: null };

// ---------------------------------------------------------------- router

const routes = [
  { re: /^\/login$/, view: loginView },
  { re: /^\/$/, view: dashboardView, auth: true },
  { re: /^\/settings$/, view: settingsView, auth: true },
  { re: /^\/agent\/(\d+)$/, view: (m) => workspaceView(app, m[1], me), auth: true },
  { re: /^\/c\/([a-z0-9-]+)$/, view: (m) => publicChat(app, m[1]) },
];

export function nav(url) { history.pushState({}, '', url); route(); }
window.dariusNav = nav;
window.dariusLogout = () => { setToken(null); me.user = null; nav('/login'); };
window.addEventListener('popstate', route);

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) { e.preventDefault(); nav(a.getAttribute('href')); }
});

async function route() {
  const path = location.pathname;
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    if (r.auth && !getToken()) return nav('/login');
    try { await r.view(m); } catch (err) {
      app.innerHTML = errorCard(err.message);
      wireLogout();
    }
    return;
  }
  if (getToken()) return nav('/');
  return nav('/login');
}

function errorCard(msg) {
  return shellWrap(`
    <main class="page"><div class="card" style="max-width:520px;margin:40px auto;text-align:center">
      <div class="display" style="font-size:1.4rem">oops — snapped a thread</div>
      <p class="doodle">${esc(msg)}</p>
      <a class="btn" data-link href="/">back to dashboard</a>
    </div></main>`);
}

// ---------------------------------------------------------------- shell

function shellWrap(inner, active) {
  return `
  <header class="topbar">
    <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
    <a class="wordmark" data-link href="/">Darius</a>
    <span class="topbar-note doodle">talk once → reach a thousand ✳</span>
    <nav class="topnav">
      <a class="chip ${active === 'home' ? 'yellow' : ''}" data-link href="/">agents</a>
      <a class="chip ${active === 'settings' ? 'yellow' : ''}" data-link href="/settings">settings</a>
      <button class="chip pink" id="logoutBtn">log out</button>
    </nav>
  </header>
  ${inner}`;
}

function wireLogout() {
  const b = document.getElementById('logoutBtn');
  if (!b) return;
  b.onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* fine */ }
    setToken(null); me.user = null; nav('/login');
  };
}

// ---------------------------------------------------------------- login

async function loginView() {
  let mode = 'signin';
  const render = () => {
    app.innerHTML = `
    <main class="page" style="display:grid;place-items:center;min-height:100vh">
      <div style="width:min(460px,100%)">
        <div style="text-align:center;margin-bottom:18px">
          <div class="wordmark big">Darius</div>
          <p class="doodle">spawn agents that talk to people for you</p>
        </div>
        <div class="card">
          <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
          <div class="btn-row" style="margin-bottom:10px">
            <button class="tab ${mode === 'signin' ? 'active' : ''}" id="mSign">sign in</button>
            <button class="tab ${mode === 'signup' ? 'active' : ''}" id="mUp">create account</button>
          </div>
          <form id="authForm">
            ${mode === 'signup' ? `<label class="f">Your name</label><input type="text" id="displayName" placeholder="Tunde from Ikoyi" maxlength="60">` : ''}
            <label class="f">Username</label><input type="text" id="username" autocomplete="username" required maxlength="24">
            <label class="f">Password</label><input type="password" id="password" autocomplete="current-password" required minlength="6">
            <div class="btn-row" style="margin-top:16px">
              <button class="btn sticky" type="submit">${mode === 'signup' ? 'Spawn my account →' : 'Let me in →'}</button>
            </div>
          </form>
        </div>
        <p class="doodle" style="text-align:center;margin-top:14px">every agent you spawn becomes a link you can drop in your bio 🌸</p>
      </div>
    </main>`;
    document.getElementById('mSign').onclick = () => { mode = 'signin'; render(); };
    document.getElementById('mUp').onclick = () => { mode = 'signup'; render(); };
    document.getElementById('authForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const body = {
          username: document.getElementById('username').value.trim(),
          password: document.getElementById('password').value,
        };
        if (mode === 'signup') body.display_name = document.getElementById('displayName').value.trim();
        const res = await api(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body });
        setToken(res.token); me.user = res.user;
        toast(`welcome ${res.user.display_name} ✳`);
        nav('/');
      } catch (err) { toast(err.message, false); btn.disabled = false; }
    };
  };
  render();
}

// ---------------------------------------------------------------- dashboard

async function dashboardView() {
  if (!me.user) {
    try { me.user = (await api('/api/auth/me')).user; } catch { setToken(null); return nav('/login'); }
  }
  const { agents } = await api('/api/agents');
  app.innerHTML = shellWrap(`
    <main class="page">
      <div class="btn-row" style="justify-content:space-between;align-items:flex-end">
        <div>
          <h1 class="display">Your Agents</h1>
          <p class="doodle section-note">each one is a person-shaped net you throw into the world 🎣</p>
        </div>
        <button class="btn sticky" id="newAgent">+ spawn an agent</button>
      </div>
      ${agents.length ? `<div class="grid cols-3">${agents.map(agentCard).join('')}</div>` : `
        <div class="empty">
          <div class="big">🕸️</div>
          <h2 class="display" style="margin:8px 0">no agents yet</h2>
          <p class="muted">Spawn your first one — a friendly bot that interviews people for you
          and pours their answers into a spreadsheet you can actually talk to.</p>
          <button class="btn sticky" id="newAgentEmpty">+ spawn an agent</button>
        </div>`}
    </main>`);
  wireLogout();
  (document.getElementById('newAgent') || document.getElementById('newAgentEmpty')).onclick = createModal;
  document.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => copyText(b.dataset.copy).then(() => toast('link copied ✳'));
  });
}

function agentCard(a) {
  const link = `${location.origin}/c/${a.slug}`;
  const st = { live: 'green', draft: 'yellow', paused: 'pink' }[a.status] || 'yellow';
  return `
  <div class="card agent-card">
    <div class="head">
      <h2 class="display" style="font-size:1.2rem">${esc(a.name)}</h2>
      <span class="chip ${st}">${a.status}</span>
    </div>
    <p class="muted small" style="margin:0">${a.conv_count} chats · ${a.msg_count} messages</p>
    <p class="doodle" style="margin:0">${esc(a.brief || 'no brief yet — give it one in setup')}</p>
    <div class="btn-row">
      <a class="btn small" data-link href="/agent/${a.id}">open workspace</a>
      <button class="chip blue" data-copy="${esc(link)}">copy link</button>
      <a class="chip ghost" href="${esc(link)}" target="_blank" rel="noopener">open public ↗</a>
    </div>
  </div>`;
}

function createModal() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal">
      <div class="win-dots" style="float:right"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
      <h2 class="display">spawn an agent</h2>
      <p class="doodle section-note">name it, tell it what you want to learn — the AI drafts the schema, persona and opening line</p>
      <label class="f">Agent name</label>
      <input type="text" id="agName" placeholder="Tunde Photography" maxlength="60">
      <label class="f">What should it find out? (the brief)</label>
      <textarea id="agBrief" placeholder="people who want a photoshoot — what kind of shoot, when, their budget, and how to reach them…"></textarea>
      <p class="big-input-note">The brief becomes the interview. You can edit every field after.</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn sticky" id="agGo">spawn it →</button>
        <button class="btn ghost" id="agCancel">cancel</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#agCancel').onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#agGo').onclick = async () => {
    const name = ov.querySelector('#agName').value.trim();
    if (!name) return toast('give it a name first', false);
    const btn = ov.querySelector('#agGo');
    btn.disabled = true; btn.textContent = 'drafting schema…';
    try {
      const res = await api('/api/agents', { method: 'POST', body: { name, brief: ov.querySelector('#agBrief').value.trim(), autodraft: true } });
      ov.remove();
      if (res.agent.draft_error) toast('agent created, but the AI draft failed — you can draft it in setup', false);
      else toast('agent spawned + schema drafted ✳');
      nav(`/agent/${res.agent.id}`);
    } catch (err) { toast(err.message, false); btn.disabled = false; btn.textContent = 'spawn it →'; }
  };
  setTimeout(() => ov.querySelector('#agName').focus(), 50);
}

// ---------------------------------------------------------------- settings

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash'];

async function settingsView() {
  const s = await api('/api/settings');
  app.innerHTML = shellWrap(`
    <main class="page" style="max-width:720px">
      <h1 class="display">Settings</h1>
      <p class="doodle section-note">plug in your brain 🧠 — Gemini only, straight from Google AI Studio</p>
      <div class="grid cols-2">
        <div class="card">
          <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
          <h2 class="display" style="font-size:1.05rem">Your Gemini key</h2>
          <p class="muted small">Get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> — it's used for your agents only.</p>
          <label class="f">API key</label>
          <input type="password" id="keyIn" placeholder="${s.has_user_key ? 'saved — ' + esc(s.key_masked) : 'AIza…'}">
          <label class="f">Model</label>
          <select id="modelIn">${MODELS.map((m) => `<option value="${m}" ${m === s.model ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <div class="btn-row" style="margin-top:14px">
            <button class="btn sticky" id="saveKey">save</button>
            <button class="btn sky" id="testKey">test it</button>
          </div>
          <p class="small muted" id="testOut" style="margin-top:10px"></p>
        </div>
        <div class="card">
          <h2 class="display" style="font-size:1.05rem">Key status</h2>
          <p style="margin:10px 0"><span class="chip ${s.has_user_key ? 'green' : 'ghost'}">your key (gemini): ${s.has_user_key ? 'set' : 'not set'}</span></p>
          <p style="margin:10px 0"><span class="chip ${s.server_key_active ? 'green' : 'ghost'}">server AI (gemini): ${s.server_key_active ? 'active' : 'none'}</span></p>
          <p style="margin:10px 0"><span class="chip blue">currently using: ${esc(s.will_use)}</span></p>
          <hr class="tape">
          <p class="muted small">Interviewing, extraction, queries, refined broadcasts and delegated replies run on
          <b>your Gemini key</b> when it's set, otherwise the server's key. No key → those features pause.</p>
        </div>
      </div>
    </main>`);
  wireLogout();
  document.getElementById('saveKey').onclick = async () => {
    await api('/api/settings', { method: 'PUT', body: { gemini_key: document.getElementById('keyIn').value.trim(), model: document.getElementById('modelIn').value } });
    toast('settings saved ✳'); settingsView();
  };
  document.getElementById('testKey').onclick = async () => {
    const out = document.getElementById('testOut');
    out.textContent = 'pinging Gemini…';
    await api('/api/settings', { method: 'PUT', body: { model: document.getElementById('modelIn').value, gemini_key: document.getElementById('keyIn').value.trim() } }).catch(() => {});
    const r = await api('/api/settings/test');
    out.textContent = r.ok ? `✅ works — ${r.model} via ${r.source}` : `❌ ${r.error}`;
  };
}

// ---------------------------------------------------------------- boot

route();

// Darius public chat — the respondent's 1:1 booth. No login; session stored on-device.
import { api, esc, stickerFor } from './api.js';

const SESS_KEY = (slug) => `darius_s_${slug}`;

export async function publicChat(root, slug) {
  let info;
  try {
    info = (await api(`/api/public/agents/${slug}`)).agent;
  } catch (err) {
    root.innerHTML = deadEnd(err.message);
    return;
  }

  if (!info.live) {
    root.innerHTML = `
    <main class="page" style="display:grid;place-items:center;min-height:100vh">
      <div class="card" style="max-width:440px;text-align:center;padding:34px">
        <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
        <div class="wordmark big">${esc(info.name)}</div>
        <p class="doodle">this agent isn't taking visitors yet</p>
        <p class="muted small">${esc(info.owner)} is still setting things up. Check back soon! 💛</p>
      </div>
    </main>`;
    return;
  }

  let sessionToken = localStorage.getItem(SESS_KEY(slug)) || '';
  let status = 'active';

  root.innerHTML = `
  <header class="topbar">
    <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
    <a class="wordmark" href="/">Darius</a>
    <span class="topbar-note doodle">a friendly little interview</span>
    <span class="chip yellow">1:1 · just you</span>
  </header>
  <main class="page" style="max-width:760px">
    <div class="card" style="margin-bottom:16px">
      <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
      <div class="btn-row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <h1 class="display" style="font-size:1.6rem">${esc(info.name)}</h1>
          <p class="muted small" style="margin:4px 0 0">hosted by <b>${esc(info.owner || 'its owner')}</b></p>
        </div>
        <span class="chip blue disclosure-chip">🤖 AI assistant</span>
      </div>
      <p class="doodle" style="margin:10px 0 0">I'm the AI assistant for ${esc(info.owner || 'them')} — I'll chat with you for a bit and pass everything along. Your answers stay between us. ✳</p>
    </div>
    <div class="card pad-s"><div class="chat-stream" id="chatHost" style="min-height:46vh;max-height:56vh"></div></div>
    <div class="drawer-foot card pad-s" style="margin-top:14px;box-shadow:var(--shadow)">
      <textarea id="chatIn" placeholder="say hi…"></textarea>
      <button class="btn sticky" id="chatSend">send</button>
    </div>
    <p class="doodle" style="text-align:center;margin-top:14px" id="chatNote"></p>
  </main>`;

  const host = document.getElementById('chatHost');
  const input = document.getElementById('chatIn');
  const note = document.getElementById('chatNote');
  let sending = false;

  const bubble = (m) => {
    const cls = m.role === 'user' ? 'user' : 'agent';
    return `<div class="bubble ${cls}">${esc(m.text)}</div>`;
  };

  const renderNote = () => {
    note.textContent = status === 'complete'
      ? "that's everything I needed — but you can still talk to me anytime 💛"
      : '';
  };

  const pushTyping = () => {
    host.insertAdjacentHTML('beforeend',
      '<div class="bubble agent typing" id="typing"><i></i><i></i><i></i></div>');
    host.scrollTop = 1e9;
  };

  const send = async () => {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    input.value = '';
    host.insertAdjacentHTML('beforeend', bubble({ role: 'user', text }));
    host.scrollTop = 1e9;
    pushTyping();
    try {
      const res = await api('/api/public/message', { method: 'POST', body: { session_token: sessionToken, text } });
      document.getElementById('typing')?.remove();
      host.insertAdjacentHTML('beforeend', bubble({ role: 'agent', text: res.reply }));
      status = res.status;
      renderNote();
    } catch (err) {
      document.getElementById('typing')?.remove();
      host.insertAdjacentHTML('beforeend',
        `<div class="bubble agent" style="background:var(--pink)">⚠️ ${esc(err.message || "I couldn't reach my brain just now — try sending that again.")}</div>`);
    }
    host.scrollTop = 1e9;
    sending = false;
    input.focus();
  };

  document.getElementById('chatSend').onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  // join / resume
  try {
    const res = await api(`/api/public/agents/${slug}/join`, {
      method: 'POST', body: { session_token: sessionToken || null },
    });
    sessionToken = res.session_token;
    status = res.status;
    localStorage.setItem(SESS_KEY(slug), sessionToken);
    host.innerHTML = res.messages.map(bubble).join('');
    renderNote();
  } catch (err) {
    host.innerHTML = `<div class="bubble agent">⚠️ ${esc(err.message)}</div>`;
  }
  host.scrollTop = 1e9;
  input.focus();
}

function deadEnd(msg) {
  return `
  <main class="page" style="display:grid;place-items:center;min-height:100vh">
    <div class="card" style="max-width:440px;text-align:center;padding:34px">
      <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
      <div class="wordmark big">Darius</div>
      <p class="doodle">${esc(msg)}</p>
      <p class="muted small">double-check the link you were sent.</p>
    </div>
  </main>`;
}

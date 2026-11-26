// Darius public chat — the respondent's private 1:1 booth.
import { api, esc, toast } from './api.js';
import { icon, logoMark } from './icons.js';
import { avatar } from './ui.js';

const SESS_KEY = (slug) => `darius_s_${slug}`;
const PASS_KEY = (slug) => `darius_pass_${slug}`;

export async function publicChat(root, slug) {
  let info;
  try {
    info = (await api(`/api/public/agents/${slug}`)).agent;
  } catch (err) {
    root.innerHTML = deadEnd(err.message);
    return;
  }

  if (!info.live) {
    root.innerHTML = inactivePage(info);
    return;
  }

  const urlToken = new URLSearchParams(location.search).get('t')
    || new URLSearchParams(location.hash.slice(1)).get('t')
    || '';
  const hadSession = Boolean(localStorage.getItem(SESS_KEY(slug)));
  let sessionToken = urlToken || localStorage.getItem(SESS_KEY(slug)) || '';
  let status = 'active';
  let messages = [];

  try {
    const res = await api(`/api/public/agents/${slug}/join`, {
      method: 'POST', body: { session_token: sessionToken || null },
    });
    sessionToken = res.session_token;
    status = res.status;
    messages = res.messages || [];
    localStorage.setItem(SESS_KEY(slug), sessionToken);
  } catch (err) {
    root.innerHTML = deadEnd(err.message);
    return;
  }

  // A saved pass opens the exact thread and skips the first-visit gate.
  if (urlToken) {
    localStorage.setItem(PASS_KEY(slug), '1');
    history.replaceState({}, '', `/c/${slug}`);
  }
  const needsPass = !hadSession && !urlToken && !localStorage.getItem(PASS_KEY(slug));

  root.innerHTML = publicShell(info, slug, needsPass ? passGate(info, slug) : chatView(info, slug, messages, status));
  if (needsPass) bindPassGate(root, info, slug, sessionToken, messages, status);
  else bindChat(root, info, slug, sessionToken, status);
}

function publicShell(info, slug, inner) {
  return `<div class="public-shell">
    <header class="public-topbar">
      <span class="brand brand-small">
        ${logoMark()}
        <span class="brand-copy"><span class="brand-name">Darius</span></span>
      </span>
      <div class="public-badges">
        ${info.disclose_ai ? `<span class="chip blue">${icon('sparkle')} AI assistant</span>` : ''}
        <span class="chip ghost">${icon('lock')} Private 1:1</span>
      </div>
    </header>
    ${inner}
    <footer class="public-foot">${icon('shield')} Your answers stay between you and ${esc(info.owner || 'the host')}.</footer>
  </div>`;
}

function agentHero(info, extra = '') {
  return `<section class="agent-hero">
    <div class="agent-hero-main">
      ${avatar(info.name, 'avatar-xl')}
      <div>
        <p class="eyebrow">A conversation with</p>
        <h1 class="display">${esc(info.name)}</h1>
        <p class="agent-host">Hosted by <b>${esc(info.owner || 'the owner')}</b></p>
      </div>
    </div>
    ${extra}
  </section>`;
}

function passGate(info, slug) {
  const filename = `darius-${slug}-chat.html`;
  return `<main class="public-main pass-main">
    ${agentHero(info)}
    <section class="card pass-card">
      <div class="pass-grid">
        <div class="pass-copy">
          <p class="eyebrow">One quick step</p>
          <h2 class="display">Save your chat pass</h2>
          <p class="lede">This conversation has its own private thread. Download the pass now so you can come back to <b>this exact chat</b> — even if you lose the original link or clear your browser.</p>
          <div class="pass-actions">
            <button class="btn btn-primary" id="downloadPass">${icon('download')} Download chat pass</button>
            <button class="btn btn-ghost" id="continueChat" disabled>Continue to chat ${icon('arrowRight')}</button>
          </div>
          <p class="pass-note">${icon('lock')} The file is a shortcut to this thread. Keep it private — anyone with the file can reopen the conversation.</p>
        </div>
        <div class="pass-side">
          <div class="pass-preview">
            <div class="pass-preview-top">
              <span class="pass-logo">${logoMark()}</span>
              <span class="pass-kicker">Private chat pass</span>
            </div>
            <div class="pass-preview-body">
              <b>${esc(info.name)}</b>
              <span>${esc(filename)}</span>
            </div>
            <div class="pass-cut" aria-hidden="true"></div>
          </div>
          <p class="pass-side-note">Opens the same thread, on any device, without an account.</p>
        </div>
      </div>
    </section>
  </main>`;
}

function chatView(info, slug, messages, status) {
  return `<main class="public-main chat-main">
    ${agentHero(info, `<button class="btn btn-small btn-ghost" id="savePass">${icon('download')} Save chat pass</button>`)}
    <section class="card chat-panel">
      <div class="chat-head">
        <div class="chat-head-who">
          <span class="online-dot"></span>
          <span>${esc(info.name)}</span>
          <span class="chat-head-status">${status === 'complete' ? 'Conversation complete' : 'Online now'}</span>
        </div>
        <span class="chat-head-note">${icon('lock')} Only you and the host</span>
      </div>
      <div class="chat-stream" id="chatHost" role="log" aria-live="polite">
        ${messages.map((m) => bubble(m)).join('')}
      </div>
      <div class="chat-compose">
        <textarea id="chatIn" rows="1" placeholder="Write a message…" aria-label="Message"></textarea>
        <button class="btn btn-primary chat-send" id="chatSend" aria-label="Send message" disabled>${icon('send')}</button>
      </div>
      <p class="chat-note" id="chatNote">${status === 'complete' ? 'That is everything the host needed — you can still write anytime.' : 'Press Enter to send. Shift + Enter for a new line.'}</p>
    </section>
  </main>`;
}

function bubble(m) {
  const cls = m.role === 'user' ? 'user' : 'agent';
  return `<div class="bubble ${cls}">${esc(m.text)}</div>`;
}

function bindPassGate(root, info, slug, sessionToken, messages, status) {
  let downloaded = false;
  const downloadBtn = root.querySelector('#downloadPass');
  const continueBtn = root.querySelector('#continueChat');
  downloadBtn.onclick = () => {
    downloadPass(info, slug, sessionToken);
    downloaded = true;
    downloadBtn.innerHTML = `${icon('check')} Downloaded — download again`;
    continueBtn.disabled = false;
    continueBtn.classList.add('btn-primary');
    continueBtn.classList.remove('btn-ghost');
    continueBtn.focus();
  };
  continueBtn.onclick = () => {
    if (!downloaded) return;
    localStorage.setItem(PASS_KEY(slug), '1');
    const main = root.querySelector('.public-main');
    main.classList.add('is-leaving');
    setTimeout(() => {
      root.innerHTML = publicShell(info, slug, chatView(info, slug, messages, status));
      bindChat(root, info, slug, sessionToken, status);
      root.querySelector('.public-main')?.classList.add('view-in');
    }, 180);
  };
}

function bindChat(root, info, slug, sessionToken, status) {
  const host = root.querySelector('#chatHost');
  const input = root.querySelector('#chatIn');
  const sendBtn = root.querySelector('#chatSend');
  const note = root.querySelector('#chatNote');
  let sending = false;
  host.scrollTop = 1e9;

  const updateSend = () => {
    sendBtn.disabled = sending || !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  };
  const pushTyping = () => {
    host.insertAdjacentHTML('beforeend', '<div class="bubble agent typing" id="typing"><i></i><i></i><i></i></div>');
    host.scrollTop = 1e9;
  };
  const send = async () => {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    input.value = '';
    updateSend();
    host.insertAdjacentHTML('beforeend', bubble({ role: 'user', text }));
    host.scrollTop = 1e9;
    pushTyping();
    try {
      const res = await api('/api/public/message', { method: 'POST', body: { session_token: sessionToken, text } });
      root.querySelector('#typing')?.remove();
      host.insertAdjacentHTML('beforeend', bubble({ role: 'agent', text: res.reply }));
      status = res.status;
      if (note) note.textContent = status === 'complete'
        ? 'That is everything the host needed — you can still write anytime.'
        : 'Press Enter to send. Shift + Enter for a new line.';
    } catch (err) {
      root.querySelector('#typing')?.remove();
      host.insertAdjacentHTML('beforeend', `<div class="bubble agent error-bubble">${icon('alert')} ${esc(err.message || 'Message could not be delivered. Try again.')}</div>`);
    }
    host.scrollTop = 1e9;
    sending = false;
    updateSend();
    input.focus();
  };

  sendBtn.onclick = send;
  input.oninput = updateSend;
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };
  updateSend();
  input.focus();

  const saveBtn = root.querySelector('#savePass');
  if (saveBtn) saveBtn.onclick = () => {
    downloadPass(info, slug, sessionToken);
    saveBtn.innerHTML = `${icon('check')} Pass downloaded`;
    toast('Chat pass downloaded');
  };
}

function downloadPass(info, slug, sessionToken) {
  const target = `${location.origin}/c/${slug}?t=${encodeURIComponent(sessionToken)}`;
  const safeTarget = target.replace(/&/g, '&amp;');
  const title = `Darius · ${info.name}`;
  const file = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta http-equiv="refresh" content="0;url=${safeTarget}">
<style>
  :root{color-scheme:light}*{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F2E7;color:#17161A;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
  main{max-width:460px;text-align:center;background:#FFFDF8;border:1.5px solid #17161A;border-radius:18px;box-shadow:5px 5px 0 #17161A;padding:34px 28px}
  .mark{width:56px;height:56px;margin:0 auto 18px}
  .mark svg{width:100%;height:100%;display:block;border-radius:14px}
  h1{font-size:20px;margin:0 0 8px}p{color:#5B574E;line-height:1.55;margin:0 0 20px}
  a{display:inline-flex;align-items:center;justify-content:center;background:#17161A;color:#FAF6EE;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px}
  small{display:block;margin-top:16px;color:#777166}
</style>
</head>
<body>
<main>
  <div class="mark">${logoMark()}</div>
  <h1>Opening your chat with ${esc(info.name)}</h1>
  <p>This private pass reconnects you to the same conversation. If it does not open automatically, use the button below.</p>
  <a href="${safeTarget}">Continue to chat</a>
  <small>Keep this file private. It opens your personal thread.</small>
</main>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
  const blob = new Blob([file], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `darius-${slug}-chat.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function inactivePage(info) {
  return `<div class="public-shell">
    <header class="public-topbar">
      <span class="brand brand-small">${logoMark()}<span class="brand-copy"><span class="brand-name">Darius</span></span></span>
      <span class="chip ghost">${icon('clock')} Not live</span>
    </header>
    <main class="public-main dead-main">
      <div class="card dead-card">
        <span class="dead-icon">${icon('clock')}</span>
        <p class="eyebrow">Private conversation</p>
        <h1 class="display">${esc(info.name)}</h1>
        <p class="lede">This agent is not taking visitors right now. ${esc(info.owner || 'The host')} is still setting things up — check back soon.</p>
        <a class="btn btn-ghost" href="/">${icon('arrowLeft')} Back to Darius</a>
      </div>
    </main>
  </div>`;
}

function deadEnd(msg) {
  return `<div class="public-shell">
    <header class="public-topbar">
      <span class="brand brand-small">${logoMark()}<span class="brand-copy"><span class="brand-name">Darius</span></span></span>
    </header>
    <main class="public-main dead-main">
      <div class="card dead-card">
        <span class="dead-icon">${icon('alert')}</span>
        <p class="eyebrow">Link unavailable</p>
        <h1 class="display">This chat could not open</h1>
        <p class="lede">${esc(msg)}</p>
        <p class="muted small">Double-check the link, or ask the host for a fresh one.</p>
        <a class="btn btn-ghost" href="/">${icon('arrowLeft')} Back to Darius</a>
      </div>
    </main>
  </div>`;
}

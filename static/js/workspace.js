// Darius agent workspace — Setup / Records / Inbox / Broadcasts.
import { api, esc, toast, copyText, fmtDate, stickerFor } from './api.js';

const nav = (...a) => window.dariusNav(...a);

const S = {
  agent: null, stats: null, tab: 'setup',
  fields: [], computeds: [],
  rows: [], segment: null, selected: new Set(),
  stream: [], streamFilter: '',
};

const stChip = (st) => ({ live: 'green', draft: 'yellow', paused: 'pink' }[st] || 'yellow');

export async function workspaceView(root, agentId, me) {
  const data = await api(`/api/agents/${agentId}`);
  S.agent = data.agent; S.stats = data.stats;
  S.fields = JSON.parse(JSON.stringify(S.agent.schema.fields || []));
  S.computeds = JSON.parse(JSON.stringify(S.agent.logic.computed || []));
  S.tab = 'setup'; S.segment = null; S.selected = new Set();

  const pubLink = `${location.origin}/c/${S.agent.slug}`;
  root.innerHTML = `
    <header class="topbar">
      <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
      <a class="wordmark" data-link href="/">Darius</a>
      <span class="topbar-note doodle">${esc(S.agent.name)}</span>
      <nav class="topnav">
        <a class="chip" data-link href="/">agents</a>
        <button class="chip pink" id="logoutBtn">log out</button>
      </nav>
    </header>
    <main class="page">
      <div class="btn-row" style="justify-content:space-between;align-items:flex-end">
        <div>
          <h1 class="display">${esc(S.agent.name)}</h1>
          <p class="doodle section-note">${S.stats.conv_count} chats · ${S.stats.active_count} still open · ${S.stats.msg_count} messages</p>
        </div>
        <span class="chip ${stChip(S.agent.status)} xl" id="statusChip">${S.agent.status}</span>
      </div>
      <nav class="tabs">
        <button class="tab" data-tab="setup">Setup ✎</button>
        <button class="tab" data-tab="records">Records ▦</button>
        <button class="tab" data-tab="inbox">Inbox ✉</button>
        <button class="tab" data-tab="broadcasts">Broadcasts ↗</button>
      </nav>
      <section id="tabBody"></section>
    </main>`;
  document.getElementById('logoutBtn').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* fine */ }
    window.dariusLogout && window.dariusLogout();
  };

  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { S.tab = t.dataset.tab; renderTab(); }; });
  document.getElementById('statusChip').onclick = cycleStatus;
  renderTab();

  async function cycleStatus() {
    const order = { draft: 'live', live: 'paused', paused: 'draft' };
    const next = order[S.agent.status] || 'draft';
    const res = await api(`/api/agents/${S.agent.id}`, { method: 'PUT', body: { status: next } });
    S.agent = res.agent;
    const chip = document.getElementById('statusChip');
    chip.className = `chip ${stChip(S.agent.status)} xl`;
    chip.textContent = S.agent.status;
    toast(next === 'live' ? 'agent is live — share that link ✳' : `agent set to ${next}`);
  }

  function renderTab() {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === S.tab));
    const body = document.getElementById('tabBody');
    ({ setup: renderSetup, records: renderRecords, inbox: renderInbox, broadcasts: renderBroadcasts })[S.tab](body);
  }

  // ============================================================ SETUP
  function renderSetup(body) {
    body.innerHTML = `
    <div class="grid" style="grid-template-columns: 1.25fr 1fr;">
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="card">
          <div class="win-dots"><i class="d red"></i><i class="d yellow"></i><i class="d green"></i></div>
          <h2 class="display" style="font-size:1.05rem">Persona</h2>
          <p class="doodle section-note">who is this agent when it talks?</p>
          <label class="f">The brief <span class="muted small">(what it should find out)</span></label>
          <textarea id="pBrief">${esc(S.agent.brief)}</textarea>
          <label class="f">Personality</label>
          <textarea id="pPersona">${esc(S.agent.personality)}</textarea>
          <label class="f">Opening message <span class="muted small">(what people see first)</span></label>
          <textarea id="pOpening">${esc(S.agent.opening_message)}</textarea>
          <label class="check" style="margin-top:10px"><input type="checkbox" id="pDisclose" ${S.agent.disclose_ai ? 'checked' : ''}>
            Disclose it's an AI assistant collecting info for you <span class="doodle" style="font-size:1rem">(trust + NDPA-friendly)</span></label>
          <div class="btn-row" style="margin-top:14px">
            <button class="btn sticky" id="savePersona">save persona</button>
            <button class="btn sky" id="redraft">re-draft with AI ✨</button>
          </div>
        </div>

        <div class="card">
          <h2 class="display" style="font-size:1.05rem">The schema <span class="doodle" style="text-transform:none">— your net</span></h2>
          <p class="doodle section-note">each field is something the agent listens for in every chat</p>
          <div id="fieldList"></div>
          <button class="btn small mint" id="addField">+ add field</button>
        </div>

        <div class="card">
          <h2 class="display" style="font-size:1.05rem">Intelligent columns <span class="doodle" style="text-transform:none">— the computed logic</span></h2>
          <p class="doodle section-note">qualitative rules that grade every person automatically</p>
          <div id="logicList"></div>
          <button class="btn small rose" id="addLogic">+ add computed column</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px;align-self:start;position:sticky;top:74px">
        <div class="card">
          <h2 class="display" style="font-size:1.05rem">Share the net 🎣</h2>
          <p class="doodle section-note">drop it in your bio, status, DMs — anywhere</p>
          <div class="share-box"><code>${esc(pubLink)}</code>
            <button class="chip yellow" id="copyLink">copy</button>
            <a class="chip blue" href="${esc(pubLink)}" target="_blank" rel="noopener">open ↗</a>
          </div>
          <p class="big-input-note">Status: <b>${esc(S.agent.status)}</b> — people can only join while it's <b>live</b> (tap the status chip up top to cycle).</p>
        </div>
        <div class="card">
          <h2 class="display" style="font-size:1.05rem">How the loop works</h2>
          <p class="small muted" style="margin:8px 0 0">People chat with your agent → their answers pour into
          <b>Records</b> as rows → intelligent columns grade them → you <b>query</b> in plain language →
          broadcast, reply, or jump into any booth from the <b>Inbox</b>. Every message you send lands in
          that person's own 1:1 thread — they never see anyone else.</p>
        </div>
        <div class="card" style="background:var(--red);color:#fff">
          <h2 class="display" style="font-size:1rem">Danger zone</h2>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn" id="delAgent" style="background:#fff;color:var(--ink)">delete agent</button>
          </div>
        </div>
      </div>
    </div>`;

    renderFieldList();
    renderLogicList();

    document.getElementById('copyLink').onclick = () => copyText(pubLink).then(() => toast('link copied ✳'));
    document.getElementById('savePersona').onclick = savePersona;
    document.getElementById('redraft').onclick = redraft;
    document.getElementById('addField').onclick = () => {
      S.fields.push({ key: '', label: '', type: 'text', description: '', required: false, options: [] });
      renderFieldList();
    };
    document.getElementById('addLogic').onclick = () => {
      S.computeds.push({ key: '', label: '', options: [], rule: '' });
      renderLogicList();
    };
    document.getElementById('delAgent').onclick = async () => {
      if (!confirm('Delete this agent, all its conversations and records? No undo.')) return;
      await api(`/api/agents/${S.agent.id}`, { method: 'DELETE' });
      toast('agent deleted'); nav('/');
    };

    async function savePersona() {
      const res = await api(`/api/agents/${S.agent.id}`, { method: 'PUT', body: {
        brief: val('#pBrief'), personality: val('#pPersona'), opening_message: val('#pOpening'),
        disclose_ai: document.getElementById('pDisclose').checked,
        schema: { fields: S.fields }, logic: { computed: S.computeds },
      } });
      S.agent = res.agent;
      toast('saved ✳ — schema live for new chats');
    }
    async function redraft() {
      if (!confirm('Re-draft the persona + schema from the brief with AI? Your current schema will be replaced.')) return;
      const btn = document.getElementById('redraft'); btn.disabled = true; btn.textContent = 'drafting…';
      try {
        const res = await api(`/api/agents/${S.agent.id}/generate-schema`, { method: 'POST', body: { brief: val('#pBrief') } });
        S.agent = res.agent;
        S.fields = JSON.parse(JSON.stringify(S.agent.schema.fields || []));
        S.computeds = JSON.parse(JSON.stringify(S.agent.logic.computed || []));
        document.getElementById('pPersona').value = S.agent.personality;
        document.getElementById('pOpening').value = S.agent.opening_message;
        renderFieldList(); renderLogicList();
        toast('schema re-drafted ✳');
      } catch (err) { toast(err.message, false); }
      btn.disabled = false; btn.textContent = 're-draft with AI ✨';
    }
    function val(sel) { return document.querySelector(sel).value.trim(); }
  }

  function renderFieldList() {
    const host = document.getElementById('fieldList');
    host.innerHTML = S.fields.map((f, i) => `
      <div class="field-row" data-i="${i}">
        <input type="text" data-k="label" placeholder="Label (e.g. Budget)" value="${esc(f.label)}">
        <select data-k="type">
          ${['text', 'number', 'date', 'select', 'multiselect', 'boolean'].map((t) =>
            `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input type="text" data-k="description" placeholder="What to ask / listen for…" value="${esc(f.description)}">
        <label class="check" title="required"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> req</label>
        <span class="btn-row">
          <button class="chip ghost" data-act="up" title="move up">↑</button>
          <button class="chip ghost" data-act="down" title="move down">↓</button>
          <button class="chip pink" data-act="del">✕</button>
        </span>
        <input class="opt-in" type="text" data-k="optionsStr" placeholder="options, comma-separated (for select types)" value="${esc((f.options || []).join(', '))}">
      </div>`).join('') || '<p class="muted small">no fields yet — add one, or re-draft with AI</p>';
    host.oninput = (e) => {
      const row = e.target.closest('.field-row'); if (!row) return;
      const f = S.fields[+row.dataset.i]; const k = e.target.dataset.k;
      if (k === 'required') f.required = e.target.checked;
      else if (k === 'optionsStr') f.options = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      else f[k] = e.target.value;
    };
    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const i = +btn.closest('.field-row').dataset.i;
      if (btn.dataset.act === 'del') S.fields.splice(i, 1);
      if (btn.dataset.act === 'up' && i > 0) [S.fields[i - 1], S.fields[i]] = [S.fields[i], S.fields[i - 1]];
      if (btn.dataset.act === 'down' && i < S.fields.length - 1) [S.fields[i + 1], S.fields[i]] = [S.fields[i], S.fields[i + 1]];
      renderFieldList();
    };
  }

  function renderLogicList() {
    const host = document.getElementById('logicList');
    host.innerHTML = S.computeds.map((c, i) => `
      <div class="logic-row" data-i="${i}">
        <div class="field-row" style="margin-bottom:6px">
          <input type="text" data-k="label" placeholder="Column label (e.g. Lead status)" value="${esc(c.label)}">
          <input type="text" data-k="optionsStr" placeholder="values, comma-separated (hot, warm, cold)" value="${esc((c.options || []).join(', '))}">
          <span class="btn-row"><button class="chip pink" data-act="del">✕ remove</button></span>
        </div>
        <textarea data-k="rule" placeholder="the rule, in plain words: hot if budget above 100000 and timeline is ASAP; cold if just browsing…">${esc(c.rule)}</textarea>
      </div>`).join('') || '<p class="muted small">no computed columns — records will just hold raw fields</p>';
    host.oninput = (e) => {
      const row = e.target.closest('.logic-row'); if (!row) return;
      const c = S.computeds[+row.dataset.i]; const k = e.target.dataset.k;
      if (k === 'optionsStr') c.options = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      else c[k] = e.target.value;
    };
    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      S.computeds.splice(+btn.closest('.logic-row').dataset.i, 1);
      renderLogicList();
    };
  }

  // ============================================================ RECORDS
  async function renderRecords(body) {
    body.innerHTML = '<p class="doodle">hauling in the net…</p>';
    const data = await api(`/api/agents/${S.agent.id}/records`);
    S.rows = data.rows; S.fields = data.fields; S.computeds = data.computeds;
    body.innerHTML = `
      <div class="querybar">
        <input type="text" id="qIn" placeholder="ask the whole spreadsheet… e.g. “who is urgent with a big budget?”" value="${esc(S.segment?.question || '')}">
        <button class="btn sticky" id="qGo">ask ✳</button>
        ${S.segment ? '<button class="chip pink" id="qClear">clear zoom</button>' : ''}
        <button class="btn sky small" id="recomp" title="re-run intelligent columns">re-grade</button>
      </div>
      ${S.segment ? `<p class="segment-chip">🔍 ${esc(S.segment.segment)} — ${S.segment.ids.length} match${S.segment.ids.length === 1 ? '' : 'es'}</p>
        <p class="doodle" style="margin:6px 0 12px">${esc(S.segment.rationale)}</p>` : ''}
      <div id="tableHost"></div>
      <div id="selBar"></div>`;

    renderTable();

    document.getElementById('qGo').onclick = runQuery;
    document.getElementById('qIn').onkeydown = (e) => { if (e.key === 'Enter') runQuery(); };
    const clr = document.getElementById('qClear');
    if (clr) clr.onclick = () => { S.segment = null; renderTab(); };
    document.getElementById('recomp').onclick = async () => {
      const btn = document.getElementById('recomp'); btn.disabled = true;
      try {
        const r = await api(`/api/agents/${S.agent.id}/recompute`, { method: 'POST' });
        toast(r.updated ? `re-graded ${r.updated} records ✳` : r.message || 'nothing to grade');
        renderTab();
      } catch (err) { toast(err.message, false); btn.disabled = false; }
    };

    async function runQuery() {
      const q = document.getElementById('qIn').value.trim();
      if (!q) return;
      const btn = document.getElementById('qGo'); btn.disabled = true; btn.textContent = 'thinking…';
      try {
        const res = await api(`/api/agents/${S.agent.id}/query`, { method: 'POST', body: { question: q } });
        res.question = q;
        S.segment = res;
        renderTab();
      } catch (err) { toast(err.message, false); btn.disabled = false; btn.textContent = 'ask ✳'; }
    }

    function renderTable() {
      const host = document.getElementById('tableHost');
      if (!S.rows.length) {
        host.innerHTML = `<div class="empty"><div class="big">🐟</div>
          <h2 class="display" style="margin:8px 0">the net is empty</h2>
          <p class="muted">Share your agent link — every person who chats becomes a row here, automatically.</p></div>`;
        return;
      }
      const hitSet = new Set(S.segment?.ids || []);
      host.innerHTML = `
      <div class="table-wrap"><table class="sheet">
        <thead><tr>
          <th></th><th>who</th>
          ${S.fields.map((f) => `<th>${esc(f.label)}${f.required ? ' <span style="color:var(--red)">*</span>' : ''}</th>`).join('')}
          ${S.computeds.map((c) => `<th>✳ ${esc(c.label)}</th>`).join('')}
          <th>status</th><th>last</th><th></th>
        </tr></thead>
        <tbody>
          ${S.rows.map((r) => {
            const hit = S.segment ? hitSet.has(r.id) : null;
            return `<tr class="${hit === true ? 'hit' : hit === false ? 'dim' : ''}" data-rid="${r.id}">
            <td><input type="checkbox" class="row-check" data-rid="${r.id}" ${S.selected.has(r.id) ? 'checked' : ''}></td>
            <td class="name-cell" data-open="${r.conversation_id}">${esc(r.respondent_name)}</td>
            ${S.fields.map((f) => `<td class="cell-editable" data-rid="${r.id}" data-fk="${esc(f.key)}">${esc(fmtVal(r.data[f.key], f))}</td>`).join('')}
            ${S.computeds.map((c) => `<td><span class="computed-chip" style="background:${chipColor(c, r.computed[c.key])}">${esc(r.computed[c.key] ?? '—')}</span></td>`).join('')}
            <td><span class="chip ${r.conv_status === 'complete' ? 'green' : r.conv_status === 'archived' ? 'ghost' : 'blue'}">${r.conv_status}</span></td>
            <td class="muted small">${fmtDate(r.last_at)}</td>
            <td><button class="chip blue" data-open="${r.conversation_id}">booth →</button></td>
          </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

      host.querySelectorAll('.row-check').forEach((cb) => {
        cb.onchange = () => {
          const rid = +cb.dataset.rid;
          if (cb.checked) S.selected.add(rid); else S.selected.delete(rid);
          renderSelBar();
        };
      });
      host.querySelectorAll('[data-open]').forEach((el) => {
        if (el.classList.contains('name-cell') || el.tagName === 'BUTTON') el.onclick = () => openBooth(+el.dataset.open);
      });
      host.querySelectorAll('.cell-editable').forEach((td) => {
        td.ondblclick = () => editCell(td);
      });
      renderSelBar();

      function editCell(td) {
        const rid = +td.dataset.rid; const fk = td.dataset.fk;
        const cur = S.rows.find((r) => r.id === rid)?.data[fk] ?? '';
        const inp = document.createElement('input');
        inp.className = 'cell-input';
        inp.value = Array.isArray(cur) ? cur.join(', ') : cur;
        td.textContent = ''; td.appendChild(inp); inp.focus(); inp.select();
        const save = async () => {
          const v = inp.value.trim();
          try {
            await api(`/api/records/${rid}`, { method: 'PUT', body: { data: { [fk]: v } } });
            const row = S.rows.find((r) => r.id === rid);
            const f = S.fields.find((x) => x.key === fk);
            row.data[fk] = f.type === 'multiselect' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
            if (f.type === 'number' && v !== '') row.data[fk] = parseFloat(v.replace(/[^\d.-]/g, '')) || v;
            toast('cell saved ✳'); renderTable();
          } catch (err) { toast(err.message, false); renderTable(); }
        };
        inp.onblur = save;
        inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.onblur = null; renderTable(); } };
      }

      function renderSelBar() {
        const bar = document.getElementById('selBar');
        if (!S.selected.size) { bar.innerHTML = ''; return; }
        bar.innerHTML = `
          <div class="selected-bar"><div class="inner">
            <span>${S.selected.size} selected</span>
            <button class="btn small" id="msgSel">message them →</button>
            <button class="chip pink" id="clearSel">clear</button>
          </div></div>`;
        bar.querySelector('#msgSel').onclick = () => openCompose({ presetIds: [...S.selected].map((rid) => S.rows.find((r) => r.id === rid).conversation_id) });
        bar.querySelector('#clearSel').onclick = () => { S.selected.clear(); renderTable(); };
      }
    }
  }

  function fmtVal(v, f) {
    if (v === undefined || v === null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }

  function chipColor(c, val) {
    if (!val) return 'var(--cream)';
    const opts = c.options || [];
    const idx = opts.findIndex((o) => o.toLowerCase() === String(val).toLowerCase());
    return ['var(--green)', 'var(--yellow)', 'var(--pink)', 'var(--blue)', 'var(--cream)'][idx >= 0 ? idx : 4];
  }

  // ============================================================ INBOX
  async function renderInbox(body) {
    body.innerHTML = '<p class="doodle">opening the booths…</p>';
    const data = await api(`/api/agents/${S.agent.id}/stream`);
    S.stream = data.messages;
    const names = [...new Set(S.stream.map((m) => m.respondent_name))];
    body.innerHTML = `
      <p class="doodle section-note">every booth, one room — nobody ever sees each other, only you see it all 👀</p>
      <div class="btn-row" style="margin-bottom:12px">
        <button class="chip ${S.streamFilter === '' ? 'yellow' : 'ghost'}" data-nf="">all</button>
        ${names.map((n) => `<button class="chip ${S.streamFilter === n ? stickerFor(n) : 'ghost'}" data-nf="${esc(n)}">${esc(n)}</button>`).join('')}
        <span style="flex:1"></span>
        <button class="btn sticky" id="openCompose">compose →</button>
      </div>
      <div class="card pad-s"><div class="chat-stream" id="streamHost" style="max-height:60vh"></div></div>`;
    renderStream();
    document.querySelectorAll('[data-nf]').forEach((b) => {
      b.onclick = () => { S.streamFilter = b.dataset.nf; renderTab(); };
    });
    document.getElementById('openCompose').onclick = () => openCompose({});

    function renderStream() {
      const host = document.getElementById('streamHost');
      const msgs = S.stream.filter((m) => !S.streamFilter || m.respondent_name === S.streamFilter);
      if (!msgs.length) {
        host.innerHTML = '<p class="muted" style="text-align:center;padding:30px">no messages here yet — once people chat with your agent, it all lands here</p>';
        return;
      }
      host.innerHTML = msgs.map((m) => {
        const cls = m.role === 'user' ? 'user' : m.role === 'operator' ? 'operator' : 'agent';
        const who = m.role === 'user' ? esc(m.respondent_name) : m.role === 'operator' ? 'you' : `${esc(S.agent.name)} (ai)`;
        return `
        <div class="stream-item">
          <div class="stream-meta">
            <span class="name-tag" style="background:var(--${stickerFor(m.respondent_name)})" data-open="${m.conversation_id}">${esc(m.respondent_name)}</span>
            <span>${who} · ${fmtDate(m.created_at)}${m.broadcast_id ? ' · via broadcast' : ''}</span>
          </div>
          <div class="bubble ${cls}">${esc(m.text)}</div>
        </div>`;
      }).join('');
      host.querySelectorAll('[data-open]').forEach((t) => { t.onclick = () => openBooth(+t.dataset.open); });
    }
  }

  // ============================================================ BROADCASTS
  async function renderBroadcasts(body) {
    const data = await api(`/api/agents/${S.agent.id}/broadcasts`);
    body.innerHTML = `
      <div class="btn-row" style="justify-content:space-between;margin-bottom:14px">
        <p class="doodle section-note" style="margin:0">everything you've sent out, and how it went</p>
        <button class="btn sticky" id="bcCompose">compose →</button>
      </div>
      ${data.broadcasts.length ? data.broadcasts.map((b) => `
        <div class="card pad-s" style="margin-bottom:12px">
          <div class="btn-row" style="justify-content:space-between">
            <span class="chip ${b.mode === 'raw' ? 'cream' : b.mode === 'refined' ? 'pink' : 'blue'}">${b.mode}</span>
            <span class="muted small">${b.sent_count} sent · ${fmtDate(b.created_at)}</span>
          </div>
          <p style="margin:8px 0 0">${esc(b.text)}</p>
        </div>`).join('') : '<div class="empty"><div class="big">📭</div><p class="muted">nothing sent yet — filter in Records, then compose from the Inbox</p></div>'}`;
    document.getElementById('bcCompose').onclick = () => openCompose({});
  }

  // ============================================================ COMPOSE MODAL
  async function ensureRows() {
    if (!S.rows.length) {
      const d = await api(`/api/agents/${S.agent.id}/records`);
      S.rows = d.rows; S.fields = d.fields; S.computeds = d.computeds;
    }
  }

  async function openCompose({ presetIds = [] } = {}) {
    await ensureRows();
    if (!S.rows.length) return toast('nobody to message yet — share your agent link', false);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    let mode = 'raw';
    const checked = new Set(presetIds.length ? presetIds : S.rows.map((r) => r.conversation_id));
    const byConv = Object.fromEntries(S.rows.map((r) => [r.conversation_id, r]));
    ov.innerHTML = `
      <div class="modal">
        <h2 class="display">compose</h2>
        <p class="doodle section-note">one write, a thousand personal deliveries</p>
        <div class="mode-pick" style="margin-bottom:12px">
          ${[['raw', 'raw — same text to all'], ['refined', 'refined — AI personalises'], ['delegate', 'delegate — AI replies for you']]
            .map(([m, lbl]) => `<button class="mp" data-m="${m}">${lbl}</button>`).join('')}
        </div>
        <label class="f" id="composeLabel">Your message</label>
        <textarea id="composeText"></textarea>
        <p class="big-input-note" id="composeHint">sent exactly as written to everyone checked below.</p>
        <label class="f">Recipients <span class="muted small">(uncheck anyone to leave out)</span>
          <button class="chip ghost" id="ckAll" style="margin-left:8px">all</button>
          <button class="chip ghost" id="ckNone">none</button></label>
        <div class="recip-list">${S.rows.map((r) => `
          <label><input type="checkbox" data-cid="${r.conversation_id}" ${checked.has(r.conversation_id) ? 'checked' : ''}>
            <span class="name-tag" style="background:var(--${stickerFor(r.respondent_name)})">${esc(r.respondent_name)}</span></label>`).join('')}
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn sticky" id="sendIt">send →</button>
          <button class="btn ghost" id="cancelIt">cancel</button>
        </div>
        <div id="previewZone"></div>
      </div>`;
    document.body.appendChild(ov);
    const textEl = ov.querySelector('#composeText');
    const labelEl = ov.querySelector('#composeLabel');
    const hintEl = ov.querySelector('#composeHint');
    const setMode = (m) => {
      mode = m;
      ov.querySelectorAll('.mp').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
      if (m === 'delegate') {
        labelEl.textContent = 'Instruction for the AI';
        hintEl.textContent = 'e.g. “everyone asking about pricing — tell them my session fee is ₦50k and I have Saturday slots”';
        textEl.placeholder = 'what should I reply for you?';
      } else if (m === 'refined') {
        labelEl.textContent = 'Your message (base version)';
        hintEl.textContent = 'AI rewrites it per person, using their own chat as context.';
        textEl.placeholder = 'write it once — it lands tailored for each person';
      } else {
        labelEl.textContent = 'Your message';
        hintEl.textContent = 'sent exactly as written to everyone checked below.';
        textEl.placeholder = 'hey! thanks for reaching out…';
      }
    };
    ov.querySelectorAll('.mp').forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    setMode(presetIds.length ? 'raw' : 'raw');
    ov.querySelector('#cancelIt').onclick = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#ckAll').onclick = () => ov.querySelectorAll('[data-cid]').forEach((c) => { c.checked = true; });
    ov.querySelector('#ckNone').onclick = () => ov.querySelectorAll('[data-cid]').forEach((c) => { c.checked = false; });
    ov.querySelector('#sendIt').onclick = async () => {
      const ids = [...ov.querySelectorAll('[data-cid]')].filter((c) => c.checked).map((c) => +c.dataset.cid);
      if (!ids.length) return toast('no recipients checked', false);
      const body = {
        mode,
        text: textEl.value.trim(),
        instruction: mode === 'delegate' ? textEl.value.trim() : '',
        targets: { mode: 'selected', ids },
      };
      if (!body.text) return toast(mode === 'delegate' ? 'describe the reply' : 'write the message', false);
      const btn = ov.querySelector('#sendIt');
      btn.disabled = true; btn.textContent = 'delivering…';
      try {
        const res = await api(`/api/agents/${S.agent.id}/compose`, { method: 'POST', body });
        if (!res.sent) { toast(res.message || 'nothing sent', false); btn.disabled = false; btn.textContent = 'send →'; return; }
        const pz = ov.querySelector('#previewZone');
        pz.innerHTML = (res.previews || []).map((p) => `
          <hr class="tape"><p class="small"><b>${esc(byConv[p.conversation_id]?.respondent_name || '?')} got:</b> ${esc(p.text)}</p>`).join('')
          + `<div class="btn-row" style="margin-top:12px"><button class="btn" id="doneIt">done ✳</button></div>`;
        pz.querySelector('#doneIt').onclick = () => { ov.remove(); renderTab(); };
        toast(`sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'} ✳`);
      } catch (err) { toast(err.message, false); btn.disabled = false; btn.textContent = 'send →'; }
    };
  }

  // ============================================================ BOOTH DRAWER
  async function openBooth(convId) {
    let data;
    try { data = await api(`/api/conversations/${convId}`); } catch (err) { return toast(err.message, false); }
    const c = data.conversation;
    const ov = document.createElement('div');
    ov.className = 'drawer-overlay'; ov.id = 'boothOv';
    const dr = document.createElement('div');
    dr.className = 'drawer';
    const rec = data.record;
    dr.innerHTML = `
      <div class="drawer-head">
        <div><b style="font-size:1.05rem">${esc(c.respondent_name)}</b>
          <span class="chip ${c.status === 'complete' ? 'green' : 'blue'}" style="margin-left:8px">${c.status}</span></div>
        <button class="x-btn" id="closeBooth">✕</button>
      </div>
      <div class="drawer-body">
        <div style="padding:14px 18px;border-bottom:1px dashed rgba(22,21,19,.3)">
          <p class="doodle" style="margin:0 0 8px">their card — double-tap to fix a value</p>
          ${rec && S.fields.length ? `<div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
            ${S.fields.map((f) => `
              <div style="min-width:0">
                <label class="f" style="margin:2px 0 2px">${esc(f.label)}</label>
                <input type="text" data-rk="${esc(f.key)}" value="${esc(Array.isArray(rec.data[f.key]) ? rec.data[f.key].join(', ') : rec.data[f.key] ?? '')}">
              </div>`).join('')}
          </div>
          ${S.computeds.length ? `<p style="margin:10px 0 4px" class="small"><b>graded:</b>
            ${S.computeds.map((cc) => `<span class="computed-chip" style="background:${chipColor(cc, rec.computed[cc.key])};margin-right:6px">${cc.key}: ${esc(rec.computed[cc.key] ?? '—')}</span>`).join('')}</p>` : ''}
          <div class="btn-row" style="margin-top:10px"><button class="btn small mint" id="saveRec">save card</button></div>`
          : '<p class="muted small">no record fields yet</p>'}
        </div>
        <div class="chat-stream" id="boothChat" style="max-height:none">
          ${data.messages.map((m) => {
            const cls = m.role === 'user' ? 'user' : m.role === 'operator' ? 'operator' : 'agent';
            const who = m.role === 'user' ? 'them' : m.role === 'operator' ? 'you' : `${S.agent.name} (ai)`;
            return `<div class="bubble ${cls}"><span class="who">${who} · ${fmtDate(m.created_at)}</span>${esc(m.text)}</div>`;
          }).join('')}
        </div>
      </div>
      <div class="drawer-foot">
        <textarea id="boothReply" placeholder="step into this booth — message lands in their 1:1"></textarea>
        <button class="btn sticky" id="sendBooth">send</button>
      </div>`;
    ov.appendChild(dr);
    ov.onclick = (e) => { if (e.target === ov) cleanup(); };
    document.body.appendChild(ov);
    const close = dr.querySelector('#closeBooth');
    close.onclick = cleanup;
    function cleanup() { ov.remove(); if (S.tab === 'records' || S.tab === 'inbox') renderTab(); }
    dr.querySelector('#boothChat').scrollTop = 1e9;

    dr.querySelector('#saveRec').onclick = async () => {
      const dataOut = {};
      dr.querySelectorAll('[data-rk]').forEach((i) => { dataOut[i.dataset.rk] = i.value.trim(); });
      try {
        await api(`/api/records/${rec.id}`, { method: 'PUT', body: { data: dataOut } });
        toast('card saved ✳');
      } catch (err) { toast(err.message, false); }
    };
    const replyBox = dr.querySelector('#boothReply');
    const send = async () => {
      const text = replyBox.value.trim();
      if (!text) return;
      try {
        await api(`/api/conversations/${convId}/reply`, { method: 'POST', body: { text } });
        const chat = dr.querySelector('#boothChat');
        chat.insertAdjacentHTML('beforeend',
          `<div class="bubble operator"><span class="who">you · just now</span>${esc(text)}</div>`);
        chat.scrollTop = 1e9;
        replyBox.value = '';
      } catch (err) { toast(err.message, false); }
    };
    dr.querySelector('#sendBooth').onclick = send;
    replyBox.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  }
}

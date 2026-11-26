// Darius agent workspace — Setup / Records / Inbox / Broadcasts.
import { api, esc, toast, copyText, fmtDate } from './api.js';
import { icon } from './icons.js';
import { appShell, wireShell, avatar, statusPill, loadingBlock, emptyState, mountOverlay, confirmDialog, spinner } from './ui.js';

const nav = (...a) => window.dariusNav(...a);

const S = {
  agent: null, stats: null, tab: 'setup',
  fields: [], computeds: [],
  rows: [], segment: null, selected: new Set(),
  stream: [], streamFilter: '',
};

const STATUS_META = {
  live: { label: 'Live', hint: 'Accepting new chats' },
  draft: { label: 'Draft', hint: 'Not public yet' },
  paused: { label: 'Paused', hint: 'Link is closed' },
};

export async function workspaceView(root, agentId, me) {
  const data = await api(`/api/agents/${agentId}`);
  S.agent = data.agent; S.stats = data.stats;
  S.fields = JSON.parse(JSON.stringify(S.agent.schema.fields || []));
  S.computeds = JSON.parse(JSON.stringify(S.agent.logic.computed || []));
  S.tab = 'setup'; S.segment = null; S.selected = new Set(); S.streamFilter = '';

  const pubLink = `${location.origin}/c/${S.agent.slug}`;
  root.innerHTML = appShell(`
    <main class="page workspace-page">
      <header class="workspace-head">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a data-link href="/">Agents</a>${icon('chevronRight')}<span>${esc(S.agent.name)}</span>
        </nav>
        <div class="workspace-title-row">
          <div class="workspace-title">
            ${avatar(S.agent.name, 'avatar-xl')}
            <div>
              <h1 class="page-title">${esc(S.agent.name)}</h1>
              <p class="page-sub">${S.stats.conv_count} conversation${S.stats.conv_count === 1 ? '' : 's'} · ${S.stats.active_count} open · ${S.stats.msg_count} message${S.stats.msg_count === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div class="head-actions">
            <div class="status-menu-wrap" id="statusWrap">
              <button class="status-pill ${S.agent.status} status-trigger" id="statusBtn" aria-haspopup="menu" aria-expanded="false">
                <i class="dot"></i><span>${esc(STATUS_META[S.agent.status]?.label || S.agent.status)}</span>${icon('chevronDown')}
              </button>
              <div class="menu status-menu-panel" id="statusMenu" role="menu" hidden>
                ${['live', 'draft', 'paused'].map((st) => `<button type="button" role="menuitem" data-status="${st}">
                  <i class="dot ${st}"></i><span><b>${STATUS_META[st].label}</b><small>${STATUS_META[st].hint}</small></span>
                  ${S.agent.status === st ? icon('check') : ''}
                </button>`).join('')}
              </div>
            </div>
            <button class="btn btn-small" id="copyLink">${icon('link')} Copy link</button>
            <a class="btn btn-small btn-primary" href="${esc(pubLink)}" target="_blank" rel="noopener">${icon('external')} Open public</a>
          </div>
        </div>
        <nav class="tabs" role="tablist" aria-label="Agent sections">
          <button class="tab" role="tab" data-tab="setup">${icon('sliders')} Setup</button>
          <button class="tab" role="tab" data-tab="records">${icon('table')} Records <span class="tab-count">${S.stats.conv_count}</span></button>
          <button class="tab" role="tab" data-tab="inbox">${icon('inbox')} Inbox</button>
          <button class="tab" role="tab" data-tab="broadcasts">${icon('broadcast')} Broadcasts</button>
        </nav>
      </header>
      <section id="tabBody" class="tab-body"></section>
    </main>`, { active: 'home', user: me.user });

  wireShell();
  bindStatusMenu();
  document.querySelectorAll('#copyLink, [data-copy-link]').forEach((b) => {
    b.addEventListener('click', () => copyLink(b));
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => { S.tab = t.dataset.tab; renderTab(); };
  });
  renderTab();

  function copyLink(btn) {
    copyText(pubLink).then(() => {
      toast('Chat link copied');
      const old = btn.innerHTML;
      btn.innerHTML = `${icon('check')} Copied`;
      btn.classList.add('is-success');
      setTimeout(() => { btn.innerHTML = old; btn.classList.remove('is-success'); }, 1400);
    });
  }

  function bindStatusMenu() {
    const wrap = document.getElementById('statusWrap');
    const btn = document.getElementById('statusBtn');
    const menu = document.getElementById('statusMenu');
    const close = () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.onclick = (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      menu.hidden = !opening;
      btn.setAttribute('aria-expanded', String(opening));
      if (opening) {
        const onDoc = (ev) => { if (!wrap.contains(ev.target)) { close(); document.removeEventListener('click', onDoc); } };
        document.addEventListener('click', onDoc);
      }
    };
    menu.querySelectorAll('[data-status]').forEach((item) => {
      item.onclick = async () => {
        close();
        if (item.dataset.status === S.agent.status) return;
        try {
          const res = await api(`/api/agents/${S.agent.id}`, { method: 'PUT', body: { status: item.dataset.status } });
          S.agent = res.agent;
          const meta = STATUS_META[S.agent.status] || { label: S.agent.status };
          btn.className = `status-pill ${S.agent.status} status-trigger`;
          btn.innerHTML = `<i class="dot"></i><span>${esc(meta.label)}</span>${icon('chevronDown')}`;
          toast(S.agent.status === 'live' ? 'Agent is live — share the link' : `Agent set to ${meta.label.toLowerCase()}`);
          document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === S.tab));
          renderTab();
        } catch (err) { toast(err.message, false); }
      };
    });
  }

  function renderTab() {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === S.tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    const body = document.getElementById('tabBody');
    if (!body) return;
    ({ setup: renderSetup, records: renderRecords, inbox: renderInbox, broadcasts: renderBroadcasts })[S.tab](body);
  }

  // ============================================================ SETUP
  function renderSetup(body) {
    body.innerHTML = `
    <div class="setup-grid">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div><p class="eyebrow">Persona</p><h2 class="display">How it talks</h2></div>
            <span class="chip cream">${icon('user')} Voice</span>
          </div>
          <p class="card-lede">These words shape every interview. Keep the brief specific — the agent will adapt its questions from there.</p>
          <div class="field">
            <label for="pBrief">The brief <span class="label-note">what it should find out</span></label>
            <textarea id="pBrief" rows="4">${esc(S.agent.brief)}</textarea>
          </div>
          <div class="field">
            <label for="pPersona">Personality <span class="label-note">tone and manner</span></label>
            <textarea id="pPersona" rows="4">${esc(S.agent.personality)}</textarea>
          </div>
          <div class="field">
            <label for="pOpening">Opening message <span class="label-note">first thing respondents see</span></label>
            <textarea id="pOpening" rows="3">${esc(S.agent.opening_message)}</textarea>
          </div>
          <label class="switch-row">
            <input type="checkbox" id="pDisclose" ${S.agent.disclose_ai ? 'checked' : ''}>
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-copy"><b>Disclose AI assistance</b><small>Shows an AI chip in the public chat. Recommended for trust and NDPA-friendly consent.</small></span>
          </label>
          <div class="btn-row" style="margin-top:18px">
            <button class="btn btn-primary" data-save>${icon('check')} Save all changes</button>
            <button class="btn btn-ghost" id="redraft">${icon('sparkle')} Re-draft with AI</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><p class="eyebrow">Schema</p><h2 class="display">What it listens for</h2></div>
            <span class="count-badge" id="fieldCount">${S.fields.length}</span>
          </div>
          <p class="card-lede">Every field becomes a column in Records. The interviewer asks one question at a time and never repeats what it already knows.</p>
          <div id="fieldList" class="field-list"></div>
          <div class="btn-row" style="margin-top:13px">
            <button class="btn btn-small btn-ghost" id="addField">${icon('plus')} Add field</button>
            <button class="btn btn-small btn-primary" data-save>${icon('check')} Save changes</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><p class="eyebrow">Intelligent columns</p><h2 class="display">Computed logic</h2></div>
            <span class="count-badge" id="logicCount">${S.computeds.length}</span>
          </div>
          <p class="card-lede">Rules that grade every record automatically — hot or cold, urgent or browsing, high value or early.</p>
          <div id="logicList" class="logic-list"></div>
          <div class="btn-row" style="margin-top:13px">
            <button class="btn btn-small btn-ghost" id="addLogic">${icon('plus')} Add computed column</button>
            <button class="btn btn-small btn-primary" data-save>${icon('check')} Save changes</button>
          </div>
        </section>
      </div>

      <aside class="stack rail">
        <section class="card share-card">
          <div class="card-head"><div><p class="eyebrow">Distribution</p><h2 class="display">Share this agent</h2></div></div>
          <p class="card-lede">Drop this link in a bio, status, DM, or email. People land in a private 1:1 chat.</p>
          <div class="share-link"><span>${esc(pubLink)}</span>
            <button class="icon-btn" data-copy-link title="Copy link" aria-label="Copy link">${icon('copy')}</button>
          </div>
          <div class="share-status">${statusPill(S.agent.status)}<span>${esc(STATUS_META[S.agent.status]?.hint || 'Check agent status')}</span></div>
          <a class="text-link" href="${esc(pubLink)}" target="_blank" rel="noopener">Preview the public chat ${icon('arrowUpRight')}</a>
        </section>

        <section class="card loop-card">
          <p class="eyebrow">The loop</p>
          <ol class="steps">
            <li><span>01</span><div><b>Share the link</b><small>Respondents meet a focused, one-to-one interview.</small></div></li>
            <li><span>02</span><div><b>Answers become records</b><small>Live extraction fills the spreadsheet while they talk.</small></div></li>
            <li><span>03</span><div><b>Query and reply</b><small>Find the right slice, then message each person privately.</small></div></li>
          </ol>
        </section>

        <details class="danger-zone">
          <summary>${icon('trash')} Danger zone</summary>
          <p>Deleting this agent removes every conversation and record. This cannot be undone.</p>
          <button class="btn btn-danger btn-small" id="delAgent">${icon('trash')} Delete agent</button>
        </details>
      </aside>
    </div>`;

    renderFieldList();
    renderLogicList();

    document.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => saveAll(b); });
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
      const ok = await confirmDialog({
        title: 'Delete this agent?',
        message: 'Every conversation and record for this agent will be removed. This cannot be undone.',
        confirmLabel: 'Delete agent',
        danger: true,
      });
      if (!ok) return;
      await api(`/api/agents/${S.agent.id}`, { method: 'DELETE' });
      toast('Agent deleted');
      nav('/');
    };

    async function saveAll(btn) {
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${spinner('Saving changes')} Saving…`;
      try {
        const res = await api(`/api/agents/${S.agent.id}`, { method: 'PUT', body: {
          brief: val('#pBrief'), personality: val('#pPersona'), opening_message: val('#pOpening'),
          disclose_ai: document.getElementById('pDisclose').checked,
          schema: { fields: S.fields }, logic: { computed: S.computeds },
        } });
        S.agent = res.agent;
        toast('All changes saved');
      } catch (err) { toast(err.message, false); }
      btn.disabled = false;
      btn.innerHTML = original;
    }
    async function redraft() {
      const ok = await confirmDialog({
        title: 'Re-draft with AI?',
        message: 'The current schema and computed columns will be replaced with a fresh draft based on your brief.',
        confirmLabel: 'Re-draft',
      });
      if (!ok) return;
      const btn = document.getElementById('redraft');
      btn.disabled = true;
      btn.innerHTML = `${spinner('Drafting schema')} Drafting…`;
      try {
        const res = await api(`/api/agents/${S.agent.id}/generate-schema`, { method: 'POST', body: { brief: val('#pBrief') } });
        S.agent = res.agent;
        S.fields = JSON.parse(JSON.stringify(S.agent.schema.fields || []));
        S.computeds = JSON.parse(JSON.stringify(S.agent.logic.computed || []));
        document.getElementById('pPersona').value = S.agent.personality;
        document.getElementById('pOpening').value = S.agent.opening_message;
        renderFieldList(); renderLogicList();
        toast('Schema re-drafted');
      } catch (err) { toast(err.message, false); }
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkle')} Re-draft with AI`;
    }
    function val(sel) { return document.querySelector(sel).value.trim(); }
  }

  function renderFieldList() {
    const host = document.getElementById('fieldList');
    const count = document.getElementById('fieldCount');
    if (count) count.textContent = S.fields.length;
    if (!S.fields.length) {
      host.innerHTML = `<div class="mini-empty">${icon('sliders')}<p>No fields yet. Add one, or let AI draft the schema from your brief.</p></div>`;
      return;
    }
    host.innerHTML = S.fields.map((f, i) => {
      const withOptions = f.type === 'select' || f.type === 'multiselect';
      return `
      <div class="field-editor" data-i="${i}">
        <div class="field-editor-head">
          <span class="field-index">Field ${String(i + 1).padStart(2, '0')}</span>
          <div class="field-tools">
            <button type="button" class="icon-btn icon-btn-sm" data-act="up" title="Move up" aria-label="Move field up" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button>
            <button type="button" class="icon-btn icon-btn-sm" data-act="down" title="Move down" aria-label="Move field down" ${i === S.fields.length - 1 ? 'disabled' : ''}>${icon('arrowDown')}</button>
            <button type="button" class="icon-btn icon-btn-sm danger" data-act="del" title="Remove field" aria-label="Remove field">${icon('x')}</button>
          </div>
        </div>
        <div class="field-editor-grid">
          <div class="field"><label>Label</label><input type="text" data-k="label" placeholder="Budget" value="${esc(f.label)}"></div>
          <div class="field"><label>Type</label><select data-k="type">${['text', 'number', 'date', 'select', 'multiselect', 'boolean'].map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field span-2"><label>What to ask or listen for</label><input type="text" data-k="description" placeholder="Monthly budget in naira, including retainer" value="${esc(f.description)}"></div>
          ${withOptions ? `<div class="field"><label>Options <span class="label-note">comma separated</span></label><input type="text" data-k="optionsStr" placeholder="hot, warm, cold" value="${esc((f.options || []).join(', '))}"></div>` : ''}
          <label class="check"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> Required field</label>
        </div>
      </div>`;
    }).join('');
    host.oninput = (e) => {
      const row = e.target.closest('.field-editor'); if (!row) return;
      const f = S.fields[+row.dataset.i]; const k = e.target.dataset.k;
      if (!f || !k) return;
      if (k === 'required') f.required = e.target.checked;
      else if (k === 'optionsStr') f.options = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
      else f[k] = e.target.value;
    };
    host.onchange = (e) => {
      if (!e.target.matches('select[data-k="type"]')) return;
      const row = e.target.closest('.field-editor');
      const f = S.fields[+row.dataset.i];
      if (!f) return;
      f.type = e.target.value;
      renderFieldList();
    };
    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const i = +btn.closest('.field-editor').dataset.i;
      if (btn.dataset.act === 'del') S.fields.splice(i, 1);
      if (btn.dataset.act === 'up' && i > 0) [S.fields[i - 1], S.fields[i]] = [S.fields[i], S.fields[i - 1]];
      if (btn.dataset.act === 'down' && i < S.fields.length - 1) [S.fields[i + 1], S.fields[i]] = [S.fields[i], S.fields[i + 1]];
      renderFieldList();
    };
  }

  function renderLogicList() {
    const host = document.getElementById('logicList');
    const count = document.getElementById('logicCount');
    if (count) count.textContent = S.computeds.length;
    if (!S.computeds.length) {
      host.innerHTML = `<div class="mini-empty">${icon('sparkle')}<p>No computed columns yet. Add one to grade each record automatically.</p></div>`;
      return;
    }
    host.innerHTML = S.computeds.map((c, i) => `
      <div class="logic-editor" data-i="${i}">
        <div class="field-editor-head">
          <span class="field-index">Rule ${String(i + 1).padStart(2, '0')}</span>
          <button type="button" class="icon-btn icon-btn-sm danger" data-act="del" title="Remove rule" aria-label="Remove rule">${icon('x')}</button>
        </div>
        <div class="field-editor-grid">
          <div class="field"><label>Column label</label><input type="text" data-k="label" placeholder="Lead status" value="${esc(c.label)}"></div>
          <div class="field"><label>Values <span class="label-note">comma separated</span></label><input type="text" data-k="optionsStr" placeholder="hot, warm, cold" value="${esc((c.options || []).join(', '))}"></div>
        </div>
        <div class="field"><label>Rule in plain words</label><textarea data-k="rule" rows="2" placeholder="hot if budget is above ₦100,000 and timeline is ASAP; cold if they are just browsing">${esc(c.rule)}</textarea></div>
      </div>`).join('');
    host.oninput = (e) => {
      const row = e.target.closest('.logic-editor'); if (!row) return;
      const c = S.computeds[+row.dataset.i]; const k = e.target.dataset.k;
      if (!c || !k) return;
      if (k === 'optionsStr') c.options = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
      else c[k] = e.target.value;
    };
    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      S.computeds.splice(+btn.closest('.logic-editor').dataset.i, 1);
      renderLogicList();
    };
  }

  // ============================================================ RECORDS
  async function renderRecords(body) {
    body.innerHTML = `<div class="stack">${loadingBlock('Loading records')}</div>`;
    let data;
    try { data = await api(`/api/agents/${S.agent.id}/records`); } catch (err) {
      body.innerHTML = inlineError('records', err.message);
      document.getElementById('retryTab').onclick = renderTab;
      return;
    }
    S.rows = data.rows; S.fields = data.fields; S.computeds = data.computeds;
    body.innerHTML = `
      <section class="card query-card">
        <div class="query-intro">
          <span class="query-icon">${icon('sparkle')}</span>
          <div><p class="eyebrow">Semantic zoom</p><h2 class="display">Ask your data</h2><p>Plain language in. A filtered slice of people out.</p></div>
        </div>
        <form class="query-form" id="qForm">
          <label class="search-field query-field" for="qIn">${icon('search')}<input id="qIn" type="text" placeholder="Who is urgent, has a budget, and wants a weekend shoot?" value="${esc(S.segment?.question || '')}"></label>
          <button class="btn btn-primary" type="submit" id="qGo">${icon('sparkle')} Ask</button>
          <button class="btn btn-ghost" type="button" id="recomp" title="Re-run computed columns">${icon('refresh')} Re-grade</button>
        </form>
        ${S.segment ? `<div class="segment-banner">
          <div><span class="segment-label">${icon('filter')} ${esc(S.segment.segment)}</span><p>${esc(S.segment.rationale)}</p></div>
          <div class="segment-actions"><span class="count-badge">${S.segment.ids.length} match${S.segment.ids.length === 1 ? '' : 'es'}</span><button class="icon-btn icon-btn-sm" id="qClear" aria-label="Clear query">${icon('x')}</button></div>
        </div>` : ''}
      </section>
      <div class="table-toolbar">
        <div class="section-title"><h2>Records</h2><span class="count-badge">${S.rows.length}</span></div>
        <div class="btn-row">
          <button class="btn btn-ghost btn-small" id="exportCsv">${icon('download')} ${S.segment ? 'Export segment' : 'Export CSV'}</button>
        </div>
      </div>
      <div id="tableHost"></div>
      <div id="selBar"></div>`;

    renderTable();
    document.getElementById('qForm').onsubmit = (e) => { e.preventDefault(); runQuery(); };
    document.getElementById('qClear')?.addEventListener('click', () => { S.segment = null; renderTab(); });
    document.getElementById('recomp').onclick = async () => {
      const btn = document.getElementById('recomp');
      btn.disabled = true;
      btn.innerHTML = `${spinner('Re-grading records')} Re-grading…`;
      try {
        const r = await api(`/api/agents/${S.agent.id}/recompute`, { method: 'POST' });
        toast(r.updated ? `Re-graded ${r.updated} record${r.updated === 1 ? '' : 's'}` : r.message || 'Nothing to grade');
        renderTab();
      } catch (err) { toast(err.message, false); btn.disabled = false; btn.innerHTML = `${icon('refresh')} Re-grade`; }
    };
    document.getElementById('exportCsv').onclick = exportCsv;

    async function runQuery() {
      const q = document.getElementById('qIn').value.trim();
      if (!q) { document.getElementById('qIn').focus(); return; }
      const btn = document.getElementById('qGo');
      btn.disabled = true;
      btn.innerHTML = `${spinner('Querying records')} Thinking…`;
      try {
        const res = await api(`/api/agents/${S.agent.id}/query`, { method: 'POST', body: { question: q } });
        res.question = q;
        S.segment = res;
        renderTab();
      } catch (err) { toast(err.message, false); btn.disabled = false; btn.innerHTML = `${icon('sparkle')} Ask`; }
    }

    function visibleRows() {
      if (!S.segment) return S.rows;
      const ids = new Set(S.segment.ids);
      return S.rows.filter((r) => ids.has(r.id));
    }

    function exportCsv() {
      const rows = visibleRows();
      if (!rows.length) { toast('No records to export', false); return; }
      const headers = ['who', ...S.fields.map((f) => f.label || f.key), ...S.computeds.map((c) => c.label || c.key), 'status', 'last'];
      const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [headers.map(quote).join(',')];
      rows.forEach((r) => {
        const vals = [
          r.respondent_name,
          ...S.fields.map((f) => Array.isArray(r.data[f.key]) ? r.data[f.key].join('; ') : r.data[f.key] ?? ''),
          ...S.computeds.map((c) => r.computed[c.key] ?? ''),
          r.conv_status,
          r.last_at,
        ];
        lines.push(vals.map(quote).join(','));
      });
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${S.agent.slug}-records.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'}`);
    }

    function renderTable() {
      const host = document.getElementById('tableHost');
      if (!S.rows.length) {
        host.innerHTML = emptyState({
          title: 'The net is empty',
          copy: 'Share your agent link. Every person who chats becomes a row here — automatically, in real time.',
          action: `<button class="btn btn-primary" id="emptyShare">${icon('link')} Copy chat link</button>`,
        });
        document.getElementById('emptyShare').onclick = () => copyLink(document.getElementById('emptyShare'));
        return;
      }
      const hitSet = new Set(S.segment?.ids || []);
      const allSelected = S.rows.every((r) => S.selected.has(r.id));
      host.innerHTML = `
      <div class="table-wrap"><table class="sheet">
        <thead><tr>
          <th class="check-col"><input type="checkbox" class="row-check" id="checkAll" ${allSelected ? 'checked' : ''} aria-label="Select all"></th>
          <th>Person</th>
          ${S.fields.map((f) => `<th>${esc(f.label)}${f.required ? ' <span class="req-mark">*</span>' : ''}</th>`).join('')}
          ${S.computeds.map((c) => `<th>${esc(c.label)}</th>`).join('')}
          <th>Status</th><th>Last</th><th></th>
        </tr></thead>
        <tbody>
          ${S.rows.map((r) => {
            const hit = S.segment ? hitSet.has(r.id) : null;
            return `<tr class="${hit === true ? 'hit' : hit === false ? 'dim' : ''}" data-rid="${r.id}">
            <td class="check-col"><input type="checkbox" class="row-check" data-rid="${r.id}" ${S.selected.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.respondent_name)}"></td>
            <td class="name-cell" data-open="${r.conversation_id}"><span class="row-person">${avatar(r.respondent_name)}<span>${esc(r.respondent_name)}</span></span></td>
            ${S.fields.map((f) => `<td class="cell-editable" data-rid="${r.id}" data-fk="${esc(f.key)}" title="Double-click to edit">${esc(fmtVal(r.data[f.key], f))}</td>`).join('')}
            ${S.computeds.map((c) => `<td><span class="computed-chip" style="background:${chipColor(c, r.computed[c.key])}">${esc(r.computed[c.key] ?? '—')}</span></td>`).join('')}
            <td>${statusPill(r.conv_status)}</td>
            <td class="muted small">${fmtDate(r.last_at)}</td>
            <td><button class="icon-btn icon-btn-sm" data-open="${r.conversation_id}" title="Open conversation" aria-label="Open conversation">${icon('arrowRight')}</button></td>
          </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

      document.getElementById('checkAll').onchange = (e) => {
        if (e.target.checked) S.rows.forEach((r) => S.selected.add(r.id));
        else S.selected.clear();
        renderTable();
      };
      host.querySelectorAll('.row-check[data-rid]').forEach((cb) => {
        cb.onchange = () => {
          const rid = +cb.dataset.rid;
          if (cb.checked) S.selected.add(rid); else S.selected.delete(rid);
          renderSelBar();
        };
      });
      host.querySelectorAll('[data-open]').forEach((el) => {
        el.onclick = () => openBooth(+el.dataset.open);
      });
      host.querySelectorAll('.cell-editable').forEach((td) => {
        td.ondblclick = () => editCell(td);
      });
      renderSelBar();
    }

    function editCell(td) {
      const rid = +td.dataset.rid; const fk = td.dataset.fk;
      const cur = S.rows.find((r) => r.id === rid)?.data[fk] ?? '';
      const inp = document.createElement('input');
      inp.className = 'cell-input';
      inp.value = Array.isArray(cur) ? cur.join(', ') : cur;
      td.textContent = ''; td.appendChild(inp); inp.focus(); inp.select();
      let settled = false;
      const restore = () => { if (!settled) { settled = true; renderTable(); } };
      const save = async () => {
        if (settled) return;
        settled = true;
        const v = inp.value.trim();
        try {
          await api(`/api/records/${rid}`, { method: 'PUT', body: { data: { [fk]: v } } });
          const row = S.rows.find((r) => r.id === rid);
          const f = S.fields.find((x) => x.key === fk);
          row.data[fk] = f.type === 'multiselect' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
          if (f.type === 'number' && v !== '') row.data[fk] = parseFloat(v.replace(/[^\d.-]/g, '')) || v;
          toast('Cell saved');
        } catch (err) { toast(err.message, false); }
        renderTable();
      };
      inp.onblur = save;
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') inp.blur();
        if (e.key === 'Escape') { inp.onblur = null; restore(); }
      };
    }

    function renderSelBar() {
      const bar = document.getElementById('selBar');
      if (!S.selected.size) { bar.innerHTML = ''; return; }
      bar.innerHTML = `<div class="selection-bar"><div class="selection-inner">
        <span><b>${S.selected.size}</b> selected</span>
        <button class="btn btn-small btn-accent" id="msgSel">${icon('send')} Message selected</button>
        <button class="btn btn-small btn-ghost" id="clearSel">Clear</button>
      </div></div>`;
      document.getElementById('msgSel').onclick = () => openCompose({ presetIds: [...S.selected].map((rid) => S.rows.find((r) => r.id === rid).conversation_id) });
      document.getElementById('clearSel').onclick = () => { S.selected.clear(); renderTable(); };
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
    body.innerHTML = `<div class="stack">${loadingBlock('Loading inbox')}</div>`;
    let data;
    try { data = await api(`/api/agents/${S.agent.id}/stream`); } catch (err) {
      body.innerHTML = inlineError('inbox', err.message);
      document.getElementById('retryTab').onclick = renderTab;
      return;
    }
    S.stream = data.messages;
    const names = [...new Set(S.stream.map((m) => m.respondent_name))];
    body.innerHTML = `
      <div class="stack">
        <div class="section-bar">
          <div><p class="eyebrow">Unified stream</p><h2 class="display">Inbox</h2><p class="section-sub">Every booth in one room. Respondents never see each other.</p></div>
          <button class="btn btn-primary" id="openCompose">${icon('send')} Compose</button>
        </div>
        <div class="filter-row" role="group" aria-label="Filter by respondent">
          <button class="filter-chip ${S.streamFilter === '' ? 'active' : ''}" data-nf="">All conversations</button>
          ${names.map((n) => `<button class="filter-chip ${S.streamFilter === n ? 'active' : ''}" data-nf="${esc(n)}">${avatar(n)} ${esc(n)}</button>`).join('')}
        </div>
        <div class="card inbox-card" id="streamHost"></div>
      </div>`;
    renderStream();
    document.querySelectorAll('[data-nf]').forEach((b) => {
      b.onclick = () => { S.streamFilter = b.dataset.nf; renderTab(); };
    });
    document.getElementById('openCompose').onclick = () => openCompose({});

    function renderStream() {
      const host = document.getElementById('streamHost');
      const msgs = S.stream.filter((m) => !S.streamFilter || m.respondent_name === S.streamFilter);
      if (!msgs.length) {
        host.innerHTML = `<div class="mini-empty">${icon('inbox')}<p>No messages ${S.streamFilter ? 'from this person' : ''} yet. Once people chat with your agent, every message lands here.</p></div>`;
        return;
      }
      host.innerHTML = `<div class="stream-list">${msgs.map((m) => {
        const cls = m.role === 'user' ? 'user' : m.role === 'operator' ? 'operator' : 'agent';
        const who = m.role === 'user' ? esc(m.respondent_name) : m.role === 'operator' ? 'You' : `${esc(S.agent.name)} (AI)`;
        return `<article class="stream-item ${cls}">
          ${m.role === 'user' ? avatar(m.respondent_name) : `<span class="stream-icon">${icon(m.role === 'operator' ? 'send' : 'sparkle')}</span>`}
          <div class="stream-body">
            <div class="stream-meta">
              <button class="name-tag" data-open="${m.conversation_id}" title="Open conversation">${who}</button>
              <span>${fmtDate(m.created_at)}${m.broadcast_id ? ' · via broadcast' : ''}</span>
            </div>
            <div class="bubble ${cls}">${esc(m.text)}</div>
          </div>
        </article>`;
      }).join('')}</div>`;
      host.querySelectorAll('[data-open]').forEach((t) => { t.onclick = () => openBooth(+t.dataset.open); });
    }
  }

  // ============================================================ BROADCASTS
  async function renderBroadcasts(body) {
    body.innerHTML = `<div class="stack">${loadingBlock('Loading broadcasts')}</div>`;
    let data;
    try { data = await api(`/api/agents/${S.agent.id}/broadcasts`); } catch (err) {
      body.innerHTML = inlineError('broadcasts', err.message);
      document.getElementById('retryTab').onclick = renderTab;
      return;
    }
    body.innerHTML = `<div class="stack">
      <div class="section-bar">
        <div><p class="eyebrow">Outbound</p><h2 class="display">Broadcasts</h2><p class="section-sub">Everything you have sent out, and how it landed.</p></div>
        <button class="btn btn-primary" id="bcCompose">${icon('send')} Compose</button>
      </div>
      ${data.broadcasts.length ? `<div class="broadcast-list">${data.broadcasts.map((b) => `
        <article class="card broadcast-card">
          <div class="broadcast-top">
            <span class="mode-badge ${esc(b.mode)}">${icon(b.mode === 'raw' ? 'file' : b.mode === 'refined' ? 'sparkle' : 'message')} ${esc(b.mode)}</span>
            <span class="muted small">${b.sent_count} sent · ${fmtDate(b.created_at)}</span>
          </div>
          <p>${esc(b.text)}</p>
        </article>`).join('')}</div>` : emptyState({
          title: 'Nothing sent yet',
          copy: 'Filter a slice of records, then compose a message. Each delivery lands in that person’s private thread.',
          action: `<button class="btn btn-primary" id="bcEmptyCompose">${icon('send')} Compose a message</button>`,
        })}</div>`;
    document.getElementById('bcCompose').onclick = () => openCompose({});
    const emptyBtn = document.getElementById('bcEmptyCompose');
    if (emptyBtn) emptyBtn.onclick = () => openCompose({});
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
    if (!S.rows.length) return toast('Nobody to message yet — share your agent link', false);
    let mode = 'raw';
    const checked = new Set(presetIds.length ? presetIds : S.rows.map((r) => r.conversation_id));
    const byConv = Object.fromEntries(S.rows.map((r) => [r.conversation_id, r]));

    const { el, close } = mountOverlay({
      html: `<div class="modal compose-modal" role="dialog" aria-modal="true" aria-labelledby="composeTitle">
        <div class="modal-head">
          <div><p class="eyebrow">One write, many private deliveries</p><h2 class="display" id="composeTitle">Compose</h2></div>
          <button class="icon-btn" type="button" id="composeClose" aria-label="Close dialog">${icon('x')}</button>
        </div>
        <div class="mode-pick" role="group" aria-label="Delivery mode">
          <button type="button" class="mode-option" data-m="raw">${icon('file')}<span><b>Raw</b><small>Same text to everyone</small></span></button>
          <button type="button" class="mode-option" data-m="refined">${icon('sparkle')}<span><b>Refined</b><small>AI personalises each</small></span></button>
          <button type="button" class="mode-option" data-m="delegate">${icon('message')}<span><b>Delegate</b><small>AI replies in your voice</small></span></button>
        </div>
        <div class="field" id="composeField">
          <label for="composeText" id="composeLabel">Your message</label>
          <textarea id="composeText" rows="4"></textarea>
          <span class="field-hint" id="composeHint">Sent exactly as written to everyone checked below.</span>
        </div>
        <div class="recip-head">
          <label class="f">Recipients <span class="muted small" id="recipCount"></span></label>
          <div class="btn-row"><button type="button" class="text-btn" id="ckAll">Select all</button><button type="button" class="text-btn" id="ckNone">Clear</button></div>
        </div>
        <div class="recip-list">${S.rows.map((r) => `
          <label class="recip-item"><input type="checkbox" data-cid="${r.conversation_id}" ${checked.has(r.conversation_id) ? 'checked' : ''}>
            ${avatar(r.respondent_name)}<span>${esc(r.respondent_name)}</span></label>`).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" id="cancelIt">Cancel</button>
          <button class="btn btn-primary" type="button" id="sendIt">${icon('send')} Send</button>
        </div>
        <div id="previewZone"></div>
      </div>`,
    });
    const textEl = el.querySelector('#composeText');
    const labelEl = el.querySelector('#composeLabel');
    const hintEl = el.querySelector('#composeHint');
    const countEl = el.querySelector('#recipCount');
    el.querySelector('#composeClose').onclick = close;
    el.querySelector('#cancelIt').onclick = close;
    const updateCount = () => {
      const n = el.querySelectorAll('[data-cid]:checked').length;
      countEl.textContent = `· ${n} of ${S.rows.length}`;
    };
    updateCount();
    el.querySelectorAll('[data-cid]').forEach((c) => c.addEventListener('change', updateCount));
    const setMode = (m) => {
      mode = m;
      el.querySelectorAll('.mode-option').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
      if (m === 'delegate') {
        labelEl.textContent = 'Instruction for the AI';
        hintEl.textContent = 'Example: “Everyone asking about pricing — tell them the session fee is ₦50k and I have Saturday slots.”';
        textEl.placeholder = 'What should I reply for you?';
      } else if (m === 'refined') {
        labelEl.textContent = 'Your message (base version)';
        hintEl.textContent = 'AI rewrites it per person using their own conversation as context.';
        textEl.placeholder = 'Write it once — it lands tailored for each person.';
      } else {
        labelEl.textContent = 'Your message';
        hintEl.textContent = 'Sent exactly as written to everyone checked below.';
        textEl.placeholder = 'Hey! Thanks for reaching out…';
      }
    };
    el.querySelectorAll('.mode-option').forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    setMode('raw');
    el.querySelector('#ckAll').onclick = () => { el.querySelectorAll('[data-cid]').forEach((c) => { c.checked = true; }); updateCount(); };
    el.querySelector('#ckNone').onclick = () => { el.querySelectorAll('[data-cid]').forEach((c) => { c.checked = false; }); updateCount(); };
    el.querySelector('#sendIt').onclick = async () => {
      const ids = [...el.querySelectorAll('[data-cid]')].filter((c) => c.checked).map((c) => +c.dataset.cid);
      if (!ids.length) return toast('No recipients checked', false);
      const text = textEl.value.trim();
      if (!text) { toast(mode === 'delegate' ? 'Describe the reply' : 'Write the message', false); textEl.focus(); return; }
      const btn = el.querySelector('#sendIt');
      btn.disabled = true;
      btn.innerHTML = `${spinner('Sending')} Delivering…`;
      try {
        const body = { mode, text, instruction: mode === 'delegate' ? text : '', targets: { mode: 'selected', ids } };
        const res = await api(`/api/agents/${S.agent.id}/compose`, { method: 'POST', body });
        if (!res.sent) {
          toast(res.message || 'Nothing sent', false);
          btn.disabled = false; btn.innerHTML = `${icon('send')} Send`;
          return;
        }
        const pz = el.querySelector('#previewZone');
        pz.innerHTML = `<div class="compose-result">
          <div class="result-head"><span class="result-icon">${icon('check')}</span><div><b>Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}</b><small>Each delivery is in their private thread.</small></div></div>
          ${(res.previews || []).slice(0, 6).map((p) => `<div class="preview-row"><b>${esc(byConv[p.conversation_id]?.respondent_name || 'Recipient')}</b><p>${esc(p.text)}</p></div>`).join('')}
          <div class="btn-row"><button class="btn btn-primary" id="doneIt">${icon('check')} Done</button></div>
        </div>`;
        pz.querySelector('#doneIt').onclick = () => { close(); renderTab(); };
        el.querySelector('.compose-modal')?.classList.add('is-sent');
        const eyebrow = el.querySelector('.modal-head .eyebrow');
        if (eyebrow) eyebrow.textContent = 'Delivered';
        const title = el.querySelector('#composeTitle');
        if (title) title.textContent = 'Sent';
        toast(`Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`);
        btn.innerHTML = `${icon('check')} Sent`;
      } catch (err) {
        toast(err.message, false);
        btn.disabled = false; btn.innerHTML = `${icon('send')} Send`;
      }
    };
    setTimeout(() => textEl.focus(), 80);
  }

  // ============================================================ BOOTH DRAWER
  async function openBooth(convId) {
    let data;
    try { data = await api(`/api/conversations/${convId}`); } catch (err) { return toast(err.message, false); }
    const c = data.conversation;
    const rec = data.record;
    const { el, close } = mountOverlay({
      className: 'drawer-overlay',
      onClose: () => { if (S.tab === 'records' || S.tab === 'inbox') renderTab(); },
      html: `<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="boothTitle">
        <div class="drawer-head">
          <div class="drawer-title">${avatar(c.respondent_name, 'avatar-lg')}<div><h2 class="display" id="boothTitle">${esc(c.respondent_name)}</h2>${statusPill(c.status)}</div></div>
          <button class="icon-btn" id="closeBooth" aria-label="Close conversation">${icon('x')}</button>
        </div>
        <div class="drawer-body">
          <section class="booth-card">
            <div class="card-head"><div><p class="eyebrow">Record</p><h3 class="display small-display">Their card</h3></div></div>
            ${rec && S.fields.length ? `<div class="booth-grid">
              ${S.fields.map((f) => `<div class="field"><label>${esc(f.label)}</label><input type="text" data-rk="${esc(f.key)}" value="${esc(Array.isArray(rec.data[f.key]) ? rec.data[f.key].join(', ') : rec.data[f.key] ?? '')}"></div>`).join('')}
            </div>
            ${S.computeds.length ? `<div class="booth-grades">${S.computeds.map((cc) => `<span class="computed-chip" style="background:${chipColor(cc, rec.computed[cc.key])}">${esc(cc.label || cc.key)}: ${esc(rec.computed[cc.key] ?? '—')}</span>`).join('')}</div>` : ''}
            <button class="btn btn-small btn-primary" id="saveRec">${icon('check')} Save card</button>`
            : '<p class="muted small">No record fields yet. Add fields in Setup.</p>'}
          </section>
          <div class="booth-chat" id="boothChat">
            ${data.messages.map((m) => {
              const cls = m.role === 'user' ? 'user' : m.role === 'operator' ? 'operator' : 'agent';
              const who = m.role === 'user' ? 'Them' : m.role === 'operator' ? 'You' : `${S.agent.name} (AI)`;
              return `<div class="bubble ${cls}"><span class="who">${esc(who)} · ${fmtDate(m.created_at)}</span>${esc(m.text)}</div>`;
            }).join('')}
          </div>
        </div>
        <div class="drawer-foot">
          <textarea id="boothReply" rows="1" placeholder="Message this person privately…"></textarea>
          <button class="btn btn-primary" id="sendBooth" aria-label="Send message">${icon('send')}</button>
        </div>
      </div>`,
    });
    el.querySelector('#closeBooth').onclick = close;
    const chat = el.querySelector('#boothChat');
    chat.scrollTop = 1e9;
    const saveBtn = el.querySelector('#saveRec');
    if (saveBtn) saveBtn.onclick = async () => {
      const out = {};
      el.querySelectorAll('[data-rk]').forEach((i) => { out[i.dataset.rk] = i.value.trim(); });
      saveBtn.disabled = true;
      saveBtn.innerHTML = `${spinner('Saving card')} Saving…`;
      try {
        await api(`/api/records/${rec.id}`, { method: 'PUT', body: { data: out } });
        toast('Card saved');
      } catch (err) { toast(err.message, false); }
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${icon('check')} Save card`;
    };
    const replyBox = el.querySelector('#boothReply');
    const send = async () => {
      const text = replyBox.value.trim();
      if (!text) return;
      const btn = el.querySelector('#sendBooth');
      btn.disabled = true;
      try {
        await api(`/api/conversations/${convId}/reply`, { method: 'POST', body: { text } });
        chat.insertAdjacentHTML('beforeend', `<div class="bubble operator"><span class="who">You · just now</span>${esc(text)}</div>`);
        chat.scrollTop = 1e9;
        replyBox.value = '';
        toast('Message delivered');
      } catch (err) { toast(err.message, false); }
      btn.disabled = false;
    };
    el.querySelector('#sendBooth').onclick = send;
    replyBox.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    setTimeout(() => replyBox.focus(), 100);
  }

  function inlineError(area, message) {
    return `<div class="card error-inline"><span class="error-mark">${icon('alert')}</span><div><h2 class="display small-display">Could not load ${esc(area)}</h2><p class="muted">${esc(message)}</p><button class="btn btn-small btn-primary" id="retryTab">${icon('refresh')} Try again</button></div></div>`;
  }
}

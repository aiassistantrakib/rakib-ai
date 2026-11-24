/* =========================================================================
   RAKIB AI — frontend (no build step, no framework)
   ========================================================================= */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const store = {
  get(k, d) { try { const v = localStorage.getItem('rakib.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rakib.' + k, JSON.stringify(v)); } catch {} },
};

const S = {
  server: { agents: [], models: [], tools: [], providers: [], usage: {}, health: {} },
  convs: store.get('convs', []),
  activeId: store.get('active', null),
  attachments: [],
  busy: false,
  abort: null,
  view: 'chat',
  token: '',
};

const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19l8-14 8 14"/></svg>',
};

/* ---------------------------- api ---------------------------- */
const API_BASE = (location.port === '52178' || !/^127\.|^localhost/.test(location.hostname)) ? 'http://127.0.0.1:7793' : '';
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (S.token) headers['x-rakib-token'] = S.token;
  const r = await fetch(API_BASE + path, { ...opts, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || ('HTTP ' + r.status));
  return j;
}

/* ---------------------------- markdown ---------------------------- */
function inlineMd(t) {
  let s = esc(t);
  s = s.replace(/`([^`\n]+)`/g, (m, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, l, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${l}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}
function md(src) {
  const text = String(src || '');
  const out = [];
  const blocks = text.split(/```/);
  blocks.forEach((b, i) => {
    if (i % 2 === 1) {
      const nl = b.indexOf('\n');
      const lang = nl > -1 ? b.slice(0, nl).trim() : '';
      const code = nl > -1 ? b.slice(nl + 1) : b;
      out.push(`<pre><code data-lang="${esc(lang)}">${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return;
    }
    const lines = b.split('\n');
    let buf = [], list = null;
    const flush = () => {
      if (buf.length) { out.push(`<p>${buf.map(inlineMd).join('<br>')}</p>`); buf = []; }
      if (list) { out.push(`</${list}>`); list = null; }
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { flush(); continue; }
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); continue; }
      if (/^\s*([-*+])\s+/.test(line)) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(line.replace(/^\s*[-*+]\s+/, ''))}</li>`); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inlineMd(line.replace(/^\s*\d+\.\s+/, ''))}</li>`); continue; }
      if (/^>\s?/.test(line)) { flush(); out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      if (/^\|.*\|$/.test(line.trim())) { flush(); out.push(`<pre class="tbl">${esc(line)}</pre>`); continue; }
      if (/^---+$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
      buf.push(line);
    }
    flush();
  });
  return out.join('');
}

/* ---------------------------- shell ---------------------------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }

function setView(v) {
  S.view = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  $$('.nvi').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  const names = { chat: 'চ্যাট', agents: 'এজেন্ট', tasks: 'টাস্ক', media: 'ছবি স্টুডিও', cost: 'খরচ ও ব্যবহার', health: 'সিস্টেম হেলথ', security: 'নিরাপত্তা', settings: 'সেটিংস' };
  $('#crumb').textContent = names[v] || v;
  closeSide();
  if (v === 'agents') renderAgents();
  if (v === 'tasks') renderTasks();
  if (v === 'cost') renderCost();
  if (v === 'health') renderHealth();
  if (v === 'security') renderSecurity();
  if (v === 'settings') fillSettings();
}
$$('.nvi').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

const side = $('#side'), scrim = $('#scrim');
const openSide = () => { side.classList.add('open'); scrim.classList.add('on'); };
const closeSide = () => { side.classList.remove('open'); scrim.classList.remove('on'); };
$('#menuBtn').addEventListener('click', openSide);
$('#closeSide').addEventListener('click', closeSide);
scrim.addEventListener('click', closeSide);
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  store.set('theme', next);
});
document.documentElement.setAttribute('data-theme', store.get('theme', 'dark'));

/* ---------------------------- conversations ---------------------------- */
const activeConv = () => S.convs.find((c) => c.id === S.activeId) || null;
function saveConvs() { store.set('convs', S.convs.slice(0, 60)); store.set('active', S.activeId); }

function renderConvs() {
  $('#convList').innerHTML = S.convs.map((c) => `<div class="conv ${c.id === S.activeId ? 'active' : ''}" data-id="${c.id}">
    <span style="overflow:hidden;text-overflow:ellipsis">${esc(c.title || 'নতুন')}</span>
    <button class="x" data-del="${c.id}" title="মুছুন">✕</button></div>`).join('') || '<div style="padding:8px 10px;color:var(--txt3);font-size:12.5px">এখনো কোনো টাস্ক নেই</div>';
  $$('[data-id]', $('#convList')).forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.dataset.del) return;
    S.activeId = el.dataset.id; saveConvs(); renderConvs(); renderChat(); setView('chat');
  }));
  $$('[data-del]', $('#convList')).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    S.convs = S.convs.filter((c) => c.id !== b.dataset.del);
    if (S.activeId === b.dataset.del) S.activeId = null;
    saveConvs(); renderConvs(); renderChat();
  }));
}
$('#clearAll').addEventListener('click', () => {
  if (!S.convs.length) return;
  if (!confirm('সব চ্যাট মুছে ফেলবেন?')) return;
  S.convs = []; S.activeId = null; saveConvs(); renderConvs(); renderChat();
});
$('#newChat').addEventListener('click', () => {
  S.activeId = null; saveConvs(); renderConvs(); renderChat(); setView('chat');
  $('#input').value = ''; autoSize(); updateSend(); $('#input').focus();
});

/* ---------------------------- chat render ---------------------------- */
const SUGGESTIONS = [
  { t: 'সহজ হিসাব', d: '1834 × 27 ÷ 6 কত?', p: '1834*27/6 কত? ধাপে ধাপে দেখাও।' },
  { t: 'ওয়েব গবেষণা', d: 'ফ্রি AI মডেল ২০২৬', p: '২০২৬ সালে সবচেয়ে ভালো ফ্রি ওপেন-ওয়েট AI মডেলগুলো কী কী? সোর্সসহ বলো।' },
  { t: 'কোড লিখুন', d: 'স্যান্ডবক্সে চালিয়ে দেখাবে', p: 'একটা JavaScript ফাংশন লেখো যা একটি সংখ্যার সব ভাজক বের করে, আর run_js দিয়ে ৩৬-এ চালিয়ে দেখাও।' },
  { t: 'ছবি এডিট', d: 'মিডিয়া স্টুডিওতে যান', p: '', go: 'media' },
];

function renderChat() {
  const conv = activeConv();
  const thread = $('#thread');
  if (!conv) {
    thread.innerHTML = `<div class="hero">
      <div class="mark">${ICON.logo}</div>
      <h1>আজ কী করব?</h1>
      <p>RAKIB AI একটি মাল্টি-এজেন্ট সিস্টেম — গবেষণা, কোড, ডেটা, ছবি ও লেখার এজেন্ট একসাথে কাজ করে। সব মডেল ফ্রি; key না দিলেও এই কম্পিউটারের Ollama দিয়ে চলে।</p>
      <div class="cards">${SUGGESTIONS.map((s, i) => `<button class="hcard" data-s="${i}"><b>${esc(s.t)}</b><span>${esc(s.d)}</span></button>`).join('')}</div>
    </div>`;
    $$('.hcard', thread).forEach((c) => c.addEventListener('click', () => {
      const s = SUGGESTIONS[+c.dataset.s];
      if (s.go) return setView(s.go);
      $('#input').value = s.p; autoSize(); $('#input').focus(); updateSend();
    }));
    return;
  }
  thread.innerHTML = conv.messages.map((m, i) => {
    if (m.role === 'user') {
      const atts = (m.attachments || []).map((a) => a.kind === 'image'
        ? `<img src="${a.dataUrl}" alt="" style="max-width:min(300px,100%);border-radius:11px;margin-top:8px;display:block">`
        : `<div class="toolrun" style="margin-top:8px"><div style="padding:7px 11px;color:var(--txt2)">📎 ${esc(a.name)}</div></div>`).join('');
      return `<div class="msg user"><div class="bub">${m.content ? `<div class="body">${md(m.content)}</div>` : ''}${atts}
        <div class="acts"><button data-copy="${i}" title="কপি">${ICON.copy}</button></div></div></div>`;
    }
    if (m.error) {
      return `<div class="msg bot"><div class="av">${ICON.logo}</div><div class="bub">
        <div class="errbox"><span>⚠</span><div><b>উত্তর আসেনি</b>${esc(m.error)}</div></div>
        ${traceHtml(m.attempts)}
        <div class="acts"><button data-retry="${i}" title="আবার">${ICON.retry}</button></div></div></div>`;
    }
    const runs = (m.toolTrace || []).map(toolRunHtml).join('');
    return `<div class="msg bot"><div class="av">${ICON.logo}</div><div class="bub">
      <div class="who"><span>${esc(m.agentName || 'RAKIB AI')}</span>
        ${m.model ? `<span class="badge ok">${esc(m.model)}</span>` : ''}
        ${m.ms ? `<span class="badge">${(m.ms / 1000).toFixed(1)}s</span>` : ''}
        ${(m.trace || []).length > 1 ? `<span class="badge">${m.trace.length} ধাপ</span>` : ''}</div>
      <div class="body">${md(m.content)}</div>
      ${runs ? `<div class="tools-run">${runs}</div>` : ''}
      ${traceHtml(m.attempts)}
      <div class="acts"><button data-copy="${i}" title="কপি">${ICON.copy}</button><button data-retry="${i}" title="আবার">${ICON.retry}</button></div>
    </div></div>`;
  }).join('');
  wireChatActions(conv);
  scrollBottom();
}
function traceHtml(attempts) {
  const bad = (attempts || []).filter((a) => !a.ok);
  if (!bad.length) return '';
  return `<details class="toolrun" style="margin-top:8px"><summary>⚠ ${bad.length}টি মডেল ফেইল — ফলব্যাক হয়েছিল</summary>
    <div class="tcontent">${bad.map((a) => `${esc(a.label)} → ${a.status || 'err'}: ${esc(a.error || '')}${a.retry ? ' (স্কিপ)' : ''}`).join('\n')}</div></details>`;
}
function toolRunHtml(t) {
  if (t.tool === 'delegate') {
    return `<details class="toolrun"><summary>🤝 <b>${esc(t.agent)}</b> এজেন্টকে দেওয়া হলো ${t.ok ? '✓' : '✗'} ${t.model ? `· ${esc(t.model)}` : ''} ${t.ms ? `· ${(t.ms / 1000).toFixed(1)}s` : ''}</summary>
      <div class="tcontent">${esc(t.task || '')}</div></details>`;
  }
  const names = { calculator: '🧮 হিসাব', web_search: '🔎 ওয়েব সার্চ', fetch_url: '📄 পেজ পড়া', list_files: '📁 ফাইল তালিকা', read_file: '📖 ফাইল পড়া', write_file: '💾 ফাইল লেখা', image_ops: '🎨 ছবি এডিট', run_js: '⚙️ কোড চালানো', csv_stats: '📊 ডেটা বিশ্লেষণ' };
  const title = names[t.tool] || ('🔧 ' + t.tool);
  let detail = '';
  if (t.tool === 'web_search') detail = `${t.count || 0}টি ফলাফল · ${(t.results || []).map((r) => `${r.title}\n${r.url}`).join('\n\n')}`;
  else if (t.tool === 'calculator') detail = `${t.expression} = ${t.result}`;
  else if (t.tool === 'fetch_url') detail = `${t.title || ''}\n${t.url}\n${t.chars || 0} অক্ষর পড়া হয়েছে`;
  else if (t.tool === 'image_ops') detail = `${t.op} → ${t.output} (${t.width}×${t.height})\n${t.preview || ''}`;
  else if (t.tool === 'run_js') detail = `result: ${t.result}`;
  else if (t.tool === 'csv_stats') detail = `${t.rows} সারি, ${t.cols} কলাম`;
  else detail = JSON.stringify(t).slice(0, 400);
  const preview = t.preview ? `<img src="${esc(t.preview)}?t=${Date.now()}" alt="" style="max-width:220px;border-radius:9px;margin-top:8px">` : '';
  return `<details class="toolrun"><summary>${title} ${t.error ? '✗' : '✓'} <span style="color:var(--txt3)">${esc((t.query || t.url || t.path || t.output || '').toString().slice(0, 70))}</span></summary>
    <div class="tcontent">${esc(detail)}${preview}</div></details>`;
}
function wireChatActions(conv) {
  $$('[data-copy]', $('#thread')).forEach((b) => b.addEventListener('click', async () => {
    const m = conv.messages[+b.dataset.copy];
    try { await navigator.clipboard.writeText(m.content || ''); toast('কপি হয়েছে'); } catch { toast('কপি করা যায়নি'); }
  }));
  $$('[data-retry]', $('#thread')).forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.retry;
    conv.messages = conv.messages.slice(0, i);
    renderChat();
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) send(lastUser.content, lastUser.attachments || [], true);
  }));
}
function scrollBottom() { const t = $('#thread'); t.scrollTop = t.scrollHeight; }

/* ---------------------------- composer ---------------------------- */
function autoSize() { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(200, Math.max(28, t.scrollHeight)) + 'px'; }
function updateSend() {
  const has = $('#input').value.trim().length > 0 || S.attachments.length > 0;
  const b = $('#send');
  if (S.busy) { b.disabled = false; b.classList.add('stop'); b.innerHTML = ICON.stop; }
  else { b.disabled = !has; b.classList.remove('stop'); b.innerHTML = ICON.arrow; }
}
$('#input').addEventListener('input', () => { autoSize(); updateSend(); });
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!S.busy) send(); }
});
$('#send').addEventListener('click', () => { if (S.busy) S.abort?.abort(); else send(); });
$('#toolsBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#toolpop'); p.hidden = !p.hidden; if (!p.hidden) renderToolSwitches(); });
document.addEventListener('click', (e) => { if (!e.target.closest('#toolpop') && !e.target.closest('#toolsBtn')) $('#toolpop').hidden = true; });

function renderToolSwitches() {
  const on = S.server.settings?.tools || [];
  $('#toolSwitches').innerHTML = (S.server.tools || []).map((t) => {
    const active = on.includes(t.name);
    return `<button class="tswitch" data-tool="${esc(t.name)}" aria-pressed="${active}"><span>${active ? '✓' : '·'}</span>
      <span class="tt">${esc(t.name)}<small>${esc(t.description.slice(0, 70))}</small></span><span class="sw"></span></button>`;
  }).join('');
  $$('[data-tool]', $('#toolSwitches')).forEach((b) => b.addEventListener('click', async () => {
    const n = b.dataset.tool;
    const cur = S.server.settings.tools || [];
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
    S.server.settings.tools = next;
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ tools: next }) });
    renderToolSwitches();
  }));
}

/* attachments */
const MAX_ATTACH = 3;
function renderAttachments() {
  $('#attachbar').innerHTML = S.attachments.map((a, i) => `<div class="att">
    ${a.kind === 'image' ? `<img src="${a.dataUrl}" alt="">` : '📄'}
    <span>${esc(a.name)}</span><button class="ax" data-rm="${i}">✕</button></div>`).join('');
  $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { S.attachments.splice(+b.dataset.rm, 1); renderAttachments(); updateSend(); }));
}
const readDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function shrink(file, maxSide = 768, q = 0.82) {
  const url = await readDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function addFiles(files) {
  for (const f of [...files]) {
    if (S.attachments.length >= MAX_ATTACH) { toast(`সর্বোচ্চ ${MAX_ATTACH}টি`); break; }
    if (f.size > 20 * 1024 * 1024) { toast(`${f.name} — ২০MB এর কম দিন`); continue; }
    try {
      if (f.type.startsWith('image/')) {
        const dataUrl = await shrink(f);
        S.attachments.push({ kind: 'image', name: f.name, dataUrl });
      } else {
        const dataUrl = await readDataUrl(f);
        const up = await api('/api/upload', { method: 'POST', body: JSON.stringify({ name: f.name, data: dataUrl }) });
        S.attachments.push({ kind: 'file', name: up.name, path: up.path, text: up.text || '' });
      }
      renderAttachments(); updateSend();
    } catch (e) { toast(`${f.name}: ${e.message}`); }
  }
}
$('#pickFile').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
document.addEventListener('paste', (e) => {
  const fs = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
  if (fs.length) { e.preventDefault(); addFiles(fs); }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) addFiles(fs); });

/* ---------------------------- send ---------------------------- */
async function send(textOverride, attachmentsOverride, isRetry = false) {
  if (S.busy) return;
  const text = (textOverride ?? $('#input').value).trim();
  const atts = attachmentsOverride ?? S.attachments;
  if (!text && !atts.length) return;

  if (!activeConv()) {
    S.convs.unshift({ id: uid(), title: (text || atts[0]?.name || 'নতুন').slice(0, 60), messages: [] });
    S.activeId = S.convs[0].id;
  }
  const conv = activeConv();
  if (!isRetry) {
    conv.messages.push({ role: 'user', content: text, attachments: atts.map((a) => ({ ...a })) });
    $('#input').value = ''; autoSize(); S.attachments = []; renderAttachments();
  }
  saveConvs(); renderConvs(); renderChat();

  const images = atts.filter((a) => a.kind === 'image').map((a) => a.dataUrl);
  const fileNote = atts.filter((a) => a.kind === 'file').map((a) => `[সংযুক্ত ফাইল: ${a.path}${a.text ? '\n---\n' + a.text.slice(0, 4000) : ''}]`).join('\n\n');
  const fullText = fileNote ? `${text}\n\n${fileNote}` : text;

  S.busy = true; updateSend();
  const thread = $('#thread');
  const thinking = document.createElement('div');
  thinking.className = 'msg bot';
  thinking.innerHTML = `<div class="av">${ICON.logo}</div><div class="bub"><div class="typing"><i></i><i></i><i></i></div><div class="who" style="margin-top:6px">এজেন্ট কাজ করছে… (লোকাল মডেলে প্রথমবার ২০-৪০ সেকেন্ড লাগতে পারে)</div></div>`;
  thread.appendChild(thinking); scrollBottom();

  const ctrl = new AbortController(); S.abort = ctrl;
  const started = Date.now();
  try {
    const j = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        text: fullText,
        images,
        history: conv.messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.error)).map((m) => ({ role: m.role, content: m.content || '' })),
        plan: $('#planChk').checked,
      }),
      signal: ctrl.signal,
    });
    conv.messages.push(j.ok
      ? { role: 'assistant', content: j.content, model: j.usedModel?.label, ms: j.ms || (Date.now() - started), agentName: j.agentName, toolTrace: j.toolTrace, attempts: j.attempts, trace: j.trace }
      : { role: 'assistant', content: '', error: j.message || 'কিছু ভুল হয়েছে', attempts: j.attempts });
  } catch (e) {
    conv.messages.push({ role: 'assistant', content: '', error: e.name === 'AbortError' ? 'আপনি থামিয়ে দিয়েছেন।' : ('সার্ভারে পৌঁছানো যায়নি — ' + e.message) });
  } finally {
    S.busy = false; S.abort = null;
    saveConvs(); updateSend(); renderChat(); refresh();
  }
}

/* ---------------------------- views ---------------------------- */
function renderAgents() {
  const statusMap = { ready: ['ok', 'চালু'], partial: ['warn', 'আংশিক'], blocked: ['bad', 'এখনো নয়'], planned: ['warn', 'পরিকল্পিত'] };
  $('#agentGrid').innerHTML = (S.server.agents || []).map((a) => {
    const [cls, label] = statusMap[a.status] || ['warn', a.status];
    return `<div class="acard ${a.status === 'blocked' ? 'blocked' : ''}">
      <h3>${esc(a.name)} <span class="tag ${cls}">${label}</span></h3>
      <div class="bn">${esc(a.bn)}</div>
      <p>${esc(a.role)}</p>
      ${a.blocker ? `<div class="why">⛔ ${esc(a.blocker)}</div>` : ''}
      <div class="tg">${(a.tools || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="tag">টুল নেই</span>'}</div>
      <div class="ev">প্রমাণ: ${esc(a.evidence || '—')}</div>
      ${a.status === 'ready' ? `<button class="btn" style="margin-top:10px" data-ask="${esc(a.id)}">এই এজেন্টকে কাজ দিন</button>` : ''}
    </div>`;
  }).join('');
  $$('[data-ask]').forEach((b) => b.addEventListener('click', () => {
    setView('chat');
    $('#input').value = ''; $('#input').focus();
    toast('এজেন্ট: ' + b.dataset.ask + ' — প্রশ্ন লিখুন');
  }));
}

function renderTasks() {
  const rows = S.server.tasks || [];
  if (!rows.length) { $('#taskTable').innerHTML = '<div style="color:var(--txt3);font-size:13px">এখনো কোনো টাস্ক নেই।</div>'; return; }
  $('#taskTable').innerHTML = `<table class="t"><thead><tr><th>সময়</th><th>এজেন্ট</th><th>কাজ</th><th>মডেল</th><th>টুল</th><th>সময়</th><th>ফল</th></tr></thead><tbody>
    ${rows.map((t) => `<tr>
      <td style="white-space:nowrap;color:var(--txt3)">${new Date(t.at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(t.agentName || t.agent)}</td>
      <td>${esc((t.prompt || '').slice(0, 80))}</td>
      <td style="font-size:12px">${esc(t.model || '—')}</td>
      <td style="font-size:12px">${esc((t.tools || []).join(', ') || '—')}</td>
      <td style="white-space:nowrap">${t.ms ? (t.ms / 1000).toFixed(1) + 's' : '—'}</td>
      <td><span class="tag ${t.ok ? 'ok' : 'bad'}">${t.ok ? '✓' : '✗'}</span></td></tr>`).join('')}
  </tbody></table>`;
}

function renderCost() {
  const u = S.server.usage || {};
  const byModel = S.server.usageByModel || {};
  const byDay = S.server.usageByDay || {};
  $('#costKpis').innerHTML = `
    <div class="kpi"><b>${u.calls || 0}</b><span>মোট কল</span></div>
    <div class="kpi"><b>${((u.inTok || 0) + (u.outTok || 0)).toLocaleString('en-US')}</b><span>টোকেন (ইন + আউট)</span></div>
    <div class="kpi"><b>৳০</b><span>বাস্তব খরচ</span></div>
    <div class="kpi"><b>$${(u.avoidedUsd || 0).toFixed(4)}</b><span>paid মডেলে হলে লাগত (রেফারেন্স)</span></div>`;
  const row = (k, v) => `<tr><td>${esc(k)}</td><td>${v.calls}</td><td>${(v.inTok + v.outTok).toLocaleString('en-US')}</td><td>${(v.ms / Math.max(1, v.calls) / 1000).toFixed(1)}s</td><td>$${(v.avoidedUsd || 0).toFixed(4)}</td></tr>`;
  const head = '<table class="t"><thead><tr><th>নাম</th><th>কল</th><th>টোকেন</th><th>গড় সময়</th><th>সেভ</th></tr></thead><tbody>';
  $('#costModels').innerHTML = head + Object.entries(byModel).map(([k, v]) => row(k, v)).join('') + '</tbody></table>';
  $('#costDays').innerHTML = head + Object.entries(byDay).slice(-14).map(([k, v]) => row(k, v)).join('') + '</tbody></table>';
}

function renderHealth() {
  const h = S.server.health || {};
  const oll = h.ollama || {};
  const badge = (ok, t) => `<span class="tag ${ok ? 'ok' : 'bad'}">${t}</span>`;
  $('#healthCard').innerHTML = `<table class="t"><tbody>
    <tr><td><b>Ollama (এই কম্পিউটার)</b></td><td>${badge(oll.up, oll.up ? `চালু · ${oll.models}টি মডেল` : 'বন্ধ')}</td><td style="color:var(--txt3)">${(oll.names || []).join(', ') || '—'}</td></tr>
    <tr><td><b>OpenRouter</b></td><td>${badge(h.openrouter?.key, h.openrouter?.key ? 'key আছে' : 'key নেই')}</td><td style="color:var(--txt3)">ফ্রি key দিলে ১২টি ফ্রি মডেল পাওয়া যাবে</td></tr>
    <tr><td><b>Groq</b></td><td>${badge(h.groq?.key, h.groq?.key ? 'key আছে' : 'key নেই')}</td><td style="color:var(--txt3)">দ্রুততম ফ্রি টিয়ার</td></tr>
  </tbody></table>
  <button class="btn" id="probeBtn" style="margin-top:12px">আবার পরীক্ষা করুন</button>
  <div class="msgline" id="probeMsg"></div>`;
  $('#probeBtn').addEventListener('click', async () => {
    $('#probeMsg').textContent = 'পরীক্ষা চলছে…';
    const j = await api('/api/health', { method: 'POST' });
    S.server.health = j.health; renderHealth(); toast('হেলথ আপডেট হয়েছে');
  });
  $('#modelTable').innerHTML = `<table class="t"><thead><tr><th>মডেল</th><th>প্রোভাইডার</th><th>Context</th><th>ইনপুট</th><th>টুল</th><th>অবস্থা</th></tr></thead><tbody>
    ${(S.server.models || []).map((m) => `<tr><td>${esc(m.label)}</td><td>${esc(m.provider)}</td><td>${(m.ctx || 0).toLocaleString('en-US')}</td>
      <td style="font-size:12px">${(m.inp || []).join('+')}</td><td>${m.tools ? '✓' : '—'}</td>
      <td>${m.hasKey === false ? '<span class="tag">key নেই</span>' : m.cooldown > 0 ? `<span class="tag warn">${m.cooldown}s বন্ধ</span>` : '<span class="tag ok">পাওয়া যাচ্ছে</span>'}</td></tr>`).join('')}
  </tbody></table>`;
}

async function renderSecurity() {
  const j = await api('/api/audit?n=60').catch(() => ({ events: [] }));
  $('#secCard').innerHTML = `<table class="t"><tbody>
    <tr><td>অ্যাক্সেস টোকেন</td><td><span class="tag ok">চালু</span></td><td style="color:var(--txt3);font-family:var(--mono);font-size:11.5px">${esc((S.token || '').slice(0, 8))}…</td></tr>
    <tr><td>ফাইল স্যান্ডবক্স</td><td><span class="tag ok">workspace/ এর ভিতরে</span></td><td style="color:var(--txt3)">../ বা absolute path ব্লকড</td></tr>
    <tr><td>কোড স্যান্ডবক্স</td><td><span class="tag ok">vm, ২ সেকেন্ড</span></td><td style="color:var(--txt3)">require/fs/network বন্ধ</td></tr>
    <tr><td>Secret রিডাকশন</td><td><span class="tag ok">চালু</span></td><td style="color:var(--txt3)">লগে key ঢেকে যায়</td></tr>
    <tr><td>রেট লিমিট</td><td><span class="tag ok">১২০/মিনিট</span></td><td style="color:var(--txt3)">প্রতি IP</td></tr>
    <tr><td>paid মডেল</td><td><span class="tag ok">কখনো ব্যবহার হয় না</span></td><td style="color:var(--txt3)">শুধু :free তালিকা</td></tr>
  </tbody></table>`;
  $('#auditLog').innerHTML = `<table class="t"><thead><tr><th>সময়</th><th>ঘটনা</th><th>বিস্তারিত</th></tr></thead><tbody>
    ${(j.events || []).map((e) => `<tr><td style="white-space:nowrap;color:var(--txt3)">${new Date(e.ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(e.event)}</td><td style="font-family:var(--mono);font-size:11.5px;color:var(--txt2)">${esc(JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['ts', 'event'].includes(k)))).slice(0, 200))}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--txt3)">কোনো ঘটনা নেই</td></tr>'}
  </tbody></table>`;
}

function fillSettings() {
  const st = S.server.settings || {};
  $('#setMode').value = st.mode || 'auto';
  $('#setTemp').value = st.temperature ?? 0.7; $('#setTempV').textContent = st.temperature ?? 0.7;
  $('#setTok').value = st.max_tokens ?? 2048;
  $('#setSystem').value = st.system || '';
  $('#setPinned').innerHTML = '<option value="">— অটো —</option>' + (S.server.models || []).map((m) => `<option value="${esc(m.provider + ':' + m.id)}" ${st.pinned === m.provider + ':' + m.id ? 'selected' : ''}>${esc(m.label)} · ${esc(m.provider)}</option>`).join('');
  $('#setTools').innerHTML = (S.server.tools || []).map((t) => `<label class="tg2"><input type="checkbox" data-t="${esc(t.name)}" ${(st.tools || []).includes(t.name) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('');
  for (const p of S.server.providers || []) {
    const el = $('#k_' + p.id);
    if (el) el.placeholder = p.hasKey ? `সেভ আছে: ${p.masked}` : el.placeholder;
  }
}
$('#setTemp').addEventListener('input', (e) => { $('#setTempV').textContent = e.target.value; });
$('#saveKeys').addEventListener('click', async () => {
  const body = {};
  const g = $('#k_groq').value.trim(), o = $('#k_openrouter').value.trim();
  if (g) body.GROQ_API_KEY = g;
  if (o) body.OPENROUTER_API_KEY = o;
  if (!Object.keys(body).length) { $('#keyMsg').textContent = 'কিছু লেখা হয়নি'; return; }
  try {
    await api('/api/keys', { method: 'POST', body: JSON.stringify(body) });
    $('#k_groq').value = ''; $('#k_openrouter').value = '';
    $('#keyMsg').textContent = '✓ সেভ হয়েছে';
    await refresh();
  } catch (e) { $('#keyMsg').textContent = 'ব্যর্থ: ' + e.message; }
});
$('#saveSettings').addEventListener('click', async () => {
  const tools = $$('#setTools input').filter((i) => i.checked).map((i) => i.dataset.t);
  const patch = {
    mode: $('#setMode').value,
    pinned: $('#setPinned').value || null,
    temperature: parseFloat($('#setTemp').value) || 0.7,
    max_tokens: Math.max(256, parseInt($('#setTok').value, 10) || 2048),
    system: $('#setSystem').value,
    tools,
  };
  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    $('#setMsg').textContent = '✓ সেভ হয়েছে';
    await refresh();
  } catch (e) { $('#setMsg').textContent = 'ব্যর্থ: ' + e.message; }
});

/* media studio */
$('#imgRun').addEventListener('click', async () => {
  const f = $('#imgFile').files[0];
  if (!f) return toast('আগে একটি PNG দিন');
  const dataUrl = await readDataUrl(f);
  const up = await api('/api/upload', { method: 'POST', body: JSON.stringify({ name: f.name, data: dataUrl }) });
  const op = $('#imgOp').value;
  const out = 'images/' + op + '-' + Date.now().toString(36) + '.png';
  const body = { input: up.path, op, output: out };
  const w = parseInt($('#imgW').value, 10), h = parseInt($('#imgH').value, 10), a = parseInt($('#imgAmt').value, 10);
  if (w) body.width = w;
  if (h) body.height = h;
  if (a) body.amount = a;
  if ($('#imgText').value.trim()) body.text = $('#imgText').value.trim();
  $('#imgMsg').textContent = 'চালানো হচ্ছে…';
  try {
    const j = await api('/api/image', { method: 'POST', body: JSON.stringify(body) });
    $('#imgMsg').textContent = j.text;
    $('#imgOut').innerHTML = j.preview ? `<img src="${j.preview}?t=${Date.now()}" alt="">` : esc(j.text);
    refresh();
  } catch (e) { $('#imgMsg').textContent = 'ব্যর্থ: ' + e.message; }
});

/* ---------------------------- refresh ---------------------------- */
/* পর্দার আকার অনুযায়ী প্যানেল খোলা/বন্ধ */
function applyViewport() {
  const wide = window.innerWidth > 900;
  document.documentElement.classList.toggle('is-mobile', !wide);
  const th = document.querySelector('.table-wrap');
  if (th) th.classList.toggle('scrollable', !wide);
}
window.addEventListener('resize', applyViewport);

async function refresh() {
  try {
    const j = await api('/api/state?probe=0');
    S.token = j.token || S.token;
    S.server = { ...S.server, ...j };
    const up = (j.providers || []).filter((p) => p.hasKey).length;
    const dot = $('#statusDot');
    dot.classList.toggle('on', up > 0);
    dot.classList.toggle('off', up === 0);
    $('#statusText').textContent = j.health?.ollama?.up
      ? `Ollama চালু · ${j.health.ollama.models}টি মডেল${j.providers.some((p) => !p.local && p.hasKey) ? ' · key আছে' : ''}`
      : (up ? 'key দিয়ে চলছে' : 'কোনো মডেল নেই');
    const auto = (j.settings?.mode || 'auto') === 'auto';
    $('#modelPillText').textContent = auto ? 'অটো (ফ্রি)' : ((j.models || []).find((m) => m.provider + ':' + m.id === j.settings.pinned)?.label || 'পিন করা');
    $('#composerHint').textContent = j.health?.ollama?.up ? 'লোকাল মডেল · key ছাড়া' : (up ? 'ফ্রি key · অটো ফলব্যাক' : 'Settings-এ key দিন বা Ollama চালু করুন');
    if (S.view === 'agents') renderAgents();
    if (S.view === 'tasks') renderTasks();
    if (S.view === 'cost') renderCost();
    if (S.view === 'health') renderHealth();
  } catch (e) {
    $('#statusDot').className = 'dot off';
    $('#statusText').textContent = 'সার্ভারে পৌঁছানো যাচ্ছে না';
  }
}
$('#statusBtn').addEventListener('click', () => setView('settings'));

/* ---------------------------- boot ---------------------------- */
applyViewport();
autoSize(); updateSend(); renderConvs(); renderChat();
refresh().then(() => {
  if (location.hash === '#media') setView('media');
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

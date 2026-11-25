/* =========================================================================
   RAKIB AI — Control Center  (Phase 6 of recovery)
   ১০টি সেকশন: ড্যাশবোর্ড · এজেন্ট · মডেল প্রোভাইডার · API ও ক্রেডেনশিয়াল ·
   টাস্ক · এক্সিকিউশন হিস্ট্রি · অনুমোদন · টুলস · লগস · সেটিংস
   নীতি: ব্যবহারযোগ্যতা ও দৃশ্যমানতা আগে, সাজসজ্জা পরে।
   ========================================================================= */
'use strict';

const { PORT } = require('../lib/config');

/* লোকাল হলে খালি base (একই সার্ভার), প্রিভিউ হলে 7788 */
const API_BASE = '';

function page() {
  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>RAKIB AI — Control Center</title>
<meta name="theme-color" content="#0b0d10" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<meta name="mobile-web-app-capable" content="yes" />
<style>
:root{
  --bg:#0b0d10; --panel:#12161c; --panel2:#171c24; --line:#242c38; --line2:#2f3947;
  --txt:#e7ecf3; --dim:#9aa7b8; --dim2:#6b7787;
  --acc:#3d8bfd; --acc2:#1d6fe0; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; --info:#38bdf8;
  --r:10px; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{background:var(--bg);color:var(--txt);font:14px/1.55 system-ui,-apple-system,"Segoe UI","Noto Sans Bengali",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--info);text-decoration:none}
button{font:inherit;cursor:pointer}
input,textarea,select{font:inherit;color:var(--txt);background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:9px 11px;width:100%}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--acc)}
textarea{resize:vertical;min-height:70px;font-family:inherit}
label{display:block;font-size:12px;color:var(--dim);margin:0 0 4px;font-weight:600}
.field{margin-bottom:12px}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>*{flex:1;min-width:140px}

/* ---------- layout ---------- */
#app{display:flex;min-height:100vh}
#side{width:236px;flex:0 0 236px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
.brand{padding:16px 16px 10px;font-weight:700;letter-spacing:.3px}
.brand small{display:block;font-weight:400;color:var(--dim2);font-size:11px;margin-top:2px}
#nav{display:flex;flex-direction:column;gap:2px;padding:8px}
#nav button{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--dim);padding:9px 11px;border-radius:8px;text-align:left;font-size:13.5px}
#nav button:hover{background:var(--panel2);color:var(--txt)}
#nav button.on{background:rgba(61,139,253,.14);color:#cfe2ff;font-weight:600}
#nav .ico{width:18px;text-align:center;flex:0 0 18px}
.sidefoot{margin-top:auto;padding:10px 14px 16px;font-size:11px;color:var(--dim2);border-top:1px solid var(--line)}
#main{flex:1;min-width:0;display:flex;flex-direction:column}
#top{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--line);background:rgba(18,22,28,.92);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}
#top h1{font-size:15px;margin:0;font-weight:650}
#top .sp{flex:1}
#view{padding:16px;flex:1;min-width:0}
.wrap{max-width:1080px;margin:0 auto}

/* ---------- bits ---------- */
.btn{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:600}
.btn:hover{background:var(--acc2)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.ghost{background:transparent;border:1px solid var(--line2);color:var(--txt);font-weight:500}
.btn.ghost:hover{background:var(--panel2)}
.btn.danger{background:var(--bad)}
.btn.ok{background:var(--ok)}
.btn.sm{padding:6px 10px;font-size:12.5px;border-radius:7px}
.chip{display:inline-flex;align-items:center;gap:5px;background:var(--panel2);border:1px solid var(--line2);color:var(--dim);border-radius:999px;padding:2px 9px;font-size:11.5px;white-space:nowrap}
.chip.ok{color:#8ff0b3;border-color:#1e6b3e;background:rgba(34,197,94,.12)}
.chip.bad{color:#ffb4b4;border-color:#7f2b2b;background:rgba(239,68,68,.12)}
.chip.warn{color:#ffd79a;border-color:#7a5320;background:rgba(245,158,11,.12)}
.chip.info{color:#a9e2ff;border-color:#1f5f7a;background:rgba(56,189,248,.12)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px;margin-bottom:12px}
.card h3{margin:0 0 10px;font-size:14px}
.muted{color:var(--dim);font-size:12.5px}
.mono{font-family:var(--mono);font-size:12px}
.grid{display:grid;gap:12px}
@media(min-width:760px){.grid.c2{grid-template-columns:1fr 1fr}.grid.c3{grid-template-columns:repeat(3,1fr)}}
.empty{padding:22px;text-align:center;color:var(--dim2);border:1px dashed var(--line2);border-radius:var(--r)}
.spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
.hide{display:none!important}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
th{color:var(--dim2);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px}

/* ---------- chat ---------- */
#thread{display:flex;flex-direction:column;gap:10px;padding-bottom:10px}
.msg{max-width:min(760px,92%);padding:10px 13px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;font-size:13.5px}
.msg.me{align-self:flex-end;background:var(--acc);color:#fff;border-bottom-right-radius:4px}
.msg.ai{align-self:flex-start;background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:4px}
.msg.err{align-self:flex-start;background:rgba(239,68,68,.1);border:1px solid #7f2b2b;color:#ffc9c9}
.msg .meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;font-size:11px;color:var(--dim2)}
#composer{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(11,13,16,0),var(--bg) 30%);padding:10px 0 4px}
#composer .box{display:flex;gap:8px;align-items:flex-end;background:var(--panel);border:1px solid var(--line2);border-radius:12px;padding:8px}
#composer textarea{background:transparent;border:0;min-height:44px;max-height:180px;padding:6px 4px}
#composer textarea:focus{border:0}
.prog{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dim);padding:4px 2px}
.bar{height:3px;background:var(--line);border-radius:2px;overflow:hidden;flex:1}
.bar i{display:block;height:100%;background:var(--acc);width:0;transition:width .3s}

/* ---------- timeline ---------- */
.tl{border-left:2px solid var(--line2);margin-left:8px;padding-left:14px}
.tl .ev{position:relative;padding:5px 0;font-size:12.5px}
.tl .ev:before{content:'';position:absolute;left:-19px;top:11px;width:8px;height:8px;border-radius:50%;background:var(--line2)}
.tl .ev.ok:before{background:var(--ok)}
.tl .ev.bad:before{background:var(--bad)}
.tl .ev .t{color:var(--dim2);font-size:11px;margin-right:6px;font-family:var(--mono)}

/* ---------- mobile ---------- */
#mBtn{display:none}
@media(max-width:820px){
  #side{position:fixed;left:0;top:0;z-index:60;transform:translateX(-100%);transition:transform .2s;box-shadow:0 0 40px rgba(0,0,0,.6)}
  #side.open{transform:none}
  #mBtn{display:inline-flex}
  #view{padding:12px}
  .msg{max-width:96%}
}
#scrim{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50}
#scrim.on{display:block}
</style>
</head>
<body>
<div id="app">
  <aside id="side">
    <div class="brand">RAKIB AI<small>Control Center</small></div>
    <nav id="nav">
      <button data-v="dash"><span class="ico">◉</span> ড্যাশবোর্ড</button>
      <button data-v="chat"><span class="ico">💬</span> টাস্ক চ্যাট</button>
      <button data-v="agents"><span class="ico">🤖</span> এজেন্ট</button>
      <button data-v="providers"><span class="ico">🧩</span> মডেল প্রোভাইডার</button>
      <button data-v="creds"><span class="ico">🔑</span> API ও ক্রেডেনশিয়াল</button>
      <button data-v="tasks"><span class="ico">📋</span> টাস্ক</button>
      <button data-v="history"><span class="ico">🕘</span> এক্সিকিউশন হিস্ট্রি</button>
      <button data-v="approvals"><span class="ico">✅</span> অনুমোদন</button>
      <button data-v="tools"><span class="ico">🛠️</span> টুলস</button>
      <button data-v="logs"><span class="ico">📜</span> লগস</button>
      <button data-v="settings"><span class="ico">⚙️</span> সেটিংস</button>
    </nav>
    <div class="sidefoot" id="foot">—</div>
  </aside>
  <div id="scrim"></div>
  <main id="main">
    <header id="top">
      <button class="btn ghost sm" id="mBtn">☰</button>
      <h1 id="title">ড্যাশবোর্ড</h1>
      <span class="sp"></span>
      <span class="chip" id="healthChip">—</span>
      <button class="btn ghost sm" id="refreshBtn" title="রিফ্রেশ">⟳</button>
    </header>
    <section id="view"><div class="wrap" id="wrap"></div></section>
  </main>
</div>
<script>
'use strict';
const API = '';
let TOKEN = '';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bn = (n) => String(n).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const ago = (iso) => { if (!iso) return '—'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return Math.round(s) + 's আগে'; if (s < 3600) return Math.round(s / 60) + 'মি আগে'; if (s < 86400) return Math.round(s / 3600) + 'ঘ আগে'; return Math.round(s / 86400) + 'দিন আগে'; };
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-rakib-token': TOKEN, ...(opts.headers || {}) },
  });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok && !j.message) j.message = 'HTTP ' + r.status;
  return j;
}
let toastT;
function toast(msg, kind) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1c232c;border:1px solid #2f3947;color:#e7ecf3;padding:10px 16px;border-radius:10px;z-index:200;font-size:13px;max-width:90vw;box-shadow:0 8px 30px rgba(0,0,0,.5)'; document.body.appendChild(el); }
  el.textContent = msg; el.style.borderColor = kind === 'bad' ? '#7f2b2b' : kind === 'ok' ? '#1e6b3e' : '#2f3947'; el.style.display = 'block';
  clearTimeout(toastT); toastT = setTimeout(() => { el.style.display = 'none'; }, 3200);
}

/* ------------------------------ boot ------------------------------ */
async function boot() {
  try {
    const st = await (await fetch(API + '/api/state?probe=1')).json();
    TOKEN = st.token || '';
    window.__state = st;
    $('#foot').textContent = 'v' + (st.version || '') + ' · ' + (st.agents || []).length + ' এজেন্ট';
    paintHealth(st);
  } catch (e) { toast('সার্ভারের সঙ্গে সংযোগ নেই: ' + e.message, 'bad'); }
  const v = (location.hash || '#dash').slice(1);
  go(v);
  setInterval(async () => {
    try { const st = await (await fetch(API + '/api/state?probe=0')).json(); TOKEN = st.token || TOKEN; window.__state = st; paintHealth(st); } catch {}
  }, 20000);
}
function paintHealth(st) {
  const up = st.health?.ollama?.up;
  const c = $('#healthChip');
  c.className = 'chip ' + (up ? 'ok' : 'bad');
  c.textContent = up ? 'Ollama চালু' : 'Ollama বন্ধ';
  c.title = up ? (st.health.ollama.models + ' মডেল') : 'এই মেশিনে Ollama চলছে না';
}

const TITLES = { dash: 'ড্যাশবোর্ড', chat: 'টাস্ক চ্যাট', agents: 'এজেন্ট', providers: 'মডেল প্রোভাইডার', creds: 'API ও ক্রেডেনশিয়াল', tasks: 'টাস্ক', history: 'এক্সিকিউশন হিস্ট্রি', approvals: 'অনুমোদন', tools: 'টুলস', logs: 'লগস', settings: 'সেটিংস' };
const RENDER = {};
let CURRENT = 'dash';
async function go(v) {
  if (!RENDER[v]) v = 'dash';
  CURRENT = v;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $('#title').textContent = TITLES[v] || v;
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  $('#side').classList.remove('open'); $('#scrim').classList.remove('on');
  const w = $('#wrap');
  w.innerHTML = '<div class="empty">লোড হচ্ছে…</div>';
  try { await RENDER[v](w); } catch (e) { w.innerHTML = '<div class="card"><b>ত্রুটি:</b> ' + esc(e.message) + '</div>'; }
}
document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => go(b.dataset.v));
$('#mBtn').onclick = () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('on', $('#side').classList.contains('open')); };
$('#scrim').onclick = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); };
$('#refreshBtn').onclick = () => go(CURRENT);

/* ============================== ড্যাশবোর্ড ============================== */
RENDER.dash = async (w) => {
  const [st, mg, ag, tk] = await Promise.all([
    fetch(API + '/api/state?probe=0').then((r) => r.json()),
    api('/api/mgmt/providers'),
    api('/api/mgmt/agents'),
    api('/api/tasks'),
  ]);
  const provs = mg.providers || [], mods = mg.models || [], agents = ag.agents || [], tasks = tk.tasks || [];
  const withKey = provs.filter((p) => p.hasKey || p.type === 'ollama').length;
  const def = mods.find((m) => m.id === mg.defaultModel);
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  w.innerHTML = \`
  <div class="grid c3">
    <div class="card"><div class="muted">প্রোভাইডার</div><div style="font-size:26px;font-weight:700">\${bn(provs.length)}</div><div class="muted">\${bn(withKey)}টির কী/এন্ডপয়েন্ট প্রস্তুত</div></div>
    <div class="card"><div class="muted">মডেল</div><div style="font-size:26px;font-weight:700">\${bn(mods.length)}</div><div class="muted">ডিফল্ট: <b>\${esc(def ? def.label : 'নেই')}</b></div></div>
    <div class="card"><div class="muted">এজেন্ট</div><div style="font-size:26px;font-weight:700">\${bn(agents.filter((a) => a.enabled).length)}<span class="muted" style="font-size:13px">/\${bn(agents.length)}</span></div><div class="muted">সক্রিয় / মোট</div></div>
  </div>
  <div class="grid c3">
    <div class="card"><div class="muted">টাস্ক</div><div style="font-size:26px;font-weight:700">\${bn(tasks.length)}</div><div class="muted">সফল \${bn(done)} · ব্যর্থ \${bn(failed)}</div></div>
    <div class="card"><div class="muted">Ollama</div><div style="font-size:26px;font-weight:700">\${st.health?.ollama?.up ? '✅' : '❌'}</div><div class="muted">\${esc(st.health?.ollama?.up ? st.health.ollama.models + ' মডেল পাওয়া গেছে' : 'চালু করুন: ollama serve')}</div></div>
    <div class="card"><div class="muted">সংস্করণ</div><div style="font-size:26px;font-weight:700">v\${esc(st.version || '')}</div><div class="muted">পোর্ট \${esc(st.version || '')}</div></div>
  </div>
  <div class="card"><h3>দ্রুত শুরু</h3>
    <div class="row">
      <button class="btn" onclick="go('chat')">নতুন টাস্ক</button>
      <button class="btn ghost" onclick="go('agents')">এজেন্ট তৈরি</button>
      <button class="btn ghost" onclick="go('providers')">প্রোভাইডার যোগ</button>
      <button class="btn ghost" onclick="go('creds')">API কী সেট</button>
    </div>
    <p class="muted" style="margin:12px 0 0">টিপস: লোকাল <b>qwen3.5:4b</b> মডেলে প্রথম উত্তর <b>৩০–৮০ সেকেন্ড</b> নেয়। চ্যাটে কাউন্টডাউন দেখানো হয়, অপেক্ষা করুন।</p>
  </div>
  \${tasks.length ? '<div class="card"><h3>সাম্প্রতিক টাস্ক</h3>' + tasks.slice(0, 6).map((t) => '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><span class="chip ' + (t.status === 'done' ? 'ok' : t.status === 'error' ? 'bad' : 'warn') + '">' + esc(t.status) + '</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.text) + '</span><span class="muted">' + ago(t.at) + '</span></div>').join('') + '</div>' : ''}\`;
};

/* ============================== চ্যাট ============================== */
const chatState = { messages: [], agent: '', busy: false };
RENDER.chat = async (w) => {
  const ag = await api('/api/mgmt/agents');
  const agents = (ag.agents || []).filter((a) => a.enabled);
  w.innerHTML = \`
  <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <label style="margin:0">এজেন্ট</label>
    <select id="agSel" style="flex:1;min-width:180px;max-width:340px">
      <option value="">স্বয়ংক্রিয় (মেসেজ দেখে বেছে নেবে)</option>
      \${agents.map((a) => '<option value="' + a.id + '">' + esc(a.name) + ' — ' + esc(a.modelLabel) + '</option>').join('')}
    </select>
    <span class="chip info" id="chatHint">প্রস্তুত</span>
  </div>
  <div id="thread"></div>
  <div id="composer"><div class="prog hide" id="prog"><span class="spin"></span><span id="progTxt">এজেন্ট কাজ শুরু করেছে…</span><div class="bar"><i id="progBar"></i></div><button class="btn ghost sm" id="stopBtn">থামাও</button></div>
    <div class="box"><textarea id="inp" rows="1" placeholder="বাংলায় লিখুন… (Enter = পাঠান, Shift+Enter = নতুন লাইন)"></textarea><button class="btn" id="sendBtn">পাঠান</button></div>
  </div>\`;
  const draw = () => {
    $('#thread').innerHTML = chatState.messages.map((m) => m.role === 'me'
      ? '<div class="msg me">' + esc(m.text) + '</div>'
      : m.role === 'err' ? '<div class="msg err">' + esc(m.text) + '</div>'
      : '<div class="msg ai">' + esc(m.text) + '<div class="meta">' + (m.meta || []).map((x) => '<span class="chip">' + esc(x) + '</span>').join('') + '</div></div>').join('');
    window.scrollTo(0, document.body.scrollHeight);
  };
  draw();
  const inp = $('#inp');
  inp.oninput = () => { inp.style.height = 'auto'; inp.style.height = Math.min(180, inp.scrollHeight) + 'px'; };
  inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $('#sendBtn').onclick = send;
  $('#agSel').onchange = (e) => { chatState.agent = e.target.value; $('#chatHint').textContent = e.target.value ? 'নির্দিষ্ট এজেন্ট' : 'স্বয়ংক্রিয়'; };
  let curTask = null;
  async function send() {
    const text = inp.value.trim();
    if (!text || chatState.busy) return;
    inp.value = ''; inp.style.height = 'auto';
    chatState.messages.push({ role: 'me', text }); draw();
    chatState.busy = true; $('#sendBtn').disabled = true;
    const t0 = Date.now();
    const pr = $('#prog'); pr.classList.remove('hide'); $('#progBar').style.width = '3%';
    let tick = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      $('#progTxt').textContent = 'এজেন্ট কাজ করছে… ' + bn(s) + 's (লোকাল মডেল ৩০–৮০s নিতে পারে)';
      $('#progBar').style.width = Math.min(95, 3 + s * 1.4) + '%';
    }, 500);
    try {
      const body = { text };
      if (chatState.agent) body.agent = chatState.agent;
      const r = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.message || 'টাস্ক তৈরি হয়নি');
      curTask = r.id;
      // পোলিং (SSE-এর চেয়ে সহজ ও নির্ভরযোগ্য)
      let t = null;
      for (let i = 0; i < 180; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const d = await api('/api/tasks/' + r.id);
        if (!d || !d.status) continue;
        t = d;
        if (['done', 'error', 'cancelled', 'interrupted'].includes(d.status)) break;
      }
      clearInterval(tick); pr.classList.add('hide');
      if (!t) throw new Error('সময় শেষ — উত্তর আসেনি');
      if (t.status === 'done' && t.result) {
        const meta = [];
        if (t.result.usedModel?.label) meta.push('মডেল: ' + t.result.usedModel.label);
        if (t.agent) meta.push('এজেন্ট: ' + t.agent);
        if (t.result.ms) meta.push(bn(Math.round(t.result.ms / 1000)) + 's');
        if ((t.result.toolTrace || []).length) meta.push('টুল: ' + t.result.toolTrace.map((x) => x.tool).join(', '));
        chatState.messages.push({ role: 'ai', text: t.result.content || '(খালি উত্তর)', meta });
      } else if (t.status === 'cancelled') {
        chatState.messages.push({ role: 'err', text: 'টাস্ক বাতিল হয়েছে।' });
      } else {
        const err = t.error || t.result?.message || t.message || 'অজানা ত্রুটি';
        chatState.messages.push({ role: 'err', text: 'ব্যর্থ: ' + err + (t.result?.attempts ? '\\nচেষ্টা: ' + t.result.attempts.map((a) => a.model + (a.ok ? ' ✓' : ' ✗ ' + (a.error || ''))).join(' · ') : '') });
      }
    } catch (e) {
      clearInterval(tick); pr.classList.add('hide');
      chatState.messages.push({ role: 'err', text: 'ত্রুটি: ' + e.message });
    }
    chatState.busy = false; $('#sendBtn').disabled = false; draw();
  }
  $('#stopBtn').onclick = async () => { if (curTask) { await api('/api/tasks/' + curTask + '/cancel', { method: 'POST', body: '{}' }); toast('বাতিলের অনুরোধ পাঠানো হয়েছে'); } };
};

/* ============================== এজেন্ট ============================== */
RENDER.agents = async (w) => {
  const [ag, mg] = await Promise.all([api('/api/mgmt/agents'), api('/api/mgmt/providers')]);
  const agents = ag.agents || [], allTools = ag.allTools || [], mods = mg.models || [];
  w.innerHTML = \`<div class="row" style="margin-bottom:12px"><button class="btn" id="newAg">+ নতুন এজেন্ট</button><span class="chip info">\${bn(agents.length)} এজেন্ট</span></div>
  <div id="agList">\${agents.map((a) => \`
    <div class="card">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <b>\${esc(a.name)}</b><span class="chip">\${esc(a.bn)}</span>
        <span class="chip \${a.enabled ? 'ok' : 'bad'}">\${a.enabled ? 'সক্রিয়' : 'বন্ধ'}</span>
        <span class="chip \${a.modelOk ? 'info' : 'bad'}">\${esc(a.modelLabel)}</span>
        <span class="sp" style="flex:1"></span>
        <button class="btn ghost sm" data-edit="\${a.id}">সম্পাদনা</button>
        <button class="btn ghost sm" data-test="\${a.id}">টেস্ট</button>
        <button class="btn ghost sm" data-tog="\${a.id}" data-on="\${a.enabled}">\${a.enabled ? 'বন্ধ' : 'চালু'}</button>
        \${a.builtin ? '' : '<button class="btn danger sm" data-del="' + a.id + '">মুছুন</button>'}
      </div>
      <div class="muted" style="margin-top:6px">\${esc(a.role || '—')}</div>
      <div class="muted" style="margin-top:4px">টুল: \${esc((a.tools || []).join(', ') || 'নেই')} · তাপমাত্রা: \${esc(a.temperature)} · অনুমোদন: \${esc(a.approval)}</div>
      <div class="muted" id="tst-\${a.id}"></div>
    </div>\`).join('')}</div>
  <div id="agForm"></div>\`;

  const form = (a) => \`<div class="card"><h3>\${a ? 'এজেন্ট সম্পাদনা: ' + esc(a.name) : 'নতুন এজেন্ট'}</h3>
    <div class="row"><div class="field"><label>১. নাম</label><input id="f_name" value="\${esc(a?.name || '')}" placeholder="যেমন: বাংলা লেখক" /></div>
      <div class="field"><label>২. ভূমিকা</label><input id="f_role" value="\${esc(a?.role || '')}" placeholder="কী কাজ করে" /></div></div>
    <div class="field"><label>৩. সিস্টেম ইনস্ট্রাকশন</label><textarea id="f_sys" rows="4" placeholder="তুমি একজন …">\${esc(a?.system || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>৪-৫. মডেল (প্রোভাইডার + মডেল)</label><select id="f_model"><option value="">— ডিফল্ট মডেল —</option>\${mods.map((m) => '<option value="' + m.id + '"' + (a?.modelRowId === m.id ? ' selected' : '') + '>' + esc(m.label) + ' · ' + esc(m.providerId) + '</option>').join('')}</select>
        <div class="muted" style="margin-top:4px">কী ও Base URL সেই প্রোভাইডারের সেটিংস থেকে আসে — <a href="#creds" onclick="go('creds')">API ও ক্রেডেনশিয়াল</a></div></div>
      <div class="field"><label>৮. তাপমাত্রা (0–2)</label><input id="f_temp" type="number" step="0.1" min="0" max="2" value="\${esc(a?.temperature ?? 0.7)}" /></div>
      <div class="field"><label>সর্বোচ্চ টোকেন</label><input id="f_max" type="number" min="64" max="32000" value="\${esc(a?.maxTokens ?? 2048)}" /></div>
    </div>
    <div class="field"><label>৯. টুলস</label><div style="display:flex;flex-wrap:wrap;gap:6px">\${allTools.map((t) => '<label style="display:inline-flex;gap:6px;align-items:center;background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:4px 10px;font-size:12px;color:var(--txt);font-weight:400"><input type="checkbox" class="toolck" value="' + t + '" style="width:auto" ' + ((a?.tools || []).includes(t) ? 'checked' : '') + ' />' + esc(t) + '</label>').join('')}</div></div>
    <div class="row">
      <div class="field"><label>১০. পারমিশন</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--txt)"><input type="checkbox" id="f_pread" style="width:auto" \${a?.permissions?.read !== false ? 'checked' : ''}/> পড়া (সার্চ/ফাইল পড়া)</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--txt)"><input type="checkbox" id="f_pwrite" style="width:auto" \${a?.permissions?.write ? 'checked' : ''}/> লেখা (ফাইল/কোড)</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--txt)"><input type="checkbox" id="f_psens" style="width:auto" \${a?.permissions?.sensitive ? 'checked' : ''}/> সংবেদনশীল (ব্রাউজার/মিডিয়া)</label>
      </div>
      <div class="field"><label>১১. অনুমোদন নীতি</label><select id="f_appr">
        <option value="sensitive"\${a?.approval === 'sensitive' || !a ? ' selected' : ''}>শুধু ঝুঁকিপূর্ণ টুলে জিজ্ঞাসা</option>
        <option value="always"\${a?.approval === 'always' ? ' selected' : ''}>প্রতিটি টুলে জিজ্ঞাসা</option>
        <option value="never"\${a?.approval === 'never' ? ' selected' : ''}>নিরাপদ টুলে জিজ্ঞাসা নয়</option></select></div>
      <div class="field"><label>১২. অবস্থা</label><select id="f_en"><option value="1"\${a?.enabled !== false ? ' selected' : ''}>সক্রিয়</option><option value="0"\${a?.enabled === false ? ' selected' : ''}>বন্ধ</option></select></div>
    </div>
    <div class="field"><label>১৩. টেস্ট কথোপকথন</label><div style="display:flex;gap:8px"><input id="f_test" placeholder="পরীক্ষার বার্তা (খালি = ডিফল্ট)" /><button class="btn ghost" id="f_testBtn">টেস্ট চালাও</button></div><div id="f_testOut" class="muted" style="margin-top:6px"></div></div>
    <div class="row"><button class="btn" id="f_save">১৪. সেভ</button><button class="btn ghost" id="f_cancel">বাতিল</button><span class="chip" id="f_verif">১৫. যাচাই — সেভ হয়নি</span></div>
  </div>\`;

  const open = (a) => {
    $('#agForm').innerHTML = form(a);
    $('#f_cancel').onclick = () => { $('#agForm').innerHTML = ''; };
    $('#f_save').onclick = async () => {
      const body = {
        name: $('#f_name').value.trim(), role: $('#f_role').value, system: $('#f_sys').value,
        modelRowId: $('#f_model').value, temperature: Number($('#f_temp').value), maxTokens: Number($('#f_max').value),
        tools: [...document.querySelectorAll('.toolck:checked')].map((x) => x.value),
        permissions: { read: $('#f_pread').checked, write: $('#f_pwrite').checked, sensitive: $('#f_psens').checked },
        approval: $('#f_appr').value, enabled: $('#f_en').value === '1',
      };
      const r = a ? await api('/api/mgmt/agents/' + a.id, { method: 'PUT', body: JSON.stringify(body) }) : await api('/api/mgmt/agents', { method: 'POST', body: JSON.stringify(body) });
      if (r.ok) { toast('সেভ হয়েছে', 'ok'); $('#f_verif').className = 'chip ok'; $('#f_verif').textContent = '১৫. যাচাই — সেভ হয়েছে ✓'; RENDER.agents(w); }
      else toast(r.message || 'সেভ হয়নি', 'bad');
    };
    $('#f_testBtn').onclick = async () => {
      const out = $('#f_testOut'); out.innerHTML = '<span class="spin"></span> চলছে…';
      const id = a?.id;
      if (!id) { out.textContent = 'আগে সেভ করুন, তারপর টেস্ট করুন।'; return; }
      const r = await api('/api/mgmt/agents/' + id + '/test', { method: 'POST', body: JSON.stringify({ text: $('#f_test').value || undefined }) });
      out.innerHTML = r.ok ? '<span class="chip ok">উত্তর এসেছে</span> <span class="muted">' + bn(r.ms) + 'ms · ' + esc(r.model?.label || '') + '</span><br>' + esc(r.reply || '') : '<span class="chip bad">ব্যর্থ</span> ' + esc(r.message || '');
    };
  };
  $('#newAg').onclick = () => open(null);
  document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => open(agents.find((x) => x.id === b.dataset.edit)));
  document.querySelectorAll('[data-tog]').forEach((b) => b.onclick = async () => { await api('/api/mgmt/agents/' + b.dataset.tog, { method: 'PUT', body: JSON.stringify({ enabled: b.dataset.on !== 'true' }) }); RENDER.agents(w); });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('এজেন্ট মুছবেন?')) return; const r = await api('/api/mgmt/agents/' + b.dataset.del, { method: 'DELETE' }); if (r.ok) { toast('মুছে ফেলা হয়েছে', 'ok'); RENDER.agents(w); } else toast(r.message, 'bad'); });
  document.querySelectorAll('[data-test]').forEach((b) => b.onclick = async () => {
    const box = $('#tst-' + b.dataset.test); box.innerHTML = '<span class="spin"></span> টেস্ট চলছে… (৩০–৮০s)';
    const r = await api('/api/mgmt/agents/' + b.dataset.test + '/test', { method: 'POST', body: '{}' });
    box.innerHTML = r.ok ? '<span class="chip ok">উত্তর এসেছে</span> ' + esc(r.model?.label || '') + ' · ' + bn(r.ms) + 'ms<br>' + esc(r.reply || '') : '<span class="chip bad">ব্যর্থ</span> ' + esc(r.message || '');
  });
};

/* ============================== প্রোভাইডার ============================== */
RENDER.providers = async (w) => {
  const mg = await api('/api/mgmt/providers');
  const provs = mg.providers || [], mods = mg.models || [], types = mg.types || [];
  w.innerHTML = \`
  <div class="card"><h3>নতুন প্রোভাইডার (যেকোনো OpenAI-compatible)</h3>
    <div class="row"><div class="field"><label>নাম</label><input id="p_name" placeholder="যেমন: DeepSeek" /></div>
      <div class="field"><label>ধরন</label><select id="p_type">\${types.map((t) => '<option value="' + t + '">' + t + '</option>').join('')}</select></div></div>
    <div class="field"><label>Base URL</label><input id="p_base" placeholder="https://api.deepseek.com/v1" /></div>
    <div class="field"><label>API key (সার্ভারে এনক্রিপ্ট হয়ে সেভ হবে)</label><input id="p_key" type="password" placeholder="sk-…" autocomplete="off" /></div>
    <div class="row"><button class="btn" id="p_add">যোগ করুন</button><button class="btn ghost" id="p_testraw">এই এন্ডপয়েন্ট এখনই টেস্ট</button><span class="chip" id="p_rawout"></span></div>
  </div>
  \${provs.map((p) => \`<div class="card">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <b>\${esc(p.name)}</b><span class="chip">\${esc(p.type)}</span>
      <span class="chip \${p.hasKey || p.type === 'ollama' ? 'ok' : 'warn'}">\${p.type === 'ollama' ? 'কী লাগে না' : p.hasKey ? 'কী সেভ আছে' : 'কী নেই'}</span>
      <span class="chip \${p.enabled ? 'info' : 'bad'}">\${p.enabled ? 'চালু' : 'বন্ধ'}</span>
      <span class="sp" style="flex:1"></span>
      <button class="btn ghost sm" data-ptest="\${p.id}">কানেকশন টেস্ট</button>
      <button class="btn ghost sm" data-ptog="\${p.id}" data-on="\${p.enabled}">\${p.enabled ? 'বন্ধ' : 'চালু'}</button>
      \${p.builtin ? '' : '<button class="btn danger sm" data-pdel="' + p.id + '">মুছুন</button>'}
    </div>
    <div class="muted mono" style="margin-top:6px">\${esc(p.baseUrl)}</div>
    <div class="muted">কী: \${esc(p.masked || (p.type === 'ollama' ? 'প্রয়োজন নেই' : 'সেভ করা নেই'))} · মডেল: \${bn(p.modelCount)}
      \${p.lastTest ? '· শেষ টেস্ট: ' + ago(p.lastTest) + ' ' + (p.lastTestOk ? '✅' : '❌') + ' ' + esc(p.lastTestDetail || '') : ''}</div>
    <div class="row" style="margin-top:8px">
      <input placeholder="নতুন কী (বদলাতে)" data-pkey="\${p.id}" type="password" autocomplete="off" style="flex:2" />
      <button class="btn ghost sm" data-pkeysave="\${p.id}">কী সেভ</button>
      <button class="btn ghost sm" data-pdiscover="\${p.id}">মডেল খুঁজুন</button>
    </div>
    <div class="muted" id="pd-\${p.id}"></div>
    <div class="row" style="margin-top:8px">
      <input placeholder="নতুন মডেল আইডি" data-mid="\${p.id}" style="flex:2" />
      <input placeholder="লেবেল (ঐচ্ছিক)" data-mlabel="\${p.id}" />
      <button class="btn sm" data-madd="\${p.id}">মডেল যোগ</button>
    </div>
    <div style="margin-top:8px">\${mods.filter((m) => m.providerId === p.id).map((m) => \`<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
      <span class="mono" style="flex:1;min-width:120px">\${esc(m.label)} <span class="muted">(\${esc(m.modelId)})</span></span>
      \${m.isDefault ? '<span class="chip ok">ডিফল্ট</span>' : '<button class="btn ghost sm" data-mdef="' + m.id + '">ডিফল্ট করুন</button>'}
      <button class="btn ghost sm" data-mtest="\${m.id}">আসল ইনফারেন্স টেস্ট</button>
      <button class="btn danger sm" data-mdel="\${m.id}">×</button>
      <span class="muted" id="mt-\${m.id}" style="flex-basis:100%">\${m.lastTest ? (m.lastTest.ok ? '✅' : '❌') + ' ' + ago(m.lastTest.at) + ' · ' + bn(m.lastTest.ms) + 'ms · ' + esc((m.lastTest.reply || m.lastTest.detail || '').slice(0, 90)) : ''}</span>
    </div>\`).join('') || '<div class="muted">এই প্রোভাইডারে কোনো মডেল নেই</div>'}</div>
  </div>\`).join('')}\`;

  $('#p_add').onclick = async () => {
    const r = await api('/api/mgmt/providers', { method: 'POST', body: JSON.stringify({ name: $('#p_name').value, type: $('#p_type').value, baseUrl: $('#p_base').value, apiKey: $('#p_key').value }) });
    if (r.ok) { toast('প্রোভাইডার যোগ হয়েছে', 'ok'); RENDER.providers(w); } else toast(r.message || 'যোগ হয়নি', 'bad');
  };
  $('#p_testraw').onclick = async () => {
    const o = $('#p_rawout'); o.className = 'chip warn'; o.textContent = 'টেস্ট চলছে…';
    const r = await api('/api/mgmt/providers/_raw/test', { method: 'POST', body: JSON.stringify({ baseUrl: $('#p_base').value, apiKey: $('#p_key').value, type: $('#p_type').value }) });
    o.className = 'chip ' + (r.ok ? 'ok' : 'bad'); o.textContent = (r.ok ? '✓ ' : '✗ ') + (r.detail || r.message || '');
  };
  document.querySelectorAll('[data-ptest]').forEach((b) => b.onclick = async () => {
    b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    const r = await api('/api/mgmt/providers/' + b.dataset.ptest + '/test', { method: 'POST', body: '{}' });
    toast((r.ok ? '✓ ' : '✗ ') + (r.detail || r.message || ''), r.ok ? 'ok' : 'bad');
    RENDER.providers(w);
  });
  document.querySelectorAll('[data-ptog]').forEach((b) => b.onclick = async () => { await api('/api/mgmt/providers/' + b.dataset.ptog, { method: 'PUT', body: JSON.stringify({ enabled: b.dataset.on !== 'true' }) }); RENDER.providers(w); });
  document.querySelectorAll('[data-pdel]').forEach((b) => b.onclick = async () => { if (!confirm('প্রোভাইডার মুছবেন?')) return; const r = await api('/api/mgmt/providers/' + b.dataset.pdel, { method: 'DELETE' }); r.ok ? (toast('মুছে ফেলা হয়েছে', 'ok'), RENDER.providers(w)) : toast(r.message, 'bad'); });
  document.querySelectorAll('[data-pkeysave]').forEach((b) => b.onclick = async () => {
    const inp = document.querySelector('[data-pkey="' + b.dataset.pkeysave + '"]');
    const r = await api('/api/mgmt/providers/' + b.dataset.pkeysave, { method: 'PUT', body: JSON.stringify({ apiKey: inp.value }) });
    r.ok ? (toast('কী সেভ হয়েছে (এনক্রিপ্টেড)', 'ok'), RENDER.providers(w)) : toast(r.message, 'bad');
  });
  document.querySelectorAll('[data-pdiscover]').forEach((b) => b.onclick = async () => {
    const box = $('#pd-' + b.dataset.pdiscover); box.innerHTML = '<span class="spin"></span> খোঁজা হচ্ছে…';
    const r = await api('/api/mgmt/providers/' + b.dataset.pdiscover + '/discover');
    if (!r.ok) { box.textContent = r.message || 'ব্যর্থ'; return; }
    box.innerHTML = '<b>' + bn(r.total) + ' মডেল পাওয়া গেছে</b> — ' + r.models.slice(0, 30).map((m) => '<a href="#" data-quick="' + esc(m.modelId) + '" data-pid="' + b.dataset.pdiscover + '">' + esc(m.modelId) + (m.added ? ' ✓' : '') + '</a>').join(' · ');
    box.querySelectorAll('[data-quick]').forEach((a) => a.onclick = async (e) => {
      e.preventDefault();
      const rr = await api('/api/mgmt/models', { method: 'POST', body: JSON.stringify({ providerId: a.dataset.pid, modelId: a.dataset.quick }) });
      toast(rr.ok ? 'যোগ হয়েছে' : rr.message, rr.ok ? 'ok' : 'bad');
    });
  });
  document.querySelectorAll('[data-madd]').forEach((b) => b.onclick = async () => {
    const pid = b.dataset.madd;
    const mid = document.querySelector('[data-mid="' + pid + '"]').value;
    const ml = document.querySelector('[data-mlabel="' + pid + '"]').value;
    const r = await api('/api/mgmt/models', { method: 'POST', body: JSON.stringify({ providerId: pid, modelId: mid, label: ml || mid }) });
    r.ok ? (toast('মডেল যোগ হয়েছে', 'ok'), RENDER.providers(w)) : toast(r.message, 'bad');
  });
  document.querySelectorAll('[data-mtest]').forEach((b) => b.onclick = async () => {
    const box = $('#mt-' + b.dataset.mtest); box.innerHTML = '<span class="spin"></span> আসল ইনফারেন্স চলছে… (৩০–৯০s)';
    const r = await api('/api/mgmt/models/' + b.dataset.mtest + '/test', { method: 'POST', body: '{}' });
    box.innerHTML = r.ok ? '<span class="chip ok">উত্তর এসেছে</span> ' + bn(r.ms) + 'ms · ' + esc((r.reply || '').slice(0, 120)) : '<span class="chip bad">ব্যর্থ</span> ' + esc(r.detail || r.message || '');
  });
  document.querySelectorAll('[data-mdef]').forEach((b) => b.onclick = async () => { const r = await api('/api/mgmt/default', { method: 'POST', body: JSON.stringify({ modelRowId: b.dataset.mdef }) }); r.ok ? (toast('ডিফল্ট সেট হয়েছে', 'ok'), RENDER.providers(w)) : toast(r.message, 'bad'); });
  document.querySelectorAll('[data-mdel]').forEach((b) => b.onclick = async () => { const r = await api('/api/mgmt/models/' + b.dataset.mdel, { method: 'DELETE' }); r.ok ? RENDER.providers(w) : toast(r.message, 'bad'); });
};

/* ============================== ক্রেডেনশিয়াল ============================== */
RENDER.creds = async (w) => {
  const [k, mg] = await Promise.all([api('/api/keys'), api('/api/mgmt/providers')]);
  const keys = k.keys || [], provs = mg.providers || [];
  w.innerHTML = \`<div class="card"><h3>সংরক্ষিত কী</h3>
    <div class="muted">AES-256-GCM দিয়ে এনক্রিপ্টেড (data/keys.enc.json)। পূর্ণ কী কখনো ব্রাউজারে বা লগে যায় না — শুধু masked রূপ।</div>
    <div style="margin-top:10px">\${keys.length ? '<table><tr><th>নাম</th><th>মান</th><th></th></tr>' + keys.map((x) => '<tr><td class="mono">' + esc(x.name || x.keyName || x) + '</td><td class="mono">' + esc(x.masked || '••••') + '</td><td><button class="btn danger sm" data-kdel="' + esc(x.name || x.keyName || x) + '">মুছুন</button></td></tr>').join('') + '</table>' : '<div class="empty">এখনো কোনো কী সেভ করা হয়নি</div>'}</div>
  </div>
  <div class="card"><h3>প্রোভাইডার অনুযায়ী কী</h3>
    \${provs.map((p) => \`<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
      <b style="min-width:120px">\${esc(p.name)}</b>
      <span class="chip \${p.hasKey || p.type === 'ollama' ? 'ok' : 'warn'}">\${p.type === 'ollama' ? 'প্রয়োজন নেই' : p.hasKey ? esc(p.masked) : 'সেভ করা নেই'}</span>
      <input type="password" placeholder="নতুন কী" data-ck="\${p.id}" style="flex:1;min-width:140px" autocomplete="off" />
      <button class="btn sm" data-csave="\${p.id}">সেভ</button>
    </div>\`).join('')}
  </div>
  <div class="card"><h3>একটা কী দিয়ে অনেক প্রোভাইডার</h3><div class="muted">প্রতিটি প্রোভাইডারের নিজের কী আলাদা থাকে — OpenRouter, Groq, DeepSeek ইত্যাদির কী একে অপরকে প্রভাবিত করে না। একই কী দুই জায়গায় দিলেও সমস্যা নেই।</div></div>\`;
  document.querySelectorAll('[data-csave]').forEach((b) => b.onclick = async () => {
    const inp = document.querySelector('[data-ck="' + b.dataset.csave + '"]');
    if (!inp.value.trim()) return toast('কী লিখুন', 'bad');
    const r = await api('/api/mgmt/providers/' + b.dataset.csave, { method: 'PUT', body: JSON.stringify({ apiKey: inp.value.trim() }) });
    r.ok ? (toast('সেভ হয়েছে', 'ok'), RENDER.creds(w)) : toast(r.message, 'bad');
  });
  document.querySelectorAll('[data-kdel]').forEach((b) => b.onclick = async () => { if (!confirm('কী মুছবেন?')) return; await api('/api/keys?name=' + encodeURIComponent(b.dataset.kdel), { method: 'DELETE' }); RENDER.creds(w); });
};

/* ============================== টাস্ক / হিস্ট্রি ============================== */
async function taskList(w, mode) {
  const d = await api('/api/tasks');
  const tasks = (d.tasks || []).filter((t) => mode === 'history' ? ['done', 'error', 'cancelled', 'interrupted'].includes(t.status) : true);
  w.innerHTML = \`<div class="row" style="margin-bottom:10px"><span class="chip info">\${bn(tasks.length)} টাস্ক</span><button class="btn ghost sm" id="tReload">⟳ রিফ্রেশ</button></div>
  <div id="taskRows">\${tasks.length ? tasks.map((t) => \`<div class="card" style="padding:10px 12px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="chip \${t.status === 'done' ? 'ok' : t.status === 'error' ? 'bad' : t.status === 'running' ? 'warn' : ''}">\${esc(t.status)}</span>
      <span style="flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(t.text)}</span>
      <span class="muted">\${ago(t.at)}</span>
      <button class="btn ghost sm" data-tl="\${t.id}">টাইমলাইন</button>
      \${['running', 'queued'].includes(t.status) ? '<button class="btn ghost sm" data-tc="' + t.id + '">বাতিল</button>' : '<button class="btn ghost sm" data-tr="' + t.id + '">↻ রিট্রাই</button>'}
    </div>
    <div class="muted" id="tl-\${t.id}"></div>
  </div>\`).join('') : '<div class="empty">কোনো টাস্ক নেই</div>'}</div>\`;
  $('#tReload').onclick = () => taskList(w, mode);
  document.querySelectorAll('[data-tl]').forEach((b) => b.onclick = async () => {
    const box = $('#tl-' + b.dataset.tl); box.innerHTML = '<span class="spin"></span>';
    const t = await api('/api/tasks/' + b.dataset.tl);
    const ev = t.events || [];
    box.innerHTML = '<div class="tl" style="margin-top:8px">' + ev.map((e) => '<div class="ev ' + (e.type && /error|fail|denied/i.test(e.type) ? 'bad' : e.type === 'done' ? 'ok' : '') + '"><span class="t">' + hhmm(e.at) + '</span><b>' + esc(e.type) + '</b> ' + esc(JSON.stringify(e.data || {}).slice(0, 160)) + '</div>').join('') + '</div>' + (t.result?.content ? '<div style="margin-top:8px;white-space:pre-wrap">' + esc(t.result.content) + '</div>' : '');
  });
  document.querySelectorAll('[data-tc]').forEach((b) => b.onclick = async () => { await api('/api/tasks/' + b.dataset.tc + '/cancel', { method: 'POST', body: '{}' }); toast('বাতিল করা হচ্ছে'); });
  document.querySelectorAll('[data-tr]').forEach((b) => b.onclick = async () => { const r = await api('/api/tasks/' + b.dataset.tr + '/retry', { method: 'POST', body: '{}' }); toast(r.ok ? 'নতুন টাস্ক তৈরি হয়েছে' : (r.message || 'ব্যর্থ'), r.ok ? 'ok' : 'bad'); });
}
RENDER.tasks = (w) => taskList(w, 'tasks');
RENDER.history = (w) => taskList(w, 'history');

/* ============================== অনুমোদন ============================== */
RENDER.approvals = async (w) => {
  const d = await api('/api/approvals');
  const pend = d.pending || [], hist = d.history || [];
  w.innerHTML = \`<div class="card"><h3>অপেক্ষমাণ (\${bn(pend.length)})</h3>
    \${pend.length ? pend.map((a) => \`<div class="card" style="background:var(--panel2)">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>\${esc(a.tool)}</b><span class="chip \${a.risk === 'sensitive' ? 'bad' : 'warn'}">\${esc(a.riskLabel || a.risk)}</span><span class="muted">\${esc(a.reason || '')}</span></div>
      <div class="mono muted" style="margin-top:6px;word-break:break-all">\${esc(JSON.stringify(a.args || {}).slice(0, 400))}</div>
      <div class="row" style="margin-top:8px"><button class="btn ok sm" data-ap="\${a.id}">✓ অনুমোদন</button><button class="btn danger sm" data-dn="\${a.id}">✕ বাতিল</button></div>
    </div>\`).join('') : '<div class="empty">কিছু অপেক্ষা করছে না</div>'}
  </div>
  <div class="card"><h3>হিস্ট্রি (\${bn(hist.length)})</h3>\${hist.length ? '<table><tr><th>টুল</th><th>সিদ্ধান্ত</th><th>সময়</th></tr>' + hist.slice(-20).reverse().map((h) => '<tr><td>' + esc(h.tool) + '</td><td><span class="chip ' + (h.status === 'approved' ? 'ok' : 'bad') + '">' + esc(h.status) + '</span></td><td class="muted">' + ago(h.at) + '</td></tr>').join('') + '</table>' : '<div class="muted">ইতিহাস নেই</div>'}</div>\`;
  document.querySelectorAll('[data-ap]').forEach((b) => b.onclick = async () => { await api('/api/approvals/' + b.dataset.ap, { method: 'POST', body: JSON.stringify({ action: 'approve' }) }); toast('অনুমোদিত', 'ok'); RENDER.approvals(w); });
  document.querySelectorAll('[data-dn]').forEach((b) => b.onclick = async () => { await api('/api/approvals/' + b.dataset.dn, { method: 'POST', body: JSON.stringify({ action: 'deny' }) }); toast('বাতিল হয়েছে'); RENDER.approvals(w); });
};

/* ============================== টুলস ============================== */
RENDER.tools = async (w) => {
  const st = await api('/api/state?probe=0');
  const tools = st.tools || [];
  const groups = {};
  for (const t of tools) (groups[t.group] = groups[t.group] || []).push(t);
  w.innerHTML = \`<div class="card"><h3>\${bn(tools.length)} টুল</h3><div class="muted">এজেন্টের পারমিশন অনুযায়ী টুল বাদ পড়ে: পড়া (research/utility/data), লেখা (files/code), সংবেদনশীল (browser/media)।</div></div>
  \${Object.entries(groups).map(([g, list]) => '<div class="card"><h3>' + esc(g) + '</h3>' + list.map((t) => '<div style="padding:5px 0;border-bottom:1px solid var(--line)"><span class="mono">' + esc(t.name) + '</span><div class="muted">' + esc(t.description) + '</div></div>').join('') + '</div>').join('')}\`;
};

/* ============================== লগস ============================== */
RENDER.logs = async (w) => {
  const [a, u] = await Promise.all([api('/api/audit?n=120'), api('/api/usage')]);
  const ev = a.events || [];
  w.innerHTML = \`<div class="card"><h3>অডিট লগ (সর্বশেষ \${bn(ev.length)})</h3>
    <div class="muted">সব গোপনীয়তা বাদ দেওয়া হয় (redact)। কোনো API কী এখানে আসে না।</div>
    <div style="margin-top:8px;max-height:420px;overflow:auto">\${ev.slice().reverse().map((e) => '<div style="padding:4px 0;border-bottom:1px solid var(--line);font-size:12px"><span class="muted mono">' + hhmm(e.at) + '</span> <b>' + esc(e.type) + '</b> <span class="muted mono">' + esc(JSON.stringify(e.data || {}).slice(0, 160)) + '</span></div>').join('') || '<div class="empty">লগ নেই</div>'}</div>
  </div>
  <div class="card"><h3>ব্যবহার</h3><div class="muted">মোট টোকেন: \${bn(u.total?.tokens || 0)} · অনুরোধ: \${bn(u.total?.calls || 0)} · সাশ্রয়: $\${Number(u.total?.avoidedUsd || 0).toFixed(2)} (তথ্যমাত্র)</div></div>\`;
};

/* ============================== সেটিংস ============================== */
RENDER.settings = async (w) => {
  const st = await api('/api/state?probe=0');
  const s = st.settings || {};
  w.innerHTML = \`<div class="card"><h3>রাউটিং</h3>
    <div class="field"><label>ডিফল্ট মডেল</label><div class="muted">মডেল প্রোভাইডার পেজ থেকে সেট করুন — <a href="#providers" onclick="go('providers')">এখানে যান</a></div></div>
    <div class="field"><label>পিন করা মডেল (ঐচ্ছিক)</label><input id="s_pin" value="\${esc(s.pinnedModel || '')}" placeholder="provider:model" /><div class="muted" style="margin-top:4px">এটা দিলে রাউটিং শুধু এই মডেল চেষ্টা করবে, ব্যর্থ হলে ফলব্যাক।</div></div>
    <div class="field"><label>ফলব্যাক মডেল (কমা দিয়ে)</label><input id="s_fb" value="\${esc((s.fallbackModels || []).join(','))}" placeholder="ollama:qwen3.5:4b,openrouter:…" /></div>
    <div class="field"><label>টুল অনুমোদনের ডিফল্ট</label><select id="s_auto"><option value="read"\${s.autoApprove === 'read' || !s.autoApprove ? ' selected' : ''}>শুধু ঝুঁকিপূর্ণ টুলে জিজ্ঞাসা</option><option value="write"\${s.autoApprove === 'write' ? ' selected' : ''}>লেখা ও ঝুঁকিপূর্ণতে জিজ্ঞাসা</option><option value="all"\${s.autoApprove === 'all' ? ' selected' : ''}>প্রতিটি টুলে জিজ্ঞাসা</option></select></div>
    <button class="btn" id="s_save">সেভ</button>
  </div>
  <div class="card"><h3>সিস্টেম</h3><div class="muted">পোর্ট \${esc(st.version)} · Ollama \${st.health?.ollama?.up ? 'চালু' : 'বন্ধ'} · \${bn((st.agents || []).length)} এজেন্ট · \${bn((st.models || []).length)} মডেল</div></div>\`;
  $('#s_save').onclick = async () => {
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ pinnedModel: $('#s_pin').value, fallbackModels: $('#s_fb').value.split(',').map((x) => x.trim()).filter(Boolean), autoApprove: $('#s_auto').value }) });
    toast('সেভ হয়েছে', 'ok');
  };
};

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('hashchange', () => go((location.hash || '#dash').slice(1)));
window.go = go; window.RAKIB = { api, go };
boot();
</script>
</body>
</html>`;
}

module.exports = { page };

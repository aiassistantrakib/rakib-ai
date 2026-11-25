/* =========================================================================
   RAKIB AI — HTTP server (zero dependency)
   routes:
     GET  /                       → UI
     GET  /api/state              → models, agents, tools, health, usage
     POST /api/chat               → orchestrator
     POST /api/upload             → ফাইল/ছবি আপলোড (workspace-এ)
     POST /api/keys               → ফ্রি key সেভ (masked ফেরত)
     POST /api/settings           → সেটিংস
     GET  /api/usage              → খরচ/টোকেন লেজার
     GET  /api/audit              → নিরাপত্তা লগ
     POST /api/health             → হেলথ প্রোব
     POST /api/image              → image_ops সরাসরি (মিডিয়া স্টুডিও)
     GET  /files/<path>           → workspace ফাইল (sandboxed)
     GET  /api/tasks              → টাস্ক হিস্ট্রি
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PORT, HOST, PUBLIC, WORKSPACE, DATA } = require('./lib/config');
const store = require('./lib/store');
const gw = require('./lib/gateway');
const orch = require('./lib/orchestrator');
const agents = require('./lib/agents');
const tools = require('./lib/tools');
const mintel = require('./lib/modelintel');
const taskrunner = require('./lib/tasks');
const approvals = require('./lib/approvals');
const secrets = require('./lib/secrets');

/* ------------------------------ access token ------------------------------ */
// লোকাল ব্যবহারের জন্য এক টোকেন — UI স্বয়ংক্রিয়ভাবে পায়, বাইরের কেউ বিনা টোকেনে API ব্যবহার করতে পারে না।
const TOKEN_FILE = path.join(DATA, 'access-token');
let TOKEN = '';
try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch {}
if (!TOKEN) { TOKEN = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 }); }

/* ------------------------------ rate limit ------------------------------ */
const buckets = new Map();
function rateLimited(ip, limit = 120, windowMs = 60000) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(ip, b);
  return b.n > limit;
}

/* ------------------------------ helpers ------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf',
};
/* CORS: শুধু লুপব্যাক অরিজিন + ALLOWED_ORIGINS — কী কখনো ক্রস-অরিজিনে যায় না */
function corsHeaders(req) {
  const o = req.headers.origin;
  if (!o) return {};
  try {
    const u = new URL(o);
    const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
    const ok = ['127.0.0.1', 'localhost'].includes(u.hostname) || u.host.toLowerCase() === hostOf(req) || extra.includes(u.origin);
    if (!ok) return {};
    return { 'Access-Control-Allow-Origin': u.origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'content-type,x-rakib-token', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Max-Age': '600' };
  } catch { return {}; }
}
function send(res, code, body, type = 'application/json; charset=utf-8', req = null) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Resource-Policy': 'same-origin',
    ...(req && req.secureReq ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    ...(req ? corsHeaders(req) : {}),
  });
  res.end(buf);
}
function readBody(req, limit = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}
/* একই হোস্ট থেকে আসা রিকোয়েস্ট (টানেল/প্রক্সি/ডিপ্লয়) সবসময় অনুমোদিত;
   বাইরের অরিজিন শুধু ALLOWED_ORIGINS-এ থাকলে। */
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
const sameOrigin = (req) => {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    const u = new URL(o);
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return true;
    if (hostOf(req) && u.host.toLowerCase() === hostOf(req)) return true;
    const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
    return extra.includes(u.origin);
  } catch { return false; }
};

/* ------------------------------ state ------------------------------ */
async function statePayload({ probe = false } = {}) {
  const s = store.loadState();
  const models = gw.modelStatus();
  const health = probe ? await gw.health({ probe: true }) : await gw.health({ probe: false, cache: true });
  const usage = store.loadUsage();
  return {
    version: require('./lib/config').PORT,
    settings: s.settings,
    agents: agents.list(),
    tools: Object.entries(tools.tools).map(([name, t]) => ({ name, group: t.group, description: t.spec.function.description })),
    models,
    providers: Object.values(require('./lib/config').PROVIDERS).map((p) => ({
      id: p.id, label: p.label, local: !!p.local, signup: p.signup, note: p.note,
      keyName: p.keyName, hasKey: p.local ? !!(health.ollama && health.ollama.up) : !!store.readKeys()[p.keyName],
      masked: p.keyName ? store.mask(store.readKeys()[p.keyName]) : '',
    })),
    health,
    usage: usage.total,
    usageByModel: usage.byModel,
    usageByDay: usage.byDay,
    tasks: (s.tasks || []).slice(-40).reverse(),
    token: TOKEN,
  };
}

/* ------------------------------ server ------------------------------ */
const requestHandler = async (req, res) => {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  req.secureReq = proto === 'https';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = req.socket.remoteAddress || 'local';

  try {
    if (rateLimited(ip)) return send(res, 429, { ok: false, message: 'অনেক বেশি অনুরোধ — এক মিনিট পরে চেষ্টা করুন' }, 'application/json; charset=utf-8', req);
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }

    // ---- static UI ----
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || /^\/(app\.css|app\.js|manifest\.webmanifest|sw\.js|icon-[0-9a-z]+\.png|favicon\.ico|models\.html|console\.html)$/.test(url.pathname))) {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain', req);
      return fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'not found', 'text/plain', req);
        send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
      });
    }

    // ---- workspace files (sandboxed) ----
    if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const rel = decodeURIComponent(url.pathname.slice(7));
      let full;
      try { full = tools.safePath(rel, { mustExist: true }); } catch (e) { return send(res, 403, e.message, 'text/plain'); }
      const ext = path.extname(full).toLowerCase();
      if (!MIME[ext] && !['.md', '.log', '.yml', '.yaml'].includes(ext)) return send(res, 403, 'file type not served', 'text/plain');
      return fs.readFile(full, (err, data) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, MIME[ext] || 'text/plain; charset=utf-8'));
    }

    // ---- API: token required for mutating/expensive calls ----
    const needsToken = !['GET', 'OPTIONS'].includes(req.method);
    if (url.pathname.startsWith('/api/')) {
      const given = req.headers['x-rakib-token'] || url.searchParams.get('token') || '';
      if (needsToken && given !== TOKEN) return send(res, 401, { ok: false, error: 'TOKEN', message: 'টোকেন নেই — অ্যাপ থেকে আবার চেষ্টা করুন' }, 'application/json; charset=utf-8', req);
      if (!sameOrigin(req)) return send(res, 403, { ok: false, message: 'origin অনুমোদিত নয়' }, 'application/json; charset=utf-8', req);

      if (url.pathname === '/api/state') return send(res, 200, await statePayload({ probe: url.searchParams.get('probe') === '1' }), 'application/json; charset=utf-8', req);
      if (url.pathname === '/api/agents') return send(res, 200, { agents: agents.list() }, 'application/json; charset=utf-8', req);
      /* ---- ফেজ ৪: মডেল ইন্টেলিজেন্স ---- */
      if (url.pathname === '/api/models/live') return send(res, 200, await mintel.liveCatalogue(url.searchParams.get('force') === '1'));
      if (url.pathname === '/api/models/bench') return send(res, 200, { status: mintel.statusOf(), last: mintel.lastResults() });
      if (url.pathname === '/api/models/route') return send(res, 200, { at: new Date().toISOString(), recommendations: mintel.recommendations() });
      if (url.pathname === '/api/usage') return send(res, 200, store.loadUsage());
      if (url.pathname === '/api/services') return send(res, 200, { services: require('./lib/services') }, 'application/json; charset=utf-8', req);
      if (url.pathname === '/api/audit') return send(res, 200, { events: store.readAudit(Number(url.searchParams.get('n') || 80)) });
      if (url.pathname === '/api/tasks' && req.method === 'GET') return send(res, 200, { tasks: taskrunner.list(), stats: taskrunner.stats() });

      if (url.pathname === '/api/keys' && req.method === 'POST') {
        const b = await readBody(req, 100000);
        const patch = {};
        for (const [k, v] of Object.entries(b || {})) {
          if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(k)) continue;   // শুধু ভ্যালিড env-স্টাইল নাম
          patch[k] = String(v || '').trim();
        }
        store.writeKeys(patch);
        store.audit('keys_updated', { keys: Object.keys(patch).filter((k) => patch[k]) });
        return send(res, 200, { ok: true, providers: (await statePayload()).providers });
      }

      if (url.pathname === '/api/settings' && req.method === 'POST') {
        const b = await readBody(req, 200000);
        const s = store.loadState();
        s.settings = { ...s.settings, ...b };
        store.saveState(s);
        return send(res, 200, { ok: true, settings: s.settings });
      }

      if (url.pathname === '/api/models/bench' && req.method === 'POST') {
        const b = await readBody(req, 100000);
        const out = await mintel.startBench({ models: Array.isArray(b.models) ? b.models : null, tasks: Array.isArray(b.tasks) ? b.tasks : null });
        return send(res, 200, out);
      }

      if (url.pathname === '/api/health' && req.method === 'POST') {
        return send(res, 200, { ok: true, health: await gw.health({ probe: true }) });
      }

      /* ---- ফেজ ৫: টাস্ক রানার / লাইভ ইভেন্ট / অনুমোদন ---- */
      if (url.pathname === '/api/tasks/stream' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...corsHeaders(req) });
        res.write(': connected\n\n');
        const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 15000);
        const onEv = ({ taskId, ev }) => { try { res.write(`data: ${JSON.stringify({ taskId, ev })}\n\n`); } catch {} };
        taskrunner.events.on('event', onEv);
        req.on('close', () => { clearInterval(hb); taskrunner.events.off('event', onEv); });
        return;
      }
      if (url.pathname.startsWith('/api/tasks/') && req.method === 'GET') {
        const id = url.pathname.split('/')[3];
        const t = taskrunner.get(id);
        if (!t) return send(res, 404, { ok: false, message: 'টাস্ক নেই' });
        return send(res, 200, { id: t.id, status: t.status, agent: t.agent, text: t.text, result: t.result, error: t.error, events: t.events, at: t.at });
      }
      if (url.pathname === '/api/tasks' && req.method === 'POST') {
        const b = await readBody(req, 400000);
        const text = String(b.text || '').slice(0, 20000);
        if (!text.trim()) return send(res, 400, { ok: false, message: 'বার্তা খালি' });
        const t = taskrunner.create({ text, agent: b.agent, plan: !!b.plan, history: Array.isArray(b.history) ? b.history.slice(-12) : [], images: Array.isArray(b.images) ? b.images.slice(0, 3) : [], settings: b.settings || {} });
        return send(res, 200, { ok: true, id: t.id, status: t.status });
      }
      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/cancel$/) && req.method === 'POST') {
        const id = url.pathname.split('/')[3];
        return send(res, 200, { ok: taskrunner.cancel(id) });
      }
      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/retry$/) && req.method === 'POST') {
        const id = url.pathname.split('/')[3];
        const t = taskrunner.retry(id);
        return send(res, t ? 200 : 404, t ? { ok: true, id: t.id } : { ok: false, message: 'টাস্ক নেই' });
      }
      if (url.pathname === '/api/approvals' && req.method === 'GET') return send(res, 200, { ...approvals.list(), stats: approvals.stats() });
      if (url.pathname.match(/^\/api\/approvals\/[^/]+$/) && req.method === 'POST') {
        const id = url.pathname.split('/')[3];
        const b = await readBody(req, 100000);
        const ap = approvals.decide(id, String(b.action || ''), { args: b.args || null });
        return send(res, ap ? 200 : 404, ap ? { ok: true, approval: ap } : { ok: false, message: 'অনুমোদন পাওয়া যায়নি' });
      }
      if (url.pathname === '/api/keys' && req.method === 'GET') return send(res, 200, { keys: secrets.list() });

      /* ---- ফেজ ৭: প্রোভাইডার অন/অফ, কানেকশন টেস্ট, মডেল পছন্দ/ফলব্যাক ---- */
      if (url.pathname === '/api/providers' && req.method === 'POST') {
        const b = await readBody(req, 20000);
        const st = store.loadState();
        st.settings = st.settings || {};
        st.settings.disabledProviders = Array.isArray(b.disabled) ? b.disabled.map(String).slice(0, 20) : (st.settings.disabledProviders || []);
        st.settings.pinnedModel = b.pinnedModel === undefined ? (st.settings.pinnedModel || '') : String(b.pinnedModel || '').slice(0, 120);
        st.settings.fallbackModels = Array.isArray(b.fallback) ? b.fallback.map(String).slice(0, 12) : (st.settings.fallbackModels || []);
        store.saveState(st);
        store.audit('providers_updated', { disabled: st.settings.disabledProviders.length, pinned: !!st.settings.pinnedModel });
        return send(res, 200, { ok: true, settings: st.settings }, 'application/json; charset=utf-8', req);
      }
      if (url.pathname === '/api/providers/test' && req.method === 'POST') {
        const b = await readBody(req, 20000);
        const id = String(b.provider || '');
        const cfg = require('./lib/config').PROVIDERS[id];
        if (!cfg) return send(res, 400, { ok: false, message: 'অজানা প্রোভাইডার' }, 'application/json; charset=utf-8', req);
        const t0 = Date.now();
        let result;
        try {
          if (cfg.local) {
            const up = await gw.health({ probe: true });
            result = { ok: !!(up.ollama && up.ollama.up), detail: up.ollama && up.ollama.up ? `${up.ollama.models} মডেল` : 'Ollama বন্ধ' };
          } else {
            const key = store.readKeys()[cfg.keyName];
            if (!key) result = { ok: false, detail: 'কী সংরক্ষিত নেই' };
            else {
              const r = await gw.probeProvider(id);
              result = { ok: !!r.ok, detail: r.detail || (r.status ? 'HTTP ' + r.status : '') };
            }
          }
        } catch (e) { result = { ok: false, detail: String(e.message).slice(0, 160) }; }
        store.audit('provider_test', { id, ok: result.ok });
        return send(res, 200, { ...result, provider: id, ms: Date.now() - t0 }, 'application/json; charset=utf-8', req);
      }
      if (url.pathname === '/api/keys' && req.method === 'DELETE') {
        const name = url.searchParams.get('name') || '';
        if (!name) return send(res, 400, { ok: false, message: 'name লাগবে' });
        secrets.remove(name);
        store.audit('key_deleted', { name });
        return send(res, 200, { ok: true, keys: secrets.list() });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const b = await readBody(req);
        const s = store.loadState();
        const text = String(b.text || '').slice(0, 20000);
        const history = Array.isArray(b.history) ? b.history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12) : [];
        const images = Array.isArray(b.images) ? b.images.filter((x) => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 3) : [];
        if (!text.trim() && !images.length) return send(res, 400, { ok: false, message: 'বার্তা খালি' });
        const settings = { ...s.settings, ...(b.settings || {}) };
        const result = await orch.handle({ text: text || 'এই ছবিটা দেখো', history, images, settings, plan: !!b.plan, agent: b.agent });
        // টাস্ক হিস্ট্রিতে রাখুন
        const task = {
          id: store.uid(8), at: store.now(), agent: result.agent, agentName: result.agentName,
          prompt: text.slice(0, 200), ok: !!result.ok, ms: result.totalMs, model: result.usedModel?.label || '',
          tools: (result.toolTrace || []).map((t) => t.tool), error: result.error || '', plan: !!b.plan,
        };
        const st = store.loadState();
        st.tasks = [...(st.tasks || []), task].slice(-300);
        store.saveState(st);
        return send(res, 200, { ...result, taskId: task.id });
      }

      /* ---- যেকোনো টুল সরাসরি চালানো (ড্যাশবোর্ড/টেস্ট/অটোমেশনের জন্য) ---- */
      if (url.pathname === '/api/tool' && req.method === 'POST') {
        const b = await readBody(req, 200000);
        const name = String(b.name || '');
        const args = b.args && typeof b.args === 'object' ? b.args : {};
        if (name === 'delegate_to_agent') {
          const sub = await taskrunner.runAgentTask({ agentId: String(args.agent || 'chief'), task: String(args.task || ''), settings: {} });
          return send(res, 200, { ok: !!sub.ok, text: sub.ok ? sub.content : 'FAILED: ' + (sub.message || ''), tool: 'delegate', agent: args.agent, ms: sub.ms, model: sub.usedModel?.label || '' }, 'application/json; charset=utf-8', req);
        }
        if (!tools.tools[name]) return send(res, 400, { ok: false, message: 'অজানা টুল: ' + name }, 'application/json; charset=utf-8', req);
        const ap = approvals.needsApproval(name, { autoApprove: String(b.autoApprove || 'all') })
          ? approvals.request({ tool: name, args, agent: 'api', reason: 'সরাসরি টুল অনুরোধ' })
          : null;
        if (ap) {
          approvals.decide(ap.id, 'approve');   // ড্যাশবোর্ড থেকে সরাসরি ডাকা = ব্যবহারকারীর স্পষ্ট অনুমোদন
        }
        const t0 = Date.now();
        try {
          const r = await tools.runTool(name, args, { startedAt: t0 });
          store.audit('tool_direct', { name, ok: !r.ui.error });
          return send(res, 200, { ok: !r.ui.error, text: r.text, ms: Date.now() - t0, ...r.ui }, 'application/json; charset=utf-8', req);
        } catch (e) {
          return send(res, 500, { ok: false, message: String(e.message).slice(0, 200) }, 'application/json; charset=utf-8', req);
        }
      }

      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const b = await readBody(req);
        const name = String(b.name || 'file').replace(/[^\w.\-\u0980-\u09FF ]/g, '_').slice(-80) || 'file';
        const dataUrl = String(b.data || '');
        const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
        if (!m) return send(res, 400, { ok: false, message: 'ফাইল ফরম্যাট ঠিক নেই' });
        const mime = m[1];
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 20 * 1024 * 1024) return send(res, 400, { ok: false, message: 'সর্বোচ্চ ২০MB' });
        const kind = mime.startsWith('image/') ? 'images' : 'files';
        const safe = path.join(WORKSPACE, kind, `${Date.now().toString(36)}-${name}`);
        fs.mkdirSync(path.dirname(safe), { recursive: true });
        fs.writeFileSync(safe, buf);
        const rel = path.relative(WORKSPACE, safe).split(path.sep).join('/');
        store.audit('upload', { name, bytes: buf.length, kind });
        // টেক্সট হলে ভেতরের লেখা ফেরত দিন (মডেলের জন্য)
        let text = '';
        if (/^text\/|json|csv|javascript|xml/.test(mime) || /\.(txt|md|csv|json|js|py|html|css|yml|yaml)$/i.test(name)) {
          text = buf.toString('utf8').slice(0, 12000);
        }
        return send(res, 200, { ok: true, path: rel, url: '/files/' + encodeURI(rel), name, mime, bytes: buf.length, kind, text });
      }

      if (url.pathname === '/api/image' && req.method === 'POST') {
        const b = await readBody(req);
        const started = Date.now();
        const r = await tools.runTool('image_ops', b);
        const task = { id: store.uid(8), at: store.now(), agent: 'media', agentName: 'ছবি/মিডিয়া', prompt: `${b.op} → ${b.output}`, ok: !r.ui.error, ms: Date.now() - started, model: 'local', tools: ['image_ops'], error: r.ui.error || '' };
        const st = store.loadState();
        st.tasks = [...(st.tasks || []), task].slice(-300);
        store.saveState(st);
        return send(res, 200, { ok: !r.ui.error, text: r.text, ...r.ui });
      }

      return send(res, 404, { ok: false, message: 'no such endpoint' });
    }

    return send(res, 404, 'not found', 'text/plain');
  } catch (err) {
    store.audit('server_error', { path: url.pathname, message: String(err.message).slice(0, 200) });
    const bad = /invalid json|body too large|অবৈধ অনুরোধ/i.test(String(err.message));
    send(res, bad ? 400 : 500, { ok: false, message: bad ? 'অবৈধ অনুরোধ (JSON ভাঙা বা বড়)' : String(err.message).slice(0, 200) });
  }
};

const server = http.createServer((req, res) => { requestHandler(req, res); });

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`RAKIB AI → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`(বন্ধ করতে Ctrl+C)`);
  });
}
module.exports = { server, requestHandler, statePayload, TOKEN };

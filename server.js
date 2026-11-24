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
function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
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
const sameOrigin = (req) => {
  const o = req.headers.origin;
  if (!o) return true;
  try { const u = new URL(o); return ['127.0.0.1', 'localhost'].includes(u.hostname) || u.port === '52178'; } catch { return false; }
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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = req.socket.remoteAddress || 'local';

  try {
    if (rateLimited(ip)) return send(res, 429, { ok: false, message: 'অনেক বেশি অনুরোধ — এক মিনিট পরে চেষ্টা করুন' });

    // ---- static UI ----
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || /^\/(app\.css|app\.js|manifest\.webmanifest|sw\.js|icon-[0-9a-z]+\.png|favicon\.ico|models\.html)$/.test(url.pathname))) {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
      return fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'not found', 'text/plain');
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
    const needsToken = !['GET'].includes(req.method);
    if (url.pathname.startsWith('/api/')) {
      const given = req.headers['x-rakib-token'] || url.searchParams.get('token') || '';
      if (needsToken && given !== TOKEN) return send(res, 401, { ok: false, error: 'TOKEN', message: 'টোকেন নেই — অ্যাপ থেকে আবার চেষ্টা করুন' });
      if (!sameOrigin(req)) return send(res, 403, { ok: false, message: 'origin অনুমোদিত নয়' });

      if (url.pathname === '/api/state') return send(res, 200, await statePayload({ probe: url.searchParams.get('probe') === '1' }));
      if (url.pathname === '/api/agents') return send(res, 200, { agents: agents.list() });
      /* ---- ফেজ ৪: মডেল ইন্টেলিজেন্স ---- */
      if (url.pathname === '/api/models/live') return send(res, 200, await mintel.liveCatalogue(url.searchParams.get('force') === '1'));
      if (url.pathname === '/api/models/bench') return send(res, 200, { status: mintel.statusOf(), last: mintel.lastResults() });
      if (url.pathname === '/api/models/route') return send(res, 200, { at: new Date().toISOString(), recommendations: mintel.recommendations() });
      if (url.pathname === '/api/usage') return send(res, 200, store.loadUsage());
      if (url.pathname === '/api/audit') return send(res, 200, { events: store.readAudit(Number(url.searchParams.get('n') || 80)) });
      if (url.pathname === '/api/tasks') return send(res, 200, { tasks: (store.loadState().tasks || []).slice(-60).reverse() });

      if (url.pathname === '/api/keys' && req.method === 'POST') {
        const b = await readBody(req, 100000);
        const patch = {};
        const KEY_FIELDS = ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'COARENA_API_KEY', 'NUMES_API_KEY'];
        for (const k of KEY_FIELDS) if (k in b) patch[k] = String(b[k] || '').trim();
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
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`RAKIB AI → http://localhost:${PORT}`);
    console.log(`(বন্ধ করতে Ctrl+C)`);
  });
}
module.exports = { server, statePayload, TOKEN };

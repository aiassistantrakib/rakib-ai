/* =========================================================================
   RAKIB AI — Model Provider & Configuration Manager  (Phase 2 of recovery)
   আগে প্রোভাইডার/মডেল সব lib/config.js-এ হার্ডকোড ছিল — ব্যবহারকারী কিছু যোগ
   করতে পারতেন না। এখন সব কনফিগ data/models.json-এ থাকে, UI থেকে CRUD করা যায়।

   কী (API key) কখনোই এখানে প্লেইনটেক্সটে রাখা হয় না — lib/secrets.js
   (AES-256-GCM) ব্যবহার হয়। ফেরত পাঠানো হয় শুধু masked রূপ।
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const secrets = require('./secrets');

const F = path.join(__dirname, '..', 'data', 'models.json');
const TESTLOG = path.join(__dirname, '..', 'data', 'modeltests.json');

const TYPES = ['openai', 'ollama', 'anthropic', 'gemini'];

/* ------------------------------- storage ------------------------------- */
function blank() {
  return { version: 1, providers: [], models: [], defaultModel: '', updatedAt: new Date().toISOString() };
}

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(F, 'utf8'));
    if (!Array.isArray(j.providers)) j.providers = [];
    if (!Array.isArray(j.models)) j.models = [];
    return j;
  } catch { return blank(); }
}

function write(db) {
  db.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(F), { recursive: true });
  const tmp = F + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, F);
  return db;
}

const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* --------------------------- seed from config --------------------------- */
/* পুরনো lib/config.js-এর প্রোভাইডার/মডেল একবারই ইমপোর্ট হয় — যাতে আগের কাজ নষ্ট না হয় */
let seeded = false;
function seedFromConfig() {
  const db = read();
  if (seeded || (db.providers.length && db.models.length)) { seeded = true; return db; }
  const cfg = require('./config');
  for (const p of Object.values(cfg.PROVIDERS || {})) {
    if (db.providers.some((x) => x.id === p.id)) continue;
    db.providers.push({
      id: p.id,
      name: p.label || p.id,
      type: p.local ? 'ollama' : 'openai',
      baseUrl: p.base || '',
      keyName: p.keyName || '',
      enabled: !p.paid,
      builtin: true,
      note: p.note || '',
      storesData: !!p.storesData,
      createdAt: new Date().toISOString(),
    });
  }
  // বিল্ট-ইন ফ্রি মডেল ইমপোর্ট (paid কখনো নয়)
  const existing = new Set(db.models.map((m) => m.providerId + '::' + m.modelId));
  const push = (providerId, modelId, label, extra = {}) => {
    if (!modelId || existing.has(providerId + '::' + modelId)) return;
    existing.add(providerId + '::' + modelId);
    db.models.push({
      id: uid('m'), providerId, modelId, label: label || modelId,
      enabled: true, builtin: true, temperature: 0.7, maxTokens: 2048,
      createdAt: new Date().toISOString(), ...extra,
    });
  };
  // লোকাল Ollama মডেল — যেগুলো সত্যিই ইনস্টল করা আছে
  let local = [];
  try { const gw = require('./gateway'); local = (gw.ollamaCacheModels && gw.ollamaCacheModels().length) ? gw.ollamaCacheModels() : (gw.ollamaModels ? gw.ollamaModelsSync() : []); } catch { local = []; }
  for (const m of local) push('ollama', m.id, m.label || m.id, { local: true });
  // রিমোট ফ্রি মডেল
  for (const m of (cfg.remoteModels ? cfg.remoteModels() : [])) {
    if (!m.free) continue;
    push(m.provider, m.id, m.label || m.id, { tools: !!m.tools, ctx: m.ctx || 0 });
  }
  if (!db.defaultModel || !db.models.some((m) => m.id === db.defaultModel)) db.defaultModel = db.models.find((m) => m.providerId === 'ollama')?.id || db.models[0]?.id || '';
  seeded = true;
  return write(db);
}

/* Ollama-র আসল মডেল তালিকা এনে একবার সিড করে (অ্যাসিঙ্ক) */
let warmed = false;
async function warm() {
  if (warmed) return;
  const db = read();
  if (db.models.some((m) => m.providerId === 'ollama')) { warmed = true; return; }
  let local = [];
  try { local = await require('./gateway').ollamaModels(); } catch { local = []; }
  if (local.length) {
    const existing = new Set(db.models.map((m) => m.providerId + '::' + m.modelId));
    for (const m of local) {
      const mid = m.id || m.name;
      if (!mid || existing.has('ollama::' + mid)) continue;
      db.models.push({ id: uid('m'), providerId: 'ollama', modelId: mid, label: m.label || mid, enabled: true, builtin: true, temperature: 0.7, maxTokens: 2048, createdAt: new Date().toISOString(), local: true });
    }
    if (!db.defaultModel || !db.models.some((m) => m.id === db.defaultModel)) db.defaultModel = db.models.find((m) => m.providerId === 'ollama')?.id || db.models[0]?.id || '';
    write(db);
  }
  warmed = true;
}

/* ------------------------------ providers ------------------------------ */
function listProviders() {
  const db = seedFromConfig();
  const keys = (() => { try { return require('./store').readKeys(); } catch { return {}; } })();
  const tests = readTests();
  return db.providers.map((p) => {
    const raw = p.keyName ? keys[p.keyName] : '';
    const t = tests.providers[p.id] || {};
    return {
      ...p,
      hasKey: !!raw,
      masked: raw ? maskKey(raw) : '',
      modelCount: db.models.filter((m) => m.providerId === p.id).length,
      lastTest: t.at || '', lastTestOk: t.ok === undefined ? null : t.ok, lastTestDetail: t.detail || '', lastTestMs: t.ms || 0,
    };
  });
}

function maskKey(k) {
  const s = String(k || '');
  if (s.length <= 8) return '••••' + s.slice(-2);
  return s.slice(0, 4) + '••••••••' + s.slice(-4) + ' (' + s.length + ' অক্ষর)';
}

function addProvider(body) {
  const db = read();
  const type = TYPES.includes(body.type) ? body.type : 'openai';
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw err(400, 'প্রোভাইডারের নাম লাগবে');
  let baseUrl = String(body.baseUrl || '').trim().slice(0, 300);
  if (type === 'ollama' && !baseUrl) baseUrl = 'http://127.0.0.1:11434';
  if (!/^https?:\/\//i.test(baseUrl)) throw err(400, 'Base URL অবশ্যই http:// বা https:// দিয়ে শুরু হতে হবে');
  const id = 'p_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '_' + Math.random().toString(36).slice(2, 5);
  const keyName = 'KEY_' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30) + '_' + Math.random().toString(36).slice(2, 5).toUpperCase();
  const p = { id, name, type, baseUrl, keyName, enabled: body.enabled !== false, builtin: false, note: String(body.note || '').slice(0, 300), storesData: !!body.storesData, createdAt: new Date().toISOString() };
  db.providers.push(p);
  write(db);                                  // আগে সেভ, তারপর কী (setProviderKey ডিস্ক থেকে পড়ে)
  if (body.apiKey) setProviderKey(id, body.apiKey);
  return { ok: true, provider: p };
}

function updateProvider(id, body) {
  const db = read();
  const p = db.providers.find((x) => x.id === id);
  if (!p) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  if (body.name !== undefined) p.name = String(body.name).trim().slice(0, 60);
  if (body.baseUrl !== undefined) {
    const b = String(body.baseUrl).trim().slice(0, 300);
    if (b && !/^https?:\/\//i.test(b)) throw err(400, 'Base URL অবশ্যই http:// বা https:// দিয়ে শুরু হতে হবে');
    p.baseUrl = b;
  }
  if (body.type !== undefined && TYPES.includes(body.type)) p.type = body.type;
  if (body.enabled !== undefined) p.enabled = !!body.enabled;
  if (body.note !== undefined) p.note = String(body.note).slice(0, 300);
  if (body.storesData !== undefined) p.storesData = !!body.storesData;
  if (body.apiKey) setProviderKey(id, body.apiKey);
  write(db);
  return { ok: true, provider: p };
}

function setProviderKey(id, key) {
  const db = read();
  const p = db.providers.find((x) => x.id === id);
  if (!p) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  if (!p.keyName) { p.keyName = 'KEY_' + p.id.toUpperCase().slice(0, 30); write(db); }
  secrets.write({ [p.keyName]: String(key).trim() });
  return true;
}

function removeProvider(id) {
  const db = read();
  const p = db.providers.find((x) => x.id === id);
  if (!p) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  if (p.builtin) throw err(400, 'বিল্ট-ইন প্রোভাইডার মুছবেন না — বরং বন্ধ করুন');
  const used = db.models.filter((m) => m.providerId === id);
  if (used.length) throw err(400, `এই প্রোভাইডারের ${used.length}টি মডেল আছে — আগে মডেলগুলো মুছুন`);
  db.providers = db.providers.filter((x) => x.id !== id);
  if (p.keyName) { try { secrets.remove(p.keyName); } catch {} }
  write(db);
  return { ok: true };
}

/* -------------------------------- models -------------------------------- */
function listModels(providerId) {
  const db = seedFromConfig();
  const tests = readTests();
  return db.models
    .filter((m) => !providerId || m.providerId === providerId)
    .map((m) => ({ ...m, isDefault: m.id === db.defaultModel, lastTest: tests.models[m.id] || null }));
}

function addModel(body) {
  const db = read();
  const providerId = String(body.providerId || '');
  const p = db.providers.find((x) => x.id === providerId);
  if (!p) throw err(400, 'প্রোভাইডার পাওয়া যায়নি');
  const modelId = String(body.modelId || '').trim().slice(0, 160);
  if (!modelId) throw err(400, 'মডেল আইডি লাগবে');
  if (db.models.some((m) => m.providerId === providerId && m.modelId === modelId)) throw err(409, 'এই মডেল আগেই যোগ করা আছে');
  const m = {
    id: uid('m'), providerId, modelId, label: String(body.label || modelId).slice(0, 80),
    enabled: body.enabled !== false, builtin: false,
    temperature: num(body.temperature, 0.7, 0, 2), maxTokens: num(body.maxTokens, 2048, 64, 32000),
    createdAt: new Date().toISOString(),
  };
  db.models.push(m);
  if (!db.defaultModel) db.defaultModel = m.id;
  write(db);
  return { ok: true, model: m };
}

function updateModel(id, body) {
  const db = read();
  const m = db.models.find((x) => x.id === id);
  if (!m) throw err(404, 'মডেল পাওয়া যায়নি');
  if (body.label !== undefined) m.label = String(body.label).slice(0, 80);
  if (body.enabled !== undefined) m.enabled = !!body.enabled;
  if (body.temperature !== undefined) m.temperature = num(body.temperature, m.temperature, 0, 2);
  if (body.maxTokens !== undefined) m.maxTokens = num(body.maxTokens, m.maxTokens, 64, 32000);
  if (body.modelId !== undefined && String(body.modelId).trim()) m.modelId = String(body.modelId).trim().slice(0, 160);
  write(db);
  return { ok: true, model: m };
}

function removeModel(id) {
  const db = read();
  if (!db.models.some((x) => x.id === id)) throw err(404, 'মডেল পাওয়া যায়নি');
  db.models = db.models.filter((x) => x.id !== id);
  if (db.defaultModel === id) db.defaultModel = db.models.find((m) => m.enabled)?.id || '';
  write(db);
  return { ok: true };
}

function setDefaultModel(id) {
  const db = read();
  if (!db.models.some((m) => m.id === id)) throw err(404, 'মডেল পাওয়া যায়নি');
  db.defaultModel = id;
  write(db);
  return { ok: true, defaultModel: id };
}

/* ------------------------------ resolution ------------------------------ */
/* মডেল আইডি → gateway-এর প্রত্যাশিত ফরম্যাট {provider, id, label, local, temperature, maxTokens} */
function resolve(modelId) {
  const db = seedFromConfig();
  const m = db.models.find((x) => x.id === modelId) || db.models.find((x) => x.id === db.defaultModel);
  if (!m) return null;
  const p = db.providers.find((x) => x.id === m.providerId);
  if (!p) return null;
  return {
    key: m.id, provider: p.id, id: m.modelId, label: m.label, modelId: m.modelId,
    local: p.type === 'ollama', type: p.type, baseUrl: p.baseUrl,
    temperature: m.temperature, maxTokens: m.maxTokens,
    enabled: m.enabled && p.enabled, providerEnabled: p.enabled,
  };
}

function resolveDefault() {
  const db = seedFromConfig();
  return resolve(db.defaultModel);
}

function enabledModels() {
  const db = seedFromConfig();
  return db.models.filter((m) => {
    const p = db.providers.find((x) => x.id === m.providerId);
    return m.enabled && p && p.enabled;
  }).map((m) => resolve(m.id));
}

/* --------------------------------- tests --------------------------------- */
function readTests() {
  try { return JSON.parse(fs.readFileSync(TESTLOG, 'utf8')); } catch { return { providers: {}, models: {} }; }
}
function writeTest(kind, id, rec) {
  const t = readTests();
  t[kind] = t[kind] || {};
  t[kind][id] = rec;
  try { fs.mkdirSync(path.dirname(TESTLOG), { recursive: true }); fs.writeFileSync(TESTLOG, JSON.stringify(t, null, 2)); } catch {}
}

function keyFor(providerId) {
  const db = read();
  const p = db.providers.find((x) => x.id === providerId);
  if (!p || !p.keyName) return '';
  try { return require('./store').readKeys()[p.keyName] || ''; } catch { return ''; }
}

/* কানেকশন টেস্ট — শুধু প্রোভাইডার/কী/এন্ডপয়েন্ট সত্যি আছে কি না */
async function testProvider(providerId, override = {}) {
  const db = read();
  const p = db.providers.find((x) => x.id === providerId);
  if (!p && !override.baseUrl) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  const baseUrl = (override.baseUrl || p?.baseUrl || '').replace(/\/+$/, '');
  const type = override.type || p?.type || 'openai';
  const key = override.apiKey || (p ? keyFor(p.id) : '');
  const t0 = Date.now();
  let out;
  try {
    if (type === 'ollama') {
      const r = await fetch(baseUrl + '/api/tags', { signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      const n = (j.models || []).length;
      out = { ok: r.ok, detail: r.ok ? `${n}টি মডেল পাওয়া গেছে` : 'HTTP ' + r.status, models: (j.models || []).map((m) => m.name).slice(0, 40) };
    } else {
      if (!key && !override.allowNoKey) out = { ok: false, detail: 'API key সংরক্ষিত নেই' };
      else {
        const r = await fetch(baseUrl + '/models', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(12000) });
        const txt = await r.text();
        let j = {}; try { j = JSON.parse(txt); } catch {}
        const n = (j.data || j.models || []).length;
        out = {
          ok: r.ok,
          detail: r.ok ? `${n}টি মডেল দেখা যাচ্ছে` : 'HTTP ' + r.status + ': ' + (j?.error?.message || txt.slice(0, 140)),
          models: (j.data || j.models || []).map((m) => m.id || m.name).slice(0, 60),
        };
      }
    }
  } catch (e) { out = { ok: false, detail: String(e.message).slice(0, 200) }; }
  const rec = { ...out, at: new Date().toISOString(), ms: Date.now() - t0 };
  if (p) writeTest('providers', p.id, rec);
  return rec;
}

/* আসল inference টেস্ট — মডেল সত্যিই উত্তর দিতে পারে কি না */
async function testInference(modelRowId, opts = {}) {
  const db = read();
  const m = db.models.find((x) => x.id === modelRowId);
  if (!m) throw err(404, 'মডেল পাওয়া যায়নি');
  const p = db.providers.find((x) => x.id === m.providerId);
  if (!p) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  const key = keyFor(p.id);
  const baseUrl = (p.baseUrl || '').replace(/\/+$/, '');
  const prompt = String(opts.prompt || 'Reply with exactly: RAKIB-OK').slice(0, 500);
  const t0 = Date.now();
  let out;
  try {
    if (p.type === 'ollama') {
      const r = await fetch(baseUrl + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.modelId, messages: [{ role: 'user', content: prompt }], stream: false, think: false, options: { temperature: 0.2, num_predict: 64, num_ctx: 4096 } }),
        signal: AbortSignal.timeout(Number(opts.timeoutMs) || 180000),
      });
      const txt = await r.text();
      let j = {}; try { j = JSON.parse(txt); } catch {}
      out = r.ok ? { ok: true, reply: String(j.message?.content || '').slice(0, 500), detail: 'উত্তর পাওয়া গেছে' }
                 : { ok: false, detail: 'HTTP ' + r.status + ': ' + (j.error || txt.slice(0, 140)) };
    } else {
      if (!key) out = { ok: false, detail: 'API key সংরক্ষিত নেই' };
      else {
        const r = await fetch(baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: m.modelId, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 64, stream: false }),
          signal: AbortSignal.timeout(Number(opts.timeoutMs) || 90000),
        });
        const txt = await r.text();
        let j = {}; try { j = JSON.parse(txt); } catch {}
        out = r.ok
          ? { ok: true, reply: String(j.choices?.[0]?.message?.content || '').slice(0, 500), detail: 'উত্তর পাওয়া গেছে', usage: j.usage || null }
          : { ok: false, detail: 'HTTP ' + r.status + ': ' + (j?.error?.message || txt.slice(0, 140)) };
      }
    }
  } catch (e) { out = { ok: false, detail: String(e.message).slice(0, 200) }; }
  const rec = { ...out, at: new Date().toISOString(), ms: Date.now() - t0, modelId: m.modelId, providerId: p.id };
  writeTest('models', m.id, rec);
  return rec;
}

/* বিল্ট-ইন কী-ওয়ালা প্রোভাইডারের জন্য মডেল ডিসকভারি */
async function discoverModels(providerId) {
  const db = read();
  const p = db.providers.find((x) => x.id === providerId);
  if (!p) throw err(404, 'প্রোভাইডার পাওয়া যায়নি');
  const baseUrl = (p.baseUrl || '').replace(/\/+$/, '');
  let ids = [];
  if (p.type === 'ollama') {
    const r = await fetch(baseUrl + '/api/tags', { signal: AbortSignal.timeout(10000) });
    ids = ((await r.json()).models || []).map((m) => m.name);
  } else {
    const key = keyFor(p.id);
    const r = await fetch(baseUrl + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {}, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    ids = (j.data || j.models || []).map((m) => m.id || m.name);
  }
  const existing = new Set(db.models.filter((m) => m.providerId === providerId).map((m) => m.modelId));
  return { ok: true, total: ids.length, models: ids.slice(0, 300).map((x) => ({ modelId: x, added: existing.has(x) })) };
}

/* -------------------------------- helpers -------------------------------- */
function num(v, d, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
}
function err(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = {
  F, TYPES, read, write, seedFromConfig,
  listProviders, addProvider, updateProvider, removeProvider, setProviderKey, maskKey,
  listModels, addModel, updateModel, removeModel, setDefaultModel,
  resolve, resolveDefault, enabledModels, warm,
  testProvider, testInference, discoverModels, readTests, keyFor,
};

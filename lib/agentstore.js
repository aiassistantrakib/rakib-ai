/* =========================================================================
   RAKIB AI — Agent Store  (Phase 3 of recovery)
   আগে ১৪ এজেন্ট lib/agents/index.js-এ হার্ডকোড ছিল: নিজের মডেল নেই, কী নেই,
   এডিট করা যায় না। এখন প্রতিটি এজেন্টের নিজের মডেল/কী/টেম্পারেচার/টুল/
   পারমিশন/অনুমোদন-নীতি data/agents.json-এ থাকে এবং UI থেকে সম্পূর্ণ এডিটযোগ্য।

   বিল্ট-ইন ১৪ এজেন্ট প্রথমবার ইমপোর্ট হয় — কিছু নষ্ট হয় না।
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const builtin = require('./agents');
const models = require('./models');
const tools = require('./tools');

const F = path.join(__dirname, '..', 'data', 'agents.json');

function blank() { return { version: 1, agents: [], updatedAt: new Date().toISOString() }; }

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(F, 'utf8'));
    if (!Array.isArray(j.agents)) j.agents = [];
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

const uid = () => 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ALL_TOOLS = () => Object.keys(tools.tools || {});

/* ------------------------------ seed ------------------------------ */
let seeded = false;
function seed() {
  if (seeded) return read();
  const db = read();
  const existing = new Set(db.agents.map((a) => a.id));
  for (const a of builtin.AGENTS || []) {
    if (existing.has(a.id)) continue;
    db.agents.push({
      id: a.id,
      name: a.name,
      bn: a.bn || a.name,
      role: a.role || '',
      system: a.system || '',
      modelRowId: '',                 // খালি = ডিফল্ট মডেল
      temperature: 0.7,
      maxTokens: 2048,
      tools: Array.isArray(a.tools) ? a.tools.filter((t) => ALL_TOOLS().includes(t)) : [],
      permissions: { read: true, write: false, sensitive: false },
      approval: 'sensitive',          // always | sensitive | never
      enabled: true,
      builtin: true,
      tier: a.tier || 'general',
      createdAt: new Date().toISOString(),
    });
  }
  seeded = true;
  return write(db);
}

/* ------------------------------ helpers ------------------------------ */
function normTools(list) {
  const all = ALL_TOOLS();
  return Array.from(new Set((Array.isArray(list) ? list : []).map(String))).filter((t) => all.includes(t)).slice(0, 40);
}
function normApproval(v) { return ['always', 'sensitive', 'never'].includes(v) ? v : 'sensitive'; }
function num(v, d, min, max) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; }

function decorate(a) {
  const m = a.modelRowId ? models.listModels().find((x) => x.id === a.modelRowId) : null;
  const dflt = models.resolveDefault();
  const eff = m ? { rowId: m.id, label: m.label, modelId: m.modelId, providerId: m.providerId } : (dflt ? { rowId: dflt.key, label: dflt.label, modelId: dflt.id, providerId: dflt.provider } : null);
  return {
    ...a,
    toolCount: (a.tools || []).length,
    modelRowId: a.modelRowId || '',
    modelLabel: eff ? eff.label : 'কোনো মডেল নেই',
    modelProvider: eff ? eff.providerId : '',
    modelIsDefault: !a.modelRowId,
    modelOk: !!eff,
  };
}

/* ------------------------------- CRUD ------------------------------- */
function list() { return seed().agents.map(decorate); }

function get(id) {
  const a = seed().agents.find((x) => x.id === id);
  return a ? decorate(a) : null;
}

function create(body) {
  const db = seed();
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw err(400, 'এজেন্টের নাম লাগবে');
  const id = uid();
  const a = {
    id, name,
    bn: String(body.bn || name).slice(0, 60),
    role: String(body.role || '').slice(0, 300),
    system: String(body.system || '').slice(0, 8000),
    modelRowId: body.modelRowId ? String(body.modelRowId) : '',
    temperature: num(body.temperature, 0.7, 0, 2),
    maxTokens: num(body.maxTokens, 2048, 64, 32000),
    tools: normTools(body.tools),
    permissions: {
      read: body.permissions?.read !== false,
      write: !!body.permissions?.write,
      sensitive: !!body.permissions?.sensitive,
    },
    approval: normApproval(body.approval),
    enabled: body.enabled !== false,
    builtin: false,
    tier: String(body.tier || 'general').slice(0, 20),
    createdAt: new Date().toISOString(),
  };
  if (a.modelRowId && !models.listModels().some((m) => m.id === a.modelRowId)) throw err(400, 'নির্বাচিত মডেল পাওয়া যায়নি');
  db.agents.push(a);
  write(db);
  return { ok: true, agent: decorate(a) };
}

function update(id, body) {
  const db = seed();
  const a = db.agents.find((x) => x.id === id);
  if (!a) throw err(404, 'এজেন্ট পাওয়া যায়নি');
  if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 60); if (!n) throw err(400, 'নাম খালি রাখা যাবে না'); a.name = n; }
  if (body.bn !== undefined) a.bn = String(body.bn).slice(0, 60);
  if (body.role !== undefined) a.role = String(body.role).slice(0, 300);
  if (body.system !== undefined) a.system = String(body.system).slice(0, 8000);
  if (body.modelRowId !== undefined) {
    const mid = String(body.modelRowId || '');
    if (mid && !models.listModels().some((m) => m.id === mid)) throw err(400, 'নির্বাচিত মডেল পাওয়া যায়নি');
    a.modelRowId = mid;
  }
  if (body.temperature !== undefined) a.temperature = num(body.temperature, a.temperature, 0, 2);
  if (body.maxTokens !== undefined) a.maxTokens = num(body.maxTokens, a.maxTokens, 64, 32000);
  if (body.tools !== undefined) a.tools = normTools(body.tools);
  if (body.permissions !== undefined) {
    a.permissions = {
      read: body.permissions?.read !== false,
      write: !!body.permissions?.write,
      sensitive: !!body.permissions?.sensitive,
    };
  }
  if (body.approval !== undefined) a.approval = normApproval(body.approval);
  if (body.enabled !== undefined) a.enabled = !!body.enabled;
  if (body.tier !== undefined) a.tier = String(body.tier).slice(0, 20);
  write(db);
  return { ok: true, agent: decorate(a) };
}

function remove(id) {
  const db = seed();
  const a = db.agents.find((x) => x.id === id);
  if (!a) throw err(404, 'এজেন্ট পাওয়া যায়নি');
  if (a.builtin) throw err(400, 'বিল্ট-ইন এজেন্ট মুছবেন না — বন্ধ করুন');
  db.agents = db.agents.filter((x) => x.id !== id);
  write(db);
  return { ok: true };
}

/* --------------------------- execution config --------------------------- */
/* টাস্ক রানার এটা ব্যবহার করবে: এজেন্টের নিজের মডেল, টেম্পারেচার, টুল, অনুমোদন-নীতি */
function execConfig(id) {
  const a = seed().agents.find((x) => x.id === id);
  if (!a) return null;
  const m = a.modelRowId ? models.resolve(a.modelRowId) : models.resolveDefault();
  return {
    id: a.id, name: a.name, system: a.system, enabled: a.enabled,
    model: m, temperature: a.temperature, maxTokens: a.maxTokens,
    tools: a.tools || [], permissions: a.permissions || {}, approval: a.approval || 'sensitive',
  };
}

/* মেসেজের জন্য সবচেয়ে উপযুক্ত সক্রিয় এজেন্ট (পুরনো pickAgent লজিক + সেভ করা কনফিগ) */
function pick(text, hasImage = false) {
  const db = seed();
  const enabled = db.agents.filter((a) => a.enabled);
  const base = builtin.pickAgent ? builtin.pickAgent(text, hasImage) : 'chief';
  if (enabled.some((a) => a.id === base)) return base;
  return enabled[0]?.id || base;
}

function err(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = { F, seed, list, get, create, update, remove, execConfig, pick, ALL_TOOLS, normTools };

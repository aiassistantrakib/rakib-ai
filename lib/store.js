/* =========================================================================
   RAKIB AI — store: keys, JSON persistence, audit log, cost/usage ledger
   কোনো ডাটাবেস ইনস্টল ছাড়াই — ফাইলেই সব, zero dependency।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA } = require('./config');

const F = {
  keys: path.join(DATA, 'keys.json'),
  state: path.join(DATA, 'state.json'),
  usage: path.join(DATA, 'usage.json'),
  audit: path.join(DATA, 'logs', 'audit.log'),
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ------------------------------ keys ------------------------------ */
function readKeys() {
  const env = {};
  try {
    const txt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return { ...env, ...readJson(F.keys, {}) };
}
function writeKeys(patch) {
  const cur = readJson(F.keys, {});
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v !== 'string') continue;
    if (!v.trim()) delete cur[k];
    else cur[k] = v.trim();
  }
  writeJson(F.keys, cur);
  return cur;
}
const mask = (k) => (!k ? '' : k.length <= 10 ? '••••' : k.slice(0, 5) + '••••' + k.slice(-4));

/* ------------------------------ secrets redaction ------------------------------ */
const SECRET_PATTERNS = [
  /\bsk-or-v1-[A-Za-z0-9_-]{8,}/g,
  /\bgsk_[A-Za-z0-9]{8,}/g,
  /\bsk-[A-Za-z0-9]{16,}/g,
  /\b(?:OPENROUTER_API_KEY|GROQ_API_KEY|API_KEY|TOKEN)\s*[=:]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
];
function redact(text) {
  let s = String(text ?? '');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[REDACTED]');
  return s;
}

/* ------------------------------ audit ------------------------------ */
function audit(event, detail = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...detail });
  try { fs.appendFileSync(F.audit, redact(line) + '\n'); } catch {}
}
function readAudit(limit = 100) {
  try {
    const lines = fs.readFileSync(F.audit, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch { return []; }
}

/* ------------------------------ usage / cost ------------------------------ */
// কোনো paid মডেল ব্যবহারই হয় না, তাই বাস্তব খরচ 0। তবু "কত সেভ হলো" দেখানোর জন্য
// paid রেফারেন্স দাম দিয়ে হিসাব রাখা হয় — সেটা স্পষ্টভাবে "avoided cost"।
function loadUsage() {
  return readJson(F.usage, { total: { calls: 0, inTok: 0, outTok: 0, avoidedUsd: 0 }, byModel: {}, byDay: {}, byProvider: {} });
}
function addUsage({ provider, model, label, inTok = 0, outTok = 0, avoidedUsd = 0, ms = 0 }) {
  const u = loadUsage();
  const day = new Date().toISOString().slice(0, 10);
  u.total.calls++;
  u.total.inTok += inTok; u.total.outTok += outTok; u.total.avoidedUsd = +(u.total.avoidedUsd + avoidedUsd).toFixed(6);
  const bump = (obj, k) => {
    obj[k] = obj[k] || { calls: 0, inTok: 0, outTok: 0, avoidedUsd: 0, ms: 0 };
    obj[k].calls++; obj[k].inTok += inTok; obj[k].outTok += outTok;
    obj[k].avoidedUsd = +(obj[k].avoidedUsd + avoidedUsd).toFixed(6);
    obj[k].ms += ms;
  };
  bump(u.byModel, model);
  bump(u.byDay, day);
  bump(u.byProvider, provider);
  writeJson(F.usage, u);
  return u;
}

/* ------------------------------ app state (tasks, history, settings) ------------------------------ */
const DEFAULT_STATE = {
  version: 1,
  settings: {
    system: "You are RAKIB AI — a precise, helpful multi-agent assistant. Answer in the user's language (Bengali if they write Bengali). Be concise unless asked for depth.",
    temperature: 0.7,
    max_tokens: 2048,
    mode: 'auto',
    pinned: null,
    tools: ['calculator', 'web_search', 'fetch_url', 'read_file', 'write_file', 'list_files', 'image_ops', 'run_js'],
    theme: 'dark',
    publicAccess: false,
  },
  conversations: [],
  tasks: [],
  health: {},
};
function loadState() {
  const s = readJson(F.state, null);
  if (!s) return JSON.parse(JSON.stringify(DEFAULT_STATE));
  return { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
}
function saveState(s) { writeJson(F.state, s); }

const uid = (n = 10) => crypto.randomBytes(n).toString('hex');
const now = () => new Date().toISOString();

module.exports = { F, readJson, writeJson, readKeys, writeKeys, mask, redact, audit, readAudit, loadUsage, addUsage, loadState, saveState, uid, now };

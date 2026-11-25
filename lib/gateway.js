/* =========================================================================
   RAKIB AI — Model Gateway
   এক জায়গা থেকে সব মডেল: টাস্ক-রাউটিং, ফলব্যাক, cooldown, হেলথ-চেক,
   টোকেন/খরচ হিসাব, রেট-লিমিট সামলানো। কোনো paid মডেল কখনোই ব্যবহার হবে না।
   ========================================================================= */
'use strict';
const { PROVIDERS, TIERS, COOLDOWN_MS, PAID_REFERENCE } = require('./config');
const { readKeys, audit, addUsage } = require('./store');

const cooldown = new Map(); // "provider:id" -> expiresAt
const stats = new Map();    // "provider:id" -> { ok, fail, lastMs, lastErr, lastAt }
let ollamaCache = { at: 0, models: [] };

const keyOf = (m) => `${m.provider}:${m.id}`;
const cKey = (m) => `${m.provider}:${m.id}`;

/* ---------------------------- Ollama discovery ---------------------------- */
async function ollamaModels(force = false) {
  if (!force && Date.now() - ollamaCache.at < 8000) return ollamaCache.models;
  try {
    const r = await fetch(PROVIDERS.ollama.base + '/api/tags', { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const models = (j.models || []).map((m) => {
      const name = m.name || m.model;
      const caps = m.capabilities || [];
      const sizeGb = +(m.size / 1e9).toFixed(1);
      return {
        provider: 'ollama',
        id: name,
        label: name.replace(/:latest$/, ''),
        free: true,
        local: true,
        ctx: m.details?.context_length || 8192,
        sizeGb,
        inp: caps.includes('vision') ? ['text', 'image'] : ['text'],
        tools: caps.includes('tools'),
        tiers: [sizeGb <= 5 ? 'fast' : 'deep', 'general', 'code'],
        caps,
        params: m.details?.parameter_size || '',
      };
    });
    ollamaCache = { at: Date.now(), models };
    return models;
  } catch {
    ollamaCache = { at: Date.now(), models: [] };
    return [];
  }
}
const ollamaUp = () => ollamaCache.models.length > 0;

/* ---------------------------- model catalogue ---------------------------- */
async function catalogue() {
  const keys = readKeys();
  const local = await ollamaModels();
  const remote = require('./config').remoteModels().map((m) => ({ ...m, hasKey: !!keys[PROVIDERS[m.provider].keyName] }));
  return [...local.map((m) => ({ ...m, hasKey: true })), ...remote];
}

function modelStatus() {
  const now = Date.now();
  const rows = [];
  for (const m of ollamaCache.models) rows.push(decorate(m, now));
  for (const m of require('./config').remoteModels()) rows.push(decorate(m, now));
  return rows;
}
function decorate(m, now = Date.now()) {
  const st = stats.get(keyOf(m)) || {};
  return { ...m, cooldown: Math.max(0, Math.round(((cooldown.get(keyOf(m)) || 0) - now) / 1000)), stats: st };
}

/* ---------------------------- routing ---------------------------- */
function needsVision(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image_url'));
}
function wantsTools(opts) { return !!(opts.toolSpecs && opts.toolSpecs.length); }

/**
 * রাউটিং অর্ডার: pinned → টাস্ক-টিয়ার মিল → লোকাল (key-ছাড়া) → রিমোট ফ্রি
 * নিরাপত্তা: শুধু `free` মডেল, শুধু installed লোকাল মডেল, শুধু যাদের key আছে।
 */
function route({ messages = [], task = 'general', pinned = null, toolSpecs = [] } = {}) {
  const keys = readKeys();
  const vision = needsVision(messages);
  const tools = wantsTools({ toolSpecs });
  const ALIAS = { bengali_support: 'general', data: 'deep', bengali: 'general', support: 'general' };
  const taskKey = ALIAS[task] || task;
  const tierOrder = TIERS[taskKey] || TIERS.general;

  // ব্যবহারকারীর সেটিং: বন্ধ প্রোভাইডার কখনোই প্রার্থী নয়
  let disabled = [], pinnedCfg = pinned, fallbackList = [];
  try {
    const st = require('./store').loadState().settings || {};
    disabled = st.disabledProviders || [];
    fallbackList = st.fallbackModels || [];
    if (!pinnedCfg && st.pinnedModel) pinnedCfg = st.pinnedModel;
  } catch {}

  const usable = [];
  for (const m of ollamaCache.models) { if (!disabled.includes('ollama')) usable.push({ ...m, source: 'local' }); }
  for (const m of require('./config').remoteModels()) {
    if (disabled.includes(m.provider)) continue;
    if (!keys[PROVIDERS[m.provider].keyName]) continue;
    usable.push({ ...m, source: 'remote' });
  }
  const ok = usable.filter((m) => (!vision || m.inp.includes('image')) && (!tools || m.tools));
  let benchByModel = null;
  try { const saved = require('./modelbench').loadResults(); if (saved) benchByModel = saved.byModel; } catch {}
  const score = (m) => {
    let s = 0;
    for (const t of m.tiers || []) {
      const i = tierOrder.indexOf(t);
      if (i >= 0) s = Math.max(s, 100 - i * 10);
    }
    if (m.source === 'local') s += 15;            // key-ছাড়া পথকে অগ্রাধিকার
    if (m.provider === 'groq') s += 8;            // দ্রুত
    if (m.id.endsWith(':free')) s += 4;
    // ফেজ ৪: লাইভ বেঞ্চমার্ক থাকলে সেটাই আসল মাপকাঠি
    const b = benchByModel && benchByModel[keyOf(m)];
    if (b) {
      s += Math.round((b.passRate || 0) * 30);
      if (b.avgMs) s -= Math.min(20, Math.round(b.avgMs / 600));
      if (b.dead) s -= 200;                        // ০ পাস → প্রায় শেষে
    }
    return s;
  };
  const now = Date.now();
  const sorted = ok.slice().sort((a, b) => score(b) - score(a));
  const healthy = sorted.filter((m) => (cooldown.get(keyOf(m)) || 0) <= now);
  const cooling = sorted.filter((m) => (cooldown.get(keyOf(m)) || 0) > now);
  let order = [...healthy, ...cooling];
  if (pinnedCfg) {
    const p = usable.find((m) => keyOf(m) === pinnedCfg);
    if (p) order = [p, ...order.filter((m) => keyOf(m) !== pinnedCfg)];
  }
  if (fallbackList.length) {
    const head = fallbackList.map((id) => usable.find((m) => keyOf(m) === id)).filter(Boolean);
    const rest = order.filter((m) => !fallbackList.includes(keyOf(m)));
    if (head.length) order = [...head, ...rest];
  }
  return order;
}

/* ---------------------------- providers ---------------------------- */
function isRetryable(status, msg = '') {
  if (!status) return true;                        // নেটওয়ার্ক
  if ([408, 409, 425, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  if (/rate.?limit|overloaded|timeout|temporar|unavailable|no available|capacity/i.test(msg)) return true;
  return false;
}

function openAiMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: String(m.content ?? '') };
    if (m.role === 'assistant' && m.tool_calls) return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
    return { role: m.role, content: m.content };
  });
}

async function callRemote(m, messages, opts) {
  const p = PROVIDERS[m.provider];
  const key = readKeys()[p.keyName];
  if (!key) { const e = new Error('NO_KEY'); e.status = 401; e.code = 'NO_KEY'; throw e; }
  const body = {
    model: m.id,
    messages: openAiMessages(messages),
    temperature: opts.temperature ?? 0.7,
    max_tokens: Math.max(64, opts.max_tokens || 2048),
    stream: false,
  };
  if (opts.toolSpecs?.length) { body.tools = opts.toolSpecs; body.tool_choice = 'auto'; }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    if (m.provider === 'openrouter') { headers['HTTP-Referer'] = 'http://localhost'; headers['X-Title'] = 'RAKIB AI'; }
  if (m.provider === 'coarena') { headers['HTTP-Referer'] = 'http://localhost'; }

  const res = await fetch(p.base + '/chat/completions', {
    method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs || 60000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j?.error?.message || j?.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  let data; try { data = JSON.parse(text); } catch { throw new Error('bad JSON from provider'); }
  const choice = data.choices?.[0]?.message || {};
  const toolCalls = (choice.tool_calls || []).map((c, i) => ({
    id: c.id || `call_${i}`,
    type: 'function',
    function: { name: c.function?.name, arguments: c.function?.arguments || '{}' },
  })).filter((c) => c.function.name);
  return {
    content: choice.content || '',
    toolCalls,
    usage: { inTok: data.usage?.prompt_tokens || 0, outTok: data.usage?.completion_tokens || 0 },
  };
}

/* ---------------------------- Ollama (native API) ---------------------------- */
function toOllamaMessages(messages) {
  return messages.map((m) => {
    if (Array.isArray(m.content)) {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
      const images = m.content.filter((b) => b.type === 'image_url').map((b) => (b.image_url?.url || '').replace(/^data:[^,]*,/, ''));
      const o = { role: m.role, content: text };
      if (images.length) o.images = images;
      return o;
    }
    if (m.role === 'tool') return { role: 'tool', content: String(m.content ?? '') };
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map((c) => ({ function: { name: c.function?.name, arguments: safeJson(c.function?.arguments) } })) };
    }
    return { role: m.role, content: String(m.content ?? '') };
  });
}
function safeJson(a) { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return {}; } }

async function callLocal(m, messages, opts) {
  const body = {
    model: m.id,
    messages: toOllamaMessages(messages),
    stream: false,
    think: false,
    options: {
      temperature: opts.temperature ?? 0.7,
      num_predict: Math.max(opts.max_tokens || 2048, 1024),
      num_ctx: Math.min(16384, Math.max(4096, opts.num_ctx || 8192)),
    },
  };
  if (opts.toolSpecs?.length) body.tools = opts.toolSpecs;
  const res = await fetch(PROVIDERS.ollama.base + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs || 300000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error || msg; } catch {}
    const e = new Error(msg); e.status = res.status === 404 ? 400 : res.status; e.local = true; throw e;
  }
  let data; try { data = JSON.parse(text); } catch { throw new Error('bad JSON from Ollama'); }
  const msg = data.message || {};
  const toolCalls = (msg.tool_calls || []).map((c, i) => ({
    id: `ocall_${i}_${Date.now().toString(36)}`,
    type: 'function',
    function: { name: c.function?.name, arguments: JSON.stringify(safeJson(c.function?.arguments)) },
  })).filter((c) => c.function.name);
  let content = msg.content || '';
  if (!content.trim() && msg.thinking) content = msg.thinking;
  return {
    content,
    toolCalls,
    usage: { inTok: data.prompt_eval_count || 0, outTok: data.eval_count || 0 },
    local: true,
    evalMs: Math.round((data.eval_duration || 0) / 1e6),
  };
}

/* ---------------------------- one call, with health bookkeeping ---------------------------- */
async function callModel(m, messages, opts = {}) {
  const started = Date.now();
  const k = keyOf(m);
  try {
    const out = m.provider === 'ollama'
      ? await callLocal(m, messages, opts)
      : await callRemote(m, messages, opts);
    const ms = Date.now() - started;
    stats.set(k, { ...(stats.get(k) || {}), ok: (stats.get(k)?.ok || 0) + 1, lastMs: ms, lastAt: new Date().toISOString(), lastErr: '' });
    cooldown.delete(k);
    // avoided cost: paid reference price × tokens (only informational — we never paid)
    const ref = PAID_REFERENCE['deepseek/deepseek-v4.1-flash'];
    const avoided = ref ? (out.usage.inTok * ref.prompt + out.usage.outTok * ref.completion) : 0;
    addUsage({ provider: m.provider, model: m.id, inTok: out.usage.inTok, outTok: out.usage.outTok, avoidedUsd: avoided, ms });
    return { ...out, ms, model: { provider: m.provider, id: m.id, label: m.label, local: !!m.local } };
  } catch (err) {
    const ms = Date.now() - started;
    const retry = err.code === 'NO_KEY' ? false : isRetryable(err.status, err.message);
    if (retry) cooldown.set(k, Date.now() + COOLDOWN_MS);
    stats.set(k, { ...(stats.get(k) || {}), fail: (stats.get(k)?.fail || 0) + 1, lastMs: ms, lastAt: new Date().toISOString(), lastErr: String(err.message).slice(0, 200) });
    audit('model_error', { model: k, status: err.status || 0, retry, message: String(err.message).slice(0, 200) });
    err.retryable = retry;
    err.modelKey = k;
    throw err;
  }
}

/* ---------------------------- health ---------------------------- */
async function health({ probe = false, cache = false } = {}) {
  const keys = readKeys();
  const out = { ollama: { up: false, models: 0, ms: 0 } };
  for (const id of Object.keys(PROVIDERS)) if (!PROVIDERS[id].local) out[id] = { key: !!keys[PROVIDERS[id].keyName], paid: !!PROVIDERS[id].paid };
  const t = Date.now();
  const models = await ollamaModels(!cache);
  out.ollama = { up: models.length > 0, models: models.length, ms: Date.now() - t, names: models.map((m) => m.id) };
  if (probe) {
    for (const [prov, p] of Object.entries(PROVIDERS)) {
      if (p.local) continue;
      if (!keys[p.keyName]) { out[prov].probe = 'no-key'; continue; }
      try {
        const r = await fetch(p.base + '/models', { headers: { Authorization: `Bearer ${keys[p.keyName]}` }, signal: AbortSignal.timeout(8000) });
        out[prov].probe = r.ok ? 'ok' : 'http-' + r.status;
      } catch (e) { out[prov].probe = 'down'; }
    }
  }
  return out;
}

/* একটি প্রোভাইডারকে আলাদাভাবে যাচাই (কানেকশন টেস্ট বাটনের জন্য) */
async function probeProvider(id) {
  const p = PROVIDERS[id];
  if (!p) return { ok: false, detail: 'অজানা প্রোভাইডার' };
  if (p.local) { const m = await ollamaModels(true); return { ok: m.length > 0, detail: m.length ? m.length + ' মডেল' : 'Ollama বন্ধ' }; }
  const key = readKeys()[p.keyName];
  if (!key) return { ok: false, detail: 'কী নেই' };
  try {
    const r = await fetch(p.base + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (r.ok) { const j = await r.json().catch(() => ({})); const n = (j.data || j.models || []).length; return { ok: true, detail: `${n} মডেল` }; }
    const body = await r.text().catch(() => '');
    return { ok: false, status: r.status, detail: `HTTP ${r.status} ${body.slice(0, 100)}`.trim() };
  } catch (e) { return { ok: false, detail: String(e.message).slice(0, 120) }; }
}

module.exports = {
  ollamaModels, ollamaUp, catalogue, modelStatus, route, callModel, isRetryable, health, keyOf, probeProvider,
  cooldownSize: () => cooldown.size,
};

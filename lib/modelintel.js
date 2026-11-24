/* =========================================================================
   RAKIB AI — ফেজ ৪/৫ মডেল ইন্টেলিজেন্স ড্যাশবোর্ড (এক ফাইল, কোনো বিল্ড নয়)
   আসল ডেটা /api/models/live থেকে; key ছাড়া যা চলে তা-ও দেখায়।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const mb = require('./modelbench');
const { readKeys, audit } = require('./store');
const { PROVIDERS } = require('./config');

const LOCAL_MODELS = [
  { id: 'qwen3.5:4b', label: 'Qwen 3.5 4B (লোকাল)', provider: 'ollama', ctx: 8192, inp: ['text', 'image'], tools: true, free: true, price: '$0 (এই কম্পিউটার)' },
];

/* ---------- লাইভ ক্যাটালগ ক্যাশ (৬০ সেকেন্ড) ---------- */
let cache = { at: 0, data: null };
async function liveCatalogue(force = false) {
  if (!force && cache.data && Date.now() - cache.at < 60000) return cache.data;
  const keys = readKeys();
  const or = await mb.listProviderModels('openrouter');
  const groq = keys.GROQ_API_KEY ? await mb.listProviderModels('groq') : { provider: 'groq', ok: false, status: 401, models: [] };
  const coarena = keys.COARENA_API_KEY ? await mb.listProviderModels('coarena') : { provider: 'coarena', ok: false, status: 401, models: [] };
  const rows = [];
  for (const m of LOCAL_MODELS) rows.push({ ...m, source: 'local', keyNeeded: false, ready: true, privacy: 'লোকাল — ডেটা বেরোয় না' });
  for (const m of or.models) {
    const free = m.free && !/^google\/lyria/.test(m.id);
    rows.push({
      id: m.id, label: m.name, provider: 'openrouter', ctx: m.ctx, inp: m.input, tools: m.tools, free,
      price: free ? '$0 (ফ্রি)' : `$${(m.promptPrice ?? 0) * 1e6}/M ইন · $${(m.completionPrice ?? 0) * 1e6}/M আউট`,
      keyNeeded: true, ready: free && !!keys.OPENROUTER_API_KEY,
      privacy: 'OpenRouter হয়ে থার্ড-পার্টি প্রোভাইডার — ফ্রি মডেলে প্রশিক্ষণ ব্যবহার থাকতে পারে',
    });
  }
  for (const m of groq.models) rows.push({ id: m.id, label: m.name, provider: 'groq', ctx: m.ctx, inp: m.input, tools: m.tools, free: true, price: 'ফ্রি টিয়ার (দৈনিক সীমা)', keyNeeded: true, ready: !!keys.GROQ_API_KEY, privacy: 'Groq — ফ্রি টিয়ারে ইনপুট/আউটপুট লগ হতে পারে' });
  for (const m of coarena.models) rows.push({ id: m.id, label: m.name, provider: 'coarena', ctx: m.ctx, inp: m.input, tools: m.tools, free: true, price: 'ফ্রি দৈনিক সীমা', keyNeeded: true, ready: !!keys.COARENA_API_KEY, privacy: '⚠️ সব রিকোয়েস্ট জমা হয়, ডেটাসেটে ব্যবহার হতে পারে' });

  const data = {
    at: new Date().toISOString(),
    providers: {
      ollama: { ok: true, note: 'key ছাড়াই চলে', models: LOCAL_MODELS.length },
      openrouter: { ok: or.ok, status: or.status, total: or.models.length, free: rows.filter((r) => r.provider === 'openrouter' && r.free).length, key: !!keys.OPENROUTER_API_KEY },
      groq: { ok: groq.ok, status: groq.status, total: groq.models.length, key: !!keys.GROQ_API_KEY },
      coarena: { ok: coarena.ok, status: coarena.status, total: coarena.models.length, key: !!keys.COARENA_API_KEY },
      numes: { ok: false, status: 401, total: 0, key: !!keys.NUMES_API_KEY, paid: true, note: 'ক্রেডিট-ভিত্তিক — ডিফল্টে বন্ধ' },
    },
    rows,
  };
  cache = { at: Date.now(), data };
  return data;
}

/* ---------- বেঞ্চমার্ক চালানো (ব্যাকগ্রাউন্ড) ---------- */
let run = { active: false, startedAt: null, done: 0, total: 0, log: [], results: null };

async function startBench({ models = null, tasks = null } = {}) {
  if (run.active) return { started: false, reason: 'already running', ...statusOf() };
  const keys = readKeys();
  const cat = await liveCatalogue();
  const testable = cat.rows.filter((r) => r.ready && (r.provider !== 'ollama' || true));
  const list = models ? testable.filter((r) => models.includes(`${r.provider}:${r.id}`)) : testable;
  const taskNames = tasks || Object.keys(mb.TASKS).filter((t) => t !== 'vision');
  run = { active: true, startedAt: new Date().toISOString(), done: 0, total: list.length * taskNames.length, log: [], results: { byModel: {}, byProvider: {}, at: new Date().toISOString() } };
  audit('bench_start', { models: list.length, tasks: taskNames.length });

  (async () => {
    for (const m of list) {
      const key = `${m.provider}:${m.id}`;
      const rec = { id: m.id, provider: m.provider, ctx: m.ctx, tools: m.tools, input: m.inp, privacy: m.privacy, tasks: {}, pass: 0, fail: 0, latencies: [] };
      for (const t of taskNames) {
        const spec = mb.TASKS[t];
        if (spec.needsVision && !(m.inp || []).includes('image')) { run.done++; continue; }
        const r = m.provider === 'ollama'
          ? await localCall(m, t)
          : await mb.callOne({ ...m, provider: m.provider, id: m.id }, t);
        rec.tasks[t] = r;
        if (r.skipped) { rec.skipped = (rec.skipped || 0) + 1; }
        else if (r.ok && r.pass) rec.pass++;
        else rec.fail++;
        if (r.ms) rec.latencies.push(r.ms);
        run.done++;
        run.log.push({ key, task: t, ok: !!(r.ok && r.pass), ms: r.ms || 0, status: r.status || 200, error: r.error || null });
        if (run.log.length > 400) run.log.shift();
      }
      const total = rec.pass + rec.fail;
      rec.passRate = total ? +(rec.pass / total).toFixed(2) : 0;
      rec.avgMs = rec.latencies.length ? Math.round(rec.latencies.reduce((a, b) => a + b, 0) / rec.latencies.length) : 0;
      rec.dead = total > 0 && rec.pass === 0;
      run.results.byModel[key] = rec;
    }
    run.active = false;
    run.results.finishedAt = new Date().toISOString();
    mb.saveResults(run.results);
    audit('bench_done', { models: Object.keys(run.results.byModel).length });
  })().catch((e) => { run.active = false; run.error = String(e.message).slice(0, 200); });

  return { started: true, ...statusOf() };
}

async function localCall(m, task) {
  const spec = mb.TASKS[task];
  const t0 = Date.now();
  try {
    const body = {
      model: m.id,
      messages: [{ role: 'user', content: task === 'longctx' ? mb.buildLongCtx() : spec.prompt }],
      stream: false, think: false,
      options: { temperature: 0.2, num_predict: 500, num_ctx: task === 'longctx' ? 16384 : 8192 },
    };
    if (spec.needsTools) body.tools = [{ type: 'function', function: { name: 'calculator', description: 'Evaluate arithmetic', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } }];
    const r = await fetch(PROVIDERS.ollama.base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    if (!r.ok) return { ok: false, status: r.status, error: 'HTTP ' + r.status, ms: Date.now() - t0 };
    const j = await r.json();
    const msg = j.message || {};
    const content = String(msg.content || '').trim();
    const toolCalls = (msg.tool_calls || []).length;
    return { ok: true, pass: !!spec.check(content, { toolCalls }), ms: Date.now() - t0, content: content.slice(0, 600), toolCalls, usage: { in: j.prompt_eval_count || 0, out: j.eval_count || 0 } };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message).slice(0, 160), ms: Date.now() - t0 };
  }
}

function statusOf() {
  return { active: run.active, startedAt: run.startedAt, done: run.done, total: run.total, pct: run.total ? Math.round((run.done / run.total) * 100) : 0, log: run.log.slice(-40), error: run.error || null };
}

function lastResults() {
  const saved = mb.loadResults();
  if (!saved) return null;
  const rows = Object.entries(saved.byModel || {}).map(([key, r]) => ({
    key, id: r.id, provider: r.provider, pass: r.pass, fail: r.fail, passRate: r.passRate, avgMs: r.avgMs, dead: r.dead, ctx: r.ctx, privacy: r.privacy,
    tasks: Object.fromEntries(Object.entries(r.tasks || {}).map(([t, v]) => [t, { ok: !!v.pass, ms: v.ms || 0, status: v.status || 0, error: v.error || null, toolCalls: v.toolCalls || 0 }])),
  })).sort((a, b) => b.passRate - a.passRate || a.avgMs - b.avgMs);
  return { at: saved.at, finishedAt: saved.finishedAt, rows };
}

/* ---------- রাউটিং সুপারিশ ---------- */
function recommendations() {
  const saved = mb.loadResults();
  const bench = saved ? { byModel: saved.byModel } : null;
  const out = {};
  for (const kind of Object.keys(mb.TASK_ROUTE)) {
    const pool = mb.routeFor(kind, { bench });
    out[kind] = { label: mb.TASK_ROUTE[kind].label, order: pool.slice(0, 3) };
  }
  return out;
}

module.exports = { liveCatalogue, startBench, statusOf, lastResults, recommendations, LOCAL_MODELS, localCall };

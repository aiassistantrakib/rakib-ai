/* =========================================================================
   RAKIB AI — টাস্ক রানার: আসল এক্সিকিউশন ইভেন্ট, ক্যানসেল, রিট্রাই
   প্রতিটি ধাপ (agent_pick → model → tool → done/error) সত্যিকারের সময়ে লেখা হয়।
   কোনো সিমুলেশন নয় — যা ঘটে তাই লেখা হয়।
   ========================================================================= */
'use strict';
const { EventEmitter } = require('events');
const gw = require('./gateway');
const agentstore = require('./agentstore');
const { specsFor, runTool } = require('./tools');
const { get: getAgent, pickAgent } = require('./agents');
const { audit, uid } = require('./store');
const approvals = require('./approvals');
const persist = require('./persist');
const { MAX_STEPS } = require('./config');

const DELEGATE_SPEC = {
  type: 'function',
  function: {
    name: 'delegate_to_agent',
    description: 'Hand one self-contained sub-task to a specialist agent. Returns that agent\'s answer.',
    parameters: { type: 'object', properties: { agent: { type: 'string', enum: ['research', 'coding', 'data', 'vision', 'media', 'writer', 'qa', 'security'] }, task: { type: 'string' } }, required: ['agent', 'task'] },
  },
};

const MAX_TASKS = 60;
const tasks = new Map();   // id -> task
const events = new EventEmitter();
events.setMaxListeners(200);

function push(t, type, data = {}) {
  const ev = { id: uid(6), at: new Date().toISOString(), type, ...data };
  t.events.push(ev);
  if (t.events.length > 400) t.events.shift();
  events.emit('event', { taskId: t.id, ev });
  if (type === 'done' || type === 'error' || type === 'cancelled') persist.task(t);
  else if (type === 'agent_pick' || type === 'tool_done' || type === 'approval_needed') persist.task(t);
  return ev;
}

/**
 * অনুমোদন গেট: sensitive টুল একা চলে না।
 * অনুমোদন এলে টুল চলে; বাতিল হলে মডেলকে সেটাই জানানো হয়।
 */
function gate({ tool, args, agent, taskId, settings, emit, abort }) {
  if (!approvals.needsApproval(tool, settings)) return { allowed: true, args };
  const ap = approvals.request({ tool, args, agent, taskId, settings });
  emit('approval_needed', { approvalId: ap.id, tool, risk: ap.risk, riskLabel: ap.riskLabel, reason: ap.reason });
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (abort?.aborted) { clearInterval(tick); approvals.decide(ap.id, 'deny'); return resolve({ allowed: false, reason: 'টাস্ক বাতিল হয়েছে' }); }
      const cur = approvals.list().history.find((h) => h.id === ap.id);
      if (cur) {
        clearInterval(tick);
        if (cur.status === 'approved') return resolve({ allowed: true, args });
        if (cur.status === 'edited') return resolve({ allowed: true, args: { ...args, ...(cur.editedArgs || {}) } });
        return resolve({ allowed: false, reason: 'ব্যবহারকারী অনুমোদন দেননি' });
      }
      if (Date.now() - started > 5 * 60 * 1000) {
        clearInterval(tick); approvals.decide(ap.id, 'deny');
        return resolve({ allowed: false, reason: '৫ মিনিটে অনুমোদন আসেনি' });
      }
    }, 700);
  });
}

function create({ text, agent, plan = false, history = [], images = [], settings = {} }) {
  const t = {
    id: uid(8), at: new Date().toISOString(), text: String(text).slice(0, 2000),
    agent: agent && agent !== 'auto' ? agent : null, plan, status: 'queued', events: [],
    result: null, error: null, startedAt: null, endedAt: null, abort: null,
  };
  tasks.set(t.id, t);
  if (tasks.size > MAX_TASKS) { const oldest = [...tasks.keys()][0]; const old = tasks.get(oldest); if (old.status !== 'running' && old.status !== 'queued') tasks.delete(oldest); }
  setImmediate(() => run(t, { history, images, settings }));
  return t;
}

async function run(t, { history, images, settings }) {
  t.status = 'running'; t.startedAt = new Date().toISOString();
  const ctrl = new AbortController(); t.abort = ctrl;
  const started = Date.now();
  const sink = settings._sink; delete settings._sink;
  const emit = (type, data) => { push(t, type, data); if (sink) try { sink({ taskId: t.id, ev: t.events[t.events.length - 1] }); } catch {} };
  const emitf = (type, data) => emit(type, data);

  try {
    await gw.ollamaModels(true);
    const hasImg = (images || []).length > 0;
    const agentId = t.agent || pickAgent(t.text, hasImg);
    t.agent = agentId;
    const agent = getAgent(agentId) || getAgent('chief');
    emit('agent_pick', { agent: agentId, agentName: agent.bn || agentId, reason: 'কাজের ধরন অনুযায়ী বাছাই' });

    const toolSpecs = specsFor(agent.tools).concat([DELEGATE_SPEC]);
    emit('plan', { steps: MAX_STEPS, tools: agent.tools });

    const messages = [{ role: 'system', content: (agent.system || 'You are a helpful assistant.') + '\n\nYou have tools. When the task needs a fact, a calculation, a file, a web page, a browser action, an image or a video, CALL THE TOOL — never claim you cannot. Answer in the user language.' }];
    for (const h of (history || []).slice(-12)) messages.push({ role: h.role, content: h.content });
    const attach = hasImg ? [{ type: 'text', text: t.text }, ...images.map((u) => ({ type: 'image_url', image_url: { url: u } }))] : t.text;
    messages.push({ role: 'user', content: attach });

    const attempts = [];
    const toolTrace = [];
    const working = messages.slice();
    let usedModel = null;
    let totalTok = { inTok: 0, outTok: 0 };

    for (let step = 0; step < MAX_STEPS; step++) {
      if (ctrl.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
      const order = gw.route({ messages: working, task: agent.tier, pinned: settings.mode === 'pinned' ? settings.pinned : null, toolSpecs });
      if (!order.length) throw Object.assign(new Error('NO_MODEL'), { code: 'NO_MODEL' });
      emit('routing', { step: step + 1, candidates: order.slice(0, 4).map((m) => gw.keyOf(m)) });

      let out = null;
      for (const m of order) {
        if (ctrl.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
        emit('model_try', { step: step + 1, model: gw.keyOf(m), local: !!m.local });
        try {
          out = await gw.callModel(m, working, { temperature: settings.temperature ?? 0.7, max_tokens: settings.max_tokens ?? 2048, toolSpecs, timeoutMs: m.local ? 300000 : 60000 });
          usedModel = out.model;
          attempts.push({ model: gw.keyOf(m), ok: true, ms: out.ms, step: step + 1 });
          emit('model_ok', { step: step + 1, model: gw.keyOf(m), ms: out.ms, tokens: out.usage });
          break;
        } catch (err) {
          attempts.push({ model: gw.keyOf(m), ok: false, status: err.status || 0, error: String(err.message).slice(0, 160) });
          emit('model_fail', { step: step + 1, model: gw.keyOf(m), status: err.status || 0, error: String(err.message).slice(0, 200) });
          if (err.status === 401 || err.status === 403) throw Object.assign(new Error('AUTH'), { code: 'AUTH' });
        }
      }
      if (!out) throw Object.assign(new Error('ALL_FAILED'), { code: 'ALL_FAILED' });
      if (out.usage) { totalTok.inTok += out.usage.inTok; totalTok.outTok += out.usage.outTok; }

      if (out.toolCalls.length) {
        working.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls });
        for (const call of out.toolCalls) {
          const name = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
          emit('tool_start', { step: step + 1, tool: name, args: JSON.stringify(args).slice(0, 300) });
          let res;
          const t0 = Date.now();
          if (name === 'delegate_to_agent') {
            emit('delegate', { to: args.agent, task: String(args.task || '').slice(0, 200) });
            const sub = await runAgentTask({ agentId: args.agent, task: args.task, settings, depth: 1, abort: ctrl.signal, emit });
            res = { text: `[${args.agent}] ${sub.ok ? sub.content : 'FAILED: ' + (sub.message || '')}`, ui: { tool: 'delegate', agent: args.agent, ok: !!sub.ok, model: sub.usedModel?.label || '' } };
            emit('delegate_done', { to: args.agent, ok: !!sub.ok, ms: sub.ms });
          } else {
            const g = await gate({ tool: name, args, agent: agentId, taskId: t.id, settings, emit, abort: ctrl.signal });
            if (!g.allowed) {
              res = { text: `APPROVAL_DENIED: ${g.reason} — এই টুল চালানো হয়নি। ব্যবহারকারীকে জানাও।`, ui: { tool: name, error: 'অনুমোদন নেই', denied: true } };
            } else if (approvals.isDuplicate(name, g.args, agentId)) {
              res = { text: 'DUPLICATE_SKIPPED: এই টুলটি একই আর্গুমেন্টে এখনই চলছে — আবার চালানো হয়নি।', ui: { tool: name, error: 'ডুপ্লিকেট' } };
            } else {
              if (g.args !== args) emit('approval_edited', { tool: name, args: JSON.stringify(g.args).slice(0, 200) });
              approvals.markRunning(name, g.args, agentId);
              try {
                const r = await runTool(name, g.args, { startedAt: Date.now() });
                res = { text: r.text, ui: r.ui };
              } finally { approvals.clearRunning(name, g.args, agentId); }
            }
          }
          toolTrace.push({ ...res.ui, step: step + 1, ms: Date.now() - t0 });
          emit('tool_done', { step: step + 1, tool: name, ms: Date.now() - t0, ok: !res.ui?.error, preview: String(res.text).slice(0, 300), ui: res.ui });
          // স্ক্রিনশট/ফাইল আউটপুট UI-তে দেখানোর জন্য ইভেন্টে রাখুন
          if (res.ui?.screenshot) emit('screenshot', { step: step + 1, file: res.ui.screenshot, url: res.ui.url || '' });
          if (res.ui?.rel) emit('artifact', { step: step + 1, kind: res.ui.tool, rel: res.ui.rel, bytes: res.ui.bytes || 0 });
          working.push({ role: 'tool', tool_call_id: call.id, content: res.text });
        }
        continue;
      }

      const content = out.content || '(খালি উত্তর)';
      t.result = { ok: true, content, usedModel, attempts, toolTrace, usage: totalTok, ms: Date.now() - started, agent: agentId, agentName: agent.bn || agentId };
      t.status = 'done'; t.endedAt = new Date().toISOString();
      emit('done', { ms: t.result.ms, model: usedModel?.id, chars: content.length });
      audit('task_done', { id: t.id, agent: agentId, ok: true, ms: t.result.ms });
      return;
    }

    // স্টেপ বাজেট শেষ — টুল ছাড়া চূড়ান্ত উত্তর
    const order = gw.route({ messages: working, task: agent.tier });
    const out = await gw.callModel(order[0], [...working, { role: 'user', content: 'টুল ব্যবহার না করে চূড়ান্ত উত্তর দাও।' }], { max_tokens: 2048 });
    t.result = { ok: true, content: out.content, usedModel: out.model, attempts, toolTrace, ms: Date.now() - started, agent: agentId, agentName: agent.bn || agentId };
    t.status = 'done'; t.endedAt = new Date().toISOString();
    emit('done', { ms: t.result.ms, model: out.model?.id });
  } catch (err) {
    const cancelled = err.code === 'CANCELLED' || ctrl.signal.aborted;
    const map = {
      NO_MODEL: 'কোনো ফ্রি মডেল পাওয়া যায়নি — Ollama চালু করুন বা কী যোগ করুন।',
      AUTH: 'প্রোভাইডার key কাজ করছে না — Model Intelligence → কী ট্যাবে ঠিক করুন।',
      ALL_FAILED: 'সব মডেল ফেইল করলো — কিছুক্ষণ পর রিট্রাই করুন।',
    };
    t.status = cancelled ? 'cancelled' : 'error';
    t.endedAt = new Date().toISOString();
    t.error = map[err.code] || String(err.message).slice(0, 300);
    emit(cancelled ? 'cancelled' : 'error', { message: t.error, code: err.code || '' });
    audit('task_error', { id: t.id, code: err.code || '', message: t.error.slice(0, 160) });
  } finally {
    t.abort = null;
  }
}

/* ---- একই রানার একটি এজেন্ট-টাস্কের ভেতরে ব্যবহারের জন্য (delegate) ---- */
async function runAgentTask({ agentId, task, settings = {}, depth = 0, abort = null, emit = null }) {
  // সেভ করা এজেন্ট কনফিগ (নিজের মডেল/টেম্পারেচার/টুল) — না থাকলে পুরনো ডিফিনিশনে ফিরি
  const exec = (() => { try { return agentstore.execConfig(agentId); } catch { return null; } })();
  const agent = exec || getAgent(agentId) || getAgent('chief');
  const started = Date.now();
  const agentTools = exec ? require('./tools').allowedByPermissions(exec.tools || [], exec.permissions) : (agent.tools || []);
  const toolSpecs = specsFor(agentTools);
  if (depth === 0) toolSpecs.push(DELEGATE_SPEC);
  const messages = [
    { role: 'system', content: (agent.system || 'You are a helpful assistant.') + '\n\nYou have tools. Call them instead of saying you cannot. Answer in the user language.' },
    { role: 'user', content: task },
  ];
  const attempts = [], toolTrace = [];
  let usedModel = null;
  for (let step = 0; step < 3; step++) {
    if (abort?.aborted) return { ok: false, message: 'cancelled', attempts, toolTrace, ms: Date.now() - started };
    // এজেন্টের নিজের মডেল আগে, তারপর গেটওয়ে রাউটিং (ফলব্যাক)
    let order = [];
    if (exec && exec.model) {
      order = [exec.model];
      const routed = gw.route({ messages, task: agent.tier, toolSpecs });
      for (const m of routed) if (gw.keyOf(m) !== gw.keyOf(exec.model)) order.push(m);
    } else {
      order = gw.route({ messages, task: agent.tier, toolSpecs });
    }
    if (!order.length) return { ok: false, message: 'NO_MODEL', attempts, toolTrace, ms: Date.now() - started };
    let out = null;
    for (const m of order) {
      try {
        out = await gw.callModel(m, messages, {
          toolSpecs,
          temperature: exec ? exec.temperature : undefined,
          max_tokens: exec ? Math.min(exec.maxTokens || 2048, 4096) : undefined,
          timeoutMs: m.local ? 300000 : 60000,
        });
        usedModel = out.model; attempts.push({ model: gw.keyOf(m), ok: true, ms: out.ms }); break;
      }
      catch (e) { attempts.push({ model: gw.keyOf(m), ok: false, error: String(e.message).slice(0, 120) }); }
    }
    if (!out) return { ok: false, message: 'ALL_FAILED', attempts, toolTrace, ms: Date.now() - started };
    if (out.toolCalls.length) {
      messages.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls });
      for (const call of out.toolCalls) {
        let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        if (emit) emit('sub_tool_start', { agent: agentId, tool: call.function.name });
        const g = await gate({ tool: call.function.name, args, agent: agentId, taskId: null, settings: { ...settings, approvalPolicy: exec ? exec.approval : undefined }, emit: emit || (() => {}), abort });
        if (!g.allowed) {
          if (emit) emit('sub_tool_done', { agent: agentId, tool: call.function.name, ok: false });
          messages.push({ role: 'tool', tool_call_id: call.id, content: `APPROVAL_DENIED: ${g.reason}` });
          continue;
        }
        const r = await runTool(call.function.name, g.args, { startedAt: Date.now() });
        toolTrace.push({ ...r.ui, step: step + 1 });
        if (emit) emit('sub_tool_done', { agent: agentId, tool: call.function.name, ok: !r.ui?.error });
        messages.push({ role: 'tool', tool_call_id: call.id, content: r.text });
      }
      continue;
    }
    return { ok: true, content: out.content, usedModel, attempts, toolTrace, ms: Date.now() - started };
  }
  return { ok: true, content: '(ধাপ শেষ)', usedModel, attempts, toolTrace, ms: Date.now() - started };
}

/* ---- বুটে ডিস্ক থেকে হিস্ট্রি ফিরিয়ে আনা ---- */
function hydrate() {
  try {
    for (const rec of persist.loadTasks()) {
      if (tasks.has(rec.id)) continue;
      const status = rec.status === 'running' || rec.status === 'queued' ? 'interrupted' : rec.status;
      tasks.set(rec.id, {
        id: rec.id, at: rec.at, text: rec.text || '', agent: rec.agent || null, plan: false,
        status, events: rec.events || [], result: rec.result || null,
        error: status === 'interrupted' ? 'সার্ভার রিস্টার্টে টাস্ক থেমে গেছে — রিট্রাই করুন' : (rec.error || null),
        startedAt: rec.startedAt || null, endedAt: rec.endedAt || null, abort: null, restored: true,
      });
    }
  } catch {}
}
hydrate();

function get(id) { return tasks.get(id) || null; }
function list() {
  return [...tasks.values()].sort((a, b) => (b.at > a.at ? 1 : -1)).map((t) => ({
    id: t.id, at: t.at, agent: t.agent, text: t.text.slice(0, 140), status: t.status, ms: t.result?.ms || (t.startedAt ? Date.now() - new Date(t.startedAt).getTime() : 0),
    model: t.result?.usedModel?.label || '', tools: (t.result?.toolTrace || []).map((x) => x.tool), error: t.error, events: t.events.length,
  }));
}
function cancel(id) { const t = tasks.get(id); if (!t) return false; if (t.abort) t.abort.abort(); else if (t.status === 'queued') { t.status = 'cancelled'; push(t, 'cancelled', { message: 'শুরু হওয়ার আগেই বাতিল' }); } return true; }
function retry(id) { const t = tasks.get(id); if (!t) return null; return create({ text: t.text, agent: t.agent, plan: t.plan }); }
function stats() {
  const all = [...tasks.values()];
  const by = (s) => all.filter((t) => t.status === s).length;
  const done = all.filter((t) => t.status === 'done');
  return {
    total: all.length, running: by('running'), queued: by('queued'), done: by('done'), error: by('error'), cancelled: by('cancelled'),
    avgMs: done.length ? Math.round(done.reduce((a, t) => a + (t.result?.ms || 0), 0) / done.length) : 0,
    toolCalls: all.reduce((a, t) => a + (t.result?.toolTrace || []).length, 0),
  };
}

module.exports = { create, get, list, cancel, retry, stats, events, runAgentTask, DELEGATE_SPEC };

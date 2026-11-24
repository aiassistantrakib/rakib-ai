/* =========================================================================
   RAKIB AI — Orchestrator
   ইনস্ট্রাকশন → এজেন্ট বাছাই → (দরকার হলে) সাব-টাস্ক → মডেল গেটওয়ে দিয়ে চালানো
   → ফল একসাথে → ঐচ্ছিক QA যাচাই।
   সব কিছু লগ হয়: কোন এজেন্ট, কোন মডেল, কত সময়, কোন টুল চললো।
   ========================================================================= */
'use strict';
const gw = require('./gateway');
const { specsFor, runTool } = require('./tools');
const { get: getAgent, pickAgent } = require('./agents');
const { audit } = require('./store');
const { MAX_STEPS } = require('./config');

const DELEGATE_SPEC = {
  type: 'function',
  function: {
    name: 'delegate_to_agent',
    description: 'Hand one self-contained sub-task to a specialist agent (research, coding, data, vision, media, writer, qa, security). Returns that agent\'s answer. Use for multi-part requests.',
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['research', 'coding', 'data', 'vision', 'media', 'writer', 'qa', 'security'] },
        task: { type: 'string', description: 'the complete sub-task, with all context the sub-agent needs' },
      },
      required: ['agent', 'task'],
    },
  },
};

/**
 * একটি এজেন্টকে একটি কাজ দিন। টুল-লুপ + ফলব্যাক gateway থেকে আসে।
 * @returns {{ ok, content, agent, usedModel, attempts, toolTrace, ms }}
 */
async function runAgentTask({ agentId, task, history = [], images = [], settings = {}, allowDelegate = false, depth = 0, trace = [] }) {
  const agent = getAgent(agentId) || getAgent('chief');
  const started = Date.now();
  const enabledTools = agent.tools.filter((t) => (settings.tools || agent.tools).includes(t) || agent.id !== 'chief');
  const toolSpecs = specsFor(enabledTools.length ? enabledTools : agent.tools);
  if (allowDelegate && depth === 0) toolSpecs.push(DELEGATE_SPEC);

  const sys = agent.system || 'You are a helpful assistant.';
  const toolNote = enabledTools.length || allowDelegate
    ? '\n\nYou have tools available. When the task needs a fact you cannot know, a calculation, a file, a web page or an image operation, CALL THE TOOL with the tool-call mechanism — never claim you cannot run code or access the web. After tools return, answer in the user language using their results.'
    : '';
  const messages = [{ role: 'system', content: sys + toolNote }];
  for (const h of history.slice(-12)) messages.push({ role: h.role, content: h.content });
  messages.push({ role: 'user', content: task });

  const attempts = [];
  const toolTrace = [];
  const working = messages.slice();
  let usedModel = null;
  let totalTok = { inTok: 0, outTok: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const order = gw.route({ messages: working, task: agent.tier, pinned: settings.mode === 'pinned' ? settings.pinned : null, toolSpecs });
    if (!order.length) {
      return { ok: false, agent: agent.id, error: 'NO_MODEL', message: 'কোনো ফ্রি মডেল পাওয়া যায়নি — Ollama চালু করুন বা Settings-এ ফ্রি key দিন।', attempts, toolTrace, trace, ms: Date.now() - started };
    }
    let out = null, hard = null;
    for (const m of order) {
      try {
        out = await gw.callModel(m, working, {
          temperature: settings.temperature ?? 0.7,
          max_tokens: settings.max_tokens ?? 2048,
          toolSpecs,
          timeoutMs: m.provider === 'ollama' ? 300000 : 60000,
        });
        usedModel = out.model;
        attempts.push({ model: gw.keyOf(m), label: m.label, ok: true, ms: out.ms, step: step + 1 });
        break;
      } catch (err) {
        attempts.push({ model: err.modelKey || gw.keyOf(m), label: m.label, ok: false, status: err.status || 0, error: String(err.message).slice(0, 160), retry: !!err.retryable, step: step + 1 });
        if (err.status === 401 || err.status === 403) {
          hard = { ok: false, agent: agent.id, error: 'AUTH', message: `${m.provider} key কাজ করছে না। Settings-এ key ঠিক করুন।`, attempts, toolTrace, trace, ms: Date.now() - started };
          break;
        }
      }
    }
    if (hard) return hard;
    if (!out) {
      if (toolTrace.length) return { ok: true, agent: agent.id, content: 'টুল চলেছে, কিন্তু সব মডেল ফেইল করায় চূড়ান্ত উত্তর তৈরি হয়নি। উপরের টুল ফলাফল দেখুন।', attempts, toolTrace, usedModel, trace, ms: Date.now() - started };
      return { ok: false, agent: agent.id, error: 'ALL_FAILED', message: 'সব ফ্রি মডেল ফেইল করলো। কিছুক্ষণ পর আবার চেষ্টা করুন।', attempts, trace, ms: Date.now() - started };
    }
    if (out.usage) { totalTok.inTok += out.usage.inTok; totalTok.outTok += out.usage.outTok; }

    if (out.toolCalls.length) {
      working.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls });
      for (const call of out.toolCalls) {
        const name = call.function.name;
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        let res;
        if (name === 'delegate_to_agent') {
          const sub = await runAgentTask({ agentId: args.agent, task: args.task, settings, depth: depth + 1, trace, allowDelegate: false });
          res = {
            text: `[${args.agent}] ${sub.ok ? sub.content : 'FAILED: ' + (sub.message || '')}`,
            ui: { tool: 'delegate', agent: args.agent, task: String(args.task).slice(0, 200), ok: !!sub.ok, model: sub.usedModel?.label || '', ms: sub.ms },
          };
          toolTrace.push({ ...res.ui, step: step + 1 });
        } else {
          const r = await runTool(name, args, { startedAt: Date.now() });
          res = { text: r.text, ui: r.ui };
          toolTrace.push({ ...r.ui, step: step + 1, agent: agent.id });
        }
        working.push({ role: 'tool', tool_call_id: call.id, content: res.text });
      }
      continue;
    }

    const content = out.content || '(খালি উত্তর)';
    return { ok: true, agent: agent.id, content, usedModel, attempts, toolTrace, trace, usage: totalTok, ms: Date.now() - started };
  }

  // স্টেপ বাজেট শেষ — টুল ছাড়া শেষ উত্তর
  try {
    const order = gw.route({ messages: working, task: agent.tier, pinned: settings.mode === 'pinned' ? settings.pinned : null });
    const out = await gw.callModel(order[0], [...working, { role: 'user', content: 'টুল ব্যবহার না করে সব ফলাফল মিলিয়ে চূড়ান্ত উত্তর দাও।' }], { max_tokens: settings.max_tokens ?? 2048, temperature: settings.temperature ?? 0.7 });
    return { ok: true, agent: agent.id, content: out.content, usedModel: out.model, attempts, toolTrace, trace, usage: totalTok, ms: Date.now() - started };
  } catch (err) {
    return { ok: true, agent: agent.id, content: 'টুল চলেছে, কিন্তু চূড়ান্ত উত্তর তৈরি হয়নি।', attempts, toolTrace, usedModel, trace, ms: Date.now() - started };
  }
}

/**
 * পুরো সিস্টেমের প্রবেশপথ: ইউজারের বার্তা → এজেন্ট → উত্তর
 * multi-step চাইলে (plan: true) chief আগে পরিকল্পনা করে, তারপর প্রতিটি ধাপ চালায়।
 */
async function handle({ text, history = [], images = [], settings = {}, plan = false }) {
  const started = Date.now();
  const hasImg = images.length > 0;
  const chosen = getAgent(settings.agent && settings.agent !== 'auto' ? settings.agent : pickAgent(text, hasImg)) ? (settings.agent && settings.agent !== 'auto' ? settings.agent : pickAgent(text, hasImg)) : 'chief';
  await gw.ollamaModels(true); // মডেল তালিকা গরম করুন — নইলে প্রথম কলেই route() খালি হতে পারে
  const trace = [{ agent: chosen, task: String(text).slice(0, 160), at: new Date().toISOString() }];
  audit('task_start', { agent: chosen, chars: String(text).length, plan });

  const attach = hasImg
    ? [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : text;

  const main = await runAgentTask({ agentId: chosen, task: attach, history, settings, allowDelegate: true, trace });
  audit('task_done', { agent: chosen, ok: main.ok, ms: main.ms, model: main.usedModel?.id || '' });
  return { ...main, agentName: getAgent(chosen)?.bn || chosen, totalMs: Date.now() - started };
}

module.exports = { handle, runAgentTask, DELEGATE_SPEC };

/* =========================================================================
   RAKIB AI — ফেজ ৪: মডেল ইন্টেলিজেন্স
   ১) OpenRouter ও Groq-এর লাইভ ক্যাটালগ ডিসকভারি (key ছাড়াও /models খোলা)
   ২) শর্টলিস্ট করা ৩৮টি মডেল এখনো আছে কি না যাচাই
   ৩) ৯টি কাজের বেঞ্চমার্ক (আসল inference)
   ৪) ইন্টেলিজেন্ট রাউটিং + ফলব্যাক (পেইড মডেল কখনো নিজে থেকে নয়)
   কোনো ফলাফল বানানো হয় না — যা ব্যর্থ, ব্যর্থ হিসেবেই লেখা হয়।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA, PROVIDERS, remoteModels } = require('./config');
const { readKeys, audit } = require('./store');

const BENCH_DIR = path.join(DATA, 'bench');
fs.mkdirSync(BENCH_DIR, { recursive: true });
const RESULTS = path.join(BENCH_DIR, 'results.json');

/* ------------------------- ১. লাইভ ডিসকভারি ------------------------- */
async function listProviderModels(provider) {
  const p = PROVIDERS[provider];
  const t0 = Date.now();
  try {
    const r = await fetch(p.base + '/models', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { provider, ok: false, status: r.status, ms: Date.now() - t0, models: [] };
    const j = await r.json();
    const arr = j.data || j.models || [];
    return { provider, ok: true, status: r.status, ms: Date.now() - t0, models: arr.map(normaliseModel) };
  } catch (e) {
    return { provider, ok: false, status: 0, error: String(e.message).slice(0, 120), ms: Date.now() - t0, models: [] };
  }
}

function normaliseModel(m) {
  const id = m.id || m.name || '';
  const pricing = m.pricing || {};
  const prompt = Number(pricing.prompt ?? NaN);
  const completion = Number(pricing.completion ?? NaN);
  const free = /:free$/i.test(id) || (prompt === 0 && completion === 0);
  const modalities = m.architecture?.input_modalities || m.input_modalities || ['text'];
  return {
    id,
    name: m.name || id,
    ctx: m.context_length || m.context_window || null,
    maxOut: m.top_provider?.max_completion_tokens || m.max_completion_tokens || null,
    input: modalities,
    tools: m.supported_parameters ? m.supported_parameters.includes('tools') : true,
    free,
    paid: !free,
    promptPrice: Number.isFinite(prompt) ? prompt : null,
    completionPrice: Number.isFinite(completion) ? completion : null,
    provider: m.owned_by || null,
  };
}

/* শর্টলিস্ট করা ৩৮টি মডেল (আগের অডিটে দেখা) — এখনো আছে কি না */
const SHORTLIST = [
  'nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'inclusionai/ling-3.2-flash:free',
  'particle-ai/particle-1:free', 'recursive/flint-v1.0:free', 'baidu/ernie-5.5-flash-preview:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'dots-studio/dots-3-note-preview:free', 'liquid/lfm-3-1.7b:free',
  'meta-llama/llama-3.3-70b-instruct:free', 'meta-llama/llama-3.1-8b-instruct:free', 'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free', 'qwen/qwen-2.5-72b-instruct:free', 'qwen/qwen3-235b-a22b:free',
  'qwen/qwen-2.5-coder-32b-instruct:free', 'mistralai/mistral-small-3.2-24b-instruct:free',
  'mistralai/mistral-7b-instruct:free', 'mistralai/devstral-small:free', 'microsoft/phi-4-reasoning:free',
  'microsoft/markrt-1:free', 'moonshotai/kimi-k2:free', 'z-ai/glm-4.5-air:free', 'tngtech/deepseek-r1t2-chimera:free',
  'openai/gpt-oss-20b:free', 'openai/gpt-oss-120b:free', 'arcee-ai/trinity-mini:free', 'arcee-ai/trinity-large-preview:free',
  'amazon/nova-lite-v1:free', 'amazon/nova-pro-v1:free', 'sao10k/l3-euryale-70b:free',
  'thudm/glm-4-9b:free', 'venice/venice-uncensored:free', 'cognitivecomputations/dolphin3.0-mistral-24b:free',
  'huggingfaceh4/zephyr-7b-beta:free',
];

/* ------------------------- ২. বেঞ্চমার্ক প্রম্পট ------------------------- */
const TASKS = {
  reasoning: {
    label: 'সাধারণ যুক্তি',
    prompt: 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with the number and one short sentence of working.',
    check: (t) => /0?\.05|5\s*(cents|sent|পয়সা)|০\.০৫/.test(t),
  },
  bengali: {
    label: 'বাংলা ভাষার গুণমান',
    prompt: 'একটি অনলাইন কাপড়ের দোকানের জন্য ৩ বাক্যে বাংলায় একটি বিজ্ঞাপন লিখুন। শুরু করুন "আসসালামু আলাইকুম" দিয়ে।',
    check: (t) => /[\u0980-\u09FF]{20,}/.test(t) && /আসসালামু/.test(t),
  },
  english: {
    label: 'ইংরেজি গুণমান',
    prompt: 'Write exactly three sentences explaining what an API is to a non-technical shop owner.',
    check: (t) => (t.match(/[.!?](\s|$)/g) || []).length >= 2,
  },
  coding: {
    label: 'কোডিং ও ডিবাগিং',
    prompt: 'This JavaScript function should return the sum of even numbers in an array but returns 0. Fix it and explain the bug in one line.\n\nfunction sumEven(a){let s=0;for(let i=0;i<a.length;i++){if(a[i]%2=0)s+=a[i];}return s;}',
    check: (t) => /===/.test(t) && /sumEven|even|%2/i.test(t),
  },
  longctx: {
    label: 'লং-কনটেক্সট বোঝা',
    prompt: null, // তৈরি হয় buildLongCtx() দিয়ে
    check: (t) => /4211/.test(t),
  },
  tools: {
    label: 'টুল কলিং',
    prompt: 'What is 4871 multiplied by 29? Use the calculator tool.',
    needsTools: true,
    check: (t, r) => (r.toolCalls || 0) > 0,
  },
  json: {
    label: 'স্ট্রাকচার্ড JSON',
    prompt: 'Return ONLY valid JSON (no markdown) with keys: name (string), price (number), inStock (boolean), tags (array of 2 strings) — for a cotton saree costing 1850 taka that is in stock.',
    check: (t) => { try { const j = JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); return typeof j.price === 'number' && Array.isArray(j.tags); } catch { return false; } },
  },
  research: {
    label: 'রিসার্চ ও সারসংক্ষেপ',
    prompt: 'Summarise in 3 bullet points why open-source AI models matter for small businesses, then give one concrete risk.',
    check: (t) => (t.match(/^[-*•]/gm) || []).length >= 2 || /\n\d\./.test(t),
  },
  instruction: {
    label: 'ইনস্ট্রাকশন ফলো',
    prompt: 'Answer using exactly this format and nothing else: "NAME=RAKIB|ITEMS=3|COST=LOW"',
    check: (t) => /NAME=RAKIB\|ITEMS=3\|COST=LOW/.test(t),
  },
  vision: {
    label: 'ভিশন (শুধু যাদের চোখ আছে)',
    prompt: 'Describe the dominant object and its colour in this image, in one sentence.',
    needsVision: true,
    check: (t) => t.trim().length > 10,
  },
};

/* লং-কনটেক্সট: মাঝখানে একটি কোড লুকিয়ে রাখা হয়, শেষে প্রশ্ন */
function buildLongCtx() {
  const filler = Array.from({ length: 220 }, (_, i) => `Line ${i + 1}: warehouse record ${1000 + i} — quantity ${(i * 7) % 50} units, status ok.`).join('\n');
  const needle = 'IMPORTANT: the secret order code is 4211.';
  return `You are reading a warehouse log. Read it carefully.\n\n${filler}\n${needle}\n\n${filler}\n\nQuestion: what is the secret order code in the log? Reply with just the number.`;
}

/* ------------------------- ৩. এক মডেল, এক টেস্ট ------------------------- */
async function callOne(m, task, { timeoutMs = 90000 } = {}) {
  const key = readKeys()[PROVIDERS[m.provider]?.keyName];
  if (!key) return { ok: false, skipped: true, error: 'NO_KEY' };
  const spec = TASKS[task];
  const t0 = Date.now();
  const body = { model: m.id, messages: [{ role: 'user', content: task === 'longctx' ? buildLongCtx() : spec.prompt }], temperature: 0.2, max_tokens: 700 };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (m.provider === 'openrouter') { headers['HTTP-Referer'] = 'http://localhost'; headers['X-Title'] = 'RAKIB AI bench'; }
  if (m.provider === 'coarena') headers['HTTP-Referer'] = 'http://localhost';
  if (spec.needsTools) {
    body.tools = [{ type: 'function', function: { name: 'calculator', description: 'Evaluate arithmetic', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } }];
    body.tool_choice = 'auto';
  }
  try {
    const r = await fetch(PROVIDERS[m.provider].base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const txt = await r.text();
    if (!r.ok) {
      let msg = txt.slice(0, 200);
      try { msg = JSON.parse(txt)?.error?.message || msg; } catch {}
      return { ok: false, status: r.status, error: String(msg).slice(0, 180), ms: Date.now() - t0, rateLimited: r.status === 429 };
    }
    const j = JSON.parse(txt);
    const msg = j.choices?.[0]?.message || {};
    const content = String(msg.content || '').trim();
    const toolCalls = (msg.tool_calls || []).length;
    const pass = content || toolCalls ? !!spec.check(content, { toolCalls }) : false;
    return {
      ok: true, pass, ms: Date.now() - t0, content: content.slice(0, 600), toolCalls,
      usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0 },
      finish: j.choices?.[0]?.finish_reason || null,
    };
  } catch (e) {
    const timedOut = /timeout|abort/i.test(e.message);
    return { ok: false, status: timedOut ? 408 : 0, error: String(e.message).slice(0, 160), ms: Date.now() - t0 };
  }
}

/* ------------------------- ৪. রাউটিং টেবিল ------------------------- */
/* নাম-ভিত্তিক হিউরিস্টিক + লাইভ বেঞ্চমেট্রিক্স — পেইড কখনো নয় */
const TASK_ROUTE = {
  coding: { tiers: ['code'], label: 'কোডিং' },
  research: { tiers: ['research', 'deep'], label: 'রিসার্চ' },
  bengali_support: { tiers: ['general', 'fast'], label: 'বাংলা সাপোর্ট', preferBengali: true },
  vision: { tiers: ['vision'], needsVision: true, label: 'ভিশন' },
  data: { tiers: ['deep', 'code'], label: 'ডেটা অ্যানালাইসিস' },
  fast: { tiers: ['fast'], label: 'দ্রুত উত্তর', preferFast: true },
  general: { tiers: ['general'], label: 'সাধারণ' },
};

const LOCAL_ROWS = [{ id: 'qwen3.5:4b', label: 'Qwen 3.5 4B (লোকাল)', provider: 'ollama', inp: ['text', 'image'], tools: true, local: true, tiers: ['general', 'fast', 'vision', 'research', 'code'] }];

function routeFor(kind, { bench = null, exclude = [] } = {}) {
  const spec = TASK_ROUTE[kind] || TASK_ROUTE.general;
  const keys = readKeys();
  const pool = [];
  // লোকাল মডেল — key লাগে না, তাই সবসময় প্রার্থী
  for (const m of LOCAL_ROWS) {
    if (exclude.includes('ollama:' + m.id)) continue;
    if (spec.needsVision && !m.inp.includes('image')) continue;
    let score = 5; // key-ছাড়া পথের বাড়তি গুরুত্ব
    for (const t of m.tiers) { const i = spec.tiers.indexOf(t); if (i >= 0) score = Math.max(score, 100 - i * 10); }
    if (bench) {
      const b = bench.byModel?.['ollama:' + m.id];
      if (b) { score += Math.round((b.passRate || 0) * 30); if (b.avgMs) score -= Math.min(20, Math.round(b.avgMs / 600)); if (b.dead) score -= 200; }
    }
    pool.push({ provider: 'ollama', id: m.id, label: m.label, score: Math.round(score), local: true });
  }
  for (const m of remoteModels()) {
    if (m.paid) continue;                              // কখনো পেইড নয়
    if (!keys[PROVIDERS[m.provider].keyName]) continue; // key নেই → বাদ
    if (exclude.includes(`${m.provider}:${m.id}`)) continue;
    if (spec.needsVision && !m.inp.includes('image')) continue;
    if (spec.tiers && !m.tiers.some((t) => spec.tiers.includes(t))) continue;
    let score = 0;
    for (const t of m.tiers) { const i = spec.tiers.indexOf(t); if (i >= 0) score = Math.max(score, 100 - i * 10); }
    if (m.provider === 'groq') score += 8;
    if (m.id.endsWith(':free')) score += 4;
    if (spec.preferBengali && /gemma|qwen|ling|ernie|glm|nemotron/i.test(m.id)) score += 6;
    if (spec.preferFast && /flash|instant|lightning|nano|lite|small|mini/i.test(m.id)) score += 10;
    if (bench) {
      const b = bench.byModel?.[`${m.provider}:${m.id}`];
      if (b) { score += (b.passRate || 0) * 30 - Math.min(20, (b.avgMs || 6000) / 600); if (b.dead) score -= 200; }
    }
    pool.push({ provider: m.provider, id: m.id, label: m.label, score: Math.round(score), local: false });
  }
  return pool.sort((a, b) => b.score - a.score);
}

/* ------------------------- ৫. রিপোর্ট ------------------------- */
function saveResults(obj) {
  fs.writeFileSync(RESULTS, JSON.stringify(obj, null, 2));
  return RESULTS;
}
function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch { return null; }
}

module.exports = { listProviderModels, SHORTLIST, TASKS, buildLongCtx, callOne, routeFor, TASK_ROUTE, saveResults, loadResults, BENCH_DIR, RESULTS };

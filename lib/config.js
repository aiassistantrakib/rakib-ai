/* =========================================================================
   RAKIB AI — config + model registry
   সব ফ্রি। কোনো paid মডেল কোনোদিন নিজে থেকে ব্যবহার হবে না।
   ========================================================================= */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PUBLIC = path.join(ROOT, 'public');
const WORKSPACE = path.join(ROOT, 'workspace');
for (const d of [DATA, WORKSPACE, path.join(WORKSPACE, 'files'), path.join(WORKSPACE, 'images'), path.join(DATA, 'logs')]) {
  fs.mkdirSync(d, { recursive: true });
}

const PORT = Number(process.env.PORT || 7788);
const HOST = process.env.HOST || '127.0.0.1'; // local-only by default

const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama (এই কম্পিউটারে)',
    local: true,
    keyName: null,
    base: process.env.OLLAMA_BASE || 'http://127.0.0.1:11434',
    signup: 'https://ollama.com/download',
    note: 'key বা ইন্টারনেট ছাড়াই — শুধু এই মেশিনে চলে',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (ফ্রি মডেল)',
    local: false,
    keyName: 'OPENROUTER_API_KEY',
    base: 'https://openrouter.ai/api/v1',
    signup: 'https://openrouter.ai/keys',
    note: 'ফ্রি key — শুধু :free মডেল ব্যবহার হবে',
  },
  groq: {
    id: 'groq',
    label: 'Groq (ফ্রি টিয়ার)',
    local: false,
    keyName: 'GROQ_API_KEY',
    base: 'https://api.groq.com/openai/v1',
    signup: 'https://console.groq.com/keys',
    note: 'খুব দ্রুত — ফ্রি টিয়ার, কার্ড লাগে না',
  },
};

/* ---------------------------------------------------------------
   OpenRouter :free মডেল — ২০২৬-১১-২৪ তারিখে live API থেকে যাচাই করা।
   প্রতিটির context window, ইনপুট মোডালিটি ও tool support পরীক্ষিত।
   --------------------------------------------------------------- */
const OR_FREE = [
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', ctx: 1000000, inp: ['text'], tools: true, tiers: ['fast', 'general', 'code'] },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', ctx: 1000000, inp: ['text', 'image', 'video'], tools: true, tiers: ['vision', 'research', 'general'] },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B', ctx: 1000000, inp: ['text'], tools: true, tiers: ['deep', 'research', 'code'] },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', ctx: 262144, inp: ['text', 'image', 'video'], tools: true, tiers: ['vision', 'general'] },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B A4B', ctx: 262144, inp: ['text', 'image', 'video'], tools: true, tiers: ['vision', 'fast'] },
  { id: 'inclusionai/ling-3.2-flash:free', label: 'Ling 3.2 Flash', ctx: 1048576, inp: ['text', 'image'], tools: true, tiers: ['general', 'fast'] },
  { id: 'particle-ai/particle-1:free', label: 'Particle 1', ctx: 1048576, inp: ['text', 'image'], tools: true, tiers: ['general', 'research'] },
  { id: 'recursive/flint-v1.0:free', label: 'Flint 1.0', ctx: 262144, inp: ['text'], tools: true, tiers: ['general', 'code'] },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', ctx: 1024000, inp: ['text'], tools: true, tiers: ['general', 'deep'] },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni', ctx: 256000, inp: ['text', 'audio', 'image', 'video'], tools: true, tiers: ['vision', 'fast'] },
  { id: 'dots-studio/dots-3-note-preview:free', label: 'Dots 3 Note', ctx: 512000, inp: ['text', 'image'], tools: true, tiers: ['general'] },
  { id: 'liquid/lfm-3-1.7b:free', label: 'Liquid LFM 3 1.7B', ctx: 262144, inp: ['text'], tools: true, tiers: ['fast'] },
];

const GROQ_FREE = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', ctx: 131072, inp: ['text'], tools: true, tiers: ['fast', 'general', 'code'] },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', ctx: 131072, inp: ['text'], tools: true, tiers: ['fast'] },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', ctx: 131072, inp: ['text'], tools: true, tiers: ['deep', 'code'] },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', ctx: 131072, inp: ['text'], tools: true, tiers: ['fast', 'code'] },
];

function remoteModels() {
  const out = [];
  for (const m of OR_FREE) out.push({ ...m, provider: 'openrouter', free: true });
  for (const m of GROQ_FREE) out.push({ ...m, provider: 'groq', free: true });
  return out;
}

/* Paid models that exist on OpenRouter — কেবল তথ্যের জন্য, কখনো অটো-ব্যবহার হবে না */
const PAID_REFERENCE = {
  'deepseek/deepseek-v4.1-flash': { prompt: 0.0000000507, completion: 0.0000002028, ctx: 1048576, note: 'প্রতি ১০ লাখ টোকেনে ~$০.০৫ ইনপুট / ~$০.২০ আউটপুট' },
};

// টাস্ক টিয়ার → কোন মডেল আগে
const TIERS = {
  fast: ['fast'],
  general: ['general', 'fast'],
  code: ['code', 'general', 'deep'],
  deep: ['deep', 'research', 'general'],
  research: ['research', 'deep', 'general'],
  vision: ['vision', 'general'],
};

const COOLDOWN_MS = 60 * 1000;
const MAX_STEPS = 6;

module.exports = { ROOT, DATA, PUBLIC, WORKSPACE, PORT, HOST, PROVIDERS, OR_FREE, GROQ_FREE, remoteModels, PAID_REFERENCE, TIERS, COOLDOWN_MS, MAX_STEPS };

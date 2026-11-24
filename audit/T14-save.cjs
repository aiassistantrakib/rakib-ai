/* ফেজ ৪ — লোকাল মডেলের বেঞ্চমার্ক ফলাফল সঠিক ফরম্যাটে data/bench/results.json-এ রাখা,
   যাতে রাউটার ও ড্যাশবোর্ড দুটোই পড়তে পারে (আসল পরিমাপ, বানানো নয়)। */
const fs = require('fs');
const path = require('path');
const raw = JSON.parse(fs.readFileSync('data/bench/local-qwen3.5-4b.json', 'utf8'));
const tasks = raw.tasks || {};
const pass = Object.values(tasks).filter((t) => t.ok).length;
const fail = Object.keys(tasks).length - pass;
const lat = Object.values(tasks).map((t) => t.ms).filter(Boolean);
const rec = {
  id: raw.model,
  provider: 'ollama',
  ctx: 8192,
  tools: true,
  input: ['text', 'image'],
  privacy: 'লোকাল — ডেটা বেরোয় না',
  tasks,
  pass,
  fail,
  passRate: +(pass / (pass + fail)).toFixed(2),
  avgMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
  dead: pass === 0,
};
const out = {
  at: raw.at,
  finishedAt: new Date().toISOString(),
  source: 'audit/T14-local-bench.cjs (আসল রান, key ছাড়া)',
  byModel: { 'ollama:qwen3.5:4b': rec },
};
fs.writeFileSync('data/bench/results.json', JSON.stringify(out, null, 2));
console.log('saved. pass', pass, 'fail', fail, 'avgMs', rec.avgMs);

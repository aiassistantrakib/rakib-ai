/* ফেজ ৪ — লোকাল মডেলের আসল ৯-কাজ বেঞ্চমার্ক */
const mi = require('../lib/modelintel');
const fs = require('fs');
(async () => {
  const t0 = Date.now();
  const tasks = ['reasoning', 'bengali', 'english', 'coding', 'json', 'research', 'instruction', 'tools', 'longctx'];
  const out = { model: 'qwen3.5:4b', provider: 'ollama', at: new Date().toISOString(), tasks: {} };
  for (const t of tasks) {
    const r = await mi.localCall({ id: 'qwen3.5:4b' }, t);
    out.tasks[t] = { ok: !!(r.ok && r.pass), ms: r.ms, toolCalls: r.toolCalls || 0, error: r.error || null, sample: (r.content || '').slice(0, 160) };
    console.log(t.padEnd(12), r.ok ? (r.pass ? 'PASS' : 'WRONG') : 'FAIL', (r.ms || 0) + 'ms', r.toolCalls ? 'tools=' + r.toolCalls : '');
  }
  out.totalSecs = +((Date.now() - t0) / 1000).toFixed(1);
  fs.mkdirSync('data/bench', { recursive: true });
  fs.writeFileSync('data/bench/local-qwen3.5-4b.json', JSON.stringify(out, null, 2));
  console.log('done in', out.totalSecs, 's');
})();

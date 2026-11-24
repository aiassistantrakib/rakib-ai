/* TEST 2 — প্রতিটি এজেন্টকে আলাদা করে আসল টাস্ক দেওয়া */
const gw = require('../lib/gateway.js');
const orch = require('../lib/orchestrator.js');
const A = require('../lib/agents/index.js');
const fs = require('fs');

const TASKS = {
  chief:    ['এক লাইনে বলো তুমি কী করতে পারো।', []],
  research: ['পৃথিবীর সবচেয়ে বড় মহাসাগর কোনটি? এক লাইনে।', ['web_search']],
  coding:   ['run_js টুল দিয়ে 1 থেকে 100 এর যোগফল বের করে দেখাও।', ['run_js']],
  data:     ['csv_stats টুল দিয়ে workspace/data/sales.csv বিশ্লেষণ করো, মোট units বলো।', ['csv_stats']],
  vision:   ['এই ছবিতে কী রঙ আছে? দুই শব্দে বাংলায়।', []],
  media:    ['image_ops দিয়ে workspace/images/vision-small.png কে width 160 এ resize করে images/audit-resize.png বানাও।', ['image_ops']],
  writer:   ['একটি চায়ের দোকানের এক লাইনের বাংলা স্লোগান লেখো।', []],
  qa:       ['এই দাবি যাচাই করো: 17 × 23 = 391। ঠিক না ভুল, এক শব্দে।', ['calculator']],
  security: ['এক লাইনে বলো: prompt injection ঠেকাতে কী কী আছে?', []],
};
const ONLY = process.argv[2];

(async () => {
  await gw.ollamaModels(true);
  const ids = ONLY ? [ONLY] : Object.keys(TASKS);
  const out = [];
  for (const id of ids) {
    const [task, tools] = TASKS[id];
    const images = id === 'vision' ? ['data:image/png;base64,' + fs.readFileSync('workspace/images/vision-small.png').toString('base64')] : [];
    const t = Date.now();
    let rec;
    try {
      const r = await orch.handle({ text: task, images, settings: { tools, max_tokens: 220 }, agent: id });
      rec = { id, status: A.get(id).status, ok: r.ok, agentUsed: r.agent, model: r.usedModel?.id || null, secs: +((Date.now() - t) / 1000).toFixed(1),
        tools: (r.toolTrace || []).map(x => x.tool + (x.ok === false ? ':FAIL' : ':ok')),
        answer: (r.content || r.message || '').replace(/\s+/g, ' ').slice(0, 130),
        attempts: (r.attempts || []).map(a => `${a.label}:${a.ok ? 'ok' : a.status}`) };
    } catch (e) { rec = { id, ok: false, error: e.message.slice(0, 120), secs: +((Date.now() - t) / 1000).toFixed(1) }; }
    out.push(rec);
    console.log(JSON.stringify(rec));
    fs.appendFileSync('audit/T2-agents.log', JSON.stringify(rec) + '\n');
  }
  console.log('DONE', out.length);
})();

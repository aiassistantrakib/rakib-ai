/* TEST 2b — orchestrator delegation: chief → sub-agent, structured result */
const gw = require('../lib/gateway.js');
const orch = require('../lib/orchestrator.js');
(async () => {
  await gw.ollamaModels(true);
  const t = Date.now();
  const r = await orch.handle({
    text: 'দুই ধাপে করো: প্রথমে research এজেন্টকে দিয়ে জেনে নাও পৃথিবীর সবচেয়ে বড় মহাসাগর কোনটি, তারপর এক লাইনে উত্তর দাও।',
    settings: { tools: ['web_search'], max_tokens: 300 },
  });
  const out = { test: 'delegation', ok: r.ok, agent: r.agent, model: r.usedModel?.id, secs: +((Date.now() - t) / 1000).toFixed(1),
    toolTrace: (r.toolTrace || []).map(x => ({ tool: x.tool, agent: x.agent, ok: x.ok, task: (x.task || '').slice(0, 60) })),
    trace: r.trace, answer: (r.content || '').replace(/\s+/g, ' ').slice(0, 160) };
  console.log(JSON.stringify(out, null, 2));
  require('fs').writeFileSync('audit/T2-delegate.json', JSON.stringify(out, null, 2));
})();

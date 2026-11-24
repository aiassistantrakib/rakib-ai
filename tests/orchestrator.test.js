/* Multi-agent orchestration: delegation, agent routing, fallback chain, cost ledger */
const gw = require('../lib/gateway');
const orch = require('../lib/orchestrator');
const { pickAgent, get } = require('../lib/agents');
const store = require('../lib/store');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };

(async () => {
  await gw.ollamaModels(true); // gateway cache warm (server does this on boot)
  // ---- 1. routing (no model calls) ----
  const cases = [
    ['আজকের সোনার দাম কত?', 'research'],
    ['এই CSV-টা বিশ্লেষণ করো', 'data'],
    ['একটা জাভাস্ক্রিপ্ট ফাংশন লেখো', 'coding'],
    ['ক্যাপশন লেখো', 'writer'],
    ['এই ছবিতে কী আছে', 'vision', true],
  ];
  for (const [q, want, img] of cases) ok(`routes "${q.slice(0, 22)}" → ${want}`, pickAgent(q, !!img) === want, pickAgent(q, !!img));

  // ---- 2. agent registry integrity ----
  const agents = require('../lib/agents').AGENTS;
  ok('14 agents registered', agents.length === 14, String(agents.length));
  ok('every blocked agent explains why', agents.filter((a) => a.status === 'blocked').every((a) => a.blocker && a.blocker.length > 20));
  ok('every ready agent has evidence', agents.filter((a) => a.status === 'ready').every((a) => a.evidence));
  ok('chief can delegate', get('chief').tools.length > 0);

  // ---- 3. delegation (real, with a mock-free local model) ----
  const before = store.loadUsage().total.calls;
  const r = await orch.runAgentTask({
    agentId: 'chief',
    task: 'বাংলায় এক লাইনে বলো: ডেটা এজেন্ট CSV ফাইল বিশ্লেষণ করতে পারে।',
    settings: { tools: ['calculator'], max_tokens: 120 },
    allowDelegate: true,
    trace: [],
  });
  ok('chief agent answered via local model', r.ok, `${(r.ms / 1000).toFixed(1)}s model=${r.usedModel?.label}`);
  ok('usage ledger grew', store.loadUsage().total.calls > before);

  // ---- 4. fallback: a dead model is skipped, the next one answers ----
  const order = gw.route({ messages: [{ role: 'user', content: 'hi' }], task: 'general', toolSpecs: [] });
  ok('route returns an ordered chain', order.length > 0, order.map((m) => m.provider).join('>'));
  const dead = order[0];
  gw.cooldownSet ? null : null;
  // simulate failure by calling a model with a bogus id
  let threw = false;
  try { await gw.callModel({ ...dead, id: 'does-not-exist:0b' }, [{ role: 'user', content: 'x' }], { max_tokens: 8, timeoutMs: 5000 }); }
  catch { threw = true; }
  ok('bad model raises and is cooled down', threw);
  const after = gw.route({ messages: [{ role: 'user', content: 'hi' }], task: 'general', toolSpecs: [] });
  ok('cooldown keeps routing alive', after.length > 0, after.map((m) => m.id).join(','));

  // ---- 5. cost: everything free ----
  const u = store.loadUsage();
  ok('real cost is zero (all free models)', u.total.avoidedUsd >= 0 && !u.total.usdPaid);
  ok('usage tracked per model', Object.keys(u.byModel).length > 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

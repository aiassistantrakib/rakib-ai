/* ফেজ A/B/C টেস্ট — প্রোভাইডার, মডেল, এজেন্ট CRUD ও আসল ইনফারেন্স (শুধু লোকাল Ollama) */
'use strict';
const assert = require('assert');
const models = require('../lib/models');
const agents = require('../lib/agentstore');
const tools = require('../lib/tools');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { try { assert.ok(c, d); pass++; console.log('✅', n, d ? '— ' + d : ''); } catch (e) { fail++; console.log('❌', n, '—', d || e.message); } };

(async () => {
  models.seedFromConfig(); await models.warm();

  ok('প্রোভাইডার তালিকা', models.listProviders().length >= 5, models.listProviders().length + ' প্রোভাইডার');
  ok('মডেল তালিকা', models.listModels().length >= 1, models.listModels().length + ' মডেল');
  ok('ডিফল্ট মডেল নির্ধারিত', !!models.resolveDefault());

  // custom provider CRUD
  const c = models.addProvider({ name: 'Unit Test Prov', type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-unit-test-abcdefghijklmnop' });
  ok('কাস্টম প্রোভাইডার তৈরি', !!c.provider.id);
  const p2 = models.listProviders().find((x) => x.id === c.provider.id);
  ok('কী সংরক্ষিত (hasKey)', p2.hasKey === true);
  ok('কী masked, প্লেইনটেক্সট নয়', /•/.test(p2.masked) && !p2.masked.includes('abcdefghijklmnop'), p2.masked);
  ok('কী ডিস্কে এনক্রিপ্টেড', require('fs').readFileSync('data/keys.enc.json', 'utf8').includes('abcdefghijklmnop') === false);
  const bad = await models.testProvider(c.provider.id);
  ok('ভুল কী → আসল ত্রুটি', bad.ok === false && /401|Incorrect/i.test(bad.detail), bad.detail.slice(0, 70));
  ok('শেষ টেস্টের সময় সংরক্ষিত', !!models.listProviders().find((x) => x.id === c.provider.id).lastTest);

  const m = models.addModel({ providerId: c.provider.id, modelId: 'gpt-test', label: 'Test GPT' });
  ok('মডেল যোগ', !!m.model.id);
  ok('ডিফল্ট সেট', models.setDefaultModel(m.model.id).ok === true);
  ok('resolve → সঠিক প্রোভাইডার', models.resolve(m.model.id).provider === c.provider.id);
  models.setDefaultModel(models.listModels().find((x) => x.providerId === 'ollama').id);
  models.removeModel(m.model.id);
  models.removeProvider(c.provider.id);
  ok('মুছে ফেলা', !models.listProviders().some((x) => x.id === c.provider.id));

  // builtin protection
  let blocked = false;
  try { models.removeProvider('ollama'); } catch { blocked = true; }
  ok('বিল্ট-ইন প্রোভাইডার মোছা যায় না', blocked);

  // agent CRUD
  const a = agents.create({ name: 'Unit Agent', role: 'test', system: 'You are a test agent.', temperature: 0.4, tools: ['calculator'], permissions: { read: true, write: false, sensitive: false }, approval: 'always' });
  ok('এজেন্ট তৈরি', !!a.agent.id);
  const reload = agents.get(a.agent.id);
  ok('এজেন্ট ডিস্ক থেকে ফিরে আসে', reload && reload.name === 'Unit Agent' && reload.temperature === 0.4);
  ok('এজেন্টের মডেল নির্ধারিত', reload.modelOk === true, reload.modelLabel);
  const ex = agents.execConfig(a.agent.id);
  ok('execConfig-এ নিজের মডেল+তাপমাত্রা', ex.temperature === 0.4 && !!ex.model);
  ok('পারমিশন ফিল্টার (read-only)', tools.allowedByPermissions(Object.keys(tools.tools), ex.permissions).length < Object.keys(tools.tools).length);
  agents.update(a.agent.id, { enabled: false });
  ok('এজেন্ট বন্ধ করা যায়', agents.get(a.agent.id).enabled === false);
  agents.remove(a.agent.id);
  ok('এজেন্ট মুছে ফেলা', !agents.get(a.agent.id));

  // real inference on local model (only if ollama is up)
  const local = models.listModels().find((x) => x.providerId === 'ollama');
  if (local) {
    const r = await models.testInference(local.id, { prompt: 'Reply with exactly: UNIT-OK', timeoutMs: 180000 });
    ok('আসল ইনফারেন্স (লোকাল)', r.ok === true, (r.reply || r.detail || '').slice(0, 40) + ' · ' + r.ms + 'ms');
  } else console.log('⚪ লোকাল মডেল নেই — ইনফারেন্স টেস্ট বাদ');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

/* TEST 8 — লাইভ সার্ভারের বিরুদ্ধে রেড-টিম চেক (secret ছাপানো হবে না) */
const fs = require('fs');
const B = 'http://127.0.0.1:7788';
const TOK = fs.readFileSync('data/access-token', 'utf8').trim();
const out = [];
const add = (k, v, d = '') => { out.push({ check: k, result: v, detail: d }); console.log(`${v === 'SAFE' ? 'PASS' : 'FAIL'} ${k}${d ? ' — ' + d : ''}`); };

(async () => {
  // ১. state-এ কাঁচা key আছে কি
  const st = await (await fetch(B + '/api/state')).text();
  add('API key not in /api/state', /sk-or-v1-[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{8,}/.test(st) ? 'LEAK' : 'SAFE');
  // ২. টোকেন ছাড়া পরিবর্তন
  const w = await fetch(B + '/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"temperature":0.1}' });
  add('write without token blocked', w.status === 401 ? 'SAFE' : 'FAIL', 'HTTP ' + w.status);
  // ৩. ভুল টোকেন
  const w2 = await fetch(B + '/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rakib-token': 'deadbeef' }, body: '{}' });
  add('wrong token blocked', w2.status === 401 ? 'SAFE' : 'FAIL', 'HTTP ' + w2.status);
  // ৪. ফাইল সিস্টেমে হাত
  for (const p of ['/files/../../data/keys.json', '/files/..%2f..%2fdata%2fkeys.json', '/files/C:/Windows/win.ini', '/files/%2e%2e/%2e%2e/%2e%2e/etc/passwd']) {
    const r = await fetch(B + p);
    add('traversal ' + p.slice(0, 34), r.ok ? 'LEAK' : 'SAFE', 'HTTP ' + r.status);
  }
  // ৫. পাবলিক এক্সপোজ
  const host = await fetch(B + '/', { headers: { Host: 'evil.example.com' } });
  add('host header does not bypass bind', host.status < 500 ? 'SAFE' : 'CHECK', 'HTTP ' + host.status);
  // ৬. পাথ স্যান্ডবক্স (টুল স্তরে)
  const T = require('../lib/tools.js');
  const r1 = await T.runTool('write_file', { path: '../../escape.txt', content: 'x' });
  add('write outside workspace blocked', /Error|অনুমোদিত/.test(r1.text) ? 'SAFE' : 'FAIL');
  const r2 = await T.runTool('read_file', { path: 'C:/Windows/win.ini' });
  add('read system file blocked', /Error|অনুমোদিত/.test(r2.text) ? 'SAFE' : 'FAIL');
  // ৭. prompt injection → টুল দিয়ে ডেটা বের করা যায় কি
  const r3 = await T.runTool('run_js', { code: 'return globalThis.process?.env?.OPENROUTER_API_KEY || "no"' });
  add('sandbox cannot read env secrets', /Error|no/.test(r3.text) ? 'SAFE' : 'LEAK', r3.text.slice(0, 30));
  // ৮. audit log-এ secret নেই
  const log = fs.readFileSync('data/logs/audit.log', 'utf8');
  add('audit log has no raw secrets', /sk-or-v1-[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{8,}/.test(log) ? 'LEAK' : 'SAFE');
  // ৯. keys ফাইলে প্লেইনটেক্সট key নেই (ফাইল নেই বা এনক্রিপ্টেড)
  const hasKeys = fs.existsSync('data/keys.json');
  const keysRaw = hasKeys ? fs.readFileSync('data/keys.json', 'utf8') : '';
  add('keys.json stores no plaintext key', !/sk-or-v1-[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{8,}/.test(keysRaw) ? 'SAFE' : 'LEAK', hasKeys ? 'file exists' : 'no keys stored');
  // ১০. rate limit
  let hit429 = false;
  for (let i = 0; i < 140; i++) { const r = await fetch(B + '/api/state'); if (r.status === 429) { hit429 = true; break; } }
  add('rate limit enforces 429', hit429 ? 'SAFE' : 'FAIL');
  fs.writeFileSync('audit/T8-security.json', JSON.stringify(out, null, 2));
})();

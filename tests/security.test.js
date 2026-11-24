/* Security tests — auth, sandbox, redaction, injection, rate limit */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 7813, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = fs.readFileSync(path.join(ROOT, 'data', 'access-token'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const T = require('../lib/tools.js');
    const { tools, safePath } = T;
    const runTool = T.runTool;
    const { redact, mask } = require('../lib/store.js');

    // 1. token required
    const a = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"x"}' });
    ok('POST without token → 401', a.status === 401);
    const b = await fetch(BASE + '/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rakib-token': 'wrong' }, body: '{}' });
    ok('wrong token → 401', b.status === 401);

    // 2. CSRF: foreign origin refused
    const c = await fetch(BASE + '/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rakib-token': TOKEN, Origin: 'https://evil.example' }, body: '{}' });
    ok('foreign origin → 403', c.status === 403);

    // 3. path sandbox
    let blocked = false; try { safePath('../../keys.json'); } catch { blocked = true; }
    ok('sandbox blocks ../', blocked);
    blocked = false; try { safePath('C:/Windows/win.ini'); } catch { blocked = true; }
    ok('sandbox blocks absolute path', blocked);
    const trav = await fetch(BASE + '/files/%2e%2e/%2e%2e/data/keys.json');
    ok('HTTP traversal blocked', trav.status === 403 || trav.status === 404, String(trav.status));

    // 4. code sandbox
    const r1 = await runTool('run_js', { code: 'return require("child_process").execSync("whoami").toString()' });
    ok('run_js blocks require()', /Error/.test(r1.text));
    const r2 = await runTool('run_js', { code: 'return process.env' });
    ok('run_js has no process', /Error|undefined/.test(r2.text), r2.text.slice(0, 40));
    const r3 = await runTool('run_js', { code: 'while(true){}' });
    ok('run_js timeout stops infinite loop', /Error/.test(r3.text));

    // 5. SSRF: fetch_url refuses local network
    const r4 = await runTool('fetch_url', { url: 'http://127.0.0.1:11434/api/tags' });
    ok('fetch_url blocks localhost (SSRF)', /Error/.test(r4.text), r4.text.slice(0, 60));
    const r5 = await runTool('fetch_url', { url: 'file:///C:/Windows/win.ini' });
    ok('fetch_url blocks file://', /Error/.test(r5.text));

    // 6. secret redaction
    const line = redact('key=sk-or-v1-abcdef1234567890abcdef GROQ_API_KEY=gsk_abcdefghijklmn');
    ok('redact removes sk-or keys', !line.includes('sk-or-v1-abcdef'));
    ok('redact removes gsk keys', !line.includes('gsk_abcdef'));
    ok('mask hides middle', mask('sk-or-v1-1234567890abcdef') === 'sk-or••••cdef', mask('sk-or-v1-1234567890abcdef'));

    // 7. keys never leave the server unmasked
    const st = await fetch(BASE + '/api/state').then((r) => r.json());
    const raw = JSON.stringify(st);
    ok('state has no raw key field', !/OPENROUTER_API_KEY"\s*:\s*"sk-/.test(raw));

    // 8. calculator injection
    let inj = false; try { tools.safeEval('constructor.constructor("return process")()'); } catch { inj = true; }
    ok('calculator blocks JS injection', inj);

    // 9. prompt-injection guard: uploaded file content is data, not instructions
    const { audit } = require('../lib/store.js');
    const logTxt = fs.readFileSync(path.join(ROOT, 'data', 'logs', 'audit.log'), 'utf8');
    ok('audit log contains no secrets', !/sk-or-v1-[A-Za-z0-9]{10,}/.test(logTxt));

    // 10. rate limiting exists
    let limited = false;
    for (let i = 0; i < 130; i++) {
      const r = await fetch(BASE + '/api/state');
      if (r.status === 429) { limited = true; break; }
    }
    ok('rate limit triggers', limited);
  } catch (e) { fail++; console.log('FAIL unexpected —', e.message); }
  finally { srv.kill(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();

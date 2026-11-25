/* RAKIB AI — end-to-end functional tests (real server, real Ollama) */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 7810;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = fs.readFileSync(path.join(__dirname, '..', 'data', 'access-token'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const api = async (p, opts = {}) => {
  const r = await fetch(BASE + p, { ...opts, headers: { 'Content-Type': 'application/json', 'x-rakib-token': TOKEN, ...(opts.headers || {}) } });
  return { status: r.status, json: await r.json().catch(() => null) };
};

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  try {
    // 1. static UI
    for (const p of ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/sw.js', '/icon-192.png']) {
      const r = await fetch(BASE + p);
      ok('static ' + p, r.ok);
    }
    // 2. state
    const st = await api('/api/state');
    ok('state returns agents', st.json.agents?.length >= 14, `${st.json.agents?.length} agents`);
    ok('state returns free models', st.json.models?.length >= 16, `${st.json.models?.length} models`);
    ok('ollama detected', !!st.json.health?.ollama?.up, JSON.stringify(st.json.health?.ollama));
    ok('all models are free', st.json.models.every((m) => m.free === true));
    // 3. auth
    const noTok = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"x"}' });
    ok('no token rejected', noTok.status === 401);
    // 4. rate-limit headers/security headers
    const idx = await fetch(BASE + '/');
    ok('nosniff header', idx.headers.get('x-content-type-options') === 'nosniff');
    // 5. upload + image studio
    const png = fs.readFileSync(path.join(__dirname, '..', 'workspace', 'images', 'sample-scene.png')).toString('base64');
    const up = await api('/api/upload', { method: 'POST', body: JSON.stringify({ name: 'e2e.png', data: 'data:image/png;base64,' + png }) });
    ok('upload works', up.json?.ok && up.json.path, up.json?.path);
    const im = await api('/api/image', { method: 'POST', body: JSON.stringify({ input: up.json.path, op: 'resize', width: 320, output: 'images/e2e-resized.png' }) });
    ok('image resize via API', im.json?.ok && im.json.width === 320, im.json?.text);
    const served = await fetch(BASE + '/files/' + up.json.path);
    ok('workspace file served', served.ok);
    // 6. path traversal blocked
    const trav = await fetch(BASE + '/files/../../keys.json');
    ok('traversal blocked', trav.status === 403 || trav.status === 404, String(trav.status));
    // 7. chat — calculator agent
    const t0 = Date.now();
    const chat = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text: '17*23 কত? শুধু সংখ্যা বলো', settings: { tools: ['calculator'], max_tokens: 64 } }) });
    ok('chat answered', chat.json?.ok, `${((Date.now() - t0) / 1000).toFixed(1)}s, model=${chat.json?.usedModel?.label}`);
    ok('chat has content', (chat.json?.content || '').length > 0, (chat.json?.content || '').slice(0, 60));
    // 8. task history + usage + audit
    const tasks = await api('/api/tasks');
    ok('task recorded', (tasks.json?.tasks || []).length > 0 || (chat.json?.taskId || '').length > 0, `runner=${(tasks.json?.tasks || []).length} taskId=${chat.json?.taskId || '-'}`);
    const usage = await api('/api/usage');
    ok('usage ledger has calls', usage.json?.total?.calls > 0, `${usage.json?.total?.calls} calls`);
    const audit = await api('/api/audit?n=20');
    ok('audit log has events', (audit.json?.events || []).length > 0);
    // 9. settings persistence
    const set = await api('/api/settings', { method: 'POST', body: JSON.stringify({ temperature: 0.5 }) });
    ok('settings saved', set.json?.settings?.temperature === 0.5);
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ temperature: 0.7 }) });
  } catch (e) {
    fail++; console.log('FAIL unexpected —', e.message);
  } finally {
    srv.kill();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();

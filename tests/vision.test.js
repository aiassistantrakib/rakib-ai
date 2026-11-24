/* Vision agent — real image → local qwen3.5:4b (vision capable) */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PORT = 7811, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = fs.readFileSync(path.join(__dirname, '..', 'data', 'access-token'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  await fetch(BASE + '/api/state'); // সার্ভারের gateway cache গরম করুন
  try {
    const b64 = fs.readFileSync(path.join(__dirname, '..', 'workspace', 'images', 'vision-small.png')).toString('base64');
    const t = Date.now();
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rakib-token': TOKEN },
      body: JSON.stringify({ text: 'এই ছবিতে কী রঙ দেখা যাচ্ছে? দুই শব্দে বাংলায় বলো।', images: ['data:image/png;base64,' + b64] }),
    });
    const j = await r.json();
    const secs = (Date.now() - t) / 1000;
    ok('vision request answered', j.ok, `${secs.toFixed(1)}s model=${j.usedModel?.label}`);
    ok('routed to vision agent', j.agent === 'vision', j.agent);
    ok('answer mentions a colour', /নীল|হলুদ|blue|yellow/i.test(j.content || ''), (j.content || '').slice(0, 60));
    ok('answer under 120s', secs < 120, secs.toFixed(1) + 's');
  } catch (e) { fail++; console.log('FAIL unexpected —', e.message); }
  finally { srv.kill(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();

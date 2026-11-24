/* Research agent — real web search + page fetch, no API key */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PORT = 7812, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = fs.readFileSync(path.join(__dirname, '..', 'data', 'access-token'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  await fetch(BASE + '/api/state');
  try {
    const { tools } = require('../lib/tools.js');
    // direct tool test
    const s = await tools.web_search.run({ query: 'OpenRouter free models 2026', max_results: 5 });
    ok('web_search returns results', (s.ui.results || []).length > 0, `${s.ui.count} results via ${(s.ui.engines || []).map((e) => e.engine + ':' + (e.n ?? e.error)).join(', ')}`);
    ok('web_search results have urls', (s.ui.results || []).every((r) => /^https?:/.test(r.url)));
    const f = await tools.fetch_url.run({ url: (s.ui.results[0] || {}).url || 'https://example.com' });
    ok('fetch_url reads a page', f.ui.chars > 200, `${f.ui.chars} chars from ${f.ui.title?.slice(0, 40)}`);
    // full agent path
    const t = Date.now();
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rakib-token': TOKEN },
      body: JSON.stringify({ text: 'সবচেয়ে বড় মহাসাগর কোনটি? এক লাইনে বলো।', settings: { tools: ['web_search', 'fetch_url'], max_tokens: 200 } }),
    });
    const j = await r.json();
    ok('research agent answered', j.ok, `${((Date.now() - t) / 1000).toFixed(1)}s, agent=${j.agent}, tools=${(j.toolTrace || []).map((x) => x.tool).join(',')}`);
    ok('answer is about oceans', /প্রশান্ত|Pacific|মহাসাগর/i.test(j.content || ''), (j.content || '').slice(0, 80));
  } catch (e) { fail++; console.log('FAIL unexpected —', e.message); }
  finally { srv.kill(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();

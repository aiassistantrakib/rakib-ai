/* TEST 3 — প্রতিটি মডেলকে আসল প্রম্পট পাঠিয়ে দেখা */
const gw = require('../lib/gateway.js');
const fs = require('fs');
const PROMPT = 'Reply with exactly: PONG';

(async () => {
  await gw.ollamaModels(true);
  const cat = await gw.catalogue();
  const rows = [];
  for (const m of cat) {
    const t = Date.now();
    let row = { id: m.id, provider: m.provider, label: m.label, ctx: m.ctx, input: m.inp.join('+'), tools: m.tools, free: m.free };
    try {
      const out = await gw.callModel({ ...m }, [{ role: 'user', content: PROMPT }], { max_tokens: 16, temperature: 0, timeoutMs: 25000 });
      row.responded = true; row.reply = (out.content || '').trim().slice(0, 40); row.ms = Date.now() - t;
    } catch (e) {
      row.responded = false; row.status = e.status || 0; row.error = String(e.message).slice(0, 90); row.ms = Date.now() - t;
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync('audit/T3-models.json', JSON.stringify(rows, null, 2));
  const ok = rows.filter(r => r.responded).length;
  console.log(`\nRESPONDED ${ok}/${rows.length}`);
})();

/* ফেজ ৪ / ধাপ ১ — OpenRouter ও Groq-এর লাইভ মডেল ডিসকভারি + ৩৮ শর্টলিস্ট যাচাই */
const mb = require('../lib/modelbench');
(async () => {
  const out = { at: new Date().toISOString(), providers: {}, shortlist: {} };
  for (const p of ['openrouter', 'groq']) {
    const r = await mb.listProviderModels(p);
    const free = r.models.filter((m) => m.free);
    out.providers[p] = { ok: r.ok, status: r.status, ms: r.ms, total: r.models.length, freeCount: free.length, freeIds: free.map((m) => m.id) };
  }
  const orIds = new Set((out.providers.openrouter.freeIds || []));
  const allIds = new Set(out.providers.openrouter.freeIds || []);
  out.shortlist = { total: mb.SHORTLIST.length, stillFree: [], nowMissing: [], nowPaid: [] };
  for (const id of mb.SHORTLIST) {
    if (orIds.has(id)) out.shortlist.stillFree.push(id); else out.shortlist.nowMissing.push(id);
  }
  console.log(JSON.stringify(out, null, 2));
})();

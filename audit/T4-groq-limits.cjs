/* Groq ফ্রি-টিয়ার সীমা: অফিসিয়াল ডকুমেন্ট থেকে (লাইভ যাচাই করা যায় না key ছাড়া) */
const fs = require('fs');
(async () => {
  const urls = ['https://console.groq.com/docs/rate-limits', 'https://console.groq.com/docs/models'];
  const out = {};
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      out[u] = { status: r.status, len: t.length, snippet: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
    } catch (e) { out[u] = { error: String(e.message).slice(0, 100) }; }
  }
  console.log(JSON.stringify(out, null, 2));
})();

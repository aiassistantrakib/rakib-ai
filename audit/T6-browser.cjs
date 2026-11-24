/* TEST 6 — আসল ব্রাউজার অটোমেশন (Chromium/Playwright):
   ১) পাবলিক সাইট খোলা ২) সাইটের ভেতরে সার্চ ৩) ফলাফল পাতা ৪) লিঙ্কে ক্লিক ৫) তথ্য + স্ক্রিনশট */
const { chromium } = require('playwright');
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const steps = [];
  try {
    await page.goto('https://en.wikipedia.org/wiki/Main_Page', { waitUntil: 'domcontentloaded', timeout: 45000 });
    steps.push({ step: '1 open site', url: page.url(), title: (await page.title()).slice(0, 70) });

    // ২. সাইটের নিজের সার্চ বক্সে টাইপ + Enter
    await page.fill('input[name="search"]', 'Quantum computing');
    await page.press('input[name="search"]', 'Enter');
    await page.waitForLoadState('domcontentloaded', { timeout: 45000 });
    steps.push({ step: '2 searched', url: page.url(), title: (await page.title()).slice(0, 80) });

    // ৩. ফলাফল পাতায় (search=) ফিরে লিঙ্ক তালিকা
    await page.goto('https://en.wikipedia.org/w/index.php?search=quantum+computing+hardware&title=Special%3ASearch&fulltext=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const results = await page.$$eval('#mw-content-text a[href^="/wiki/"]:not(.mw-selflink)', (as) => {
      const seen = new Set(); const out = [];
      for (const a of as) { const h = a.getAttribute('href'); const t = a.textContent.trim(); if (!t || t.length < 4 || seen.has(h) || h.includes(':')) continue; seen.add(h); out.push({ title: t.slice(0, 60), href: h }); if (out.length >= 5) break; }
      return out;
    });
    steps.push({ step: '3 results', count: results.length, first: results[0] || null });

    // ৪. প্রথম ফলাফলে আসল ক্লিক
    await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 60000 }), page.click(`a[href="${results[0].href}"]`)]);
    await page.waitForTimeout(1200);
    steps.push({ step: '4 clicked', url: page.url(), title: (await page.title()).slice(0, 90) });

    // ৫. তথ্য তোলা
    const text = await page.evaluate(() => { const p = Array.from(document.querySelectorAll('#mw-content-text p')); return p.map(x => x.innerText.replace(/\s+/g, ' ')).find(x => x.length > 120) || ''; });
    steps.push({ step: '5 extracted', textSample: text.slice(0, 320) });
    await page.screenshot({ path: 'audit/browser-proof.png' });
    steps.push({ step: '6 screenshot', file: 'audit/browser-proof.png' });
    console.log(JSON.stringify({ ok: results.length > 0 && /5 extracted/.test(steps.map(s => s.step).join(',')), secs: +((Date.now() - t0) / 1000).toFixed(1), steps }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message.slice(0, 220), steps }, null, 2));
  } finally { await browser.close(); }
})();

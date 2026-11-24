/* TEST 4 — আসল ইমেজ জেনারেশন: ফ্রি বেকঅন্ড একটার পর একটা চেষ্টা (কোনো key/paisa ছাড়া) */
const fs = require('fs');
const path = require('path');
const OUT = 'workspace/images';
fs.mkdirSync(OUT, { recursive: true });
const PROMPT = 'fashion product promotional image, elegant silk scarf on marble, warm studio light, premium editorial, 1:1';

async function tryPollinations() {
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(PROMPT) + '?width=1024&height=1024&nologo=true&seed=42';
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const file = path.join(OUT, 'test4-pollinations.jpg');
  fs.writeFileSync(file, buf);
  return { backend: 'pollinations.ai', model: 'flux (ডিফল্ট)', status: r.status, ctype: r.headers.get('content-type'), bytes: buf.length, secs: +((Date.now() - t0) / 1000).toFixed(1), file, isImage: buf[0] === 0xff && buf[1] === 0xd8 || buf.slice(0, 4).toString('hex') === '89504e47' };
}

async function tryHFPollinations() {
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(PROMPT + ', fashion editorial') + '?width=1024&height=1024&model=turbo&nologo=true&seed=7';
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const file = path.join(OUT, 'test4-turbo.jpg');
  fs.writeFileSync(file, buf);
  return { backend: 'pollinations.ai', model: 'turbo', status: r.status, bytes: buf.length, secs: +((Date.now() - t0) / 1000).toFixed(1), file, isImage: buf[0] === 0xff && buf[1] === 0xd8 };
}

(async () => {
  const out = [];
  for (const fn of [tryPollinations, tryHFPollinations]) {
    try { out.push(await fn()); } catch (e) { out.push({ backend: fn.name, error: String(e.message).slice(0, 160) }); }
  }
  console.log(JSON.stringify(out, null, 2));
})();

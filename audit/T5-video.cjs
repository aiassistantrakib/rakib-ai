/* TEST 5 — ইমেজ → ভিডিও: ৩টি ফ্রি পথ চেষ্টা (pollinations ভিডিও / hf space / ffmpeg) */
const fs = require('fs'); const path = require('path');
const OUT = 'workspace/videos'; fs.mkdirSync(OUT, { recursive: true });
const IMG = path.resolve('workspace/images/test4-pollinations.jpg');
const IMG_URL = 'https://image.pollinations.ai/prompt/' + encodeURIComponent('fashion product, silk scarf on marble, premium editorial') + '?width=768&height=768&nologo=true&seed=42';

async function tryPollinationsVideo(model) {
  const url = 'https://video.pollinations.ai/prompt/' + encodeURIComponent('slow cinematic push-in on a model wearing a pink silk scarf, studio light') + '?model=' + model + '&image=' + encodeURIComponent(IMG_URL) + '&seed=3';
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const file = path.join(OUT, 'test5-' + model + '.mp4');
  fs.writeFileSync(file, buf);
  const isMp4 = buf.slice(4, 8).toString() === 'ftyp';
  return { path: 'pollinations/' + model, status: r.status, ctype: r.headers.get('content-type'), bytes: buf.length, secs: +((Date.now() - t0) / 1000).toFixed(1), isMp4, file, head: isMp4 ? 'mp4' : buf.slice(0, 160).toString().replace(/\s+/g, ' ') };
}

async function tryHFSpace() {
  // Gradio queue API — ফ্রি পাবলিক Space
  const SPACE = 'https://lightricks-ltx-video-distilled.hf.space';
  const t0 = Date.now();
  const r = await fetch(SPACE + '/gradio_api/info', { signal: AbortSignal.timeout(30000) });
  const txt = (await r.text()).slice(0, 400);
  return { path: 'hf-space ltx-video', status: r.status, secs: +((Date.now() - t0) / 1000).toFixed(1), info: txt };
}

(async () => {
  const out = [];
  for (const m of ['wan-fast', 'ltx-2', 'seedance']) {
    try { out.push(await tryPollinationsVideo(m)); } catch (e) { out.push({ path: 'pollinations/' + m, error: String(e.message).slice(0, 140) }); }
  }
  try { out.push(await tryHFSpace()); } catch (e) { out.push({ path: 'hf-space', error: String(e.message).slice(0, 140) }); }
  console.log(JSON.stringify(out, null, 2));
})();

/* TEST 5 — HF Space (LTX-Video distilled): আসল image→video, Gradio queue API */
const fs = require('fs'); const path = require('path');
const SPACE = 'https://lightricks-ltx-video-distilled.hf.space';
const OUT = 'workspace/videos'; fs.mkdirSync(OUT, { recursive: true });
const IMG = path.resolve('workspace/images/test4-pollinations.jpg');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function js(url, opts) { const r = await fetch(url, opts); const t = await r.text(); try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 400), _status: r.status }; } }
const H = { 'Content-Type': 'application/json' };

(async () => {
  const t0 = Date.now();
  const fd = new FormData();
  fd.append('files', new Blob([fs.readFileSync(IMG)], { type: 'image/jpeg' }), 'test4.jpg');
  const up = await js(SPACE + '/gradio_api/upload', { method: 'POST', body: fd });
  const serverPath = Array.isArray(up) ? up[0] : up.files?.[0];
  console.log('1) uploaded ->', serverPath);

  const data = [
    'slow cinematic push-in, the model turns her head slightly, silk scarf moves gently in the studio light',
    'worst quality, inconsistent motion, blurry, jittery, distorted',
    { path: serverPath, meta: { _type: 'gradio.FileData' }, orig_name: 'test4.jpg' },
    null, 512, 704, 'image-to-video', 2, 9, 42, false, 1, true
  ];
  const call = await js(SPACE + '/gradio_api/call/image_to_video', { method: 'POST', headers: H, body: JSON.stringify({ data }) });
  console.log('2) queued event_id:', call.event_id || JSON.stringify(call).slice(0, 200));
  if (!call.event_id) return;

  // SSE স্ট্রিম
  const r = await fetch(SPACE + '/gradio_api/call/image_to_video/' + call.event_id, { headers: { Accept: 'text/event-stream' } });
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let done = null;
  while (true) {
    const { value, done: fin } = await reader.read(); if (fin) break;
    buf += dec.decode(value, { stream: true });
    if (/event: (complete|error)/.test(buf)) { done = buf; break; }
    if ((Date.now() - t0) / 1000 > 540) { console.log('timeout 540s'); break; }
  }
  console.log('3) SSE tail:', buf.slice(-600).replace(/\s+/g, ' '));
  const m = buf.match(/data: (\[[\s\S]*?\])\s*$/m) || buf.match(/data: (\[[\s\S]*?\])/);
  if (m) {
    const arr = JSON.parse(m[1]);
    const vid = arr.find(x => x && (x.video || x.path || x.url));
    console.log('4) result:', JSON.stringify(vid).slice(0, 300));
    const url = vid?.video?.url || vid?.url || (vid?.video?.path ? SPACE + '/gradio_api/file=' + vid.video.path : null);
    if (url) {
      const vr = await fetch(url); const b = Buffer.from(await vr.arrayBuffer());
      const f = path.join(OUT, 'test5-ltx.mp4'); fs.writeFileSync(f, b);
      console.log('5) saved', f, b.length, 'bytes, mp4:', b.slice(4, 8).toString() === 'ftyp', 'secs:', ((Date.now() - t0) / 1000).toFixed(1));
    }
  }
  console.log('total secs:', ((Date.now() - t0) / 1000).toFixed(1));
})();

/* =========================================================================
   RAKIB AI — media backends (আসল diffusion ছবি + আসল image→video)
   সব ফ্রি পাবলিক সার্ভিস; key লাগে না। কোনো ব্যর্থতায় স্পষ্ট error, নকল নয়।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('./config');
const { audit } = require('./store');

const IMG_DIR = path.join(WORKSPACE, 'images');
const VID_DIR = path.join(WORKSPACE, 'videos');
const LTX_SPACE = 'https://lightricks-ltx-video-distilled.hf.space';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fname(name, ext) {
  const base = String(name || 'gen').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'gen';
  return `${base}-${Date.now().toString(36)}.${ext}`;
}

/* ---------------- ছবি: Pollinations (FLUX) ---------------- */
async function generateImage(prompt, { width = 1024, height = 1024, name } = {}) {
  const t0 = Date.now();
  const w = Math.min(1536, Math.max(256, width));
  const h = Math.min(1536, Math.max(256, height));
  /* একাধিক ফ্রি ব্যাকএন্ড চেষ্টা — প্রথম যেটা সত্যি ছবি দেয় সেটাই ব্যবহার */
  const seed = Math.floor(Math.random() * 1e6);
  const base = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(String(prompt).slice(0, 900));
  const candidates = [
    { url: `${base}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`, model: 'FLUX (ফ্রি)' },
    { url: `${base}?width=${w}&height=${h}&nologo=true&model=turbo&seed=${seed}`, model: 'Turbo (ফ্রি)' },
    { url: `${base}?width=${w}&height=${h}&nologo=true&seed=${seed}`, model: 'ডিফল্ট (ফ্রি)' },
  ];
  let buf = null, usedModel = '', lastErr = '';
  for (const c of candidates) {
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RAKIB-AI/1.1', Accept: 'image/*' } });
      const b = Buffer.from(await r.arrayBuffer());
      const jpg = b[0] === 0xff && b[1] === 0xd8;
      const png = b.slice(0, 4).toString('hex') === '89504e47';
      /* ব্যাকএন্ড লিমিট-মেসেজও ছবি হিসেবে পাঠায় — তাই স্টেটাস ok হতে হবে */
      if (r.ok && (jpg || png) && b.length > 2000) { buf = b; usedModel = c.model; break; }
      lastErr = r.status === 402 ? 'ফ্রি লিমিট শেষ (১টি ছবি/৪৫ সেকেন্ড) — ৪৫ সেকেন্ড পর আবার চেষ্টা করুন'
        : `HTTP ${r.status} (${b.length}B)`;
    } catch (e) { lastErr = String(e.message).slice(0, 100); }
  }
  if (!buf && /লিমিট/.test(lastErr)) {
    /* ফ্রি লিমিট: ৪৫ সেকেন্ড অপেক্ষা করে একবার আবার চেষ্টা */
    await new Promise((r) => setTimeout(r, 46000));
    try {
      const r2 = await fetch(candidates[0].url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Mozilla/5.0 RAKIB-AI/1.1', Accept: 'image/*' } });
      const b2 = Buffer.from(await r2.arrayBuffer());
      if (r2.ok && b2[0] === 0xff && b2[1] === 0xd8 && b2.length > 2000) { buf = b2; usedModel = candidates[0].model; lastErr = ''; }
    } catch {}
  }
  if (!buf) throw new Error('সব ফ্রি ইমেজ ব্যাকএন্ড ব্যর্থ — ' + lastErr);
  const r = { ok: true };
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.slice(0, 4).toString('hex') === '89504e47';
  if (!isJpeg && !isPng) throw new Error('backend ছবি দেয়নি: ' + buf.slice(0, 120).toString().replace(/\s+/g, ' '));
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const file = fname(name, isPng ? 'png' : 'jpg');
  fs.writeFileSync(path.join(IMG_DIR, file), buf);
  const out = { file, rel: 'images/' + file, bytes: buf.length, secs: +((Date.now() - t0) / 1000).toFixed(1), backend: 'pollinations.ai', model: usedModel, width: w, height: h, cost: 0 };
  audit('image_generate', { rel: out.rel, bytes: out.bytes, secs: out.secs });
  return out;
}

/* ---------------- ভিডিও: HF Space LTX-Video (Gradio API) ---------------- */
async function jfetch(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 300) }; }
}

async function videoFromImage(imageRel, { prompt, name, seconds = 2 } = {}) {
  const t0 = Date.now();
  const abs = path.resolve(WORKSPACE, String(imageRel).replace(/^workspace[\\/]/, ''));
  if (!abs.startsWith(path.resolve(WORKSPACE))) throw new Error('workspace-এর ভিতরের ছবি দিন');
  if (!fs.existsSync(abs)) throw new Error('ছবি পাওয়া যায়নি: ' + imageRel);

  // ১) ফাইল আপলোড
  const fd = new FormData();
  fd.append('files', new Blob([fs.readFileSync(abs)], { type: /\.png$/i.test(abs) ? 'image/png' : 'image/jpeg' }), path.basename(abs));
  const up = await jfetch(LTX_SPACE + '/gradio_api/upload', { method: 'POST', body: fd });
  const serverPath = Array.isArray(up.json) ? up.json[0] : up.json?.files?.[0];
  if (!serverPath) throw new Error('আপলোড ব্যর্থ: ' + JSON.stringify(up).slice(0, 200));

  // ২) জব কিউ
  const data = [
    String(prompt || 'slow cinematic motion, subtle movement, natural light').slice(0, 400),
    'worst quality, inconsistent motion, blurry, jittery, distorted',
    { path: serverPath, meta: { _type: 'gradio.FileData' }, orig_name: path.basename(abs) },
    null, 512, 704, 'image-to-video', Math.min(4, Math.max(1, seconds)), 9, Math.floor(Math.random() * 1e6), false, 1, true,
  ];
  const call = await jfetch(LTX_SPACE + '/gradio_api/call/image_to_video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
  });
  const id = call.json?.event_id;
  if (!id) throw new Error('কিউ ব্যর্থ: ' + JSON.stringify(call).slice(0, 200));

  // ৩) SSE — সম্পন্ন হওয়া পর্যন্ত
  const r = await fetch(LTX_SPACE + '/gradio_api/call/image_to_video/' + id, { headers: { Accept: 'text/event-stream' } });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 480000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (/event: (complete|error)/.test(buf)) break;
  }
  if (/event: error/.test(buf)) {
    /* Space-এর GPU রানটাইম ব্যর্থ — কখনো "কাজ করছে" দেখানো হবে না */
    const e = new Error('LTX Space জব ব্যর্থ (রিমোট GPU ত্রুটি) — ভিডিও তৈরি হয়নি। Space: ' + LTX_SPACE);
    e.code = 'VIDEO_BACKEND_FAILED';
    throw e;
  }
  const m = buf.match(/data: (\[[\s\S]*?\])/);
  if (!m) throw new Error('ভিডিও ফলাফল আসেনি (সময় শেষ?)');
  const arr = JSON.parse(m[1]);
  const v = arr.find((x) => x && x.video)?.video;
  const url = v?.url || (v?.path ? LTX_SPACE + '/gradio_api/file=' + v.path : null);
  if (!url) throw new Error('ফলাফলে ভিডিও নেই');

  const vr = await fetch(url);
  const buf2 = Buffer.from(await vr.arrayBuffer());
  if (buf2.slice(4, 8).toString() !== 'ftyp') throw new Error('ডাউনলোড করা ফাইল mp4 নয়');
  fs.mkdirSync(VID_DIR, { recursive: true });
  const file = fname(name || 'video', 'mp4');
  fs.writeFileSync(path.join(VID_DIR, file), buf2);

  // ৪) ffprobe (থাকলে) — আসল মাপ যাচাই
  let width = 704, height = 512, duration = null, frames = null;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,nb_frames', '-of', 'json', path.join(VID_DIR, file)], { encoding: 'utf8', timeout: 20000 });
    const j = JSON.parse(out);
    width = j.streams?.[0]?.width || width;
    height = j.streams?.[0]?.height || height;
    frames = Number(j.streams?.[0]?.nb_frames) || null;
    duration = j.format?.duration ? +Number(j.format.duration).toFixed(2) : null;
  } catch {}

  const res = {
    file, rel: 'videos/' + file, bytes: buf2.length, secs: +((Date.now() - t0) / 1000).toFixed(1),
    backend: 'Hugging Face Space (public, free)', model: 'LTX-Video 2B distilled (image-to-video)',
    width, height, duration, frames, cost: 0, gpu: 'remote (backend-এর GPU)',
  };
  audit('video_generate', { rel: res.rel, bytes: res.bytes, secs: res.secs });
  return res;
}

function status() {
  return {
    image: { backend: 'pollinations.ai', model: 'FLUX', key: false, cost: 0, ready: true },
    video: { backend: 'HF Space LTX-Video distilled', model: 'ltx-video-2b', key: false, cost: 0, ready: true, note: 'রিমোট GPU; কিউ ব্যস্ত থাকলে অপেক্ষা/ব্যর্থ হতে পারে' },
    localGpu: { cuda: false, note: 'এই মেশিনে NVIDIA GPU নেই — লোকাল AI ভিডিও চলবে না' },
  };
}

module.exports = { generateImage, videoFromImage, status, sleep };

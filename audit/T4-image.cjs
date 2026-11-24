/* TEST 4 — ছবি তৈরি (ফ্যাশন প্রোডাক্ট প্রোমোশনাল) + এডিটিং */
const T = require('../lib/tools.js');
const fs = require('fs');
const t0 = Date.now();

// (ক) লোকাল ইমেজ-জেনারেশন মডেল আছে কি না — সত্যি করে দেখা
const ollamaTags = JSON.parse(fs.readFileSync('audit/ollama-tags.json', 'utf8'));

// (খ) প্রোগ্রাম্যাটিক পোস্টার (pure JS PNG, কোনো ডিপেন্ডেন্সি নেই)
const W = 1024, H = 1024;
const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, ...c); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// ব্যাকগ্রাউন্ড: উষ্ণ গ্রেডিয়েন্ট
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, ...mix([28, 20, 34], [92, 44, 36], (x / W * 0.5 + y / H * 0.5)));
// গোল্ডেন ফ্রেম
rect(40, 40, W - 40, 52, [212, 175, 105]);
rect(40, H - 52, W - 40, H - 40, [212, 175, 105]);
rect(40, 40, 52, H - 40, [212, 175, 105]);
rect(W - 52, 40, W - 40, H - 40, [212, 175, 105]);
// হেডলাইন বার
rect(120, 150, W - 120, 178, [212, 175, 105]);
rect(120, 198, 520, 216, [180, 150, 100]);
// প্রোডাক্ট সিলুয়েট: ব্যাগ (ট্র্যাপিজয়েড + হাতল)
for (let y = 430; y < 800; y++) {
  const t = (y - 430) / 370;
  const half = 150 + t * 60;
  for (let x = Math.round(512 - half); x < Math.round(512 + half); x++) {
    const shade = 1 - Math.abs(x - 512) / (half * 1.6);
    set(x, y, ...mix([58, 32, 26], [150, 96, 62], Math.max(0, shade) * 0.9 + t * 0.1));
  }
}
for (let y = 330; y < 440; y++) for (let x = 0; x < W; x++) {
  const d = Math.abs(Math.hypot(x - 512, (y - 440) * 1.35) - 155);
  if (d < 16) set(x, y, ...mix([120, 78, 48], [200, 160, 110], 1 - d / 16));
}
// ব্যাজ + লেবেল বার
rect(392, 700, 632, 742, [212, 175, 105]);
rect(150, 860, 640, 884, [235, 225, 210]);
rect(150, 900, 500, 918, [190, 178, 165]);
rect(150, 936, 560, 954, [190, 178, 165]);
// ফুটার
rect(150, 990, 874, 992, [120, 100, 80]);

const png = T.encodePng(W, H, px);
fs.mkdirSync('workspace/images', { recursive: true });
fs.writeFileSync('workspace/images/fashion-promo.png', png);

// (গ) এডিটিং অপারেশন চেইন
const ops = [
  { op: 'watermark', text: 'RAKIB AI', output: 'images/fashion-promo-wm.png' },
  { op: 'brightness', amount: 115, output: 'images/fashion-promo-bright.png' },
  { op: 'resize', width: 512, output: 'images/fashion-promo-512.png' },
  { op: 'grayscale', output: 'images/fashion-promo-gray.png' },
];
const results = [];
(async () => {
  let input = 'images/fashion-promo.png';
  for (const o of ops) {
    const r = await T.runTool('image_ops', { input, ...o });
    results.push({ op: o.op, ok: !r.ui.error, out: r.ui.output, size: `${r.ui.width}x${r.ui.height}`, bytes: r.ui.bytes || null, err: r.ui.error || null });
    input = r.ui.output || input;
  }
  const rep = {
    test: 'image_generation',
    backend: 'RAKIB AI local PNG rasterizer (pure JS, zero dependency)',
    local_image_model_present: ollamaTags.models.some((m) => /flux|sdxl|stable-diffusion|sd3|comfy/i.test(m.name)),
    ollama_models: ollamaTags.models.map((m) => m.name),
    output: 'workspace/images/fashion-promo.png',
    dims: `${W}x${H}`,
    bytes: png.length,
    secs: +((Date.now() - t0) / 1000).toFixed(2),
    cost_usd: 0,
    edits: results,
  };
  fs.writeFileSync('audit/T4-image.json', JSON.stringify(rep, null, 2));
  console.log(JSON.stringify(rep, null, 2));
})();

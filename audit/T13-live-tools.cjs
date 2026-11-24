/* লাইভ প্রমাণ: RAKIB AI-এর নিজের নতুন টুলগুলো (browser/image/video) আসলেই কাজ করে */
const { runTool } = require('../lib/tools');
(async () => {
  const out = {};
  let r = await runTool('image_generate', { prompt: 'fashion product promo, emerald silk dress on marble pedestal, soft studio light, premium editorial', width: 1024, height: 1024, name: 't13-fashion' });
  out.image_generate = { ok: !r.ui.error, ui: r.ui, text: r.text.slice(0, 200) };

  r = await runTool('browser_open', { url: 'https://en.wikipedia.org/wiki/Main_Page', search_selector: 'input[name="search"]', query: 'Open-source software', max_chars: 600 });
  out.browser_open = { ok: !r.ui.error, url: r.ui.url, title: r.ui.title, screenshot: r.ui.screenshot, ms: r.ui.ms, text: r.text.slice(0, 220) };

  r = await runTool('browser_click', { text: 'Free software', max_chars: 400 });
  out.browser_click = { ok: !r.ui.error, url: r.ui.url, title: r.ui.title, screenshot: r.ui.screenshot };
  await runTool('browser_close', {});

  const img = out.image_generate.ui.rel;
  if (img) {
    r = await runTool('video_from_image', { image_path: img, prompt: 'slow cinematic push-in, silk fabric moves gently', name: 't13-fashion' });
    out.video_from_image = { ok: !r.ui.error, ui: r.ui, text: r.text.slice(0, 220) };
  }
  console.log(JSON.stringify(out, null, 2));
})();

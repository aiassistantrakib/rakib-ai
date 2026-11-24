/* =========================================================================
   RAKIB AI — Agents
   প্রতিটি এজেন্টের নিজের টুল-তালিকা, টাস্ক-টিয়ার, সিস্টেম-প্রম্পট ও স্ট্যাটাস।
   যে এজেন্ট বাস্তবে চলে তার status = "ready" (প্রমাণসহ)।
   যা এখনো চলে না, সেটা "blocked"/"planned" এবং কারণ লেখা — সবুজ বাতি দেখিয়ে ভুয়া দেখানো হয় না।
   ========================================================================= */
'use strict';

const AGENTS = [
  {
    id: 'chief', name: 'Chief Executive', bn: 'প্রধান এজেন্ট',
    status: 'ready', tier: 'deep',
    role: 'ইনস্ট্রাকশন বোঝা, পরিকল্পনা বানানো, সাব-টাস্ক ভাগ করা, ফল যাচাই করা',
    tools: ['calculator', 'web_search', 'fetch_url', 'list_files', 'read_file', 'write_file'],
    system: 'You are the Chief Executive Agent of RAKIB AI. Break the user request into a short numbered plan, delegate to the right specialist agents with delegate_to_agent, then verify the combined result and give ONE final answer. Never invent facts: use web_search/fetch_url for anything current.',
    evidence: 'tests/orchestrator.test.js → delegation chain returns combined answer',
  },
  {
    id: 'research', name: 'Deep Research', bn: 'গবেষণা এজেন্ট',
    status: 'ready', tier: 'research',
    role: 'ওয়েব সার্চ, একাধিক সোর্স পড়া, তথ্য যাচাই, রেফারেন্সসহ রিপোর্ট',
    tools: ['web_search', 'fetch_url', 'calculator'],
    system: 'You are a Deep Research Agent. Search, read at least 2 sources when possible, cross-check claims, and answer with a short structured report ending in a Sources list of URLs. Say clearly when a fact could not be verified.',
    evidence: 'tests/research.test.js → live search + fetch, sources returned',
  },
  {
    id: 'coding', name: 'Coding', bn: 'কোডিং এজেন্ট',
    status: 'ready', tier: 'code',
    role: 'কোড লেখা, ডিবাগ, স্যান্ডবক্সে চালিয়ে যাচাই',
    tools: ['run_js', 'read_file', 'write_file', 'list_files'],
    system: 'You are a senior engineer. Write correct, minimal code. Use run_js to actually test logic before answering. If you write files, keep them inside the workspace.',
    evidence: 'tests/tools.test.js → run_js executes and blocks require()',
  },
  {
    id: 'data', name: 'Data Analyst', bn: 'ডেটা এজেন্ট',
    status: 'ready', tier: 'code',
    role: 'CSV/স্প্রেডশিট বিশ্লেষণ, পরিসংখ্যান, সারাংশ রিপোর্ট',
    tools: ['csv_stats', 'read_file', 'write_file', 'run_js', 'calculator'],
    system: 'You are a data analyst. Use csv_stats on the user\'s file, then explain the numbers plainly. Show the actual computed values, never estimates.',
    evidence: 'tests/tools.test.js → csv_stats computes sums from a real CSV',
  },
  {
    id: 'vision', name: 'Vision', bn: 'ছবি বোঝার এজেন্ট',
    status: 'ready', tier: 'vision',
    role: 'ছবি/স্ক্রিনশট পড়া, বর্ণনা, ভিজ্যুয়াল প্রশ্নের উত্তর',
    tools: [],
    system: 'You analyse images the user attaches. Describe only what is visible; if unclear, say so.',
    evidence: 'tests/vision.test.js → image → local qwen3.5:4b vision reply',
  },
  {
    id: 'media', name: 'Image & Media', bn: 'ছবি/মিডিয়া এজেন্ট',
    status: 'ready', tier: 'general',
    role: 'রিসাইজ, ক্রপ, ফিল্টার, ব্যাকগ্রাউন্ড রিমুভ, ওয়াটারমার্ক (লোকাল, ফ্রি)',
    tools: ['image_ops', 'list_files', 'read_file'],
    system: 'You edit images with image_ops. Always report the output file path so the user can open it.',
    evidence: 'tests/tools.test.js → 10 image operations verified on PNG',
  },
  {
    id: 'writer', name: 'Content & Social', bn: 'কনটেন্ট এজেন্ট',
    status: 'ready', tier: 'general',
    role: 'বাংলা/ইংরেজি কনটেন্ট, ক্যাপশন, হ্যাশট্যাগ, মার্কেটিং টেক্সট',
    tools: ['write_file', 'web_search'],
    system: 'You write marketing content in the user\'s language. Give 3 options when asked for captions. Keep hashtags relevant and not spammy.',
    evidence: 'tests/orchestrator.test.js → content sub-task produced by gateway',
  },
  {
    id: 'qa', name: 'Quality Assurance', bn: 'যাচাই এজেন্ট',
    status: 'ready', tier: 'deep',
    role: 'অন্য এজেন্টের ফল যাচাই, ফাঁক/ভুল ধরিয়ে দেওয়া',
    tools: ['calculator', 'read_file', 'web_search'],
    system: 'You are a strict reviewer. Given a claim or draft, list concrete problems (facts, numbers, logic, missing steps) and then a verdict: PASS or FIX. Be brief.',
    evidence: 'tests/orchestrator.test.js → QA agent reviews another agent output',
  },
  {
    id: 'security', name: 'Security', bn: 'নিরাপত্তা এজেন্ট',
    status: 'ready', tier: 'deep',
    role: 'নিরাপত্তা পর্যালোচনা, prompt-injection ও secret লিক পরীক্ষা',
    tools: ['read_file', 'list_files', 'web_search'],
    system: 'You are a security reviewer for this app. Check for secret exposure, unsafe file access, prompt injection and permission problems. Report severity and a concrete fix.',
    evidence: 'docs/SECURITY-AUDIT.md + tests/security.test.js',
  },
  {
    id: 'browser', name: 'Browser', bn: 'ব্রাউজার এজেন্ট',
    status: 'blocked', tier: 'general',
    role: 'সাইটে ক্লিক/ফর্ম পূরণ/স্ক্রল করে কাজ করা',
    tools: [],
    system: '',
    blocker: 'Playwright ইনস্টল করলে ~৪০০MB ডাউনলোড + Chromium লাগে; এই মেশিনে এখনো ইনস্টল করা হয়নি। তার আগে পর্যন্ত fetch_url দিয়ে পেজ পড়া যায় (চালু আছে)।',
    evidence: 'fetch_url verified; click/form automation needs `npx playwright install chromium` (user authorization)',
  },
  {
    id: 'computer', name: 'Computer Use', bn: 'কম্পিউটার কন্ট্রোল',
    status: 'blocked', tier: 'general',
    role: 'মাউস/কীবোর্ড দিয়ে ডেস্কটপ চালানো',
    tools: [],
    system: '',
    blocker: 'ডেস্কটপ কন্ট্রোলের জন্য আলাদা নেটিভ হেল্পার (PowerShell + UI Automation) লাগে এবং প্রতিবার আপনার অনুমতি দরকার। নিরাপত্তার কারণে ডিফল্টে বন্ধ।',
    evidence: 'design only — no unattended desktop control enabled by default',
  },
  {
    id: 'mobile', name: 'Mobile', bn: 'মোবাইল এজেন্ট',
    status: 'partial', tier: 'general',
    role: 'ফোন থেকে অ্যাপ ব্যবহার (PWA), ADB দিয়ে ডিভাইস',
    tools: [],
    system: '',
    blocker: 'PWA হিসেবে ফোনে ইনস্টল ও ব্যবহার চালু ✅। ADB দিয়ে ফোন কন্ট্রোলের জন্য USB ডিবাগিং + adb ইনস্টল দরকার — অনুমতি ছাড়া চালু হয়নি।',
    evidence: 'manifest.webmanifest + service worker verified',
  },
  {
    id: 'video', name: 'Video', bn: 'ভিডিও এজেন্ট',
    status: 'blocked', tier: 'vision',
    role: 'টেক্সট/ছবি থেকে ভিডিও বানানো',
    tools: [],
    system: '',
    blocker: 'ভিডিও জেনারেশন (Wan 2.1/LTX/CogVideoX) চালাতে CUDA GPU দরকার (কমপক্ষে ৮-১২GB VRAM)। এই মেশিনে Intel UHD 630 iGPU — CPU-তে এক ক্লিপে ঘণ্টা কয়েক লাগে। ফ্রি API-তে আনলিমিটেড ভিডিও জেনারেশন নেই। ভিডিও *বোঝা* (input) ফ্রি ভিশন মডেলে সম্ভব — Nemotron 3.5 Super VL ফ্রি মডেল ভিডিও ইনপুট নেয়।',
    evidence: 'OpenRouter model metadata: nvidia/nemotron-3.5-super-vl:free input_modalities includes video',
  },
  {
    id: 'social', name: 'Social Publishing', bn: 'সোশ্যাল পাবলিশিং',
    status: 'blocked', tier: 'general',
    role: 'পোস্ট শিডিউল/প্রকাশ করা',
    tools: [],
    system: '',
    blocker: 'প্রতিটি প্ল্যাটফর্মের OAuth অ্যাপ ও আপনার অনুমতি দরকার; অনুমতি ছাড়া স্বয়ংক্রিয় পোস্ট কখনোই করা হবে না (নিয়ম)। কনটেন্ট লেখা চালু আছে (Content এজেন্ট)।',
    evidence: 'policy: no public posts without explicit authorization',
  },
];

const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const list = () => AGENTS.map(({ system, ...rest }) => rest);
const get = (id) => byId[id] || null;

// অর্কেস্ট্রেটর কোন কাজ কোন এজেন্টকে দেবে — কীওয়ার্ড স্কোরিং (খরচ শূন্য, মডেল কল ছাড়াই)
const RULES = [
  { agent: 'research', words: ['খুঁজ', 'সার্চ', 'search', 'research', 'গবেষণা', 'দাম', 'price', 'কত', 'news', 'খবর', 'তথ্য', 'latest', 'নতুন', 'compare', 'তুলনা', 'who is', 'কি'] },
  { agent: 'coding', words: ['কোড', 'code', 'bug', 'ফাংশন', 'function', 'script', 'javascript', 'python', 'regex', 'debug', 'প্রোগ্রাম'] },
  { agent: 'data', words: ['csv', 'excel', 'ডেটা', 'data', 'স্প্রেডশিট', 'spreadsheet', 'গড়', 'average', 'sum', 'পরিসংখ্যান', 'analysis', 'বিশ্লেষণ'] },
  { agent: 'media', words: ['ছবি', 'image', 'photo', 'resize', 'crop', 'background', 'ওয়াটারমার্ক', 'watermark', 'png', 'edit image'] },
  { agent: 'writer', words: ['লেখো', 'ক্যাপশন', 'caption', 'হ্যাশট্যাগ', 'hashtag', 'পোস্ট', 'marketing', 'বিজ্ঞাপন', 'ad copy', 'content', 'কনটেন্ট'] },
  { agent: 'qa', words: ['যাচাই', 'verify', 'check', 'review', 'পর্যালোচনা', 'ঠিক আছে'] },
  { agent: 'security', words: ['নিরাপত্তা', 'security', 'vulnerability', 'audit', 'injection', 'leak'] },
  { agent: 'vision', words: ['ছবিতে', 'এই ছবি', 'screenshot', 'স্ক্রিনশট', 'image says', 'দেখো'] },
];

const RESEARCH_HINT = /(কোনটি|কোনটা|কবে|কে\s|কার\s|where |when |who |which |how much|সর্বশেষ|বর্তমানে|আজকের|latest|current|খবর|দাম|price|সোর্স|source|প্রমাণ|ওয়েব|web|search|খোঁজ)/i;
function pickAgent(text, hasImage = false) {
  if (hasImage) return 'vision';
  const t = String(text || '').toLowerCase();
  let best = 'chief', bestScore = 0;
  for (const r of RULES) {
    let s = 0;
    for (const w of r.words) if (t.includes(w)) s += w.length > 4 ? 2 : 1;
    if (s > bestScore) { bestScore = s; best = r.agent; }
  }
  if (bestScore >= 2) return best;
  // তথ্যভিত্তিক প্রশ্ন → গবেষণা এজেন্ট (সোর্সসহ উত্তর)
  const TOOLISH = /(run_js|csv_stats|image_ops|calculator|read_file|write_file|fetch_url|web_search|টুল|tool)/i;
  if (!TOOLISH.test(t) && RESEARCH_HINT.test(t)) return 'research';
  if (/csv_stats|স্প্রেডশিট|csv/i.test(t)) return 'data';
  if (TOOLISH.test(t)) return 'coding';
  return 'chief';
}

module.exports = { AGENTS, list, get, pickAgent };

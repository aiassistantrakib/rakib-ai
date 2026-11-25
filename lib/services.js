/* =========================================================================
   RAKIB AI — ফ্রি সার্ভিস রেজিস্ট্রি (Phase 10)
   প্রতিটি সার্ভিসের অফিসিয়াল URL, ক্ষমতা, ফ্রি লিমিট, শর্ত, অ্যাকাউন্ট দরকার কি না,
   সর্বশেষ যাচাইয়ের তারিখ ও ফলাফল — সব এখানে এক জায়গায়, সত্যি তথ্যই।
   ========================================================================= */
'use strict';

module.exports = [
  {
    id: 'ollama', name: 'Ollama (লোকাল)', kind: 'text',
    url: 'https://ollama.com', capabilities: ['text', 'vision', 'tools'],
    freeLimits: 'আনলিমিটেড (নিজের CPU/GPU)', restrictions: 'হার্ডওয়্যার নিজের; মডেল ডাউনলোড লাগে',
    account: false, api: 'local HTTP (/api/chat)',
    verified: '2026-11-25', status: 'working',
    note: 'একমাত্র সত্যিকারের key-মুক্ত পথ। qwen3.5:4b — বাংলা + টুল কলিং কাজ করে।',
  },
  {
    id: 'pollinations', name: 'Pollinations (FLUX)', kind: 'image',
    url: 'https://pollinations.ai', capabilities: ['text-to-image'],
    freeLimits: '৪৫ সেকেন্ডে ১টি ছবি (লগইন ছাড়া)', restrictions: 'ওয়াটারমার্ক "pollinations.ai" থাকে',
    account: false, api: 'GET image.pollinations.ai/prompt/...',
    verified: '2026-11-25', status: 'working',
    note: 'ফ্রি লিমিটে HTTP 402 + "Free limit reached" ছবি আসে — কোড সেটা ছবি হিসেবে গ্রহণ করে না, ৪৬s অপেক্ষা করে আবার চায়।',
  },
  {
    id: 'hf-ltx', name: 'HF Space — LTX-Video', kind: 'video',
    url: 'https://huggingface.co/spaces/Lightricks/ltx-video-distilled', capabilities: ['text-to-video', 'image-to-video'],
    freeLimits: 'ফ্রি GPU কিউ (zero-a10g)', restrictions: 'কিউ লম্বা, Space ব্যস্ত থাকতে পারে',
    account: false, api: 'Gradio (/gradio_api/call/...)',
    verified: '2026-11-25', status: 'failing',
    note: 'Phase 3-এ একবার সত্যি ভিডিও দিয়েছিল; এখন সব জব event:error দেয় (রিমোট GPU দিকের ত্রুটি)। "কাজ করছে" হিসেবে দেখানো হয় না।',
  },
  {
    id: 'openrouter', name: 'OpenRouter', kind: 'text',
    url: 'https://openrouter.ai', capabilities: ['text', 'vision', 'tools'],
    freeLimits: ':free মডেল — ডেইলি লিমিট (কী লাগে)', restrictions: 'ফ্রি মডেল বদলায়',
    account: true, api: 'OpenAI-compatible',
    verified: '2026-11-25', status: 'needs-key',
    note: 'কী ছাড়াই মডেল তালিকা পড়া যায় (৪৭৩টি, ১২টি ফ্রি)। ইনফারেন্সের জন্য ফ্রি কী লাগে।',
  },
  {
    id: 'groq', name: 'Groq', kind: 'text',
    url: 'https://console.groq.com', capabilities: ['text', 'tools'],
    freeLimits: 'gpt-oss-120b: 30 RPM, 1,000 RPD, 8K TPM, 200K TPD', restrictions: 'ফ্রি টিয়ার সীমিত, আনলিমিটেড নয়',
    account: true, api: 'OpenAI-compatible',
    verified: '2026-11-25', status: 'needs-key',
    note: 'সবচেয়ে দ্রুত ইনফারেন্স। কী ছাড়া 401।',
  },
  {
    id: 'coarena', name: 'Coarena', kind: 'text',
    url: 'https://coarena.ai', capabilities: ['text'],
    freeLimits: 'ফ্রি ডেইলি কোটা (কী লাগে)', restrictions: '⚠️ ডেটা সংরক্ষণ করে — সংবেদনশীল কাজে ব্যবহার নয়',
    account: true, api: 'OpenAI-compatible',
    verified: '2026-11-25', status: 'needs-key',
    note: 'storesData=true ট্যাগ করা, তাই রাউটিংয়ে সংবেদনশীল কাজে বাদ।',
  },
  {
    id: 'muse', name: 'Muse (platform.muse.ai)', kind: 'none',
    url: 'https://platform.muse.ai', capabilities: [],
    freeLimits: '—', restrictions: 'পাবলিক ইনফারেন্স API নেই; শুধু Connector সাবমিশন, কোম্পানি ভেরিফিকেশন + রিভিউ লাগে',
    account: true, api: 'নেই',
    verified: '2026-11-25', status: 'impossible',
    note: 'ব্যক্তিগত ব্যবহারে ইন্টিগ্রেশন সম্ভব নয় — এই সিদ্ধান্ত ফেজ ১১-এ যাচাই করা।',
  },
];

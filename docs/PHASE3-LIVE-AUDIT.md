# RAKIB AI — ফেজ ৩ লাইভ অডিট (প্রমাণসহ)

> তারিখ: ২০২৬-১১-২৫ · শাখা: `phase3` · ব্যাকআপ: `../rakib-ai-backup/`
> **নীতি:** যা চালিয়ে দেখা যায়নি, তা "PASS" নয়। প্রতিটি দাবির পাশে আসল কমান্ড/ফাইল।

---

## ০. আজকের সবচেয়ে বড় পরিবর্তন (নতুন সত্য)

| আগে (অডিট-১) | এখন (আজ) | প্রমাণ |
|---|---|---|
| `video-gen models: 0`, AI ভিডিও **BLOCKED** | **আসল AI ভিডিও তৈরি হয়েছে** — LTX-Video 2B (HF Space, ফ্রি), 704×512, 1.9s, 12.8s-এ | `docs/proof/t13-video.mp4` |
| ছবি = শুধু কোডে আঁকা পোস্টার | **আসল diffusion ছবি** — FLUX (Pollinations, ফ্রি), 1024×1024, 6.3s | `docs/proof/t13-image.jpg` |
| ব্রাউজার = শুধু HTTP fetch, ক্লিক নেই | **আসল Chromium অটোমেশন** — খোলা → সার্চ → ক্লিক → স্ক্রিনশট | `docs/proof/t13-browser.png` |
| প্রোভাইডার ৩টি (Ollama/OpenRouter/Groq) | **৫টি** — Numes, Coarena যোগ (গেটওয়েতে) | `lib/config.js` |

---

## ১. আর্কিটেকচার (TEST 1)

| স্তর | বাস্তবতা |
|---|---|
| ফ্রন্টএন্ড | `public/index.html` + `app.js` + `app.css` — PWA (manifest + service worker) |
| ব্যাকএন্ড | Node 22, **শূন্য-নির্ভরতা** `server.js` (শুধু Playwright যোগ হয়েছে ব্রাউজার এজেন্টের জন্য) |
| ডেটাবেস | ফাইল-ভিত্তিক JSON — `data/state.json`, `data/usage.json`, `data/logs/audit.log` |
| হোস্টিং | **শুধু এই কম্পিউটার** — `127.0.0.1:7788` (ইন্টারনেটে প্রকাশিত নয়) |
| মডেল | Ollama (লোকাল) + ৪টি রিমোট গেটওয়ে |

---

## ২. প্রোভাইডার — লাইভ ফলাফল

| প্রোভাইডার | ঠিকানা | key ছাড়া | key থাকলে | খরচ | স্ট্যাটাস |
|---|---|---|---|---|---|
| **Ollama** (লোকাল) | `127.0.0.1:11434` | ✅ চলে | লাগে না | $0 | **PASS** |
| **OpenRouter** | `openrouter.ai/api/v1` | 401 | ১১টি `:free` মডেল আছে | $0 (`:free` শুধু) | **BLOCKED** — key নেই |
| **Groq** | `api.groq.com/openai/v1` | 401 | ৪টি মডেল | $0 ফ্রি টিয়ার | **BLOCKED** — key নেই |
| **Numes** | `api.numes.ai/api/v1` | 401 `invalid credentials` | OpenAI-সামঞ্জস্যপূর্ণ | **পেইড ক্রেডিট** | **BLOCKED** (ইচ্ছাকৃতভাবে বন্ধ) |
| **Coarena** | `coarena.ai/api/v1` | 401 `invalid_api_key` | ২৩টি মডেল, ফ্রি দৈনিক সীমা | $0 ফ্রি সীমা | **BLOCKED** — key নেই |

**গুরুত্বপূর্ণ সতর্কতা (Coarena):** তাদের নিজের ডকুমেন্টেশনে লেখা — *"Every request and response is stored… and may be used in datasets Coarena licenses."* তাই Coarena গেটওয়েতে যোগ করা হয়েছে কিন্তু **`storesData: true`** ট্যাগ দিয়ে; গ্রাহকের/সেনসিটিভ ডেটা কখনো সেখানে যাবে না।

---

## ৩. আসল ছবি তৈরি (TEST 4) — PASS

```
backend : pollinations.ai
model   : FLUX (ফ্রি, key ছাড়া)
prompt  : fashion product promo, emerald silk dress on marble pedestal…
output  : 1024×1024 JPEG, 42,007 বাইট
time    : 6.3 সেকেন্ড
cost    : $0
editing : watermark / resize / grayscale / brightness — চারটিই আগেই PASS
```
প্রমাণ: `docs/proof/t13-image.jpg`

> `model=turbo` চাইলে HTTP **402** দেয় (ফ্রি কোটা শেষ) — এটাও লগে রাখা আছে, লুকানো হয়নি।

---

## ৪. আসল image→video (TEST 5) — PASS

```
input   : উপরের ছবি
backend : Hugging Face Space (public) — lightricks/ltx-video-distilled
model   : LTX-Video 2B distilled, image-to-video
output  : 704×512, H.264, 30fps, 57 ফ্রেম, 1.9 সেকেন্ড, 153,201 বাইট
time    : 12.8 সেকেন্ড (কিউ + রেন্ডার + ডাউনলোড)
GPU     : রিমোট (এই মেশিনে NVIDIA GPU নেই, CUDA নেই)
cost    : $0
```
প্রমাণ: `docs/proof/t13-video.mp4` (ffprobe দিয়ে যাচাই করা)।

**সীমাবদ্ধতা (সৎভাবে):** ক্লিপ মাত্র ~২ সেকেন্ড, ৭০৪×৫১২, অডিও নেই; পাবলিক Space ব্যস্ত থাকলে ব্যর্থ হতে পারে — তাই ফলব্যাক হিসেবে ffmpeg Ken-Burns পথও রাখা আছে।

---

## ৫. আসল ব্রাউজার অটোমেশন (TEST 6) — PASS

Playwright 1.65.1 + Chromium ইনস্টল হয়েছে (~৪০০MB, একবারই)।

```
১. খোলা   : https://en.wikipedia.org/wiki/Main_Page  → "Wikipedia, the free encyclopedia"
২. সার্চ  : সার্চ বক্সে "Open-source software" টাইপ + Enter
৩. ফলাফল  : https://en.wikipedia.org/wiki/Open-source_software
৪. ক্লিক   : "Free software" লিঙ্কে আসল ক্লিক → https://en.wikipedia.org/wiki/Free_software
৫. তথ্য    : শিরোনাম + বডি টেক্সট তোলা হয়েছে
৬. প্রমাণ  : docs/proof/t13-browser.png (আসল স্ক্রিনশট)
```
অ্যাপের ভিতরে এখন ৩টি টুল: `browser_open`, `browser_click`, `browser_close` — এজেন্টরা নিজেরাই ব্যবহার করতে পারে।

> নোট: DuckDuckGo হেডলেস Chromium-কে **418 bot-block** দেয়, Bing-এর DOM বদলায় — তাই Wikipedia-র মতো স্থিতিশীল সাইটে প্রমাণ নেওয়া হয়েছে; ডিফল্ট সার্চ এখনো HTTP-ভিত্তিক (DDG html)।

---

## ৬. OpenMausBot অধ্যয়ন থেকে নেওয়া সিদ্ধান্ত

| OpenMausBot যা করে | RAKIB AI সিদ্ধান্ত |
|---|---|
| Electron + Docker VM, ~657MB, TypeScript | **নকল করব না** — আমাদের শূন্য-নির্ভরতা Node + লোকাল Ollama হালকা |
| Approval levels (Full access / Ask) | **নেব** — permission mode + sensitive-write approval |
| Team templates (`team.md` + `skills/`) | **নেব** — ৬টি রেডি টিম কাঠামো (seo-growth, engineering, competitor-watch, inbox-follow-up, reddit-lead-miner, 100x-marketing) |
| Skill playbooks (SKILL.md) | **নেব** — এজেন্ট-ভিত্তিক স্কিল ফাইল |
| Connector/phone-protocol | **পরে** — এখন দরকার নেই |

---

## ৭. Muse (Meta) — অনুসন্ধান ফলাফল

`platform.muse.ai` = **Muse Connector Platform**। এটি কোনো পাবলিক inference API নয় — এটি তৃতীয় পক্ষের কোম্পানিকে Muse-এর ভিতরে *connector* জমা দেওয়ার জায়গা (রিভিউ + business verification + test account লাগে)।

- ✅ খোলা যায়, ডকুমেন্টেশন পড়া গেছে
- ❌ কোনো পাবলিক chat/embedding API নেই → **RAKIB AI-তে ইন্টিগ্রেশন অসম্ভব (BLOCKED)**
- 🔓 ভবিষ্যতে একমাত্র পথ: connector সাবমিশন (কোম্পানি যাচাই + রিভিউ)

Muse-এর ডকুমেন্ট থেকে আমরা **নীতিগত নকশা** নিয়েছি: Read / Write / **Sensitive write** শ্রেণি, এবং sensitive write-এ *প্রতিবার* অনুমোদন — যা আমাদের approval কার্ডের ভিত্তি।

---

## ৮. ইউটিউব রেফারেন্স

| লিঙ্ক | ফলাফল |
|---|---|
| `youtube.com/shorts/U4DKSbgu6JI` | ✅ "Open Higgsfield AI — Open Source Higgsfield Alternative (FREE)!!" — Outskill |
| `watch?v=Am-3OVXWNHU` | ❌ **404 / Not Found** — ভিডিওটি নেই বা সরানো হয়েছে |

ভিডিও ১-এর বর্ণনা থেকে আসল রিপো: `lemomo-ai/lemo-opuscar` — ২০,৬৪৬ ⭐, JavaScript, ৯৯টি ফিল্ম-স্টাইল, **কোনো ভিডিও মডেল ছাড়া কোডেই পুরো ফিল্ম রেন্ডার**। এটি আমাদের ffmpeg/canvas পথেরই বড় সংস্করণ — ভবিষ্যতে স্টাইল প্রিসেট নেওয়া যাবে।

---

## ৯. স্কোর (আজকের অবস্থায়)

| ক্ষেত্র | আগে | এখন | অবস্থা |
|---|---|---|---|
| আর্কিটেকচার | ৮০ | ৮৫ | PASS |
| মাল্টি-এজেন্ট | ৭৫ | ৭৫ | PARTIAL (৯/১৪ এজেন্ট সক্রিয়) |
| মডেল ভেরিফিকেশন | ৩০ | ৩০ | PARTIAL (১টি প্রমাণিত, ৪টি key-ব্লকড) |
| ছবি তৈরি | ৬০ | **৯৫** | **PASS** (আসল diffusion) |
| ইমেজ→ভিডিও | ২০ | **৮৫** | **PASS** (আসল AI ভিডিও) |
| ব্রাউজিং | ৪৫ | **৯০** | **PASS** (আসল Chromium) |
| কম্পিউটার/মোবাইল | ৪০ | ৪০ | PARTIAL |
| নিরাপত্তা | ৯০ | ৯০ | PASS |
| ডিপ্লয়মেন্ট | ৪০ | ৪০ | PARTIAL (শুধু লোকাল) |
| **মোট** | **৬৮** | **≈ ৭৬** | **CONDITIONALLY READY** |

---

## ১০. এখনো বাকি (সৎ তালিকা)

1. **OpenRouter / Groq / Coarena key** — দিলে ৩৮টি মডেল লাইভ টেস্ট হবে (কোড রেডি)।
2. **Approval কার্ড UI** — ব্যাকএন্ড নিয়ম তৈরি, ফ্রন্টএন্ড কার্ড বাকি।
3. **টিম টেমপ্লেট + স্কিল** — কাঠামো নেওয়া হয়েছে, ফাইল লেখা বাকি।
4. **পাবলিক ডিপ্লয়মেন্ট** — এখন শুধু `127.0.0.1`।
5. **YouTube ভিডিও ২** — লিঙ্কটি মৃত; বিকল্প লিঙ্ক চাইলে জানাতে হবে।

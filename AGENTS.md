# RAKIB AI — ChatGPT / Claude / Gemini দিয়ে কাজ চালিয়ে যাওয়ার নির্দেশিকা

এই ফাইলটা যেকোনো AI কোডিং অ্যাসিস্ট্যান্ট (ChatGPT, Claude, Gemini, Cursor, Copilot) শুরুতেই পড়ার জন্য লেখা।
এটা পড়লেই তারা বুঝবে **প্রজেক্ট কী, কীভাবে চলে, কী ভাঙা, আর কী করতে হবে** — কোনো অতিরিক্ত ব্যাখ্যা লাগবে না।

**রিপো:** https://github.com/aiassistantrakib/rakib-ai · **ব্রাঞ্চ:** `main`

---

## ১. প্রজেক্ট কী

RAKIB AI = লোকাল-ফার্স্ট মাল্টি-এজেন্ট AI কনসোল।
শূন্য npm রানটাইম ডিপেন্ডেন্সি (শুধু Node ২০+), Ollama দিয়ে লোকাল মডেল, ঐচ্ছিক ফ্রি রিমোট কী।

```
server.js              → HTTP সার্ভার + সব API রুট (পোর্ট 7788)
lib/config.js          → PROVIDERS (বিল্ট-ইন), PORT, PATH
lib/gateway.js         → মডেল কল (Ollama native + OpenAI-compatible), রাউটিং, হেলথ
lib/models.js          → প্রোভাইডার/মডেল রেজিস্ট্রি (data/models.json) + টেস্ট
lib/agentstore.js      → এজেন্ট রেজিস্ট্রি (data/agents.json)
lib/agents/index.js    → ১৪ বিল্ট-ইন এজেন্টের ডিফল্ট (পিক লজিক)
lib/tasks.js           → টাস্ক রানার (ইভেন্ট, ডেলিগেশন, অনুমোদন gate)
lib/approvals.js       → অনুমোদন নীতি (always/sensitive/never, ALWAYS_APPROVE)
lib/tools.js           → ১৪ টুল + পারমিশন ফিল্টার
lib/browser.js         → Playwright ব্রাউজার (ঐচ্ছিক)
lib/media.js           → ছবি (Pollinations) ও ভিডিও (HF LTX — ভাঙা)
lib/secrets.js         → AES-256-GCM কী স্টোর (data/keys.enc.json, data/master.key)
lib/persist.js         → টাস্ক/অনুমোদন হিস্ট্রি (JSONL)
lib/console.js         → Control Center HTML (১১ সেকশন, একটাই ফাইলে)
public/                → পুরনো UI (index.html, console.html, models.html)
tests/                 → ১০১টি টেস্ট
scripts/security-scan.cjs → ১৬ পয়েন্ট সিকিউরিটি স্ক্যান
```

## ২. চালু করার নিয়ম

```bash
# ১) Ollama চালু (আলাদা টার্মিনাল)
ollama serve

# ২) সার্ভার
cd rakib-ai
npm start                 # → http://127.0.0.1:7788/console.html

# ৩) টেস্ট
npm test                  # ৭৯টি দ্রুত টেস্ট
npm run test:all          # e2e সহ ১০১টি
npm run scan              # সিকিউরিটি স্ক্যান (১৬/১৬ হওয়া উচিত)
```

## ৩. API মানচিত্র

**অথেন্টিকেশন:** `POST/PUT/DELETE` রিকোয়েস্টে `x-rakib-token` হেডার লাগে।
টোকেন: `data/access-token` ফাইলে, অথবা `GET /api/state` → `token`।

| মেথড | রুট | কাজ |
|---|---|---|
| GET | `/api/state` | সব স্টেট (মডেল, এজেন্ট, হেলথ, টোকেন) |
| GET/POST | `/api/tasks` | তাস্ক তালিকা / নতুন টাস্ক `{text, agent?}` |
| GET | `/api/tasks/:id` | এক টাস্ক + ইভেন্ট |
| POST | `/api/tasks/:id/cancel` · `/retry` | বাতিল / আবার |
| GET/POST | `/api/approvals`, `/api/approvals/:id` | অনুমোদন তালিকা / সিদ্ধান্ত `{action: approve\|deny\|edit}` |
| GET | `/api/mgmt/providers` | প্রোভাইডার + মডেল + ডিফল্ট |
| POST | `/api/mgmt/providers` | নতুন প্রোভাইডার `{name, type, baseUrl, apiKey}` |
| PUT/DELETE | `/api/mgmt/providers/:id` | এডিট (কী সহ) / মুছুন |
| POST | `/api/mgmt/providers/:id/test` | কানেকশন টেস্ট |
| GET | `/api/mgmt/providers/:id/discover` | মডেল তালিকা আনে |
| GET/POST | `/api/mgmt/models` | মডেল তালিকা / যোগ `{providerId, modelId, label}` |
| POST | `/api/mgmt/models/:id/test` | **আসল inference টেস্ট** |
| POST | `/api/mgmt/default` | ডিফল্ট মডেল `{modelRowId}` |
| GET/POST | `/api/mgmt/agents` | এজেন্ট তালিকা / তৈরি |
| PUT/DELETE | `/api/mgmt/agents/:id` | এডিট / মুছুন |
| POST | `/api/mgmt/agents/:id/test` | এজেন্ট টেস্ট কথোপকথন `{text}` |
| GET | `/api/keys` | masked কী তালিকা |
| DELETE | `/api/keys?name=KEY_X` | কী মুছুন |
| GET | `/api/audit?n=80` | অডিট লগ (redact করা) |

## ৪. ডেটা (Git-এ যাবে না — `.gitignore`-এ ব্লকড)

```
data/access-token       → API টোকেন
data/keys.enc.json      → এনক্রিপ্টেড কী
data/master.key         → এনক্রিপশন মাস্টার কী (ব্যাকআপ রাখুন!)
data/models.json        → প্রোভাইডার/মডেল কনফিগ
data/agents.json        → এজেন্ট কনফিগ
data/modeltests.json    → শেষ টেস্টের ফলাফল
data/persist/*.jsonl    → টাস্ক/অনুমোদন হিস্ট্রি
workspace/              → ফাইল, ছবি, ভিডিও, স্ক্রিনশট
```

## ৫. নিয়ম (ভাঙা যাবে না)

1. **কী কখনো** ফ্রন্টএন্ড, লগ, কমিট বা চ্যাটে প্লেইনটেক্সটে যাবে না।
2. নতুন টুল যোগ করলে `lib/approvals.js`-এ ঝুঁকি স্তর ঠিক করতে হবে; অপরিবর্তনীয় কাজ (`publish_post`, `send_bulk`, `purchase`, `payment`, `delete_file`, `account_change`, `browser_submit`, `write_file`, `video_from_image`) **সবসময়** অনুমোদন লাগবে।
3. কোনো ফিচার "কাজ করছে" বলা যাবে না যতক্ষণ আসল রানে প্রমাণ না হয়। ব্যর্থ হলে `BLOCKED` + কারণ।
4. পেইড মডেল কখনো অটো-সিলেক্ট নয়। শূন্য খরচই নীতি।
5. পাথ সবসময় `safePath()` দিয়ে স্যান্ডবক্সে।
6. টেস্ট + `npm run scan` পাস না করে কমিট নয়।
7. পুরনো কাজ নষ্ট না করা — বিল্ট-ইন এজেন্ট/প্রোভাইডার মুছবেন না, বন্ধ করুন।

## ৬. এখনো যা বাকি (এখান থেকেই কাজ শুরু করুন)

| আইটেম | অবস্থা | করণীয় |
|---|---|---|
| ভিডিও জেনারেশন | **ভাঙা** | `lib/media.js` → `videoFromImage()` HF LTX Space `event: error` দেয়। বিকল্প ফ্রি backend খুঁজুন (Replicate free? Modal? লোকাল AnimateDiff?) |
| রিমোট ইনফারেন্স | **কী নেই** | ব্যবহারকারী ফ্রি OpenRouter/Groq কী দিলেই কাজ করবে |
| স্থায়ী URL | **টানেল** | Cloudflare Quick Tunnel — রিস্টার্টে ঠিকানা বদলায়। Render/Koyeb ফ্রি ডিপ্লয়মেন্ট করতে হবে (`docs/DEPLOYMENT.md`) |
| মাল্টি-ইউজার অথেন্টিকেশন | **নেই** | এখন এক টোকেন; একাধিক ব্যবহারকারী চাইলে সেশন/লগইন লাগবে |
| স্ক্রল/ফর্ম/আপলোড টুল | **টেস্ট হয়নি** | `lib/browser.js`-এ যোগ করে টেস্ট লিখুন |

## ৭. ডিপ্লয়মেন্ট

`docs/DEPLOYMENT.md` দেখুন। সংক্ষেপে: Vercel-এ পুরোটা চলে না (ফাইল-সিস্টেম, SSE, Playwright, Ollama নেই)।
Render ফ্রি ওয়েব সার্ভিসে Node অ্যাপ চলবে, কিন্তু Ollama থাকবে না — রিমোট ফ্রি কী লাগবে।

## ৮. কাজ বুঝে নেওয়ার নিয়ম (AI অ্যাসিস্ট্যান্টের জন্য)

- কাজ শুরুর আগে `git log --oneline -5` দেখুন।
- পরিবর্তনের আগে `npm test` চালান — বেসলাইন নিন।
- নতুন ফিচারের জন্য `tests/`-এ টেস্ট লিখুন, আসল রানে।
- শেষে `npm run test:all && npm run scan` — সব পাস হতে হবে।
- কমিট মেসেজে **কী বদলালো ও কেন** লিখুন।

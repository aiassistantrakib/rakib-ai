# RAKIB AI — বাস্তবায়ন পরিকল্পনা (মেশিন যাচাইয়ের পর)

## এই মেশিনে যা প্রমাণিত (আজ, ২৪ নভেম্বর ২০২৬)
| বিষয় | ফল |
|---|---|
| Node | v22.23.2 ✅ |
| Ollama + qwen3.5:4b (vision+tools) | ✅ বাংলায় উত্তর দিল (~৩.৫s eval, ৩৮s load) |
| CPU/GPU | Intel i3-8100, Intel UHD 630 (CUDA GPU নেই), ১২৮GB ফ্রি ডিস্ক |
| OpenRouter free models | ১২টি, সবই `tools` সাপোর্ট করে; কয়েকটি image+video ইনপুট (Nemotron 3.5 Super VL, Gemma 4 26B/31B) |
| OpenRouter key ছাড়া চ্যাট | 401 "No cookie auth credentials" ❌ — key বাধ্যতামূলক |
| Groq API | পৌঁছায় (401 মানে key লাগবে) — ফ্রি key-তে দ্রুত |
| DuckDuckGo HTML | 202 (বট ব্লক) — আগেই জানা |
| HF API / GitHub API | ✅ 200 |

## সিদ্ধান্ত
1. **ভিত্তি = বিদ্যমান free-ai-agent** (শূন্য dependency, কাজ করছে) → `RAKIB AI` ব্র্যান্ড + মাল্টি-এজেন্ট স্তর।
2. **মডেল গেটওয়ে নিজেরাই** (LiteLLM লাগবে না — Python proxy, ভারী, আলাদা প্রসেস)। শূন্য-নির্ভরতা gateway: task-routing, fallback, cooldown, খরচ/টোকেন হিসাব।
3. **Ollama = key-ছাড়া পথ** (একমাত্র সত্যিকারের ফ্রি, অফলাইন)। OpenRouter/Groq = ফ্রি key দিলে দ্রুততর। কখনো নিজে থেকে paid মডেলে যাবে না — শুধু `:free` তালিকা।
4. **এজেন্ট**: অর্কেস্ট্রেটর + ৬টি বাস্তবে চালু করা এজেন্ট (CEO/Planner, Research, Coding, Data, Vision, Writer)। বাকিগুলো UI-তে "পরিকল্পিত/ব্লকড" সত্যি লেবেল সহ — ভুয়া সবুজ বাতি নয়।
5. **মিডিয়া**: ছবি রিসাইজ/ক্রপ/কমপ্রেস/ফরম্যাট/ফিল্টার/ওয়াটারমার্ক — আসল (sharp ছাড়া, নিজের JPEG এনকোডার বা Ollama vision)। ComfyUI/FLUX: GPU নেই → ডকুমেন্টেড ব্লকার। ভিডিও: ফ্রি মডেলগুলো এখন **ভিডিও ইনপুট** নেয় (বিশ্লেষণ), জেনারেশন লোকাল GPU ছাড়া সম্ভব নয় → স্পষ্ট লেবেল।
6. **PWA**: manifest + service worker → মোবাইলে ইনস্টলযোগ্য।
7. **নিরাপত্তা**: token auth, key masking, secret redaction, path sandbox, rate limit, audit log।
8. **হোস্টিং**: লোকাল সার্ভার = ব্যাকএন্ড; পাবলিক হলে Cloudflare Tunnel (ফ্রি) — ইউজারের authorization সাপেক্ষ।

## ধাপ (এই সেশনে)
P1 গেটওয়ে + এজেন্ট কোর + SQLite/JSON স্টোর
P2 UI ড্যাশবোর্ড (চ্যাট, এজেন্ট, টাস্ক, হিস্ট্রি, কস্ট, হেলথ, মিডিয়া, সেটিংস) + PWA
P3 টুল: web search (multi-engine), fetch, calculator, files, image ops, code sandbox
P4 টেস্ট: conversation, delegation, research, file, image, fallback, cost, security — প্রতিটির লগ/প্রমাণ
P5 ডকুমেন্ট: INSTALL, ARCHITECTURE, SECURITY-AUDIT, TEST-REPORT, ROADMAP


## অবস্থা (2026-11-24)
- ✅ প্রথম কর্মরত সংস্করণ: UI + গেটওয়ে + ৯ এজেন্ট + ৯ টুল
- ✅ ৮৮টি টেস্ট পাস (tools ২৩, e2e ২২, vision ৪, research ৫, security ১৮, orchestrator ১৬)
- ✅ ভিশন লোকাল মডেলে কাজ করে (৩২০×১৮০ ছবি, ১২ সে)
- ✅ ডকুমেন্টেশন: docs/INSTALL, ARCHITECTURE, SECURITY-AUDIT, TEST-REPORT, ROADMAP
- ⛔ ভিডিও জেনারেশন (GPU নেই), ব্রাউজার ক্লিক (Playwright নেই), সোশ্যাল পোস্টিং (OAuth নেই)

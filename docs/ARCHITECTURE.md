# RAKIB AI — আর্কিটেকচার

```
ব্রাউজার / ফোন (PWA)
        │  HTTPS-less, token header (x-rakib-token)
        ▼
server.js  (zero-dependency Node HTTP)
  ├── auth + CSRF Origin + rate limit (120/min/IP)
  ├── static  public/  (index.html, app.css, app.js, sw.js)
  └── /api/*
        │
        ▼
lib/orchestrator.js   ← এজেন্ট বাছাই, টুল লুপ (MAX_STEPS=6), delegate_to_agent
        │
        ├── lib/agents/index.js   ১৪টি এজেন্টের রেজিস্ট্রি (status/tools/blocker)
        ├── lib/tools.js          ৯টি টুল + স্যান্ডবক্স
        └── lib/gateway.js        মডেল গেটওয়ে (route → call → health/cooldown)
                 │
                 ├── Ollama   http://127.0.0.1:11434  (key ছাড়া, লোকাল)
                 ├── OpenRouter (শুধু :free মডেল, key থাকলে)
                 └── Groq       (ফ্রি টিয়ার, key থাকলে)
        │
        ▼
lib/store.js   data/keys.json (এনক্রিপ্টেড) · usage.json · audit.log · access-token
```

## নীতিগুলো

1. **শূন্য ডিপেন্ডেন্সি** — `npm install` লাগে না। শুধু Node।
2. **শূন্য খরচ** — গেটওয়ে শুধু `:free` ও লোকাল মডেল রাউট করে; paid মডেল কোডেই বাদ।
3. **লোকাল-ফার্স্ট** — Ollama থাকলে ইন্টারনেট বা key ছাড়াই চলে।
4. **সৎ অবস্থা** — প্রতিটি এজেন্টের `status` + `blocker` + `evidence`; ব্লকড এজেন্ট সবুজ দেখানো হয় না।
5. **প্রতি ধাপে অডিট** — `data/logs/audit.log`, secret রিডাক্ট করা।
6. **নিরাপত্তা ডিফল্টে** — শুধু 127.0.0.1, টোকেন ছাড়া কিছুই বদলানো যায় না, ফাইল শুধু `workspace/`-এ।

## রাউটিং স্কোরিং (`gateway.route`)

- টিয়ার মিল: `100 − index*10` (deep > research > code > vision > general > fast)
- লোকাল মডেল: **+১৫** (key/ইন্টারনেট লাগে না)
- Groq: **+৮** (দ্রুত)
- `:free` মডেল: **+৪**
- ছবি থাকলে শুধু `image` ইনপুট-সাপোর্টিং মডেল
- টুল লাগলে শুধু `tools: true` মডেল
- কুলডাউন (৬০s) — ফেইল করা মডেল সাময়িক বাদ

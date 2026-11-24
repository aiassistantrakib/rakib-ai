# RAKIB AI — ইনস্টল ও চালু (নন-প্রোগ্রামারের জন্য)

## ১. যা লাগবে
- Windows / macOS / Linux
- **Node.js 20+** (আছে: v22.23.2)
- **Ollama** (ফ্রি, লোকাল AI) — https://ollama.com/download
  - ইনস্টল শেষে একবার: `ollama pull qwen3.5:4b` (প্রায় ৩GB, একবারই)

## ২. চালু করা
```bat
cd "C:\Users\Dunu Server\.abacusai-bot\session-home\rakib-ai"
node server.js
```
তারপর ব্রাউজারে **http://localhost:7788** খুলুন।

> প্রথমবার উত্তর দিতে ২০-৪০ সেকেন্ড লাগতে পারে (মডেল মেমরিতে লোড হয়)। পরে ৫-১৫ সেকেন্ড।

## ৩. ফোনে ব্যবহার
- একই Wi-Fi-তে থেকে ফোনের ব্রাউজারে কম্পিউটারের IP:7788 খুলুন, অথবা
- Chrome-এ "Add to Home screen" চাপলে অ্যাপের মতো ইনস্টল হবে (PWA)।

## ৪. (ঐচ্ছিক) দ্রুত ফ্রি মডেল
Ollama ধীর লাগলে — **ফ্রি, কার্ড লাগে না**:
- Groq: https://console.groq.com/keys → key কপি → অ্যাপের **Settings → API keys**-এ পেস্ট → Save
- OpenRouter: https://openrouter.ai/keys → একইভাবে

শুধু ফ্রি মডেল ব্যবহার হবে; কোনো paid মডেলে টাকা খরচ হবে না।

## ৫. টোকেন (নিরাপত্তা)
`data/access-token` ফাইলে অ্যাক্সেস টোকেন নিজে তৈরি হয়। অ্যাপ নিজেই এটি ব্যবহার করে —
আপনাকে কিছু করতে হবে না। টোকেন ছাড়া কেউ কিছু বদলাতে পারবে না।

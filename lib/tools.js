/* =========================================================================
   RAKIB AI — Tools
   প্রতিটি টুল: { spec (OpenAI function schema), run(args, ctx) -> { text, ui } }
   ctx = { taskId, agentId, signal }
   সব ফাইল-অপারেশন workspace/ এর ভিতরে সীমাবদ্ধ (path sandbox)।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WORKSPACE } = require('./config');
const { audit } = require('./store');

const WS = path.resolve(WORKSPACE);
const MAX_READ = 40000;

/* ---------------------------- helpers ---------------------------- */
function safePath(rel, { mustExist = false, dir = WS } = {}) {
  let clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  clean = clean.replace(/^workspace\//i, ''); // 'workspace/...' আগে থেকেই WS-এর ভিতরে
  if (/^[a-zA-Z]:/.test(clean) || clean.includes('..')) throw new Error('পথ অনুমোদিত নয়');
  const full = path.resolve(dir, clean);
  if (full !== WS && !full.startsWith(WS + path.sep)) throw new Error('workspace-এর বাইরে লেখা যাবে না');
  if (mustExist && !fs.existsSync(full)) throw new Error('ফাইল পাওয়া যায়নি: ' + clean);
  return full;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const decodeEntities = (s) => String(s).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' }[e.toLowerCase()] ?? m);
});
const stripTags = (s) => decodeEntities(String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

async function getText(url, ms = 12000, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'bn,en;q=0.8', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return { text, url: r.url || url };
}

/* ---------------------------- web search (multi-engine, key-free) ---------------------------- */
function unwrapDdg(href) {
  const m = String(href).match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch {} }
  return href.startsWith('//') ? 'https:' + href : href;
}
function scoreHit(r, q) {
  const words = String(q).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const hay = (r.title + ' ' + (r.snippet || '')).toLowerCase();
  return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
}

async function ddgHtml(q, n) {
  const { text } = await getText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), 10000, { 'Content-Type': 'application/x-www-form-urlencoded' });
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi;
  let m;
  while ((m = re.exec(text)) && out.length < n) {
    const url = unwrapDdg(decodeEntities(m[1]));
    if (!/^https?:/.test(url)) continue;
    out.push({ title: stripTags(m[2]), url, snippet: stripTags(m[3] || ''), engine: 'duckduckgo' });
  }
  return out;
}

async function bingHtml(q, n) {
  const { text } = await getText('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en', 10000);
  const out = [];
  const blocks = text.split(/<li class="b_algo"/i).slice(1);
  for (const b of blocks) {
    if (out.length >= n) break;
    const cite = b.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
    const a = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let url = decodeEntities(cite ? cite[1] : a[1]);
    if (!/^https?:/.test(url)) continue;
    const snip = b.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title: stripTags(a[2]), url, snippet: stripTags(snip ? snip[1] : ''), engine: 'bing' });
  }
  return out;
}

async function ddgInstant(q) {
  const { text } = await getText('https://api.duckduckgo.com/?format=json&no_html=1&q=' + encodeURIComponent(q), 8000);
  const j = JSON.parse(text);
  const out = [];
  if (j.AbstractText) out.push({ title: j.Heading || q, url: j.AbstractURL || '', snippet: j.AbstractText, engine: 'ddg-instant' });
  for (const t of (j.RelatedTopics || []).slice(0, 4)) {
    if (t.Text && t.FirstURL) out.push({ title: t.Text.slice(0, 90), url: t.FirstURL, snippet: t.Text, engine: 'ddg-instant' });
  }
  return out;
}

async function wikiSearch(q, n) {
  const { text } = await getText('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' + n + '&srsearch=' + encodeURIComponent(q), 8000);
  const j = JSON.parse(text);
  return (j.query?.search || []).map((s) => ({
    title: s.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')), snippet: stripTags(s.snippet), engine: 'wikipedia',
  }));
}

async function webSearch(query, maxResults = 5) {
  const engines = [ddgHtml, bingHtml, ddgInstant, wikiSearch];
  const tried = [];
  const hits = [];
  for (const fn of engines) {
    try {
      const r = await fn(query, maxResults);
      tried.push({ engine: fn.name, n: r.length });
      if (r.length) hits.push(...r);
      if (hits.length >= maxResults) break;
    } catch (e) { tried.push({ engine: fn.name, error: String(e.message).slice(0, 80) }); }
  }
  // dedupe by host+path, then rank by query overlap
  const seen = new Set();
  const uniq = hits.filter((h) => { const k = h.url.replace(/[?#].*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((h) => ({ ...h, score: scoreHit(h, query) }))
    .sort((a, b) => b.score - a.score);
  return { results: uniq.slice(0, maxResults), engines: tried };
}

async function fetchReadable(rawUrl) {
  const u = new URL(String(rawUrl));
  if (!/^https?:$/.test(u.protocol)) throw new Error('শুধু http/https');
  const host = u.hostname.toLowerCase();
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/.test(host) || host.endsWith('.local')) throw new Error('লোকাল নেটওয়ার্ক ঠিকানা অনুমোদিত নয়');
  const { text, url } = await getText(u.href, 15000);
  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const body = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
  const clean = decodeEntities(body.replace(/<[^>]*>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { url, title: stripTags(title), text: clean.slice(0, 12000), truncated: clean.length > 12000 };
}

/* ---------------------------- safe arithmetic (no eval) ---------------------------- */
const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan };
const CONST = { pi: Math.PI, e: Math.E };
const RE_OK = /[0-9+\-*/%^().,a-z]/i;
const RE_BAD = /[^0-9+\-*/%^().,a-z]/i;
const OKCH = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+*^%().,-/";
function okChars(x) { for (const c of x) if (!OKCH.includes(c)) return false; return true; }
function safeEval(expr) {
  const src = String(expr).replace(/\s+/g, '');
  if (!src || !okChars(src)) throw new Error('অননুমোদিত অক্ষর');
  const toks = src.match(/[a-z]+|\d*\.?\d+|[+\-*/%^(),]/gi) || [];
  let i = 0;
  const peek = () => toks[i];
  const eat = (t) => { if (toks[i] === t) { i++; return true; } return false; };
  function e_() {
    let v = t_();
    for (;;) {
      if (eat('+')) v += t_();
      else if (eat('-')) v -= t_();
      else return v;
    }
  }
  function t_() {
    let v = p_();
    for (;;) {
      if (eat('*')) v *= p_();
      else if (eat('/')) v /= p_();
      else if (eat('%')) v %= p_();
      else return v;
    }
  }
  function p_() {
    const base = u_();
    if (eat('^')) return Math.pow(base, p_());
    return base;
  }
  function u_() {
    if (eat('-')) return -u_();
    if (eat('+')) return u_();
    return a_();
  }
  function a_() {
    const t = peek();
    if (t === '(') { i++; const v = e_(); if (!eat(')')) throw new Error('বন্ধনী মেলেনি'); return v; }
    if (/^\d/.test(t) || /^\.\d/.test(t)) { i++; return parseFloat(t); }
    if (/^[a-z]+$/i.test(t)) {
      i++;
      const name = t.toLowerCase();
      if (eat('(')) {
        const args = [];
        if (peek() !== ')') { args.push(e_()); while (eat(',')) args.push(e_()); }
        if (!eat(')')) throw new Error('বন্ধনী মেলেনি');
        const fn = FN[name];
        if (!fn) throw new Error('অজানা ফাংশন: ' + name);
        return fn(...args);
      }
      if (name in CONST) return CONST[name];
      throw new Error('অজানা নাম: ' + name);
    }
    throw new Error('অপ্রত্যাশিত টোকেন: ' + t);
  }
  const v = e_();
  if (i !== toks.length) throw new Error('অতিরিক্ত টোকেন');
  if (!Number.isFinite(v)) throw new Error('ফলাফল সংখ্যা নয়');
  return v;
}

/* ---------------------------- image ops (pure JS, zero dependency) ---------------------------- */
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const zlib = require('zlib');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function decodePng(buf) {
  const zlib = require('zlib');
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG নয়');
  let p = 8, w = 0, h = 0, bitDepth = 8, colorType = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.slice(p + 4, p + 8).toString('ascii');
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('৮-বিট PNG দরকার');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error('এই color type সাপোর্টে নেই');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride); let cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = cur[x];
      if (ft === 1) v = (v + a) & 255; else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (ch === 1) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else if (ch === 2) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else if (ch === 3) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
    }
    prev.set(cur);
  }
  return { width: w, height: h, rgba: out };
}

function resize(rgba, w, h, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / nw));
      rgba.copy(out, (y * nw + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
    }
  }
  return out;
}
function grayscale(rgba) { const o = Buffer.from(rgba); for (let i = 0; i < o.length; i += 4) { const g = Math.round(0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2]); o[i] = o[i + 1] = o[i + 2] = g; } return o; }
function brightness(rgba, amount) { const o = Buffer.from(rgba); for (let i = 0; i < o.length; i += 4) { o[i] = Math.max(0, Math.min(255, o[i] + amount)); o[i + 1] = Math.max(0, Math.min(255, o[i + 1] + amount)); o[i + 2] = Math.max(0, Math.min(255, o[i + 2] + amount)); } return o; }
function invert(rgba) { const o = Buffer.from(rgba); for (let i = 0; i < o.length; i += 4) { o[i] = 255 - o[i]; o[i + 1] = 255 - o[i + 1]; o[i + 2] = 255 - o[i + 2]; } return o; }
function crop(rgba, w, h, x, y, cw, chh) {
  const out = Buffer.alloc(cw * chh * 4);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
    const sx = Math.min(w - 1, x + i), sy = Math.min(h - 1, y + j);
    rgba.copy(out, (j * cw + i) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
  }
  return out;
}
function flip(rgba, w, h, horizontal = true) {
  const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = horizontal ? w - 1 - x : x, sy = horizontal ? y : h - 1 - y;
    rgba.copy(out, (y * w + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
  }
  return out;
}
function rotate90(rgba, w, h) {
  const nw = h, nh = w; const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = h - 1 - y, dy = x;
    rgba.copy(out, (dy * nw + dx) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4);
  }
  return { rgba: out, width: nw, height: nh };
}
function boxBlur(rgba, w, h, radius = 1) {
  if (radius < 1) return Buffer.from(rgba);
  const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const sx = Math.min(w - 1, Math.max(0, x + dx)), sy = Math.min(h - 1, Math.max(0, y + dy));
      const o = (sy * w + sx) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; n++;
    }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
  }
  return out;
}
/** threshold-based background removal: পিক্সেল যদি কোণার রঙের কাছাকাছি হয় → স্বচ্ছ */
function removeBackground(rgba, w, h, tolerance = 32) {
  const o = Buffer.from(rgba);
  const corners = [0, (w - 1) * 4, ((h - 1) * w) * 4, ((h - 1) * w + w - 1) * 4];
  const ref = [0, 1, 2].map((c) => Math.round(corners.reduce((s, i) => s + rgba[i + c], 0) / 4));
  for (let i = 0; i < o.length; i += 4) {
    const d = Math.abs(o[i] - ref[0]) + Math.abs(o[i + 1] - ref[1]) + Math.abs(o[i + 2] - ref[2]);
    if (d <= tolerance * 3) o[i + 3] = 0;
  }
  return o;
}
function watermark(rgba, w, h, text) {
  // ৫x৭ বিটম্যাপ ফন্ট — কোনো লাইব্রেরি ছাড়াই লেখা বসানো
  const FONT = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'], F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '11100', '10100', '10010', '10001', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'], X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
    Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], 3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  };
  const o = Buffer.from(rgba);
  const scale = Math.max(2, Math.round(w / 220));
  const pad = scale * 4;
  let cx = pad, cy = h - pad - 7 * scale;
  for (const ch of String(text).toUpperCase()) {
    const g = FONT[ch]; if (!g) continue;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== '1') continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const px = cx + c * scale + dx, py = cy + r * scale + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const idx = (py * w + px) * 4;
        o[idx] = 255; o[idx + 1] = 255; o[idx + 2] = 255; o[idx + 3] = 255;
      }
    }
    cx += 6 * scale;
  }
  return o;
}

/* ---------------------------- tool registry ---------------------------- */
const tools = {
  calculator: {
    group: 'utility',
    spec: { type: 'function', function: { name: 'calculator', description: 'Evaluate an arithmetic expression exactly. Supports + - * / % ^ parentheses and sqrt, abs, round, floor, ceil, min, max, pow, log, log10, exp, sin, cos, tan, pi, e.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } },
    run({ expression }) {
      const v = safeEval(String(expression || ''));
      return { text: `${expression} = ${v}`, ui: { tool: 'calculator', expression: String(expression), result: String(v) } };
    },
  },

  web_search: {
    group: 'research',
    spec: { type: 'function', function: { name: 'web_search', description: 'Search the public web (DuckDuckGo, Bing, Wikipedia fallbacks). Use for current facts, news, prices, docs. Returns titles, URLs, snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', description: '1-8, default 5' } }, required: ['query'] } } },
    async run({ query, max_results }) {
      const n = Math.min(8, Math.max(1, Number(max_results) || 5));
      const { results, engines } = await webSearch(String(query || ''), n);
      if (!results.length) return { text: 'No results found. Engines tried: ' + JSON.stringify(engines), ui: { tool: 'web_search', query, count: 0, engines } };
      const text = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${(r.snippet || '').slice(0, 400)}`).join('\n');
      return { text, ui: { tool: 'web_search', query, count: results.length, results, engines } };
    },
  },

  fetch_url: {
    group: 'research',
    spec: { type: 'function', function: { name: 'fetch_url', description: 'Fetch one web page and return its readable text (truncated to 12k chars). Use after web_search to read a source in full.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
    async run({ url }) {
      const p = await fetchReadable(String(url || ''));
      return { text: `URL: ${p.url}\nTitle: ${p.title}\n\n${p.text}`, ui: { tool: 'fetch_url', url: p.url, title: p.title, chars: p.text.length } };
    },
  },

  list_files: {
    group: 'files',
    spec: { type: 'function', function: { name: 'list_files', description: 'List files in the RAKIB AI workspace (sandboxed folder). Use to see what the user uploaded or what exists.', parameters: { type: 'object', properties: { dir: { type: 'string', description: 'sub-folder, default ""' } } } } },
    run({ dir }) {
      const base = safePath(dir || '', { dir: WS });
      const list = fs.readdirSync(base, { withFileTypes: true }).slice(0, 200).map((d) => ({
        name: d.name, type: d.isDirectory() ? 'dir' : 'file', size: d.isDirectory() ? 0 : fs.statSync(path.join(base, d.name)).size,
      }));
      return { text: list.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.type === 'file' ? ` (${f.size}B)` : ''}`).join('\n') || '(খালি)', ui: { tool: 'list_files', dir: dir || '/', count: list.length } };
    },
  },

  read_file: {
    group: 'files',
    spec: { type: 'function', function: { name: 'read_file', description: 'Read a text file from the workspace (max 40k chars).', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    run({ path: p }) {
      const full = safePath(p, { mustExist: true });
      const text = fs.readFileSync(full, 'utf8');
      return { text: text.slice(0, MAX_READ) + (text.length > MAX_READ ? '\n… (কাটা হয়েছে)' : ''), ui: { tool: 'read_file', path: p, chars: text.length } };
    },
  },

  write_file: {
    group: 'files',
    spec: { type: 'function', function: { name: 'write_file', description: 'Write text to a file in the workspace (creates folders). Only inside the workspace.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
    run({ path: p, content }) {
      const full = safePath(p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, String(content ?? ''), 'utf8');
      audit('file_write', { path: p, bytes: Buffer.byteLength(String(content ?? '')) });
      return { text: `লেখা হয়েছে: ${p} (${Buffer.byteLength(String(content ?? ''))} bytes)`, ui: { tool: 'write_file', path: p, bytes: Buffer.byteLength(String(content ?? '')) } };
    },
  },

  image_ops: {
    group: 'media',
    spec: {
      type: 'function',
      function: {
        name: 'image_ops',
        description: 'Process a PNG image in the workspace: resize, crop, grayscale, brightness, invert, flip, rotate90, blur, remove_background, watermark. Returns the output file path.',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'input .png path in workspace' },
            op: { type: 'string', enum: ['resize', 'crop', 'grayscale', 'brightness', 'invert', 'flip', 'rotate90', 'blur', 'remove_background', 'watermark'] },
            output: { type: 'string', description: 'output .png path' },
            width: { type: 'integer' }, height: { type: 'integer' },
            x: { type: 'integer' }, y: { type: 'integer' },
            amount: { type: 'integer', description: 'brightness delta -255..255, blur radius, or bg tolerance' },
            text: { type: 'string', description: 'watermark text' },
          },
          required: ['input', 'op', 'output'],
        },
      },
    },
    run({ input, op, output, width, height, x, y, amount, text }) {
      const src = safePath(input, { mustExist: true });
      let img = decodePng(fs.readFileSync(src));
      let w = img.width, h = img.height, rgba = img.rgba;
      switch (op) {
        case 'resize': {
          const nw = Math.max(1, Math.min(4096, Number(width) || w)), nh = Math.max(1, Math.min(4096, Number(height) || Math.round((nw * h) / w)));
          rgba = resize(rgba, w, h, nw, nh); w = nw; h = nh; break;
        }
        case 'crop': {
          const cw = Math.max(1, Math.min(w, Number(width) || w)), chh = Math.max(1, Math.min(h, Number(height) || h));
          rgba = crop(rgba, w, h, Math.max(0, Number(x) || 0), Math.max(0, Number(y) || 0), cw, chh); w = cw; h = chh; break;
        }
        case 'grayscale': rgba = grayscale(rgba); break;
        case 'brightness': rgba = brightness(rgba, Number(amount) || 20); break;
        case 'invert': rgba = invert(rgba); break;
        case 'flip': rgba = flip(rgba, w, h, true); break;
        case 'rotate90': { const r = rotate90(rgba, w, h); rgba = r.rgba; w = r.width; h = r.height; break; }
        case 'blur': rgba = boxBlur(rgba, w, h, Math.max(1, Math.min(8, Number(amount) || 2))); break;
        case 'remove_background': rgba = removeBackground(rgba, w, h, Math.max(4, Math.min(120, Number(amount) || 32))); break;
        case 'watermark': rgba = watermark(rgba, w, h, String(text || 'RAKIB AI')); break;
        default: throw new Error('অজানা অপারেশন: ' + op);
      }
      const out = safePath(output);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, encodePng(w, h, rgba));
      audit('image_op', { op, input, output, w, h });
      return { text: `✅ ${op} সম্পন্ন → ${output} (${w}×${h})`, ui: { tool: 'image_ops', op, input, output, width: w, height: h, preview: `/files/${output.replace(/^\/+/, '')}` } };
    },
  },

  /* ---------------- আসল ব্রাউজার অটোমেশন (Playwright/Chromium) ---------------- */
  browser_open: {
    group: 'browser',
    approval: false,
    spec: { type: 'function', function: { name: 'browser_open', description: 'Open a real Chromium browser at a URL, optionally type a query into a search box and press Enter, then return the page title, address and visible text. Use for sites that block plain HTTP fetching or need real interaction.', parameters: { type: 'object', properties: { url: { type: 'string' }, search_selector: { type: 'string', description: 'CSS selector of the search input, e.g. input[name="q"]' }, query: { type: 'string', description: 'text to type into that input' }, max_chars: { type: 'integer' } }, required: ['url'] } } },
    async run({ url, search_selector, query, max_chars }) {
      const { browserOpen } = require('./browser');
      const r = await browserOpen(String(url), { searchSelector: search_selector, query, maxChars: Math.min(8000, Number(max_chars) || 3000) });
      return { text: `URL: ${r.url}\nTitle: ${r.title}\n\n${r.text}`, ui: { tool: 'browser_open', url: r.url, title: r.title, chars: r.text.length, screenshot: r.screenshot, ms: r.ms } };
    },
  },

  browser_click: {
    group: 'browser',
    approval: false,
    spec: { type: 'function', function: { name: 'browser_click', description: 'Click an element on the page the browser is already on (by CSS selector or visible link text), wait for the next page, and return its text.', parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string', description: 'visible link/button text to click instead of a selector' }, max_chars: { type: 'integer' } } } } },
    async run({ selector, text, max_chars }) {
      const { browserClick } = require('./browser');
      const r = await browserClick({ selector, text, maxChars: Math.min(8000, Number(max_chars) || 3000) });
      return { text: `URL: ${r.url}\nTitle: ${r.title}\n\n${r.text}`, ui: { tool: 'browser_click', url: r.url, title: r.title, chars: r.text.length, screenshot: r.screenshot } };
    },
  },

  browser_close: {
    group: 'browser',
    approval: false,
    spec: { type: 'function', function: { name: 'browser_close', description: 'Close the browser session opened by browser_open.', parameters: { type: 'object', properties: {} } } },
    async run() { const { browserClose } = require('./browser'); await browserClose(); return { text: 'browser closed', ui: { tool: 'browser_close' } }; },
  },

  /* ---------------- আসল ছবি তৈরি (ফ্রি diffusion backend) ---------------- */
  image_generate: {
    group: 'media',
    approval: false,
    spec: { type: 'function', function: { name: 'image_generate', description: 'Generate a real photo-style image from a text prompt with a free diffusion backend (Pollinations/FLUX) and save it in workspace/images. Returns the file path and size.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, name: { type: 'string', description: 'file name without extension' } }, required: ['prompt'] } } },
    async run({ prompt, width, height, name }) {
      const { generateImage } = require('./media');
      const r = await generateImage(String(prompt), { width: Number(width) || 1024, height: Number(height) || 1024, name });
      return { text: `ছবি তৈরি হয়েছে: ${r.rel} (${r.bytes} বাইট, ${r.secs}s, backend ${r.backend}, model ${r.model})`, ui: { tool: 'image_generate', ...r } };
    },
  },

  /* ---------------- আসল image→video (ফ্রি LTX-Video Space) ---------------- */
  video_from_image: {
    group: 'media',
    approval: false,
    spec: { type: 'function', function: { name: 'video_from_image', description: 'Turn an image in the workspace into a real short AI video with a free LTX-Video backend, and save the .mp4 in workspace/videos. Slow (20-120s).', parameters: { type: 'object', properties: { image_path: { type: 'string', description: 'path inside workspace, e.g. images/x.jpg' }, prompt: { type: 'string', description: 'how it should move' }, name: { type: 'string' } }, required: ['image_path'] } } },
    async run({ image_path, prompt, name }) {
      const { videoFromImage } = require('./media');
      const r = await videoFromImage(String(image_path), { prompt, name });
      return { text: `ভিডিও তৈরি হয়েছে: ${r.rel} (${r.bytes} বাইট, ${r.secs}s, ${r.model}, ${r.width}x${r.height}, ${r.duration}s)`, ui: { tool: 'video_from_image', ...r } };
    },
  },

  run_js: {
    group: 'code',
    spec: { type: 'function', function: { name: 'run_js', description: 'Run a short JavaScript snippet in a locked-down sandbox (no require, no fs, no network, 2s limit). Return value is shown. Use for calculations over data.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } } },
    run({ code }) {
      const sandbox = { console: { log: (...a) => log.push(a.map(String).join(' ')) }, Math, JSON, Date, Number, String, Array, Object };
      const log = [];
      const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
      const src = String(code || '');
      if (src.length > 8000) throw new Error('কোড অনেক বড় (৮০০০ অক্ষরের বেশি)');
      const out = vm.runInContext(`(() => { ${src} })()`, ctx, { timeout: 2000 });
      audit('run_js', { bytes: src.length });
      return { text: `result: ${typeof out === 'object' ? JSON.stringify(out) : String(out)}${log.length ? '\nconsole: ' + log.join(' | ') : ''}`, ui: { tool: 'run_js', result: typeof out === 'object' ? JSON.stringify(out) : String(out), logs: log } };
    },
  },

  csv_stats: {
    group: 'data',
    spec: { type: 'function', function: { name: 'csv_stats', description: 'Parse a CSV file in the workspace and report row count, column names, and numeric summaries (min/max/mean/sum) per column. Use for data analysis tasks.', parameters: { type: 'object', properties: { path: { type: 'string' }, delimiter: { type: 'string', description: 'default ,' } }, required: ['path'] } } },
    run({ path: p, delimiter }) {
      const full = safePath(p, { mustExist: true });
      const d = delimiter || ',';
      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(d).map((s) => s.trim());
      const rows = lines.slice(1).map((l) => l.split(d));
      const cols = header.map((name, i) => {
        const vals = rows.map((r) => r[i]).filter((v) => v !== undefined && v.trim() !== '');
        const nums = vals.map((v) => Number(v.replace(/[,$%]/g, ''))).filter((n) => Number.isFinite(n));
        const o = { name, filled: vals.length, numeric: nums.length };
        if (nums.length === vals.length && nums.length) {
          o.min = Math.min(...nums); o.max = Math.max(...nums);
          o.sum = +nums.reduce((a, b) => a + b, 0).toFixed(4);
          o.mean = +(o.sum / nums.length).toFixed(4);
        } else o.sample = vals.slice(0, 3);
        return o;
      });
      return { text: `rows: ${rows.length}\n` + cols.map((c) => JSON.stringify(c)).join('\n'), ui: { tool: 'csv_stats', path: p, rows: rows.length, cols: cols.length } };
    },
  },
};

/* এজেন্টের পারমিশন অনুযায়ী টুল বাদ দেওয়া */
function allowedByPermissions(names, perms) {
  if (!perms) return names;
  return names.filter((n) => {
    const t = tools[n];
    if (!t) return false;
    const g = t.group || 'utility';
    if (g === 'utility' || g === 'research' || g === 'data') return perms.read !== false;
    if (g === 'files') return !!perms.write;          // ফাইল লেখা/পড়া — write অনুমতি লাগে
    if (g === 'code') return !!perms.write;
    return !!perms.sensitive;                          // media/browser/publish — sensitive লাগে
  });
}

function specsFor(names) {
  return names.filter((n) => tools[n]).map((n) => tools[n].spec);
}
async function runTool(name, args, ctx = {}) {
  const t = tools[name];
  if (!t) return { text: `Error: unknown tool "${name}"`, ui: { tool: name, error: 'unknown tool' } };
  try {
    const out = await t.run(args || {}, ctx);
    return { text: String(out.text).slice(0, 12000), ui: { ...out.ui, ms: Date.now() - (ctx.startedAt || Date.now()) } };
  } catch (err) {
    audit('tool_error', { tool: name, message: String(err.message).slice(0, 200) });
    return { text: `Error from ${name}: ${err.message}`, ui: { tool: name, error: String(err.message).slice(0, 300) } };
  }
}

module.exports = { allowedByPermissions, tools, specsFor, runTool, webSearch, fetchReadable, safeEval, encodePng, decodePng, safePath, resize, crop, grayscale, brightness, invert, flip, rotate90, boxBlur, removeBackground, watermark };

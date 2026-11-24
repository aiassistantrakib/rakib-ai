/* =========================================================================
   RAKIB AI — real browser automation (Playwright + Chromium)
   একটি সেশন ধরে রাখে: খোলা → টাইপ/সার্চ → ক্লিক → টেক্সট/স্ক্রিনশট।
   playwright না থাকলে স্পষ্ট error দেয় (নকল ফলাফল নয়)।
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('./config');
const { audit } = require('./store');

const SHOTS = path.join(WORKSPACE, 'screenshots');
let state = null; // { browser, context, page }

function available() {
  try { require.resolve('playwright'); return true; } catch { return false; }
}

async function ensure() {
  if (state && state.page && !state.page.isClosed()) return state;
  if (!available()) throw new Error('Playwright ইনস্টল নেই — ব্রাউজার এজেন্ট এখন নিষ্ক্রিয়');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  state = { browser, context, page, openedAt: Date.now() };
  return state;
}

function safeName(s) {
  return String(s || 'shot').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
}

async function snapshot(page, maxChars) {
  const title = (await page.title()).slice(0, 200);
  const text = await page.evaluate((n) => {
    const drop = document.querySelectorAll('script, style, nav, footer, noscript');
    drop.forEach((e) => e.remove());
    return (document.body?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
  }, maxChars || 3000);
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, safeName(new Date().toISOString().replace(/[:.]/g, '-')) + '.png');
  let screenshot = null;
  try { await page.screenshot({ path: file, fullPage: false }); screenshot = path.relative(WORKSPACE, file).replace(/\\/g, '/'); } catch {}
  return { url: page.url(), title, text, screenshot };
}

async function browserOpen(url, { searchSelector, query, maxChars } = {}) {
  const t0 = Date.now();
  if (!/^https?:\/\//i.test(url)) throw new Error('শুধু http/https ঠিকানা অনুমোদিত');
  const { page } = await ensure();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (searchSelector && query) {
    await page.waitForSelector(searchSelector, { timeout: 20000 });
    await page.fill(searchSelector, String(query));
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {}),
      page.press(searchSelector, 'Enter'),
    ]);
    await page.waitForTimeout(1200);
  }
  const snap = await snapshot(page, maxChars);
  audit('browser_open', { url: snap.url, title: snap.title });
  return { ...snap, ms: Date.now() - t0 };
}

async function browserClick({ selector, text, maxChars } = {}) {
  const t0 = Date.now();
  if (!state?.page) throw new Error('আগে browser_open দিয়ে একটি পাতা খুলুন');
  const { page } = state;
  let locator;
  if (selector) locator = page.locator(selector).first();
  else if (text) locator = page.getByRole('link', { name: String(text) }).first();
  else throw new Error('selector বা text লাগবে');
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {}),
    locator.click(),
  ]);
  await page.waitForTimeout(1200);
  const snap = await snapshot(page, maxChars);
  audit('browser_click', { url: snap.url, title: snap.title });
  return { ...snap, ms: Date.now() - t0 };
}

async function browserClose() {
  if (!state) return;
  try { await state.browser.close(); } catch {}
  state = null;
}

function status() {
  return {
    installed: available(),
    engine: 'Chromium (Playwright)',
    open: !!(state?.page && !state.page.isClosed()),
    url: state?.page && !state.page.isClosed() ? state.page.url() : null,
  };
}

module.exports = { browserOpen, browserClick, browserClose, status, available };

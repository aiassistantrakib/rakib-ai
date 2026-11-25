/* =========================================================================
   RAKIB AI — নিরাপদ কী-স্টোর (এনক্রিপ্টেড, সার্ভার-সাইড)
   • প্রতিটি key AES-256-GCM দিয়ে এনক্রিপ্ট হয়ে data/keys.enc.json-এ থাকে
   • কী-এনক্রিপশন কী আলাদা ফাইলে (data/master.key, 0600) — gitignore-এ
   • পুরনো data/keys.json থাকলে একবার মাইগ্রেট করে মুছে ফেলে
   • ব্রাউজারে কখনো প্লেইনটেক্সট key ফেরত যায় না (শুধু masked)
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA } = require('./config');

const ENC = path.join(DATA, 'keys.enc.json');
const LEGACY = path.join(DATA, 'keys.json');
const MASTER = path.join(DATA, 'master.key');

function masterKey() {
  try {
    const hex = fs.readFileSync(MASTER, 'utf8').trim();
    if (hex.length === 64) return Buffer.from(hex, 'hex');
  } catch {}
  const k = crypto.randomBytes(32);
  fs.writeFileSync(MASTER, k.toString('hex'), { mode: 0o600 });
  return k;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') };
}

function decrypt(box) {
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}

function readRaw() {
  try { return JSON.parse(fs.readFileSync(ENC, 'utf8')); } catch { return {}; }
}

function read() {
  const out = {};
  for (const [k, box] of Object.entries(readRaw())) {
    try { out[k] = decrypt(box); } catch { out[k] = ''; }
  }
  return out;
}

function write(patch) {
  const raw = readRaw();
  for (const [k, v] of Object.entries(patch || {})) {
    const val = String(v || '').trim();
    if (!val) delete raw[k];
    else raw[k] = encrypt(val);
  }
  fs.writeFileSync(ENC, JSON.stringify(raw), { mode: 0o600 });
  try { fs.rmSync(LEGACY, { force: true }); } catch {}
  return Object.keys(raw);
}

function remove(name) {
  const raw = readRaw();
  delete raw[name];
  fs.writeFileSync(ENC, JSON.stringify(raw), { mode: 0o600 });
  return Object.keys(raw);
}

function list() {
  const all = read();
  return Object.entries(all).map(([name, v]) => ({ name, set: !!v, masked: v ? v.slice(0, 4) + '…' + v.slice(-4) : '' }));
}

/* একবার মাইগ্রেশন: পুরনো প্লেইনটেক্সট keys.json → এনক্রিপ্টেড */
function migrate() {
  if (!fs.existsSync(LEGACY)) return false;
  try {
    const old = JSON.parse(fs.readFileSync(LEGACY, 'utf8'));
    write(old);
    fs.rmSync(LEGACY, { force: true });
    return true;
  } catch { return false; }
}
migrate();

module.exports = { read, write, remove, list, ENC, MASTER };

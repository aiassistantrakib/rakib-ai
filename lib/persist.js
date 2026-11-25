/* =========================================================================
   RAKIB AI — persist: টাস্ক/অনুমোদন/ইভেন্ট ডিস্কে রাখে, রিস্টার্টে ফিরে আসে
   • append-only JSONL লগ (সহজ, ক্র্যাশ-নিরাপদ, বড় হলেও চলে)
   • বুটে সর্বশেষ N টাস্ক/অনুমোদন মেমরিতে লোড
   • "running" অবস্থায় আটকে থাকা টাস্ক → interrupted হিসেবে চিহ্নিত
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA } = require('./config');

const DIR = path.join(DATA, 'persist');
const TASKS = path.join(DIR, 'tasks.jsonl');
const APPROVALS = path.join(DIR, 'approvals.jsonl');
const MAX_LOAD = 120;

function ensure() { try { fs.mkdirSync(DIR, { recursive: true }); } catch {} }
function append(file, obj) {
  ensure();
  try { fs.appendFileSync(file, JSON.stringify(obj) + '\n', { mode: 0o600 }); } catch {}
}
function readAll(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out;
  } catch { return []; }
}
/* শেষ রেকর্ড (একই id-র সর্বশেষ ভার্সন জেতে) */
function latest(file, n = MAX_LOAD) {
  const all = readAll(file);
  const by = new Map();
  for (const r of all) if (r && r.id) by.set(r.id, { ...(by.get(r.id) || {}), ...r });
  return [...by.values()].slice(-n);
}

const persist = {
  task(t) {
    append(TASKS, {
      id: t.id, at: t.at, text: t.text, agent: t.agent, status: t.status,
      startedAt: t.startedAt, endedAt: t.endedAt, error: t.error,
      result: t.result ? {
        ok: t.result.ok, content: t.result.content, ms: t.result.ms, agent: t.result.agent, agentName: t.result.agentName,
        usedModel: t.result.usedModel ? { id: t.result.usedModel.id, label: t.result.usedModel.label } : null,
        toolTrace: (t.result.toolTrace || []).slice(0, 40), attempts: (t.result.attempts || []).slice(0, 12), usage: t.result.usage,
      } : null,
      events: (t.events || []).slice(-200),
    });
  },
  approval(a) { append(APPROVALS, a); },
  loadTasks: () => latest(TASKS),
  loadApprovals: () => latest(APPROVALS),
  files: { DIR, TASKS, APPROVALS },
};

module.exports = persist;

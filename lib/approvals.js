/* =========================================================================
   RAKIB AI — Approval system (Phase 5)
   • sensitive tool/action গুলো একা চলতে পারে না — অনুমোদন লাগে
   • প্রতিটি সিদ্ধান্ত অডিট লগে যায়, কার্ডে যা দেখানো হয় তাই অনুমোদিত হয়
   • allowOnce / deny / edit (আর্গুমেন্ট বদলে দিলে নতুন approval লাগে)
   ========================================================================= */
'use strict';
const { audit, uid } = require('./store');
const persist = require('./persist');

const RISK = {
  read: { level: 'কম', cls: 'ok' },
  write: { level: 'মাঝারি', cls: 'warn' },
  sensitive: { level: 'উচ্চ', cls: 'bad' },
};

/* কোন টুল কোন ঝুঁকিতে পড়ে */
const POLICY = {
  calculator: 'read', web_search: 'read', fetch_url: 'read', list_files: 'read', read_file: 'read',
  browser_open: 'read', browser_click: 'read', browser_close: 'read', delegate_to_agent: 'read',
  image_ops: 'write', image_generate: 'write', csv_stats: 'write', run_js: 'write',
  write_file: 'sensitive', video_from_image: 'sensitive',
  /* ফেজ ১৩: পাবলিক পোস্ট, বাল্ক মেসেজ, আর্থিক, ধ্বংসাত্মক, অপরিবর্তনীয় — সবসময় কার্ড */
  publish_post: 'sensitive', send_message: 'sensitive', send_bulk: 'sensitive',
  purchase: 'sensitive', payment: 'sensitive', delete_file: 'sensitive',
  account_change: 'sensitive', browser_submit: 'sensitive',
};

/* অপরিবর্তনীয়/আর্থিক/পাবলিক — autoApprove সেটিং যাই হোক, কার্ড বাধ্যতামূলক */
const ALWAYS_APPROVE = ['publish_post', 'send_message', 'send_bulk', 'purchase', 'payment', 'delete_file', 'account_change', 'browser_submit', 'write_file', 'video_from_image'];

const pending = new Map();   // id -> approval
const history = [];          // শেষ ২০০
const MAX = 200;

function riskOf(tool) { return POLICY[tool] || 'sensitive'; }

/**
 * অনুমোদন দরকার কি না
 * settings.autoApprove = 'read' | 'write' | 'all'  (ডিফল্ট: 'read')
 */
function needsApproval(tool, settings = {}) {
  if (ALWAYS_APPROVE.includes(tool)) return true;      // কখনো অটো নয়
  // এজেন্টের নিজের অনুমোদন-নীতি (always | sensitive | never)
  const pol = settings.approvalPolicy;
  if (pol === 'always') return true;
  if (pol === 'never') return riskOf(tool) === 'sensitive';  // sensitive কখনোই অটো নয়
  const mode = settings.autoApprove || 'read';
  const r = riskOf(tool);
  if (mode === 'all') return true;
  if (mode === 'write') return r === 'sensitive';
  return r !== 'read';            // ডিফল্ট: read-auto, write/sensitive → কার্ড
}

/* একই কাজ দুবার না চলে: একই (tool+args+agent) বাস্তবে চলছে কি না */
const running = new Set();
function dedupeKey(tool, args, agent) {
  try { return `${tool}|${agent}|${JSON.stringify(args || {})}`.slice(0, 400); } catch { return tool + '|' + agent; }
}
function isDuplicate(tool, args, agent) { return running.has(dedupeKey(tool, args, agent)); }
function markRunning(tool, args, agent) { running.add(dedupeKey(tool, args, agent)); }
function clearRunning(tool, args, agent) { running.delete(dedupeKey(tool, args, agent)); }

function request({ tool, args, agent, taskId, reason, settings = {} }) {
  const risk = riskOf(tool);
  const ap = {
    id: uid(8), at: new Date().toISOString(), tool, args: args || {}, agent: agent || 'chief',
    taskId: taskId || null, risk, riskLabel: RISK[risk].level, riskCls: RISK[risk].cls,
    reason: reason || describe(tool, args), status: 'pending', decidedAt: null, editedArgs: null,
  };
  pending.set(ap.id, ap);
  persist.approval(ap);
  audit('approval_requested', { id: ap.id, tool, risk, agent: ap.agent, taskId: ap.taskId });
  return ap;
}

function describe(tool, args = {}) {
  switch (tool) {
    case 'write_file': return `ফাইলে লেখা: ${args.path || '?'} (${String(args.content || '').length} অক্ষর) — পুরনোটা মুছে যাবে`;
    case 'video_from_image': return `ভিডিও তৈরি: ${args.image_path || '?'} → workspace/videos (ফ্রি রিমোট GPU, ~২০s)`;
    case 'image_generate': return `ছবি তৈরি হবে: "${String(args.prompt || '').slice(0, 80)}"`;
    case 'image_ops': return `ছবি সম্পাদনা: ${args.op || '?'} on ${args.path || '?'}`;
    case 'run_js': return 'স্যান্ডবক্সে JavaScript চালাবে (নেটওয়ার্ক/ফাইল বন্ধ)';
    case 'csv_stats': return `CSV বিশ্লেষণ: ${args.path || '?'}`;
    case 'publish_post': return `পাবলিক পোস্ট (${args.platform || '?'}): "${String(args.text || '').slice(0, 90)}" — সবাই দেখতে পাবে`;
    case 'send_message': return `বার্তা পাঠানো (${args.to || '?'}): "${String(args.text || '').slice(0, 90)}"`;
    case 'send_bulk': return `বাল্ক মেসেজ: ${Array.isArray(args.recipients) ? args.recipients.length : '?'} জনকে — ফেরানো যাবে না`;
    case 'purchase': return `কেনাকাটা: ${args.item || '?'} — ${args.amount || '?'} (টাকা কাটবে)`;
    case 'payment': return `পেমেন্ট: ${args.amount || '?'} → ${args.to || '?'} (অপরিবর্তনীয়)`;
    case 'delete_file': return `মুছে ফেলা: ${args.path || '?'} — ফেরানো যাবে না`;
    case 'account_change': return `অ্যাকাউন্ট পরিবর্তন: ${args.what || '?'}`;
    case 'browser_submit': return `ফর্ম জমা: ${args.url || '?'} (বাইরের সাইটে অপরিবর্তনীয় কাজ)`;
    default: return `${tool} চালানো হবে`;
  }
}

function decide(id, action, { args = null } = {}) {
  const ap = pending.get(id);
  if (!ap) return null;
  if (ap.status !== 'pending') return ap;
  ap.decidedAt = new Date().toISOString();
  if (action === 'approve') ap.status = 'approved';
  else if (action === 'deny') ap.status = 'denied';
  else if (action === 'edit') { ap.status = 'edited'; ap.editedArgs = args || {}; }
  else return null;
  pending.delete(id);
  history.unshift(ap);
  if (history.length > MAX) history.pop();
  persist.approval(ap);
  audit('approval_' + ap.status, { id, tool: ap.tool, agent: ap.agent, taskId: ap.taskId });
  return ap;
}

/* ---- বুটে ডিস্ক থেকে অনুমোদন ফিরিয়ে আনা ---- */
(function hydrate() {
  try {
    const all = persist.loadApprovals();
    const now = Date.now();
    for (const a of all) {
      if (!a || !a.id) continue;
      if (a.status === 'pending') {
        const age = now - new Date(a.at).getTime();
        if (age > 30 * 60 * 1000) { a.status = 'expired'; a.decidedAt = new Date().toISOString(); persist.approval(a); history.unshift(a); }
        else pending.set(a.id, a);
      } else if (!history.find((h) => h.id === a.id)) history.unshift(a);
    }
    history.sort((x, y) => (x.decidedAt || x.at) < (y.decidedAt || y.at) ? 1 : -1);
    history.length = Math.min(history.length, MAX);
  } catch {}
})();

function list() {
  return { pending: [...pending.values()].sort((a, b) => (a.at > b.at ? 1 : -1)), history: history.slice(0, 50) };
}
function stats() {
  const approved = history.filter((h) => h.status === 'approved').length;
  const denied = history.filter((h) => h.status === 'denied').length;
  return { pending: pending.size, approved, denied, total: history.length };
}

module.exports = { POLICY, RISK, ALWAYS_APPROVE, riskOf, needsApproval, request, decide, list, stats, describe, isDuplicate, markRunning, clearRunning };

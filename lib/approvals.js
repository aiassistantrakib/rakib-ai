/* =========================================================================
   RAKIB AI — Approval system (Phase 5)
   • sensitive tool/action গুলো একা চলতে পারে না — অনুমোদন লাগে
   • প্রতিটি সিদ্ধান্ত অডিট লগে যায়, কার্ডে যা দেখানো হয় তাই অনুমোদিত হয়
   • allowOnce / deny / edit (আর্গুমেন্ট বদলে দিলে নতুন approval লাগে)
   ========================================================================= */
'use strict';
const { audit, uid } = require('./store');

const RISK = {
  read: { level: 'কম', cls: 'ok' },
  write: { level: 'মাঝারি', cls: 'warn' },
  sensitive: { level: 'উচ্চ', cls: 'bad' },
};

/* কোন টুল কোন ঝুঁকিতে পড়ে */
const POLICY = {
  calculator: 'read', web_search: 'read', fetch_url: 'read', list_files: 'read', read_file: 'read',
  browser_open: 'read', browser_click: 'read', browser_close: 'read',
  image_ops: 'write', image_generate: 'write', csv_stats: 'write', run_js: 'write',
  write_file: 'sensitive', video_from_image: 'sensitive', delegate_to_agent: 'read',
};

const pending = new Map();   // id -> approval
const history = [];          // শেষ ২০০
const MAX = 200;

function riskOf(tool) { return POLICY[tool] || 'sensitive'; }

/**
 * অনুমোদন দরকার কি না
 * settings.autoApprove = 'read' | 'write' | 'all'  (ডিফল্ট: 'read')
 */
function needsApproval(tool, settings = {}) {
  const mode = settings.autoApprove || 'read';
  const r = riskOf(tool);
  if (mode === 'all') return true;
  if (mode === 'write') return r === 'sensitive';
  return r !== 'read';            // ডিফল্ট: read-auto, write/sensitive → কার্ড
}

function request({ tool, args, agent, taskId, reason, settings = {} }) {
  const risk = riskOf(tool);
  const ap = {
    id: uid(8), at: new Date().toISOString(), tool, args: args || {}, agent: agent || 'chief',
    taskId: taskId || null, risk, riskLabel: RISK[risk].level, riskCls: RISK[risk].cls,
    reason: reason || describe(tool, args), status: 'pending', decidedAt: null, editedArgs: null,
  };
  pending.set(ap.id, ap);
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
  audit('approval_' + ap.status, { id, tool: ap.tool, agent: ap.agent, taskId: ap.taskId });
  return ap;
}

function list() {
  return { pending: [...pending.values()].sort((a, b) => (a.at > b.at ? 1 : -1)), history: history.slice(0, 50) };
}
function stats() {
  const approved = history.filter((h) => h.status === 'approved').length;
  const denied = history.filter((h) => h.status === 'denied').length;
  return { pending: pending.size, approved, denied, total: history.length };
}

module.exports = { POLICY, RISK, riskOf, needsApproval, request, decide, list, stats, describe };

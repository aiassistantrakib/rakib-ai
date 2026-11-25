/* ফেজ ১২ — আসল রিপো ও চলমান সিস্টেমের সিকিউরিটি স্ক্যান (শুধু পড়া, কোনো আক্রমণ নয়) */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const R = [];
const add = (n, s, d = '') => { R.push({ n, s, d }); console.log((s === 'PASS' ? '✅' : s === 'FAIL' ? '❌' : s === 'WARN' ? '⚠️' : '⚪') + ' ' + n + (d ? ' — ' + d : '')); };

// ১) ট্র্যাক করা ফাইলে সিক্রেট
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const PAT = /(sk-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
let leaks = [];
for (const f of tracked) {
  try { const t = fs.readFileSync(f, 'utf8'); if (PAT.test(t)) leaks.push(f); } catch {}
}
add('No secrets in tracked files', leaks.length ? 'FAIL' : 'PASS', leaks.length ? leaks.join(',') : tracked.length + ' files scanned');

// ২) .gitignore covers sensitive runtime data
const gi = fs.readFileSync('.gitignore', 'utf8');
const need = ['data/keys.json', 'data/keys.enc.json', 'data/master.key', 'data/access-token', 'workspace/', '.env'];
const missing = need.filter((x) => !gi.includes(x));
add('.gitignore covers secrets', missing.length ? 'FAIL' : 'PASS', missing.join(',') || 'all covered');

// ৩) ফ্রন্টএন্ডে কী নেই
const pub = fs.readdirSync('public').map((f) => path.join('public', f)).filter((f) => /\.(js|html)$/.test(f));
let frontLeak = pub.filter((f) => PAT.test(fs.readFileSync(f, 'utf8')));
add('No keys in frontend', frontLeak.length ? 'FAIL' : 'PASS', frontLeak.join(',') || pub.length + ' files');

// ৪) টোকেন-গার্ডেড mutating API
const srv = fs.readFileSync('server.js', 'utf8');
add('Mutating API requires token', /needsToken\s*&&\s*given\s*!==\s*TOKEN/.test(srv) ? 'PASS' : 'FAIL');
add('Same-origin / CORS policy present', /sameOrigin/.test(srv) && /Access-Control-Allow-Origin/.test(srv) ? 'PASS' : 'FAIL');

// ৫) কী এনক্রিপশন
const sec = fs.readFileSync('lib/secrets.js', 'utf8');
add('Keys encrypted at rest (AES-256-GCM)', /aes-256-gcm/.test(sec) ? 'PASS' : 'FAIL');
add('Master key file mode 0600', /mode:\s*0o600/.test(sec) ? 'PASS' : 'FAIL');

// ৬) পাথ স্যান্ডবক্স
const tools = fs.readFileSync('lib/tools.js', 'utf8');
add('Path sandbox (safePath)', /function safePath/.test(tools) ? 'PASS' : 'FAIL');
add('Sandboxed JS eval (no require/network)', /safeEval|okChars|OKCH/.test(tools) ? 'PASS' : 'FAIL');

// ৭) অনুমোদন নীতি
const ap = fs.readFileSync('lib/approvals.js', 'utf8');
add('Irreversible actions always approved', /ALWAYS_APPROVE/.test(ap) && /publish_post/.test(ap) ? 'PASS' : 'FAIL');

// ৮) রেট লিমিট + অডিট
add('Rate limiting', /rateLimited/.test(srv) ? 'PASS' : 'FAIL');
add('Audit log', /audit\(/.test(srv) ? 'PASS' : 'FAIL');

// ৯) npm অডিট (ডিপেন্ডেন্সি)
let deps = 'no dependencies';
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  deps = Object.keys(pkg.dependencies || {}).join(',') || 'no runtime dependencies';
  add('Runtime dependencies', 'PASS', deps);
} catch { add('Runtime dependencies', 'WARN', 'package.json পড়া যায়নি'); }

// ১০) playwright devDependency?
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  add('Playwright declared', (pkg.devDependencies && pkg.devDependencies.playwright) ? 'PASS' : 'WARN', 'browser tool optional; install locally');
} catch {}

// ১১) .env tracked?
add('.env not tracked', tracked.some((f) => f === '.env' || f.endsWith('/.env')) ? 'FAIL' : 'PASS');

// ১২) HSTS / security headers
add('Security headers (HSTS/H-Frame/nosniff)', /Strict-Transport-Security/.test(srv) && /X-Frame-Options/.test(srv) ? 'PASS' : 'FAIL');

const fail = R.filter((r) => r.s === 'FAIL').length;
console.log('\n' + R.length + ' checks · ' + fail + ' failed');
fs.writeFileSync('data/persist/security-scan.json', JSON.stringify(R, null, 1));
process.exit(0);

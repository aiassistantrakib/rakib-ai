const T = require('../lib/tools.js');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };

// calculator
ok('1834*27/6+sqrt(961)=8284', T.safeEval('1834*27/6+sqrt(961)') === 8284);
ok('(2+3)^2/5=5', T.safeEval('(2+3)^2/5') === 5);
ok('min(4,9,2)=2', T.safeEval('min(4,9,2)') === 2);
let blocked = false; try { T.safeEval('process.exit(1)'); } catch { blocked = true; }
ok('code injection blocked', blocked);
blocked = false; try { T.safeEval('constructor'); } catch { blocked = true; }
ok('unknown identifier blocked', blocked);

// image roundtrip
const w = 64, h = 48, rgba = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) { rgba[i * 4] = (i % w) * 4; rgba[i * 4 + 1] = 100; rgba[i * 4 + 2] = 200; rgba[i * 4 + 3] = 255; }
const png = T.encodePng(w, h, rgba);
const dec = T.decodePng(png);
ok('PNG roundtrip identical', dec.width === w && dec.height === h && Buffer.compare(dec.rgba, rgba) === 0);
fs.writeFileSync('workspace/images/_test.png', png);

(async () => {
  const cases = [
    ['grayscale', { op: 'grayscale' }],
    ['watermark', { op: 'watermark', text: 'RAKIB AI' }],
    ['resize', { op: 'resize', width: 32 }],
    ['crop', { op: 'crop', x: 5, y: 5, width: 20, height: 20 }],
    ['rotate90', { op: 'rotate90' }],
    ['blur', { op: 'blur', amount: 2 }],
    ['remove_background', { op: 'remove_background' }],
    ['invert', { op: 'invert' }],
    ['brightness', { op: 'brightness', amount: 30 }],
    ['flip', { op: 'flip' }],
  ];
  for (const [name, args] of cases) {
    const out = `images/_test_${name}.png`;
    const r = await T.runTool('image_ops', { input: 'images/_test.png', output: out, ...args });
    const good = fs.existsSync('workspace/' + out) && T.decodePng(fs.readFileSync('workspace/' + out)).width > 0;
    ok('image_ops ' + name, good, r.text.slice(0, 60));
  }
  const rj = await T.runTool('run_js', { code: 'return [1,2,3].map(x=>x*2).join("-")' });
  ok('run_js sandbox result', rj.text.includes('2-4-6'));
  const rjBad = await T.runTool('run_js', { code: 'return require("fs").readFileSync("/etc/passwd","utf8")' });
  ok('run_js blocks require', /Error/.test(rjBad.text));
  const sw = await T.runTool('write_file', { path: '../escape.txt', content: 'x' });
  ok('path sandbox blocks ../', /Error/.test(sw.text));
  const aw = await T.runTool('write_file', { path: 'notes/a.txt', content: 'hello' });
  ok('write_file inside workspace', /লেখা হয়েছে/.test(aw.text));
  const rd = await T.runTool('read_file', { path: 'notes/a.txt' });
  ok('read_file returns content', rd.text === 'hello');
  const lf = await T.runTool('list_files', {});
  ok('list_files works', /📄|📁/.test(lf.text));
  fs.writeFileSync('workspace/data.csv', 'name,price,qty\nA,10,2\nB,20,5\nC,30,1\n');
  const cs = await T.runTool('csv_stats', { path: 'data.csv' });
  ok('csv_stats sums price=60', cs.text.includes('"sum":60'), cs.text.split('\n')[0]);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

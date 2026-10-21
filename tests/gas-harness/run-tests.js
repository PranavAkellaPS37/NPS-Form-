#!/usr/bin/env node
/* =============================================================================
   run-tests.js  -  test the Phase 2 Apps Script code on this Mac, without Google

   WHAT THIS FILE IS
     The one command that checks the control panel's server code and the
     public web app (apps-script/Code.gs, Model.gs, PanelServer.gs, Panel.html)
     against the contract (docs/control-panel-design.md and
     docs/submission-format.md), using the pretend Google in fake-gas.js:
       self-test  the pretend Google itself behaves like Google (41 checks)
       S          static checks (coding rules, allowed services, Panel.html)
       A1-A3      Set up or repair (fresh, repeated, without publishing)
       B1-B11     every panel* function (load, validate, save, publish,
                  history, restore, rounds, counts, links, preview, secret,
                  import, export, menu, co-admins), and the PP_slug /
                  derived-text helpers
       C, C2      doGet (health, bootstrap, draft=1, what changed, cache), and a
                  fully translated questionnaire (cache pieces under 100 KB)
       D1-D11     doPost (pings, submissions, every data column, voice notes,
                  duplicates, refusals, malformed input, busy lock, growth,
                  texts that look like formulas, size limits), and the links
                  CSV (D11)
       G1-G10     the Google-side fixes of 20-21 Oct: the two locks, the
                  permission re-check, owner hand-over, the web app address,
                  the code lock (test rounds; a real round opened before any
                  publish), a save that shrinks every tab, the "Authorization
                  is required" message, nps/support_gate, empty new rounds,
                  DC ids turned into dates, read-aloud clip addresses, and
                  the Meesho-only mode (G10: the survey page served by the web
                  app, ppFormRequest, links, the admin lock)
       E1-E4      the real form in headless Chrome, end to end
       F          the control panel page in Chrome (smoke test)
     tools/plant-bugs.py checks these tests themselves: it plants 38 known
     mistakes, one at a time, in copies of the code and expects each to be
     caught.

   HOW TO RUN IT (Terminal)
       cd <this folder>
       node run-tests.js                 everything (about a minute)
       node run-tests.js --only B4,D     only some scenarios (by id or prefix)
       node run-tests.js --skip E,F      leave out the browser tests
       node run-tests.js --headful       watch Chrome do the browser tests
       node run-tests.js --verbose       also print every check and the code's logs
       node run-tests.js --self-test     only check the pretend Google itself
       node run-tests.js --apps-script-dir /path/to/other/apps-script
       node run-tests.js --web-dir /path/to/other/web     (another copy of the form)
       node run-tests.js --out /some/folder               (write the report there)
     Exit code 0 = no FAIL (warnings allowed), 1 = something failed.

   WHAT IT READS
     The project (read only): apps-script/, web/, scripts/check_config.py.
   WHAT IT WRITES (only inside this folder)
     out/report.txt   the plain-English report (also printed)
     out/report.json  the same, for tools
     out/shots/*.png  screenshots of the browser tests

   SAFETY
     Fake data only (DC-DEMO-..., DC-E2E-...). It never contacts Google and
     never changes the project. Every server and browser it starts is
     stopped at the end, also when a test fails.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const K = require('./lib/testkit');
const H = require('./lib/helpers');
const B = require('./lib/browser');
const { runSelfTest } = require('./lib/selftest');

let OUT = path.join(__dirname, 'out');
const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/gas-harness/)

function parseArgs(argv) {
  const a = { only: [], skip: [], headful: false, verbose: false, selfTest: false, noBrowser: false,
    appsScriptDir: path.join(REPO, 'apps-script'), webDir: path.join(REPO, 'web') };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--only') a.only = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (k === '--skip') a.skip = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (k === '--headful') a.headful = true;
    else if (k === '--verbose') a.verbose = true;
    else if (k === '--self-test') a.selfTest = true;
    else if (k === '--no-browser') a.noBrowser = true;
    else if (k === '--apps-script-dir') a.appsScriptDir = path.resolve(argv[++i]);
    else if (k === '--web-dir') a.webDir = path.resolve(argv[++i]);
    else if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--help' || k === '-h') a.help = true;
    else { process.stderr.write(`Unknown option ${k}. Try --help\n`); process.exit(2); }
  }
  return a;
}

const matches = (id, list) => list.some((x) => id === x || id.startsWith(x));

function fileFacts(dir) {
  if (!fs.existsSync(dir)) return '(folder missing)';
  return fs.readdirSync(dir).filter((f) => /\.(gs|html|json)$/.test(f)).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return `${f} ${Math.round(st.size / 1024)} KB (changed ${st.mtime.toISOString().slice(0, 16).replace('T', ' ')})`;
  }).join(', ');
}

function scenarioLine(s) {
  const failed = s.checks.filter((c) => !c.ok && c.level === 'must').length;
  const warned = s.checks.filter((c) => !c.ok && c.level === 'should').length;
  const extra = s.skipped ? `skipped: ${s.skipped}` : `${s.checks.length} checks, ${failed} failed, ${warned} warnings, ${s.ms} ms`;
  return `${s.status().padEnd(4)}  ${s.id.padEnd(3)} ${s.title}  (${extra})`;
}

function detailLines(s, verbose) {
  const out = [];
  if (s.crash) out.push(`    CRASH (a harness or test problem, not a check): ${s.crash.replace(/\n/g, '\n           ')}`);
  for (const c of s.checks) {
    if (c.ok && !verbose) continue;
    const tag = c.ok ? 'ok  ' : c.level === 'must' ? 'FAIL' : 'WARN';
    out.push(`    ${tag} ${c.what}${c.ok ? '' : '\n           -> ' + String(c.detail || '').replace(/\n/g, '\n              ')}`);
  }
  for (const n of s.notes) out.push(`    note: ${n}`);
  return out;
}

/* Every method outside the contract, every [contract] error and every quirk
   the fake Google saw, across all scenarios. */
function contractSummary() {
  const off = new Map();
  const violations = new Map();
  const quirks = new Map();
  for (const h of H.ALL) {
    for (const [k, v] of h.state.offContract) {
      const rec = off.get(k) || { count: 0, fns: new Set(), where: v.where };
      rec.count += v.count;
      for (const f of v.fns) rec.fns.add(f);
      off.set(k, rec);
    }
    for (const v of h.state.violations) violations.set(`${v.member} @ ${v.where}`, v);
    for (const w of h.state.warnings) if (w.fn) quirks.set(w.text.slice(0, 140), w);
  }
  return { off, violations, quirks };
}

async function main() {
  const ARGS = parseArgs(process.argv.slice(2));
  if (ARGS.help) {
    process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*/, '') + '\n');
    return 0;
  }
  if (ARGS.out) OUT = ARGS.out;
  fs.mkdirSync(OUT, { recursive: true });
  H.configure({ appsScriptDir: ARGS.appsScriptDir, webDir: ARGS.webDir, verbose: ARGS.verbose });
  const lines = [];
  const say = (t) => { lines.push(t); process.stdout.write(t + '\n'); };
  const started = Date.now();
  say('Partner Pulse - Apps Script test harness');
  say(`Run at ${new Date().toISOString()} on Node ${process.version}`);
  say(`Code under test: ${ARGS.appsScriptDir}   Form: ${ARGS.webDir}`);
  say(`Files: ${fileFacts(ARGS.appsScriptDir)}`);
  say('');

  const self = runSelfTest(ARGS.verbose ? say : () => {});
  say(`Self-test of the pretend Google: ${self.total - self.failed}/${self.total} checks passed`);
  for (const r of self.results.filter((x) => !x.ok)) say(`  FAIL self-test: ${r.name} -> ${r.detail}`);
  if (ARGS.selfTest) return self.failed ? 1 : 0;
  if (self.failed) say('  The pretend Google has a problem: results below may be wrong where they depend on it.');
  say('');

  const registry = [];
  const add = (id, title, fn) => registry.push({ id, title, fn });
  const cleanups = [];
  let browserPromise = null;
  const shared = {
    getBrowser() {
      if (!browserPromise) {
        browserPromise = B.launch({ headful: ARGS.headful }).then((browser) => ({ browser }), (err) => ({ browser: null, error: err.message }));
      }
      return browserPromise;
    },
    onCleanup(fn) { cleanups.push(fn); }
  };
  require('./scenarios/setup')(add);
  require('./scenarios/panel')(add);
  require('./scenarios/webapp')(add);
  require('./scenarios/fixes')(add);
  if (!ARGS.noBrowser) require('./scenarios/browser')(add, shared);
  const selected = registry.filter((r) => (!ARGS.only.length || matches(r.id, ARGS.only)) && !matches(r.id, ARGS.skip));
  // Old screenshots are removed only when browser scenarios run again.
  if (selected.some((r) => /^[EF]/.test(r.id))) {
    fs.mkdirSync(B.SHOTS, { recursive: true });
    for (const f of fs.readdirSync(B.SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(B.SHOTS, f));
  }

  const results = [];
  const guard = setTimeout(() => {
    process.stderr.write('\nThe tests took longer than 20 minutes and were stopped.\n');
    process.exit(3);
  }, 20 * 60 * 1000);
  guard.unref();
  say('SCENARIOS');
  try {
    for (const sc of selected) {
      await K.runScenario(results, sc.id, sc.title, sc.fn, (s) => {
        say(scenarioLine(s));
        if (ARGS.verbose) detailLines(s, true).forEach((l) => say(l));
      });
    }
  } finally {
    for (const fn of cleanups) { try { await fn(); } catch (e) { /* already stopped */ } }
    if (browserPromise) {
      const b = await browserPromise;
      if (b.browser) await b.browser.close().catch(() => {});
    }
  }

  say('');
  say('DETAILS (only what failed or needs a look; --verbose shows every check)');
  for (const s of results) {
    const lines2 = detailLines(s, false);
    if (!lines2.length) continue;
    say(`[${s.status()}] ${s.id} ${s.title}`);
    lines2.forEach((l) => say(l));
  }

  const summary = contractSummary();
  say('');
  say('CONTRACT NOTES (all scenarios together)');
  if (!summary.violations.size) say('  No [contract] errors: the code only called methods the harness provides.');
  for (const [k, v] of summary.violations) say(`  [contract] ${k} (in ${v.fn})`);
  if (!summary.off.size) say('  No methods outside the contract\'s allowed list (section 2) were used.');
  else {
    say('  Methods used that are NOT on the contract\'s allowed list (section 2) but that Google has:');
    for (const [k, v] of summary.off) say(`    ${k}: ${v.count} call(s), in ${Array.from(v.fns).join(', ')} (first at ${v.where})`);
  }
  if (summary.quirks.size) {
    say('  Things the pretend Google noticed (Google would behave the same way):');
    for (const [, w] of summary.quirks) say(`    - ${w.text} (in ${w.fn}, ${w.where})`);
  }

  const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  results.forEach((s) => { counts[s.status()] += 1; });
  say('');
  say(`RESULT: ${counts.PASS} passed, ${counts.WARN} passed with warnings, ${counts.FAIL} failed, ${counts.SKIP} skipped ` +
    `(${results.length} scenarios, ${Math.round((Date.now() - started) / 1000)} s). Report: ${path.join(OUT, 'report.txt')}` +
    (selected.some((r) => /^[EF]/.test(r.id)) ? `; screenshots: ${B.SHOTS}` : ''));

  fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    run_at: new Date(started).toISOString(), apps_script_dir: ARGS.appsScriptDir, files: fileFacts(ARGS.appsScriptDir),
    self_test: { total: self.total, failed: self.failed, failures: self.results.filter((x) => !x.ok) },
    scenarios: results.map((s) => ({ id: s.id, title: s.title, status: s.status(), ms: s.ms, skipped: s.skipped, crash: s.crash,
      failed: s.checks.filter((c) => !c.ok), passed: s.checks.filter((c) => c.ok).map((c) => c.what), notes: s.notes })),
    contract: {
      violations: Array.from(summary.violations.values()),
      outside_contract: Array.from(summary.off.entries()).map(([k, v]) => ({ method: k, count: v.count, functions: Array.from(v.fns), where: v.where })),
      quirks: Array.from(summary.quirks.values())
    },
    counts
  }, null, 1));
  return counts.FAIL ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(2);
});

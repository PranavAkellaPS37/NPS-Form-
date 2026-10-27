/* =============================================================================
   test.js: end-to-end test of apps-script/Panel.html on the local bench.
   Developer test in tests/panel/ (never published: GitHub Pages serves only web/).

   Run:  node tests/panel/test.js   (from the project folder; needs Chrome at the
                                     path below and puppeteer-core: run "npm install"
                                     once in tests/)
   Out:  PASS / FAIL lines, screenshots in ./shots, downloads in ./downloads.
   It starts its own bench server (server.js) on a free port and stops it.
   Since stage 4 of the flow-graph work (26 Oct 2026) it also checks the route
   tools: the form's own route code running in the panel window, jumps,
   "usually go to", "ask for each area", endings, the badges, the settings
   shown in the built-in screens' editors, the Map (with the drawing library
   blocked, so the text outline and the mermaid.live link must appear), Try a
   path and the Home banner about the form's route code; and, without a
   browser, PanelServer.gs's own fingerprint check (loaded into Node).
   The reviewers' fixes of 26 Oct 2026 are checked too: hiding or deleting an
   ending below the thank-you screen says what happens and a route never runs
   into another one (the check stops it, "Go there" opens "After this
   question"); a live answer of a pick-one question can't be removed; the
   problem-screens row's own arrows are not offered in "straight after each
   low rating" mode (leftovers can be cleared); the Map shows the outline at
   once and swaps in the drawing (waiting up to 20 s); Publish's warnings are
   shown; the GitHub copy brings docs/flow.md; and "Show this question only
   if" offers the partner's language and the round.
   Also since 26 Oct 2026: the panel reads no checker message any more. A
   broken jump is marked on that jump only, even when two jumps go to the
   same screen (the finding says which: site, target, index), the rule and
   jump builders offer what PP.flowCheck.answersAt says, and with an older
   route code (no answersAt; the bench sends one) they fall back to the
   earlier rows. A kind of question added in web/js/types/ (the guide's
   example, tests/flow/fixtures/types/stars_1_10.js, installed in a copy by
   "node scripts/flow.js types --write") reaches the window with the list of
   kinds, so the jump builder and Try a path know its answer.
   ============================================================================= */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');   // from tests/node_modules
const { start } = require('./server');
const backend = require('./fake_backend');

const REPO = path.resolve(__dirname, '..', '..');
const REAL = backend.REAL;   // the real Model.gs + Flow.gs (null in stand-in mode)
/* The form's own route code, for the checks made here in Node. */
const FLOW = require(path.join(REPO, 'web', 'js', 'flow.js'));
const FLOW_PANEL = require(path.join(REPO, 'web', 'js', 'flow-panel.js'));
/* The form's checker (it writes docs/flow.md: "node scripts/flow.js map"). */
const FLOW_CHECK = require(path.join(REPO, 'web', 'js', 'flow-check.js'));
/* survey.json as the repo has it once converted to the graph: the repo file
   itself, or (while it still holds the old list) that file with its flow
   converted in memory, the way "python3 scripts/flow.py migrate" writes it. */
function repoSurveyAsGraph() {
  const raw = fs.readFileSync(path.join(REPO, 'web', 'config', 'survey.json'), 'utf8');
  const survey = JSON.parse(raw);
  return Array.isArray(survey.flow) ? FLOW_PANEL.surveyTextWithFlow(raw, JSON.parse(JSON.stringify(FLOW.fromLegacy(survey)))) : raw;
}
const withoutVersion = (t) => String(t).replace(/"config_version": "[^"]*"/, '"config_version": "…"');
function firstDiff(a, b) {
  const x = String(a).split('\n'), y = String(b).split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return 'line ' + (i + 1) + ': got ' + JSON.stringify(x[i]) + ' | expected ' + JSON.stringify(y[i]);
  return 'identical';
}
/* JSON with sorted keys and without notes (_...), to compare two routes. */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined && k.charAt(0) !== '_' && k !== 'byId' && k !== 'legacy').sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const nodeOf = (graph, id) => (graph && Array.isArray(graph.nodes) ? graph.nodes.find((n) => n && n.id === id) : null);
/* The questionnaire the server would publish from the bench's saved draft. */
function serverSurvey(model) { return REAL ? REAL.compile(model, null).survey : null; }

/* The guide's example of a new kind of question (docs/config-guide.md, "How to add a question type"). */
const STARS = path.join(REPO, 'tests', 'flow', 'fixtures', 'types', 'stars_1_10.js');
/* The control panel's list of kinds (Model.gs PP_SCREEN_TYPES) once that kind is installed: in a
   throw-away copy of web/ and Model.gs, the file goes to web/js/types/ with its line in index.html, and
   "node scripts/flow.js types --write" remakes the list, as the guide says. */
function screenTypesWithStars() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-panel-kind-'));
  try {
    fs.cpSync(path.join(REPO, 'web'), path.join(tmp, 'web'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'apps-script'));
    fs.copyFileSync(path.join(REPO, 'apps-script', 'Model.gs'), path.join(tmp, 'apps-script', 'Model.gs'));
    fs.mkdirSync(path.join(tmp, 'web', 'js', 'types'), { recursive: true });
    fs.copyFileSync(STARS, path.join(tmp, 'web', 'js', 'types', 'stars_1_10.js'));
    const index = path.join(tmp, 'web', 'index.html');
    fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/stars_1_10.js"></script>\n  <script defer src="js/app.js"></script>'));
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'flow.js'), 'types', '--write', '--root', path.join(tmp, 'web')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('node scripts/flow.js types --write failed on the copy: ' + r.stdout + r.stderr);
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
    vm.runInContext(fs.readFileSync(path.join(tmp, 'apps-script', 'Model.gs'), 'utf8'), ctx, { filename: 'Model.gs' });
    return JSON.parse(JSON.stringify(vm.runInContext('PP_SCREEN_TYPES', ctx)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(__dirname, 'shots');
const DL = path.join(__dirname, 'downloads');
fs.mkdirSync(SHOTS, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
fs.readdirSync(SHOTS).filter((f) => /^\d\d-/.test(f)).forEach((f) => fs.unlinkSync(path.join(SHOTS, f)));

const results = [];
const consoleProblems = [];
let page, browser, server, base, shotNo = 0;
/* While the Map step blocks the drawing library on purpose, Chrome reports the
   blocked download as a console error: that one is expected, nothing else. */
let expectBlockedCdn = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (name) => '[data-test="' + String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
function check(cond, msg) { if (!cond) throw new Error(msg); }

async function shot(name) {
  shotNo++;
  const file = path.join(SHOTS, String(shotNo).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  return file;
}
async function idle() {
  await page.waitForFunction(() => !window.__ppPending && !document.querySelector('[data-test="busy"]'), { timeout: 15000 });
  await sleep(120);
}
async function el(name, timeout) {
  const h = await page.waitForSelector(T(name), { visible: true, timeout: timeout || 6000 });
  await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  return h;
}
async function click(name) {
  const h = await el(name);
  for (let i = 0; i < 60; i++) {
    const free = await h.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === e || e.contains(top) || (e.labels && Array.prototype.some.call(e.labels, (l) => l.contains(top))) || (e.closest('label') && e.closest('label').contains(top)));
    });
    if (free) break;
    await sleep(100);
  }
  await h.click();
  await sleep(80);
}
async function typeInto(name, text, clear = true) {
  const h = await el(name);
  if (clear) {
    await h.evaluate((e) => { e.focus(); if (e.select) e.select(); });
    await page.keyboard.press('Backspace');
  } else {
    await h.focus();
  }
  if (text) await page.keyboard.type(text);
  await sleep(60);
}
async function select(name, value) { await el(name); await page.select(T(name), value); await sleep(120); }
async function text(name) { const h = await el(name); return h.evaluate((e) => e.innerText); }
async function value(name) { const h = await el(name); return h.evaluate((e) => e.value); }
async function exists(name) { return (await page.$(T(name))) !== null; }
async function statusText() { return page.$eval(T('save-status'), (e) => e.innerText); }
async function waitSaved() {
  await page.waitForFunction(() => /All changes saved/.test(document.querySelector('[data-test="save-status"]').innerText), { timeout: 15000 });
  await idle();
}
async function toastText() { return page.$$eval(T('toast'), (els) => els.map((e) => e.innerText).join(' | ')); }
async function control(what, body) {
  const res = await fetch(base + '/control/' + what, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return res.json();
}
async function serverState() { return control('state'); }
/* Every button, box, link and drop-down must carry its own data-test name. */
async function untested() {
  return page.evaluate(() => Array.from(document.querySelectorAll('button, input, select, textarea, a[href], summary'))
    .filter((e) => !e.getAttribute('data-test') && e.offsetParent !== null)
    .map((e) => e.outerHTML.slice(0, 90)));
}
async function checkTestNames(where) {
  const missing = await untested();
  check(!missing.length, where + ': controls without data-test: ' + missing.slice(0, 4).join(' | '));
}
async function waitForFile(name, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    const f = path.join(DL, name);
    if (fs.existsSync(f) && !fs.existsSync(f + '.crdownload')) return fs.readFileSync(f, 'utf8');
    await sleep(150);
  }
  throw new Error('download not found: ' + name);
}

let currentStep = '';
/* PP_STEPS=<words> runs only the steps whose name matches (a developer
   shortcut, for example PP_STEPS='route|Map|Try a path|Home: a red banner|PanelServer').
   A full run (no PP_STEPS) is the real result. */
const ONLY = process.env.PP_STEPS ? new RegExp(process.env.PP_STEPS, 'i') : null;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) { results.push(['SKIP', name]); return; }
  currentStep = name;
  const t0 = Date.now();
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS', name, '(' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log('FAIL', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    '));
    try { await shot('FAIL-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)); } catch (e2) { /* ignore */ }
    try {
      const diag = await page.evaluate(() => ({
        section: (document.querySelector('[aria-current="page"]') || {}).getAttribute && document.querySelector('[aria-current="page"]').getAttribute('data-test'),
        clicks: (window.__clicks || []).slice(-6),
        modals: document.querySelectorAll('#modal-root .backdrop').length,
        busy: !!document.querySelector('[data-test="busy"]'),
        active: document.activeElement && (document.activeElement.getAttribute('data-test') || document.activeElement.tagName)
      }));
      console.log('    diag:', JSON.stringify(diag));
    } catch (e4) { /* ignore */ }
    try {
      for (let i = 0; i < 3; i++) {
        const m = await page.$('#modal-root .backdrop');
        if (!m) break;
        await page.keyboard.press('Escape');
        await sleep(150);
      }
    } catch (e3) { /* ignore */ }
  }
}

async function openPanel() {
  await page.goto(base + '/panel', { waitUntil: 'load' });
  await page.waitForSelector(T('nav-home'), { visible: true, timeout: 10000 });
  await idle();
}

const Q = 'how_do_you_contact_support';

/* PanelServer.gs's new functions, run in Node with small stand-ins for the
   Code.gs helpers they use and for Google's UrlFetchApp / cache: the route code
   it hands the window, and its fingerprint of the form's route files (it must
   equal scripts/build_flow_gs.js's PP_FLOW_FINGERPRINT_ for the same files). */
function panelServerInNode(serve) {
  const flow = backend._internals.readFlowGs();
  const fetched = [];
  const cache = {};
  const ctx = vm.createContext({
    console: { log() {}, error() {} },
    PP_FLOW_SOURCE_: flow.source, PP_FLOW_FINGERPRINT_: flow.fingerprint,
    PP_requireAdminCaller_() {}, PP_permissionError_() { return null; }, PP_rawErrorText_(e) { return String(e && e.message || e); },
    PP_nowIso_() { return new Date().toISOString(); }, PP_text_(v) { return v === null || v === undefined ? '' : String(v); },
    PP_isPlainObject_(v) { return Object.prototype.toString.call(v) === '[object Object]'; },
    PP_own_(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k); },
    PP_cacheGetOrNull_(k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
    PP_cachePutSafely_(k, v) { cache[k] = v; },
    UrlFetchApp: {
      fetch(url) {
        fetched.push(url);
        const res = serve(url);
        return { getResponseCode: () => res.code, getContentText: () => res.text || '' };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(REPO, 'apps-script', 'PanelServer.gs'), 'utf8'), ctx, { filename: 'PanelServer.gs' });
  const call = (name, args) => JSON.parse(JSON.stringify(vm.runInContext(name, ctx).apply(null, args || [])));
  return { call, fetched, cache, fingerprint: flow.fingerprint, source: flow.source };
}

async function main() {
  await step('PanelServer.gs: the route code for the window, and the form fingerprint computed like build_flow_gs.js', async () => {
    const BASE = 'https://bench.example/form/';
    const files = {};
    ['flow.js', 'flow-panel.js', 'flow-check.js'].forEach((f) => { files[BASE + 'js/' + f] = fs.readFileSync(path.join(REPO, 'web', 'js', f), 'utf8'); });
    const same = panelServerInNode((url) => (files[url] !== undefined ? { code: 200, text: files[url] } : { code: 404 }));
    const code = same.call('panelFlowCode');
    check(code.source === same.source && code.fingerprint === same.fingerprint, 'panelFlowCode hands over Flow.gs\'s PP_FLOW_SOURCE_ and PP_FLOW_FINGERPRINT_');
    const build = require(path.join(REPO, 'scripts', 'build_flow_gs.js')).status(REPO);
    check(build.fresh, 'Flow.gs is up to date (node scripts/build_flow_gs.js)');
    const st = same.call('panelFlowStatus', [BASE]);
    check(st.same === true && st.form === build.fingerprint && st.panel === build.fingerprint, 'the repo\'s own files give the panel\'s fingerprint: ' + JSON.stringify(st));
    check(same.fetched.length === 3 && same.fetched[0] === BASE + 'js/flow.js', 'three files read, flow.js first: ' + same.fetched.join(', '));
    same.call('panelFlowStatus', [BASE]);
    check(same.fetched.length === 3, 'the answer is remembered (no new fetches): ' + same.fetched.length);
    check(/^form_flow_fp:https:\/\/bench\.example\/form\/$/.test(Object.keys(same.cache)[0] || ''), 'cache key: ' + Object.keys(same.cache).join(', '));
    const edited = Object.assign({}, files);
    edited[BASE + 'js/flow-check.js'] = files[BASE + 'js/flow-check.js'] + '\n// another version\n';
    const other = panelServerInNode((url) => (edited[url] !== undefined ? { code: 200, text: edited[url] } : { code: 404 }));
    const st2 = other.call('panelFlowStatus', [BASE]);
    check(st2.same === false && st2.form !== build.fingerprint, 'another flow-check.js: the fingerprints differ: ' + JSON.stringify(st2));
    const expected = crypto.createHash('sha256').update(Buffer.from(edited[BASE + 'js/flow.js'] + edited[BASE + 'js/flow-panel.js'] + edited[BASE + 'js/flow-check.js'], 'utf8')).digest('hex');
    check(st2.form === expected, 'SHA-256 of the three files one after the other: ' + st2.form + ' vs ' + expected);
    const older = panelServerInNode((url) => (/flow-check\.js$/.test(url) ? { code: 404 } : { code: 200, text: files[url] }));
    const st3 = older.call('panelFlowStatus', [BASE]);
    check(st3.same === false && /answered 404/.test(st3.problem), 'a form without flow-check.js is older: different: ' + JSON.stringify(st3));
    const down = panelServerInNode(() => ({ code: 503 }));
    const st4 = down.call('panelFlowStatus', [BASE]);
    check(st4.same === null && st4.form === null && down.fetched.length === 1, 'an unreachable form: no answer (no banner): ' + JSON.stringify(st4));
    const bad = panelServerInNode(() => ({ code: 200, text: '' }));
    check(bad.call('panelFlowStatus', ['http://not-https/']).same === null && bad.fetched.length === 0, 'a form address that is not https://…/ is never fetched');
  });

  server = await start(0);
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--no-default-browser-check'] });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(base, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (expectBlockedCdn && /ERR_BLOCKED_BY_CLIENT/.test(m.text())) return;
    consoleProblems.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => consoleProblems.push('pageerror: ' + e.message));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('    [navigated]', f.url().slice(0, 80), 'during:', currentStep); });
  page.on('error', (e) => console.log('    [page crashed]', e.message, 'during:', currentStep));
  page.on('close', () => console.log('    [page closed] during:', currentStep));
  page.on('framedetached', (f) => console.log('    [frame detached]', f.url().slice(0, 60), 'during:', currentStep));
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) console.log('    [request failed]', r.url().slice(0, 80), r.failure() && r.failure().errorText, 'during:', currentStep); });
  page.on('dialog', (d) => {
    console.log('    [dialog]', d.type(), JSON.stringify(d.message()), 'during:', currentStep);
    if (d.type() === 'beforeunload') { d.accept(); return; }
    consoleProblems.push('unexpected browser dialog: ' + d.type() + ' ' + d.message());
    d.dismiss();
  });
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    window.__clicks = [];
    document.addEventListener('click', (e) => {
      const t = e.target.closest ? e.target.closest('[data-test]') : null;
      window.__clicks.push((t ? t.getAttribute('data-test') : e.target.tagName) + (e.isTrusted ? '' : ' (script)'));
    }, true);
  });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  await step('loads and shows Home', async () => {
    await openPanel();
    check(/All changes saved/.test(await statusText()), 'status should say All changes saved');
    check(/Nothing published yet/.test(await text('live-badge')), 'live badge');
    check(/Nothing is published yet/.test(await text('banner')), 'banner');
    check(/Translations to finish/.test(await text('home-next')), 'next steps mention translations');
    const next = await text('home-next');
    check(/web app address isn.t recorded/.test(next) && !/not deployed/i.test(next), 'web app hint says "not recorded", never "not deployed": ' + next);
    const fit = await page.evaluate(() => ({ host: window.__ppHost, ah: screen.availHeight, aw: screen.availWidth }));
    check(fit.host.height === Math.max(420, Math.min(760, fit.ah - 200)) && fit.host.width === Math.max(720, Math.min(1100, fit.aw - 80)),
      'window sized to the screen: ' + JSON.stringify(fit));
    await shot('home');
  });

  await step('visits every section', async () => {
    for (const s of ['questions', 'areas', 'support', 'texts', 'look', 'rounds', 'links', 'publish', 'settings', 'home']) {
      await click('nav-' + s);
      await idle();
      const cur = await page.$eval('[aria-current="page"]', (e) => e.getAttribute('data-test'));
      check(cur === 'nav-' + s, 'nav highlight for ' + s + ' was ' + cur);
      await checkTestNames(s);
    }
  });

  /* ---------------- Questions ---------------- */
  await step('adds a "Pick one answer" question', async () => {
    await click('nav-questions');
    await shot('questions-list');
    await click('add-question');
    await el('add-question-modal');
    await click('type-pick-single_choice');
    await typeInto('new-question-text', 'How do you contact support?');
    check((await text('new-question-code')).includes(Q), 'code preview shows ' + Q);
    await select('new-question-after', '6');
    const after = await page.$$eval(T('new-question-after') + ' option', (os) => os.map((o) => o.textContent));
    check(after.indexOf('4. Area ratings (one screen per area)') !== -1 && after.indexOf('1. Language buttons') !== -1 &&
      after.some((t) => /^7\. Support ratings \(all support questions on one screen\)$/.test(t)) && after.some((t) => /^3\. How likely/.test(t)),
      '"Put it after" lists built-in blocks by card name: ' + after.join(' / '));
    await checkTestNames('add-question pop-up');
    await shot('add-question-modal');
    await click('new-question-create');
    await el('editor-text-card');
    check((await text('editor-text-card')).length > 0, 'editor shows');
    check(/Question 8/.test(await page.$eval('.editor-head h1', (e) => e.innerText)), 'new question is number 8');
    check(/All changes saved/.test(await statusText()) === false, 'status should be Unsaved changes');
    check(/Unsaved changes/.test(await statusText()), 'status Unsaved changes');
  });

  await step('edits the question: Hindi text, answers, required', async () => {
    await typeInto('editor-text-hi', 'आप सपोर्ट से कैसे संपर्क करते हैं?');
    for (const [label, code] of [['Phone call', 'phone_call'], ['WhatsApp', 'whatsapp'], ['Email', 'email']]) {
      await click('option-add');
      await typeInto('option-new-text', label);
      check((await text('option-new-text-code')).includes(code), 'option code ' + code);
      await click('option-add-confirm');
      await el('option-' + code);
    }
    await typeInto('option-whatsapp-hi', 'व्हाट्सऐप');
    await click('option-up-email');
    const order = await page.$$eval('[data-test^="option-"][class*="option-row"]', (els) => els.map((e) => e.getAttribute('data-test')));
    check(order.join(',') === 'option-phone_call,option-email,option-whatsapp', 'option order after move: ' + order);
    await click('editor-required');
    check(/Skip button/.test(await page.$eval(T('editor-required'), (e) => e.closest('label').innerText)), 'required off text');
  });

  await step('builds a rule with the rule builder', async () => {
    await click('rule-mode-if');
    await el('rule-cond-0');
    await select('rule-answer-0', 'support_gate');
    let sentence = await text('rule-sentence');
    check(/In the last 30 days, did you contact/.test(sentence) && /is “Yes”/.test(sentence), 'sentence for support_gate: ' + sentence);
    await click('rule-add');
    await el('rule-cond-1');
    await select('rule-answer-1', 'fn_rating:payments');
    await select('rule-test-1', 'in');
    await click('rule-value-1-1');
    await select('rule-combine', 'any');
    await checkTestNames('question editor');
    sentence = await text('rule-sentence');
    check(/Payments \/ Payouts/.test(sentence) && / or /.test(sentence) && /1 \(Very bad\)/.test(sentence) && /2 \(Bad\)/.test(sentence), 'combined sentence: ' + sentence);
    const answerOptions = await page.$$eval(T('rule-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(answerOptions.some((t) => /^Rating of Payments/.test(t)) && answerOptions.some((t) => /^Main problem in Payments/.test(t)) &&
      answerOptions.some((t) => /^Support: Kept me updated/.test(t)) && answerOptions.some((t) => /^How likely are you to recommend/.test(t)), 'readable answer names: ' + answerOptions.join(' / '));
    check(!answerOptions.some((t) => /One fix/i.test(t) || /If Valmo could fix/.test(t)), 'later questions are not offered');
    await shot('question-editor-rule');
  });

  await step('rule badge, move up/down, rule problem badge', async () => {
    await click('editor-back');
    await el('screen-card-' + Q);
    check(/Only if/.test(await text('screen-rule-' + Q)), 'Only if badge');
    check(/Optional/.test(await text('screen-card-' + Q)), 'Optional badge after required off');
    await click('screen-up-' + Q);
    await click('screen-up-' + Q);
    await click('screen-up-' + Q);
    check(await exists('screen-rule-problem-' + Q), 'rule problem badge when moved above support_gate');
    await shot('questions-rule-problem');
    await click('screen-down-' + Q);
    await click('screen-down-' + Q);
    await click('screen-down-' + Q);
    check(!(await exists('screen-rule-problem-' + Q)), 'no rule problem after moving back');
    const ids = await page.$$eval('[data-test^="screen-card-"]', (els) => els.map((e) => e.getAttribute('data-test').slice(12)));
    check(ids.indexOf(Q) === 7 && ids[ids.length - 1] === 'thanks', 'order: ' + ids.join(','));
    check(await page.$eval(T('screen-down-one_fix'), (e) => e.getAttribute('aria-disabled') === 'true'), 'nothing can move below thank-you');
  });

  await step('hides and shows a question', async () => {
    await click('screen-toggle-' + Q);
    check(/Hidden/.test(await text('screen-card-' + Q)), 'Hidden badge');
    check(await page.$eval(T('screen-card-' + Q), (e) => e.classList.contains('is-hidden')), 'card looks hidden');
    await click('screen-toggle-' + Q);
    check(!/Hidden:/.test(await text('screen-card-' + Q)), 'shown again');
    await click('screen-toggle-thanks');
    check(/can.t be hidden/.test(await toastText()), 'thank-you explains why it cannot be hidden');
  });

  await step('adds, deletes (with confirmation), undoes and deletes an info card', async () => {
    await click('add-question');
    await click('type-pick-info_card');
    await typeInto('new-question-text', 'A quick note before the last question');
    await click('new-question-create');
    await el('editor-body-toggle');
    await click('editor-body-toggle');
    await typeInto('editor-body-en', 'It takes one minute.');
    await click('editor-back');
    const id = 'a_quick_note_before_the_last_question';
    await el('screen-card-' + id);
    await click('screen-delete-' + id);
    await el('confirm-delete-screen');
    await shot('confirm-delete');
    await click('modal-confirm');
    await sleep(200);
    check(!(await exists('screen-card-' + id)), 'deleted');
    await click('toast-undo');
    await el('screen-card-' + id);
    await click('screen-delete-' + id);
    await click('modal-confirm');
    await sleep(150);
    check(!(await exists('screen-card-' + id)), 'deleted again');
    check(await page.$eval(T('screen-delete-nps'), (e) => e.getAttribute('aria-disabled') === 'true'), 'nps can never be deleted: it fills the nps column (21 Oct decision)');
    check(await page.$eval(T('screen-delete-fn_ratings'), (e) => e.getAttribute('aria-disabled') === 'true'), 'built-in cannot be deleted');
  });

  /* ---------------- Areas ---------------- */
  await step('adds an area and a problem; warning chip', async () => {
    await click('nav-areas');
    await click('area-add');
    await typeInto('area-new-name', 'Returns');
    check((await text('area-new-code')).includes('returns'), 'area code');
    await typeInto('area-new-help', 'Return pickups and RTO shipments');
    await click('area-new-create');
    await el('area-card-returns');
    await click('chip-add-returns');
    await typeInto('chip-new-text', 'Pickup missed');
    await click('chip-new-create');
    await el('chip-returns-pickup_missed');
    check(/Only 1 problem/.test(await text('chip-warning-returns')), 'warning chip');
    await typeInto('area-name-returns-hi', 'रिटर्न');
    await typeInto('chip-label-returns-pickup_missed-hi', 'पिकअप नहीं हुआ');
    await select('area-threshold-returns', '2');
    await checkTestNames('expanded area');
    await shot('areas-new-area');
    await click('chip-active-returns-pickup_missed');
    check(/Hidden/.test(await text('chip-returns-pickup_missed')), 'chip hidden');
    await click('chip-active-returns-pickup_missed');
    await click('area-up-returns');
    const ids = await page.$$eval('[data-test^="area-card-"]', (els) => els.map((e) => e.getAttribute('data-test').slice(10)));
    check(ids.join(',') === 'losses,payments,linehaul,consumables,orders,returns,app', 'area order: ' + ids);
    check(/Other/.test(await text('chip-other-returns')), 'fixed Other chip');
  });

  await step('changes an area\'s code (texts, problems and rules follow), then changes it back', async () => {
    await click('area-rename-returns');
    await el('code-modal');
    await typeInto('code-new', 'returns_rto');
    await click('code-confirm');
    await el('area-card-returns_rto');
    await el('chip-returns_rto-pickup_missed');
    check((await value('area-name-returns_rto-hi')) === 'रिटर्न', 'Hindi name followed the new code');
    await click('area-rename-returns_rto');
    await typeInto('code-new', 'Returns!');
    await click('code-confirm');
    check(/lower-case letters/.test(await text('code-modal')), 'bad code explained');
    await typeInto('code-new', 'returns');
    await click('code-confirm');
    await el('area-card-returns');
    await el('chip-returns-pickup_missed');
  });

  /* ---------------- Support ---------------- */
  await step('support: add item, Doesn\'t apply, comment text', async () => {
    await click('nav-support');
    await click('support-add');
    await typeInto('support-new-text', 'Easy to reach');
    await click('support-new-create');
    await el('support-item-easy_to_reach');
    await click('support-na-toggle');
    await el('support-na-label-en');
    await typeInto('support-comment-text-en', 'Anything else about support? (optional)');
    await click('support-down-agent_behaviour');
    await shot('support');
  });

  /* ---------------- Texts ---------------- */
  await step('texts: translate and see progress update', async () => {
    await click('nav-texts');
    await select('texts-lang', 'ta');
    const before = await text('progress-text-ta');
    const m1 = /Tamil: (\d+) of (\d+) done/.exec(before);
    check(m1, 'progress text format: ' + before);
    await click('texts-only-todo');
    await typeInto('texts-search', 'q.nps');
    await el('text-row-q.nps');
    await typeInto('text-val-q.nps', 'வால்மோவை பரிந்துரைக்க எவ்வளவு வாய்ப்பு?');
    const after = await text('progress-text-ta');
    const m2 = /Tamil: (\d+) of (\d+) done/.exec(after);
    check(Number(m2[1]) === Number(m1[1]) + 1, 'progress went up by one: ' + before + ' -> ' + after);
    await typeInto('texts-search', 'seconds_left');
    await el('text-row-voice.seconds_left');
    await typeInto('text-val-voice.seconds_left', 'மீதம் வினாடிகள்');
    const warnText = await page.$eval(T('text-row-voice.seconds_left'), (e) => e.innerText);
    check(/Keep \{s\}/.test(warnText), 'placeholder warning shown: ' + warnText);
    await typeInto('text-val-voice.seconds_left', '{s} வினாடிகள் மீதம்');
    check(!/Keep \{s\}/.test(await page.$eval(T('text-row-voice.seconds_left'), (e) => e.innerText)), 'warning gone');
    await click('texts-explain-toggle');
    await typeInto('texts-search', '');
    await shot('texts');
  });

  /* ---------------- Look & feel ---------------- */
  await step('look & feel: colour and faces update the preview', async () => {
    await click('nav-look');
    await typeInto('color-hex-primary', '#0B6E4F');
    const bg = await page.$eval(T('preview-next'), (e) => getComputedStyle(e).backgroundColor);
    check(bg === 'rgb(11, 110, 79)', 'preview button colour: ' + bg);
    await typeInto('face-1', '😡');
    check((await text('preview-card')).includes('😡'), 'preview face');
    await typeInto('brand-name-en', 'Valmo Partner Pulse');
    await select('preview-lang', 'hi');
    check((await text('preview-card')).includes('आगे'), 'preview in Hindi');
    await typeInto('color-hex-error', '#B3261');
    check(await page.$eval(T('color-hex-error'), (e) => e.classList.contains('is-invalid')), 'bad colour flagged');
    await typeInto('color-hex-error', '#B3261E');
    await shot('look');
  });

  /* ---------------- Save ---------------- */
  await step('saves everything; server applies translation helpers', async () => {
    await click('save');
    await waitSaved();
    const st = await serverState();
    const m = st.model;
    check(st.revision === 2, 'revision 2, got ' + st.revision);
    check(m.screens.some((s) => s.id === Q && s.options.join(',') === 'phone_call,email,whatsapp' && s.required === false), 'question saved');
    check(m.screens.find((s) => s.id === Q).show_if.any.length === 2, 'rule saved');
    check(m.areas.map((a) => a.id).join(',') === 'losses,payments,linehaul,consumables,orders,returns,app', 'areas order saved');
    check(m.areas.find((a) => a.id === 'returns').threshold === 2, 'threshold saved');
    check(m.texts['issue.returns.pickup_missed'].ta === '[TRANSLATE] Pickup missed', 'translation helper filled Tamil');
    check(m.texts['q.nps'].ta.startsWith('வால்மோ'), 'Tamil translation saved');
    check(m.settings['branding.colors.primary'] === '#0B6E4F', 'colour saved');
    check(m.settings['rating.faces'].split(' ')[0] === '😡', 'faces saved');
    check(m.support.map((x) => x.code).join(',') === 'understood_problem,agent_behaviour,time_to_resolve,kept_updated,easy_to_reach', 'support order: ' + m.support.map((x) => x.code));
    check(m.settings['support.allow_not_applicable'] === true, 'support NA saved');
    check(!m.screens.some((s) => s.id === 'a_quick_note_before_the_last_question') && !m.texts['q.a_quick_note_before_the_last_question'], 'deleted card and its texts are gone');
    await sleep(500);
    check(/All changes saved/.test(await statusText()), 'still saved after background refresh');
  });

  /* ---------------- Rounds ---------------- */
  await step('rounds: new round, open it (saves first), DEMO warning', async () => {
    await click('nav-rounds');
    await click('round-new');
    check((await value('round-new-id')) === '2026-R2', 'suggested id 2026-R2, got ' + (await value('round-new-id')));
    await typeInto('round-new-notes', 'Bench round');
    await click('round-new-create');
    await el('round-row-2026-R2');
    check(/Not saved yet/.test(await text('round-row-2026-R2')), 'not saved badge');
    await click('nav-home');
    check(/Save first to see numbers/.test(await text('counts-2026-R2')), 'home explains numbers need a save');
    await click('nav-rounds');
    await click('round-open-2026-R2');
    check(/saved first/.test(await text('confirm-round-status')), 'confirmation mentions saving first');
    check(/Nothing has been published yet, so partners will get the copy of the questionnaire stored in GitHub/.test(await text('round-open-not-live')), 'says partners get the GitHub copy');
    check((await text('round-publish-first')) === 'Publish first' && (await text('modal-confirm')) === 'Open anyway', 'Publish first / Open anyway');
    await click('modal-confirm');
    await idle();
    await el('round-close-2026-R2', 8000);
    check(/Answers sheet/.test(await text('round-row-2026-R2')), 'data sheet link');
    check(/All changes saved/.test(await statusText()), 'saved');
    await click('round-open-DEMO-R1');
    check(/demo round with fake content/.test(await text('confirm-round-status')), 'strong DEMO warning');
    await shot('rounds-demo-warning');
    await click('modal-confirm');
    check(await exists('confirm-round-status'), 'needs the tick');
    await click('round-demo-confirm');
    await click('modal-confirm');
    await idle();
    await el('round-close-DEMO-R1', 8000);
    await click('round-close-DEMO-R1');
    await click('modal-confirm');
    await idle();
    await page.waitForFunction(() => /Closed/.test(document.querySelector('[data-test="round-row-DEMO-R1"]').innerText), { timeout: 8000 });
    const st = await serverState();
    check(st.model.rounds.find((r) => r.id === '2026-R2').status === 'open' && st.model.rounds.find((r) => r.id === 'DEMO-R1').status === 'closed', 'statuses on server');
  });

  /* 21 Oct 2026 (the contract writer's finding): 2026-R2 was opened with "Open anyway" before
     anything was published, so partners answer with the form's own copy, whose codes the panel
     can't see. Every existing code stays locked until the first publish. */
  await step('a real round opened before anything is published keeps every code locked, and a note says why', async () => {
    await click('nav-questions');
    check(/^A real round has been opened, but nothing has been published yet/.test(await text('codes-unpublished-note')), 'note in Questions: ' + (await text('codes-unpublished-note')));
    check(!(await exists('codes-unknown-note')) && !(await exists('codes-unlocked-note')), 'only this note');
    check(await page.$eval(T('screen-delete-one_fix'), (e) => e.getAttribute('aria-disabled') === 'true'), 'a question cannot be deleted');
    await click('nav-areas');
    check(await exists('codes-unpublished-note'), 'the note in Areas & problems too');
    check(await page.$eval(T('area-delete-losses'), (e) => e.getAttribute('aria-disabled') === 'true'), 'an area cannot be deleted');
    await shot('fix-codes-unpublished');
    await click('nav-rounds');   // the next step goes on in Rounds
  });

  await step('rounds: what changed bullets (add, reorder, remove)', async () => {
    await select('wc-round', '2026-R2');
    await click('wc-add');
    await typeInto('wc-item-0-en', 'The payout breakup is now shown line by line.');
    await click('wc-add');
    await typeInto('wc-item-1-en', 'Debit disputes get a first reply within 48 hours.');
    await typeInto('wc-item-1-hi', 'डेबिट डिस्प्यूट का पहला जवाब अब 48 घंटों में मिलता है।');
    await click('wc-down-0');
    check((await value('wc-item-0-en')).startsWith('Debit'), 'reordered');
    await page.$eval(T('round-opens-2026-R2'), (e) => { e.value = '2026-10-21'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await shot('rounds-whats-changed');
    await click('wc-remove-1');
    await click('modal-confirm');
    await sleep(150);
    check(!(await exists('wc-item-1')), 'removed');
    check(/publish/i.test(await text('wc-card')), 'reminder about publishing');
  });

  /* ---------------- Links ---------------- */
  await step('links: make, download CSV, copy, find one DC, regenerate all', async () => {
    await click('nav-links');
    await select('links-round', '2026-R2');
    check(/38 active DCs/.test(await text('links-dc-count')), 'active DC count');
    await click('links-generate');
    await idle();
    await el('links-result');
    check(/^2\. Links for 2026-R2/.test(await page.$eval(T('links-result') + ' h2', (e) => e.innerText)), 'result titled with the round');
    check((await text('links-download')) === 'Download the 2026-R2 links (CSV)', 'download button names the round: ' + (await text('links-download')));
    check(/Links for 2026-R2 ready/.test(await toastText()), 'toast names the round: ' + (await toastText()));
    check((await text('links-created')).startsWith('36'), 'created 36: ' + (await text('links-created')));
    check((await text('links-skipped')).startsWith('2'), 'skipped 2');
    check(/DC DEMO 041/.test(await text('links-skipped-list')), 'skip reason listed');
    await checkTestNames('links result');
    await click('links-download');
    const csv = await waitForFile('partner-pulse-links-2026-R2.csv');
    const lines = csv.replace(/^﻿/, '').trim().split('\n');
    check(lines[0] === 'dc_id,dc_name,state,region,language,link' && lines.length === 37, 'csv header and rows: ' + lines.length);
    check(/[?&]t=[A-Za-z0-9_-]{22}&round=2026-R2/.test(lines[1]), 'csv link format');
    await click('links-copy');
    await sleep(300);
    check(/copied/.test(await toastText()), 'copied toast');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip.startsWith('dc_id,dc_name'), 'clipboard has the csv');
    await typeInto('links-search', 'DEMO-003');
    await el('links-found-DC-DEMO-003');
    await click('links-copy-one-DC-DEMO-003');
    await shot('links-result');
    await click('links-mode-all');
    await click('links-generate');
    await idle();
    check((await text('links-updated')).startsWith('36') && (await text('links-created')).startsWith('0'), 'regenerate all updates');
  });

  await step('links: show the secret only after typing SHOW', async () => {
    await click('links-secret-show');
    await click('secret-confirm');
    check(!(await exists('secret-value')), 'no secret without SHOW');
    await typeInto('secret-confirm-input', 'SHOW');
    await click('secret-confirm');
    await el('secret-value');
    check((await value('secret-value')) === backend.state.secret, 'secret shown');
    await shot('links-secret');
    await click('modal-cancel');
  });

  /* ---------------- Publish ---------------- */
  await step('publish: problems block publishing, "Go there" opens the item', async () => {
    await click('nav-questions');
    await click('screen-edit-' + Q);
    await typeInto('editor-text-en', '');
    await click('nav-publish');
    await click('check');
    await idle();
    check(/problem/.test(await text('check-errors-count')), 'errors shown');
    await shot('publish-check-errors');
    const errors = await page.$$eval('[data-test^="issue-error-"]', (els) => els.filter((e) => /^issue-error-\d+$/.test(e.getAttribute('data-test'))).map((e) => e.innerText));
    const i = errors.findIndex((t) => t.includes(Q) || /(screen|question) 8\b/.test(t));
    check(i !== -1, 'an error points at the emptied question: ' + errors.join(' | '));
    check(!errors.some((t) => /› screen \d+/.test(t)), 'the problem list says "question N" like the messages, never "screen N": ' + errors.join(' | '));
    await click('issue-goto-error-' + i);
    await sleep(200);
    if (await exists('editor-text-en')) {
      check((await page.$eval('.editor-head', (e) => e.innerText)).includes(Q), 'opened the right question');
      await typeInto('editor-text-en', 'How do you contact support?');
    } else {
      await el('text-row-q.' + Q);
      check(await page.$eval('[aria-current="page"]', (e) => e.getAttribute('data-test')) === 'nav-texts', 'opened Texts');
      await typeInto('text-en-q.' + Q, 'How do you contact support?');
    }
    await click('publish');
    await el('publish-modal');
    await click('modal-cancel');
    await sleep(200);
    await idle();
    check(/No problems/.test(await text('check-errors-count')), 'no problems now');
    check(/All changes saved/.test(await statusText()), 'publish saved first');
  });

  /* 21 Oct 2026 (STATE item 8): a question whose own words contain "rule" must not send "Go there" to the rule editor. */
  await step('"Go there" decides by the problem, not by the question\'s own words', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Panel.html'), 'utf8');
    const m = /function isRuleIssue\(it\) \{[\s\S]*?\n  \}/.exec(src);
    check(!!m, 'isRuleIssue is in Panel.html');
    const isRuleIssue = new Function(m[0] + '\nreturn isRuleIssue;')();
    check(isRuleIssue({ ref: 'screen 3', message: 'Question 3 ("Do the payout rules work for you?") is a "pick one" question with no answers to pick from.' }) === false,
      'a problem with a question whose words contain "rule" opens the question, not the rule');
    check(isRuleIssue({ ref: 'screen 3', message: 'Question 3 ("How likely are you to recommend Valmo?"): the rule tests an answer that does not exist.' }) === true, 'a rule problem opens the rule');
    check(isRuleIssue({ ref: 'screen 3', message: 'Question 3 has a rule ("Show this question only if…"), which has no use there.' }) === true, 'the "rule has no use there" warning opens the rule');
    /* 26 Oct 2026 (review finding 11 / G11): a problem with where a question goes opens "After this question". */
    const mj = /function isJumpIssue\(it\) \{[\s\S]*?\n  \}/.exec(src);
    check(!!mj, 'isJumpIssue is in Panel.html');
    const isJumpIssue = new Function(mj[0] + '\nreturn isJumpIssue;')();
    check(isJumpIssue({ ref: 'screen 3', message: 'Question 3 ("How likely are you to recommend Valmo?"): its jump to "one_fix": this question\'s answer can only be a whole number from 0 to 10, so 11 can never match. (Its code is "nps".)' }) === true,
      'a jump\'s rule problem opens After this question');
    check(isJumpIssue({ ref: 'screen 3', message: 'Question 3 ("How likely?"): jump 1 goes to question 10 ("Thanks"), an ending that is hidden, so partners end at the main thank-you screen (question 9) instead.' }) === true, 'a jump to a hidden ending');
    check(isJumpIssue({ ref: 'screen 10', message: 'Question 10 ("What do you like most?") has no "usually go to", so partners who answer it go straight on to question 11 ("What went wrong?"), which starts another route (question 3 jumps there).' }) === true,
      'a route running on into another');
    check(isJumpIssue({ ref: 'screen 3', message: 'Question 3 ("Where do our jump trucks go next?"): the rule tests an answer that does not exist.' }) === false, 'the question\'s own words never decide');
    check(isJumpIssue({ ref: 'screen 7', message: 'Question 7 ("How was it?") can never be reached: no arrow leads to it from the start. Point the "usually go to" of an earlier screen at it, or remove it.' }) === false,
      '"nothing leads here" is fixed on an earlier screen, not in this one\'s After this question');
    check(isJumpIssue({ ref: 'screen 6', message: 'Question 6 ("Did you call?"): its rule ("show only if") tests its own answer: a screen cannot depend on its own answer. Test an earlier answer, or add a jump to this question instead (After this question > Add a jump).' }) === false &&
      isRuleIssue({ ref: 'screen 6', message: 'Question 6 ("Did you call?"): its rule ("show only if") tests its own answer: a screen cannot depend on its own answer.' }) === true, 'a rule that suggests a jump still opens the rule');
  });

  await step('publish: version 1 goes live', async () => {
    await typeInto('publish-note', 'First version from the bench');
    await click('publish-go');
    await el('publish-modal');
    check((await value('publish-note-modal')) === 'First version from the bench', 'note carried into the dialog');
    await shot('publish-modal');
    await click('publish-confirm');
    await el('published-modal', 10000);
    await click('published-ok');
    await idle();
    check(/Live: version 1, published/.test(await text('live-badge')), 'live badge: ' + (await text('live-badge')));
    await el('history-row-1');
    check(await exists('history-live-1'), 'history live badge');
    check(!(await exists('banner')) || !/changes they don/.test(await text('banner')), 'no "draft differs" banner right after publishing');
    await shot('publish-history');
  });

  await step('live codes are locked after publishing', async () => {
    await click('nav-areas');
    check(await page.$eval(T('area-delete-losses'), (e) => e.getAttribute('aria-disabled') === 'true'), 'live area cannot be deleted');
    await click('area-delete-losses');
    check(/live/i.test(await toastText()), 'explains why');
    check(!(await exists('codes-unlocked-note')), 'no "codes lock when the first round opens" note once a round opened');
    await click('nav-questions');
    check(/🔒/.test(await text('screen-card-nps')), 'lock icon on live code');
    check(!(await exists('codes-unlocked-note')), 'no unlocked-codes note in Questions either');
    check(!(await exists('codes-unpublished-note')), 'the "nothing published yet" note is gone after publishing');
    await click('screen-edit-' + Q);
    check(!(await exists('screen-rename')), 'no Change code on a live question');
    await click('editor-back');
  });

  /* 26 Oct 2026 (review finding 4): an answer partners picked can't be hidden, so it must stay. */
  await step('a live answer of a pick-one question can\'t be removed: the panel says why, and its label can still be reworded', async () => {
    await click('nav-questions');
    await click('screen-edit-' + Q);
    await el('option-phone_call');
    check(await page.$eval(T('option-remove-phone_call'), (e) => e.getAttribute('aria-disabled') === 'true'), 'Remove is locked for a live answer');
    await click('option-remove-phone_call');
    check(/Partners already picked this answer in a real round, so it must stay: an answer can’t be removed or hidden/.test(await toastText()), 'says why: ' + (await toastText()));
    check(!(await exists('confirm-remove-option')) && (await exists('option-phone_call')), 'nothing is removed');
    check(await exists('option-phone_call-en'), 'its label can still be reworded');
    await click('editor-back');
  });

  /* 21 Oct 2026: codes are locked, but Google Drive had a passing problem reading the live version. */
  await step('when the live version can\'t be read, every code stays locked and a note says why', async () => {
    await control('live_unknown', { on: true });
    await openPanel();
    await click('nav-areas');
    check(/passing problem reading the live version/.test(await text('codes-unknown-note')), 'note in Areas & problems: ' + (await text('codes-unknown-note')));
    check(await page.$eval(T('area-delete-losses'), (e) => e.getAttribute('aria-disabled') === 'true'), 'a live area still cannot be deleted (the server sent no live codes)');
    await click('nav-questions');
    check(await exists('codes-unknown-note'), 'the note is in Questions too');
    await shot('fix-codes-unknown');
    await control('live_unknown', { on: false });
    await openPanel();
    await click('nav-questions');
    check(!(await exists('codes-unknown-note')), 'the note goes once the live version can be read');
  });

  await step('second publish from the top bar, then restore version 1', async () => {
    await click('nav-look');
    await typeInto('brand-name-en', 'Valmo Partner Pulse 2');
    check(/Unsaved changes/.test(await statusText()), 'dirty');
    await click('publish');
    await el('publish-modal', 10000);
    await typeInto('publish-note-modal', 'Renamed the product');
    await click('publish-confirm');
    await el('published-modal', 10000);
    await click('published-ok');
    await idle();
    check(/Live: version 2/.test(await text('live-badge')), 'version 2 live');
    await el('history-row-2');
    await click('history-restore-1');
    await el('confirm-restore');
    check(/kept, switched off\. “What changed” bullets of rounds that version 1 doesn’t have are deleted\.$/.test(await text('restore-kept-dropped')), 'Restore says what is kept and dropped: ' + (await text('restore-kept-dropped')));
    await click('modal-confirm');
    await idle();
    check(/Version 1 is now your draft/.test(await toastText()), 'restore toast');
    const st = await serverState();
    check(st.model.texts['brand.name'].en === 'Valmo Partner Pulse', 'brand name restored on server');
    check(/changes they don/.test(await text('banner')), 'draft differs banner after restore');
  });

  await step('export: the four files and docs/flow.md for the GitHub copy', async () => {
    await click('nav-publish');
    await click('export');
    await idle();
    /* Since 26 Oct 2026 (review finding 10) the copy brings docs/flow.md, the map of the route (with the real Model.gs). */
    const names = REAL ? ['survey.json', 'strings.json', 'whats_changed.json', 'audio_clips.json', 'flow.md'] : ['survey.json', 'strings.json', 'whats_changed.json', 'audio_clips.json'];
    if (REAL) check(/flow\.md\s*goes to docs\/flow\.md/.test(await text('export-files')), 'flow.md is listed with where it goes: ' + (await text('export-files')));
    for (const f of names) {
      await click('export-file-' + f);
      if (f === 'survey.json') {
        /* 21 Oct: no web app address yet, so taking survey.json asks first; Cancel takes nothing. */
        await el('confirm-export-test-mode');
        check(/keeps the form in test mode/.test(await text('confirm-export-test-mode')) && (await text('modal-confirm')) === 'Take it anyway', 'asks before a test-mode survey.json: ' + (await text('confirm-export-test-mode')));
        await click('modal-cancel');
        await sleep(400);
        check(!fs.existsSync(path.join(DL, 'survey.json')), 'Cancel downloads nothing');
        await click('export-file-' + f);
        await el('confirm-export-test-mode');
        await click('modal-confirm');
      }
      await waitForFile(f);
    }
    const surveyText = fs.readFileSync(path.join(DL, 'survey.json'), 'utf8');
    const survey = JSON.parse(surveyText);
    check(survey.backend.mode === 'mock' && survey.backend.apps_script_url === '', 'survey.json content (no web app address yet: test mode, passes the settings check)');
    /* Since stage 4 (26 Oct 2026) the GitHub copy carries the route as the graph, laid out exactly
       as the repo's survey.json is once converted ("python3 scripts/flow.py migrate --write"). The
       bench's draft differs from the repo's content here; its byte-for-byte comparison is made on a
       fresh Sheet below ("web app address: …"). */
    check(survey.flow && survey.flow.format === 'pp-flow/1' && survey.flow._help === FLOW_PANEL.FLOW_HELP, 'the route is the graph, with its own note: ' + JSON.stringify(survey.flow && survey.flow.format));
    check(FLOW_PANEL.surveyTextWithFlow(surveyText, JSON.parse(JSON.stringify(survey.flow))) === surveyText, 'the route is laid out exactly as formatFlow writes it (the repo\'s layout)');
    const repoKeys = Object.keys(JSON.parse(repoSurveyAsGraph()));
    check(JSON.stringify(Object.keys(survey)) === JSON.stringify(repoKeys), 'the same top-level entries, in the same order, as the repo\'s survey.json (as a graph): ' + Object.keys(survey).join(','));
    check(/keeps the form in test mode/.test(await text('export-warning')), 'the export warning is shown: ' + (await text('export-warning')));
    const strings = JSON.parse(fs.readFileSync(path.join(DL, 'strings.json'), 'utf8'));
    check(strings['q.nps'] && strings['q.nps'].en, 'strings.json content');
    if (REAL) {
      const map = fs.readFileSync(path.join(DL, 'flow.md'), 'utf8');
      const expected = REAL.exportStatic((await serverState()).model, { apps_script_url: '' })['flow.md'];
      check(map === expected && /^<!-- GENERATED by  node scripts\/flow\.js map --write/.test(map), 'flow.md is the map Model.gs makes of the saved draft: ' + firstDiff(map, expected));
      check(map === FLOW_CHECK.toMarkdown(survey, strings, { source: 'web/config/survey.json' }), 'and exactly what "node scripts/flow.js map" makes of the downloaded survey.json and strings.json');
    }
    await shot('publish-export');
  });

  /* ---------------- Conflicts ---------------- */
  await step('save conflict: keep mine and overwrite', async () => {
    await control('bump', { by: 'asha@example.com' });
    await click('nav-settings');
    await typeInto('setting-voice.max_seconds', '500');
    check(/largest allowed is 300/.test(await text('setting-row-voice.max_seconds')), 'range message');
    check(/Allowed: 5 to 300/.test(await text('setting-row-voice.max_seconds')), 'allowed range shown');
    await typeInto('setting-voice.max_seconds', '90');
    await click('save');
    await el('conflict');
    check(/asha@example.com/.test(await text('conflict')), 'who saved');
    check(await page.$eval(T('conflict-reload'), (e) => e.classList.contains('btn-primary')), 'Reload is the main button');
    check(await page.$eval(T('conflict-overwrite'), (e) => e.classList.contains('btn-warn') && !e.classList.contains('btn-primary')), 'overwrite looks like a warning');
    await sleep(80);
    check((await page.evaluate(() => document.activeElement.getAttribute('data-test'))) === 'conflict-reload', 'Reload has the focus');
    await shot('conflict');
    await click('conflict-overwrite');
    await waitSaved();
    check(/Saved\. You replaced the changes asha@example\.com saved at \d\d:\d\d\./.test(await toastText()), 'says whose changes were replaced: ' + (await toastText()));
    const st = await serverState();
    check(st.model.settings['voice.max_seconds'] === 90, 'mine kept');
  });

  await step('save conflict: reload the latest version', async () => {
    await control('bump', { by: 'ravi@example.com', textKey: 'ui.next', english: 'Next please' });
    await typeInto('setting-text.max_chars', '2000');
    await click('save');
    await el('conflict');
    await click('conflict-reload');
    await waitSaved();
    check((await value('setting-text.max_chars')) === '1500', 'my change dropped');
    const st = await serverState();
    check(st.model.settings['text.max_chars'] === 1500 && st.model.texts['ui.next'].en === 'Next please', 'their version kept');
  });

  /* ---------------- Settings ---------------- */
  await step('settings: add and reorder a language, save', async () => {
    await click('lang-add');
    await typeInto('lang-new-code', 'mr');
    await typeInto('lang-new-bcp47', 'mr-IN');
    await typeInto('lang-new-native', 'मराठी');
    await click('lang-new-create');
    await el('lang-row-mr');
    await click('lang-up-mr');
    await click('lang-active-ml');
    await shot('settings-languages');
    await click('save');
    await waitSaved();
    const st = await serverState();
    const codes = st.model.languages.map((l) => l.code).join(',');
    check(codes === 'en,hi,ta,te,kn,mr,ml', 'language order ' + codes);
    check(st.model.languages.find((l) => l.code === 'ml').active === false, 'ml off');
    check(st.model.texts['q.nps'].mr === '[TRANSLATE] How likely are you to recommend Valmo to another DC owner?', 'mr column filled');
    check(await page.$eval(T('lang-active-en'), (e) => e.getAttribute('aria-disabled') === 'true'), 'English stays on');
    await click('lang-active-ml');
  });

  await step('settings: import from GitHub (with confirmation)', async () => {
    await click('import-go');
    await el('confirm-import');
    check(/unsaved changes/.test(await text('confirm-import')), 'warns about unsaved changes');
    await click('modal-confirm');
    await idle();
    check(/Imported:/.test(await toastText()), 'import toast');
    const st = await serverState();
    check(st.model.languages.length === 6 && st.model.rounds.find((r) => r.id === '2026-R2').status === 'open', 'imported; rounds kept');
    check(/All changes saved/.test(await statusText()), 'clean after import');
  });

  await step('discard unsaved changes', async () => {
    await typeInto('setting-survey_id', 'valmo-partner-pulse-x');
    check(/Unsaved/.test(await statusText()), 'dirty');
    await click('discard');
    await click('modal-confirm');
    await idle();
    check(/All changes saved/.test(await statusText()) && (await value('setting-survey_id')) === 'valmo-partner-pulse', 'discarded');
  });

  await step('unsaved changes survive closing the window (dropped if someone saved since)', async () => {
    await click('nav-settings');
    await typeInto('setting-survey_id', 'valmo-partner-pulse-recovered');
    await sleep(1100);
    await openPanel();
    await el('recovery-modal');
    await shot('recovery');
    await click('recovery-restore');
    check(/Unsaved/.test(await statusText()), 'dirty again after restoring');
    await click('nav-settings');
    check((await value('setting-survey_id')) === 'valmo-partner-pulse-recovered', 'value restored');
    await sleep(1100);
    await control('bump', { by: 'ravi@example.com' });
    await openPanel();
    check(!(await exists('recovery-modal')), 'no offer when someone saved since');
    check(/dropped/.test(await toastText()), 'explains why');
    check(/All changes saved/.test(await statusText()), 'clean');
    await click('nav-settings');
  });

  await step('keyboard: Ctrl+S saves; modal keeps focus inside; Escape closes', async () => {
    await typeInto('setting-survey_id', 'valmo-partner-pulse-2');
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await waitSaved();
    check(backend.state.model.settings.survey_id === 'valmo-partner-pulse-2', 'saved by keyboard');
    await click('nav-questions');
    await click('add-question');
    await el('add-question-modal');
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement.closest('[data-test="add-question-modal"]'));
    check(inside, 'focus stays in the dialog');
    await page.keyboard.press('Escape');
    await sleep(150);
    check(!(await exists('add-question-modal')), 'Escape closes');
    const missing = await page.evaluate(() => Array.from(document.querySelectorAll('button, input, select, textarea, a[href], summary'))
      .filter((e) => !e.closest('[data-test]') || !e.getAttribute('data-test')).map((e) => e.outerHTML.slice(0, 80)));
    check(!missing.length, 'every control has data-test: ' + missing.slice(0, 5).join(' | '));
  });

  /* ---------------- Errors and menu hints ---------------- */
  await step('a failed save offers Try again', async () => {
    await control('fail', { fn: 'panelSave', message: 'The Sheet is busy. Please try again in a moment.' });
    await click('nav-settings');
    await typeInto('setting-survey_id', 'valmo-partner-pulse-3');
    await click('save');
    await el('error-modal');
    check(/The Sheet is busy/.test(await text('error-modal')), 'server message shown');
    check(/Unsaved/.test(await statusText()), 'still unsaved');
    await click('error-retry');
    await waitSaved();
  });

  await step('menu hint opens Publish and runs the check', async () => {
    await control('open_section', { section: 'publish' });
    await openPanel();
    check(await page.$eval('[aria-current="page"]', (e) => e.getAttribute('data-test')) === 'nav-publish', 'opened on Publish');
    await el('check-errors-count');
  });

  await step('a failed load shows a plain message and Try again', async () => {
    await control('fail', { fn: 'panelLoad', message: 'The Sheet could not be read. Run Partner Pulse > Set up or repair.' });
    await page.goto(base + '/panel', { waitUntil: 'load' });
    await el('load-error');
    check(/Set up or repair/.test(await text('load-error')), 'message');
    check(await exists('load-error-setup-hint'), 'a message without its own advice gets the set-up hint');
    await shot('load-error');
    await click('load-retry');
    await page.waitForSelector(T('nav-home'), { visible: true, timeout: 8000 });
    await idle();
  });

  await step('a failing versions list is asked for once, then on Refresh', async () => {
    await control('fail', { fn: 'panelHistory', message: 'The Publish history tab could not be read.' });
    await openPanel();
    const before = (await serverState()).calls.filter((c) => c === 'panelHistory').length;
    await click('nav-publish');
    await idle();
    await click('check');
    await idle();
    await sleep(600);
    const after = (await serverState()).calls.filter((c) => c === 'panelHistory').length;
    check(after - before === 1, 'panelHistory called ' + (after - before) + ' times');
    check(/Press Refresh/.test(await text('history-card')), 'explains how to retry');
    await click('history-refresh');
    await idle();
    await el('history-row-1');
  });

  /* ---------------- Narrow window ---------------- */
  await step('works at 900 px wide', async () => {
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
    for (const s of ['questions', 'areas', 'texts', 'look', 'rounds', 'links', 'publish', 'settings']) {
      await click('nav-' + s);
      await idle();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, s + ' overflows horizontally by ' + overflow + ' px');
      const mainOverflow = await page.$eval('#main', (e) => e.scrollWidth - e.clientWidth);
      check(mainOverflow <= 0, s + ' main area overflows by ' + mainOverflow + ' px');
      if (['questions', 'look', 'rounds', 'settings'].includes(s)) await shot('w900-' + s);
    }
    await click('nav-questions');
    await click('screen-edit-nps');
    await shot('w900-editor');
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  });

  /* =====================================================================
     The route (stage 4 of the flow-graph work, 26 Oct 2026), on a fresh
     Sheet: jumps, "usually go to", "ask for each area", an ending, the
     badges and warnings, the built-in screens' settings, the Map, Try a
     path and the Home banner about the form's route code.
     ===================================================================== */
  const FIX = 'is_this_fixed_now';
  const END = 'thank_you_we_will_call_you_this_week';
  const END_TITLE = 'Thank you! We will call you this week.';
  const END_BODY = 'Your answers were sent. Our team will call you.';
  const SRI = 'sha384-rbtjAdnIQE/aQJGEgXrVUlMibdfTSa4PQju4HDhN3sR2PmaKFzhEafuePsl9H/9I';
  async function flowReady() {
    await page.waitForFunction(() => window.__ppTest && window.__ppTest.flowReady && window.__ppTest.flowReady(), { timeout: 10000 });
  }
  const savedModel = async () => (await serverState()).model;
  const savedScreen = async (id) => (await savedModel()).screens.find((s) => s.id === id);

  await step('route tools: the form\'s own route code runs in the window, and its draft route is the server\'s', async () => {
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    await control('reset');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await openPanel();
    await flowReady();
    check(await page.evaluate(() => typeof window.PP === 'undefined'), 'the route code runs with a private root: nothing called PP leaks into the page');
    await click('nav-questions');
    check(/Ends the survey/.test(await text('screen-end-thanks')), 'the thank-you screen says it ends the survey');
    check((await exists('open-map')) && (await exists('open-try')) && !(await exists('flow-unavailable-note')), 'Map and Try a path are offered; no "route tools missing" note');
    check(await exists('other-routes') && await exists('add-ending'), 'the "Other routes and endings" part, with Add an ending');
    if (REAL) {
      const mine = await page.evaluate(() => window.__ppTest.flowSurvey());
      const theirs = serverSurvey(await savedModel());
      ['languages', 'default_language', 'fallback_language', 'functions', 'deep_dive', 'flow'].forEach((k) => {
        check(canon(mine[k]) === canon(theirs[k]), k + ' differs from the server\'s compile: ' + canon(mine[k]).slice(0, 160) + ' | ' + canon(theirs[k]).slice(0, 160));
      });
      check(mine.rating.allow_not_applicable === theirs.rating.allow_not_applicable, 'rating.allow_not_applicable');
      ['items', 'allow_not_applicable', 'allow_comment', 'comment_text'].forEach((k) => check(canon(mine.support[k]) === canon(theirs.support[k]), 'support.' + k + ' differs from the server\'s compile'));
    }
    await checkTestNames('questions with the route tools');
    await shot('route-list');
  });

  await step('a jump built in the editor ends up in the screen\'s jumps and in the compiled route', async () => {
    await click('screen-edit-nps');
    await el('after-card');
    await click('jump-add');
    await el('jump-0');
    const answers = await page.$$eval(T('jump-0-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(answers.some((t) => /^How likely are you to recommend/.test(t)) && answers.indexOf('The partner’s language') !== -1, 'its own answer and the language are offered: ' + answers.join(' / '));
    check(!answers.some((t) => /^Rating of/.test(t) || /^Support:/.test(t)), 'later answers are not offered: ' + answers.join(' / '));
    const targets = await page.$$eval(T('jump-0-goto') + ' option', (os) => os.map((o) => o.textContent));
    check(!targets.some((t) => /^[123]\. /.test(t)) && targets.some((t) => /^8\. /.test(t)) && targets.some((t) => /The thank-you screen/.test(t)), 'only later questions and endings: ' + targets.join(' / '));
    await select('jump-0-test-0', 'at_least');
    await select('jump-0-value-0', '9');
    await select('jump-0-goto', 'one_fix');
    const sentence = await text('jump-sentence');
    check(/if the answer to “How likely are you to recommend Valmo to/.test(sentence) && /is 9 or higher, they go to question 8/.test(sentence), 'sentence: ' + sentence);
    await checkTestNames('jump builder');
    await shot('route-jump-builder');
    await click('editor-back');
    check(/^↪ goes to question 8 when .* ≥ 9$/.test(await text('screen-jump-nps-0')), 'badge: ' + (await text('screen-jump-nps-0')));
    await click('save');
    await waitSaved();
    const nps = await savedScreen('nps');
    check(canon(nps.jumps) === canon([{ when: { answer: 'nps', at_least: 9 }, goto: 'one_fix' }]), 'saved in the screen\'s jumps: ' + JSON.stringify(nps.jumps));
    if (REAL) {
      const node = nodeOf(serverSurvey(await savedModel()).flow, 'nps');
      check(canon(node.next) === canon([{ when: { answer: 'nps', at_least: 9 }, goto: 'one_fix' }, { default: 'fn_ratings' }]), 'the compiled route: ' + JSON.stringify(node.next));
    }
  });

  await step('"Usually go to" is saved as the screen\'s next, and becomes its arrow', async () => {
    await click('screen-edit-support');
    await select('next-select', 'thanks');
    check(/partners go to the thank-you screen \(question 9\)\./.test(await text('jump-sentence')), 'sentence: ' + (await text('jump-sentence')));
    await click('editor-back');
    check(/↪ then goes to the thank-you screen/.test(await text('screen-next-support')), 'badge: ' + (await text('screen-next-support')));
    await click('save');
    await waitSaved();
    check((await savedScreen('support')).next === 'thanks', 'saved as next');
    if (REAL) check(nodeOf(serverSurvey(await savedModel()).flow, 'support').next === 'thanks', 'the compiled arrow');
    await click('screen-edit-support');
    await select('next-select', '');
    await click('editor-back');
    check(!(await exists('screen-next-support')), 'back to "the next one in the list": no badge');
  });

  await step('the repeat selector: a question asked once for each area rated low', async () => {
    await click('add-question');
    await click('type-pick-yes_no');
    await typeInto('new-question-text', 'Is this fixed now?');
    check((await text('new-question-code')).includes(FIX), 'code ' + FIX);
    await select('new-question-after', '4');   // after "5. Problem screens"
    await click('new-question-create');
    await el('repeat-card');
    check(await page.$eval(T('repeat-once'), (e) => e.checked), 'asked once by default');
    await click('repeat-each_low_area');
    check(/is_this_fixed_now:<area>/.test(await text('repeat-help')), 'explains the answer codes: ' + (await text('repeat-help')));
    await checkTestNames('repeat card');
    await shot('route-repeat');
    await click('editor-back');
    check(/Repeats for each area rated low/.test(await text('screen-repeat-' + FIX)), 'badge');
    await click('save');
    await waitSaved();
    const saved = await savedScreen(FIX);
    check(saved && saved.repeat === 'each_low_area' && saved.type === 'yes_no', 'saved: ' + JSON.stringify(saved && saved.repeat));
    if (REAL) {
      const node = nodeOf(serverSurvey(await savedModel()).flow, FIX);
      check(canon(node.repeat_for) === canon({ each: 'area', in: 'areas', where: { answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } } }) &&
        node.store_as === FIX + ':{area}' && node.label === 'fn.{area}.name', 'the compiled loop: ' + JSON.stringify(node));
    }
  });

  await step('"Add an ending": another thank-you screen below the main one, with its own texts, reached by a jump', async () => {
    await el('other-routes');
    await click('add-ending');
    await el('add-ending-modal');
    await typeInto('ending-new-title', END_TITLE);
    check((await text('ending-new-code')).includes(END), 'code: ' + (await text('ending-new-code')));
    await typeInto('ending-new-body', END_BODY);
    await checkTestNames('add-ending pop-up');
    await click('ending-new-create');
    await el('screen-card-' + END);
    check(await page.$eval(T('other-routes'), (e, id) => !!e.querySelector('[data-test="screen-card-' + id + '"]'), END), 'listed under Other routes and endings');
    check(/Ends the survey/.test(await text('screen-end-' + END)), 'it ends the survey');
    check(await exists('screen-unreached-' + END), 'nothing leads there yet: a warning says so');
    await click('screen-edit-nps');
    await select('jump-0-goto', END);
    await click('editor-back');
    check(!(await exists('screen-unreached-' + END)), 'reached by the jump now: the warning goes');
    check(/^↪ goes to the ending “Thank you! We will call/.test(await text('screen-jump-nps-0')), 'the jump names the ending: ' + (await text('screen-jump-nps-0')));
    await shot('route-ending');
    await click('save');
    await waitSaved();
    const m = await savedModel();
    const row = m.screens.find((s) => s.id === END);
    check(row && row.type === 'thank_you' && row.text === 'end.' + END + '.title' && row.body === 'end.' + END + '.body' && m.screens.indexOf(row) === m.screens.length - 1, 'saved as the last row, with its own text keys');
    check(m.texts['end.' + END + '.title'].en === END_TITLE && m.texts['end.' + END + '.title'].hi === '[TRANSLATE] ' + END_TITLE, 'English first, Hindi marked to translate: ' + JSON.stringify(m.texts['end.' + END + '.title']));
    check(m.texts['end.' + END + '.body'].ta === '[TRANSLATE] ' + END_BODY, 'the message too: ' + JSON.stringify(m.texts['end.' + END + '.body']));
    if (REAL) {
      const g = serverSurvey(m).flow;
      const node = nodeOf(g, END);
      check(node && node.type === 'thank_you' && node.text === 'end.' + END + '.title' && node.body === 'end.' + END + '.body' && node.next === undefined, 'the compiled ending: ' + JSON.stringify(node));
      check(nodeOf(g, 'nps').next[0].goto === END, 'the nps jump goes to it');
    }
  });

  await step('badges and warnings: a jump that can never happen; hiding, moving and deleting warn about jumps', async () => {
    await click('screen-edit-one_fix');
    await click('jump-add');
    await select('jump-0-answer-0', 'support_gate');
    await select('jump-0-goto', END);
    await click('editor-back');
    check((await exists('screen-jump-one_fix-0')) && !(await exists('screen-jump-problem-one_fix')), 'a working jump: no warning');
    await click('screen-toggle-support_gate');   // hide the answer that jump tests
    check(/A rule or jump on question 8, question 9 tests this hidden question/.test(await toastText()), 'hiding warns about the rule and the jump: ' + (await toastText()));
    check(/this jump can never happen/.test(await text('screen-jump-problem-one_fix')), 'the badge says the jump can never happen');
    await shot('route-jump-problem');
    await click('screen-edit-one_fix');
    check(/This jump can never happen/.test(await text('jump-0-problem')), 'the editor says why: ' + (await text('jump-0-problem')));
    await click('editor-back');
    await click('screen-toggle-support_gate');
    check(!(await exists('screen-jump-problem-one_fix')), 'shown again: the warning goes');
    await click('screen-toggle-' + END);   // hide a jump's target, an ending
    /* CHANGED EXPECTATION (26 Oct 2026, review finding 1): a hidden ending still ends its route, at the main thank-you
       screen; hiding an ending partners reach says so first. */
    await el('confirm-hide-ending');
    check(/^While it is hidden, partners who would reach it \(question 3 jumps here; question 9 jumps here\) end at the main thank-you screen \(question 10\) instead\. Their answers are still sent, and they never go on to the screens below it\.$/.test(await text('hide-ending-note')),
      'hiding an ending says where partners end then: ' + (await text('hide-ending-note')));
    await click('modal-confirm');
    check(/Ending hidden\. Partners who would reach it now end at the main thank-you screen \(question 10\)\./.test(await toastText()), 'toast: ' + (await toastText()));
    await click('screen-toggle-' + END);
    await click('screen-edit-support');   // an arrow, then move its target above it
    await select('next-select', 'one_fix');
    await click('editor-back');
    await click('screen-up-one_fix');
    check(/Question 9 now has an arrow back up to question 8\./.test(await toastText()), 'moving warns about the arrow that now points up: ' + (await toastText()));
    await click('screen-down-one_fix');
    await click('screen-edit-support');
    await select('next-select', '');
    await click('editor-back');
    await click('screen-delete-' + END);   // delete a target: its arrows go too, and Undo brings them back
    await el('confirm-delete-screen');
    check(/^Question 3 and question 9 go to this ending\. Those arrows are removed too: partners then go where that question usually goes\./.test(await text('delete-arrows-note')), 'the confirmation names the arrows: ' + (await text('delete-arrows-note')));
    await click('modal-confirm');
    check(/Ending deleted\. 2 arrows to it removed too\./.test(await toastText()), 'toast: ' + (await toastText()));
    check(!(await exists('screen-jump-nps-0')) && !(await exists('screen-jump-one_fix-0')), 'the jumps to it are gone');
    await click('toast-undo');
    await el('screen-card-' + END);
    check((await exists('screen-jump-nps-0')) && (await exists('screen-jump-one_fix-0')), 'Undo brings the ending and its jumps back');
  });

  await step('the problem, support and area-rating editors show their Settings and change the same entries', async () => {
    await click('screen-edit-fn_deep_dives');
    await el('editor-settings-card');
    check(await page.$eval(T('editor-dd-when-after_all_ratings'), (e) => e.checked), 'problem screens after all the ratings');
    await select('next-select', 'support');   // a "usually go to" set while the problem screens come after all the ratings ...
    await click('editor-dd-when-immediate');
    await el('editor-dd-immediate-note');
    check(await exists('after-not-used'), 'its own arrows are not used in that mode');
    /* 26 Oct 2026 (review finding 7): in that mode the row's own arrows are not offered, and what is left over can be cleared. */
    check(!(await exists('next-select')) && !(await exists('jump-add')), 'no "Usually go to" or "Add a jump" in that mode');
    check(/^This row still has a “Usually go to” from before\. They change nothing for partners in this mode, but the check warns about them until they are cleared\./.test(await text('after-leftovers')),
      'the leftover is named: ' + (await text('after-leftovers')));
    await click('after-clear');
    check(!(await exists('after-leftovers')), 'cleared');
    await click('editor-dd-when-after_all_ratings');
    check((await value('next-select')) === '', 'the "usually go to" is gone: ' + (await value('next-select')));
    await click('editor-dd-when-immediate');
    await el('editor-dd-immediate-note');
    await click('nav-settings');
    check((await value('setting-deep_dive.when')) === 'immediate', 'the same Settings entry changed');
    await select('setting-deep_dive.when', 'after_all_ratings');
    await click('nav-questions');
    await click('screen-edit-fn_deep_dives');
    check(await page.$eval(T('editor-dd-when-after_all_ratings'), (e) => e.checked), 'and back');
    check(await page.$eval(T('editor-setting-deep_dive.require_chip'), (e) => e.checked), 'a problem must be picked');
    check(await page.$eval(T('editor-setting-deep_dive.require_detail_if_other'), (e) => e.checked), '"Other" needs detail');
    await click('editor-setting-deep_dive.require_chip');
    await checkTestNames('problem screens editor');
    await shot('route-dd-settings');
    await click('nav-settings');
    check(!(await page.$eval(T('setting-deep_dive.require_chip'), (e) => e.checked)), 'Settings shows it switched off');
    await click('setting-deep_dive.require_chip');
    await click('nav-questions');
    await click('screen-edit-support');
    await click('editor-setting-support.allow_not_applicable');
    await el('editor-support-na-label-en');
    check(await page.$eval(T('editor-setting-support.allow_comment'), (e) => e.checked), 'the comment box is on');
    await el('editor-support-comment-text-en');
    await click('nav-support');
    check(await page.$eval(T('support-na-toggle'), (e) => e.checked), 'Support questions shows the same "Doesn\'t apply"');
    await click('support-na-toggle');
    await click('nav-questions');
    await click('screen-edit-fn_ratings');
    check(await page.$eval(T('editor-setting-rating.allow_not_applicable'), (e) => e.checked), '"I don\'t handle this" is shown in the area ratings');
    await checkTestNames('area ratings editor');
    await click('editor-back');
  });

  /* CHANGED (26 Oct 2026, review finding 11): the outline shows at once and the drawing replaces it when it is
     ready; after 6 s a note says the drawing is still loading; the panel waits up to 20 s. */
  await step('Map: the outline at once; the drawing (pinned library, sandboxed frame) replaces it when drawn; "still loading" after 6 s; after 20 s the outline stays, with a mermaid.live link', async () => {
    await click('nav-questions');
    const held = [];
    const onRequest = (r) => {
      if (/cdn\.jsdelivr\.net/.test(r.url())) { held.push(r); return; }   // held: the library never arrives
      r.continue();
    };
    const mapState = () => page.$eval(T('map-box'), (e) => e.getAttribute('data-state'));
    expectBlockedCdn = true;
    await page.setRequestInterception(true);
    page.on('request', onRequest);
    try {
      let t0 = Date.now();
      await click('open-map');
      await page.waitForSelector(T('map-outline'), { visible: true, timeout: 3000 });
      check(Date.now() - t0 < 3000, 'the outline shows at once: ' + (Date.now() - t0) + ' ms');
      check((await mapState()) === 'drawing' && /^Drawing the map of your draft… Meanwhile, here is the same route as a list\.$/.test((await text('map-status')).trim()),
        'while the drawing loads: ' + (await text('map-status')));
      const outline = await page.$$eval(T('map-outline') + ' > li', (els) => els.map((e) => e.innerText));
      check(outline.length >= 10 && outline.some((t) => /^Ending: “Thank you! We will call you this week\.”/.test(t)) && outline.some((t) => /If nps >= 9: the ending "thank_you_we_will_call_you_this_week"/.test(t)),
        'the outline lists the screens and the jump: ' + outline.slice(0, 3).join(' / '));
      const href = await page.$eval(T('map-mermaid-live'), (e) => e.getAttribute('href'));
      check(/^https:\/\/mermaid\.live\/edit#base64:/.test(href), 'the mermaid.live link is there at once: ' + href.slice(0, 60));
      const linkState = JSON.parse(Buffer.from(href.split('#base64:')[1], 'base64').toString('utf8'));
      check(/^flowchart TD/.test(linkState.code) && linkState.code.indexOf('n_' + END) !== -1 && /if nps #gt;= 9/.test(linkState.code), 'the link carries the whole map');
      const frame = await page.waitForSelector(T('map-frame'), { timeout: 3000 });
      const attrs = await frame.evaluate((e) => ({ sandbox: e.getAttribute('sandbox'), doc: e.getAttribute('srcdoc'), loading: e.classList.contains('is-loading') }));
      check(attrs.sandbox === 'allow-scripts', 'sandboxed without "allow-same-origin": ' + attrs.sandbox);
      check(attrs.doc.indexOf('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js') !== -1 && attrs.doc.indexOf(SRI) !== -1, 'the frame loads Mermaid 11.4.1 with its SRI hash');
      check(attrs.loading, 'the frame stays out of sight while it loads');
      const inner = await frame.contentFrame();
      const reach = inner ? await inner.evaluate(() => { try { return typeof parent.google.script.run; } catch (e) { return 'blocked'; } }) : 'no frame';
      check(reach === 'blocked', 'the frame cannot reach google.script.run: ' + reach);
      await checkTestNames('map (loading)');
      await page.waitForFunction(() => document.querySelector('[data-test="map-box"]').getAttribute('data-state') === 'slow', { timeout: 9000 });
      check(Date.now() - t0 >= 5500, 'the "still loading" note comes after about 6 s: ' + (Date.now() - t0) + ' ms');
      check(/^The drawing is still loading/.test((await text('map-status')).trim()) && (await exists('map-outline')), 'still loading, the outline still shown: ' + (await text('map-status')));
      /* The frame's own "drawn" message (sent here from inside the frame, as Mermaid's success would send it). */
      const token = JSON.parse(/token = ("[^"]*")/.exec(attrs.doc)[1]);
      await inner.evaluate((tok) => { parent.postMessage({ pp: 'map', kind: 'drawn', token: tok, why: '', height: 320 }, '*'); }, token);
      await page.waitForFunction(() => document.querySelector('[data-test="map-box"]').getAttribute('data-state') === 'drawn', { timeout: 3000 });
      check(!(await exists('map-outline')) && !(await exists('map-status')), 'the drawing replaces the outline');
      const shown = await page.$eval(T('map-frame'), (e) => ({ loading: e.classList.contains('is-loading'), height: e.getBoundingClientRect().height }));
      check(!shown.loading && shown.height >= 300, 'the frame is shown at the drawing\'s height: ' + JSON.stringify(shown));
      check(await exists('map-mermaid-live'), 'the mermaid.live link stays');
      await shot('route-map-drawn');
      /* Again, and this time the drawing never arrives: the panel stops waiting after 20 s and keeps the outline. */
      await click('qview-back');
      t0 = Date.now();
      await click('open-map');
      await page.waitForSelector(T('map-outline'), { visible: true, timeout: 3000 });
      await page.waitForFunction(() => document.querySelector('[data-test="map-box"]').getAttribute('data-state') === 'fallback', { timeout: 26000 });
      const waited = Date.now() - t0;
      check(waited >= 19000, 'the panel waits about 20 seconds for the drawing: ' + waited + ' ms');
      check(/^The diagram could not be drawn here \(it did not finish within 20 seconds\)\. Below is the same route as a list; the link opens the drawing in a new tab\.$/.test((await text('map-fallback')).trim()),
        'then says so: ' + (await text('map-fallback')));
      check(!(await exists('map-frame')) && (await exists('map-outline')) && (await exists('map-mermaid-live')), 'the outline and the link stay, the frame goes');
      await checkTestNames('map');
      await shot('route-map-fallback');
      await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
      await sleep(150);
      const over = await page.$eval('#main', (e) => e.scrollWidth - e.clientWidth);
      check(over <= 0, 'the map\'s outline at 900 px overflows sideways by ' + over + ' px');
      await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
      await click('map-which-live');
      await el('map-live-none');
      check(/Nothing is published yet/.test(await text('map-live-none')), 'the live map: nothing published yet');
      await click('map-which-draft');
    } finally {
      page.off('request', onRequest);
      held.forEach((r) => { try { r.abort('blockedbyclient'); } catch (e) { /* already gone with its frame */ } });
      await page.setRequestInterception(false);
      await sleep(300);
      expectBlockedCdn = false;
    }
  });

  await step('Try a path: the tested answers, the screens in order, why others are skipped, and what would be sent', async () => {
    await click('qview-back');
    await click('open-try');
    await el('try-inputs');
    const inputs = await page.$$eval('[data-test^="try-answer-"]', (els) => els.map((e) => e.getAttribute('data-test').slice(11)));
    check(inputs.indexOf('nps') !== -1 && inputs.indexOf('fn_rating:payments') !== -1 && inputs.indexOf('support_gate') !== -1, 'drop-downs for the tested answers: ' + inputs.join(', '));
    check((await exists('try-lang')) && (await exists('try-lang-in-url')) && (await exists('try-wc')) && (await exists('try-round')) === false, 'language, link-has-language, what changed (no round: no rule tests it)');
    await select('try-answer-nps', '9');
    let steps = await text('try-steps');
    check(/Thank you! We will call you this week\./.test(steps) && !/How is your experience/.test(steps), 'NPS 9 jumps to the ending: ' + steps);
    check(/jump: nps >= 9/.test(await text('try-skipped')), 'the skipped screens say why: ' + (await text('try-skipped')).slice(0, 200));
    await click('try-sent-toggle');
    check(/"nps": 9/.test(await text('try-sent-json')), 'NPS 9 would be sent');
    await select('try-answer-nps', '4');
    await select('try-answer-fn_rating:payments', '2');
    steps = await text('try-steps');
    check(/Payments \/ Payouts: Is this fixed now\?/.test(steps) && /Payments \/ Payouts: What is the main problem\?/.test(steps), 'rated low: the problem screen and the repeated question for Payments: ' + steps);
    check(!/Losses & Debits: Is this fixed now\?/.test(steps), 'not for areas that are not rated low');
    check(/Next needs an answer/.test(await text('try-summary')), 'Next is blocked on screens no rule tests: ' + (await text('try-summary')));
    await click('try-lang-in-url');
    check(!/Choose your language/.test(await text('try-steps')), 'a link with ?lang= skips the language screen');
    await checkTestNames('try a path');
    await shot('route-try-a-path');
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
    await sleep(150);
    const over = await page.$eval('#main', (e) => e.scrollWidth - e.clientWidth);
    check(over <= 0, 'Try a path at 900 px overflows sideways by ' + over + ' px');
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    await click('qview-back');
    await click('save');
    await waitSaved();
  });

  await step('without the route code the panel still works: a short note, no Map or jumps, the older rule builder', async () => {
    await control('fail', { fn: 'panelFlowCode', message: 'The script file "Flow" is missing from the Apps Script project.' });
    await openPanel();
    await click('nav-questions');
    check(/could not start: The script file "Flow" is missing/.test(await text('flow-unavailable-note')), 'note: ' + (await text('flow-unavailable-note')));
    check(await page.$eval(T('open-map'), (e) => e.getAttribute('aria-disabled') === 'true') && await page.$eval(T('open-try'), (e) => e.getAttribute('aria-disabled') === 'true'), 'Map and Try a path are switched off');
    check(!(await exists('add-ending')) && !(await exists('screen-end-thanks')), 'no route badges or Add an ending');
    await click('screen-edit-support');
    check(!(await exists('after-card')) && !(await exists('repeat-card')), 'no "After this question" or repeat card');
    const answers = await page.$$eval(T('rule-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(answers.some((t) => /^In the last 30 days/.test(t)), 'the rule builder still lists the earlier answers: ' + answers.join(' / '));
    await click('editor-back');
    await openPanel();   // the next window loads the route code again
    await flowReady();
  });

  await step('Home: a red banner when the form on GitHub runs other route code; none when it can\'t be reached or matches', async () => {
    await control('flow_status', { form: 'f'.repeat(64) });
    await openPanel();
    const banner = await text('flow-mismatch-banner');
    check(/does not run the same route code as this control panel/.test(banner) && /form: ffffffffffff…/.test(banner), 'banner: ' + banner);
    await shot('route-home-banner');
    await control('flow_status', { form: 'unreachable' });
    await openPanel();
    await sleep(400);
    check(!(await exists('flow-mismatch-banner')), 'no banner when the form can\'t be reached');
    await control('flow_status', { form: 'repo' });
    await openPanel();
    await sleep(400);
    check(!(await exists('flow-mismatch-banner')), 'no banner when the form runs the same code');
  });

  /* =====================================================================
     Review fixes (October 2026), on a fresh Sheet: nothing published, no
     round opened, web app address not recorded.
     ===================================================================== */
  const NOTE = 'Codes lock when the first real round opens, so rounds stay comparable. Until then you can delete or rename anything. Test rounds (names starting with SMOKE, DEMO or TEST) never lock them.';
  const OTHER_ACCOUNT = 'Google may be using another of your accounts. Open the Sheet in a Chrome profile (or an Incognito window) signed in only with your company account, then open the panel again.';
  const PERMISSIONS = 'Google needs all of Partner Pulse’s permissions: use the Partner Pulse menu again and tick Select all on Google’s permission screen.';
  const AUTHORIZATION = 'Google says Partner Pulse needs authorization. Usually Google is using another of your Google accounts: open the Sheet in a Chrome profile (or an Incognito window) signed in only with your company account, then try again. If that does not help, a permission was probably left unticked: use the Partner Pulse menu again and tick Select all on Google’s permission screen.';
  const current = () => page.$eval('[aria-current="page"]', (e) => e.getAttribute('data-test'));

  async function publishNow(note) {
    await click('publish');
    await el('publish-modal', 10000);
    await typeInto('publish-note-modal', note);
    await click('publish-confirm');
    await el('published-modal', 10000);
  }

  await step('fresh Sheet: nothing is locked before the first round opens', async () => {
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    await control('reset');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await openPanel();
    await click('nav-questions');
    check((await text('codes-unlocked-note')) === NOTE, 'note in Questions: ' + (await text('codes-unlocked-note')));
    check(!/🔒/.test(await page.$eval('.qlist', (e) => e.innerText)), 'no lock icons');
    check(!(await page.$eval(T('screen-delete-one_fix'), (e) => e.getAttribute('aria-disabled') === 'true')), 'a question can be deleted');
    await shot('fix-questions-unlocked');
    await click('nav-areas');
    check((await text('codes-unlocked-note')) === NOTE, 'note in Areas');
    check(!(await page.$eval(T('area-delete-losses'), (e) => e.getAttribute('aria-disabled') === 'true')), 'an area can be deleted');
    check(/or give one area its own limit \(Edit on its card\)\.$/.test(await text('areas-limit-help')), 'areas footer: ' + (await text('areas-limit-help')));
    await click('area-expand-losses');
    await el('area-rename-losses');
    await click('area-expand-losses');
    /* Publishing alone does not lock codes: only opening a round does. */
    await publishNow('Bench version 1');
    check(!(await exists('published-open-round')), 'no round waiting to be opened');
    await click('published-ok');
    await idle();
    await click('nav-questions');
    check(await exists('codes-unlocked-note'), 'still unlocked after publishing (no round opened yet)');
    check(!/🔒/.test(await page.$eval('.qlist', (e) => e.innerText)), 'still no lock icons');
    await click('screen-edit-one_fix');
    await el('screen-rename');
    await click('editor-back');
  });

  /* Pranav's decision (21 Oct 2026): these two fill their own columns of the answers sheet. */
  await step('the nps and support_gate questions can be hidden, but never deleted or given a new code', async () => {
    await click('nav-questions');
    for (const [id, column] of [['nps', 'nps'], ['support_gate', 'support_contacted']]) {
      check(await page.$eval(T('screen-delete-' + id), (e) => e.getAttribute('aria-disabled') === 'true'), id + ': Delete is locked, although nothing else is');
      await click('screen-delete-' + id);
      check(new RegExp('fills the ' + column + ' column of the answers sheet').test(await toastText()), id + ': says why: ' + (await toastText()));
      check(!(await page.$eval(T('screen-toggle-' + id), (e) => e.getAttribute('aria-disabled') === 'true')), id + ': can still be hidden');
      await click('screen-edit-' + id);
      check(!(await exists('screen-rename')), id + ': no Change code');
      await click('editor-back');
    }
  });

  await step('publishing a draft that is already live says so and asks "Publish anyway?"', async () => {
    await click('nav-publish');
    check((await text('publish-same-note')) === 'Your draft is the same as version 1, which partners already see.', 'note in the Publish card');
    await click('publish-go');
    await el('publish-modal', 10000);
    check((await text('publish-same-as-live')) === 'Your draft is the same as version 1, which partners already see. Publish anyway?', 'asks in the dialog: ' + (await text('publish-same-as-live')));
    check((await text('publish-confirm')) === 'Publish anyway', 'button says Publish anyway');
    const body = await text('publish-modal');
    check(/Partners who already started get this version the next time they open their link: their answers are kept, and they carry on where they stopped \(a question you added before that point is skipped for them\)\./.test(body), 'sentence about partners who already started: ' + body);
    check(!/keep the version they started with/.test(body), 'old sentence gone');
    await shot('fix-publish-same-as-live');
    await click('modal-cancel');
  });

  /* Pranav's decision (21 Oct 2026): test rounds never lock the codes. */
  await step('a test round (SMOKE-R1) opens without locking the codes, and the dialog says so', async () => {
    await click('nav-rounds');
    await click('round-new');
    await typeInto('round-new-id', 'SMOKE-R1');
    await click('round-new-create');
    await el('round-row-SMOKE-R1');
    await click('save');
    await waitSaved();
    check(!(await exists('banner')) || !/changes they don/.test(await text('banner')), 'an empty new round is not an unpublished change (no banner)');
    await click('round-open-SMOKE-R1');
    await el('confirm-round-status');
    check(!(await exists('round-open-not-live')), 'no "Publish first" for an empty new round');
    check(await exists('round-open-test-round'), 'the dialog says a test round does not lock the codes');
    check(/does not lock the codes\. Never send its links to real partners\.$/.test(await text('round-open-test-round')), 'test-round note: ' + (await text('round-open-test-round')));
    check(!(await exists('round-open-locks')), 'no "This locks the codes" warning for a test round');
    check(!(await exists('round-demo-confirm')), 'no DEMO tick for a SMOKE round');
    await shot('fix-round-open-test-round');
    await click('modal-confirm');
    await idle();
    check((await serverState()).model.rounds.find((r) => r.id === 'SMOKE-R1').status === 'open', 'SMOKE-R1 open on the server');
    await click('nav-questions');
    check((await text('codes-unlocked-note')) === NOTE, 'codes still unlocked after opening a test round');
    check(!/🔒/.test(await page.$eval('.qlist', (e) => e.innerText)), 'still no lock icons');
  });

  await step('opening a round while the draft differs: names version N and the round\'s bullets, offers Publish first', async () => {
    await click('nav-rounds');
    await click('round-new');
    await typeInto('round-new-id', '2026-R7');
    await click('round-new-create');
    await el('round-row-2026-R7');
    check((await value('wc-round')) === '2026-R7', 'what changed shows the new round');
    await click('wc-add');
    await typeInto('wc-item-0-en', 'Payouts now arrive every Tuesday.');
    await click('save');
    await waitSaved();
    await click('round-open-2026-R7');
    const warn = await text('round-open-not-live');
    check(/Partners will get version 1, the version that is live now\. It does not include the changes in your draft\./.test(warn), 'names the live version: ' + warn);
    check((await text('round-open-bullets')) === 'The “What changed” bullet for 2026-R7 is not live yet either: partners won’t see it.', 'the round\'s bullet: ' + (await text('round-open-bullets')));
    check((await text('round-publish-first')) === 'Publish first' && (await text('modal-confirm')) === 'Open anyway', 'buttons');
    check(/^This locks the codes\. 2026-R7 is the first real round\./.test(await text('round-open-locks')), 'the first real round warns that it locks the codes: ' + (await text('round-open-locks')));
    check(!(await exists('round-open-test-round')), 'no test-round note for a real round');
    await checkTestNames('round open warning');
    await shot('fix-round-open-not-live');
    await click('round-publish-first');
    await sleep(150);
    check((await current()) === 'nav-publish', 'Publish first goes to Publish');
    check(/open 2026-R7 in one click/.test(await toastText()), 'explains what happens next');
    await publishNow('Payouts bullet');
    check((await text('published-open-round')) === 'Open round 2026-R7 now', 'offers to open the round');
    await shot('fix-published-open-round');
    await click('published-open-round');
    await el('confirm-round-status');
    check(!(await exists('round-open-not-live')), 'no warning: the draft is live now');
    check(await exists('round-open-locks'), 'the lock warning is shown again right before the round really opens');
    check((await text('modal-confirm')) === 'Open round', 'plain Open round');
    await click('modal-confirm');
    await idle();
    check((await serverState()).model.rounds.find((r) => r.id === '2026-R7').status === 'open', '2026-R7 open on the server');
  });

  await step('the round warning ignores round notes, counts unsaved content, and is honest when the live bullets are unknown', async () => {
    await click('nav-rounds');
    await typeInto('round-notes-DEMO-R1', 'Only for testing');
    await click('round-open-DEMO-R1');
    check(!(await exists('round-open-not-live')), 'a round note alone changes nothing partners see');
    await click('modal-cancel');
    await click('nav-look');
    await typeInto('brand-name-en', 'Valmo Partner Pulse X');
    await click('nav-rounds');
    await click('round-open-DEMO-R1');
    check(/Partners will get version 2.*\(your unsaved changes are saved first, but saving does not publish them\)\./.test(await text('round-open-not-live')), 'unsaved content counts: ' + (await text('round-open-not-live')));
    check(!(await exists('round-open-bullets')), 'DEMO-R1 bullets are unchanged and live');
    await click('modal-cancel');
    await click('save');
    await waitSaved();
    await openPanel();   // a new window: the live bullets are not known any more
    await click('nav-rounds');
    await click('round-open-DEMO-R1');
    check((await text('round-open-bullets')) === 'If you added or changed “What changed” bullets for DEMO-R1 since version 2 was published, partners won’t see those either.', 'unknown live bullets: ' + (await text('round-open-bullets')));
    check(await exists('round-demo-confirm'), 'the DEMO tick is still asked for');
    await click('modal-cancel');
  });

  await step('links and preview start on the newest round, and name it', async () => {
    await click('nav-links');
    check((await value('links-round')) === '2026-R7', 'Links starts on the newest round: ' + (await value('links-round')));
    await click('nav-rounds');
    await click('round-new');
    await typeInto('round-new-id', '2026-R8');
    await click('round-new-create');
    await click('nav-links');
    check((await value('links-round')) === '2026-R8', 'a round just created comes first: ' + (await value('links-round')));
    await select('links-round', '2026-R7');
    await click('links-generate');
    await idle();
    await el('links-result');
    check((await page.$eval(T('links-result') + ' h2', (e) => e.innerText)) === '2. Links for 2026-R7', 'title');
    check((await text('links-download')) === 'Download the 2026-R7 links (CSV)', 'download button');
    check(/^Links for 2026-R7 ready: 36 new, 0 made again\.$/m.test(await toastText()) || /Links for 2026-R7 ready: 36 new/.test(await toastText()), 'toast: ' + (await toastText()));
    await shot('fix-links-result');
    await click('preview');
    await el('preview-modal', 10000);
    await idle();
    check((await value('preview-round')) === '2026-R8', 'preview starts on the newest round: ' + (await value('preview-round')));
    check((await text('preview-round-hint')) === '2026-R8 has no “What changed” bullets: that screen is skipped.', 'hint without bullets: ' + (await text('preview-round-hint')));
    await select('preview-round', '2026-R7');
    check((await text('preview-round-hint')) === '1 “What changed” bullet is shown.', 'hint with one bullet: ' + (await text('preview-round-hint')));
    await select('preview-round', 'DEMO-R1');
    check((await text('preview-round-hint')) === '3 “What changed” bullets are shown.', 'hint with three bullets');
    check((await text('preview-share-warning')) === 'Share only with colleagues: anyone with this link can see your unpublished draft.', 'share warning');
    await idle();
    await el('preview-url');
    await checkTestNames('preview dialog');
    await shot('fix-preview');
    await click('modal-cancel');
  });

  await step('web app address: explained until recorded; a wrong one shows the reason; a right one is kept with Copy', async () => {
    await click('nav-publish');
    check(await exists('export-webapp-missing'), 'the export card warns before any files are made');
    await click('export');
    await el('export-files', 10000);
    check(/keeps the form in test mode \("mock"\)/.test(await text('export-warning')), 'the server\'s export warning is shown: ' + (await text('export-warning')));
    /* On this fresh Sheet the questionnaire is the repo's own (only texts and rounds changed), so the
       GitHub copy is the repo's survey.json byte for byte, apart from config_version: the route as the
       graph (the repo file itself once converted; until then that file converted in memory). */
    fs.rmSync(path.join(DL, 'survey.json'), { force: true });
    await click('export-file-survey.json');
    await el('confirm-export-test-mode');
    await click('modal-confirm');
    const freshCopy = await waitForFile('survey.json');
    const expectedCopy = repoSurveyAsGraph();
    check(withoutVersion(freshCopy) === withoutVersion(expectedCopy), 'survey.json is the repo\'s copy, byte for byte apart from config_version: ' + firstDiff(withoutVersion(freshCopy), withoutVersion(expectedCopy)));
    await click('nav-home');
    const box = await text('webapp-field');
    check(/^Web app address \(for whoever sets up the form\)/.test(box) && /After deploying the web app, paste its address here\. The GitHub copy of the questionnaire then points the form at it\./.test(box), 'explained: ' + box);
    check(!/not deployed/i.test(await text('home-next')), 'never "not deployed"');
    await click('next-webapp');
    await sleep(150);
    check((await page.evaluate(() => document.activeElement.getAttribute('data-test'))) === 'webapp-input', 'the hint button puts the cursor in the box');
    await typeInto('webapp-input', 'https://example.com/not-it');
    await click('webapp-save');
    await idle();
    check(/not a web app address/.test(await text('webapp-error')), 'the server\'s reason is shown: ' + (await text('webapp-error')));
    check((await value('webapp-input')) === 'https://example.com/not-it', 'what was typed stays in the box');
    await shot('fix-webapp-error');
    await typeInto('webapp-input', 'https://script.google.com/macros/s/AKfyBENCH123/exec');
    await page.keyboard.press('Enter');
    await idle();
    check((await value('webapp-url')) === 'https://script.google.com/macros/s/AKfyBENCH123/exec', 'recorded address shown');
    await el('webapp-copy');
    await shot('fix-webapp-recorded');
    check(/Web app address saved/.test(await toastText()), 'saved toast');
    check((await serverState()).webAppUrl === 'https://script.google.com/macros/s/AKfyBENCH123/exec', 'recorded on the server');
    check(!/web app address isn.t recorded/.test(await text('home-next')), 'the hint is gone');
    await click('nav-settings');
    check((await value('settings-webapp-url')) === 'https://script.google.com/macros/s/AKfyBENCH123/exec', 'Settings shows it too');
    await click('settings-webapp-change');
    check((await value('settings-webapp-input')) === 'https://script.google.com/macros/s/AKfyBENCH123/exec', 'Change starts from the recorded address');
    await click('settings-webapp-cancel');
    await el('settings-webapp-url');
    check(!(await exists('setting-row-support.comment_text')), 'the comment question\'s text code is not in Settings');
    await checkTestNames('settings');
    await click('nav-publish');
    check(!(await exists('export-webapp-missing')), 'export has no "not recorded" warning any more');
    check(!(await exists('export-files')) && !(await exists('export-warning')), 'files prepared before the address was recorded are gone: they must be prepared again (21 Oct review)');
    await click('export');
    await idle();
    await el('export-files', 10000);
    check(!(await exists('export-warning')), 'files made with the address: no warning');
  });

  await step('Google account and permission problems get plain advice', async () => {
    await control('fail', { fn: 'panelSave', message: 'Exception: We\'re sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED.' });
    await click('nav-settings');
    await typeInto('setting-survey_id', 'valmo-partner-pulse-y');
    await click('save');
    await el('error-modal');
    check((await page.$eval(T('error-modal') + ' p', (e) => e.innerText)) === OTHER_ACCOUNT, 'other account: ' + (await text('error-modal')));
    await shot('fix-error-other-account');
    await click('error-retry');
    await waitSaved();
    await control('fail', { fn: 'panelValidate', message: 'Specified permissions are not sufficient to call DriveApp.getFolderById. Required permissions: https://www.googleapis.com/auth/drive' });
    await click('nav-publish');
    await click('check');
    await el('error-modal');
    check((await page.$eval(T('error-modal') + ' p', (e) => e.innerText)) === PERMISSIONS, 'permissions: ' + (await text('error-modal')));
    await click('error-close');
    await control('fail', { fn: 'panelLoad', message: 'Exception: Authorization is required to perform that action.' });
    await page.goto(base + '/panel', { waitUntil: 'load' });
    await el('load-error');
    check((await text('load-error')).indexOf(AUTHORIZATION) !== -1, '"Authorization is required" on load: both causes, the likely one first');
    check(!(await exists('load-error-setup-hint')), 'no "run Set up or repair" hint under a message that has its own advice');
    await click('load-retry');
    await page.waitForSelector(T('nav-home'), { visible: true, timeout: 8000 });
    await idle();
    /* 21 Oct review: the panel's own "another of your accounts" advice gets no set-up hint either. */
    await control('fail', { fn: 'panelLoad', message: "Exception: We're sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED." });
    await page.goto(base + '/panel', { waitUntil: 'load' });
    await el('load-error');
    check((await text('load-error')).indexOf(OTHER_ACCOUNT) !== -1, 'the other-account advice on load: ' + (await text('load-error')));
    check(!(await exists('load-error-setup-hint')), 'no set-up hint under the other-account advice');
    await click('load-retry');
    await page.waitForSelector(T('nav-home'), { visible: true, timeout: 8000 });
    await idle();
  });

  await step('a mistyped colour is explained at once, and Save mentions it', async () => {
    await click('nav-look');
    await typeInto('color-hex-error', '#B3261');
    check((await text('color-error-error')) === 'Use # and 6 characters, for example #4B2E83', 'message under the box: ' + (await text('color-error-error')));
    await typeInto('color-hex-text', '1B1B1F');
    check(!(await page.$eval(T('color-error-text'), (e) => e.innerText.trim())), 'six characters without # are fine (the # is added)');
    await shot('fix-colour-message');
    await click('save');
    await waitSaved();
    check(/Saved\. The colour code of “Error messages” is not valid yet \(Look & feel\): Use # and 6 characters, for example #4B2E83\./.test(await toastText()), 'save message: ' + (await toastText()));
    await typeInto('color-hex-error', '#B3261E');
    check(!(await page.$eval(T('color-error-error'), (e) => e.innerText.trim())), 'message gone once fixed');
    await click('save');
    await waitSaved();
    check(/Saved\. Partners don.t see it until you publish\./.test(await toastText()), 'normal save message again');
  });

  await step('Texts explainer keeps outside translators out of this Sheet', async () => {
    await click('nav-texts');
    await click('texts-explain-toggle');
    const t = await text('texts-explain');
    check(/copy the key, en and language columns of the Texts tab into a separate sheet/.test(t) && /Never share this Sheet with them/.test(t), 'explainer: ' + t);
    check(!/can also work in the Texts tab of this Sheet/.test(t), 'no suggestion to work in this Sheet');
  });

  await step('the window fits a small laptop screen, and every section scrolls inside it', async () => {
    await page.setViewport({ width: 1024, height: 520, deviceScaleFactor: 1 });
    await sleep(200);
    for (const sec of ['home', 'questions', 'areas', 'support', 'texts', 'look', 'rounds', 'links', 'publish', 'settings']) {
      await click('nav-' + sec);
      await idle();
      const m = await page.evaluate(() => {
        const main = document.getElementById('main');
        const doc = document.scrollingElement;
        main.scrollTop = main.scrollHeight;
        const last = main.querySelector('.main-inner').lastElementChild.getBoundingClientRect();
        const box = main.getBoundingClientRect();
        return { pageScroll: doc.scrollHeight - doc.clientHeight, mainScrolls: main.scrollHeight > main.clientHeight, lastVisible: last.bottom <= box.bottom + 1 && last.top < box.bottom, mainBottom: box.bottom, innerH: innerHeight };
      });
      check(m.pageScroll <= 0, sec + ': the page itself scrolls by ' + m.pageScroll + ' px');
      check(m.mainBottom <= m.innerH + 1, sec + ': the section area ends inside the window');
      check(m.lastVisible, sec + ': the end of the section can be scrolled into view');
      if (sec === 'publish' || sec === 'settings') await shot('fix-small-screen-' + sec);
    }
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    await control('nohost', { on: true });
    await openPanel();
    check((await page.evaluate(() => window.__ppHost.calls)) === 0, 'without Google\'s window controls nothing is resized');
    await control('nohost', { on: false });
  });

  await step('rule builder at 900 px: the remove button stays a small square', async () => {
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
    await click('nav-questions');
    await click('screen-edit-one_fix');
    await click('rule-mode-if');
    await el('rule-cond-0');
    await click('rule-add');
    await el('rule-cond-1');
    const sizes = await page.$$eval('[data-test^="rule-remove-"]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(sizes.length === 2 && sizes.every((s) => s[0] <= 36 && s[1] <= 36 && Math.abs(s[0] - s[1]) <= 2), 'small squares: ' + JSON.stringify(sizes));
    const bar = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const kids = Array.from(document.querySelectorAll('#topbar > *')).filter((e) => e.offsetParent !== null && !e.classList.contains('spacer')).map((e) => e.getBoundingClientRect());
      return { overlaps: kids.some((k, i) => i && kids[i - 1].right > k.left + 1), right: r('.top-actions').right, width: innerWidth };
    });
    check(!bar.overlaps && bar.right <= bar.width, 'top bar fits at 900 px with "Unsaved changes": ' + JSON.stringify(bar));
    const answer = await page.$eval(T('rule-answer-0'), (e) => e.getBoundingClientRect().width);
    check(answer > 300, 'the answer list uses the row: ' + answer);
    await shot('fix-w900-rule-builder');
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    const wide = await page.$$eval('[data-test^="rule-remove-"]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(wide.every((s) => s[0] <= 36 && s[1] <= 36), 'small squares when wide too: ' + JSON.stringify(wide));
    await click('discard');
    await click('modal-confirm');
    await idle();
  });

  /* 21 Oct 2026: Meesho-only mode. A web app open only to signed-in colleagues is recorded as such, the
     panel says what that means, and recording it again once it is open to "Anyone" puts everything back. */
  await step('a Meesho-only web app address is recorded as such, and the panel says what it means', async () => {
    await click('nav-home');
    await click('webapp-change');
    await typeInto('webapp-input', 'https://script.google.com/macros/s/AKfyCOMPANYONLY123/exec');
    await click('webapp-save');
    await idle();
    check(/Saved as Meesho-only: colleagues signed in with a company account can open the survey through the web app\./.test(await toastText()), 'toast: ' + (await toastText()));
    check(/^Meesho-only: the web app is open only to people signed in with a company account\./.test(await text('webapp-meesho-only')), 'note on Home: ' + (await text('webapp-meesho-only')));
    await shot('meesho-only-home');
    await click('nav-links');
    check(await exists('links-meesho-only'), 'the note in Links too');
    await click('nav-home');
    await click('webapp-change');
    await typeInto('webapp-input', 'https://script.google.com/macros/s/AKfyBENCH123/exec');
    await click('webapp-save');
    await idle();
    check(/open to anyone now/.test(await toastText()), 'toast after the switch to Anyone: ' + (await toastText()));
    check(!(await exists('webapp-meesho-only')), 'the Meesho-only note is gone from Home');
    await click('nav-links');
    check(!(await exists('links-meesho-only')), 'and from Links');
  });

  /* =====================================================================
     The reviewers' fixes of 26 Oct 2026 (Google side and panel): endings
     below the thank-you screen, Publish's warnings, and rules on the
     partner's language or the round. On a fresh Sheet with two short routes.
     ===================================================================== */
  /* The screens the form's own engine shows for some answers (the link says the language; no "what changed"). */
  function walkSurvey(survey, answers) {
    const sv = JSON.parse(JSON.stringify(survey));
    return FLOW.path(FLOW.load(sv), sv, { facts: { lang: 'en', lang_in_url: true, whats_changed_count: 0 } }, { answers: answers || {}, texts: {}, audio: {} }).map((x) => x.id);
  }
  async function issueTexts(kind) {
    return page.$$eval('[data-test^="issue-' + kind + '-"]', (els, k) => els.filter((e) => new RegExp('^issue-' + k + '-\\d+$').test(e.getAttribute('data-test'))).map((e) => e.innerText), kind);
  }

  await step('an ending below the thank-you screen: hiding or deleting it says what happens; a route never runs into another (the check stops it, "Go there" opens After this question)', async () => {
    await control('reset');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    const m = (await serverState()).model;
    const row = (o) => Object.assign({ id: '', type: '', text: '', required: null, show_if: null, skip_if: '', options: [], low_label: '', high_label: '',
      scale_hint: '', body: '', active: true, next: '', jumps: [], repeat: '' }, o);
    const words = (en) => { const v = {}; m.languages.forEach((l) => { v[l.code] = ''; }); v.en = en; return v; };
    m.screens.find((x) => x.id === 'nps').jumps = [{ when: { answer: 'nps', at_least: 9 }, goto: 'promo_q' }, { when: { answer: 'nps', at_most: 6 }, goto: 'detractor_q' }];
    m.screens.push(row({ id: 'promo_q', type: 'free_text', text: 'q.promo_q', required: false }),
      row({ id: 'promo_end', type: 'thank_you', text: 'end.promo_end.title', body: 'end.promo_end.body' }),
      row({ id: 'detractor_q', type: 'free_text', text: 'q.detractor_q', required: false }),
      row({ id: 'detractor_end', type: 'thank_you', text: 'end.detractor_end.title', body: 'end.detractor_end.body' }));
    [['q.promo_q', 'What do you like most about Valmo?'], ['q.detractor_q', 'What went wrong?'], ['end.promo_end.title', 'Thank you, fan!'],
      ['end.promo_end.body', 'Your answers were sent.'], ['end.detractor_end.title', 'Sorry to hear that.'], ['end.detractor_end.body', 'Your answers were sent.']]
      .forEach(([k, en]) => { m.texts[k] = words(en); m.text_notes[k] = ''; });
    await control('model', { model: m });
    await openPanel();
    await flowReady();
    await click('nav-questions');
    await el('screen-card-promo_end');
    // Hide: a hidden ending still ends the route, at the main thank-you screen (question 9); the panel says so first
    await click('screen-toggle-promo_end');
    await el('confirm-hide-ending');
    check(/^While it is hidden, partners who would reach it \(question 10, just above it, goes on to it\) end at the main thank-you screen \(question 9\) instead\. Their answers are still sent, and they never go on to the screens below it\.$/.test(await text('hide-ending-note')),
      'hiding says what will happen: ' + (await text('hide-ending-note')));
    await checkTestNames('hide an ending');
    await click('modal-confirm');
    const hidden = await page.evaluate(() => window.__ppTest.flowSurvey());
    check(JSON.stringify(walkSurvey(hidden, { nps: 10 })) === JSON.stringify(['nps', 'promo_q', 'thanks']), 'promoters end at the main thank-you screen: ' + walkSurvey(hidden, { nps: 10 }).join(' > '));
    check(JSON.stringify(walkSurvey(hidden, { nps: 2 })) === JSON.stringify(['nps', 'detractor_q', 'detractor_end']), 'detractors keep their route');
    const note = await page.$eval(T('screen-route-problem-promo_q'), (e) => e.innerText + ' | ' + e.getAttribute('title') + ' | ' + e.className);
    check(/route note: see the editor \| .*end at the main thank-you screen \(question 9\).*badge-warn/.test(note), 'the question above it has a warning badge saying so: ' + note);
    await click('screen-toggle-promo_end');
    // Delete: the question above would run on into the detractors' question; the dialog says so and offers "Hide it instead"
    await click('screen-delete-promo_end');
    await el('confirm-delete-screen');
    check(/^Question 10, just above this ending, has no “Usually go to”: it then goes on to question 12 \(“What went wrong\?”\), which starts another route, so Publish refuses until you choose where question 10 goes\. To keep its route ending here, hide this ending instead \(partners then end at the main thank-you screen \(question 9\)\), or set question 10’s “Usually go to” first \(Edit it > After this question\)\.$/
      .test(await text('delete-ending-note')), 'the delete dialog explains: ' + (await text('delete-ending-note')));
    await checkTestNames('delete an ending');
    await shot('ending-delete-dialog');
    await click('modal-hide-instead');
    check(/Hidden/.test(await text('screen-card-promo_end')), '"Hide it instead" hides it');
    await click('nav-publish');
    await click('check');
    await idle();
    check(/No problems/.test(await text('check-errors-count')), 'a hidden ending is no problem: ' + (await text('check-errors-count')));
    // Deleted for real: the check stops Publish, and "Go there" opens that question's "After this question"
    await click('nav-questions');
    await click('screen-toggle-promo_end');
    await click('screen-delete-promo_end');
    await el('confirm-delete-screen');
    await click('modal-confirm');
    await click('nav-publish');
    await click('check');
    await idle();
    const errors = await issueTexts('error');
    const at = errors.findIndex((t) => /has no "usually go to", so partners who answer it go straight on to question 11 \("What went wrong\?"\), which starts another route \(question 3 jumps there\)/.test(t));
    check(at !== -1, 'the check names the run-on: ' + errors.join(' | '));
    await click('issue-goto-error-' + at);
    await el('after-card');
    check(/^Question 10:/.test(await page.$eval('.editor-head h1', (e) => e.innerText)), 'Go there opens question 10');
    await page.waitForFunction(() => { const c = document.querySelector('[data-test="after-card"]'); return c && c.classList.contains('flash'); }, { timeout: 3000 });
    const targets = await page.$$eval(T('next-select') + ' option', (os) => os.map((o) => o.value + '=' + o.textContent));
    check(targets.some((t) => /^thanks=9\. The thank-you screen$/.test(t)), 'the main thank-you screen above it is offered (an ending): ' + targets.join(' / '));
    await select('next-select', 'thanks');
    check(/After this question, partners go to the thank-you screen \(question 9\)\./.test(await text('jump-sentence')), 'sentence: ' + (await text('jump-sentence')));
    await click('nav-publish');
    await click('check');
    await idle();
    check(/No problems/.test(await text('check-errors-count')), 'fixed: ' + (await issueTexts('error')).join(' | '));
    const now = await page.evaluate(() => window.__ppTest.flowSurvey());
    check(JSON.stringify(walkSurvey(now, { nps: 10 })) === JSON.stringify(['nps', 'promo_q', 'thanks']), 'promoters end at the main thank-you screen');
  });

  await step('Publish\'s warnings are shown in the "Version N is live" dialog', async () => {
    const warning = 'Published, but Partner Pulse could not check that the form on GitHub understands this version (the bench pretends). If partners keep seeing the old questions, upload the new form code to GitHub, wait for the green tick, then publish again.';
    await control('publish_warnings', { warnings: [warning] });
    await publishNow('Bench: a publish that needs a look');
    const shown = await text('published-warnings');
    check(/^Please check one thing:/.test(shown.trim()) && shown.indexOf(warning) !== -1, 'the warning is in the dialog: ' + shown);
    await checkTestNames('published dialog');
    await shot('published-warnings');
    await click('published-ok');
    await idle();
    await publishNow('Bench: a publish without warnings');
    check(!(await exists('published-warnings')), 'no warning box when there is nothing to check');
    await click('published-ok');
    await idle();
  });

  await step('"Show this question only if" also offers the partner\'s language and the round; the server checks such a rule', async () => {
    await click('nav-questions');
    await click('screen-edit-one_fix');
    await click('rule-mode-if');
    await el('rule-cond-0');
    const answers = await page.$$eval(T('rule-answer-0') + ' option', (os) => os.map((o) => o.value + '=' + o.textContent));
    check(answers.indexOf('@lang=The partner’s language') !== -1 && answers.indexOf('@round=The round') !== -1, 'the language and the round are offered: ' + answers.join(' / '));
    check((await value('rule-answer-0')).charAt(0) !== '@', 'a new rule still starts from the latest earlier answer: ' + (await value('rule-answer-0')));
    await select('rule-answer-0', '@lang');
    await select('rule-value-0', 'hi');
    check(/Partners see this question only if the partner’s language is “Hindi”\./.test(await text('rule-sentence')), 'sentence: ' + (await text('rule-sentence')));
    await checkTestNames('rule on the language');
    await click('save');
    await waitSaved();
    const saved = (await serverState()).model.screens.find((x) => x.id === 'one_fix');
    check(canon(saved.show_if) === canon({ fact: 'lang', equals: 'hi' }), 'saved as a rule on the language: ' + JSON.stringify(saved.show_if));
    await click('nav-publish');
    await click('check');
    await idle();
    check(/No problems/.test(await text('check-errors-count')), 'the server accepts it: ' + (await issueTexts('error')).join(' | '));
    if (REAL) {
      const node = nodeOf(serverSurvey((await serverState()).model).flow, 'one_fix');
      check(canon(node.show_if) === canon({ fact: 'lang', equals: 'hi' }), 'compiled: ' + JSON.stringify(node.show_if));
    }
    await click('nav-questions');
    await click('screen-edit-one_fix');
    await click('rule-mode-always');
    await click('editor-back');
    await click('save');
    await waitSaved();
  });

  await step('a broken jump is marked on that jump only, even when two jumps go to the same screen; with an older or failing route code the builders fall back to the earlier rows', async () => {
    await control('reset');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    const m = (await serverState()).model;
    // jump 1 works; jump 2 goes to the same screen but tests an answer that comes later (support_gate): it can never happen
    m.screens.find((x) => x.id === 'nps').jumps = [{ when: { answer: 'nps', at_least: 9 }, goto: 'one_fix' }, { when: { answer: 'support_gate', equals: 'yes' }, goto: 'one_fix' }];
    await control('model', { model: m });
    await openPanel();
    await flowReady();
    await click('nav-questions');
    check(/this jump can never happen/.test(await text('screen-jump-problem-nps')), 'the badge: ' + (await text('screen-jump-problem-nps')));
    check(/"support_gate"/.test(await page.$eval(T('screen-jump-problem-nps'), (e) => e.getAttribute('title'))), 'its tooltip is the checker\'s message');
    await click('screen-edit-nps');
    await el('after-card');
    const why = await text('jump-1-problem');
    check(/This jump can never happen\./.test(why) && /"support_gate"/.test(why) && /never comes before this jump/.test(why), 'jump 2 says why: ' + why);
    check(!(await exists('jump-0-problem')), 'jump 1 goes to the same screen and works: nothing is marked on it (the checker says which jump the problem is about)');
    const own = await page.$$eval(T('jump-0-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(own.some((t) => /^How likely are you to recommend/.test(t)) && own.indexOf('The partner’s language') !== -1, 'a jump may test the question\'s own answer and the language: ' + own.join(' / '));
    check(!own.some((t) => /^In the last 30 days/.test(t) || /^Rating of/.test(t)), 'never a later answer: ' + own.join(' / '));
    await shot('jump-problem-on-one-jump');
    await click('editor-back');
    await click('screen-edit-support');
    await click('rule-mode-if');
    const earlier = await page.$$eval(T('rule-answer-0') + ' option', (os) => os.map((o) => o.value));
    check(earlier.indexOf('support_gate') !== -1 && earlier.indexOf('fn_rating:payments') !== -1 && earlier.indexOf('nps') !== -1, 'a rule may test the answers before it: ' + earlier.join(', '));
    check(!earlier.some((v) => /^support:/.test(v) || v === 'one_fix'), 'not its own or later ones: ' + earlier.join(', '));
    await click('rule-mode-always');
    await click('editor-back');
    // an older route code (a Flow.gs from before 26 Oct 2026: no answersAt, findings without their place)
    await control('flow_code', { older: true });
    await openPanel();
    await flowReady();
    await click('nav-questions');
    check(/this jump can never happen/.test(await text('screen-jump-problem-nps')), 'older route code: the badge is still there (from the words of the message)');
    await click('screen-edit-nps');
    await el('after-card');
    check(/"support_gate"/.test(await text('jump-1-problem')), 'older route code: jump 2 is still marked');
    const older = await page.$$eval(T('jump-0-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(older.some((t) => /^How likely are you to recommend/.test(t)) && older.indexOf('The partner’s language') !== -1 && !older.some((t) => /^Rating of/.test(t)),
      'older route code: the jump builder falls back to the rows up to this one: ' + older.join(' / '));
    await click('editor-back');
    await click('screen-edit-support');
    await click('rule-mode-if');
    const olderRule = await page.$$eval(T('rule-answer-0') + ' option', (os) => os.map((o) => o.value));
    check(olderRule.indexOf('support_gate') !== -1 && !olderRule.some((v) => /^support:/.test(v)), 'older route code: the rule builder offers the earlier rows: ' + olderRule.join(', '));
    await click('rule-mode-always');
    await click('editor-back');
    // a route code whose answersAt fails: the route tools keep working, and the builders offer the earlier rows
    await control('flow_code', { failing: true });
    await openPanel();
    await flowReady();
    await click('nav-questions');
    check(!(await exists('flow-error-note')) && (await exists('open-map')), 'answersAt failing: the route tools keep working');
    check(/this jump can never happen/.test(await text('screen-jump-problem-nps')), 'answersAt failing: the badge is still there');
    await click('screen-edit-nps');
    await el('after-card');
    const failing = await page.$$eval(T('jump-0-answer-0') + ' option', (os) => os.map((o) => o.textContent));
    check(failing.some((t) => /^How likely are you to recommend/.test(t)) && failing.indexOf('The partner’s language') !== -1 && !failing.some((t) => /^Rating of/.test(t)),
      'answersAt failing: the jump builder falls back to the rows up to this one: ' + failing.join(' / '));
    await click('editor-back');
    await control('flow_code', { older: false });
    await control('reset');
    await openPanel();
    await flowReady();
  });

  await step('a kind of question added in web/js/types/ (the guide\'s example) comes with the list of kinds: the jump builder and Try a path know its answer', async () => {
    const types = screenTypesWithStars();
    const row = types.find((t) => t.type === 'stars_1_10');
    check(row && row.catalogue && row.catalogue.type === 'stars_1_10' && row.catalogue.answer && row.catalogue.answer.kind === 'number' && row.catalogue.answer.max === 10,
      'the list "types --write" makes carries the kind\'s whole description: ' + JSON.stringify(row || null).slice(0, 240));
    check(types.filter((t) => t.catalogue).length === 1, 'only the added kind carries one');
    await control('reset');
    await control('screen_types', { types });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await openPanel();
    await flowReady();
    await click('nav-questions');
    await click('add-question');
    await click('type-pick-stars_1_10');
    await typeInto('new-question-text', 'How many stars would you give us?');
    const code = 'how_many_stars_would_you_give_us';
    check((await text('new-question-code')).includes(code), 'code: ' + (await text('new-question-code')));
    await click('new-question-create');
    await el('after-card');
    await click('jump-add');
    await el('jump-0');
    const answers = await page.$$eval(T('jump-0-answer-0') + ' option', (os) => os.map((o) => o.value + '=' + o.textContent));
    check(answers.some((t) => t.indexOf(code + '=How many stars would you give us?') === 0), 'its own answer is offered: ' + answers.join(' / '));
    check((await value('jump-0-answer-0')) === code, 'a new jump starts from its own answer: ' + (await value('jump-0-answer-0')));
    await select('jump-0-test-0', 'at_least');
    const values = await page.$$eval(T('jump-0-value-0') + ' option', (os) => os.map((o) => o.value));
    check(values.join(',') === '1,2,3,4,5,6,7,8,9,10', 'its answer is 1 to 10, as the kind says: ' + values.join(','));
    await select('jump-0-value-0', '9');
    await select('jump-0-goto', 'thanks');
    await checkTestNames('a jump on an added kind');
    await click('editor-back');
    check(!(await exists('screen-jump-problem-' + code)), 'the jump can happen: no warning');
    await click('open-try');
    await el('try-inputs');
    const tryValues = await page.$$eval(T('try-answer-' + code) + ' option', (os) => os.map((o) => o.value));
    check(tryValues.join(',') === ',1,2,3,4,5,6,7,8,9,10', 'Try a path offers its answer: ' + tryValues.join(','));
    check(!(await exists('try-unknown')), 'and never says no screen stores it');
    await select('try-answer-' + code, '9');
    await click('try-sent-toggle');
    check(new RegExp('"' + code + '": 9').test(await text('try-sent-json')), 'its answer would be sent: ' + (await text('try-sent-json')).slice(0, 300));
    await shot('added-kind-try-a-path');
    await click('qview-back');
    await control('screen_types', { types: null });
    await control('reset');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await openPanel();
    await flowReady();
  });

  await step('no console errors or warnings', async () => {
    check(!consoleProblems.length, consoleProblems.join('\n'));
  });
}

main().catch((e) => { console.log('CRASH', e.stack); results.push(['FAIL', 'crash', e.message]); })
  .finally(async () => {
    try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
    try { if (server) server.close(); } catch (e) { /* ignore */ }
    const failed = results.filter((r) => r[0] === 'FAIL');
    const skipped = results.filter((r) => r[0] === 'SKIP');
    console.log('\n' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' + failed.length + ' failed' +
      (skipped.length ? ', ' + skipped.length + ' skipped (PP_STEPS)' : ''));
    failed.forEach((f) => console.log(' - ' + f[1] + ': ' + f[2]));
    process.exitCode = failed.length ? 1 : 0;
  });

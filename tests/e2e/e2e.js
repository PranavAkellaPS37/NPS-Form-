/* =============================================================================
   tests/e2e/e2e.js: end-to-end test of the survey form in a real Chrome.

   WHAT IT CHECKS (23 scenarios, A to X; there is no O)
     It starts the project's local test server (scripts/mock_server.py) on
     ports 8791-8795, opens the form in headless Chrome at phone size (360 x 740,
     an Android user agent) and goes through it like a partner: every screen,
     languages, voice notes (a fake microphone), read-aloud, a bad network with
     retries, closing the page mid-send, two open tabs, settings changed only
     through config, preview links, closed and not-yet-open rounds, and the
     published questionnaire coming from the backend. It then checks what the
     test server stored.

   HOW TO RUN IT (Terminal, in the project folder)
     First time only: cd tests && npm install && cd ..
     node tests/e2e/e2e.js            (about 5 minutes)
     ONLY=S node tests/e2e/e2e.js     (just one scenario, here S)
     The last line says how many scenarios passed (23 of 23 expected).

   WHAT IT READS / WRITES
     Reads web/ and scripts/mock_server.py. Writes screenshots and a server log
     to tests/e2e/shots, and the test server's fake data to folders named
     tests/e2e/data-XXXXXX (both ignored by git). Fake DCs only (DC-E2E-...).
     Never contacts Google.

   NEEDS
     Node.js 18+, Python 3.11+, Google Chrome in /Applications (or set
     CHROME_PATH), and puppeteer-core from tests/node_modules.
   ============================================================================= */
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/e2e/)
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'shots');
const SECRET = 'mock-dev-secret-not-for-production';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
fs.mkdirSync(OUT, { recursive: true });

const token = (dc, round) => crypto.createHmac('sha256', SECRET).update(`${dc}|${round}`).digest('base64url').slice(0, 22);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
// ONLY=Q,R node e2e.js runs just those scenarios (default: all of them).
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (letter) => !ONLY.length || ONLY.includes(letter);
const pass = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, err) => { results.push(['FAIL', name, String(err && err.stack || err)]); console.log('FAIL', name, err && err.stack || err); };

async function startServer(port, extra = [], opts = {}) {
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(__dirname, 'data-'));
  const env = Object.assign({}, process.env, opts.env || {});
  const proc = spawn('python3', [path.join(REPO, 'scripts/mock_server.py'), '--port', String(port), '--data-dir', dataDir, ...extra], { stdio: ['ignore', 'pipe', 'pipe'], env });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api?action=health`);
      if (r.ok) return { proc, dataDir, port, log: () => log };
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  proc.kill();
  throw new Error('mock server did not start:\n' + log);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function newPage(browser, opts = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setUserAgent(ANDROID_UA);
  await page.setViewport({ width: opts.width || 360, height: opts.height || 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.consoleMessages = [];
  page.on('console', (m) => page.consoleMessages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => page.consoleMessages.push(`pageerror: ${e.message}`));
  return { page, context };
}

const screenId = (page) => page.evaluate(() => (history.state && history.state.pp) || null);
async function waitScreen(page, id, timeout = 6000) {
  try {
    await page.waitForFunction((want) => history.state && history.state.pp === want, { timeout }, id);
  } catch (e) {
    throw new Error(`expected screen ${id}, got ${await screenId(page)}`);
  }
  await sleep(600); // the form ignores taps for 500 ms after a screen appears
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); }
async function clickNth(page, sel, i) {
  await page.waitForSelector(sel);
  const els = await page.$$(sel);
  if (!els[i]) throw new Error(`no element ${sel} [${i}] (found ${els.length})`);
  await els[i].evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await els[i].click();
}
async function tap(page, sel) { return clickNth(page, sel, 0); }
async function noHorizontalScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (w[0] > w[1] + 1) throw new Error(`${label}: page is wider than the screen (${w[0]} > ${w[1]})`);
}
async function holdMic(page, ms) {
  const mic = await page.waitForSelector('.mic-btn:not([hidden])');
  await mic.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const box = await mic.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}
async function text(page, sel) { return page.$eval(sel, (e) => e.textContent.trim()); }

/* ---- Phase 2 helpers: the "bootstrap" (published questionnaire) ---- */
const isBootstrap = (req) => req.method() === 'GET' && /[?&]action=bootstrap(&|$)/.test(req.url());
// Drop "_" notes at every level, like the live backend's compile does.
const stripNotes = (v) => Array.isArray(v) ? v.map(stripNotes)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, stripNotes(x)]))
  : v;
// A bootstrap answer shaped like docs/control-panel-design.md section 12, built from a survey.json + strings.json.
function bootstrapFrom(cfg, strings, opts = {}) {
  const survey = stripNotes(JSON.parse(JSON.stringify(cfg)));
  delete survey.links;
  if (survey.backend) { delete survey.backend.mode; delete survey.backend.mock_url; delete survey.backend.apps_script_url; }
  return {
    ok: true, draft: Boolean(opts.draft), round: { id: opts.round || 'DEMO-R1', status: opts.status || 'open' },
    version: opts.version === undefined ? 7 : opts.version, config_version: opts.config_version || survey.config_version,
    survey, strings: stripNotes(strings), whats_changed: opts.whats_changed || { title: null, items: [] }, clips: opts.clips || {}
  };
}
// The mock server's own bootstrap answer for a request (fetched from Node, so it can be edited before the page sees it).
async function realBootstrap(url) { return (await fetch(url)).json(); }
const respondJSON = (req, obj) => req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
const finalText = (page) => page.evaluate(() => { const f = document.querySelector('.final'); return f ? f.textContent : ''; });
async function waitFinal(page, re, timeout = 8000) {
  try { await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout, polling: 100 }, re.source); }
  catch (e) { throw new Error(`expected an end screen matching ${re}, got "${(await finalText(page)).slice(0, 120)}" on ${await screenId(page)}`); }
}
const SURVEY_JSON = () => JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const STRINGS_JSON = () => JSON.parse(fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8'));
const WC_JSON = () => JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/whats_changed.json'), 'utf8'));
const six = (en) => ({ en, hi: en, ta: '[TRANSLATE] ' + en, te: '[TRANSLATE] ' + en, kn: '[TRANSLATE] ' + en, ml: '[TRANSLATE] ' + en });
// Answer the standard questionnaire from the NPS screen to the end: all areas 5, support No, one_fix empty.
async function quickFinish(page, opts = {}) {
  await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', opts.nps === undefined ? 8 : opts.nps);
  for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
  await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 1);
  await waitScreen(page, 'one_fix'); await page.click('#nav-next');
}

(async () => {
  const main = await startServer(8791);
  const strict = await startServer(8792, ['--strict']);
  const once = await startServer(8793, ['--one-response-per-dc']);
  const flags = await startServer(8794, ['--closed-rounds', 'CLOSED-R1', '--draft-rounds', 'DRAFT-R1']);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--lang=en-IN']
  });
  const browserNoMic = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=en-IN'] });

  const base = (srv) => `http://localhost:${srv.port}/`;
  const linkFor = (srv, dc, round, lang) => `${base(srv)}?dc=${dc}&t=${token(dc, round)}&round=${round}` + (lang ? `&lang=${lang}` : '');

  /* ---------------- A: Hindi full path with voice note ---------------- */
  if (want('A')) try {
    const { page, context } = await newPage(browser);
    const bytes = { total: 0, list: [] };
    page.on('response', async (r) => {
      try { const b = await r.buffer(); bytes.total += b.length; bytes.list.push([r.url(), b.length]); } catch (e) { /* ignore */ }
    });
    await page.goto(linkFor(main, 'DC-DEMO-002', 'DEMO-R1', 'hi'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    await noHorizontalScroll(page, 'whats_changed');
    await shot(page, 'A01-hi-whats-changed');
    const banner = await text(page, '#dev-banner');
    assert(banner.includes('टेस्ट मोड'), 'Hindi test-mode banner: ' + banner);
    assert.strictEqual(await page.$eval('html', (e) => e.lang), 'hi-IN');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await shot(page, 'A02-hi-nps');
    await noHorizontalScroll(page, 'nps');
    await clickNth(page, '.nps-chip', 6);
    await waitScreen(page, 'fn_rating:losses');
    await shot(page, 'A03-hi-fn-rating');
    await noHorizontalScroll(page, 'fn rating');
    const ratings = { losses: 2, payments: 4, linehaul: 3, consumables: 'na', orders: 5, app: 1 };
    const order = ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app'];
    for (let i = 0; i < order.length; i++) {
      const fn = order[i];
      await waitScreen(page, 'fn_rating:' + fn);
      if (ratings[fn] === 'na') await tap(page, '.na-btn');
      else await clickNth(page, '.faces .face', ratings[fn] - 1);
    }
    // deep dive: losses (2) -> chip no_proof + voice note
    await waitScreen(page, 'fn_deep_dive:losses');
    await shot(page, 'A04-hi-deep-dive');
    await noHorizontalScroll(page, 'deep dive');
    await clickNth(page, '.chip', 1);
    await tap(page, '.mic-btn');                       // first press -> consent
    await page.waitForSelector('.consent:not([hidden])');
    await shot(page, 'A05-hi-consent');
    await tap(page, '.consent .btn-primary');
    await page.waitForFunction(() => /बटन/.test(document.querySelector('.rec-status').textContent), { timeout: 5000 });
    await holdMic(page, 2600);
    await page.waitForSelector('.clip-row:not([hidden])', { timeout: 6000 });
    await shot(page, 'A06-hi-voice-recorded');
    const clipLabel = await text(page, '.clip-time');
    assert(/^0:0[2-3]$/.test(clipLabel), 'clip duration label ' + clipLabel);
    await page.click('#nav-next');
    // deep dive: linehaul (3) -> Other requires detail
    await waitScreen(page, 'fn_deep_dive:linehaul');
    await clickNth(page, '.chip', 5);                  // "other"
    assert(!(await page.$eval('.hint.is-error', (e) => e.hidden)), 'other-needs-detail hint visible');
    assert(!(await text(page, '.sub-title')).includes('ज़रूरी नहीं'), 'heading drops (optional) when Other is picked');
    await page.click('#nav-next');
    await sleep(300);
    assert.strictEqual(await screenId(page), 'fn_deep_dive:linehaul', 'blocked without detail');
    assert(!(await page.$eval('#toast', (e) => e.hidden)), 'blocked hint shown');
    await tap(page, '.type-row .link-btn');
    await page.type('.text-input', 'truck aata hai raat 2 baje, staff nahi hota');
    await page.click('#nav-next');
    // deep dive: app (1)
    await waitScreen(page, 'fn_deep_dive:app');
    await clickNth(page, '.chip', 0);
    await page.click('#nav-next');
    // support yes
    await waitScreen(page, 'support_gate');
    await shot(page, 'A07-hi-support-gate');
    await clickNth(page, '.yesno .choice', 0);
    await waitScreen(page, 'support');
    await page.click('#nav-next');                      // blocked: rows missing
    await sleep(200);
    assert.strictEqual(await screenId(page), 'support');
    const missing = await page.$$eval('.srow.is-missing', (e) => e.length);
    assert.strictEqual(missing, 4, 'all rows flagged missing');
    for (let r = 0; r < 4; r++) {
      const rows = await page.$$('.srow');
      const faces = await rows[r].$$('.face');
      const target = faces[[3, 2, 1, 4][r]];
      await target.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await target.click();
    }
    await shot(page, 'A08-hi-support-block');
    await noHorizontalScroll(page, 'support');
    await page.click('#nav-next');
    await waitScreen(page, 'one_fix');
    assert.strictEqual(await text(page, '#nav-next'), 'भेजें', 'last question shows Submit (Hindi)');
    await tap(page, '.type-row .link-btn');
    await page.type('.text-input', 'पेमेंट समय पर आए');
    await shot(page, 'A09-hi-one-fix');
    await page.click('#nav-next');
    await page.waitForFunction(() => /धन्यवाद/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 10000 });
    await shot(page, 'A10-hi-thanks');
    await sleep(300);
    // server-side check
    const subs = readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((s) => s.dc === 'DC-DEMO-002');
    assert.strictEqual(subs.length, 1, 'exactly one stored submission');
    const s = subs[0];
    assert.strictEqual(s.lang, 'hi');
    assert.strictEqual(s.answers.nps, 6);
    assert.strictEqual(s.answers.support_gate, 'yes');
    assert.strictEqual(s.token_valid, true);
    assert(!('t' in s), 't dropped by server');
    const fr = Object.fromEntries(s.ratings.filter((r) => r.block === 'function').map((r) => [r.item, r]));
    assert.strictEqual(fr.losses.rating, 2); assert.strictEqual(fr.losses.issue_code, 'no_proof');
    assert.strictEqual(fr.linehaul.issue_code, 'other');
    assert.strictEqual(fr.consumables.not_applicable, true);
    assert.strictEqual(fr.app.issue_code, 'app_slow_crash');
    assert.strictEqual(fr.payments.issue_code, null);
    assert.strictEqual(s.ratings.filter((r) => r.block === 'support').length, 4);
    const ft = Object.fromEntries(s.free_text.map((f) => [f.item_id, f]));
    assert(ft['fn_deep_dive:losses'].audio && ft['fn_deep_dive:losses'].audio.file, 'voice note stored as file');
    assert(!('base64' in ft['fn_deep_dive:losses'].audio), 'base64 removed');
    const audioPath = path.join(main.dataDir, ft['fn_deep_dive:losses'].audio.file);
    assert(fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000, 'audio file on disk ' + audioPath);
    assert(ft['fn_deep_dive:losses'].audio.mime.startsWith('audio/webm'), 'webm mime');
    assert.strictEqual(ft['fn_deep_dive:linehaul'].text, 'truck aata hai raat 2 baje, staff nahi hota');
    assert.strictEqual(ft['one_fix'].text, 'पेमेंट समय पर आए');
    assert.strictEqual(ft['one_fix'].block, 'one_fix');
    const evScreens = s.events.map((e) => e.screen);
    assert.strictEqual(evScreens[0], 'whats_changed'); assert.strictEqual(evScreens[evScreens.length - 1], 'thanks');
    assert(s.opened_at && s.started_at && s.submitted_at && s.sent_at, 'timestamps');
    assert(s.client && s.client.voice_supported === true, 'client info');
    // pings
    const pings = readJsonl(path.join(main.dataDir, 'events.jsonl')).filter((p) => p.dc === 'DC-DEMO-002');
    const stages = pings.map((p) => p.stage);
    assert(stages.includes('opened') && stages.includes('started'), 'opened + started pings: ' + stages);
    // phone storage cleaned after success
    const leftover = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('audio:')).length);
    assert.strictEqual(leftover, 0, 'voice notes removed from phone after send');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:DEMO-R1:DC-DEMO-002')));
    assert.strictEqual(stored.submitted, true); assert.deepStrictEqual(stored.answers, {});
    // page weight (everything the page downloaded, voice notes excluded)
    console.log('   page transfer (uncompressed bytes):', bytes.total);
    fs.writeFileSync(path.join(OUT, 'A-bytes.json'), JSON.stringify(bytes.list, null, 1));
    // reopen the link: "already received"
    await page.goto(linkFor(main, 'DC-DEMO-002', 'DEMO-R1', 'hi'), { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => /पहले ही/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 5000 });
    await shot(page, 'A11-hi-already');
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
    assert.deepStrictEqual(errs, [], 'no console errors');
    await context.close();
    pass('A: Hindi full path with voice note, Other+text, support block, stored correctly');
  } catch (e) { fail('A: Hindi full path', e); }

  /* ---------------- B: English, language picker, back + change prunes deep dive ---------------- */
  if (want('B')) try {
    const { page, context } = await newPage(browser);
    await page.goto(linkFor(main, 'DC-DEMO-004', 'DEMO-R1', null), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'language');
    await shot(page, 'B01-language-picker');
    assert.strictEqual(await page.$eval('#navbar', (e) => e.hidden), true, 'no empty nav bar on first screen');
    await clickNth(page, '.lang-choice', 0); // English
    await waitScreen(page, 'whats_changed');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await shot(page, 'B02-en-nps');
    await clickNth(page, '.nps-chip', 9);
    const plan = [5, 2, 5, 5, 5, 5];
    const order = ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app'];
    for (let i = 0; i < 6; i++) { await waitScreen(page, 'fn_rating:' + order[i]); await clickNth(page, '.faces .face', plan[i] - 1); }
    await waitScreen(page, 'fn_deep_dive:payments');
    await shot(page, 'B03-en-deep-dive');
    await clickNth(page, '.chip', 0);
    // go back to the payments rating via the on-screen Back button (6 steps back: app, orders, consumables, linehaul, payments)
    for (const back of ['app', 'orders', 'consumables', 'linehaul', 'payments']) { await page.click('#nav-back'); await waitScreen(page, 'fn_rating:' + back); }
    assert.strictEqual(await page.$eval('.faces .face.is-selected .face-label', (e) => e.textContent), 'Bad', 'previous answer shown');
    assert.strictEqual(await page.$eval('#nav-next', (e) => e.hidden), false, 'Next visible on answered auto screen');
    await clickNth(page, '.faces .face', 4); // change to 5 -> deep dive disappears
    await waitScreen(page, 'fn_rating:linehaul'); // auto-advanced
    for (const fn of ['consumables', 'orders', 'app']) { await page.click('#nav-next'); await waitScreen(page, 'fn_rating:' + fn); }
    await page.click('#nav-next');
    await waitScreen(page, 'support_gate');
    // phone back button
    await page.goBack(); await waitScreen(page, 'fn_rating:app');
    await page.goForward(); await waitScreen(page, 'support_gate');
    await clickNth(page, '.yesno .choice', 1); // No
    await waitScreen(page, 'one_fix');
    assert.strictEqual(await text(page, '#nav-next'), 'Submit');
    await shot(page, 'B04-en-one-fix');
    // switch language from the top bar mid-way
    await page.click('#lang-btn');
    await page.waitForSelector('.sheet');
    await shot(page, 'B05-language-sheet');
    await clickNth(page, '.sheet .lang-choice', 1); // Hindi
    await page.waitForFunction(() => document.documentElement.lang === 'hi-IN');
    assert.strictEqual(await text(page, '#nav-next'), 'भेजें');
    await page.click('#lang-btn'); await page.waitForSelector('.sheet'); await clickNth(page, '.sheet .lang-choice', 2); // Tamil (placeholders)
    await page.waitForFunction(() => document.documentElement.lang === 'ta-IN');
    const q = await text(page, '.q-title');
    assert(!q.includes('[TRANSLATE]'), 'placeholder tag hidden from partners: ' + q);
    const banner = await text(page, '#dev-banner');
    assert(/\d+ texts not translated yet/.test(banner), 'untranslated count in banner: ' + banner);
    await shot(page, 'B06-ta-placeholder');
    await page.click('#nav-next'); // submit with nothing typed
    await page.waitForFunction(() => document.querySelector('.final .big-icon'), { timeout: 10000 });
    await sleep(300);
    const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-004');
    assert(s, 'stored');
    assert.strictEqual(s.lang, 'ta');
    assert.strictEqual(s.answers.nps, 9);
    assert.strictEqual(s.answers.support_gate, 'no');
    const pay = s.ratings.find((r) => r.item === 'payments');
    assert.strictEqual(pay.rating, 5); assert.strictEqual(pay.issue_code, null, 'pruned chip');
    assert.strictEqual(s.free_text.length, 0, 'no free text');
    assert.strictEqual(s.ratings.filter((r) => r.block === 'support').length, 0);
    assert(s.events.some((e) => e.screen === 'fn_deep_dive:payments'), 'events still record the visit');
    // history collapsed: back now leaves the survey (goes to about:blank-like previous page or stays)
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
    assert.deepStrictEqual(errs, [], 'no console errors');
    await context.close();
    pass('B: picker, back/forward, answer change prunes deep dive, language switch, Tamil placeholders hidden');
  } catch (e) { fail('B: English path', e); }

  /* ---------------- C: resume after reload + offline retry + idempotent resend ---------------- */
  if (want('C')) try {
    const { page, context } = await newPage(browser);
    const url = linkFor(main, 'DC-DEMO-005', 'DEMO-R1', 'en');
    await page.goto(url, { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await clickNth(page, '.nps-chip', 3);
    await waitScreen(page, 'fn_rating:losses');
    await clickNth(page, '.faces .face', 0);
    await waitScreen(page, 'fn_rating:payments');
    await page.reload({ waitUntil: 'networkidle0' });
    await waitScreen(page, 'fn_rating:payments');
    assert(!(await page.$eval('#notice', (e) => e.hidden)), 'welcome back notice');
    await shot(page, 'C01-resumed');
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses');
    await clickNth(page, '.chip', 2);
    await page.click('#nav-next');
    await waitScreen(page, 'support_gate');
    await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix');
    // go offline, then submit
    await page.setOfflineMode(true);
    await page.click('#nav-next');
    await page.waitForFunction(() => document.querySelector('.final .btn-primary'), { timeout: 15000 });
    await shot(page, 'C02-offline-failed');
    const failedText = await text(page, '.final');
    assert(/Could not send/.test(failedText) && /Trying again in \d+ s/.test(failedText), failedText);
    // reload while still offline? (config may come from cache) -> skip; come back online instead
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => document.querySelector('.final .big-icon') && !document.querySelector('.final .btn-primary'), { timeout: 15000 });
    await shot(page, 'C03-sent-after-online');
    await sleep(300);
    const subs = readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-005');
    assert.strictEqual(subs.length, 1);
    assert.strictEqual(subs[0].resume_count, 1, 'resume counted');
    assert(subs[0].attempt >= 2, 'attempt counter ' + subs[0].attempt);
    // idempotency: resend the identical submission via fetch -> duplicate
    const dup = await page.evaluate(async (sid) => {
      const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ kind: 'submit', schema_version: 1, submission_id: sid, session_id: 's', dc: 'DC-DEMO-005', t: '', round: 'DEMO-R1', lang: 'en', answers: {}, ratings: [], free_text: [], events: [] }) });
      return r.json();
    }, subs[0].submission_id);
    assert.strictEqual(dup.ok, true); assert.strictEqual(dup.duplicate, true);
    assert.strictEqual(readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-005').length, 1);
    await context.close();
    pass('C: resume after reload, offline failure + countdown, auto-retry when online, idempotent');
  } catch (e) { fail('C: resume + offline', e); }

  /* ---------------- D: strict server -> bad link; one-response-per-dc -> already ---------------- */
  if (want('D')) try {
    const { page, context } = await newPage(browser);
    await page.goto(`${base(strict)}?dc=DC-DEMO-001&t=AAAAAAAAAAAAAAAAAAAAAA&round=DEMO-R1&lang=en`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => /not valid/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 6000 });
    assert.strictEqual(await page.$eval('#progress', (e) => e.hidden), true, 'no progress bar on the "link not valid" screen');
    await shot(page, 'D01-bad-link');
    await page.goto(linkFor(once, 'DC-DEMO-001', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    // store a submission for DC-DEMO-001 directly, then open a fresh device
    await page.evaluate(async (t) => {
      await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ kind: 'submit', schema_version: 1, submission_id: 'sub_e2eonce', session_id: 's', dc: 'DC-DEMO-001', t, round: 'DEMO-R1', lang: 'en', answers: { nps: 7 }, ratings: [], free_text: [], events: [] }) });
    }, token('DC-DEMO-001', 'DEMO-R1'));
    await context.close();
    const p2 = await newPage(browser);
    await p2.page.goto(linkFor(once, 'DC-DEMO-001', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await p2.page.waitForFunction(() => /Already received/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 6000 });
    await shot(p2.page, 'D02-already-from-server');
    await p2.context.close();
    pass('D: invalid token (strict) and already-received (one per DC)');
  } catch (e) { fail('D: strict / already', e); }

  /* ---------------- E: live mode via config override: incomplete link + CORS to "Apps Script" ---------------- */
  if (want('E')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    const surveyRaw = fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8');
    const live = JSON.parse(surveyRaw);
    live.backend.mode = 'apps_script';
    live.backend.apps_script_url = `http://127.0.0.1:${main.port}/api`; // different origin than localhost -> real CORS
    const boots = [];
    page.on('request', (req) => {
      if (isBootstrap(req)) boots.push(req.url());
      if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(live) });
      else req.continue();
    });
    await page.goto(`${base(main)}?dc=DC-DEMO-006&round=DEMO-R1`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => /incomplete/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 6000 });
    assert.strictEqual(await page.$eval('#dev-banner', (e) => e.hidden), true, 'no test banner in live mode');
    assert.strictEqual(await page.$eval('#progress', (e) => e.hidden), true, 'no progress bar on the "link incomplete" screen');
    assert.deepStrictEqual(boots, [], 'a live link without a token never asks the backend for the questionnaire');
    await shot(page, 'E01-incomplete-link');
    await page.goto(linkFor(main, 'DC-DEMO-006', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed'); // loaded from the cross-origin "backend"
    assert.strictEqual(boots.length, 1, 'the complete link asks once: ' + boots);
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await clickNth(page, '.nps-chip', 10);
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 3); }
    await waitScreen(page, 'support_gate');
    await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix');
    await page.click('#nav-next');
    await page.waitForFunction(() => document.querySelector('.final .big-icon') && /Thank you/.test(document.querySelector('.final').textContent), { timeout: 10000 });
    await sleep(300);
    const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-006');
    assert(s && s.mode === 'live', 'stored with mode live');
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m) && !/favicon/.test(m));
    assert.deepStrictEqual(errs, [], 'no console (CORS) errors');
    await context.close();
    pass('E: live mode: incomplete link screen, cross-origin text/plain POST works without preflight');
  } catch (e) { fail('E: live mode', e); }

  /* ---------------- F: microphone blocked -> text box ---------------- */
  if (want('F')) try {
    const { page, context } = await newPage(browserNoMic);
    await page.goto(linkFor(main, 'DC-DEMO-007', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await clickNth(page, '.nps-chip', 0);
    await waitScreen(page, 'fn_rating:losses');
    await clickNth(page, '.faces .face', 0);
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses');
    await tap(page, '.mic-btn');
    await tap(page, '.consent .btn-primary');
    await page.waitForSelector('.text-input:not([hidden])', { timeout: 6000 });
    const st = await text(page, '.rec-status');
    assert(/mic is not available/.test(st), 'denied message: ' + st);
    assert.strictEqual(await page.$eval('.mic-btn', (e) => e.hidden), true, 'mic hidden');
    await shot(page, 'F01-mic-denied');
    await clickNth(page, '.chip', 0);
    await page.click('#nav-next');
    await waitScreen(page, 'support_gate');
    await clickNth(page, '.yesno .choice', 0);
    await waitScreen(page, 'support');
    assert.strictEqual(await page.$eval('.mic-btn', (e) => e.hidden), true, 'mic stays hidden on later screens');
    assert.strictEqual(await page.$eval('.text-input', (e) => e.hidden), false, 'text box shown directly');
    await context.close();
    pass('F: microphone blocked -> graceful fallback to typing, remembered');
  } catch (e) { fail('F: mic denied', e); }

  /* ---------------- G: read-aloud with a pre-recorded clip (speaker appears) ---------------- */
  if (want('G')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    // Phase 2: pre-recorded clips arrive with the published questionnaire (bootstrap).
    const clips = { 'q.nps': { hi: 'audio/hi/test.mp3' }, 'nps.scale_hint': { hi: 'audio/hi/test.mp3' } };
    page.on('request', async (req) => {
      if (isBootstrap(req)) { const b = await realBootstrap(req.url()); b.clips = clips; respondJSON(req, b); }
      else req.continue();
    });
    await page.goto(linkFor(main, 'DC-DEMO-008', 'DEMO-R1', 'hi'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await sleep(500);
    assert.deepStrictEqual(await page.evaluate(() => window.PP.speech.clips), clips, 'clips taken from the bootstrap');
    const speakerVisible = await page.$eval('.speak-btn', (e) => !e.hidden);
    assert(speakerVisible, 'speaker shown when clips cover all texts');
    await clickNth(page, '.nps-chip', 5);
    await waitScreen(page, 'fn_rating:losses');
    await sleep(300);
    const voices = await page.evaluate(() => speechSynthesis.getVoices().map((v) => v.lang));
    const fnSpeaker = await page.$eval('.speak-btn', (e) => !e.hidden);
    console.log('   headless voices:', voices.length, 'speaker on area screen:', fnSpeaker);
    assert.strictEqual(fnSpeaker, voices.some((l) => /^hi/i.test(l)), 'speaker hidden iff no hi voice + no clip');
    await context.close();
    pass('G: read-aloud: clip makes speaker appear; hidden when no voice for the language');
  } catch (e) { fail('G: read-aloud', e); }

  /* ---------------- H: wide desktop + tiny phone layout ---------------- */
  if (want('H')) try {
    for (const [w, hgt, tag] of [[320, 568, 'tiny'], [1280, 800, 'desktop']]) {
      const { page, context } = await newPage(browser, { width: w, height: hgt });
      await page.goto(linkFor(main, 'DC-DEMO-009', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
      await waitScreen(page, 'whats_changed'); await page.click('#nav-next');
      await waitScreen(page, 'nps'); await noHorizontalScroll(page, tag + ' nps'); await shot(page, `H-${tag}-nps`);
      await clickNth(page, '.nps-chip', 2);
      await waitScreen(page, 'fn_rating:losses'); await noHorizontalScroll(page, tag + ' face'); await shot(page, `H-${tag}-face`);
      await clickNth(page, '.faces .face', 0);
      for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
      await waitScreen(page, 'fn_deep_dive:losses'); await noHorizontalScroll(page, tag + ' deep'); await shot(page, `H-${tag}-deep-dive`);
      await context.close();
    }
    pass('H: no sideways scrolling at 320px and desktop widths');
  } catch (e) { fail('H: layouts', e); }

  /* ---------------- I: questionnaire changed ONLY through config ---------------- */
  if (want('I')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
    const strings = JSON.parse(fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8'));
    cfg.deep_dive.when = 'immediate';
    cfg.voice.gesture = 'tap'; cfg.voice.max_seconds = 4; cfg.voice.min_seconds = 2;
    cfg.functions[1].threshold = 2; // payments: a 3 is no longer "low"
    cfg.read_aloud.enabled = false;
    cfg.telemetry.enabled = false;
    cfg.support.allow_not_applicable = true;
    const at = (id) => cfg.flow.findIndex((x) => x.id === id);
    cfg.flow.splice(at('nps'), 0, { id: 'intro', type: 'info_card', text: 'x.intro_title', body: 'x.intro_body' });
    cfg.flow.splice(at('nps') + 1, 0,
      { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner', 'captain', 'other'], required: true },
      { id: 'app_ease', type: 'rating_1_5', text: 'q.app_ease', required: true, show_if: { answer: 'nps', at_most: 6 } });
    cfg.flow.splice(at('thanks'), 0, { id: 'callback_note', type: 'free_text', text: 'q.callback_note', required: true, show_if: { answer: 'one_fix', answered: true } });
    Object.assign(strings, {
      'x.intro_title': six('Two extra questions this round'), 'x.intro_body': six('They take 10 seconds.'),
      'q.role': six('What is your role?'), 'choice.role.owner': six('Owner'), 'choice.role.captain': six('Captain'), 'choice.role.other': six('Other role'),
      'q.app_ease': six('How easy is the partner app?'), 'q.callback_note': six('Best time for us to call you back?')
    });
    // Phase 2: the changed questionnaire is what the backend publishes (bootstrap);
    // the form's own copy is changed too, as a developer would refresh it.
    const wcDemo = WC_JSON().rounds['DEMO-R1'];
    page.on('request', (req) => {
      if (isBootstrap(req)) respondJSON(req, bootstrapFrom(cfg, strings, { round: 'DEMO-R1', whats_changed: wcDemo }));
      else if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) });
      else if (req.url().endsWith('/i18n/strings.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(strings) });
      else req.continue();
    });
    await page.goto(linkFor(main, 'DC-DEMO-020', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    assert.strictEqual(await page.$$eval('.speak-btn:not([hidden])', (e) => e.length), 0, 'read-aloud disabled by config');
    await page.click('#nav-next');
    await waitScreen(page, 'intro');
    assert.strictEqual(await text(page, '#nav-next'), 'Continue');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    await clickNth(page, '.nps-chip', 5);
    await waitScreen(page, 'role');
    await shot(page, 'I01-single-choice');
    await clickNth(page, '.chip', 1); // captain
    await waitScreen(page, 'app_ease'); // shown because nps <= 6
    await clickNth(page, '.faces .face', 3);
    await waitScreen(page, 'fn_rating:losses');
    await clickNth(page, '.faces .face', 1); // 2 -> immediate deep dive
    await waitScreen(page, 'fn_deep_dive:losses');
    await clickNth(page, '.chip', 0);
    // tap mode: consent, then a 1 s note (too short, min 2 s), then a long note (auto-stops at 4 s)
    await tap(page, '.mic-btn');
    await tap(page, '.consent .btn-primary');
    await page.waitForFunction(() => /tap the button/i.test(document.querySelector('.rec-status').textContent), { timeout: 5000 });
    await tap(page, '.mic-btn');
    await page.waitForFunction(() => document.querySelector('.mic-btn').classList.contains('is-recording'), { timeout: 5000 });
    await sleep(1000);
    await tap(page, '.mic-btn');
    await page.waitForFunction(() => /Too short/.test(document.querySelector('.rec-status').textContent), { timeout: 5000 });
    assert(/Tap once/.test(await text(page, '.rec-status')), 'tap-mode wording for too short');
    await tap(page, '.mic-btn');
    await page.waitForFunction(() => document.querySelector('.mic-btn').classList.contains('is-recording'), { timeout: 5000 });
    await page.waitForSelector('.clip-row:not([hidden])', { timeout: 9000 }); // stops itself at max_seconds
    const clip = await text(page, '.clip-time');
    assert(clip === '0:04', 'auto-stopped at 4 s, got ' + clip);
    await page.click('#nav-next');
    await waitScreen(page, 'fn_rating:payments');
    await clickNth(page, '.faces .face', 2); // 3: not low for payments (threshold 2)
    await waitScreen(page, 'fn_rating:linehaul');
    for (const fn of ['linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'support_gate');
    await clickNth(page, '.yesno .choice', 0);
    await waitScreen(page, 'support');
    const naCount = await page.$$eval('.srow .na-btn', (e) => e.length);
    assert.strictEqual(naCount, 4, 'support N/A link per row when enabled');
    for (let r = 0; r < 3; r++) {
      const rows = await page.$$('.srow');
      const f = (await rows[r].$$('.face'))[3];
      await f.evaluate((e) => e.scrollIntoView({ block: 'center' })); await f.click();
    }
    const rows = await page.$$('.srow');
    const na = await rows[3].$('.na-btn');
    await na.evaluate((e) => e.scrollIntoView({ block: 'center' })); await na.click();
    await shot(page, 'I02-support-na');
    await page.click('#nav-next');
    await waitScreen(page, 'one_fix');
    assert.strictEqual(await text(page, '#nav-next'), 'Submit', 'empty one_fix: callback_note hidden, so Submit');
    await tap(page, '.type-row .link-btn');
    await page.type('.text-input', 'call me');
    await sleep(200);
    assert.strictEqual(await text(page, '#nav-next'), 'Next', 'typing in one_fix reveals callback_note, label becomes Next');
    await page.click('#nav-next');
    await waitScreen(page, 'callback_note');
    await page.click('#nav-next'); // required free text, empty
    await sleep(300);
    assert.strictEqual(await screenId(page), 'callback_note');
    assert(/voice note or type/.test(await text(page, '#toast')), 'required free-text hint');
    await tap(page, '.type-row .link-btn');
    await page.type('.text-input', 'after 6 pm');
    await page.click('#nav-next');
    await page.waitForFunction(() => /Thank you/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 10000 });
    await sleep(300);
    const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-020');
    assert(s, 'stored');
    assert.deepStrictEqual(s.answers, { nps: 5, role: 'captain', app_ease: 4, support_gate: 'yes' });
    assert(s.ratings.some((r) => r.block === 'question' && r.item === 'app_ease' && r.rating === 4), 'rating_1_5 in ratings');
    const pay = s.ratings.find((r) => r.item === 'payments');
    assert.strictEqual(pay.threshold, 2); assert.strictEqual(pay.below_threshold, false);
    const ku = s.ratings.find((r) => r.block === 'support' && r.item === 'kept_updated');
    assert.strictEqual(ku.not_applicable, true); assert.strictEqual(ku.rating, null);
    const ft = Object.fromEntries(s.free_text.map((f) => [f.item_id, f]));
    assert(ft['fn_deep_dive:losses'].audio && Math.abs(ft['fn_deep_dive:losses'].audio.duration_s - 4) < 0.6, 'audio ~4 s');
    assert.strictEqual(ft.one_fix.block, 'one_fix'); assert.strictEqual(ft.callback_note.block, 'question');
    assert.strictEqual(ft.callback_note.text, 'after 6 pm');
    const ev = s.events.map((e) => e.screen);
    assert(ev.indexOf('fn_deep_dive:losses') === ev.indexOf('fn_rating:losses') + 1, 'immediate deep dive right after its rating');
    const pings = readJsonl(path.join(main.dataDir, 'events.jsonl')).filter((p) => p.dc === 'DC-DEMO-020').map((p) => p.stage);
    assert.deepStrictEqual([...new Set(pings)], ['opened'], 'telemetry off: only the opened check, got ' + pings);
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
    assert.deepStrictEqual(errs, [], 'no console errors');
    await context.close();
    pass('I: config-only changes (info_card, single_choice, rating_1_5 + show_if, required free_text, immediate mode, tap mode limits, per-area threshold, no read-aloud, no telemetry, support N/A)');
  } catch (e) { fail('I: config-only changes', e); }

  /* ---------------- J: round without what-changed, bad ?lang=, ?mock=1 over live config ---------------- */
  if (want('J')) try {
    const { page, context } = await newPage(browser);
    await page.goto(linkFor(main, 'DC-DEMO-021', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'nps');
    await page.goto(`${base(main)}?dc=DC-DEMO-022&t=${token('DC-DEMO-022', 'DEMO-R1')}&round=DEMO-R1&lang=xx`, { waitUntil: 'networkidle0' });
    await waitScreen(page, 'language');
    await context.close();
    const p2 = await newPage(browser);
    await p2.page.setRequestInterception(true);
    const live = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
    live.backend.mode = 'apps_script'; live.backend.apps_script_url = 'https://script.google.com/macros/s/NOT-REAL/exec';
    p2.page.on('request', (req) => {
      if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(live) });
      else req.continue();
    });
    await p2.page.goto(linkFor(main, 'DC-DEMO-023', 'DEMO-R1', 'en') + '&mock=1', { waitUntil: 'networkidle0' });
    await waitScreen(p2.page, 'whats_changed');
    assert.strictEqual(await p2.page.$eval('#dev-banner', (e) => e.hidden), false, '?mock=1 forces test mode');
    const opened = readJsonl(path.join(main.dataDir, 'events.jsonl')).filter((p) => p.dc === 'DC-DEMO-023');
    assert(opened.length >= 1, 'opened ping reached the mock server, not Apps Script');
    await p2.context.close();
    pass('J: empty round skips S1, invalid ?lang shows picker, ?mock=1 overrides live config');
  } catch (e) { fail('J: links', e); }

  /* ---------------- K: double-tap guard ---------------- */
  if (want('K')) try {
    const { page, context } = await newPage(browser);
    await page.goto(linkFor(main, 'DC-DEMO-024', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'nps');
    await clickNth(page, '.nps-chip', 8);
    await waitScreen(page, 'fn_rating:losses');
    // tap a face, then tap the same spot again 600 ms later (after auto-advance)
    const face = (await page.$$('.faces .face'))[1];
    const box = await face.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(600);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(400);
    let st = await page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:2026-R1:DC-DEMO-024')));
    assert.strictEqual(st.answers['fn_rating:losses'], 2);
    assert.strictEqual(st.answers['fn_rating:payments'], undefined, 'second tap did not rate Payments');
    assert.strictEqual(await screenId(page), 'fn_rating:payments');
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses');
    await clickNth(page, '.chip', 0);
    // double tap Next (80 ms apart)
    await page.evaluate(() => { const b = document.getElementById('nav-next'); b.click(); setTimeout(() => b.click(), 80); });
    await sleep(700);
    assert.strictEqual(await screenId(page), 'support_gate', 'double tap moved exactly one screen');
    await clickNth(page, '.yesno .choice', 0);
    await waitScreen(page, 'support');
    for (let r = 0; r < 4; r++) { const rows = await page.$$('.srow'); const f = (await rows[r].$$('.face'))[2]; await f.evaluate((e) => e.scrollIntoView({ block: 'center' })); await f.click(); }
    await page.evaluate(() => { const b = document.getElementById('nav-next'); b.click(); setTimeout(() => b.click(), 250); });
    await sleep(800);
    assert.strictEqual(await screenId(page), 'one_fix', 'double tap on the support block did not submit');
    assert.strictEqual(readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-024').length, 0);
    await context.close();
    pass('K: double taps never answer or submit the next screen');
  } catch (e) { fail('K: double-tap guard', e); }

  /* ---------------- L: rejected link recovers ---------------- */
  if (want('L')) try {
    const { page, context } = await newPage(browser);
    const dc = 'DC-DEMO-025';
    await page.goto(`${base(strict)}?dc=${dc}&t=AAAAAAAAAAAAAAAAAAAAAA&round=DEMO-R1&lang=en`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => /not valid/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 6000 });
    await page.goto(linkFor(strict, dc, 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' }); // corrected link, same phone
    await waitScreen(page, 'whats_changed');
    await context.close();
    // finished while the backend had the wrong secret; backend fixed; reopen sends
    const dataDir = fs.mkdtempSync(path.join(__dirname, 'data-'));
    let srv = await startServer(8795, ['--strict'], { dataDir, env: { MOCK_SECRET: 'some-other-secret' } });
    const p2 = await newPage(browser);
    const url = `http://localhost:8795/?dc=DC-DEMO-026&t=${token('DC-DEMO-026', '2026-R1')}&round=2026-R1&lang=en`;
    await p2.page.goto(url, { waitUntil: 'networkidle0' });
    await p2.page.waitForFunction(() => /not valid/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 6000 });
    srv.proc.kill(); await sleep(500);
    srv = await startServer(8795, ['--strict'], { dataDir });
    await p2.page.goto(url, { waitUntil: 'networkidle0' });
    await waitScreen(p2.page, 'nps'); // the server accepts the link now
    await clickNth(p2.page, '.nps-chip', 7);
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(p2.page, 'fn_rating:' + fn); await clickNth(p2.page, '.faces .face', 4); }
    await waitScreen(p2.page, 'support_gate'); await clickNth(p2.page, '.yesno .choice', 1);
    await waitScreen(p2.page, 'one_fix'); await p2.page.click('#nav-next');
    await p2.page.waitForFunction(() => document.querySelector('.final .big-icon') && /Thank you/.test(document.querySelector('.final').textContent), { timeout: 10000 });
    await sleep(300);
    assert.strictEqual(readJsonl(path.join(dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-026').length, 1);
    await p2.context.close();
    srv.proc.kill();
    pass('L: a rejected link unlocks when corrected or when the server accepts it again');
  } catch (e) { fail('L: bad link recovery', e); }

  /* ---------------- M: two tabs on the same link ---------------- */
  if (want('M')) try {
    const context = await browser.createBrowserContext();
    const tabA = await context.newPage();
    await tabA.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    const url = linkFor(main, 'DC-DEMO-027', '2026-R1', 'en');
    await tabA.goto(url, { waitUntil: 'networkidle0' });
    await waitScreen(tabA, 'nps');
    await clickNth(tabA, '.nps-chip', 4);
    await waitScreen(tabA, 'fn_rating:losses');
    // Second tab (WhatsApp link tapped twice). Tab A is now in the background.
    const tabB = await context.newPage();
    await tabB.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await tabB.goto(url, { waitUntil: 'networkidle0' });
    await waitScreen(tabB, 'fn_rating:losses');
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(tabB, 'fn_rating:' + fn); await clickNth(tabB, '.faces .face', 4); }
    await waitScreen(tabB, 'support_gate'); await clickNth(tabB, '.yesno .choice', 1);
    await waitScreen(tabB, 'one_fix'); await tabB.click('#nav-next');
    await tabB.waitForFunction(() => document.querySelector('.final .big-icon') && /Thank you/.test(document.querySelector('.final').textContent), { timeout: 10000 });
    await tabB.close();
    await tabA.bringToFront();
    // background tabs pause animation frames: poll on a timer instead
    await tabA.waitForFunction(() => /Already received/.test(document.querySelector('.final') ? document.querySelector('.final').textContent : ''), { timeout: 10000, polling: 250 });
    await tabA.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    const st = await tabA.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:2026-R1:DC-DEMO-027')));
    assert.strictEqual(st.submitted, true, 'sent marker kept');
    assert.strictEqual(readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-027').length, 1);
    await context.close();
    pass('M: two tabs: the older tab shows Already received and never undoes the sent marker');
  } catch (e) { fail('M: two tabs', e); }

  /* ---------------- N: long and mixed-script text ---------------- */
  if (want('N')) try {
    const { page, context } = await newPage(browser);
    await page.goto(linkFor(main, 'DC-DEMO-028', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', 6);
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix');
    await tap(page, '.type-row .link-btn');
    const mixed = 'पेमेंट 🙏 சரி ok bhai, payout kab aayega? ';
    await page.focus('.text-input');
    await page.keyboard.sendCharacter(mixed + 'x'.repeat(1600)); // typed/pasted input respects the length limit
    const len = await page.$eval('.text-input', (e) => e.value.length);
    assert(len <= 1500, 'the box stops at max_chars (1500), got ' + len);
    await page.click('#nav-next');
    await page.waitForFunction(() => document.querySelector('.final .big-icon') && /Thank you/.test(document.querySelector('.final').textContent), { timeout: 10000 });
    await sleep(300);
    const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-028');
    const stored = s.free_text.find((f) => f.item_id === 'one_fix').text;
    assert(stored.startsWith(mixed.trim()), 'mixed scripts and emoji survive the trip');
    assert(stored.length <= 1500, 'stored text within max_chars, got ' + stored.length);
    await context.close();
    pass('N: Hindi + Tamil + emoji + romanised text stored exactly; length capped');
  } catch (e) { fail('N: text', e); }

  /* ---------------- P: leaving the page while sending ---------------- */
  if (want('P')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    let held = 0;
    page.on('request', (req) => {
      const body = req.postData() || '';
      // The normal upload "hangs" forever (never answered), like a dying connection.
      if (req.method() === 'POST' && req.resourceType() !== 'ping' && body.includes('"kind":"submit"')) { held++; return; }
      req.continue();
    });
    await page.goto(linkFor(main, 'DC-DEMO-029', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', 9);
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix'); await page.click('#nav-next');
    await page.waitForFunction(() => /keep this page open/i.test(document.querySelector('.final').textContent), { timeout: 5000 });
    await shot(page, 'P01-sending-keep-open');
    assert(held >= 1, 'normal upload is hanging');
    assert.strictEqual(readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-029').length, 0);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); // the partner leaves the page
    await sleep(1500);
    const stored = readJsonl(path.join(main.dataDir, 'responses.jsonl')).filter((x) => x.dc === 'DC-DEMO-029');
    assert.strictEqual(stored.length, 1, 'answers handed to the browser on leaving were delivered, got ' + stored.length);
    await context.close();
    pass('P: leaving the page while sending still delivers the answers (sendBeacon)');
  } catch (e) { fail('P: leave while sending', e); }

  /* ======================= PHASE 2 SCENARIOS ======================= */

  /* ---------------- Q: the published questionnaire (bootstrap) overrides the form's own copy ---------------- */
  if (want('Q')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    const cfg = SURVEY_JSON();
    const strings = STRINGS_JSON();
    cfg.config_version = 'p7-2026-10-21';
    cfg.functions[0].issues.push('blocked_cod');                       // a new chip in "losses"
    cfg.languages = cfg.languages.filter((L) => L.code !== 'ml');      // Malayalam switched off
    cfg.branding.colors.primary = '#0B6E4F';                           // new brand colour
    strings['q.nps'] = six('PUBLISHED: How likely are you to recommend Valmo?');
    strings['issue.losses.blocked_cod'] = six('PUBLISHED new chip');
    const wcItem = six('PUBLISHED news item');
    const answer = bootstrapFrom(cfg, strings, { round: 'DEMO-R1', whats_changed: { title: null, items: [wcItem] } });
    // A misbehaving backend that also sends "where answers go": the form must ignore these.
    answer.survey.backend.mode = 'apps_script';
    answer.survey.backend.apps_script_url = 'https://example.invalid/exec';
    answer.survey.backend.mock_url = '/nope';
    answer.survey.links = { mock_defaults: { dc: 'DC-WRONG', round: 'WRONG', t: '' } };
    const seen = [];
    page.on('request', (req) => {
      seen.push(req.method() + ' ' + req.url());
      if (isBootstrap(req)) respondJSON(req, answer);
      else req.continue();
    });
    // ?lang=ml: Malayalam is no longer offered, so the language screen must appear
    await page.goto(linkFor(main, 'DC-DEMO-040', 'DEMO-R1', 'ml'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'language');
    const langs = await page.$$eval('.lang-choice', (b) => b.map((x) => x.textContent));
    assert.strictEqual(langs.length, 5, 'published language list used: ' + langs);
    assert(!langs.includes('മലയാളം'), 'Malayalam gone');
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim());
    assert.strictEqual(primary.toUpperCase(), '#0B6E4F', 'branding applied again from the bootstrap');
    await clickNth(page, '.lang-choice', 0);
    await waitScreen(page, 'whats_changed');
    assert((await text(page, '.wc-list')).includes('PUBLISHED news item'), 'what changed from the bootstrap');
    await page.click('#nav-next');
    await waitScreen(page, 'nps');
    assert.strictEqual(await text(page, '.q-title'), 'PUBLISHED: How likely are you to recommend Valmo?', 'renamed question');
    await shot(page, 'Q01-published-question');
    await clickNth(page, '.nps-chip', 7);
    await waitScreen(page, 'fn_rating:losses'); await clickNth(page, '.faces .face', 0);
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses');
    const chips = await page.$$eval('.chip', (b) => b.map((x) => x.textContent.trim()));
    assert.strictEqual(chips[5], 'PUBLISHED new chip', 'new chip shown: ' + chips);
    await shot(page, 'Q02-published-new-chip');
    await clickNth(page, '.chip', 5);
    await page.click('#nav-next');
    await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix'); await page.click('#nav-next');
    await waitFinal(page, /Your feedback goes straight/, 10000);
    await sleep(300);
    const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-040');
    assert(s, 'stored on the mock server (answers still go where the form\'s own copy says)');
    assert.strictEqual(s.config_version, 'p7-2026-10-21', 'submission stamped with the published version');
    assert.strictEqual(s.mode, 'mock');
    assert.strictEqual(s.ratings.find((r) => r.item === 'losses').issue_code, 'blocked_cod');
    const pings = readJsonl(path.join(main.dataDir, 'events.jsonl')).filter((p) => p.dc === 'DC-DEMO-040');
    assert(pings.length && pings.every((p) => p.config_version === 'p7-2026-10-21'), 'pings stamped with the published version');
    assert.strictEqual(seen.filter((u) => /action=bootstrap/.test(u)).length, 1, 'exactly one bootstrap request');
    assert(seen.some((u) => /action=bootstrap&round=DEMO-R1$/.test(u)), 'bootstrap asks for the link\'s round (no draft=1)');
    assert(!seen.some((u) => /action=whats_changed|config\/whats_changed\.json|config\/audio_clips\.json/.test(u)),
      'no separate what-changed / clips request when the bootstrap worked: ' + seen.filter((u) => /whats_changed|audio_clips/.test(u)));
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
    assert.deepStrictEqual(errs, [], 'no console errors');
    await context.close();
    pass('Q: bootstrap overrides the form\'s copy (renamed question, new chip, fewer languages, colours, what changed, config_version) and keeps the backend address');
  } catch (e) { fail('Q: bootstrap overrides', e); }

  /* ---------------- R: bootstrap failure / timeout / not published -> the form's own copy ---------------- */
  if (want('R')) try {
    const staticNps = STRINGS_JSON()['q.nps'].en;
    const staticWc = WC_JSON().rounds['DEMO-R1'].items[0].en;
    // R1: request fails (network error) -> own copy, and the survey can be finished
    {
      const { page, context } = await newPage(browser);
      await page.setRequestInterception(true);
      const seen = [];
      page.on('request', (req) => { seen.push(req.url()); if (isBootstrap(req)) req.abort('failed'); else req.continue(); });
      await page.goto(linkFor(main, 'DC-DEMO-041', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
      await waitScreen(page, 'whats_changed');
      assert((await text(page, '.wc-list')).includes(staticWc.replace('[SAMPLE] ', '').slice(0, 20)), 'static what-changed shown');
      assert(seen.some((u) => u.endsWith('/config/whats_changed.json')), 'config/whats_changed.json loaded');
      assert(seen.some((u) => u.endsWith('/config/audio_clips.json')), 'config/audio_clips.json loaded');
      assert(!seen.some((u) => /action=whats_changed/.test(u)), 'no Phase 1 what-changed request');
      await page.click('#nav-next');
      await waitScreen(page, 'nps');
      assert.strictEqual(await text(page, '.q-title'), staticNps);
      await quickFinish(page);
      await waitFinal(page, /Your feedback goes straight/, 10000);
      await sleep(300);
      const s = readJsonl(path.join(main.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-041');
      assert(s && s.config_version === SURVEY_JSON().config_version, 'stamped with the form\'s own config_version');
      await context.close();
    }
    // R2: no answer at all -> waits whats_changed.timeout_seconds + 2 s (here 1 + 2), then the own copy
    {
      const { page, context } = await newPage(browser);
      await page.setRequestInterception(true);
      const cfg = SURVEY_JSON(); cfg.whats_changed.timeout_seconds = 1;
      page.on('request', (req) => {
        if (isBootstrap(req)) return; // never answered, like a hanging Google server
        if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) });
        else req.continue();
      });
      const t0 = Date.now();
      await page.goto(linkFor(main, 'DC-DEMO-042', 'DEMO-R1', 'en'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => history.state && history.state.pp === 'whats_changed', { timeout: 12000 });
      const waited = Date.now() - t0;
      console.log('   bootstrap timeout fallback after ms:', waited);
      assert(waited >= 2800 && waited < 7000, 'waited about 3 s, got ' + waited);
      assert((await text(page, '.wc-list')).includes('48'), 'static what-changed shown after the timeout');
      await context.close();
    }
    // R3: "not_published", and an answer without a questionnaire -> own copy
    for (const bad of [{ ok: false, error: 'not_published' }, { ok: true, survey: { flow: [] }, strings: {} }, 'not json']) {
      const { page, context } = await newPage(browser);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (isBootstrap(req)) req.respond({ status: 200, contentType: 'application/json', body: typeof bad === 'string' ? bad : JSON.stringify(bad) });
        else req.continue();
      });
      await page.goto(linkFor(main, 'DC-DEMO-043', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
      await waitScreen(page, 'whats_changed');
      await page.click('#nav-next');
      await waitScreen(page, 'nps');
      assert.strictEqual(await text(page, '.q-title'), staticNps, 'own copy used for ' + JSON.stringify(bad));
      const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
      assert.deepStrictEqual(errs, [], 'no console errors');
      await context.close();
    }
    pass('R: bootstrap failure, timeout (waits timeout_seconds + 2 s), not_published and broken answers all fall back to the form\'s own copy');
  } catch (e) { fail('R: bootstrap fallback', e); }

  /* ---------------- S: preview mode ---------------- */
  if (want('S')) try {
    // S1: mock mode, no dc / t in the link
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    const posts = [];
    const boots = [];
    page.on('request', (req) => {
      if (req.method() === 'POST') posts.push(req.postData() || '');
      if (isBootstrap(req)) boots.push(req.url());
      req.continue();
    });
    const previewUrl = `${base(main)}?preview=1&round=DEMO-R1&lang=en&pk=test-preview-key`;
    await page.goto(previewUrl, { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    assert(boots.length === 1 && /&draft=1&pk=test-preview-key$/.test(boots[0]), 'bootstrap asks for the draft with the preview key: ' + boots);
    const banner = await page.$eval('#dev-banner', (e) => ({ hidden: e.hidden, text: e.textContent, preview: e.classList.contains('is-preview') }));
    assert(!banner.hidden && banner.text.startsWith('PREVIEW: answers are not saved') && banner.preview, 'preview banner: ' + JSON.stringify(banner));
    await noHorizontalScroll(page, 'preview');
    await shot(page, 'S01-preview-banner');
    await page.click('#nav-next');
    await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', 2);
    await waitScreen(page, 'fn_rating:losses'); await clickNth(page, '.faces .face', 0);
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses'); await clickNth(page, '.chip', 0); await page.click('#nav-next');
    await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 1);
    await waitScreen(page, 'one_fix');
    await tap(page, '.type-row .link-btn'); await page.type('.text-input', 'preview test');
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
    await page.click('#nav-next');
    await waitFinal(page, /Preview finished\. Nothing was saved\./);
    const done = await page.$eval('.final', (e) => ({ title: e.querySelector('.q-title').textContent, again: !!e.querySelector('button.btn') && e.querySelector('button.btn').textContent }));
    assert.strictEqual(done.title, 'Thank you!');
    assert(done.again, 'Start again button shown');
    await noHorizontalScroll(page, 'preview done');
    await shot(page, 'S02-preview-done');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await sleep(1500);
    assert.deepStrictEqual(posts, [], 'nothing was POSTed (no pings, no beacons, no submit)');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(keys.includes('vpp:v1:state:preview:DEMO-R1:DC-PREVIEW'), 'state under the preview name: ' + keys);
    assert(!keys.includes('vpp:v1:state:DEMO-R1:DC-PREVIEW') && !keys.includes('vpp:v1:lang'), 'nothing under real-link names: ' + keys);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:preview:DEMO-R1:DC-PREVIEW')));
    assert.strictEqual(st.finished, true); assert.strictEqual(st.submitted, false);
    assert(!readJsonl(path.join(main.dataDir, 'responses.jsonl')).some((x) => x.dc === 'DC-PREVIEW'), 'no stored answers');
    assert(!readJsonl(path.join(main.dataDir, 'events.jsonl')).some((x) => x.dc === 'DC-PREVIEW'), 'no stored pings');
    // reopening shows the finished preview again; Start again clears it
    await page.goto(previewUrl, { waitUntil: 'networkidle0' });
    await waitFinal(page, /Preview finished/);
    await sleep(600); // the form ignores taps for 500 ms after a screen appears
    await page.click('.final button.btn');
    await waitScreen(page, 'whats_changed');
    const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:preview:DEMO-R1:DC-PREVIEW')));
    assert(!st2 || st2.finished === false, 'Start again cleared the finished preview');
    assert.deepStrictEqual(posts, [], 'still nothing POSTed');
    const errs = page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m));
    assert.deepStrictEqual(errs, [], 'no console errors');
    await context.close();

    // S2: separate storage: a real link's progress is untouched by a preview of the same dc
    {
      const p = await newPage(browser);
      await p.page.goto(linkFor(main, 'DC-DEMO-044', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'nps'); await clickNth(p.page, '.nps-chip', 3);
      await waitScreen(p.page, 'fn_rating:losses');
      await p.page.goto(`${base(main)}?preview=1&round=2026-R1&dc=DC-DEMO-044&lang=en`, { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'nps'); // starts fresh, not at the real link's screen
      assert.strictEqual(await p.page.$eval('#notice', (e) => e.hidden), true, 'no "welcome back" in preview');
      await clickNth(p.page, '.nps-chip', 9);
      await waitScreen(p.page, 'fn_rating:losses');
      const real = await p.page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:2026-R1:DC-DEMO-044')));
      assert.strictEqual(real.answers.nps, 3, 'real link progress untouched');
      await p.context.close();
    }
    // S3: a draft round can be previewed (no "not open yet"), and nothing is POSTed
    {
      const p = await newPage(browser);
      await p.page.setRequestInterception(true);
      const posts3 = [];
      p.page.on('request', (req) => { if (req.method() === 'POST') posts3.push(req.url()); req.continue(); });
      await p.page.goto(`${base(flags)}?preview=1&round=DRAFT-R1`, { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'language');
      await clickNth(p.page, '.lang-choice', 1);
      await waitScreen(p.page, 'nps');
      assert.deepStrictEqual(posts3, []);
      await p.context.close();
    }
    // S4: live mode: the preview strip still shows, the draft comes from the live backend address
    {
      const p = await newPage(browser);
      await p.page.setRequestInterception(true);
      const live = SURVEY_JSON();
      live.backend.mode = 'apps_script';
      live.backend.apps_script_url = `http://127.0.0.1:${main.port}/api`;
      const posts4 = []; const boots4 = [];
      p.page.on('request', (req) => {
        if (req.method() === 'POST') posts4.push(req.url());
        if (isBootstrap(req)) boots4.push(req.url());
        if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(live) });
        else req.continue();
      });
      await p.page.goto(`${base(main)}?preview=1&round=DEMO-R1&lang=hi`, { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'whats_changed');
      const b = await p.page.$eval('#dev-banner', (e) => ({ hidden: e.hidden, text: e.textContent }));
      assert(!b.hidden && b.text.startsWith('प्रीव्यू'), 'Hindi preview strip in live mode: ' + JSON.stringify(b));
      assert(boots4.length === 1 && boots4[0].startsWith(`http://127.0.0.1:${main.port}/api?action=bootstrap&round=DEMO-R1&draft=1`), 'draft asked from the live address: ' + boots4);
      await shot(p.page, 'S03-preview-live-hi');
      await p.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await sleep(500);
      assert.deepStrictEqual(posts4, []);
      await p.context.close();
    }
    // S5: a preview link without a round is incomplete: nothing is asked for,
    // so the strip must not say the draft could not be loaded
    {
      const p = await newPage(browser);
      const boots5 = [];
      p.page.on('request', (req) => { if (isBootstrap(req)) boots5.push(req.url()); });
      await p.page.goto(`${base(main)}?preview=1&lang=en`, { waitUntil: 'networkidle0' });
      await waitFinal(p.page, /incomplete/);
      const strip = await p.page.$eval('#dev-banner', (e) => e.textContent);
      assert(strip.startsWith(STRINGS_JSON()['dev.preview_banner'].en), 'preview strip shown: ' + strip);
      assert(!strip.includes(STRINGS_JSON()['dev.preview_fallback'].en), 'no "could not load the draft" without a round: ' + strip);
      assert.deepStrictEqual(boots5, [], 'no draft asked for without a round');
      await p.context.close();
    }
    pass('S: preview: draft=1, preview strip in every mode, no pings/submits/beacons, separate storage, "Preview finished" + Start again, draft rounds previewable');
  } catch (e) { fail('S: preview', e); }

  /* ---------------- T: closed round ---------------- */
  if (want('T')) try {
    // While the round was still open (the bootstrap is edited to say "open"), two partners start.
    let pretendOpen = true;
    let blockB = false; // block DC-DEMO-051's answers (as if its connection kept failing)
    const setup = async (pg) => {
      await pg.setRequestInterception(true);
      pg.on('request', async (req) => {
        if (isBootstrap(req) && pretendOpen) { const b = await realBootstrap(req.url()); b.round.status = 'open'; respondJSON(req, b); return; }
        const body = req.postData() || '';
        if (blockB && req.method() === 'POST' && body.includes('"kind":"submit"') && body.includes('"dc":"DC-DEMO-051"')) { req.abort('failed'); return; }
        req.continue();
      });
    };
    const ctxA = await newPage(browser); await setup(ctxA.page);   // has progress when the round closes
    const ctxB = await newPage(browser); await setup(ctxB.page);   // finished, answers not sent yet
    await ctxA.page.goto(linkFor(flags, 'DC-DEMO-050', 'CLOSED-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(ctxA.page, 'nps'); await clickNth(ctxA.page, '.nps-chip', 4);
    await waitScreen(ctxA.page, 'fn_rating:losses');
    blockB = true;
    await ctxB.page.goto(linkFor(flags, 'DC-DEMO-051', 'CLOSED-R1', 'en'), { waitUntil: 'networkidle0' });
    await quickFinish(ctxB.page);
    await waitFinal(ctxB.page, /Could not send/, 10000);
    // Now the round has closed. (B's answers stay blocked until B reopens the link.)
    pretendOpen = false;
    // A fresh visitor sees "This survey has closed" (and nothing is sent)
    const ctxC = await newPage(browser);
    await ctxC.page.goto(linkFor(flags, 'DC-DEMO-052', 'CLOSED-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitFinal(ctxC.page, /This survey has closed/);
    assert((await finalText(ctxC.page)).includes('Look out for the next round'), 'closed body');
    assert.strictEqual(await ctxC.page.$eval('#navbar', (e) => e.hidden), true, 'no bottom bar');
    await noHorizontalScroll(ctxC.page, 'closed');
    await shot(ctxC.page, 'T01-closed');
    await ctxC.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await sleep(500);
    assert(!readJsonl(path.join(flags.dataDir, 'events.jsonl')).some((x) => x.dc === 'DC-DEMO-052'), 'no ping from a closed-round visitor');
    // Hindi version of the same screen
    await ctxC.page.goto(linkFor(flags, 'DC-DEMO-052', 'CLOSED-R1', 'hi'), { waitUntil: 'networkidle0' });
    await waitFinal(ctxC.page, /यह सर्वे बंद हो चुका है/);
    await shot(ctxC.page, 'T02-closed-hi');
    await ctxC.context.close();
    // A: reopens, carries on where they were, finishes: stored late
    await ctxA.page.reload({ waitUntil: 'networkidle0' });
    await waitScreen(ctxA.page, 'fn_rating:losses');
    for (const fn of ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(ctxA.page, 'fn_rating:' + fn); await clickNth(ctxA.page, '.faces .face', 4); }
    await waitScreen(ctxA.page, 'support_gate'); await clickNth(ctxA.page, '.yesno .choice', 1);
    await waitScreen(ctxA.page, 'one_fix'); await ctxA.page.click('#nav-next');
    await waitFinal(ctxA.page, /Your feedback goes straight/, 10000);
    // B: closes the page (its retries stop) and opens the link again later: the unsent answers go now, stored late
    await ctxB.page.close();
    blockB = false;
    const pageB2 = await ctxB.context.newPage();
    await pageB2.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await setup(pageB2);
    await pageB2.goto(linkFor(flags, 'DC-DEMO-051', 'CLOSED-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitFinal(pageB2, /Your feedback goes straight/, 10000);
    await sleep(300);
    const subs = readJsonl(path.join(flags.dataDir, 'responses.jsonl'));
    const a = subs.find((x) => x.dc === 'DC-DEMO-050');
    const b = subs.find((x) => x.dc === 'DC-DEMO-051');
    assert(a && a.late === true, 'started before closing -> late: ' + (a && a.late));
    assert(b && b.late === true, 'finished-but-unsent -> late: ' + (b && b.late));
    await ctxA.context.close(); await ctxB.context.close();
    // D: the bootstrap fails (status unknown) -> the "opened" ping's round_status closes the visit
    const ctxD = await newPage(browser);
    await ctxD.page.setRequestInterception(true);
    ctxD.page.on('request', (req) => { if (isBootstrap(req)) req.abort('failed'); else req.continue(); });
    await ctxD.page.goto(linkFor(flags, 'DC-DEMO-053', 'CLOSED-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitFinal(ctxD.page, /This survey has closed/);
    await ctxD.context.close();
    // An open round on the same server is stored with late: false
    const ctxE = await newPage(browser);
    await ctxE.page.goto(linkFor(flags, 'DC-DEMO-054', 'OPEN-R1', 'en'), { waitUntil: 'networkidle0' });
    await quickFinish(ctxE.page);
    await waitFinal(ctxE.page, /Your feedback goes straight/, 10000);
    await sleep(300);
    const e = readJsonl(path.join(flags.dataDir, 'responses.jsonl')).find((x) => x.dc === 'DC-DEMO-054');
    assert(e && e.late === false, 'open round -> late false');
    await ctxE.context.close();
    pass('T: closed round: new visitors see "has closed" (also via the ping when the bootstrap fails); partners who started or finished earlier still send, stored late=true');
  } catch (e) { fail('T: closed round', e); }

  /* ---------------- U: draft round (not open yet) ---------------- */
  if (want('U')) try {
    // U1: the bootstrap says draft -> "not open yet", nothing sent
    const u1 = await newPage(browser);
    await u1.page.setRequestInterception(true);
    const posts = [];
    u1.page.on('request', (req) => { if (req.method() === 'POST') posts.push(req.postData() || ''); req.continue(); });
    await u1.page.goto(linkFor(flags, 'DC-DEMO-060', 'DRAFT-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitFinal(u1.page, /This survey is not open yet/);
    assert((await finalText(u1.page)).includes('Please open the same link again once it starts.'));
    await noHorizontalScroll(u1.page, 'not open');
    await shot(u1.page, 'U01-not-open');
    await u1.page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('online')); });
    await sleep(500);
    assert.deepStrictEqual(posts, [], 'nothing sent from a draft round');
    await u1.page.goto(linkFor(flags, 'DC-DEMO-060', 'DRAFT-R1', 'hi'), { waitUntil: 'networkidle0' });
    await waitFinal(u1.page, /यह सर्वे अभी शुरू नहीं हुआ है/);
    await shot(u1.page, 'U02-not-open-hi');
    await u1.context.close();
    // U2: the bootstrap fails -> the "opened" ping is answered round_not_open -> "not open yet"
    const u2 = await newPage(browser);
    await u2.page.setRequestInterception(true);
    u2.page.on('request', (req) => { if (isBootstrap(req)) req.abort('failed'); else req.continue(); });
    await u2.page.goto(linkFor(flags, 'DC-DEMO-061', 'DRAFT-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitFinal(u2.page, /This survey is not open yet/);
    await u2.context.close();
    // U3: the bootstrap and the ping both fail, the partner finishes; the submit is answered
    //     round_not_open -> "not open yet", no retries, answers kept on the phone
    const u3 = await newPage(browser);
    await u3.page.setRequestInterception(true);
    const submits = [];
    u3.page.on('request', (req) => {
      const body = req.postData() || '';
      if (isBootstrap(req) || (req.method() === 'POST' && body.includes('"stage":"opened"'))) { req.abort('failed'); return; }
      if (req.method() === 'POST' && body.includes('"kind":"submit"')) submits.push(req.resourceType());
      req.continue();
    });
    await u3.page.goto(linkFor(flags, 'DC-DEMO-062', 'DRAFT-R1', 'en'), { waitUntil: 'networkidle0' });
    await quickFinish(u3.page);
    await waitFinal(u3.page, /This survey is not open yet/, 10000);
    assert.strictEqual(await u3.page.$('.final .btn-primary'), null, 'no "Send now" button');
    await u3.page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('online')); });
    await sleep(4500); // the first automatic retry would come after 2 s
    assert.strictEqual(submits.length, 1, 'exactly one submit, no retries or beacons: ' + submits);
    assert(/not open yet/.test(await finalText(u3.page)), 'still "not open yet"');
    const st = await u3.page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:DRAFT-R1:DC-DEMO-062')));
    assert(st.finished === true && st.submitted === false && Object.keys(st.answers).length > 0, 'answers kept on the phone');
    assert(!readJsonl(path.join(flags.dataDir, 'responses.jsonl')).some((x) => x.dc === 'DC-DEMO-062'), 'nothing stored');
    await u3.context.close();
    pass('U: draft round: "not open yet" from the bootstrap, from the opened ping, and from a submit answered round_not_open (no retries, answers kept)');
  } catch (e) { fail('U: draft round', e); }

  /* ---------------- V: "Start again (test mode)" really starts again ---------------- */
  if (want('V')) try {
    const { page, context } = await newPage(browser);
    const url = linkFor(main, 'DC-DEMO-070', '2026-R1', 'en');
    await page.goto(url, { waitUntil: 'networkidle0' });
    await quickFinish(page);
    await waitFinal(page, /Your feedback goes straight/, 10000);
    await sleep(600);
    await page.click('.final button.btn'); // Start again (test mode)
    await waitScreen(page, 'nps');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:2026-R1:DC-DEMO-070')));
    assert(st && st.submitted === false && Object.keys(st.answers).length === 0, 'fresh state after Start again');
    await context.close();
    pass('V: "Start again (test mode)" clears the sent marker and starts a fresh survey');
  } catch (e) { fail('V: start again', e); }

  /* ---------------- W: read-aloud on the two smaller headings (21 Oct) ---------------- */
  if (want('W')) try {
    const { page, context } = await newPage(browser);
    // Like a phone without a Hindi voice (this Mac's Chrome has one), so only the
    // clips below can make the new speakers appear: the checks can then fail.
    await page.evaluateOnNewDocument(() => {
      const real = speechSynthesis.getVoices.bind(speechSynthesis);
      speechSynthesis.getVoices = () => real().filter((v) => !/^hi/i.test(v.lang));
    });
    await page.setRequestInterception(true);
    // Clips only for the optional "Tell us more" wording and the support comment heading.
    const clips = { 'q.tell_more': { hi: 'audio/hi/test.mp3' }, 'q.support_comment': { hi: 'audio/hi/test.mp3' } };
    page.on('request', async (req) => {
      if (isBootstrap(req)) { const b = await realBootstrap(req.url()); b.clips = clips; respondJSON(req, b); }
      else req.continue();
    });
    await page.goto(linkFor(main, 'DC-DEMO-030', 'DEMO-R1', 'hi'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed');
    await page.click('#nav-next');
    await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', 5);
    await waitScreen(page, 'fn_rating:losses'); await clickNth(page, '.faces .face', 0); // low: its problem screen follows
    for (const fn of ['payments', 'linehaul', 'consumables', 'orders', 'app']) { await waitScreen(page, 'fn_rating:' + fn); await clickNth(page, '.faces .face', 4); }
    await waitScreen(page, 'fn_deep_dive:losses');
    assert.strictEqual(await page.evaluate(() => speechSynthesis.getVoices().some((v) => /^hi/i.test(v.lang))), false, 'no Hindi voice in this scenario');
    const subSpeaker = () => page.$eval('.sub-head .speak-btn', (e) => !e.hidden);
    assert.strictEqual(await page.$$eval('.sub-head .speak-btn', (e) => e.length), 1, 'one speaker next to "Tell us more"');
    assert.strictEqual(await subSpeaker(), true, 'speaker shown: a clip covers the "Tell us more" wording');
    await noHorizontalScroll(page, 'problem screen with two speakers');
    await shot(page, 'W01-tell-more-speaker');
    // "Other" switches the heading to its required wording, which has no clip:
    // the speaker follows the wording and hides (no clip, no Hindi voice).
    const chips = await page.$$('.chips .chip');
    await chips[chips.length - 1].click();
    await sleep(200);
    assert(/ज़रूरी नहीं/.test(STRINGS_JSON()['q.tell_more'].hi) && !(await text(page, '.sub-head .sub-title')).includes('ज़रूरी नहीं'), 'heading switched to the required wording');
    assert.strictEqual(await subSpeaker(), false, 'speaker follows the wording on show (hidden: no clip for the required wording)');
    await clickNth(page, '.chips .chip', 0); // back to a listed problem: optional wording, clip again
    await sleep(200);
    assert.strictEqual(await subSpeaker(), true, 'speaker back with the optional wording');
    await page.click('#nav-next');
    await waitScreen(page, 'support_gate'); await clickNth(page, '.yesno .choice', 0);
    await waitScreen(page, 'support');
    assert.strictEqual(await page.$$eval('.sub-head .speak-btn', (e) => e.length), 1, 'one speaker next to the support comment heading');
    assert.strictEqual(await subSpeaker(), true, 'support comment speaker shown: a clip covers it');
    await shot(page, 'W02-support-comment-speaker');
    await context.close();
    pass('W: read-aloud on the "Tell us more" and support comment headings, following the wording on show');
  } catch (e) { fail('W: read-aloud on smaller headings', e); }

  /* ---------------- X: a published questionnaire that breaks the form -> the form's own copy (21 Oct) ---------------- */
  if (want('X')) try {
    const { page, context } = await newPage(browser);
    await page.setRequestInterception(true);
    // The form's own copy gets an optional note screen after the NPS question,
    // so a Skip tap can show that buttons react once per tap (below).
    const own = SURVEY_JSON();
    own.flow.splice(own.flow.findIndex((x) => x.id === 'nps') + 1, 0, { id: 'extra_note', type: 'free_text', text: 'q.one_fix', required: false });
    page.on('request', async (req) => {
      // Passes the form's first check (flow and languages present), then breaks
      // while the screens are built: the areas are not a list.
      if (isBootstrap(req)) { const b = await realBootstrap(req.url()); b.survey.functions = {}; respondJSON(req, b); }
      else if (req.url().endsWith('/config/survey.json')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(own) });
      else req.continue();
    });
    await page.goto(linkFor(main, 'DC-DEMO-045', 'DEMO-R1', 'en'), { waitUntil: 'networkidle0' });
    await waitScreen(page, 'whats_changed'); // the form's own copy, not the "could not start" message
    assert.strictEqual(await page.evaluate(() => Boolean(document.querySelector('.final'))), false, 'no error screen');
    const logged = page.consoleMessages.filter((m) => /published questionnaire could not be shown/.test(m));
    assert.strictEqual(logged.length, 1, 'the fall-back is logged once: ' + page.consoleMessages.join(' | '));
    await page.click('#nav-next');
    await waitScreen(page, 'nps'); await clickNth(page, '.nps-chip', 9);
    // setup() ran twice: one Skip tap must move exactly one screen (a second
    // set of button handlers would skip the first area too).
    await waitScreen(page, 'extra_note');
    await page.click('#nav-skip');
    await waitScreen(page, 'fn_rating:losses'); // the form's own areas
    await context.close();
    // A first screen that breaks while it is drawn (the nps question has no text):
    // the failed attempt must not leave a resume or a screen view behind.
    {
      const p = await newPage(browser);
      await p.page.setRequestInterception(true);
      p.page.on('request', async (req) => {
        if (isBootstrap(req)) { const b = await realBootstrap(req.url()); b.survey.flow = b.survey.flow.map((x) => (x.id === 'nps' ? Object.assign({}, x, { text: undefined }) : x)); respondJSON(req, b); }
        else req.continue();
      });
      await p.page.goto(linkFor(main, 'DC-DEMO-046', '2026-R1', 'en'), { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'nps'); // 2026-R1 has no "What changed": the form's own nps screen comes first
      const st = await p.page.evaluate(() => JSON.parse(localStorage.getItem('vpp:v1:state:2026-R1:DC-DEMO-046')));
      assert(st && st.resume_count === 0, 'the failed attempt is not counted as a resume: ' + JSON.stringify(st && st.resume_count));
      assert.strictEqual(st.events.filter((ev) => ev.screen === 'nps').length, 1, 'one view of the first screen, not two');
      await p.context.close();
    }
    // In a preview, a draft that breaks the form says so (not "could not load the draft").
    {
      const p = await newPage(browser);
      await p.page.setRequestInterception(true);
      p.page.on('request', async (req) => {
        if (isBootstrap(req)) { const b = await realBootstrap(req.url()); b.survey.functions = {}; respondJSON(req, b); }
        else req.continue();
      });
      await p.page.goto(`${base(main)}?preview=1&round=DEMO-R1&lang=en`, { waitUntil: 'networkidle0' });
      await waitScreen(p.page, 'whats_changed');
      const strip = await p.page.$eval('#dev-banner', (e) => e.textContent);
      assert(strip.includes(STRINGS_JSON()['dev.preview_broken'].en), 'the strip says the draft is broken: ' + strip);
      assert(!strip.includes(STRINGS_JSON()['dev.preview_fallback'].en), 'not "could not load the draft": ' + strip);
      await p.context.close();
    }
    pass('X: a published questionnaire that breaks the form falls back to the form\'s own copy (no extra resume; a broken draft is named in preview)');
  } catch (e) { fail('X: broken published questionnaire', e); }

  await browser.close();
  await browserNoMic.close();
  for (const s of [main, strict, once, flags]) s.proc.kill();
  fs.writeFileSync(path.join(OUT, 'server-main.log'), main.log());
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

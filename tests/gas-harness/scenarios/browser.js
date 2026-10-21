/* =============================================================================
   scenarios/browser.js  -  E (the real form in Chrome) and F (the panel)

   WHAT THIS FILE IS
     End-to-end tests in a real (headless) Chrome, through server.js:
       E1  a partner opens a link made by panelGenerateLinks, answers the
           whole form (phone size), and the rows land in the round's data
           spreadsheet; the form must load the PUBLISHED questionnaire
           with one bootstrap request.
       E2  an admin changes a question text in the panel API and publishes;
           a partner opening the form now sees the new text.
       E3  round gate: a closed round shows "This survey has closed", a draft
           round shows "This survey is not open yet".
       E4  preview link (?preview=1): banner, the draft questionnaire,
           "Preview finished. Nothing was saved." and nothing is sent.
       F   the control panel (Panel.html with the google.script.run
           stand-in) opens without console errors; every section opens;
           from google.script.host it uses only setHeight / setWidth, to
           shrink its window (never above 1100 x 760).

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only E,F).
     Screenshots go to out/shots/.
   ============================================================================= */
'use strict';

const K = require('../lib/testkit');
const H = require('../lib/helpers');
const B = require('../lib/browser');
const { createHarnessServer } = require('../server');

const P = (h, s, fn, args, opts) => K.call(h, s, fn, args, Object.assign({ context: 'panel' }, opts || {}));
const AREAS = ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app'];

let env = null;          // { h, srv, links } shared by E1-E4 and F

/* From the first screen to the NPS question (handles the language and
   "what changed" screens if they appear). */
async function toNps(page) {
  await page.waitForFunction(() => (history.state && history.state.pp) || document.querySelector('.final'), { timeout: 20000 });
  let id = await B.screenId(page);
  if (id === 'language') {
    await B.sleep(600);
    await B.clickNth(page, '.lang-choice', 0);
    await page.waitForFunction(() => history.state && history.state.pp !== 'language', { timeout: 8000 });
    id = await B.screenId(page);
  }
  if (id === 'whats_changed') {
    await B.sleep(600);
    await page.click('#nav-next');
  }
  await B.waitScreen(page, 'nps');
}

/* Answers the default flow: NPS, six areas, problem screens, support No, one fix. */
async function answerAll(page, o) {
  await B.clickNth(page, '.nps-chip', o.nps);
  for (const area of AREAS) {
    await B.waitScreen(page, 'fn_rating:' + area);
    await B.clickNth(page, '.faces .face', (o.ratings[area] || 5) - 1);
  }
  for (const area of AREAS.filter((a) => (o.ratings[a] || 5) <= 3)) {
    await B.waitScreen(page, 'fn_deep_dive:' + area);
    await B.clickNth(page, '.chip', 0);
    if (o.detail) await B.typeText(page, o.detail);
    await page.click('#nav-next');
  }
  await B.waitScreen(page, 'support_gate');
  await B.clickNth(page, '.yesno .choice', 1);
  await B.waitScreen(page, 'one_fix');
  if (o.oneFix) await B.typeText(page, o.oneFix);
  await page.click('#nav-next');
}

function linkMap(h, round) {
  const map = {};
  ((h.admin.table(null, 'Links') || { rows: [] }).rows).filter((r) => r.round_id === round).forEach((r) => { map[String(r.dc_id)] = r.link; });
  return map;
}

module.exports = function register(add, shared) {
  async function needBrowser(s) {
    const b = await shared.getBrowser();
    if (!b.browser) { s.skipped = 'Chrome could not be started: ' + b.error; return null; }
    return b.browser;
  }

  add('E1', 'Browser: a partner completes the form via a generated link; rows land in the round\'s data spreadsheet', async (s) => {
    const browser = await needBrowser(s);
    if (!browser) return;
    const h = H.setupPublished(s);
    h.admin.writeRows(null, 'DCs', 2, [
      ['DC-E2E-001', 'E2E One', 'Demo', 'Demo', 'en', true], ['DC-E2E-002', 'E2E Two', 'Demo', 'Demo', 'en', true],
      ['DC-E2E-003', 'E2E Three', 'Demo', 'Demo', 'en', true], ['DC-E2E-004', 'E2E Four', 'Demo', 'Demo', 'en', true]]);
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    const gl = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }], { need: true });
    s.need(gl && gl.created === 4, 'four links generated', K.show(gl));
    const srv = createHarnessServer({ harness: h, port: 0, quiet: true, googleRedirect: true, appsScriptDir: H.config.appsScriptDir, webDir: H.config.webDir });
    await srv.start();
    shared.onCleanup(() => srv.stop());
    env = { h, srv, links: linkMap(h, '2026-R1') };
    s.note(`Local Google: form ${srv.baseUrl()}, web app ${srv.execUrl()} (answers with a 302 redirect like Google).`);
    const { page, context } = await B.newPage(browser);
    try {
      const url = srv.localLink(env.links['DC-E2E-001']);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await toNps(page);
      await B.shot(page, 'E1-01-nps');
      await answerAll(page, { nps: 8, ratings: { losses: 2 }, detail: 'E2E: debit without photo proof', oneFix: 'E2E: pay on time please' });
      await B.waitFinal(page, /Thank you/, 20000);
      await B.shot(page, 'E1-02-thanks');
      await B.sleep(500);
    } catch (err) {
      await B.shot(page, 'E1-failed');
      s.ok(false, 'the partner can complete the form', String(err.message));
    }
    const bookId = H.roundBookId(h, '2026-R1');
    const rows = (tab) => (h.admin.table(bookId, tab) || { rows: [] }).rows.filter((r) => r.dc === 'DC-E2E-001');
    const resp = rows('responses');
    s.ok(resp.length === 1, 'exactly one responses row for the DC', K.show(resp));
    if (resp[0]) {
      const r = resp[0];
      s.ok(r.mode === 'live' && r.token_valid === true && r.late === false && r.nps === 8 && r.lang === 'en' && r.round === '2026-R1',
        'responses row: mode live, token valid, not late, nps 8, lang en', K.show(r));
      s.ok(/^p1-\d{4}-\d{2}-\d{2}$/.test(String(r.config_version)), 'the submission carries the PUBLISHED config_version (p1-…)', K.show(r.config_version));
    }
    s.eq(rows('function_ratings').filter((r) => r.block === 'function').length, 6, 'six area ratings stored');
    const ft = rows('free_text');
    s.ok(ft.some((r) => r.item_id === 'fn_deep_dive:losses' && /photo proof/.test(r.text)) && ft.some((r) => r.item_id === 'one_fix' && /pay on time/.test(r.text)),
      'typed answers stored in free_text', K.show(ft.map((r) => [r.item_id, r.text])));
    const ev = rows('events');
    s.ok(ev.length >= 8 && ev[ev.length - 1].screen === 'thanks', 'screen views stored in events, ending with "thanks"', K.show(ev.map((r) => r.screen)));
    const stages = rows('pings').map((r) => r.stage);
    s.ok(stages.indexOf('opened') >= 0 && stages.indexOf('started') >= 0, '"opened" and "started" pings stored', K.show(stages));
    const boots = srv.requests.filter((r) => r.fn === 'doGet' && r.params && r.params.action === 'bootstrap');
    s.ok(boots.length >= 1 && boots[0].params.round === '2026-R1', 'the form asked for the published questionnaire (GET ?action=bootstrap&round=2026-R1)',
      K.show(srv.requests.map((r) => `${r.method} ${r.label}`)));
    s.soft(!srv.requests.some((r) => r.params && r.params.action === 'whats_changed'), 'no separate "whats_changed" request any more (Phase 2 replaces it)');
    s.ok(!srv.problems.some((p) => p.kind === 'preflight'), 'no CORS preflight (OPTIONS) reached the web app');
    s.ok(srv.requests.every((r) => !/THREW|not JSON|HTML|nothing/.test(r.summary || '')), 'every web app answer was JSON', K.show(srv.requests.filter((r) => /THREW|not JSON|HTML|nothing/.test(r.summary || ''))));
    s.ok(B.consoleErrors(page).length === 0, 'no console errors in the form', K.show(B.consoleErrors(page)));
    await context.close();
    H.contractClean(s, h);
  });

  add('E2', 'Browser: an admin edits a question text and publishes; the form shows the new text', async (s) => {
    const browser = await needBrowser(s);
    if (!browser) return;
    if (!env) { s.skipped = 'E1 could not prepare the local Google'; return; }
    const { h, srv } = env;
    const newText = 'E2E v2: How likely are you to recommend Valmo to another partner?';
    const { page, context } = await B.newPage(browser);
    let opened = false;
    try {
      await page.goto(srv.localLink(env.links['DC-E2E-002']), { waitUntil: 'networkidle0', timeout: 30000 });
      await toNps(page);
      const before = await B.text(page, '.q-title');
      s.ok(before.indexOf(newText) < 0, 'before publishing, the partner sees the old text', K.show(before));
      opened = true;
    } catch (err) {
      await B.shot(page, 'E2-failed-before');
      s.ok(false, 'the form opens before the change', String(err.message));
    }
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.texts['q.nps'].en = newText;
    const saved = P(h, s, 'panelSave', [L.revision, m], { need: true });
    const pub = P(h, s, 'panelPublish', [saved.revision, 'E2E text change'], { need: true });
    s.need(pub && pub.ok && pub.version === 2, 'version 2 is published', K.show(pub));
    try {
      if (opened) await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
      else await page.goto(srv.localLink(env.links['DC-E2E-002']), { waitUntil: 'networkidle0', timeout: 30000 });
      await B.waitScreen(page, 'nps');
      const title = await B.text(page, '.q-title');
      await B.shot(page, 'E2-01-new-text');
      s.ok(title.indexOf(newText) >= 0, 'after Publish, reloading the form shows the new text at once', K.show(title));
    } catch (err) {
      await B.shot(page, 'E2-failed');
      s.ok(false, 'the form reloads after publishing', String(err.message));
    }
    s.ok(B.consoleErrors(page).length === 0, 'no console errors', K.show(B.consoleErrors(page)));
    await context.close();
  });

  add('E3', 'Browser: round gate - a closed round says "has closed", a draft round says "not open yet"', async (s) => {
    const browser = await needBrowser(s);
    if (!browser) return;
    if (!env) { s.skipped = 'E1 could not prepare the local Google'; return; }
    const { h, srv } = env;
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'closed'], { need: true });
    let ctx = await B.newPage(browser);
    try {
      await ctx.page.goto(srv.localLink(env.links['DC-E2E-003']), { waitUntil: 'networkidle0', timeout: 30000 });
      await B.waitFinal(ctx.page, /This survey has closed/, 15000);
      await B.shot(ctx.page, 'E3-01-closed');
      s.ok(true, 'a new visitor on a closed round sees "This survey has closed"');
    } catch (err) {
      await B.shot(ctx.page, 'E3-closed-failed');
      s.ok(false, 'a new visitor on a closed round sees "This survey has closed"', String(err.message));
    }
    s.ok(B.consoleErrors(ctx.page).length === 0, 'no console errors (closed round)', K.show(B.consoleErrors(ctx.page)));
    await ctx.context.close();
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.rounds.push({ id: '2026-R9', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'E2E draft round' });
    P(h, s, 'panelSave', [L.revision, m], { need: true });
    const gl = P(h, s, 'panelGenerateLinks', ['2026-R9', { only_missing: true }]);
    s.ok(gl && gl.created >= 1, 'links can be made for a draft round', K.show(gl));
    const draftLink = linkMap(h, '2026-R9')['DC-E2E-001'];
    ctx = await B.newPage(browser);
    try {
      await ctx.page.goto(srv.localLink(draftLink), { waitUntil: 'networkidle0', timeout: 30000 });
      await B.waitFinal(ctx.page, /not open yet/, 15000);
      await B.shot(ctx.page, 'E3-02-not-open');
      s.ok(true, 'a link of a draft round shows "This survey is not open yet"');
    } catch (err) {
      await B.shot(ctx.page, 'E3-not-open-failed');
      s.ok(false, 'a link of a draft round shows "This survey is not open yet"', String(err.message));
    }
    s.ok(B.consoleErrors(ctx.page).length === 0, 'no console errors (draft round)', K.show(B.consoleErrors(ctx.page)));
    await ctx.context.close();
  });

  add('E4', 'Browser: preview link shows the saved draft with a PREVIEW banner and sends nothing', async (s) => {
    const browser = await needBrowser(s);
    if (!browser) return;
    if (!env) { s.skipped = 'E1 could not prepare the local Google'; return; }
    const { h, srv } = env;
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    const draftText = 'Preview only: is this the draft question?';
    m.texts['q.nps'].en = draftText;
    P(h, s, 'panelSave', [L.revision, m], { need: true });
    const pv = P(h, s, 'panelPreviewUrl', ['2026-R1'], { need: true });
    const before = srv.requests.length;
    const { page, context } = await B.newPage(browser);
    try {
      await page.goto(srv.localLink(pv.url), { waitUntil: 'networkidle0', timeout: 30000 });
      await toNps(page);
      const banner = await page.$eval('#dev-banner', (e) => (e.hidden ? '' : e.textContent.trim()));
      s.ok(/PREVIEW/.test(banner), 'the PREVIEW banner shows', K.show(banner));
      s.ok((await B.text(page, '.q-title')).indexOf(draftText) >= 0, 'the preview shows the saved (unpublished) draft text', K.show(await B.text(page, '.q-title')));
      await B.shot(page, 'E4-01-preview');
      await answerAll(page, { nps: 9, ratings: {} });
      await B.waitFinal(page, /Preview finished/, 15000);
      await B.shot(page, 'E4-02-preview-done');
      s.ok(true, 'finishing a preview shows "Preview finished. Nothing was saved."');
    } catch (err) {
      await B.shot(page, 'E4-failed');
      s.ok(false, 'the preview can be completed', String(err.message));
    }
    const during = srv.requests.slice(before);
    s.ok(during.some((r) => r.params && r.params.action === 'bootstrap' && r.params.draft === '1'), 'the preview asks for the draft (bootstrap with draft=1)', K.show(during.map((r) => r.label)));
    s.ok(!during.some((r) => r.method === 'POST'), 'a preview sends no pings and no answers', K.show(during.filter((r) => r.method === 'POST').map((r) => r.label)));
    s.ok(B.consoleErrors(page).length === 0, 'no console errors', K.show(B.consoleErrors(page)));
    await context.close();
  });

  add('F', 'Browser: the control panel (Panel.html) opens without console errors; every section opens', async (s) => {
    const browser = await needBrowser(s);
    if (!browser) return;
    let srv;
    if (env) srv = env.srv;
    else {
      const h = H.setupPublished(s);
      srv = createHarnessServer({ harness: h, port: 0, quiet: true, appsScriptDir: H.config.appsScriptDir, webDir: H.config.webDir });
      await srv.start();
      shared.onCleanup(() => srv.stop());
    }
    const { page, context } = await B.newPage(browser, { desktop: true, width: 1100, height: 760 });
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith(srv.baseUrl()) && !/^data:|^blob:|^about:/.test(r.url())) external.push(r.url()); });
    const rpcBefore = srv.rpcCalls.length;
    try {
      await page.goto(srv.baseUrl() + 'panel', { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-test]').length > 3 && !window.__harnessRpc, { timeout: 20000, polling: 200 });
      await B.sleep(1200);
      await B.shot(page, 'F-01-panel-home');
    } catch (err) {
      await B.shot(page, 'F-failed');
      s.ok(false, 'the panel loads', String(err.message));
    }
    const calls = srv.rpcCalls.slice(rpcBefore);
    s.ok(calls.some((c) => c.name === 'panelLoad' && c.ok), 'the panel calls panelLoad when it opens', K.show(calls.map((c) => c.name)));
    s.ok(calls.every((c) => c.ok), 'every server call the panel made succeeded', K.show(calls.filter((c) => !c.ok)));
    s.ok(calls.every((c) => !c.problems.length), 'the panel never received Date objects (Google would send null)', K.show(calls.filter((c) => c.problems.length)));
    s.ok(B.consoleErrors(page).length === 0, 'no console errors while the panel loads', K.show(B.consoleErrors(page)));
    const navs = await page.$$eval('[data-test^="nav-"]', (els) => els.map((e) => e.getAttribute('data-test'))).catch(() => []);
    s.ok(navs.length >= 8, 'the panel has its left navigation (data-test="nav-…")', K.show(navs));
    s.soft(['nav-questions', 'nav-publish', 'nav-links', 'nav-settings'].every((n) => navs.indexOf(n) >= 0), 'navigation includes Questions, Publish, Links, Settings', K.show(navs));
    for (const id of navs) {
      try {
        const el = await page.$(`[data-test="${id}"]`);
        await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await el.click();
        await B.sleep(700);
        await page.waitForFunction(() => !window.__harnessRpc, { timeout: 15000, polling: 200 });
        await B.shot(page, `F-${id}`);
      } catch (err) {
        s.ok(false, `the panel section ${id} opens`, String(err.message));
      }
    }
    const allCalls = srv.rpcCalls.slice(rpcBefore);
    s.ok(allCalls.every((c) => c.ok), 'every server call made while opening the sections succeeded', K.show(allCalls.filter((c) => !c.ok)));
    s.ok(B.consoleErrors(page).length === 0, 'no console errors after opening every section', K.show(B.consoleErrors(page)));
    s.ok(external.length === 0, 'the panel loads nothing from other websites (one self-contained file)', K.show(external));
    // Since 20 Oct the panel shrinks its own window on small screens (Panel.html fitToScreen) with
    // google.script.host.setHeight / setWidth, used only when Google provides them. Nothing else from
    // google.script.host is used, and it only ever asks for a size up to the 1100 x 760 the Sheet opened.
    const hostCalls = page.consoleMessages.filter((m) => /google\.script\.host/.test(m));
    s.soft(hostCalls.every((m) => /google\.script\.host\.set(Height|Width)\(/.test(m)),
      'the panel uses google.script.host only to fit its window to the screen (setHeight / setWidth), never close() or the editor', K.show(hostCalls));
    const sizes = await page.evaluate(() => window.__harnessHostSizes || []).catch(() => []);
    s.soft(sizes.every(([what, n]) => typeof n === 'number' && n > 0 && n <= (what === 'height' ? 760 : 1100)),
      'it only ever shrinks the window (height up to 760, width up to 1100)', K.show(sizes));
    s.note(`The panel asked google.script.host for: ${sizes.length ? sizes.map(([what, n]) => `${what} ${n}`).join(', ') : 'nothing'}`);
    s.soft(await page.$('[data-test="save"]') !== null, 'there is a Save button (data-test="save")');
    s.note(`The panel made ${allCalls.length} server call(s): ${Array.from(new Set(allCalls.map((c) => c.name))).join(', ')}`);
    await context.close();
  });
};

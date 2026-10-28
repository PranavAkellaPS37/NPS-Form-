/* =============================================================================
   scenarios/flow.js  -  G11: the questionnaire's route as a graph (stage 4 of
   the flow-graph work, 23 Oct 2026; docs/flow-engine.md section 9)

   WHAT THIS FILE IS
     One scenario, G11, that runs the real Code.gs, Model.gs, PanelServer.gs and
     the generated Flow.gs inside the pretend Google:
       - set-up publishes the route as the graph phones walk (exactly the
         repo's graph, which is what the form's own converter made of the old
         list);
       - ?action=health shows which route code the deployment runs
         (flow_engine, flow_fingerprint);
       - the Screens columns next, jumps and repeat travel through panelLoad,
         panelSave and the Sheet, and compile to jumps, a question per area
         rated low and a second ending, which the form's engine walks;
       - the publish guard: an older form on GitHub (no "ENGINE = 2" in
         js/flow.js) is refused in plain English and nothing goes live; the
         new form is accepted (and trusted for 10 minutes); an unreachable
         form only warns;
       - the codes lock covers every code ever published once a real round
         has opened (Script Property CODES_EVER_LIVE): a question hidden,
         published and then deleted stays locked, and deleting it is an error
         that stops Publish (since 26 Oct 2026, the flow checker's C1);
       - the GitHub copy writes the graph; importing it back, and restoring a
         graph version, give the same rows; a graph the panel can't show is
         refused and changes nothing.
     And G12, the reviewers' fixes of 26 Oct 2026 (Google side and panel):
       - a hidden extra ending still ends its route (partners end at the main
         thank-you screen, never in another route's questions); a deleted
         ending that would let one route run on into another stops Publish
         (since 27 Oct 2026 told once, in the route table's words: Flow.gs's
         note G5);
       - the codes lock compares codes kind by kind: a problem code another
         area shares, or an answer code another question shares, deleted in
         one place, stops Publish; and (27 Oct 2026, review W8 finding 3) a
         question partners answered can't change its kind (a voice/typing
         question made a faces question stops Publish, at its row);
       - while Google Drive can't read the live version, Publish (codes
         locked) refuses in plain English and publishes nothing;
       - set-up's closing notes carry Publish's warnings (the form on GitHub
         could not be checked);
       - the GitHub copy brings docs/flow.md, exactly what "node
         scripts/flow.js map" makes of the copy's own files.

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only G11,G12).

   WHAT IT READS / WRITES
     Reads web/js/flow.js and web/js/flow-panel.js (to walk the published route
     and to know the expected text), and runs "node scripts/flow.js map" (read
     only). G12 writes the GitHub copy it checks into out/g12-copy/ (inside
     this folder, removed again); everything else happens in memory, with fake
     DCs and fake accounts only.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const K = require('../lib/testkit');
const C = require('../lib/contract');
const H = require('../lib/helpers');

const P = (h, s, fn, args, opts) => K.call(h, s, fn, args, Object.assign({ context: 'panel' }, opts || {}));
const idx = (m, id) => (m.screens || []).findIndex((x) => x.id === id);
const langs = (en, hi) => ({ en, hi: hi || en, ta: '', te: '', kn: '', ml: '' });
const blank = (f) => Object.assign({ id: '', type: '', text: '', required: null, show_if: null, skip_if: '', options: [],
  low_label: '', high_label: '', scale_hint: '', body: '', active: true, next: '', jumps: [], repeat: '' }, f);
const FLOW_JS = C.FORM_URL + 'js/flow.js';

/* The screens partners see for some answers, walked by the form's own engine. */
function walk(survey, answers) {
  const s = JSON.parse(JSON.stringify(survey));
  return C.FLOW.path(C.FLOW.load(s), s, { facts: { lang_in_url: true, whats_changed_count: 0 } }, { answers: answers || {} }).map((x) => x.id);
}

/* The draft with the new columns: promoters jump, a callback per low area, a short route with its own ending. */
function withRoute(model) {
  const m = H.clone(model);
  m.screens[idx(m, 'nps')].jumps = [{ when: { answer: 'nps', at_least: 9 }, goto: 'support_gate' },
    { when: { answer: 'nps', at_most: 3 }, goto: 'why_low' }];
  m.screens.splice(idx(m, 'support_gate'), 0, blank({ id: 'callback', type: 'yes_no', text: 'q.callback', required: false, repeat: 'each_low_area' }));
  m.screens.push(blank({ id: 'why_low', type: 'free_text', text: 'q.why_low', required: false }),
    blank({ id: 'short_end', type: 'thank_you', text: 'end.short_end.title', body: 'end.short_end.body' }));
  m.texts['q.callback'] = langs('Should someone call you about this area?', 'क्या कोई आपको इस बारे में फ़ोन करे?');
  m.texts['q.why_low'] = langs('What is the main reason for your score?', 'आपके स्कोर का मुख्य कारण क्या है?');
  m.texts['end.short_end.title'] = langs('Thank you for telling us', 'बताने के लिए धन्यवाद');
  m.texts['end.short_end.body'] = langs('We will look into it.', 'हम इस पर ध्यान देंगे।');
  return m;
}

/* Two short routes below the main thank-you screen (review finding 1): promoters (NPS 9-10) jump to promo_q,
   which goes on to their own ending promo_end; detractors (0-6) jump to detractor_q and detractor_end. */
function withBranches(model) {
  const m = H.clone(model);
  m.screens[idx(m, 'nps')].jumps = [{ when: { answer: 'nps', at_least: 9 }, goto: 'promo_q' }, { when: { answer: 'nps', at_most: 6 }, goto: 'detractor_q' }];
  m.screens.push(blank({ id: 'promo_q', type: 'free_text', text: 'q.promo_q', required: false }),
    blank({ id: 'promo_end', type: 'thank_you', text: 'end.promo_end.title', body: 'end.promo_end.body' }),
    blank({ id: 'detractor_q', type: 'free_text', text: 'q.detractor_q', required: false }),
    blank({ id: 'detractor_end', type: 'thank_you', text: 'end.detractor_end.title', body: 'end.detractor_end.body' }));
  m.texts['q.promo_q'] = langs('What do you like most about Valmo?');
  m.texts['q.detractor_q'] = langs('What went wrong?');
  ['promo_end', 'detractor_end'].forEach((id) => {
    m.texts['end.' + id + '.title'] = langs('Thank you (' + id + ')');
    m.texts['end.' + id + '.body'] = langs('Your answers were sent (' + id + ').');
  });
  return m;
}
const ALL_FIVE = { 'fn_rating:losses': 5, 'fn_rating:payments': 5, 'fn_rating:linehaul': 5, 'fn_rating:consumables': 5, 'fn_rating:orders': 5, 'fn_rating:app': 5 };

module.exports = function register(add) {
  add('G11', 'The route as a graph: set-up and Publish send the graph; health shows the route code; the Screens columns next/jumps/repeat; the publish guard (old form refused, new form, unreachable); the codes lock over every code ever published; the GitHub copy, import and restore of graph versions', async (s) => {
    const h = H.setupPublished(s);
    const facts = C.repoFacts();
    const props = h.admin.props.script;
    const liveDoc = () => JSON.parse(h.admin.drive.text(props.get('LIVE_FILE_ID')) || 'null');

    // ---- 1. set-up published the graph; health shows the route code ---------------------------------
    s.eq(liveDoc().survey.flow, facts.graph, 'set-up publishes the route as the graph: exactly the repo\'s graph (PP.flow.fromLegacy of the old list)');
    const health = K.webJson(s, K.webGet(h, { action: 'health' }), 'health') || {};
    s.eq([health.flow_engine, health.flow_fingerprint], [2, h.get('PP_FLOW_FINGERPRINT_')], 'health: flow_engine 2 and Flow.gs\'s fingerprint');

    // ---- 2. the new columns through the panel and the Sheet --------------------------------------------
    let L = P(h, s, 'panelLoad', [], { need: true });
    s.ok((L.model.screens || []).every((x) => x.next === '' && Array.isArray(x.jumps) && x.jumps.length === 0 && x.repeat === ''),
      'panelLoad: every screen has next "", jumps [] and repeat ""', K.show((L.model.screens || []).slice(0, 2)));
    const draft = withRoute(L.model);
    const saved = P(h, s, 'panelSave', [L.revision, draft], { need: true });
    s.need(saved && saved.ok === true, 'panelSave of a draft with jumps, a repeated question and a second ending', K.show(saved));
    L = P(h, s, 'panelLoad', [], { need: true });
    const nps = L.model.screens[idx(L.model, 'nps')];
    s.eq(nps.jumps, draft.screens[idx(draft, 'nps')].jumps, 'panelLoad gives the jumps back');
    s.eq(L.model.screens[idx(L.model, 'callback')].repeat, 'each_low_area', 'and the repeat');
    s.eq(L.model.screens.map((x) => x.id).slice(-3), ['thanks', 'why_low', 'short_end'], 'rows after the main thank-you are kept in place');
    const sheetRow = h.admin.table(null, 'Screens').rows.find((r) => r.screen_id === 'nps') || {};
    s.eq(String(sheetRow.jumps), JSON.stringify(nps.jumps), 'the Screens tab\'s jumps column holds the jumps as JSON');
    // a panel window opened before the update sends screens without the new fields: a save keeps them
    const old = H.clone(L.model);
    old.screens.forEach((x) => { delete x.next; delete x.jumps; delete x.repeat; });
    const s2 = P(h, s, 'panelSave', [L.revision, old], { need: true });
    L = P(h, s, 'panelLoad', [], { need: true });
    s.ok(s2 && s2.ok && K.deepEqual(L.model.screens[idx(L.model, 'nps')].jumps, nps.jumps) && L.model.screens[idx(L.model, 'callback')].repeat === 'each_low_area',
      'a save from a panel that does not know the new columns keeps them (taken from the saved draft)', K.show(L.model.screens[idx(L.model, 'nps')]));
    const v = P(h, s, 'panelValidate', [L.model]);
    s.ok(v && v.errors.length === 0, 'panelValidate: no errors (several endings; rows after the thank-you reached by a jump)', K.show(v && v.errors));

    // ---- 3. the publish guard ---------------------------------------------------------------------------
    h.admin.cache.clear();
    h.control.routeUrl(FLOW_JS, { code: 200, body: '/* flow.js of an older form */\nvar PP = {}; PP.flow = { buildSteps: function () {} };\n' });
    const historyBefore = h.admin.table(null, 'Publish history').rows.length;
    const refused = P(h, s, 'panelPublish', [L.revision, 'graph with an old form'], { need: true });
    s.ok(refused && refused.ok === false && Array.isArray(refused.errors) && refused.errors.length === 1 &&
      refused.errors[0].section === 'settings' && refused.errors[0].ref === 'Settings > form_url' &&
      refused.errors[0].message === 'The form on GitHub is older than this control panel: upload the new form code first, wait for the green tick, then publish.',
    'an older form on GitHub (no ENGINE = 2 in js/flow.js): Publish is refused with the plain message', K.show(refused));
    s.ok(props.get('LIVE_VERSION') === '1' && h.admin.table(null, 'Publish history').rows.length === historyBefore,
      'and nothing goes live (version 1 stays, no history row)', K.show(props.get('LIVE_VERSION')));
    s.ok(h.admin.fetchLog.some((f) => f.url === FLOW_JS), 'the guard read <form address>js/flow.js', K.show(h.admin.fetchLog.slice(-3)));
    h.control.routeUrl(FLOW_JS, { code: 200, body: '/* the new engine */\n  flow.ENGINE = 2;               // Publish reads this\n' });
    const pub = P(h, s, 'panelPublish', [L.revision, 'graph with the new form'], { need: true });
    s.ok(pub && pub.ok === true && pub.version === 2 && !pub.warnings, 'with the new form, Publish works (version 2, no warning)', K.show(pub));
    s.eq(h.admin.cache.get('form_engine:' + C.FORM_URL), '2', 'a form found new enough is remembered for a while (no fetch on every Publish)');
    const doc2 = liveDoc() || {};
    const flow2 = (doc2.survey || {}).flow || {};
    s.eq(((flow2.nodes || []).find((n) => n.id === 'nps') || {}).next, [{ when: { answer: 'nps', at_least: 9 }, goto: 'support_gate' },
      { when: { answer: 'nps', at_most: 3 }, goto: 'why_low' }, { default: 'fn_ratings' }], 'p2: the jumps, then the usual arrow');
    if (doc2.survey) {
      s.eq(walk(doc2.survey, { nps: 10 }), ['nps', 'support_gate', 'one_fix', 'thanks'], 'walked by the form\'s engine: a promoter skips the areas');
      s.eq(walk(doc2.survey, { nps: 2 }), ['nps', 'why_low', 'short_end'], 'a detractor gets the short route and its own ending');
      const low = { nps: 6, 'fn_rating:losses': 1, 'fn_rating:payments': 5, 'fn_rating:linehaul': 5, 'fn_rating:consumables': 5, 'fn_rating:orders': 5, 'fn_rating:app': 2 };
      s.eq(walk(doc2.survey, low).filter((id) => /^callback:/.test(id)), ['callback:losses', 'callback:app'], 'a callback question per area rated low');
    }
    const boot = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap') || {};
    s.eq(boot.survey && boot.survey.flow, flow2, 'the web app serves the graph to phones');
    // unreachable: Publish goes on, with a warning
    h.admin.cache.clear();
    h.control.routeUrl(FLOW_JS, { error: 'Address unavailable: ' + FLOW_JS });
    L = P(h, s, 'panelLoad', [], { need: true });
    const m3 = H.clone(L.model);
    m3.texts['q.callback'].en = 'Should someone from Valmo call you about this area?';
    const s3 = P(h, s, 'panelSave', [L.revision, m3], { need: true });
    const pub3 = P(h, s, 'panelPublish', [s3.revision, 'form unreachable'], { need: true });
    s.ok(pub3 && pub3.ok === true && pub3.version === 3 && Array.isArray(pub3.warnings) && pub3.warnings.length === 1 &&
      /could not check that the form on GitHub understands this version/.test(pub3.warnings[0]) && H.plainEnglish(pub3.warnings[0]),
    'GitHub unreachable: Publish goes on and warns in plain English', K.show(pub3));
    h.control.routeUrl(FLOW_JS, { code: 404, body: '404: Not Found' });
    const pub4 = P(h, s, 'panelPublish', [s3.revision, 'no flow.js there'], { need: true });
    s.ok(pub4 && pub4.ok === true && Array.isArray(pub4.warnings) && /answered 404/.test(pub4.warnings[0]), 'a 404 is not proof of an old form: it warns too', K.show(pub4));
    h.control.routeUrl(FLOW_JS, { code: 200, body: 'flow.ENGINE = 2;' });
    h.admin.cache.clear();

    // ---- 4. the codes lock covers every code ever published ---------------------------------------------
    s.ok(!props.get('CODES_EVER_LIVE'), 'no CODES_EVER_LIVE while no real round has opened', K.show(props.get('CODES_EVER_LIVE')));
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    L = P(h, s, 'panelLoad', [], { need: true });
    const m5 = H.clone(L.model);
    m5.screens[idx(m5, 'callback')].active = false;                         // hide the callback question ...
    const s5 = P(h, s, 'panelSave', [L.revision, m5], { need: true });
    const pub5 = P(h, s, 'panelPublish', [s5.revision, 'callback hidden'], { need: true });   // ... and publish
    s.ok(pub5 && pub5.ok === true, 'publish with the callback question hidden', K.show(pub5));
    let codes = [];
    try { codes = JSON.parse(props.get('CODES_EVER_LIVE') || '[]'); } catch (e) { codes = ['(not JSON)']; }
    s.ok(codes.indexOf('screen:callback') !== -1 && codes.indexOf('screen:nps') !== -1 && codes.indexOf('chip:payments/invoice_gst') !== -1 &&
      codes.indexOf('support:kept_updated') !== -1, 'Publish records CODES_EVER_LIVE: the codes of the version live until then (with callback) and of the new one',
    K.show(codes.slice(0, 12)));
    s.ok(liveDoc().survey.flow.nodes.every((n) => n.id !== 'callback'), 'the live version no longer has the callback question');
    L = P(h, s, 'panelLoad', [], { need: true });
    s.ok(L.live_ids && L.live_ids.screens.indexOf('callback') !== -1, 'panelLoad keeps it locked anyway: live_ids has "callback" (from CODES_EVER_LIVE)', K.show(L.live_ids && L.live_ids.screens));
    const m6 = H.clone(L.model);
    m6.screens.splice(idx(m6, 'callback'), 1);                              // now delete it
    const v6 = P(h, s, 'panelValidate', [m6]);
    // CHANGED EXPECTATION (26 Oct 2026, docs/flow-engine.md check C1): the one flow checker finds the deleted code, and it
    // is now an error (Publish waits until it is back), named as before; it is not warned about a second time.
    const blocked = (v6 && v6.errors || []).find((w) => w.section === 'screens' && w.ref === 'callback');
    s.ok(blocked && /was answered in an earlier published version but is no longer in the draft/.test(blocked.message) &&
      /Publish waits until it is back/.test(blocked.message) && H.plainEnglish(blocked.message),
    'deleting it is an error: the hide-and-publish hole is closed', K.show(v6 && v6.errors.filter((w) => w.section === 'screens')));
    s.ok(!(v6 && v6.warnings || []).some((w) => w.ref === 'callback'), 'and not a warning too', K.show(v6 && v6.warnings.filter((w) => w.ref === 'callback')));
    const refusedPub = P(h, s, 'panelPublish', [P(h, s, 'panelSave', [L.revision, m6], { need: true }).revision, 'callback deleted'], { need: true });
    s.ok(refusedPub && refusedPub.ok === false && (refusedPub.errors || []).some((e) => e.ref === 'callback'),
      'and Publish refuses it, saying why', K.show(refusedPub));
    L = P(h, s, 'panelLoad', [], { need: true });
    const back5 = P(h, s, 'panelSave', [L.revision, m5], { need: true });   // put the hidden callback question back for the rest
    const pub7 = P(h, s, 'panelPublish', [back5.revision, 'nothing new'], { need: true });
    const after = JSON.parse(props.get('CODES_EVER_LIVE') || '[]');
    s.ok(pub7 && pub7.ok && after.length === codes.length && after.every((c, i) => c === codes[i]), 'publishing again changes nothing in the list (no repeats)',
      K.show(after.length + ' vs ' + codes.length));

    // ---- 5. the GitHub copy, import and restore of graph versions ---------------------------------------
    const ex = P(h, s, 'panelExport', [], { need: true });
    const text = ex && ex.files && ex.files['survey.json'];
    const exported = text ? JSON.parse(text) : {};
    const live = liveDoc().survey.flow;
    s.ok(text && text.indexOf('\n  "flow": ' + C.FLOW_PANEL.formatFlow(live, 2) + '\n}\n') > 0 && text.indexOf('_flow_help') === -1,
      'the GitHub copy writes the route with formatFlow (its own note inside, no "_flow_help")', K.show(text && text.slice(-300)));
    const files = { 'config/survey.json': text, 'i18n/strings.json': ex.files['strings.json'],
      'config/whats_changed.json': ex.files['whats_changed.json'], 'config/audio_clips.json': ex.files['audio_clips.json'] };
    h.control.routeUrl('https://example.org/graph-copy/', (url) => {
      const name = url.slice('https://example.org/graph-copy/'.length);
      return files[name] ? { code: 200, body: files[name] } : { code: 404, body: '404: Not Found' };
    }, true);
    L = P(h, s, 'panelLoad', [], { need: true });
    const before = L.model.screens.filter((x) => x.active);
    const imp = P(h, s, 'panelImport', ['https://example.org/graph-copy/'], { need: true });
    L = P(h, s, 'panelLoad', [], { need: true });
    s.ok(imp && imp.ok && K.deepEqual(L.model.screens, before), 'importing that copy gives the same rows (jumps, repeat, both endings)',
      K.show(L.model.screens.map((x) => x.id)));
    s.eq(exported.flow && exported.flow._help, C.FLOW_PANEL.FLOW_HELP, 'the copy carries the route\'s note');
    const bad = JSON.parse(text);
    bad.flow.nodes.splice(2, 0, { id: 'my_group', type: 'group', repeat_for: { each: 'item', in: 'support_items' },
      body: { start: 'x', nodes: [{ id: 'x', type: 'yes_no', text: 'q.support_gate', store_as: 'x:{item}', next: '@next_item' }] }, next: 'nps' });
    bad.flow.nodes[1].next = 'my_group';
    files['config/survey.json'] = JSON.stringify(bad);
    const refusedImport = h.exec('panelImport', ['https://example.org/graph-copy/'], { context: 'panel' });
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    s.ok(!refusedImport.ok && /control panel cannot show/.test(refusedImport.error.message) && /"my_group"/.test(refusedImport.error.message) &&
      H.plainEnglish(refusedImport.error.message) && L2.revision === L.revision,
    'a route the panel cannot show is refused in plain English, naming the screen, and nothing changes',
    refusedImport.ok ? K.show(refusedImport.value) : refusedImport.error.message);
    const restored = P(h, s, 'panelRestore', [2], { need: true });
    L = P(h, s, 'panelLoad', [], { need: true });
    const cb = L.model.screens[idx(L.model, 'callback')] || {};
    s.ok(restored && restored.ok && cb.active === true && cb.repeat === 'each_low_area' &&
      K.deepEqual(L.model.screens[idx(L.model, 'nps')].jumps, nps.jumps), 'restoring version 2 (a graph) brings back its rows with their jumps and repeat',
    K.show(cb));
    s.ok(L.draft_differs_from_live === true, 'the restored draft differs from live (callback shown again)', K.show(L.draft_differs_from_live));
    H.contractClean(s, h);
  });

  add('G12', 'The 26 Oct review fixes: a hidden or deleted ending never lets a route run into another; the codes lock per area and per question; Publish waits while Drive can\'t read the live version; Publish warnings in set-up\'s notes; docs/flow.md in the GitHub copy', async (s) => {
    const h = H.setupPublished(s);
    const props = h.admin.props.script;
    const liveDoc = () => JSON.parse(h.admin.drive.text(props.get('LIVE_FILE_ID')) || 'null');
    const history = () => h.admin.table(null, 'Publish history').rows.length;

    // ---- 1. endings (review finding 1) ------------------------------------------------------------------
    let L = P(h, s, 'panelLoad', [], { need: true });
    const branches = withBranches(L.model);
    branches.screens[idx(branches, 'promo_end')].active = false;          // the promoters' ending, hidden
    let sv = P(h, s, 'panelSave', [L.revision, branches], { need: true });
    const v1 = P(h, s, 'panelValidate', [branches]) || { errors: [], warnings: [] };
    s.ok(v1.errors.length === 0 && v1.warnings.some((w) => /an ending that is hidden, so partners end at the main thank-you screen, question \d+ \(Thank-you screen\), instead/.test(w.message)),
      'a hidden ending is allowed, and a warning says partners end at the main thank-you screen instead', K.show(v1.errors.concat(v1.warnings).filter((i) => i.section === 'screens')));
    const pub1 = P(h, s, 'panelPublish', [sv.revision, 'promoters\' ending hidden'], { need: true });
    s.ok(pub1 && pub1.ok === true, 'Publish goes ahead', K.show(pub1));
    const promoter = walk(liveDoc().survey, { nps: 10 });
    s.eq(promoter, ['nps', 'promo_q', 'thanks'], 'walked by the form\'s engine: promoters end at the main thank-you screen, never in the detractors\' questions');
    s.eq(walk(liveDoc().survey, Object.assign({ nps: 2 }, ALL_FIVE)), ['nps', 'detractor_q', 'detractor_end'], 'detractors still get their own route');
    const direct = H.clone(branches);                                       // a jump straight to the hidden ending
    direct.screens[idx(direct, 'nps')].jumps[0].goto = 'promo_end';
    const compiled = h.exec('PP_compile', [direct, null], { context: 'panel' });
    s.ok(compiled.ok && K.deepEqual(walk(compiled.value.survey, { nps: 10 }), ['nps', 'thanks']),
      'a jump straight to the hidden ending: promoters end at the main thank-you screen', compiled.ok ? K.show(walk(compiled.value.survey, { nps: 10 })) : compiled.error.message);
    L = P(h, s, 'panelLoad', [], { need: true });
    const deleted = H.clone(L.model);
    deleted.screens.splice(idx(deleted, 'promo_end'), 1);                  // now deleted instead of hidden
    sv = P(h, s, 'panelSave', [L.revision, deleted], { need: true });
    const liveBefore = props.get('LIVE_VERSION');
    const historyBefore = history();
    const refused = P(h, s, 'panelPublish', [sv.revision, 'promoters\' ending deleted'], { need: true });
    // since 27 Oct 2026 (review W8 finding 2) told once, in the route table's words: Flow.gs's note G5
    const runOns = refused ? (refused.errors || []).filter((e) => /go straight on to/.test(e.message)) : [];
    const runOn = runOns.find((e) => /has no "then go to", so partners who answer it go straight on to question \d+ \("What went wrong\?"\), which starts another route: question 3 \("[^"]*"\) jumps there\. Write where it goes in its "then go to" column/.test(e.message));
    s.ok(refused && refused.ok === false && runOn && runOns.length === 1 && H.plainEnglish(runOn.message),
      'deleted: promoters would run on into the detractors\' question, so Publish refuses, once, saying which question needs a "then go to"', K.show(refused));
    s.ok(props.get('LIVE_VERSION') === liveBefore && history() === historyBefore, 'and nothing goes live', K.show([props.get('LIVE_VERSION'), liveBefore]));
    L = P(h, s, 'panelLoad', [], { need: true });
    const fixed = H.clone(L.model);
    fixed.screens[idx(fixed, 'promo_q')].next = 'thanks';                   // its route ends at the main thank-you screen
    sv = P(h, s, 'panelSave', [L.revision, fixed], { need: true });
    const pub2 = P(h, s, 'panelPublish', [sv.revision, 'promoters end at the main thank-you'], { need: true });
    s.ok(pub2 && pub2.ok === true && K.deepEqual(walk(liveDoc().survey, { nps: 10 }), ['nps', 'promo_q', 'thanks']),
      'with "then go to: the thank-you screen" (an ending above it is allowed) Publish works and promoters end there', K.show(pub2));

    // ---- 2. the codes lock, kind by kind (review finding 2) ---------------------------------------------
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    L = P(h, s, 'panelLoad', [], { need: true });
    const shared = H.clone(L.model);
    const chip = H.clone(shared.chips.find((c) => c.area === 'payments' && c.code === 'payout_delayed'));
    chip.area = 'linehaul';
    shared.chips.push(chip);                                                // Line haul gets a problem with the same code
    shared.texts['issue.linehaul.payout_delayed'] = langs('Payout for trips delayed');
    ['visits', 'calls'].forEach((id) => {
      shared.screens.splice(idx(shared, 'one_fix'), 0, blank({ id, type: 'single_choice', text: 'q.' + id, options: ['often', 'rarely'] }));
      shared.texts['q.' + id] = langs('How often? (' + id + ')');
      ['often', 'rarely'].forEach((o) => { shared.texts['choice.' + id + '.' + o] = langs(o); });
    });
    sv = P(h, s, 'panelSave', [L.revision, shared], { need: true });
    const pub3 = P(h, s, 'panelPublish', [sv.revision, 'shared codes'], { need: true });
    s.ok(pub3 && pub3.ok === true, 'publish a version with a shared problem code and a shared answer code', K.show(pub3));
    let codes = [];
    try { codes = JSON.parse(props.get('CODES_EVER_LIVE') || '[]'); } catch (e) { codes = []; }
    s.ok(['chip:payments/payout_delayed', 'chip:linehaul/payout_delayed', 'option:visits/rarely', 'option:calls/rarely'].every((c) => codes.indexOf(c) !== -1),
      'CODES_EVER_LIVE keeps them per area and per question', K.show(codes.filter((c) => /payout_delayed|rarely/.test(c))));
    L = P(h, s, 'panelLoad', [], { need: true });
    const gone = H.clone(L.model);
    gone.chips = gone.chips.filter((c) => !(c.area === 'payments' && c.code === 'payout_delayed'));
    gone.screens[idx(gone, 'visits')].options = ['often'];
    const v2 = P(h, s, 'panelValidate', [gone]) || { errors: [] };
    const chipErr = v2.errors.find((e) => e.section === 'chips' && e.ref === 'payments/payout_delayed');
    const optErr = v2.errors.find((e) => e.section === 'screens' && e.ref === 'visits/rarely');
    s.ok(chipErr && /Publish waits until it is back/.test(chipErr.message), 'a problem deleted from Payments only is an error, although Line haul has the same code', K.show(v2.errors));
    s.ok(optErr && !/hide it/i.test(optErr.message) && /can't be hidden/.test(optErr.message),
      'an answer removed from one question is an error, although another question has the same code; it never says "hide it"', K.show(optErr));
    sv = P(h, s, 'panelSave', [L.revision, gone], { need: true });
    const refused2 = P(h, s, 'panelPublish', [sv.revision, 'shared codes deleted'], { need: true });
    s.ok(refused2 && refused2.ok === false && (refused2.errors || []).some((e) => e.ref === 'payments/payout_delayed') &&
      (refused2.errors || []).some((e) => e.ref === 'visits/rarely'), 'and Publish refuses both', K.show(refused2));
    // a question partners answered keeps its kind (27 Oct 2026, review W8 finding 3): in the route table that is one cell
    L = P(h, s, 'panelLoad', [], { need: true });
    const kinded = H.clone(shared);
    kinded.screens[idx(kinded, 'one_fix')].type = 'rating_1_5';             // voice/typing -> faces
    const v3 = P(h, s, 'panelValidate', [kinded]) || { errors: [] };
    const kindErr = v3.errors.find((e) => e.section === 'screens' && e.ref === 'screen ' + (idx(kinded, 'one_fix') + 1) && /its kind can't change/.test(e.message));
    s.ok(kindErr && /is now of the kind "faces", but partners have already answered it as a question of the kind "voice\/typing"/.test(kindErr.message) &&
      H.plainEnglish(kindErr.message), 'a live voice/typing question made a faces question is an error at its row, naming both kinds as the route table does', K.show(v3.errors));
    sv = P(h, s, 'panelSave', [L.revision, kinded], { need: true });
    const liveBefore3 = props.get('LIVE_VERSION');
    const refused3 = P(h, s, 'panelPublish', [sv.revision, 'one_fix re-typed'], { need: true });
    s.ok(refused3 && refused3.ok === false && (refused3.errors || []).some((e) => /its kind can't change/.test(e.message)) &&
      props.get('LIVE_VERSION') === liveBefore3, 'and Publish refuses it: nothing goes live', K.show(refused3));

    // ---- 3. Google Drive can't read the live version: Publish waits (review finding 9) -----------------
    L = P(h, s, 'panelLoad', [], { need: true });
    sv = P(h, s, 'panelSave', [L.revision, shared], { need: true });         // the codes are all back
    h.admin.cache.clear();
    const liveFile = props.get('LIVE_FILE_ID');
    const versionBefore = props.get('LIVE_VERSION');
    const historyBefore2 = history();
    h.control.driveError = (item) => (item.id === liveFile ? 'We\'re sorry, a server error occurred. Please wait a bit and try again.' : null);
    const hiccup = h.exec('panelPublish', [sv.revision, 'during a Drive hiccup'], { context: 'panel' });
    h.control.driveError = null;
    s.ok(!hiccup.ok && /Google Drive could not read the live version \(version \d+\) just now/.test(hiccup.error.message) &&
      /Try again in a minute/.test(hiccup.error.message) && H.plainEnglish(hiccup.error.message),
    'codes locked and the live version unreadable: Publish refuses in plain English ("try again in a minute")', hiccup.ok ? K.show(hiccup.value) : hiccup.error.message);
    s.ok(props.get('LIVE_VERSION') === versionBefore && history() === historyBefore2, 'and nothing is published', K.show([props.get('LIVE_VERSION'), versionBefore]));
    const after = P(h, s, 'panelPublish', [sv.revision, 'after the hiccup'], { need: true });
    s.ok(after && after.ok === true, 'once Drive answers again, Publish works', K.show(after));

    // ---- 4. the GitHub copy brings docs/flow.md (review finding 10) --------------------------------------
    const ex = P(h, s, 'panelExport', [], { need: true });
    const files = (ex && ex.files) || {};
    s.ok(typeof files['flow.md'] === 'string' && /^<!-- GENERATED by  node scripts\/flow\.js map --write/.test(files['flow.md']), 'panelExport returns flow.md', K.show(Object.keys(files)));
    const copy = path.join(__dirname, '..', 'out', 'g12-copy');
    fs.rmSync(copy, { recursive: true, force: true });
    fs.mkdirSync(path.join(copy, 'web', 'config'), { recursive: true });
    fs.mkdirSync(path.join(copy, 'web', 'i18n'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'web', 'config', 'survey.json'), files['survey.json'] || '');
    fs.writeFileSync(path.join(copy, 'web', 'i18n', 'strings.json'), files['strings.json'] || '');
    fs.copyFileSync(path.join(C.REPO, 'web', 'config', 'types.json'), path.join(copy, 'web', 'config', 'types.json'));
    let map = '';
    try { map = C.flowMap(path.join(copy, 'web')); } catch (e) { map = 'the map command failed: ' + e.message; }
    fs.rmSync(copy, { recursive: true, force: true });
    s.ok(files['flow.md'] === map, 'flow.md is byte-for-byte what "node scripts/flow.js map" makes of the exported survey.json and strings.json',
      K.show(String(files['flow.md']).slice(0, 200) + ' | ' + String(map).slice(0, 200)));
    s.ok(/promo_q/.test(files['flow.md'] || '') && /detractor_end/.test(files['flow.md'] || ''), 'it maps the draft\'s own route (both short routes)');

    // ---- 5. set-up's closing notes carry Publish's warnings (review finding 3) -----------------------------
    const h2 = H.harness();
    H.needLoaded(s, h2);
    h2.control.routeUrl(FLOW_JS, { error: 'Address unavailable: ' + FLOW_JS });   // the form on GitHub can't be reached
    const told = H.runSetup(s, h2, 'ppSetup (form unreachable)');
    const text = (told.last && told.last.message) || '';
    s.ok(h2.admin.props.script.get('LIVE_VERSION') === '1' && /Please check: Published, but Partner Pulse could not check that the form on GitHub understands this version/.test(text),
      'set-up publishes version 1 and its closing notes say what to check (no longer only in the log)', H.describeDialog(told.last));
    H.contractClean(s, h2);
    H.contractClean(s, h);
  });
};

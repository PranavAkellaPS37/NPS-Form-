/* =============================================================================
   scenarios/setup.js  -  S (static checks) and A (Set up or repair)

   WHAT THIS FILE IS
     S   reads the code without running it: coding rules, allowed services,
         Panel.html rules, required functions and constants.
     A1  "Set up or repair" on a brand-new Sheet, answering every question
         like an admin who accepts the defaults (copy the questionnaire from
         the default GitHub address, publish version 1): every tab with the
         contract's headers, colours, tick boxes, folders, secret, version 1.
     A2  running it again (repair) is safe: nothing duplicated or lost, a
         deleted tab comes back, the secret never changes.
     A3  before anything is published, and a set-up where the admin says
         "No" to publishing: the web app answers "not_published".

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only S,A).
   ============================================================================= */
'use strict';

const K = require('../lib/testkit');
const C = require('../lib/contract');
const H = require('../lib/helpers');
const { staticChecks, flowFreshness } = require('../lib/static-checks');

const REQUIRED_FUNCTIONS = ['onOpen', 'ppSetup', 'doGet', 'doPost', 'panelOpen', 'panelLoad', 'panelSave', 'panelValidate',
  'panelPublish', 'panelHistory', 'panelRestore', 'panelSetRoundStatus', 'panelRoundCounts', 'panelGenerateLinks',
  'panelPreviewUrl', 'panelNewPreviewKey', 'panelGetSecret', 'panelImport', 'panelExport', 'panelSetFormUrl',
  'panelSetWebAppUrl', 'PP_readModel', 'PP_writeModel',
  'PP_compile', 'PP_validate', 'PP_importStatic', 'PP_exportStatic', 'PP_publish', 'PP_restore', 'PP_modelFromPublished',
  'PP_ensureRoundStore_', 'PP_slug', 'PP_derivedTextKeys', 'ppFormRequest', 'PP_flowLib_', 'panelRouteTable'];
const REQUIRED_CONSTANTS = ['PP_SETTINGS_SCHEMA', 'PP_SCREEN_TYPES', 'PP_FORM_TEXT_KEYS', 'PP_FLOW_FINGERPRINT_', 'PP_FLOW_SOURCE_'];

module.exports = function register(add) {
  add('S', 'Static checks: files, syntax rules (no ?. or ??), allowed services, Panel.html, manifest, required functions', async (s) => {
    const r = staticChecks(H.config.appsScriptDir);
    if (!r.acorn) s.note('The acorn parser was not found, so syntax checks were skipped.');
    for (const p of r.problems) s.ok(false, 'contract coding rule', `${p.file}${p.line ? ':' + p.line : ''} ${p.text}`);
    for (const w of r.warnings) s.soft(false, 'coding style rule', `${w.file}${w.line ? ':' + w.line : ''} ${w.text}`);
    const unknown = Object.entries(r.unknownMethods);
    if (unknown.length) {
      s.note('Method names that are neither on the allowed list nor built into JavaScript (usually the code\'s own ' +
        'objects; check by hand): ' + unknown.map(([k, v]) => `${k} (${v.slice(0, 2).join(', ')})`).join('; '));
    }
    s.note(`Files: ${r.files.join(', ')}; Panel.html ${r.panelBytes || 0} bytes, ${r.panelScripts || 0} script block(s), ` +
      `${r.panelDataTests || 0} data-test mentions.`);
    // Panel.html's one exception (26 Oct 2026): the Map's Mermaid, pinned, with its integrity hash, in a frame
    // sandboxed without "allow-same-origin" (lib/static-checks.js mapException; any break is a problem above)
    if (r.acorn) {
      s.ok(Boolean(r.panelMap), 'Panel.html\'s one exception (the Map\'s drawing library) was checked', 'mapException found no script to check');
      if (r.panelMap && r.panelMap.mermaid) {
        s.note(`Panel.html loads only Mermaid from ${r.panelMap.url} (integrity ${String(r.panelMap.sri).slice(0, 18)}...), inside ` +
          `${r.panelMap.frames} frame(s) sandboxed as ${JSON.stringify(r.panelMap.sandboxes)}.`);
      }
    }
    // Flow.gs (stage 4 of the flow-graph work): the form's own route code, generated, never edited by hand.
    const fresh = flowFreshness(H.config.appsScriptDir, H.config.webDir);
    s.ok(fresh.fresh, 'Flow.gs is exactly what scripts/build_flow_gs.js makes from the form\'s web/js files today', fresh.problem);
    if (fresh.fingerprint) s.note(`Flow.gs is made from ${(fresh.files || []).join(', ')} (fingerprint ${fresh.fingerprint.slice(0, 12)}...).`);
    const h = H.harness();
    s.ok(h.loadErrors.length === 0, 'every .gs file loads into one shared scope (Code, Model, PanelServer order)',
      h.loadErrors.map((e) => `${e.file}: ${e.message}${e.where ? ' at ' + e.where : ''}`).join('; '));
    for (const name of REQUIRED_FUNCTIONS) {
      s.ok(typeof h.sandbox[name] === 'function', `function ${name} exists as a top-level declaration`,
        h.has(name) ? 'declared, but not as a top-level "function name() {}"' : 'not found');
    }
    for (const name of REQUIRED_CONSTANTS) s.ok(h.has(name), `${name} is defined`, 'not found');
    const panelFns = h.functionNames().filter((n) => /^panel/.test(n));
    s.note(`Functions the control panel can call (no trailing "_"): ${panelFns.join(', ')}`);
    const loadUses = h.loadRun ? Array.from(h.loadRun.uses.keys()) : [];
    s.soft(loadUses.length === 0, 'loading the files does not call Google services (top-level code runs on every request)',
      loadUses.join(', '));
    if (fresh.fingerprint) s.eq(h.get('PP_FLOW_FINGERPRINT_'), fresh.fingerprint, 'PP_FLOW_FINGERPRINT_ is the SHA-256 of those files');
    const lib = h.evaluate('(function () { var lib = PP_flowLib_(); return [typeof lib.flow.path, lib.flow.ENGINE, typeof lib.flowPanel.fromRows, ' +
      'typeof lib.flowPanel.toRows, typeof lib.flowPanel.formatFlow, lib === PP_flowLib_(), typeof PP]; })()');
    s.eq(lib, ['function', 2, 'function', 'function', 'function', true, 'undefined'],
      'PP_flowLib_() gives the engine (ENGINE 2) and the panel helpers, made once, without a global PP');
  });

  add('A1', 'Set up or repair on a brand-new Sheet (accept the GitHub address, publish version 1)', async (s) => {
    const h = H.harness();
    H.needLoaded(s, h);
    const opened = h.exec('onOpen', [], { context: 'simpleTrigger' });
    s.ok(opened.ok, 'onOpen works as a simple trigger (Google allows no Drive or internet there)',
      opened.ok ? '' : `onOpen threw: ${opened.error.message} ${opened.error.where || ''}`);
    const setup = H.runSetup(s, h);
    s.note(`ppSetup took ${setup.ms} ms. It showed: ` + setup.dialogs.map((d) => `[${d.kind}] ${d.title} -> ${d.answer || ''}`).join(' | '));
    s.need(setup.last && !/stopped|could not/i.test(setup.last.title), 'set-up finishes (no "Set-up stopped" message)', H.describeDialog(setup.last));
    s.ok(setup.dialogs.every((d) => H.plainEnglish(d.message || 'menu item')), 'every set-up message is plain English',
      setup.dialogs.filter((d) => !H.plainEnglish(d.message || 'menu item')).map(H.describeDialog).join(' | '));
    const fetched = h.admin.fetchLog.map((f) => f.url);
    s.ok(fetched.indexOf(C.DEFAULT_IMPORT_URL + 'config/survey.json') >= 0 && fetched.indexOf(C.DEFAULT_IMPORT_URL + 'i18n/strings.json') >= 0,
      'the questionnaire was copied from the default GitHub address (served from the repo by the fake UrlFetchApp)', K.show(fetched));

    const names = h.admin.bound().sheets.map((x) => x.name);
    for (const [tab, headers] of Object.entries(C.CONTROL_TABS)) {
      const info = h.admin.sheetInfo(null, tab);
      if (!s.ok(info, `tab "${tab}" exists`, `tabs: ${names.join(', ')}`)) continue;
      const got = info.header.map((c) => String(c.value));
      s.eq(got.slice(0, headers.length), headers, `"${tab}" has the contract's headers in order`);
      s.ok(info.frozenRows === 1, `"${tab}" row 1 is frozen`, `frozen rows: ${info.frozenRows}`);
      const head = info.header.slice(0, headers.length);
      s.ok(head.every((c) => c.fontWeight === 'bold'), `"${tab}" headers are bold`, K.show(head.map((c) => c.fontWeight)));
      s.ok(head.every((c) => String(c.background || '').toUpperCase() === '#EDE7F6'), `"${tab}" headers are light purple #EDE7F6`,
        K.show(head.map((c) => c.background)));
    }
    s.soft(!names.some((n) => /^Sheet\d+$/.test(n)), 'the empty starter tab "Sheet1" was removed', names.join(', '));
    const metaInfo = h.admin.sheetInfo(null, '_meta');
    s.ok(metaInfo && metaInfo.hidden, 'the _meta tab is hidden');
    const families = {};
    for (const [family, tabs] of Object.entries(C.TAB_GROUPS)) {
      const colours = tabs.map((t) => (h.admin.sheetInfo(null, t) || {}).tabColor);
      families[family] = colours;
      s.ok(colours.every((c) => H.colourFamily(c) === family), `${tabs.join(', ')}: ${family} tab colour`, K.show(colours));
    }
    for (const [tab, col] of Object.entries(C.CHECKBOX_COLUMNS)) {
      const info = h.admin.sheetInfo(null, tab);
      s.ok(info && info.validationByColumn[col] === 'checkbox', `"${tab}" column "${col}" uses tick boxes`,
        info ? K.show(info.validationByColumn) : 'no tab');
    }
    const meta = H.metaMap(h);
    s.ok(Number(meta.sheet_schema) === 1, '_meta sheet_schema = 1', K.show(meta));
    s.ok(Number.isInteger(Number(meta.draft_revision)) && String(meta.draft_revision) !== '', '_meta draft_revision is a whole number', K.show(meta.draft_revision));
    s.ok(!!meta.setup_done_at, '_meta setup_done_at is filled in', K.show(meta));

    const P = h.admin.props.script;
    s.ok(/^[0-9a-f]{64}$/.test(P.get('LINK_SECRET') || ''), 'LINK_SECRET = 64 hex characters (two UUIDs without dashes)', K.show(P.get('LINK_SECRET')));
    const paths = { FOLDER_ID: 'Valmo Partner Pulse', PUBLISHED_FOLDER_ID: 'Valmo Partner Pulse/published', ROUNDS_FOLDER_ID: 'Valmo Partner Pulse/rounds' };
    for (const [key, want] of Object.entries(paths)) {
      const id = P.get(key);
      const item = id ? h.admin.drive.byId(id) : null;
      s.ok(item && item.kind === 'folder' && h.admin.drive.path(id) === want, `${key} is the Drive folder "${want}"`,
        item ? h.admin.drive.path(id) : `property ${K.show(id)}`);
    }
    s.ok(P.get('LIVE_VERSION') === '1', 'version 1 is live (Script Property LIVE_VERSION = "1")', K.show(P.get('LIVE_VERSION')));
    const liveId = P.get('LIVE_FILE_ID');
    s.ok(liveId && h.admin.drive.path(liveId) === 'Valmo Partner Pulse/published/p1.json', 'LIVE_FILE_ID is published/p1.json',
      liveId ? h.admin.drive.path(liveId) : 'missing');
    const hist = h.admin.table(null, 'Publish history');
    s.ok(hist && hist.rows.length === 1 && hist.rows[0].live === true && Number(hist.rows[0].version) === 1,
      'Publish history: one row, version 1, live ticked', K.show(hist && hist.rows));
    if (hist && hist.rows[0]) {
      s.ok(/^p1-\d{4}-\d{2}-\d{2}$/.test(String(hist.rows[0].config_version)), 'Publish history config_version looks like p1-yyyy-MM-dd', K.show(hist.rows[0].config_version));
      s.ok(String(hist.rows[0].file).indexOf(liveId) >= 0, 'Publish history "file" is the Drive address of p1.json', K.show(hist.rows[0].file));
    }

    const facts = C.repoFacts();
    const texts = h.admin.table(null, 'Texts');
    s.eq(texts.rows.map((r) => String(r.key)).sort(), facts.textKeys.slice().sort(), 'Texts holds every key of web/i18n/strings.json (minus _help)');
    const nps = texts.rows.find((r) => r.key === 'q.nps');
    s.ok(nps && nps.en === facts.strings['q.nps'].en && nps.hi === facts.strings['q.nps'].hi, 'Texts values are copied exactly (q.nps, en + hi)', K.show(nps));
    s.eq(h.admin.table(null, 'Screens').rows.map((r) => r.screen_id), facts.flowIds, 'Screens lists the flow in order');
    s.eq(h.admin.table(null, 'Areas').rows.map((r) => r.area_id), facts.areas, 'Areas lists the areas in order');
    s.eq(h.admin.table(null, 'Chips').rows.length, facts.chips, 'Chips has every chip');
    s.eq(h.admin.table(null, 'Languages').rows.map((r) => r.code), facts.languages, 'Languages in the form\'s order');
    s.eq(h.admin.table(null, 'Support').rows.map((r) => r.item_code), facts.support, 'Support items');
    const rounds = h.admin.table(null, 'Rounds').rows;
    s.eq(rounds.map((r) => r.round_id).sort(), facts.rounds.slice().sort(), 'Rounds lists the rounds of whats_changed.json');
    s.ok(rounds.every((r) => r.status === 'draft'), 'every imported round starts as draft', K.show(rounds.map((r) => r.status)));
    const demo = rounds.find((r) => r.round_id === 'DEMO-R1');
    s.eq(demo && demo.notes, 'Fake demo content: never use for real links', 'the DEMO round carries the warning note');
    const wc = h.admin.table(null, 'What changed').rows.filter((r) => r.round_id === 'DEMO-R1');
    s.eq(wc.length, facts.whats_changed.rounds['DEMO-R1'].items.length, '"What changed" has one row per DEMO-R1 bullet');
    H.contractClean(s, h);
  });

  add('A2', 'Set up or repair a second time: nothing duplicated or lost, a deleted tab comes back, secret unchanged', async (s) => {
    const h = H.setupPublished(s);
    const props = new Map(h.admin.props.script);
    const textsBefore = h.admin.table(null, 'Texts').rows.length;
    const metaBefore = H.metaMap(h);
    h.admin.deleteSheet(null, 'Audio clips');
    const textsSheet = h.admin.findSheet(null, 'Texts');
    const extraCol = textsSheet.lastCol() + 1;
    h.admin.writeRange(null, 'Texts', 1, extraCol, [['my notes'], ['keep me']]);
    h.admin.writeRows(null, 'DCs', 2, [['DC-DEMO-001', 'Demo DC One', 'Demo State', 'Demo Region', 'hi', false]]);
    const again = H.runSetup(s, h, 'ppSetup (second run)');
    s.ok(again.last && !/stopped/i.test(again.last.title), 'the second run finishes', H.describeDialog(again.last));
    s.ok(!again.dialogs.some((d) => d.kind === 'prompt'), 'the second run does not offer to import again (the tabs are not empty)',
      again.dialogs.map(H.describeDialog).join(' | '));
    const info = h.admin.sheetInfo(null, 'Audio clips');
    s.ok(info && info.header.map((c) => c.value).join() === C.CONTROL_TABS['Audio clips'].join(), 'the deleted "Audio clips" tab is back with its headers', K.show(info && info.header));
    for (const key of ['LINK_SECRET', 'FOLDER_ID', 'PUBLISHED_FOLDER_ID', 'ROUNDS_FOLDER_ID', 'LIVE_VERSION', 'LIVE_FILE_ID']) {
      s.eq(h.admin.props.script.get(key), props.get(key), `${key} is unchanged`);
    }
    s.eq(h.admin.table(null, 'Texts').rows.length, textsBefore, 'Texts rows are not duplicated');
    s.eq(h.admin.table(null, 'Publish history').rows.length, 1, 'Publish history still has one row');
    s.eq(h.admin.cell(null, 'Texts', 1, extraCol), 'my notes', 'an extra admin column (header) is kept');
    s.eq(h.admin.cell(null, 'Texts', 2, extraCol), 'keep me', 'an extra admin column (value) is kept');
    const dc = h.admin.table(null, 'DCs').rows.find((r) => r.dc_id === 'DC-DEMO-001');
    s.ok(dc && dc.active === false, 'a DC the admin unticked stays unticked', K.show(dc));
    const folders = h.admin.drive.items().filter((x) => x.kind === 'folder' && x.name === 'Valmo Partner Pulse');
    s.eq(folders.length, 1, 'only one "Valmo Partner Pulse" Drive folder exists');
    const metaAfter = H.metaMap(h);
    s.ok(Number(metaAfter.draft_revision) >= Number(metaBefore.draft_revision), 'the draft revision never goes down',
      `${metaBefore.draft_revision} -> ${metaAfter.draft_revision}`);
    H.contractClean(s, h);
  });

  add('A3', 'Before publishing: web app answers "not_published"; set-up where the admin says No to publishing', async (s) => {
    const h = H.harness();
    H.needLoaded(s, h);
    let j = K.webJson(s, K.webGet(h, { action: 'health' }), 'health before set-up');
    s.ok(j && j.ok === true && j.service === 'valmo-partner-pulse' && j.mode === 'live', 'health answers before set-up', K.show(j));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap before set-up');
    s.ok(j && j.ok === false && j.error === 'not_published', 'bootstrap before set-up: { ok: false, error: "not_published" }', K.show(j));
    j = K.webJson(s, K.webPost(h, K.makePing({ dc: 'DC-DEMO-001', round: 'DEMO-R1', t: 'AAAAAAAAAAAAAAAAAAAAAA' })), 'ping before set-up');
    s.ok(j && j.ok === false, 'a ping before set-up is refused with JSON (never a crash)', K.show(j));

    h.control.queueAnswer({ match: (d) => d.kind === 'alert' && d.buttons.indexOf('YES') >= 0, button: 'NO' });
    const setup = H.runSetup(s, h);
    s.note('Set-up said: ' + H.describeDialog(setup.last));
    s.ok(!h.admin.props.script.get('LIVE_VERSION'), 'answering No: nothing is live', K.show(h.admin.props.script.get('LIVE_VERSION')));
    s.eq(h.admin.table(null, 'Publish history').rows.length, 0, 'Publish history stays empty');
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap, nothing published');
    s.ok(j && j.ok === false && j.error === 'not_published', 'bootstrap: { ok: false, error: "not_published" }', K.show(j));
    j = K.webJson(s, K.webGet(h, { action: 'health' }), 'health, nothing published');
    s.ok(j && j.ok === true && !j.live_version, 'health: live_version is empty while nothing is published', K.show(j));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1', draft: '1', pk: H.previewKeyOf(h) }), 'bootstrap draft=1, nothing published');
    s.soft(j && j.ok === true && j.draft === true && j.config_version === 'draft', 'Preview (draft=1) already works before the first publish', K.show(j, 200));
    s.ok(/^[0-9a-f]{32}$/.test(H.previewKeyOf(h)), 'set-up created the private preview key (Script Property PREVIEW_KEY)', K.show(H.previewKeyOf(h)));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1', draft: '1' }), 'bootstrap draft=1 without the preview key');
    s.ok(j && j.ok === false && j.error === 'bad_preview_key', 'draft=1 without the preview key is refused (the draft stays private)', K.show(j, 200));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1', draft: '1', pk: 'wrong' + H.previewKeyOf(h) }), 'bootstrap draft=1 with a wrong key');
    s.ok(j && j.ok === false && j.error === 'bad_preview_key', 'draft=1 with a wrong preview key is refused', K.show(j, 200));
    s.ok(String(h.admin.props.script.get('OWNER_EMAIL') || '').indexOf('@') > 0, 'set-up remembered who owns the Drive folder (OWNER_EMAIL)', K.show(h.admin.props.script.get('OWNER_EMAIL')));
    const L = K.call(h, s, 'panelLoad', []);
    if (L) {
      s.ok(L.live === null, 'panelLoad: live = null when nothing is published', K.show(L.live));
      s.soft(L.draft_differs_from_live === true, 'panelLoad: the draft "differs from live" when nothing is live', K.show(L.draft_differs_from_live));
      const pub = K.call(h, s, 'panelPublish', [L.revision, 'First publish from the panel']);
      s.ok(pub && pub.ok === true && pub.version === 1, 'the first publish from the panel is version 1', K.show(pub));
    }
    H.contractClean(s, h);
  });
};

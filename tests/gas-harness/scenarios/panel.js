/* =============================================================================
   scenarios/panel.js  -  B: the control panel's server functions (PanelServer.gs)

   WHAT THIS FILE IS
     Calls every panel* function the way the control panel does
     (google.script.run, as the admin) and compares the answers with
     docs/control-panel-design.md section 13:
       B1 panelLoad             B2 panelValidate        B3 panelSave
       B4 panelPublish / panelHistory / panelRestore / compile
       B5 panelSetRoundStatus / panelRoundCounts (round data spreadsheets)
       B6 panelGenerateLinks (incl. 1,200 fake DCs)
       B7 panelPreviewUrl / panelGetSecret / panelSetFormUrl
       B8 panelImport / panelExport (round trip with the repo files)
       B9 the menu (onOpen) and panelOpen
       B10 the PP_slug / PP_derivedTextKeys helpers
       B11 co-admins and the Drive folder
     Updated 21 Oct 2026 for the 20 Oct fixes: codes lock only once a real
     round opens (B1, B2), the web app address is the recorded one (B1, B8),
     DC ids stored as numbers are skipped (B6). The fixes themselves have
     their own scenarios in scenarios/fixes.js (G1-G8).

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only B).
   ============================================================================= */
'use strict';

const K = require('../lib/testkit');
const C = require('../lib/contract');
const H = require('../lib/helpers');

const P = (h, s, fn, args, opts) => K.call(h, s, fn, args, Object.assign({ context: 'panel' }, opts || {}));
const idx = (m, id) => (m.screens || []).findIndex((x) => x.id === id);
const langs = (en, hi) => ({ en, hi: hi || en, ta: '', te: '', kn: '', ml: '' });
const newScreen = (f) => Object.assign({ id: '', type: '', text: '', required: true, show_if: null, skip_if: '', options: [],
  low_label: '', high_label: '', scale_hint: '', body: '', active: true }, f);
const ISSUE_SECTIONS = ['settings', 'languages', 'areas', 'chips', 'support', 'screens', 'texts', 'whats_changed', 'clips', 'rounds'];

/* A settings value as comparable text (lists may be arrays or "a, b" text). */
function normSetting(key, v) {
  if (Array.isArray(v)) return v.join(key === 'rating.faces' ? ' ' : ', ');
  if (typeof v === 'string') return v.trim().replace(/\s*,\s*/g, ', ');
  return v;
}

function firstDiff(a, b) {
  const x = String(a).split('\n');
  const y = String(b).split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return `line ${i + 1}: got ${K.show(x[i], 160)} | repo ${K.show(y[i], 160)}`;
  }
  return 'identical';
}

function checkIssues(s, list, label) {
  const bad = (list || []).filter((i) => !i || ISSUE_SECTIONS.indexOf(i.section) < 0 || typeof i.ref !== 'string' || !H.plainEnglish(i.message));
  s.ok(bad.length === 0, `${label}: every issue is { section, ref, message } with a plain-English message`, K.show(bad.slice(0, 3)));
}

const ERROR_CASES = [
  ['a language code used twice', 'languages', (m) => m.languages.push({ code: 'hi', bcp47: 'hi-IN', native_name: 'हिन्दी', active: true })],
  ['a language code that is not 2-3 small letters', 'languages', (m) => { m.languages[2].code = 'TAMIL'; }],
  ['a language without its BCP-47 tag', 'languages', (m) => { m.languages[1].bcp47 = ''; }],
  ['no active language', 'languages', (m) => m.languages.forEach((l) => { l.active = false; })],
  ['an area id with capitals and "!"', 'areas', (m) => { m.areas[0].id = 'Losses!'; }],
  ['an area threshold of 7', 'areas', (m) => { m.areas[1].threshold = 7; }],
  ['no active area while the ratings screen is on', 'areas', (m) => m.areas.forEach((a) => { a.active = false; })],
  ['a chip in an unknown area', 'chips', (m) => m.chips.push({ area: 'nowhere', code: 'x_y', active: true })],
  ['the reserved chip code "other"', 'chips', (m) => m.chips.push({ area: 'losses', code: 'other', active: true })],
  ['a chip code repeated in its area', 'chips', (m) => m.chips.push(Object.assign({}, m.chips[0]))],
  ['an invalid support code', 'support', (m) => { m.support[0].code = 'Bad Code'; }],
  ['the thank-you screen not last', 'screens', (m) => { const t = m.screens.splice(idx(m, 'thanks'), 1)[0]; m.screens.splice(idx(m, 'one_fix'), 0, t); }],
  ['problem screens before the ratings', 'screens', (m) => { const a = idx(m, 'fn_ratings'); const b = idx(m, 'fn_deep_dives'); const t = m.screens[a]; m.screens[a] = m.screens[b]; m.screens[b] = t; }],
  ['a built-in screen used twice', 'screens', (m) => m.screens.splice(idx(m, 'thanks'), 0, Object.assign({}, m.screens[idx(m, 'support')], { id: 'support_again', show_if: null }))],
  ['a choice question without options', 'screens', (m) => m.screens.splice(idx(m, 'thanks'), 0, newScreen({ id: 'q_role', type: 'single_choice', text: 'q.nps' }))],
  ['a question without its text', 'screens', (m) => { m.screens[idx(m, 'nps')].text = ''; }],
  ['skip_if on a screen type that cannot skip', 'screens', (m) => { m.screens[idx(m, 'nps')].skip_if = 'empty'; }],
  ['"required" that is not true/false/blank', 'screens', (m) => { m.screens[idx(m, 'nps')].required = 'yes'; }],
  ['show_if pointing at a later screen', 'screens', (m) => { m.screens[idx(m, 'support_gate')].show_if = { answer: 'one_fix', answered: true }; }],
  ['show_if with two tests at once', 'screens', (m) => { m.screens[idx(m, 'one_fix')].show_if = { answer: 'nps', at_most: 6, equals: 3 }; }],
  ['show_if with an empty "all" list', 'screens', (m) => { m.screens[idx(m, 'one_fix')].show_if = { all: [] }; }],
  ['show_if testing a free-text answer with "equals"', 'screens', (m) => m.screens.splice(idx(m, 'thanks'), 0,
    newScreen({ id: 'q_after', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'one_fix', equals: 'x' } }))],
  ['an empty English text', 'texts', (m) => { m.texts['q.nps'].en = ''; }],
  ['English still marked [TRANSLATE]', 'texts', (m) => { m.texts['ui.next'].en = '[TRANSLATE] Next'; }],
  ['a required text key missing', 'texts', (m) => { delete m.texts['ui.next']; }],
  ['a translation that drops {n}', 'texts', (m) => { m.texts['dev.untranslated'].hi = 'अनुवाद बाकी है'; }],
  ['a colour that is not #RRGGBB', 'settings', (m) => { m.settings['branding.colors.primary'] = 'purple'; }],
  ['form_url without the final "/"', 'settings', (m) => { m.settings.form_url = 'https://example.org/form'; }],
  ['the default language not active', 'settings', (m) => { m.languages.find((l) => l.code === 'ta').active = false; m.settings.default_language = 'ta'; }],
  ['four faces instead of five', 'settings', (m) => { const f = m.settings['rating.faces']; m.settings['rating.faces'] = Array.isArray(f) ? f.slice(0, 4) : String(f).split(/\s+/).slice(0, 4).join(' '); }],
  ['a number out of range (voice.max_seconds = 1000)', 'settings', (m) => { m.settings['voice.max_seconds'] = 1000; }],
  ['the support comment text missing from Texts', 'settings', (m) => { m.settings['support.comment_text'] = 'q.no_such_key'; }],
  ['a what-changed round id with spaces', 'whats_changed', (m) => { m.whats_changed['bad round!'] = [langs('Something changed')]; }],
  ['a what-changed bullet without English', 'whats_changed', (m) => { m.whats_changed['DEMO-R1'][0].en = ''; }],
  ['a questionnaire larger than 200,000 characters', null, (m) => { m.texts['q.nps'].en = 'x'.repeat(210000); }]
];

const WARNING_CASES = [
  ['an area with only 3 active chips', ['chips', 'areas'], null, (m) => { let n = 0; m.chips.forEach((c) => { if (c.area === 'losses' && n < 2) { c.active = false; n += 1; } }); }],
  ['an open DEMO round', ['rounds'], /DEMO/, (m) => { m.rounds.find((r) => r.id === 'DEMO-R1').status = 'open'; }],
  ['[SAMPLE] text in a real round', ['whats_changed'], /SAMPLE/, (m) => { m.whats_changed['2026-R1'] = [langs('[SAMPLE] Something changed')]; }]
];

/* A problem (chip) partners have answered is deleted from the draft: the check must say "rename its label
   instead". Codes lock only once a real round has opened (20 Oct fix), so B2 looks for this warning twice:
   none before a round opens, then exactly this one (section chips, ref losses/wrong_debit) after.
   (Before 21 Oct, B2 accepted any warning containing "rename", so it passed on an unrelated texts warning.) */
const dropLiveChip = (m) => { m.chips = m.chips.filter((c) => !(c.area === 'losses' && c.code === 'wrong_debit')); };
const isLiveChipWarning = (w) => w.section === 'chips' && w.ref === 'losses/wrong_debit' && /is live today/.test(w.message) &&
  /rename its label/.test(w.message);

module.exports = function register(add) {
  add('B1', 'panelLoad: the shape of everything the panel receives (model, catalogue, live version, counts)', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    s.need(L && typeof L === 'object', 'panelLoad returns an object', K.show(L));
    for (const key of ['revision', 'model', 'catalog', 'live', 'live_ids', 'live_ids_unknown', 'codes_locked', 'draft_differs_from_live',
      'user', 'spreadsheet_url', 'folder_url', 'web_app_url', 'web_app_url_recorded', 'dc_count', 'active_dc_count', 'open_section']) {
      s.ok(Object.prototype.hasOwnProperty.call(L, key), `panelLoad().${key} is there`);
    }
    s.ok(Number.isInteger(L.revision) && L.revision >= 0, 'revision is a whole number', K.show(L.revision));
    const m = L.model || {};
    for (const sec of C.MODEL_SECTIONS) s.ok(m[sec] !== undefined && m[sec] !== null, `model.${sec} is there`);
    const facts = C.repoFacts();
    s.eq((m.languages || []).map((l) => l.code), facts.languages, 'model.languages in order');
    s.ok((m.languages || []).every((l) => l.active === true && l.bcp47 && l.native_name), 'languages: all active, with bcp47 and native_name', K.show(m.languages));
    s.eq((m.areas || []).map((a) => a.id), facts.areas, 'model.areas in order');
    s.ok((m.areas || []).every((a) => a.active === true && a.threshold === null), 'areas: active, threshold null (use the standard)', K.show(m.areas));
    s.eq((m.chips || []).filter((c) => c.area === 'payments').map((c) => c.code), facts.chipsByArea.payments, 'chips of one area in order');
    s.eq((m.chips || []).length, facts.chips, 'every chip is in the model');
    s.eq((m.support || []).map((x) => x.code), facts.support, 'model.support');
    s.eq((m.screens || []).map((x) => x.id), facts.flowIds, 'model.screens in order');
    const fields = ['id', 'type', 'text', 'required', 'show_if', 'skip_if', 'options', 'low_label', 'high_label', 'scale_hint', 'body', 'active'];
    s.ok((m.screens || []).every((x) => fields.every((f) => Object.prototype.hasOwnProperty.call(x, f))), 'every screen has the contract\'s fields',
      K.show((m.screens || []).map((x) => fields.filter((f) => !Object.prototype.hasOwnProperty.call(x, f)))));
    const sup = (m.screens || [])[idx(m, 'support')] || {};
    s.eq(sup.show_if, { answer: 'support_gate', equals: 'yes' }, 'show_if is an object in the model');
    const nps = (m.screens || [])[idx(m, 'nps')] || {};
    s.ok(Array.isArray(nps.options) && nps.options.length === 0 && nps.required === true && nps.low_label === 'nps.low',
      'options is a list, required a true/false, labels kept (nps)', K.show(nps));
    s.eq(Object.keys(m.texts || {}).sort(), facts.textKeys.slice().sort(), 'model.texts has every key (minus _help)');
    s.eq((m.whats_changed || {})['DEMO-R1'], facts.whats_changed.rounds['DEMO-R1'].items, 'model.whats_changed DEMO-R1 bullets');
    s.eq((m.rounds || []).map((r) => r.id).sort(), facts.rounds.slice().sort(), 'model.rounds');
    const settings = m.settings || {};
    for (const [key, type, def] of C.SETTINGS) {
      if (!s.ok(Object.prototype.hasOwnProperty.call(settings, key), `model.settings has "${key}"`)) continue;
      const v = settings[key];
      if (type === 'bool') s.ok(typeof v === 'boolean', `setting ${key} is true/false`, K.show(v));
      if (type === 'int' || type === 'number') s.ok(typeof v === 'number', `setting ${key} is a number`, K.show(v));
      s.eq(normSetting(key, v), normSetting(key, def), `setting ${key} has the repo/default value`, 'should');
    }
    const cat = L.catalog || {};
    const schema = cat.settings_schema || [];
    s.eq(schema.map((e) => e.key).sort(), C.SETTINGS.map((r) => r[0]).sort(), 'catalog.settings_schema lists exactly the section 5 settings');
    for (const [key, type, def, min, max, options] of C.SETTINGS) {
      const e = schema.find((x) => x.key === key);
      if (!e) continue;
      s.eq(e.type, type, `schema ${key}: type`);
      s.eq(normSetting(key, e.default), normSetting(key, def), `schema ${key}: default`, 'should');
      if (min !== undefined && min !== null) s.eq([e.min, e.max], [min, max], `schema ${key}: range`, 'should');
      if (options) s.eq(e.options, options, `schema ${key}: choices`);
      s.ok(C.SETTINGS_GROUPS.indexOf(e.group) >= 0, `schema ${key}: group is one of the contract's groups`, K.show(e.group));
      s.ok(H.plainEnglish(e.help), `schema ${key}: help is plain English`, K.show(e.help));
    }
    const types = cat.screen_types || [];
    s.eq(types.map((t) => t.type).sort(), Object.keys(C.SCREEN_TYPES).sort(), 'catalog.screen_types lists the 12 screen types');
    for (const [type, want] of Object.entries(C.SCREEN_TYPES)) {
      const t = types.find((x) => x.type === type);
      if (!t) continue;
      s.eq([t.builtin, t.needs_text], [want.builtin, want.needs_text], `screen type ${type}: built-in / needs text`);
      s.ok(H.plainEnglish(t.label) && H.plainEnglish(t.description), `screen type ${type}: plain label and description`, K.show(t));
      s.soft(want.fields.every((f) => (t.fields || []).indexOf(f) >= 0), `screen type ${type}: editor fields include ${want.fields.join(', ') || '(none)'}`, K.show(t.fields));
    }
    const fixed = C.fixedStringKeys();
    s.eq((cat.form_text_keys || []).slice().sort(), fixed.slice().sort(), 'catalog.form_text_keys = FIXED_STRING_KEYS of check_config.py (incl. the Phase 2 keys)');
    s.ok(C.PHASE2_KEYS.every((k) => (cat.form_text_keys || []).indexOf(k) >= 0), 'form_text_keys includes the six Phase 2 keys');
    const live = L.live || {};
    s.ok(live.version === 1 && /^p1-\d{4}-\d{2}-\d{2}$/.test(live.config_version) && H.isIso(live.published_at) &&
      live.published_by === 'admin@example.com' && typeof live.note === 'string', 'live = { version 1, config_version, published_at, published_by, note }', K.show(L.live));
    // Codes lock only once a real round has been opened (20 Oct fix, decision 1 of 21 Oct): before that no
    // partner can have answered, so live_ids is empty and nothing is locked. Checked again below, after opening.
    s.eq([L.codes_locked, L.live_ids_unknown], [false, false], 'no round opened yet: codes_locked false (nothing locked), live_ids_unknown false');
    s.eq(L.live_ids, { screens: [], areas: [], chips: {}, support: [], options: {} }, 'no round opened yet: live_ids is empty');
    s.ok(L.draft_differs_from_live === false, 'right after publishing, the draft does not differ from live', K.show(L.draft_differs_from_live));
    s.eq(L.user, 'admin@example.com', 'user = the admin using the Sheet');
    s.eq(L.spreadsheet_url, `https://docs.google.com/spreadsheets/d/${h.admin.boundId()}/edit`, 'spreadsheet_url');
    s.eq(L.folder_url, `https://drive.google.com/drive/folders/${h.admin.props.script.get('FOLDER_ID')}`, 'folder_url = "Valmo Partner Pulse" folder');
    // The web app address is the one recorded (and checked) with panelSetWebAppUrl, never Google's own
    // getService().getUrl(), which is often the /dev address or an old deployment (20 Oct fix). Scenario G4 records one.
    s.eq([L.web_app_url, L.web_app_url_recorded], ['', false], 'nothing recorded yet: web_app_url "" and web_app_url_recorded false (Google\'s getUrl() is not used)');
    s.ok(L.dc_count === 0 && L.active_dc_count === 0, 'no DCs yet: dc_count 0, active_dc_count 0', K.show([L.dc_count, L.active_dc_count]));
    s.ok(!L.open_section, 'open_section is empty without a menu hint', K.show(L.open_section));

    h.admin.props.setUser('admin@example.com', 'panel_section', 'publish');
    const L2 = P(h, s, 'panelLoad', []);
    s.eq(L2 && L2.open_section, 'publish', 'open_section returns the menu hint (User Property panel_section)');
    const L3 = P(h, s, 'panelLoad', []);
    s.ok(L3 && !L3.open_section, 'the hint is cleared after reading', K.show(L3 && L3.open_section));
    h.admin.writeRows(null, 'DCs', 2, [['DC-DEMO-001', 'Demo One', 'S', 'R', 'hi', true], ['DC-DEMO-002', 'Demo Two', 'S', 'R', 'ta', true],
      ['DC-DEMO-003', 'Demo Three', 'S', 'R', '', false]]);
    const L4 = P(h, s, 'panelLoad', []);
    s.eq(L4 && [L4.dc_count, L4.active_dc_count], [3, 2], 'dc_count / active_dc_count count the DCs tab (one unticked)');
    // Once the first real round opens, the live version's codes are locked: live_ids lists them.
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    const L5 = P(h, s, 'panelLoad', [], { need: true });
    s.ok(L5.codes_locked === true && L5.live_ids_unknown === false, 'after opening round 2026-R1: codes_locked true, live_ids_unknown false',
      K.show([L5.codes_locked, L5.live_ids_unknown]));
    const ids = L5.live_ids || {};
    s.eq(ids.screens, facts.flowIds, 'live_ids.screens (after a round opened)');
    s.eq(ids.areas, facts.areas, 'live_ids.areas (after a round opened)');
    s.eq(ids.chips, facts.chipsByArea, 'live_ids.chips by area (after a round opened)');
    s.eq(ids.support, facts.support, 'live_ids.support (after a round opened)');
    s.eq(ids.options, {}, 'live_ids.options (no choice questions yet)');
    H.contractClean(s, h);
  });

  add('B2', 'panelValidate: a clean draft has no errors; each kind of mistake is caught; warnings never block', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const base = L.model;
    const v = P(h, s, 'panelValidate', [base], { need: true });
    s.need(v && Array.isArray(v.errors) && Array.isArray(v.warnings) && v.summary, 'panelValidate returns { errors, warnings, summary }', K.show(v));
    s.eq(v.errors, [], 'the questionnaire copied from the repo has no errors');
    checkIssues(s, v.warnings, 'clean draft warnings');
    s.soft(v.warnings.some((w) => w.section === 'texts' && /ta|tamil/i.test(w.ref + ' ' + w.message)), 'a warning counts the Tamil texts still to translate', K.show(v.warnings.slice(0, 5)));
    const sm = v.summary;
    s.ok(sm.screens === 9 && sm.areas === 6 && sm.chips === 30 && sm.support === 4, 'summary counts (9 screens, 6 areas, 30 chips, 4 support items)', K.show(sm));
    const en = (sm.languages || []).find((x) => x.code === 'en');
    const ta = (sm.languages || []).find((x) => x.code === 'ta');
    s.ok(Array.isArray(sm.languages) && sm.languages.length === 6 && en && en.untranslated === 0 && ta && ta.untranslated > 0 && ta.total >= ta.untranslated,
      'summary.languages: { code, total, untranslated } per language', K.show(sm.languages));
    s.ok(typeof sm.compiled_chars === 'number' && sm.compiled_chars > 10000 && sm.compiled_chars < 200000, 'summary.compiled_chars is the size of the published document', K.show(sm.compiled_chars));
    for (const [name, section, mutate] of ERROR_CASES) {
      const m = H.clone(base);
      try { mutate(m); } catch (e) { s.ok(false, `test set-up for "${name}"`, String(e)); continue; }
      const r = P(h, s, 'panelValidate', [m], { what: `panelValidate handles ${name}` });
      if (!r) continue;
      const hit = section ? (r.errors || []).filter((e) => e.section === section) : (r.errors || []);
      s.ok(hit.length > 0, `error caught: ${name}${section ? ' (section ' + section + ')' : ''}`,
        `errors: ${K.show((r.errors || []).map((e) => `${e.section}/${e.ref}: ${e.message}`), 400)}`);
      checkIssues(s, r.errors, name);
    }
    // 26 Oct 2026: the route is checked by the one flow checker (Flow.gs) and each problem is reported once, in the
    // panel's words: a built-in screen shown twice is one error (the route is checked once the rows are fixed), and a
    // missing English text is reported under Texts only (the checker's own text check is left out).
    {
      const twice = H.clone(base);
      twice.screens.splice(idx(twice, 'thanks'), 0, Object.assign({}, twice.screens[idx(twice, 'support')], { id: 'support_again', show_if: null }));
      const r1 = P(h, s, 'panelValidate', [twice]);
      s.eq(r1 && r1.errors.filter((e) => e.section === 'screens').length, 1, 'a built-in screen used twice: exactly one error (no follow-on route errors)');
      const noEnglish = H.clone(base);
      noEnglish.texts['q.nps'].en = '';
      const r2 = P(h, s, 'panelValidate', [noEnglish]);
      s.ok(r2 && r2.errors.some((e) => e.section === 'texts') && !r2.errors.some((e) => e.section === 'screens'),
        'an empty English text: reported under Texts only', K.show(r2 && r2.errors));
    }
    for (const [name, sections, pattern, mutate] of WARNING_CASES) {
      const m = H.clone(base);
      mutate(m);
      const r = P(h, s, 'panelValidate', [m], { what: `panelValidate handles ${name}` });
      if (!r) continue;
      const hit = (r.warnings || []).filter((w) => (!sections || sections.indexOf(w.section) >= 0) && (!pattern || pattern.test(`${w.ref} ${w.message}`)));
      s.ok(hit.length > 0, `warning given: ${name}`, `warnings: ${K.show((r.warnings || []).map((w) => `${w.section}/${w.ref}: ${w.message}`), 500)}`);
      s.eq(r.errors, [], `a warning never blocks: ${name} gives no error`);
    }
    const dropped = H.clone(base);
    dropLiveChip(dropped);
    const early = P(h, s, 'panelValidate', [dropped], { what: 'panelValidate handles a deleted problem before any round opened' });
    s.ok(early && !(early.warnings || []).some((w) => /is live today/.test(w.message)),
      'before any real round has opened, deleting a problem gives no "is live today" warning (nothing is locked yet)',
      K.show(early && early.warnings.filter((w) => /live today/.test(w.message))));
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    const late = P(h, s, 'panelValidate', [dropped], { what: 'panelValidate handles a deleted problem after a round opened' });
    if (late) {
      s.eq((late.warnings || []).filter(isLiveChipWarning).length, 1,
        'warning given once a real round has opened: a live chip code missing from the draft (section chips, losses/wrong_debit: "rename its label instead")');
      s.eq(late.errors, [], 'a warning never blocks: the deleted live chip gives no error');
      checkIssues(s, late.warnings, 'warnings with live codes');
    }
    H.contractClean(s, h);
  });

  add('B3', 'panelSave: revisions, conflicts, translation helpers, exact round trip through the tabs', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const rev = L.revision;
    const same = P(h, s, 'panelSave', [rev, L.model], { need: true });
    s.ok(same && same.ok === true && same.revision === rev + 1, 'saving returns { ok: true, revision: +1 }', K.show(same));
    s.ok(same && same.draft_differs_from_live === false, 'saving the unchanged draft keeps "differs from live" false (the round trip is exact)', K.show(same));
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    for (const sec of C.MODEL_SECTIONS) s.eq(L2.model[sec], L.model[sec], `model.${sec} is unchanged by a save + load round trip`);
    const meta = H.metaMap(h);
    s.ok(Number(meta.draft_revision) === rev + 1 && meta.last_saved_by === 'admin@example.com' && meta.last_saved_at,
      '_meta: draft_revision, last_saved_by, last_saved_at', K.show(meta));
    const stale = P(h, s, 'panelSave', [rev, L.model]);
    s.ok(stale && stale.ok === false && stale.conflict === true && stale.revision === rev + 1 && stale.saved_by === 'admin@example.com' && stale.saved_at,
      'an out-of-date save is refused: { ok: false, conflict: true, revision, saved_by, saved_at }', K.show(stale));

    const m = H.clone(L2.model);
    const npsEn = m.texts['q.nps'].en;
    m.texts['q.nps'].ta = '';
    m.texts['ui.next'].en = 'Next ›';
    m.texts['ui.back'].en = 'Go back';
    m.texts['ui.continue'].kn = '123';
    m.texts['ui.skip'].te = '=SUM(1,2)';
    m.texts['ui.yes'].ml = '2026-10-21';
    m.texts['ui.no'].ta = 'TRUE';
    const r2 = m.rounds.find((r) => r.id === '2026-R1');
    if (r2) { r2.opens_on = '2026-11-01'; r2.closes_on = '2026-11-15'; r2.notes = '007'; }
    m.languages.push({ code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: false });
    m.screens.splice(idx(m, 'thanks'), 0,
      newScreen({ id: 'q_how_easy', type: 'rating_1_5', text: 'q.q_how_easy', required: true,
        show_if: { any: [{ answer: 'nps', at_most: 6 }, { answer: 'fn_rating:payments', at_most: 2 }] } }),
      newScreen({ id: 'q_role', type: 'single_choice', text: 'q.q_role', required: false, options: ['owner', 'captain'] }));
    m.texts['q.q_how_easy'] = langs('How easy is the partner app?', 'पार्टनर ऐप कितना आसान है?');
    m.texts['q.q_role'] = langs('What is your role?', 'आपकी भूमिका क्या है?');
    m.texts['choice.q_role.owner'] = langs('Owner', 'मालिक');
    m.texts['choice.q_role.captain'] = langs('Captain', 'कप्तान');
    const saved = P(h, s, 'panelSave', [L2.revision, m], { need: true });
    s.ok(saved && saved.ok === true && saved.draft_differs_from_live === true, 'saving a change: ok, and the draft now differs from live', K.show(saved));
    const L3 = P(h, s, 'panelLoad', [], { need: true });
    const t = L3.model.texts;
    s.eq(t['q.nps'].ta, '[TRANSLATE] ' + npsEn, 'helper: an emptied translation becomes "[TRANSLATE] " + English');
    s.eq(t['ui.next'].ta, '[TRANSLATE] Next ›', 'helper: a [TRANSLATE] placeholder follows the new English');
    s.eq(t['ui.back'].hi, 'पीछे', 'helper: a real translation is kept when English changes');
    s.ok(/^English changed on .+: please re-check the translations\.$/.test(String(L3.model.text_notes['ui.back'])),
      'helper: a translator note "English changed on <date>: please re-check the translations."', K.show(L3.model.text_notes['ui.back']));
    s.eq(t['ui.continue'].kn, '123', 'a text that looks like a number stays text ("123")');
    s.eq(t['ui.skip'].te, '=SUM(1,2)', 'a text that starts with "=" stays text (no formula)');
    s.eq(t['ui.yes'].ml, '2026-10-21', 'a text that looks like a date stays text');
    s.eq(t['ui.no'].ta, 'TRUE', 'the text "TRUE" stays text');
    const r3 = (L3.model.rounds || []).find((r) => r.id === '2026-R1') || {};
    s.eq([r3.opens_on, r3.closes_on, r3.notes], ['2026-11-01', '2026-11-15', '007'], 'round dates come back as the same text (not Date objects) and "007" keeps its zeros');
    s.eq((L3.model.languages || []).find((l) => l.code === 'mr'), { code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: false }, 'a new (inactive) language is kept');
    const textsHeaders = h.admin.table(null, 'Texts').headers;
    s.ok(textsHeaders.indexOf('mr') >= 0, 'a new language gets its own column in Texts on save', K.show(textsHeaders));
    s.soft(h.admin.table(null, 'What changed').headers.indexOf('mr') >= 0, 'a new language gets its own column in What changed on save', K.show(h.admin.table(null, 'What changed').headers));
    const added = (L3.model.screens || [])[idx(L3.model, 'q_how_easy')];
    s.ok(added && idx(L3.model, 'q_how_easy') === idx(L3.model, 'thanks') - 2, 'a new question is saved in place (before thank-you)', K.show((L3.model.screens || []).map((x) => x.id)));
    s.eq(added && added.show_if, { any: [{ answer: 'nps', at_most: 6 }, { answer: 'fn_rating:payments', at_most: 2 }] }, 'a combined show_if rule survives the Sheet');
    const role = (L3.model.screens || [])[idx(L3.model, 'q_role')];
    s.eq(role && [role.options, role.required], [['owner', 'captain'], false], 'choice options and required=false survive the Sheet');
    s.eq(t['q.q_how_easy'] && t['q.q_how_easy'].ta, '[TRANSLATE] How easy is the partner app?', 'new texts get [TRANSLATE] placeholders');
    const v = P(h, s, 'panelValidate', [L3.model]);
    s.eq(v && v.errors, [], 'the saved draft with the new questions validates without errors');

    const textsSheet = h.admin.findSheet(null, 'Texts');
    const extraCol = textsSheet.lastCol() + 1;
    h.admin.writeRange(null, 'Texts', 1, extraCol, [['my notes'], ['note for row 2']]);
    const L4 = P(h, s, 'panelLoad', []);
    if (L4) {
      const again = P(h, s, 'panelSave', [L4.revision, L4.model]);
      s.ok(again && again.ok, 'saving with an extra admin column works', K.show(again));
      s.soft(h.admin.cell(null, 'Texts', 1, extraCol) === 'my notes', 'an extra admin column (header) is left alone', K.show(h.admin.cell(null, 'Texts', 1, extraCol)));
    }
    const bad = h.exec('panelSave', [999999, { nonsense: true }], { context: 'panel' });
    s.soft(bad.ok ? (bad.value && bad.value.ok === false) : H.plainEnglish(bad.error.message), 'a malformed save is refused in plain English',
      bad.ok ? K.show(bad.value) : bad.error.message);
    H.contractClean(s, h);
  });

  add('B4', 'panelPublish, the published document, panelHistory and panelRestore', async (s) => {
    const h = H.setupPublished(s);
    const facts = C.repoFacts();
    const L = P(h, s, 'panelLoad', [], { need: true });
    const v1Text = L.model.texts['q.nps'].en;
    const m = H.clone(L.model);
    const newText = 'Harness v2: how likely are you to recommend Valmo to another partner?';
    m.texts['q.nps'].en = newText;
    const saved = P(h, s, 'panelSave', [L.revision, m], { need: true });
    s.need(saved && saved.ok, 'save before publishing', K.show(saved));
    const t0 = Date.now();
    const pub = P(h, s, 'panelPublish', [saved.revision, 'Harness test publish'], { need: true });
    s.note(`panelPublish took ${Date.now() - t0} ms`);
    s.ok(pub && pub.ok === true && pub.version === 2 && pub.config_version === `p2-${H.todayIST()}`,
      `publish answers { ok: true, version: 2, config_version: "p2-${H.todayIST()}" } (date in India time)`, K.show(pub));
    const props = h.admin.props.script;
    s.eq(props.get('LIVE_VERSION'), '2', 'LIVE_VERSION = "2"');
    const fileId = props.get('LIVE_FILE_ID');
    s.eq(fileId && h.admin.drive.path(fileId), 'Valmo Partner Pulse/published/p2.json', 'LIVE_FILE_ID = published/p2.json');
    let doc = null;
    try { doc = JSON.parse(h.admin.drive.text(fileId)); } catch (e) { s.ok(false, 'p2.json is valid JSON', String(e)); }
    if (doc) {
      s.ok(doc.format === 1 && doc.version === 2 && doc.config_version === pub.config_version && H.isIso(doc.published_at) &&
        doc.published_by === 'admin@example.com' && doc.note === 'Harness test publish', 'p2.json stamp: format, version, config_version, published_at, published_by, note',
        K.show({ format: doc.format, version: doc.version, config_version: doc.config_version, published_at: doc.published_at, published_by: doc.published_by, note: doc.note }));
      const sv = doc.survey || {};
      s.eq(sv.config_version, doc.config_version, 'survey.config_version = the published config_version');
      s.eq(sv.backend, { request_timeout_seconds: 90, slow_upload_bytes_per_second: 1000, retry_delays_seconds: [2, 5, 10, 20, 40, 60, 60, 120, 120, 300] },
        'survey.backend has only the three sending settings (never mode, mock_url, apps_script_url)');
      s.ok(!('links' in sv), 'survey has no "links" (static-only)');
      const repo = H.withoutNotes(facts.survey);
      for (const key of ['survey_id', 'branding', 'navigation', 'rating', 'deep_dive', 'voice', 'text', 'read_aloud', 'whats_changed',
        'telemetry', 'languages', 'default_language', 'fallback_language', 'functions', 'support']) {
        s.eq(sv[key], repo[key], `published survey.${key} = web/config/survey.json (notes removed)`);
      }
      // Since 23 Oct 2026 (flow-graph stage 4) the route is published as the graph; since 26 Oct 2026 the repo's
      // survey.json holds that same graph (it was PP.flow.fromLegacy of the old list), so partners see the same screens.
      s.eq(sv.flow, facts.graph, 'published survey.flow = the graph in web/config/survey.json (its note left out)');
      const strings = doc.strings || {};
      s.ok(!Object.keys(strings).some((k) => k.startsWith('_')), 'strings has no "_" note keys');
      s.eq(strings['q.nps'] && strings['q.nps'].en, newText, 'the edited English text is published');
      const repoStrings = H.withoutNotes(facts.strings);
      delete repoStrings['q.nps'];
      const pubStrings = Object.assign({}, strings);
      delete pubStrings['q.nps'];
      s.eq(pubStrings, repoStrings, 'every other text is published exactly as in strings.json');
      s.eq(doc.whats_changed && doc.whats_changed['DEMO-R1'], { title: null, items: facts.whats_changed.rounds['DEMO-R1'].items }, 'whats_changed: { title: null, items } per round');
      s.eq(doc.clips, {}, 'clips (none)');
      const cached = h.admin.cache.get('live:2:k');
      s.ok(cached && Number(cached) >= 1, 'the live version is cached in chunks (live:2:k)', K.show(cached));
      if (cached) {
        let text = '';
        for (let i = 0; i < Number(cached); i += 1) text += h.admin.cache.get(`live:2:${i}`) || '';
        s.ok(text === h.admin.drive.text(fileId), 'the cached chunks join up to exactly p2.json', `${text.length} vs ${h.admin.drive.text(fileId).length} characters`);
        s.ok(h.admin.cache.entries().filter((e) => /^live:2:\d+$/.test(e.key)).every((e) => e.value.length <= 90000), 'each chunk is at most 90,000 characters');
        const k = h.admin.cache.entries().find((e) => e.key === 'live:2:k');
        s.soft(k && k.secondsLeft > 21000, 'the live version is cached for 6 hours', K.show(k && k.secondsLeft));
      }
    }
    const hist = h.admin.table(null, 'Publish history').rows;
    s.eq(hist.map((r) => [Number(r.version), r.live]), [[1, false], [2, true]], 'Publish history: v1 not live, v2 live (exactly one live)');
    const history = P(h, s, 'panelHistory', []);
    s.ok(Array.isArray(history) && history.length === 2 && history[0].version === 2 && history[0].live === true && history[1].live === false,
      'panelHistory is newest first with the live flag', K.show(history));
    if (history && history[0]) {
      const e = history[0];
      s.ok(e.config_version === pub.config_version && H.isIso(e.published_at) && e.published_by === 'admin@example.com' &&
        e.note === 'Harness test publish' && String(e.file).indexOf(fileId) >= 0, 'history entry fields', K.show(e));
    }
    const L2 = P(h, s, 'panelLoad', []);
    s.ok(L2 && L2.live && L2.live.version === 2 && L2.draft_differs_from_live === false, 'panelLoad: live = v2, draft equals live', K.show(L2 && L2.live));

    const c1 = h.exec('PP_compile', [L2.model, null], { context: 'panel' });
    const c2 = h.exec('PP_compile', [L2.model, null], { context: 'panel' });
    s.ok(c1.ok && c2.ok && JSON.stringify(c1.value) === JSON.stringify(c2.value), 'PP_compile is deterministic', c1.ok ? '' : c1.error.message);
    if (c1.ok) {
      s.ok(c1.value.config_version === 'draft' && c1.value.version === null, 'a draft compile has config_version "draft" and version null',
        K.show({ config_version: c1.value.config_version, version: c1.value.version }));
      const mm = H.clone(L2.model);
      mm.chips.find((c) => c.area === 'losses' && c.code === 'wrong_debit').active = false;
      mm.screens[idx(mm, 'one_fix')].active = false;
      mm.languages.find((l) => l.code === 'ml').active = false;
      mm.texts['ui.next'].ta = '';
      const c3 = h.exec('PP_compile', [mm, null], { context: 'panel' });
      if (s.ok(c3.ok, 'compile of a draft with switched-off items', c3.ok ? '' : c3.error.message)) {
        const d = c3.value;
        const losses = (d.survey.functions || []).find((f) => f.id === 'losses');
        s.ok(losses && losses.issues.indexOf('wrong_debit') < 0, 'an inactive chip is left out', K.show(losses));
        s.ok(!C.flowIdsOf(d.survey.flow).some((id) => id === 'one_fix'), 'an inactive screen is left out');
        s.ok(!(d.survey.languages || []).some((l) => l.code === 'ml') && !Object.values(d.strings).some((v) => 'ml' in v), 'an inactive language is left out (also from strings)');
        s.eq(d.strings['ui.next'] && d.strings['ui.next'].ta, '[TRANSLATE] Next', 'a missing translation is published as "[TRANSLATE] " + English');
      }
    }

    const broken = H.clone(L2.model);
    broken.texts['q.nps'].en = '';
    const sb = P(h, s, 'panelSave', [L2.revision, broken]);
    if (sb && sb.ok) {
      const refused = P(h, s, 'panelPublish', [sb.revision, 'should be refused']);
      s.ok(refused && refused.ok === false && Array.isArray(refused.errors) && refused.errors.length > 0, 'publishing a draft with errors is refused: { ok: false, errors }', K.show(refused));
      s.eq(props.get('LIVE_VERSION'), '2', 'a refused publish changes nothing live');
      const stale = P(h, s, 'panelPublish', [L2.revision, 'stale']);
      s.ok(stale && stale.ok === false && stale.conflict === true, 'publishing from an out-of-date revision is a conflict', K.show(stale));
    }
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']);
    P(h, s, 'panelSetFormUrl', ['https://example.org/pulse/']);
    const before = P(h, s, 'panelLoad', []);
    const restored = P(h, s, 'panelRestore', [1], { need: true });
    s.ok(restored && restored.ok === true && Number.isInteger(restored.revision) && restored.revision > (before ? before.revision : 0),
      'panelRestore(1) answers { ok: true, revision } with a new revision', K.show(restored));
    const L3 = P(h, s, 'panelLoad', [], { need: true });
    s.eq(L3.model.texts['q.nps'].en, v1Text, 'restore brings version 1\'s texts back as the draft');
    s.eq(props.get('LIVE_VERSION'), '2', 'restore does not publish (v2 stays live)');
    s.ok(L3.draft_differs_from_live === true, 'after restore the draft differs from live', K.show(L3.draft_differs_from_live));
    s.eq(L3.model.settings.form_url, 'https://example.org/pulse/', 'restore keeps the current form address');
    const r1 = (L3.model.rounds || []).find((r) => r.id === '2026-R1');
    s.ok(r1 && r1.status === 'open' && r1.data_sheet, 'restore keeps the rounds (2026-R1 stays open with its data sheet)', K.show(r1));
    const missing = h.exec('panelRestore', [99], { context: 'panel' });
    s.ok(!missing.ok ? H.plainEnglish(missing.error.message) : (missing.value && missing.value.ok === false),
      'restoring a version that does not exist is refused in plain English', missing.ok ? K.show(missing.value) : missing.error.message);
    const v3 = P(h, s, 'panelPublish', [L3.revision, 'Publish the restored version']);
    s.ok(v3 && v3.ok && v3.version === 3, 'publishing the restored draft makes version 3', K.show(v3));
    const hist3 = h.admin.table(null, 'Publish history').rows;
    s.eq(hist3.filter((r) => r.live === true).map((r) => Number(r.version)), [3], 'exactly one live row (v3)');
    H.contractClean(s, h);
  });

  add('B5', 'Rounds: open / close / re-open, the round\'s data spreadsheet and audio folder, counts', async (s) => {
    const h = H.setupPublished(s);
    const before = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1' }), 'bootstrap before opening');
    s.ok(before && before.round && before.round.status === 'draft', 'a saved but unopened round is "draft"', K.show(before && before.round));
    const opened = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    s.ok(opened && opened.ok === true && opened.round && opened.round.status === 'open', 'panelSetRoundStatus answers { ok: true, round } with status open', K.show(opened));
    const info = H.roundInfo(h, '2026-R1');
    s.ok(info && info.status === 'open' && info.sheet_id && info.audio_folder_id, 'Script Property ROUND:2026-R1 = { status, sheet_id, audio_folder_id }', K.show(info));
    const bookId = info && info.sheet_id;
    const book = bookId ? h.admin.findBook(bookId) : null;
    s.need(book, 'the round\'s data spreadsheet exists', K.show(info));
    s.eq(book.name, 'Valmo Partner Pulse - data - 2026-R1', 'data spreadsheet name');
    s.eq(h.admin.drive.path(book.id), 'Valmo Partner Pulse/rounds/2026-R1/Valmo Partner Pulse - data - 2026-R1', 'the data spreadsheet is inside rounds/2026-R1/');
    s.eq(h.admin.drive.path(info.audio_folder_id), 'Valmo Partner Pulse/rounds/2026-R1/audio', 'audio folder rounds/2026-R1/audio/');
    for (const [tab, headers] of Object.entries(C.DATA_TABS)) {
      const t = h.admin.sheetInfo(book.id, tab);
      if (!s.ok(t, `data tab "${tab}" exists`, book.sheets.map((x) => x.name).join(', '))) continue;
      s.eq(t.header.map((c) => String(c.value)), headers, `data tab "${tab}" headers (contract section 11)`);
      s.ok(t.frozenRows === 1, `data tab "${tab}" row 1 is frozen`);
    }
    s.soft(book.sheets.length === 5, 'the data spreadsheet has only the five data tabs', book.sheets.map((x) => x.name).join(', '));
    const row = h.admin.table(null, 'Rounds').rows.find((r) => r.round_id === '2026-R1');
    s.ok(row && row.status === 'open' && String(row.data_sheet).indexOf(book.id) >= 0 && String(row.audio_folder).indexOf(info.audio_folder_id) >= 0,
      'the Rounds tab shows open, with the data sheet and audio folder addresses', K.show(row));
    const now = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1' }), 'bootstrap after opening');
    s.ok(now && now.round && now.round.status === 'open', 'opening takes effect at once (no 60 s wait for the cache)', K.show(now && now.round));
    const closed = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'closed']);
    s.ok(closed && closed.ok && H.roundInfo(h, '2026-R1').status === 'closed' && H.roundInfo(h, '2026-R1').sheet_id === bookId,
      'closing keeps the same data spreadsheet', K.show(H.roundInfo(h, '2026-R1')));
    const afterClose = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1' }), 'bootstrap after closing');
    s.ok(afterClose && afterClose.round && afterClose.round.status === 'closed', 'closing takes effect at once', K.show(afterClose && afterClose.round));
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']);
    s.eq(h.admin.books().filter((b) => b.name === 'Valmo Partner Pulse - data - 2026-R1').length, 1, 're-opening does not create a second data spreadsheet');
    for (const [args, what] of [[['NOPE-R9', 'open'], 'an unknown round'], [['2026-R1', 'paused'], 'an unknown status']]) {
      const r = h.exec('panelSetRoundStatus', args, { context: 'panel' });
      s.ok(!r.ok && H.plainEnglish(r.error.message), `${what} is refused with a plain-English error`, r.ok ? K.show(r.value) : r.error.message);
    }
    const demo = h.exec('panelSetRoundStatus', ['DEMO-R1', 'open'], { context: 'panel' });
    s.ok(!demo.ok || (demo.value && demo.value.ok === false), 'opening a DEMO round without confirmDemo is refused', demo.ok ? K.show(demo.value) : demo.error.message);
    s.ok(!(H.roundInfo(h, 'DEMO-R1') || {}).sheet_id, 'the refused DEMO round got no data spreadsheet');
    const demoOk = P(h, s, 'panelSetRoundStatus', ['DEMO-R1', 'open', true]);
    s.ok(demoOk && demoOk.ok, 'opening a DEMO round with confirmDemo = true works', K.show(demoOk));
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.rounds.push({ id: '2026-R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'Next round' });
    const r1 = m.rounds.find((r) => r.id === '2026-R1');
    r1.status = 'closed';
    const sv = P(h, s, 'panelSave', [L.revision, m]);
    s.ok(sv && sv.ok, 'a new round can be added and saved', K.show(sv));
    s.ok(h.admin.table(null, 'Rounds').rows.some((r) => r.round_id === '2026-R2'), 'the new round is in the Rounds tab');
    s.soft(H.roundInfo(h, '2026-R1').status === 'open', 'editing the status in the draft does not close a round (only Open/Close does)', K.show(H.roundInfo(h, '2026-R1')));
    const b2 = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R2' }), 'bootstrap for a new draft round');
    s.soft(b2 && b2.round && b2.round.status === 'draft', 'a newly saved round reports "draft" (links say "not open yet")', K.show(b2 && b2.round));
    const counts = P(h, s, 'panelRoundCounts', ['2026-R2']);
    s.ok(counts && counts.links === 0 && counts.opened === 0 && counts.started === 0 && counts.submitted === 0 && counts.by_lang && typeof counts.by_lang === 'object',
      'panelRoundCounts for a round without data: { links: 0, opened: 0, started: 0, submitted: 0, by_lang }', K.show(counts));
    const c1 = P(h, s, 'panelRoundCounts', ['2026-R1']);
    s.ok(c1 && c1.submitted === 0 && Object.prototype.hasOwnProperty.call(c1, 'last_submission_at'), 'panelRoundCounts for an open round without answers', K.show(c1));
    H.contractClean(s, h);
  });

  add('B6', 'panelGenerateLinks: tokens, languages, skipped DCs (bad id, id stored as a number), CSV, upsert, and 1,200 DCs', async (s) => {
    const h = H.setupPublished(s);
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    // Set-up formats the dc_id column as plain text (@), so an id typed there stays text (00777 keeps its zeros).
    // An id Google Sheets already holds as a NUMBER (12345, for example pasted before the 20 Oct fix) is not
    // the DC's real id any more (0123 would have become 123), so it is skipped with "type it as text" (20 Oct fix).
    h.admin.writeRows(null, 'DCs', 2, [
      ['DC-DEMO-001', 'Demo DC One', 'Karnataka', 'South', 'hi', true],
      ['DC-DEMO-002', 'Demo DC, Two', 'Tamil Nadu', 'South', 'ta', true],
      ['DC-DEMO-003', 'Demo DC Three', 'Delhi', 'North', '', true],
      ['DC-DEMO-004', 'Demo DC Four', 'Kerala', 'South', 'xx', true],
      ['DC-DEMO-005', 'Demo DC Five', 'Goa', 'West', 'en', false],
      ['bad id!', 'Broken id', 'Nowhere', 'None', 'en', true],
      [12345, 'Numeric DC', 'Bihar', 'East', 'hi', true],
      ['00777', 'Typed as text', 'Odisha', 'East', 'hi', true]
    ]);
    s.eq(h.admin.cell(null, 'DCs', 9, 1), '00777', 'an id typed into the plain-text dc_id column stays text (00777 keeps its zeros)');
    const secret = H.secretOf(h);
    const t0 = Date.now();
    const r = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }], { need: true });
    s.note(`panelGenerateLinks for 8 DCs took ${Date.now() - t0} ms`);
    s.ok(r && r.ok === true && r.created === 5 && r.updated === 0, 'creates 5 links (inactive DC left out; invalid id and number id skipped)', K.show(r && { created: r.created, updated: r.updated, skipped: r.skipped }));
    const skipped = (r.skipped || []).find((x) => x.dc_id === 'bad id!');
    s.ok(skipped && H.plainEnglish(skipped.reason), 'the invalid DC id is listed in skipped with a plain-English reason', K.show(r.skipped));
    const number = (r.skipped || []).find((x) => x.dc_id === '12345');
    s.ok(number && /Type the id as text/.test(number.reason) && /apostrophe/.test(number.reason) && H.plainEnglish(number.reason),
      'an id Sheets holds as a number is skipped: "Type the id as text" (with an apostrophe), in plain English', K.show(r.skipped));
    s.eq((r.skipped || []).length, 2, 'exactly two DCs are skipped (the invalid id and the number id)');
    const form = C.FORM_URL;
    const want = {
      'DC-DEMO-001': `${form}?dc=DC-DEMO-001&t=${K.token(secret, 'DC-DEMO-001', '2026-R1')}&round=2026-R1&lang=hi`,
      'DC-DEMO-002': `${form}?dc=DC-DEMO-002&t=${K.token(secret, 'DC-DEMO-002', '2026-R1')}&round=2026-R1&lang=ta`,
      'DC-DEMO-003': `${form}?dc=DC-DEMO-003&t=${K.token(secret, 'DC-DEMO-003', '2026-R1')}&round=2026-R1`,
      'DC-DEMO-004': `${form}?dc=DC-DEMO-004&t=${K.token(secret, 'DC-DEMO-004', '2026-R1')}&round=2026-R1`,
      '00777': `${form}?dc=00777&t=${K.token(secret, '00777', '2026-R1')}&round=2026-R1&lang=hi`
    };
    const links = h.admin.table(null, 'Links').rows.filter((x) => x.round_id === '2026-R1');
    s.eq(links.length, 5, 'the Links tab has one row per DC for the round');
    s.ok(!links.some((x) => String(x.dc_id) === '12345'), 'the number id got no link', K.show(links.map((x) => x.dc_id)));
    for (const [dc, link] of Object.entries(want)) {
      const row = links.find((x) => String(x.dc_id) === String(dc));
      s.eq(row && row.link, link, `link for ${dc}: form address + ?dc=..&t=<token>&round=..(&lang=..)`);
    }
    const one = links.find((x) => x.dc_id === 'DC-DEMO-001') || {};
    s.ok(one.dc_name === 'Demo DC One' && one.state === 'Karnataka' && one.region === 'South' && one.language === 'hi' &&
      (H.isIso(one.generated_at) || one.generated_at instanceof Date) && one.generated_by === 'admin@example.com', 'Links row fields (name, state, region, language, generated_at, generated_by)', K.show(one));
    const csv = H.parseCsv(r.csv || '');
    s.eq(csv[0], ['dc_id', 'dc_name', 'state', 'region', 'language', 'link'], 'CSV header: dc_id, dc_name, state, region, language, link');
    s.ok(csv.length >= 6 && csv.slice(1).filter((x) => x.length > 1).every((x) => x.length === 6), 'CSV rows have 6 columns (a name with a comma is quoted)', K.show(csv.slice(0, 4)));
    s.ok(String(r.csv || '').indexOf(secret) < 0 && JSON.stringify(h.admin.table(null, 'Links')).indexOf(secret) < 0, 'the secret itself appears nowhere in links or CSV');
    const again = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }]);
    s.ok(again && again.created === 0 && again.updated === 0, 'running again with only_missing creates nothing', K.show(again && { created: again.created, updated: again.updated }));
    const all = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: false }]);
    s.ok(all && all.created === 0 && all.updated === 5, 'regenerate all: 5 updated, 0 created', K.show(all && { created: all.created, updated: all.updated }));
    s.eq(h.admin.table(null, 'Links').rows.filter((x) => x.round_id === '2026-R1').length, 5, 'regenerating does not duplicate rows (upsert by round + DC)');
    h.admin.appendRows(null, 'DCs', [['DC-DEMO-006', 'Demo DC Six', 'Assam', 'East', 'en', true]]);
    const six = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }]);
    s.ok(six && six.created === 1, 'a new DC gets its link (created 1)', K.show(six && { created: six.created, skipped: six.skipped }));
    const unknown = h.exec('panelGenerateLinks', ['NOPE-R9', { only_missing: true }], { context: 'panel' });
    s.ok(!unknown.ok ? H.plainEnglish(unknown.error.message) : (unknown.value && unknown.value.ok === false), 'links for an unknown round are refused', unknown.ok ? K.show(unknown.value) : unknown.error.message);

    const big = [];
    for (let i = 1; i <= 1200; i += 1) big.push([`DC-BULK-${String(i).padStart(4, '0')}`, `Bulk DC ${i}`, 'Demo State', 'Demo Region', ['hi', 'en', 'ta'][i % 3], true]);
    h.admin.appendRows(null, 'DCs', big);
    const tb = Date.now();
    const bulk = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }]);
    const ms = Date.now() - tb;
    s.note(`panelGenerateLinks for 1,200 more DCs took ${ms} ms in the harness`);
    s.ok(bulk && bulk.created === 1200, '1,200 fake DCs get links (the Links tab grows beyond its first 1,000 rows)', K.show(bulk && { created: bulk.created, skipped: (bulk.skipped || []).length }));
    s.eq(h.admin.table(null, 'Links').rows.filter((x) => x.round_id === '2026-R1').length, 1206, 'the Links tab now has 1,206 rows for 2026-R1');
    s.soft(ms < 20000, 'generating 1,200 links stays fast (under 20 s here)', `${ms} ms`);
    H.contractClean(s, h);
  });

  add('B7', 'panelPreviewUrl, panelGetSecret, panelSetFormUrl', async (s) => {
    const h = H.setupPublished(s);
    const pv = P(h, s, 'panelPreviewUrl', ['2026-R1']);
    s.eq(pv, { url: `${C.FORM_URL}?preview=1&dc=DC-PREVIEW&round=2026-R1&lang=en&pk=${H.previewKeyOf(h)}` }, 'preview link = form_url + ?preview=1&dc=DC-PREVIEW&round=..&lang=<default language>&pk=<private preview key>');
    const sec = P(h, s, 'panelGetSecret', ['SHOW']);
    s.ok(sec && sec.secret === H.secretOf(h), 'panelGetSecret("SHOW") returns the link secret', K.show(sec && Object.keys(sec)));
    for (const bad of ['show', 'yes', '']) {
      const r = h.exec('panelGetSecret', [bad], { context: 'panel' });
      s.ok(!r.ok || !r.value || !r.value.secret, `panelGetSecret(${JSON.stringify(bad)}) does not reveal the secret`, r.ok ? K.show(r.value) : r.error.message);
    }
    const set = P(h, s, 'panelSetFormUrl', ['https://example.org/pulse/']);
    s.ok(set !== undefined, 'panelSetFormUrl saves a new form address', K.show(set));
    const L = P(h, s, 'panelLoad', []);
    s.eq(L && L.model.settings.form_url, 'https://example.org/pulse/', 'the new form address is in the draft settings');
    const pv2 = P(h, s, 'panelPreviewUrl', ['2026-R1']);
    s.eq(pv2 && pv2.url, `https://example.org/pulse/?preview=1&dc=DC-PREVIEW&round=2026-R1&lang=en&pk=${H.previewKeyOf(h)}`, 'the preview link uses the new address');
    const bad = h.exec('panelSetFormUrl', ['http://insecure.example/form'], { context: 'panel' });
    s.soft(!bad.ok ? H.plainEnglish(bad.error.message) : (bad.value && bad.value.ok === false), 'a non-https form address is refused', bad.ok ? K.show(bad.value) : bad.error.message);
    H.contractClean(s, h);
  });

  add('B8', 'panelImport and panelExport: import from GitHub keeps rounds; export matches the repo files', async (s) => {
    const h = H.setupPublished(s);
    const facts = C.repoFacts();
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.texts['q.nps'].en = 'A local edit that the import replaces';
    const sv = P(h, s, 'panelSave', [L.revision, m]);
    const imp = P(h, s, 'panelImport', [C.DEFAULT_IMPORT_URL], { need: true });
    s.ok(imp && imp.ok === true && Number.isInteger(imp.revision) && imp.revision > (sv ? sv.revision : L.revision),
      'panelImport answers { ok: true, revision } with a new revision', K.show(imp));
    s.eq(imp && imp.counts, { texts: facts.textKeys.length, screens: facts.flowIds.length, areas: facts.areas.length, chips: facts.chips }, 'import counts');
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    s.eq(L2.model.texts['q.nps'].en, facts.strings['q.nps'].en, 'the import replaced the draft texts');
    const r1 = L2.model.rounds.find((r) => r.id === '2026-R1');
    s.ok(r1 && r1.status === 'open' && r1.data_sheet, 'rounds that already exist keep their status and data links', K.show(r1));
    const missing = h.exec('panelImport', ['https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/nowhere/'], { context: 'panel' });
    s.ok(!missing.ok && H.plainEnglish(missing.error.message), 'importing from an address without the files fails in plain English', missing.ok ? K.show(missing.value) : missing.error.message);
    h.control.routeUrl('https://example.org/broken/', { code: 200, body: '{ "this is": broken' }, true);
    const broken = h.exec('panelImport', ['https://example.org/broken/'], { context: 'panel' });
    s.ok(!broken.ok && H.plainEnglish(broken.error.message), 'a damaged file is refused in plain English', broken.ok ? K.show(broken.value) : broken.error.message);
    const L3 = P(h, s, 'panelLoad', []);
    s.ok(L3 && L3.revision === L2.revision, 'a failed import changes nothing', K.show(L3 && [L3.revision, L2.revision]));
    const insecure = h.exec('panelImport', ['http://example.org/web/'], { context: 'panel' });
    s.ok(!insecure.ok, 'an http:// (not https) import address is refused', insecure.ok ? K.show(insecure.value) : insecure.error.message);

    const ex = P(h, s, 'panelExport', [], { need: true });
    const files = (ex && ex.files) || {};
    // CHANGED EXPECTATION (26 Oct 2026, review finding 10): the copy also brings docs/flow.md ("flow.md"), the map of the route.
    s.eq(Object.keys(files).sort(), ['audio_clips.json', 'flow.md', 'strings.json', 'survey.json', 'whats_changed.json'],
      'panelExport returns the four repo files and docs/flow.md');
    const apartFromVersion = (t) => String(t).replace(/config_version `[^`]*`/, 'config_version `…`');
    s.soft(apartFromVersion(files['flow.md']) === apartFromVersion(C.flowMap()),
      'flow.md is byte-for-byte what "node scripts/flow.js map" makes of the repo files (apart from config_version, like survey.json)',
      firstDiff(apartFromVersion(files['flow.md']), apartFromVersion(C.flowMap())));
    let survey = null;
    try { survey = JSON.parse(files['survey.json']); } catch (e) { s.ok(false, 'exported survey.json is valid JSON', String(e)); }
    if (survey) {
      // No web app address is recorded yet (scenario G4 records one). Since 21 Oct the copy then stays in test
      // mode ("mock"), like the repo's own copy, so GitHub's settings check passes, and the panel shows a warning.
      s.eq(survey.backend, { mode: 'mock', mock_url: '/api', apps_script_url: '', request_timeout_seconds: 90,
        slow_upload_bytes_per_second: 1000, retry_delays_seconds: [2, 5, 10, 20, 40, 60, 60, 120, 120, 300], _help: survey.backend._help },
      'exported backend without a recorded web app address = { mode: mock (test mode), mock_url: /api, apps_script_url: "", the three sending settings }');
      s.ok(H.plainEnglish(ex.warning) && /web app address/i.test(ex.warning) && /test mode/.test(ex.warning),
        'and panelExport answers a plain-English warning: no web app address, so the form stays in test mode', K.show(ex.warning));
      // Since 23 Oct 2026 (flow-graph stage 4) the copy writes the route as the graph, and since 26 Oct 2026 the
      // repo's own survey.json holds it ("python3 scripts/flow.py migrate --write"): facts.migrated is the repo file.
      const sameApartFromVersion = (t) => String(t).replace(/"config_version": "[^"]*"/, '"config_version": "…"');
      s.soft(sameApartFromVersion(files['survey.json']) === sameApartFromVersion(facts.migrated.raw),
        'without a web app address, the exported survey.json is byte-for-byte the repo\'s own copy, its graph included (apart from config_version)',
        firstDiff(sameApartFromVersion(files['survey.json']), sameApartFromVersion(facts.migrated.raw)));
      s.eq(survey.links && survey.links.mock_defaults, facts.survey.links.mock_defaults, 'exported links = the Phase 1 mock_defaults');
      const strip = (x) => { const c = H.withoutNotes(x); delete c.backend; delete c.config_version; return c; };
      s.eq(strip(survey), strip(facts.migrated.survey), 'exported survey.json has the same content as the repo, flow as the graph (apart from backend and config_version)');
      const helpKeys = (o, at) => Object.entries(o).flatMap(([k, v]) => (k.startsWith('_') ? [at + k] : (v && typeof v === 'object' && !Array.isArray(v) ? helpKeys(v, at + k + '.') : [])));
      s.soft(K.deepEqual(helpKeys(survey, '').sort(), helpKeys(facts.migrated.survey, '').sort()), 'exported survey.json keeps the same _help notes (the route\'s own note in flow._help)',
        K.show({ export: helpKeys(survey, ''), repo: helpKeys(facts.migrated.survey, '') }));
    }
    for (const name of ['strings.json', 'whats_changed.json', 'audio_clips.json']) {
      let parsed = null;
      try { parsed = JSON.parse(files[name]); } catch (e) { s.ok(false, `exported ${name} is valid JSON`, String(e)); continue; }
      const repo = name === 'strings.json' ? facts.strings : name === 'audio_clips.json' ? facts.audio_clips : facts.whats_changed;
      if (name === 'whats_changed.json') {
        s.eq(parsed.rounds && parsed.rounds['DEMO-R1'], repo.rounds['DEMO-R1'], 'exported whats_changed.json: DEMO-R1 as in the repo');
        s.soft(K.deepEqual(H.withoutNotes(parsed), H.withoutNotes(repo)), 'exported whats_changed.json has the same rounds as the repo', K.show(Object.keys(parsed.rounds || {})));
      } else {
        s.eq(H.withoutNotes(parsed), H.withoutNotes(repo), `exported ${name} has the same content as the repo`);
      }
      s.soft(files[name] === facts.raw[name], `exported ${name} is byte-for-byte the repo file (same layout)`, firstDiff(files[name], facts.raw[name]));
    }
    if (survey) {
      const parsedFiles = {};
      try {
        parsedFiles.survey = JSON.parse(files['survey.json']);
        parsedFiles.strings = JSON.parse(files['strings.json']);
        parsedFiles.whats_changed = JSON.parse(files['whats_changed.json']);
        parsedFiles.audio_clips = JSON.parse(files['audio_clips.json']);
      } catch (e) { /* reported above */ }
      const back = h.exec('PP_importStatic', [parsedFiles], { context: 'panel' });
      if (s.ok(back.ok, 'PP_importStatic reads the exported files', back.ok ? '' : back.error.message)) {
        const a = h.exec('PP_compile', [JSON.parse(JSON.stringify(back.value)), null], { context: 'panel' });
        const b = h.exec('PP_compile', [L2.model, null], { context: 'panel' });
        s.ok(a.ok && b.ok && JSON.stringify(a.value) === JSON.stringify(b.value), 'export then import gives the same questionnaire (compiled documents are identical)',
          a.ok && b.ok ? 'documents differ' : (a.ok ? b.error.message : a.error.message));
      }
    }
    // Record the web app address (checked by asking it ?action=health, here answered by this web app itself).
    const webApp = 'https://script.google.com/macros/s/AKfycbHARNESSexport_0001/exec';
    h.control.routeUrl(webApp + '?action=health', { code: 200, body: K.webGet(h, { action: 'health' }).text });
    const recorded = P(h, s, 'panelSetWebAppUrl', [webApp]);
    s.ok(recorded && recorded.ok === true && recorded.web_app_url === webApp, 'panelSetWebAppUrl records the checked address', K.show(recorded));
    const ex2 = P(h, s, 'panelExport', []);
    let s2 = null;
    try { s2 = JSON.parse(ex2.files['survey.json']); } catch (e) { /* reported below */ }
    s.ok(s2 && s2.backend && s2.backend.mode === 'apps_script' && s2.backend.apps_script_url === webApp && s2.backend.mock_url === '/api',
      'with the address recorded, the exported backend = { mode: apps_script, apps_script_url = the recorded web app address }', K.show(s2 && s2.backend, 200));
    s.ok(ex2 && !ex2.warning, 'and there is no warning', K.show(ex2 && ex2.warning));
    h.control.setScriptUrl('https://script.google.com/macros/s/AKfycbSOMETHINGelse000/dev');
    const ex3 = P(h, s, 'panelExport', []);
    s.eq(JSON.parse(ex3.files['survey.json']).backend.apps_script_url, webApp, 'Google\'s own getUrl() (here a /dev address) is never used');
    H.contractClean(s, h);
  });

  add('B9', 'The Partner Pulse menu (onOpen), panelOpen, and what each menu item does', async (s) => {
    const h = H.setupPublished(s);
    const r = h.exec('onOpen', [], { context: 'simpleTrigger' });
    s.need(r.ok, 'onOpen runs as a simple trigger', r.ok ? '' : r.error.message);
    const menu = h.admin.ui.menus.get('Partner Pulse');
    s.need(menu, 'a "Partner Pulse" menu is added', K.show(Array.from(h.admin.ui.menus.keys())));
    const labels = menu.items.map((i) => (i.separator ? '---' : i.label.replace(/\.\.\.$/, '…')));
    s.eq(labels, ['Open control panel', 'Preview the draft form', 'Publish…', 'Generate links…', '---', 'Share the Drive folder with all editors', 'Set up or repair', 'Help'], 'menu items in the contract\'s order');
    for (const item of menu.items.filter((i) => !i.separator)) {
      s.ok(typeof h.sandbox[item.fn] === 'function' && !/_$/.test(item.fn), `menu "${item.label}" calls an existing function (${item.fn})`);
    }
    const setupItem = menu.items.find((i) => i.label === 'Set up or repair');
    s.eq(setupItem && setupItem.fn, 'ppSetup', '"Set up or repair" runs ppSetup()');
    const dialogsOf = (fn) => {
      const before = h.admin.ui.log.length;
      const res = h.exec(fn, [], { context: 'menu' });
      return { res, shown: h.admin.ui.log.slice(before) };
    };
    const po = dialogsOf('panelOpen');
    const dlg = po.shown.find((d) => d.kind === 'dialog');
    s.ok(po.res.ok && dlg && dlg.title === 'Partner Pulse control panel' && dlg.width === 1100 && dlg.height === 760,
      'panelOpen shows Panel.html at 1100 x 760, titled "Partner Pulse control panel"', K.show(dlg && { title: dlg.title, width: dlg.width, height: dlg.height, file: dlg.file }));
    s.ok(dlg && /Panel\.html$/.test(dlg.file || ''), 'the dialog is HtmlService.createHtmlOutputFromFile("Panel")', K.show(dlg && dlg.file));
    for (const [label, section] of [['Publish…', 'publish'], ['Generate links…', 'links'], ['Open control panel', null]]) {
      const item = menu.items.find((i) => (i.label || '').replace(/\.\.\.$/, '…') === label);
      if (!item) continue;
      const out = dialogsOf(item.fn);
      s.ok(out.res.ok && out.shown.some((d) => d.kind === 'dialog' && d.title === 'Partner Pulse control panel'), `menu "${label}" opens the control panel`,
        out.res.ok ? K.show(out.shown.map((d) => d.title)) : out.res.error.message);
      if (section) {
        const L = P(h, s, 'panelLoad', []);
        s.ok(L && String(L.open_section || '').toLowerCase().indexOf(section) >= 0, `menu "${label}" makes the panel start on ${section}`, K.show(L && L.open_section));
      }
    }
    const previewItem = menu.items.find((i) => i.label === 'Preview the draft form');
    if (previewItem) {
      const out = dialogsOf(previewItem.fn);
      const d = out.shown.find((x) => x.kind === 'dialog' || x.kind === 'alert');
      s.ok(out.res.ok && d && /preview=1/.test((d.content || '') + (d.message || '')), '"Preview the draft form" shows a small window with the preview link',
        out.res.ok ? K.show(d && { kind: d.kind, title: d.title }) : out.res.error.message);
      s.soft(d && d.kind === 'dialog' && /<a [^>]*target="_blank"/.test(d.content || ''), 'the preview link is an <a target="_blank"> link');
    }
    const helpItem = menu.items.find((i) => i.label === 'Help');
    if (helpItem) {
      const out = dialogsOf(helpItem.fn);
      const d = out.shown.find((x) => x.kind === 'dialog' || x.kind === 'alert');
      s.ok(out.res.ok && d && /github\.com\/PranavAkellaPS37\/NPS-Form-/.test((d.content || '') + (d.message || '')), '"Help" shows the GitHub guides',
        out.res.ok ? K.show(d && d.title) : out.res.error.message);
    }
    H.contractClean(s, h);
  });

  add('B11', 'Co-admins: the Drive folder is never silently replaced; "Share the Drive folder"; data tabs exactly as wide as their columns', async (s) => {
    const h = H.setupPublished(s);
    const owner = h.admin.props.script.get('OWNER_EMAIL');
    const folderId = h.admin.props.script.get('FOLDER_ID');
    const publishedId = h.admin.props.script.get('PUBLISHED_FOLDER_ID');
    s.ok(String(owner).indexOf('@') > 0, 'set-up recorded the owner of the Drive folder', K.show(owner));
    // A co-admin who was never given the Drive folder
    h.control.denyDrive = (item, user) => user === 'coadmin@example.com';
    const L = h.exec('panelLoad', [], { context: 'panel', user: 'coadmin@example.com' });
    s.ok(L.ok, 'panelLoad still works for a co-admin without Drive access (the live version comes from the cache)', L.ok ? '' : L.error.message);
    const pub = h.exec('panelPublish', [L.ok ? L.value.revision : 0, 'co-admin publish'], { context: 'panel', user: 'coadmin@example.com' });
    s.ok(!pub.ok && /Share the Drive folder with all editors/.test(pub.error.message) && pub.error.message.indexOf(owner) >= 0,
      'a co-admin without Drive access gets a plain message naming the owner and the menu item to use', pub.ok ? K.show(pub.value) : pub.error.message);
    s.eq(h.admin.props.script.get('FOLDER_ID'), folderId, 'the main Drive folder was NOT replaced');
    s.eq(h.admin.props.script.get('PUBLISHED_FOLDER_ID'), publishedId, 'the published folder was NOT replaced');
    const setupByCoadmin = h.exec('ppSetup', [], { context: 'menu', user: 'coadmin@example.com' });
    s.eq(h.admin.props.script.get('FOLDER_ID'), folderId, 'Set up or repair run by a co-admin does not replace the folder either');
    h.control.denyDrive = null;
    // The owner shares the folder with every editor of the Sheet
    h.control.sheetEditors = [owner, 'coadmin@example.com', 'third@example.com'];
    const share = h.exec('ppShareFolder', [], { context: 'menu', user: owner });
    s.ok(share.ok, 'ppShareFolder runs', share.ok ? '' : share.error.message);
    const asked = (h.state.executions[h.state.executions.length - 1] || {}).ui || [];
    s.ok(JSON.stringify(asked).indexOf('coadmin@example.com') >= 0 && JSON.stringify(asked).indexOf('third@example.com') >= 0, 'the owner is told who now has the folder', K.show(asked, 300));
    h.control.sheetEditors = null;
    // Exact column widths in a new round's data spreadsheet
    const open = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']);
    const info = H.roundInfo(h, '2026-R1');
    const book = info && info.sheet_id ? h.evaluate(`SpreadsheetApp.openById(${JSON.stringify(info.sheet_id)})`) : null;
    if (book) {
      const want = { responses: 29, function_ratings: 11, free_text: 29, events: 8, pings: 15 };   // pings: + config_version (26 Oct 2026)
      Object.keys(want).forEach((tab) => {
        const sh = book.getSheetByName(tab);
        s.eq(sh ? sh.getMaxColumns() : null, want[tab], `data tab "${tab}" is exactly ${want[tab]} columns wide (Google counts empty cells)`);
      });
    } else {
      s.ok(false, 'the round data spreadsheet exists', K.show(info));
    }
    H.contractClean(s, h);
  });

  add('B10', 'Contract helpers: PP_slug (codes for new things) and PP_derivedTextKeys (texts every active item needs)', async (s) => {
    const h = H.setupPublished(s);
    const slug = (args) => { const r = h.exec('PP_slug', args, { context: 'panel' }); return r.ok ? r.value : `THREW: ${r.error.message}`; };
    s.eq(slug(['How easy is the app?']), 'how_easy_is_the_app', 'PP_slug lowercases and joins the words with "_"');
    s.eq(slug(['  Payments / Payouts!! ']), 'payments_payouts', 'PP_slug turns each run of other characters into one "_" and trims "_" at both ends');
    const digit = slug(['3 things to fix']);
    s.ok(typeof digit === 'string' && /^[a-z]/.test(digit) && /3_things_to_fix$/.test(digit), 'PP_slug puts a letter in front of a leading digit', K.show(digit));
    const long = slug(['A very long question text that goes on and on well beyond forty characters']);
    s.ok(typeof long === 'string' && long.length <= 40 && /^a_very_long/.test(long), 'PP_slug cuts the code to 40 characters', K.show(long));
    s.eq(slug(['Returns', ['returns']]), 'returns_2', 'PP_slug adds _2 when the code is taken (taken codes passed as a list)', 'should');
    s.eq(slug(['Returns', ['returns', 'returns_2']]), 'returns_3', 'PP_slug adds _3 when _2 is taken too', 'should');
    const L = P(h, s, 'panelLoad', [], { need: true });
    const keys = P(h, s, 'PP_derivedTextKeys', [L.model]);
    if (s.ok(Array.isArray(keys), 'PP_derivedTextKeys(model) returns a list of keys', K.show(keys))) {
      const want = ['fn.losses.name', 'fn.losses.help', 'issue.losses.wrong_debit', 'issue.other', 'support.agent_behaviour',
        'q.support_comment', 'q.nps', 'nps.low', 'nps.high', 'nps.scale_hint', 'q.support_gate', 'q.one_fix', 'q.support_block'];
      s.eq(want.filter((k) => keys.indexOf(k) < 0), [], 'derived keys: area name/help, chips (+ issue.other), support items, the support comment, every screen text');
      s.ok(keys.indexOf('support.not_applicable') < 0, '"support.not_applicable" is not needed while that setting is off');
      const m = H.clone(L.model);
      m.chips.find((c) => c.area === 'losses' && c.code === 'wrong_debit').active = false;
      m.settings['support.allow_not_applicable'] = true;
      m.screens.splice(idx(m, 'thanks'), 0, newScreen({ id: 'q_role', type: 'single_choice', text: 'q.q_role', options: ['owner', 'captain'] }));
      const k2 = P(h, s, 'PP_derivedTextKeys', [m]) || [];
      s.ok(k2.indexOf('issue.losses.wrong_debit') < 0, 'an inactive chip needs no text');
      s.ok(k2.indexOf('support.not_applicable') >= 0, '"support.not_applicable" is needed once that setting is on');
      s.ok(['q.q_role', 'choice.q_role.owner', 'choice.q_role.captain'].every((k) => k2.indexOf(k) >= 0), 'a choice question needs its text and one text per option',
        K.show(k2.filter((k) => /q_role/.test(k))));
    }
    H.contractClean(s, h);
  });
};

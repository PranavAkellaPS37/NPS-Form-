/* =============================================================================
   tests/flow/types_test.js: the kinds of screen ("question types") as
   plug-ins (flow-graph stage 5, 26 Oct 2026).

   WHAT IT CHECKS
     1. The registry (PP.types in web/js/flow.js): the 12 built-in kinds, in
        order; register / get / list; a description that cannot be used is
        refused with a plain message.
     2. Nothing changed by the move: the catalogue says exactly what the
        hand-kept lists said before 26 Oct 2026 (frozen below, copied from
        web/js/flow-check.js, apps-script/Model.gs and apps-script/Panel.html
        of that day): names, settings, required settings, what a rule can
        test, what each screen sends, the default texts, the list format's
        kinds of line, the control panel's list and its picker (icons, order,
        standard codes).
     3. web/config/types.json and Model.gs's PP_SCREEN_TYPES are what
        node scripts/flow.js types makes from the code today.
     4. A new kind (tests/flow/fixtures/types/stars_1_10.js, the guide's
        example: its answer only, no ratings row, ten buttons in two rows of
        five): the standard rules decide Next and what is sent; its
        description alone (loadCatalogue, as the command line and the control
        panel read web/config/types.json) lets the checker check it; a
        catalogue that describes a known kind differently from the code
        keeps the code's description and gives a warning.
     5. The drawings: web/js/ui.js + web/js/types.js draw every built-in
        screen EXACTLY like the old web/js/screens.js (frozen as
        tests/flow/legacy/screens_before_types.js), element by element, for
        many screens, settings, languages and taps; a new kind's drawing gets
        "auto" from its flags. Runs without a browser: a small stand-in for
        the page records what the code builds.
     6. The files: ES5 only; web/index.html loads ui.js and types.js (defer)
        after the engine and before app.js, and no longer screens.js; the
        comments of core.js, app.js, net.js and index.html no longer name
        screens.js as a current file.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/types_test.js
     You should see one PASS line per check, then "N tests passed".

   WHAT IT READS / WRITES
     Reads web/js/*.js, web/index.html, web/config/survey.json,
     web/config/types.json, web/i18n/strings.json, apps-script/Model.gs,
     tests/flow/legacy/screens_before_types.js and tests/flow/fixtures/.
     Writes nothing.
   ============================================================================= */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const flow = require(path.join(REPO, 'web/js/flow.js'));
const C = require(path.join(REPO, 'web/js/flow-check.js'));
const T = globalThis.PP.types;
const clone = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
const ok = (name) => { passed++; console.log('PASS', name); };

const FROZEN_SCREENS = path.join(__dirname, 'legacy', 'screens_before_types.js');
const FROZEN_SCREENS_SHA = 'ee709e2a3100c1eab6dbb40efeadfa8e56b74b6e4ff01804915e5fdb639e1cee';
const STARS = path.join(__dirname, 'fixtures', 'types', 'stars_1_10.js');
const BUILTIN = ['language_picker', 'whats_changed', 'function_rating', 'function_deep_dive', 'support_block', 'thank_you',
  'nps_0_10', 'rating_1_5', 'yes_no', 'single_choice', 'free_text', 'info_card'];
const COMMON_FIELDS = ['id', 'type', 'store_as', 'show_if', 'repeat_for', 'next', 'required', 'text', 'help', 'label'];

/* ---- 1. the registry ---------------------------------------------------------------------------- */
{
  assert.deepStrictEqual(T.list(), BUILTIN, 'the 12 built-in kinds, in the catalogue order');
  assert.strictEqual(typeof flow.types, 'object');
  assert.deepStrictEqual(Object.keys(flow.types), BUILTIN, 'PP.flow.types is the same registry');
  BUILTIN.forEach((t) => assert.strictEqual(T.get(t), flow.types[t]));
  assert.strictEqual(T.get('constructor'), undefined, 'own keys only');
  assert.strictEqual(T.get(5), undefined);
  [null, {}, { type: 'Bad' }, { type: 'group' }, { type: '1x' }, { type: 'a-b' }].forEach((d) => {
    assert.throws(() => T.register(d), /PP\.types\.register: a description needs "type"/, JSON.stringify(d));
  });
  assert(flow.isEnd({ type: 'thank_you' }) && !flow.isEnd({ type: 'nps_0_10' }) && !flow.isEnd({ type: 'mystery' }));
  ok('registry: 12 built-in kinds in order, PP.flow.types is it, unusable descriptions refused');
}

/* ---- 2. nothing changed by the move: the old hand-kept lists, frozen ------------------------------ */
// web/js/flow-check.js until 26 Oct 2026 (TYPES, DEFAULT_TEXT, LIST_*, records)
const OLD_CHECKER = {
  language_picker: { label: 'Language buttons' },
  whats_changed: { label: '"What changed" card' },
  nps_0_10: { label: '0-10 question', fields: ['low_label', 'high_label', 'scale_hint'], needs: ['text'], answer: true },
  rating_1_5: { label: 'Faces question (1-5)', needs: ['text'], answer: true },
  yes_no: { label: 'Yes / No question', needs: ['text'], answer: true },
  single_choice: { label: 'Pick-one question', fields: ['options'], needs: ['text', 'options'], answer: true },
  free_text: { label: 'Voice or typing', fields: ['block'], needs: ['text'], answer: true },
  info_card: { label: 'Information card', fields: ['body'], needs: ['text'] },
  function_rating: { label: 'Area rating (faces)', fields: ['allow_not_applicable', 'issue_code_from'], answer: true },
  function_deep_dive: { label: 'Main problem + tell us more', fields: ['rating_from', 'options', 'detail_text', 'detail_text_required',
    'require_choice', 'require_detail_if_other'], answer: true },
  support_block: { label: 'Support ratings', fields: ['rows', 'allow_not_applicable', 'comment'], needs: ['text', 'rows'], answer: true },
  thank_you: { label: 'Thank you (sends the answers)', fields: ['body'] }
};
const OLD_DEFAULT_TEXT = { language_picker: 'lang.title', whats_changed: 'wc.title', function_rating: 'q.fn_rating',
  function_deep_dive: 'q.deep_dive', thank_you: 'thanks.title' };
const OLD_LIST_TYPES = ['language_picker', 'whats_changed', 'nps_0_10', 'function_ratings', 'function_deep_dives',
  'yes_no', 'support_block', 'free_text', 'rating_1_5', 'single_choice', 'info_card', 'thank_you'];
const OLD_LIST_NEEDS_TEXT = ['nps_0_10', 'yes_no', 'free_text', 'rating_1_5', 'single_choice', 'info_card', 'support_block'];
const OLD_LIST_SKIP_IF = { language_picker: 'lang_in_url', whats_changed: 'empty' };
function oldRecords(t, keys) {   // flow-check.js records() before the move
  const r = { answers: 0, ratings: 0, free_text: 0 };
  if (t === 'nps_0_10' || t === 'yes_no' || t === 'single_choice') r.answers = 1;
  else if (t === 'rating_1_5') { r.answers = 1; r.ratings = 1; }
  else if (t === 'function_rating') r.ratings = 1;
  else if (t === 'function_deep_dive' || t === 'free_text') r.free_text = 1;
  else if (t === 'support_block') { r.ratings = (keys.rows || []).length; r.free_text = keys.comment ? 1 : 0; }
  return r;
}
function oldAnswerKind(t, n, key, keys) {   // flow-check.js answerKind() before the move (without "what")
  const opts = (keys.options || []).map((o) => String(o.code));
  switch (t) {
    case 'nps_0_10': return { num: true, min: 0, max: 10, skip: n.required === false };
    case 'rating_1_5': return { num: true, min: 1, max: 5, skip: n.required === false };
    case 'function_rating': return { num: true, min: 1, max: 5, na: n.allow_not_applicable === true, skip: false };
    case 'yes_no': return { values: ['yes', 'no'], skip: n.required === false };
    case 'single_choice': return { values: opts, skip: n.required === false };
    case 'function_deep_dive': return { values: opts, skip: n.require_choice === false };
    case 'free_text': return { text: true, skip: n.required !== true };
    case 'support_block':
      if (keys.comment && keys.comment.key === key) return { text: true, skip: true };
      return { num: true, min: 1, max: 5, na: n.allow_not_applicable === true, skip: n.required === false };
    default: return null;
  }
}
/* The same, read from the catalogue the way flow-check.js answerKind() reads it now. */
function newAnswerKind(t, n, key, keys) {
  const d = T.get(t);
  let a = d && d.answer;
  if (a && a.kind === 'rows') a = keys.comment && keys.comment.key === key ? a.comment : a.rows;
  if (!a) return null;
  const out = {};
  if (a.kind === 'number') { out.num = true; out.min = a.min; out.max = a.max; if (a.na_by) out.na = n[a.na_by] === true; }
  if (a.kind === 'choice') out.values = Array.isArray(a.values) ? a.values.map(String) : (keys.options || []).map((o) => String(o.code));
  if (a.kind === 'text') out.text = true;
  const by = 'required_by' in a ? a.required_by : 'required';
  out.skip = a.optional === true || (by !== null && !T.isRequired(d, n, by));
  return out;
}
{
  const cat = C.catalogue();
  assert.deepStrictEqual(cat.map((e) => e.type), BUILTIN);
  cat.forEach((e) => {
    const old = OLD_CHECKER[e.type];
    assert.strictEqual(e.label, old.label, e.type + ' label');
    const own = Object.keys(e.fields).filter((f) => COMMON_FIELDS.indexOf(f) === -1);
    assert.deepStrictEqual(own, old.fields || [], e.type + ' its own settings, in order');
    assert.deepStrictEqual(Object.keys(e.fields).filter((f) => e.fields[f].required === true), old.needs || [], e.type + ' required settings');
    assert.strictEqual(e.answer !== null, Boolean(old.answer), e.type + ' has an answer');
    assert.strictEqual(e.texts.text, OLD_DEFAULT_TEXT[e.type], e.type + ' default title');
  });
  assert.deepStrictEqual(T.get('thank_you').texts, { text: 'thanks.title', body: 'thanks.body' });
  assert.deepStrictEqual(T.get('function_rating').texts, { text: 'q.fn_rating', label: 'fn.{area}.name', help: 'fn.{area}.help' });
  assert.deepStrictEqual(T.get('function_deep_dive').texts, { text: 'q.deep_dive', label: 'fn.{area}.name', detail_text: 'q.tell_more',
    detail_text_required: 'q.tell_more_required', options: { from: 'area.issues', text: 'issue.{area}.{code}', other: 'issue.other' } });
  const rows = cat.filter((e) => e.row).map((e) => e.row);
  assert.deepStrictEqual(rows.map((r) => r.type).slice().sort(), OLD_LIST_TYPES.slice().sort(), 'the kinds of line of the list format');
  assert.deepStrictEqual(rows.filter((r) => r.needs_text).map((r) => r.type).sort(), OLD_LIST_NEEDS_TEXT.slice().sort(), 'lines that need "text"');
  const skip = {};
  rows.forEach((r) => { if (r.skip_if) skip[r.type] = r.skip_if; });
  assert.deepStrictEqual(skip, OLD_LIST_SKIP_IF, 'skip_if per kind of line');
  // what a rule can test, and what one screen sends, for every kind and every value of its settings
  const values = [undefined, true, false, 'yes'];
  const keySets = [{ options: [{ code: 'a' }, { code: 'other' }] },
    { rows: [{ id: 'x', key: 'support:x' }, { id: 'y', key: 'support:y' }], comment: { key: 'support_comment' } }, { rows: [{ id: 'x', key: 'support:x' }] }];
  BUILTIN.forEach((t) => {
    keySets.forEach((keys) => {
      values.forEach((req) => values.forEach((other) => {
        const n = { required: req, require_choice: other, allow_not_applicable: other };
        ['k', 'support_comment'].forEach((key) => {
          assert.deepStrictEqual(newAnswerKind(t, n, key, keys), oldAnswerKind(t, n, key, keys), `${t} answer kind (${JSON.stringify(n)}, ${key})`);
        });
      }));
      const rec = T.get(t).records || {};
      const got = {};
      ['answers', 'ratings', 'free_text'].forEach((m) => {
        const v = rec[m];
        got[m] = v === 'rows' ? (keys.rows || []).length : v === 'comment' ? (keys.comment ? 1 : 0) : (v || 0);
      });
      assert.deepStrictEqual(got, oldRecords(t, keys), t + ' records');
    });
  });
  ok('the catalogue says what the checker\'s old lists said: names, settings, required settings, answers, sends, default texts, list lines');
}
{
  // apps-script/Model.gs PP_SCREEN_TYPES before 26 Oct 2026 (hand-kept), and the panel's picker lists (Panel.html)
  const OLD_MODEL = [
    ['language_picker', 'Language buttons', true, false, 'The partner picks their language. Skipped when the link already says which language.', ['skip_if'], null],
    ['whats_changed', '"What changed" card', true, false, 'Shows what Valmo changed since the last round (edited under Rounds). Skipped when the round has nothing to show.', ['skip_if'], null],
    ['function_ratings', 'Area ratings', true, false, 'One screen of five faces for each area that is switched on (Areas & problems).', [], null],
    ['function_deep_dives', 'Problem screens', true, false, '"What is the main problem?" for every area rated low, with that area\'s problem buttons and an optional voice note or text. Must come after the area ratings.', [], null],
    ['support_block', 'Support ratings', true, true, 'The support questions on one screen, each with five faces, plus an optional comment.', [], true],
    ['thank_you', 'Thank-you screen', true, false, 'Sends the answers and says thank you. The main one comes after the last question; another ending may follow it, reached only by a jump.', [], null],
    ['nps_0_10', '0 to 10 question', false, true, 'Eleven buttons from 0 to 10, with a label under each end.', ['low_label', 'high_label', 'scale_hint', 'required'], true],
    ['rating_1_5', 'Faces question (1 to 5)', false, true, 'One row of five faces, from very bad to very good.', ['required'], true],
    ['yes_no', 'Yes / No question', false, true, 'Two big buttons: Yes and No.', ['required'], true],
    ['single_choice', 'Pick one answer', false, true, 'A list of answers; the partner taps one.', ['options', 'required'], true],
    ['free_text', 'Voice note or typing', false, true, 'The partner records a voice note or types an answer.', ['required'], false],
    ['info_card', 'Information card', false, true, 'A title and an optional longer text, with nothing to answer.', ['body'], null]
  ];
  const OLD_ICON = { language_picker: '🌐', whats_changed: '📰', function_ratings: '⭐', function_deep_dives: '🔍', support_block: '🎧', thank_you: '🙏',
    nps_0_10: '🔟', rating_1_5: '🙂', yes_no: '👍', single_choice: '☑️', free_text: '🎙️', info_card: 'ℹ️' };
  const OLD_ORDER = ['nps_0_10', 'rating_1_5', 'yes_no', 'single_choice', 'free_text', 'info_card', 'language_picker', 'whats_changed',
    'function_ratings', 'function_deep_dives', 'support_block', 'thank_you'];
  const OLD_IDS = { language_picker: 'language', whats_changed: 'whats_changed', function_ratings: 'fn_ratings', function_deep_dives: 'fn_deep_dives',
    support_block: 'support', thank_you: 'thanks' };
  const OLD_TEXT_KEYS = { support_block: 'q.support_block' };
  const OLD_AFTER = { function_ratings: ' (one screen per area)', function_deep_dives: ' (one screen per area rated low)', support_block: ' (all support questions on one screen)' };
  const OLD_GENERIC = ['nps_0_10', 'rating_1_5', 'yes_no', 'single_choice', 'free_text', 'info_card'];
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(read('apps-script/Model.gs'), ctx, { filename: 'Model.gs' });
  const types = JSON.parse(JSON.stringify(vm.runInContext('PP_SCREEN_TYPES', ctx)));
  assert.deepStrictEqual(types.map((r) => [r.type, r.label, r.builtin, r.needs_text, r.description, r.fields, r.required_default]), OLD_MODEL,
    'Model.gs PP_SCREEN_TYPES: the same 12 kinds, in the same order, with the same names, texts and settings');
  types.forEach((r) => {
    assert.strictEqual(r.icon, OLD_ICON[r.type], r.type + ' icon');
    assert.strictEqual(r.default_id, OLD_IDS[r.type], r.type + ' standard code');
    assert.strictEqual(r.default_text, OLD_TEXT_KEYS[r.type], r.type + ' standard text');
    assert.strictEqual(r.after_note, OLD_AFTER[r.type], r.type + ' note in "Put it after"');
    assert.strictEqual(r.repeatable === true, OLD_GENERIC.indexOf(r.type) !== -1, r.type + ' can be asked once per area');
  });
  assert.deepStrictEqual(types.slice().sort((a, b) => a.order - b.order).map((r) => r.type), OLD_ORDER, 'the picker\'s order');
  assert.deepStrictEqual(types.filter((r) => r.node_type).map((r) => [r.type, r.node_type]),
    [['function_ratings', 'function_rating'], ['function_deep_dives', 'function_deep_dive']], 'rows that become another kind of node');
  // the panel keeps none of these lists any more
  const panel = read('apps-script/Panel.html');
  ['TYPE_ICON', 'TYPE_FALLBACK', 'TYPE_ORDER', 'BUILTIN_TEXT_KEYS', 'BUILTIN_IDS', 'AFTER_NOTES'].forEach((name) => {
    assert(!new RegExp('\\b' + name + '\\b').test(panel), 'Panel.html no longer keeps ' + name);
  });
  ok('the control panel\'s list (Model.gs) and its picker (icons, order, standard codes, notes) are what Model.gs and Panel.html kept by hand');
}

/* ---- 3. the generated copies are up to date ------------------------------------------------------ */
{
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/flow.js'), 'types', '--check', '--json'], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual([out.types_json, out.model_gs, out.problems, out.warnings, out.added], ['fresh', 'fresh', [], [], []]);
  const file = JSON.parse(read('web/config/types.json'));
  assert.strictEqual(file.format, 'pp-types/1');
  assert.deepStrictEqual(file.types, clone(C.catalogue()), 'web/config/types.json = the catalogue of the code');
  assert(!/function\s*\(|=>/.test(read('web/config/types.json')), 'no code in the catalogue');
  ok('web/config/types.json and Model.gs\'s PP_SCREEN_TYPES are what node scripts/flow.js types makes today');
}

/* ---- 4. a new kind: one file (the guide's example, tests/flow/fixtures/types/stars_1_10.js) ----------------- */
/* A fresh engine and checker in their own space, so the registry of this process stays the built-in one. */
function freshTools() {
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  ['web/js/flow.js', 'web/js/flow-check.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  return { ctx, PP: ctx.PP };
}
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', '_base.json'), 'utf8'));
function starSurvey(extra) {
  const s = clone(BASE.survey);
  s.flow = { format: 'pp-flow/1', start: 'nps', collections: { areas: { list: 'functions', defaults: { threshold: 3 } } }, nodes: [
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'stars' },
    Object.assign({ id: 'stars', type: 'stars_1_10', text: 'q.stars', low_label: 'q.stars_low', next: 'thanks' }, extra || {}),
    { id: 'thanks', type: 'thank_you' }] };
  return s;
}
function starStrings() {
  const s = clone(BASE.strings);
  ['q.stars', 'q.stars_low'].forEach((k) => { s[k] = {}; Object.keys(s['q.nps']).forEach((l) => { s[k][l] = '[test] ' + k; }); });
  return s;
}
{
  const { ctx, PP } = freshTools();
  vm.runInContext(fs.readFileSync(STARS, 'utf8'), ctx, { filename: 'stars_1_10.js' });
  assert.deepStrictEqual(clone(PP.types.list().slice(-1)), ['stars_1_10']);
  const entry = JSON.parse(JSON.stringify(PP.flowCheck.catalogue().filter((e) => e.type === 'stars_1_10')[0]));
  assert.deepStrictEqual(entry.custom, [], 'it brings no rules of its own: the standard ones apply');
  assert.deepStrictEqual(entry.records, { answers: 1, ratings: 0, free_text: 0 }, 'its answer only: ratings rows hold 1 to 5');
  const s = starSurvey();
  const F = PP.flow;
  const steps = (answers) => F.path(F.load(s), s, { facts: {} }, { answers: answers || {}, texts: {}, audio: {} });
  const st = steps({ nps: 9, stars: 7 });
  assert.deepStrictEqual(clone(st.map((x) => x.id)), ['nps', 'stars', 'thanks']);
  assert.deepStrictEqual(clone(st[1].keys), { text: 'q.stars', low_label: 'q.stars_low' });
  assert.strictEqual(F.canProceed(st[1], { answers: {} }, s), false, 'Next needs a star');
  assert.strictEqual(F.canProceed(st[1], { answers: { stars: 3 } }, s), true);
  const optional = starSurvey({ required: false });
  const so = F.path(F.load(optional), optional, { facts: {} }, { answers: {}, texts: {}, audio: {} });
  assert.strictEqual(F.canProceed(so[1], { answers: {} }, optional), true, 'required false: Next without a star');
  const sub = F.buildSubmission(s, { answers: { nps: 9, stars: 7 }, submission_id: 's', session_id: 's', events: [] }, st, { client: {} }, () => null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify([sub.answers, sub.ratings, sub.free_text])), [{ nps: 9, stars: 7 }, [], []],
    'the standard data: the answer only (no ratings row: those hold 1 to 5)');
  // the checker knows it from its description
  const r = PP.flowCheck.check(s, starStrings(), {});
  assert(!r.findings.some((f) => f.level === 'error'), JSON.stringify(r.findings));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.stats)), { answers: 2, ratings: 0, free_text: 0, longest_path: 3 });
  const bad = starSurvey({ extra_setting: 1, low_label: 7 });
  bad.flow.nodes[2].show_if = { answer: 'stars', equals: 11 };
  bad.flow.nodes[1].next = 'thanks';
  const rb = JSON.parse(JSON.stringify(PP.flowCheck.check(bad, starStrings(), {}).findings));
  const has = (code, level, re) => rb.some((f) => f.code === code && f.level === level && re.test(f.message));
  assert(has('F2', 'warning', /"extra_setting", which a stars_1_10 screen does not use/), JSON.stringify(rb));
  assert(has('F1', 'error', /"low_label" is 7, but it must be the name of a text/), JSON.stringify(rb));
  assert(has('R3', 'error', /the star rating "stars" can only be a whole number from 1 to 10, so 11 can never match/), JSON.stringify(rb));
  const noText = starSurvey();
  delete noText.flow.nodes[1].text;
  assert(PP.flowCheck.check(noText, starStrings(), {}).findings.some((f) => f.code === 'F1' && /a Stars \(1 to 10\) \(stars_1_10\) needs "text"/.test(f.message)));
  const missing = PP.flowCheck.check(s, BASE.strings, {}).findings.filter((f) => f.code === 'T1' && f.level === 'error');
  assert(missing.some((f) => /q\.stars/.test(f.message)), 'its texts are checked: ' + JSON.stringify(missing));
  assert(/\| `stars` \| Stars \(1 to 10\) \|/.test(PP.flowCheck.toMarkdown(s, starStrings(), {})), 'the map names it');
  ok('a new kind (stars_1_10.js): standard Next rule and data, checked from its description (F1, F2, R3, T1, sizes, map)');
}
{
  // the command line and the control panel know a new kind from web/config/types.json alone (loadCatalogue)
  const { ctx, PP } = freshTools();
  vm.runInContext(fs.readFileSync(STARS, 'utf8'), ctx, { filename: 'stars_1_10.js' });
  const catalogue = { format: 'pp-types/1', types: JSON.parse(JSON.stringify(PP.flowCheck.catalogue())) };
  const other = freshTools().PP;
  const s = starSurvey();
  assert(other.flowCheck.check(s, starStrings(), {}).findings.some((f) => f.code === 'F1' && /stars_1_10/.test(f.message)), 'unknown before');
  assert.deepStrictEqual(Array.from(other.flowCheck.loadCatalogue(catalogue)), ['stars_1_10'], 'only the kind it lacked is added');
  assert.deepStrictEqual(Array.from(other.flowCheck.loadCatalogue(catalogue)), [], 'loading twice adds nothing');
  assert.strictEqual(typeof other.types.get('nps_0_10').isComplete, 'undefined', 'built-in kinds keep their own description');
  assert(!other.flowCheck.check(s, starStrings(), {}).findings.some((f) => f.level === 'error'), 'known now');
  const sim = other.flowCheck.simulate(s, { nps: 4, stars: 2 }, {}, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify([sim.submission.answers, sim.submission.ratings])), [{ nps: 4, stars: 2 }, []], 'Try a path: the standard data');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(other.flowCheck.catalogue())), catalogue.types, 'the same catalogue, without code');
  ok('loadCatalogue: a kind known only from web/config/types.json is checked, simulated and listed like the phone runs it');
}
{
  // a catalogue that describes a kind this program already knows differently (out of date, or edited by
  // hand): the code's description stays (as on phones), and loadCatalogue's list of warnings says so
  const { ctx, PP } = freshTools();
  vm.runInContext(fs.readFileSync(STARS, 'utf8'), ctx, { filename: 'stars_1_10.js' });
  const catalogue = { format: 'pp-types/1', types: JSON.parse(JSON.stringify(PP.flowCheck.catalogue())) };
  const quiet = [];
  assert.deepStrictEqual(Array.from(freshTools().PP.flowCheck.loadCatalogue(catalogue, quiet)), ['stars_1_10']);
  assert.deepStrictEqual(quiet, [], 'the catalogue made from the code: no warnings');
  const reordered = clone(catalogue);
  reordered.types = reordered.types.map((e) => { const out = {}; Object.keys(e).reverse().forEach((k) => { out[k] = e[k]; }); return out; });
  const quiet2 = [];
  freshTools().PP.flowCheck.loadCatalogue(reordered, quiet2);
  assert.deepStrictEqual(quiet2, [], 'the same descriptions written in another key order: no warnings');
  const changed = clone(catalogue);
  changed.types.find((e) => e.type === 'nps_0_10').answer.max = 11;
  Object.assign(changed.types.find((e) => e.type === 'yes_no'), { label: 'Yes or no', description: 'Two buttons.' });
  const warnings = [];
  const third = freshTools().PP;
  assert.deepStrictEqual(Array.from(third.flowCheck.loadCatalogue(changed, warnings)), ['stars_1_10'], 'still adds only the kind it lacked');
  assert.strictEqual(warnings.length, 2, JSON.stringify(warnings));
  assert(/describes "nps_0_10" differently from the code that runs here \(its "answer" differs\), so the checks follow the code/.test(warnings[0]), warnings[0]);
  assert(/describes "yes_no" differently .*these parts differ: "label", "description"/.test(warnings[1]) && /types --write/.test(warnings[1]), warnings[1]);
  assert.strictEqual(third.types.get('nps_0_10').answer.max, 10, 'the code\'s description wins');
  assert.deepStrictEqual(Array.from(freshTools().PP.flowCheck.loadCatalogue(changed)), ['stars_1_10'], 'without a list: no warnings, no error');
  ok('loadCatalogue: a known kind described differently keeps the code\'s description, with a warning naming what differs');
}

/* ---- 5. the drawings: the old web/js/screens.js and ui.js + types.js draw the same ------------------------- */
/* A small stand-in for the page: it records the elements, their attributes, text and listeners. */
function makeDocument() {
  class Node0 {
    constructor() { this.parentNode = null; this.childNodes = []; }
    get firstChild() { return this.childNodes[0] || null; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i !== -1) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  }
  class Text0 extends Node0 { constructor(t) { super(); this.nodeValue = String(t); } }
  class El extends Node0 {
    constructor(tag, ns) { super(); this.tagName = tag; this.ns = ns || null; this.attributes = {}; this.listeners = []; this.hidden = false; this.className = ''; }
    setAttribute(n, v) { this.attributes[n] = String(v); }
    removeAttribute(n) { delete this.attributes[n]; }
    addEventListener(type, fn) { this.listeners.push({ type, fn }); }
    get textContent() { return this.childNodes.map((c) => (c instanceof Text0 ? c.nodeValue : c.textContent)).join(''); }
    set textContent(v) {
      this.childNodes.forEach((c) => { c.parentNode = null; });
      this.childNodes = [];
      if (v !== '' && v !== null && v !== undefined) this.appendChild(new Text0(v));
    }
    get classList() {
      const el = this;
      const toggle = (c, on) => {
        const set = el.className.split(/\s+/).filter(Boolean);
        const at = set.indexOf(c);
        const want = on === undefined ? at === -1 : Boolean(on);
        if (want && at === -1) set.push(c);
        if (!want && at !== -1) set.splice(at, 1);
        el.className = set.join(' ');
        return want;
      };
      return { toggle, add: (c) => toggle(c, true), remove: (c) => toggle(c, false), contains: (c) => el.className.split(/\s+/).indexOf(c) !== -1 };
    }
    scrollIntoView(o) { this.scrolled = JSON.stringify(o); }
  }
  return { createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t, ns), createTextNode: (t) => new Text0(t), Text0 };
}
function serialize(node, D) {
  if (!node || typeof node !== 'object') return node === undefined ? '(undefined)' : node;
  if (node instanceof D.Text0) return { text: node.nodeValue };
  const extra = {};
  Object.keys(node).forEach((k) => {
    if (['parentNode', 'childNodes', 'tagName', 'ns', 'attributes', 'listeners', 'hidden', 'className'].indexOf(k) !== -1) return;
    const v = node[k];
    extra[k] = Array.isArray(v) ? 'list of ' + v.length : typeof v === 'function' ? 'function' : v;
  });
  return { tag: node.tagName, ns: node.ns, cls: node.className, hidden: node.hidden,
    attrs: Object.keys(node.attributes).sort().map((k) => k + '=' + node.attributes[k]), on: node.listeners.map((l) => l.type), extra,
    kids: node.childNodes.map((c) => serialize(c, D)) };
}
/* The form's drawing code in a space of its own: core.js, flow.js, stand-ins for the read-aloud button and the
   voice recorder, the texts, then either the old screens.js or the new ui.js + types.js. */
function drawingSpace(which, lang) {
  const D = makeDocument();
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, document: D });
  vm.runInContext(read('web/js/core.js'), ctx, { filename: 'core.js' });
  vm.runInContext(read('web/js/flow.js'), ctx, { filename: 'flow.js' });
  const PP = ctx.PP;
  PP.speech = { button(getItems) {
    const el = D.createElement('button');
    const update = () => el.setAttribute('data-speak', JSON.stringify(getItems()));
    update();
    el._ppUpdate = update;
    return el;
  } };
  PP.voice = { widget(o) {
    const el = D.createElement('div');
    el.setAttribute('data-voice', String(o.itemId));
    el.setAttribute('data-gives', ['ns', 'config', 'state', 'save', 'saveSoon', 'onChange', 'onActivity', 'onCleanup'].filter((k) => o[k] !== undefined).join(','));
    return el;
  } };
  const survey = JSON.parse(read('web/config/survey.json'));
  PP.i18n.init(JSON.parse(read('web/i18n/strings.json')), survey.languages, survey.fallback_language || 'en');
  PP.i18n.setLang(lang);
  if (which === 'old') vm.runInContext(fs.readFileSync(FROZEN_SCREENS, 'utf8'), ctx, { filename: 'screens_before_types.js' });
  else ['web/js/ui.js', 'web/js/types.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  return { D, PP, ctx };
}
/* Draws one case in a space; then presses Next too early (blockedHint), shows each sending status (thank-you),
   or taps one button; returns everything it saw. */
function drawCase(space, c, tap) {
  const { D, PP } = space;
  const log = [];
  const state = clone(c.state);
  const ctx = { step: c.step(PP), config: clone(c.config), state, wc: clone(c.wc), mode: c.mode || 'mock', preview: Boolean(c.preview), ns: 'test',
    submit: clone(c.submit || { status: 'sending', retryIn: 0 }),
    setAnswer: (id, v, adv) => { state.answers[id] = v; log.push(['setAnswer', id, v, adv]); },
    refreshNav: () => log.push(['refreshNav']), save: () => log.push(['save']), saveSoon: () => log.push(['saveSoon']),
    activity: () => log.push(['activity']), onCleanup: () => log.push(['onCleanup']),
    chooseLanguage: (code) => log.push(['chooseLanguage', code]), retryNow: () => log.push(['retryNow']), startOver: () => log.push(['startOver']) };
  const out = PP.screens[c.type](ctx);
  const seen = { keys: Object.keys(out).sort(), auto: out.auto, optional: out.optional, nextLabel: out.nextLabel, el: serialize(out.el, D) };
  if (tap === 'blocked' && out.blockedHint) seen.blocked = [out.blockedHint(), serialize(out.el, D)];
  if (tap === 'statuses' && out.update) {
    seen.statuses = ['sending', 'done', 'failed', 'error', 'already', 'bad_link', 'incomplete', 'closed', 'not_open', 'preview', 'other', 'failed']
      .map((status, i) => { out.update({ status, retryIn: i === 2 ? 5 : 0 }); return serialize(out.el, D); });
  }
  if (typeof tap === 'number') {
    const buttons = [];
    (function walk(n) { if (n.listeners && n.listeners.length) buttons.push(n); (n.childNodes || []).forEach(walk); }(out.el));
    if (tap < buttons.length) {
      buttons[tap].listeners.forEach((l) => l.fn({ target: buttons[tap] }));
      seen.tapped = [tap, buttons.length, serialize(out.el, D), log, out.blockedHint ? out.blockedHint() : null];
    } else seen.tapped = 'none';
  }
  return JSON.stringify(seen);
}
{
  const sha = crypto.createHash('sha256').update(fs.readFileSync(FROZEN_SCREENS)).digest('hex');
  assert.strictEqual(sha, FROZEN_SCREENS_SHA, 'tests/flow/legacy/screens_before_types.js must stay the frozen copy (see legacy/README.md)');
  const survey = JSON.parse(read('web/config/survey.json'));
  const noNa = clone(survey); noNa.rating.allow_not_applicable = false; noNa.support.allow_not_applicable = true; noNa.support.allow_comment = false;
  const noFaces = clone(survey); noFaces.rating.faces = ['a'];
  const wcFull = { title: { en: 'News', hi: 'खबर' }, items: [{ en: 'One', hi: 'एक' }, { en: 'Two', ta: '[TRANSLATE] Two' }] };
  const rich = { nps: 6, 'fn_rating:losses': 2, 'fn_rating:payments': 'na', 'fn_rating:linehaul': 1, 'fn_rating:consumables': 5, 'fn_rating:orders': 3,
    'fn_rating:app': 1, 'fn_deep_dive:losses': 'other', 'fn_deep_dive:linehaul': 'late_arrival', support_gate: 'yes', 'support:kept_updated': 4,
    'support:agent_behaviour': 'na' };
  const states = [
    { answers: {}, texts: {}, audio: {}, lang: 'en', lang_chosen: false },
    { answers: rich, texts: { 'fn_deep_dive:losses': 'no proof' }, audio: {}, lang: 'hi', lang_chosen: true },
    { answers: Object.assign({}, rich, { 'fn_deep_dive:orders': 'other' }), texts: {}, audio: { 'fn_deep_dive:orders': { mime: 'x', duration_s: 1, bytes: 1 } }, lang: 'ta', lang_chosen: true }
  ];
  const cases = [];
  // every screen of today's questionnaire, for three sets of answers and two configurations
  [survey, noNa, noFaces].forEach((config, ci) => states.forEach((state, si) => {
    const steps = flow.path(flow.load(config), config, { facts: { lang_in_url: false, whats_changed_count: 2 } }, state);
    steps.forEach((st, i) => cases.push({ name: `${ci}/${si} ${st.id}`, type: st.type, config, state, wc: si === 1 ? wcFull : { items: [] },
      step: (PP) => PP.flow.path(PP.flow.load(config), config, { facts: { lang_in_url: false, whats_changed_count: 2 } }, state)[i],
      submit: { status: 'done', retryIn: 0 }, preview: si === 2, mode: si === 1 ? 'live' : 'mock' }));
  }));
  // screens written in the graph format with their own texts and settings
  const g = clone(survey);
  g.flow = { format: 'pp-flow/1', start: 'a', collections: { areas: { list: 'functions', defaults: { threshold: 3 } }, support_items: { list: 'support.items' } }, nodes: [
    { id: 'a', type: 'rating_1_5', text: 'q.nps', next: 'b' },
    { id: 'b', type: 'single_choice', text: 'q.nps', options: ['x', 'y'], next: 'c' },
    { id: 'c', type: 'single_choice', text: 'q.nps', options: [{ code: 'p', text: 'q.one_fix' }], next: 'd' },
    { id: 'd', type: 'info_card', text: 'q.nps', body: 'q.one_fix', next: 'e' },
    { id: 'e', type: 'free_text', text: 'q.one_fix', required: true, next: 'f' },
    { id: 'f', type: 'nps_0_10', text: 'q.nps', next: 'h' },
    { id: 'h', type: 'function_rating', repeat_for: { each: 'area', in: 'areas' }, store_as: 'h:{area}', allow_not_applicable: false, next: 'i' },
    { id: 'i', type: 'function_deep_dive', repeat_for: { each: 'area', in: 'areas' }, store_as: 'i:{area}', rating_from: 'h:{area}',
      require_detail_if_other: false, detail_text: 'q.one_fix', next: 'j' },
    { id: 'j', type: 'support_block', text: 'q.support_block', rows: { each: 'item', in: 'support_items', store_as: 's:{item}', text: 'support.{item}' }, next: 'k' },
    { id: 'k', type: 'yes_no', text: 'q.support_gate', next: 'z' },
    { id: 'z', type: 'thank_you', text: 'thanks.close', body: 'q.one_fix' }] };
  const gState = { answers: { a: 4, b: 'y', f: 10, 'h:losses': 2, 'i:losses': 'other', 's:kept_updated': 3, k: 'no' }, texts: {}, audio: {}, lang: 'hi', lang_chosen: true };
  flow.path(flow.load(g), g, { facts: {} }, gState).forEach((st, i) => cases.push({ name: 'graph ' + st.id, type: st.type, config: g, state: gState, wc: null,
    step: (PP) => PP.flow.path(PP.flow.load(g), g, { facts: {} }, gState)[i], submit: { status: 'failed', retryIn: 3 } }));
  // steps made the old way, without a node (older code)
  const fnLosses = survey.functions[0];
  [{ id: 'support', type: 'support_block', entry: { text: 'q.support_block' } }, { id: 'fn_rating:losses', type: 'function_rating', entry: {}, fn: fnLosses },
    { id: 'fn_deep_dive:losses', type: 'function_deep_dive', entry: {}, fn: fnLosses }, { id: 'nps', type: 'nps_0_10', entry: { text: 'q.nps', low_label: 'nps.low' } }]
    .forEach((st) => cases.push({ name: 'old step ' + st.id, type: st.type, config: survey, state: states[1], wc: null, step: () => clone(st) }));
  let compared = 0;
  ['en', 'hi', 'ta'].forEach((lang) => {
    const oldSpace = drawingSpace('old', lang), newSpace = drawingSpace('new', lang);
    assert.deepStrictEqual(Object.keys(newSpace.PP.screens).sort(), Object.keys(oldSpace.PP.screens).sort(), 'the same 12 drawings');
    cases.forEach((c) => {
      const taps = ['blocked', 'statuses'].concat([0, 1, 2, 3, 5, 8, 11, 12]);
      [null].concat(taps).forEach((tap) => {
        const a = drawCase(oldSpace, c, tap), b = drawCase(newSpace, c, tap);
        if (a !== b) assert.fail(`${c.name} (${lang}, ${tap}): the new drawing differs from screens.js\nold: ${a.slice(0, 600)}\nnew: ${b.slice(0, 600)}`);
        compared++;
      });
    });
  });
  ok(`drawings: ui.js + types.js draw exactly like the old screens.js (${cases.length} screens x 3 languages x 11 actions = ${compared} comparisons)`);
}
{
  // a new kind's drawing: "auto" from its flags when render leaves it out
  const space = drawingSpace('new', 'en');
  vm.runInContext(fs.readFileSync(STARS, 'utf8'), space.ctx, { filename: 'stars_1_10.js' });
  const s = starSurvey();
  const PP = space.PP;
  const steps = PP.flow.path(PP.flow.load(s), s, { facts: {} }, { answers: { stars: 4 }, texts: {}, audio: {} });
  const log = [];
  const out = PP.screens.stars_1_10({ step: steps[1], config: s, state: { answers: { stars: 4 } }, setAnswer: (id, v, adv) => log.push([id, v, adv]) });
  assert.strictEqual(out.auto, true, 'auto from flags.auto');
  const seen = JSON.parse(JSON.stringify(serialize(out.el, space.D)));
  assert.strictEqual(seen.tag, 'section');
  const buttons = [];
  (function walk(n) { if (n.listeners && n.listeners.length) buttons.push(n); (n.childNodes || []).forEach(walk); }(out.el));
  assert.strictEqual(buttons.length, 10, 'ten stars (the stand-in speaker button has no listener)');
  // two rows of five (1-5, then 6-10), so all ten fit a 360 x 740 phone without scrolling
  const rowsOf = [];
  (function walk(n) { if (/\bnps-row-b\b/.test(((n.attrs || {})['class']) || n.className || '')) rowsOf.push(n); (n.childNodes || []).forEach(walk); }(out.el));
  assert.strictEqual(rowsOf.length, 2, 'two rows: ' + JSON.stringify(seen).slice(0, 300));
  rowsOf.forEach((row, i) => assert.deepStrictEqual(row.childNodes.map((b) => b.textContent),
    [1, 2, 3, 4, 5].map((x) => String(x + 5 * i)), 'row ' + (i + 1) + ' holds five stars in order'));
  buttons[8].listeners.forEach((l) => l.fn());
  assert.deepStrictEqual(log, [['stars', 9, true]]);
  const plain = PP.types.register({ type: 'plain_note', label: 'Plain note', render: () => ({ el: space.D.createElement('p'), auto: false }) });
  assert.strictEqual(PP.screens.plain_note({}).auto, false, 'an explicit auto wins');
  assert.strictEqual(plain.end, false);
  ok('a new kind\'s drawing: PP.screens gets it on register, "auto" from flags when render leaves it out');
}

/* ---- 6. the files --------------------------------------------------------------------------------------- */
{
  let acorn = null;
  try { acorn = require(path.join(REPO, 'tests/node_modules/acorn')); } catch (e) { /* run "cd tests && npm install" */ }
  ['web/js/flow.js', 'web/js/flow-check.js', 'web/js/ui.js', 'web/js/types.js', 'tests/flow/fixtures/types/stars_1_10.js'].forEach((f) => {
    if (acorn) acorn.parse(read(f), { ecmaVersion: 5 });
  });
  assert(!fs.existsSync(path.join(REPO, 'web/js/screens.js')), 'web/js/screens.js is gone (ui.js + types.js)');
  // the form's other files no longer send readers to screens.js, except to say what it used to be
  ['web/js/core.js', 'web/js/app.js', 'web/js/net.js', 'web/index.html'].forEach((f) => {
    const src = read(f);
    for (let m, re = /screens\.js/g; (m = re.exec(src));) {
      assert(/\bwas (web\/js\/)?$/.test(src.slice(Math.max(0, m.index - 30), m.index).replace(/\s+/g, ' ')),
        `${f} still names screens.js as a current file: "...${src.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' ')}..." (it is ui.js + types.js now)`);
    }
  });
  const html = read('web/index.html').replace(/<!--[\s\S]*?-->/g, '');
  const srcs = [];
  html.replace(/<script\b([^>]*)>/gi, (m, attrs) => { const s = /src="([^"]+)"/.exec(attrs); if (s) srcs.push([s[1], /\bdefer\b/.test(attrs)]); return m; });
  assert.deepStrictEqual(srcs.map((x) => x[0]), ['js/core.js', 'js/flow.js', 'js/speech.js', 'js/voice.js', 'js/net.js', 'js/ui.js', 'js/types.js', 'js/app.js']);
  assert(srcs.every((x) => x[1]), 'every script is deferred');
  // the drawings show what the catalogue says each built-in kind shows by default
  const types = read('web/js/types.js');
  BUILTIN.forEach((t) => {
    const texts = T.get(t).texts || {};
    Object.keys(texts).forEach((f) => {
      const v = texts[f];
      if (typeof v !== 'string') return;
      const literal = v.replace('{area}', "' + fn.id + '");
      assert(types.indexOf("'" + literal + "'") !== -1, `${t}: types.js draws "${v}" by default (texts.${f})`);
    });
  });
  ok('files: ES5' + (acorn ? '' : ' (acorn not installed: skipped)') + '; index.html loads ui.js and types.js (defer) before app.js; no screens.js; default texts drawn');
}

console.log(passed, 'tests passed');

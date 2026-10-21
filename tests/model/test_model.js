/* test_model.js: tests for apps-script/Model.gs (Valmo Partner Pulse, Phase 2).
   Developer test: lives in tests/model/ and is never published (GitHub Pages
   serves only web/).

   Run (Terminal, in the project folder):
         node tests/model/test_model.js            (prints a report, exit code 1 on any failure)
         node tests/model/test_model.js --verbose  (also prints every breakage message)
   Writes: tests/model/checkcopy/ (a throw-away copy of web/ for one check; ignored by git).

   Model.gs is loaded into a Node "vm" context, the way Apps Script loads a
   .gs file into its shared global space. Google Sheets is imitated by
   fake_sheets.js (in this folder).
*/
'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FakeSpreadsheet, FakeRange, fakeSpreadsheetApp } = require('./fake_sheets');

const ROOT = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/model/)
const HERE = __dirname;
const MODEL_FILE = path.join(ROOT, 'apps-script/Model.gs');
const REPO_PATHS = {
  survey: path.join(ROOT, 'web/config/survey.json'),
  strings: path.join(ROOT, 'web/i18n/strings.json'),
  whats_changed: path.join(ROOT, 'web/config/whats_changed.json'),
  audio_clips: path.join(ROOT, 'web/config/audio_clips.json')
};
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
// A tiny test runner
// ---------------------------------------------------------------------------
const results = [];
const notes = {};      // group -> lines of information to print

function test(group, name, fn) {
  try {
    const info = fn();
    results.push({ group, name, ok: true, info });
  } catch (err) {
    results.push({ group, name, ok: false, err });
  }
}

function note(group, line) {
  (notes[group] = notes[group] || []).push(line);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const out = {};
    Object.keys(value).sort().forEach(key => { out[key] = sortKeys(value[key]); });
    return out;
  }
  return value;
}

function canon(value) {
  return JSON.stringify(sortKeys(value));
}

/** Where two JSON-like values first differ (path and both values). */
function firstDiff(a, b, where) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  const isObj = v => v && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${where}: list length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${where}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.join('|') !== kb.join('|')) {
      const onlyA = ka.filter(k => !kb.includes(k));
      const onlyB = kb.filter(k => !ka.includes(k));
      if (onlyA.length || onlyB.length) return `${where}: keys only in actual ${JSON.stringify(onlyA)}, only in expected ${JSON.stringify(onlyB)}`;
      return `${where}: key order ${JSON.stringify(ka.slice(0, 12))} vs ${JSON.stringify(kb.slice(0, 12))}`;
    }
    for (const k of ka) {
      const d = firstDiff(a[k], b[k], `${where}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

function eqJson(actual, expected, label) {
  const diff = firstDiff(actual, expected, label || '$');
  if (diff) throw new Error('not identical: ' + diff);
}

/** A deep copy in this (outer) JavaScript world. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Loading Model.gs
// ---------------------------------------------------------------------------
const consoleLines = [];
const quietConsole = {
  log: (...args) => consoleLines.push(args.join(' ')),
  error: (...args) => consoleLines.push('ERROR ' + args.join(' ')),
  warn: (...args) => consoleLines.push('WARN ' + args.join(' '))
};

function loadModel(globals) {
  const context = vm.createContext(Object.assign({ console: quietConsole }, globals || {}));
  vm.runInContext(fs.readFileSync(MODEL_FILE, 'utf8'), context, { filename: 'Model.gs' });
  return context;
}

const M = loadModel();                                            // no SpreadsheetApp (pure logic, plain sheets)
const MS = loadModel({ SpreadsheetApp: fakeSpreadsheetApp() });   // with tick boxes / drop-down lists

const RAW = {};
const FILES = {};
Object.keys(REPO_PATHS).forEach(name => {
  RAW[name] = fs.readFileSync(REPO_PATHS[name], 'utf8');
  FILES[name] = JSON.parse(RAW[name]);
});

const BASE = plain(M.PP_importStatic(FILES));
const fresh = () => plain(BASE);
const STAMP = { version: 3, published_at: '2026-10-20T20:15:00.000Z', published_by: 'tester@example.com', note: 'Test publish' };

function withoutConfigVersion(model) {
  const copy = plain(model);
  delete copy.config_version;
  return copy;
}

function screenIndex(model, id) {
  const index = model.screens.findIndex(screen => screen.id === id);
  if (index < 0) throw new Error('no screen ' + id);
  return index;
}

function newScreen(fields) {
  return Object.assign({ id: '', type: '', text: '', required: null, show_if: null, skip_if: '', options: [],
    low_label: '', high_label: '', scale_hint: '', body: '', active: true }, fields);
}

function addScreenBefore(model, beforeId, fields) {
  model.screens.splice(screenIndex(model, beforeId), 0, newScreen(fields));
}

function addText(model, key, en, others) {
  const values = {};
  model.languages.forEach(language => { values[language.code] = ''; });
  values.en = en;
  Object.assign(values, others || {});
  model.texts[key] = values;
  model.text_notes[key] = '';
}

/** Removes the notes for humans (keys starting with "_") everywhere. */
function withoutNotes(value) {
  if (Array.isArray(value)) return value.map(withoutNotes);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => { if (key.charAt(0) !== '_') out[key] = withoutNotes(value[key]); });
    return out;
  }
  return value;
}

/** survey.json minus what never comes from the Sheet: notes, backend mode/addresses, links, config_version. */
function comparableSurvey(survey) {
  const copy = withoutNotes(plain(survey));
  delete copy.config_version;
  delete copy.links;
  if (copy.backend) {
    delete copy.backend.mode;
    delete copy.backend.mock_url;
    delete copy.backend.apps_script_url;
  }
  return copy;
}

// =============================================================================
// (1) Import the four repo files, compile, compare with the repo files
// =============================================================================
const G1 = '1. import + compile vs repo files';

test(G1, 'compiled survey = web/config/survey.json (ignoring notes, backend mode/addresses, links, config_version)', () => {
  const doc = M.PP_compile(fresh(), null);
  const actual = comparableSurvey(doc.survey);
  const expected = comparableSurvey(FILES.survey);
  check(canon(actual) === canon(expected), 'differs: ' + firstDiff(sortKeys(actual), sortKeys(expected), 'survey'));
  return 'semantically identical';
});

test(G1, 'compiled strings = strings.json (without _help), identical including key order', () => {
  const doc = M.PP_compile(fresh(), null);
  eqJson(plain(doc.strings), withoutNotes(FILES.strings), 'strings');
  return Object.keys(doc.strings).length + ' texts x ' + Object.keys(doc.strings['brand.name']).length + ' languages';
});

test(G1, 'compiled whats_changed = whats_changed.json rounds, identical', () => {
  const doc = M.PP_compile(fresh(), null);
  eqJson(plain(doc.whats_changed), FILES.whats_changed.rounds, 'whats_changed');
  return 'rounds: ' + Object.keys(doc.whats_changed).join(', ');
});

test(G1, 'compiled clips = audio_clips.json clips, identical', () => {
  const doc = M.PP_compile(fresh(), null);
  eqJson(plain(doc.clips), FILES.audio_clips.clips, 'clips');
});

test(G1, 'draft document shape: format 1, version null, config_version "draft", no stamp', () => {
  const doc = plain(M.PP_compile(fresh(), null));
  eqJson(Object.keys(doc), ['format', 'version', 'config_version', 'published_at', 'published_by', 'note', 'survey', 'strings', 'whats_changed', 'clips']);
  check(doc.format === 1 && doc.version === null && doc.config_version === 'draft' && doc.survey.config_version === 'draft', JSON.stringify(doc).slice(0, 200));
  check(doc.published_at === null && doc.published_by === null && doc.note === null, 'stamp fields should be null');
  check(!('form_url' in doc.survey) && !('links' in doc.survey), 'form_url and links must not be compiled');
  eqJson(Object.keys(doc.survey.backend), ['request_timeout_seconds', 'slow_upload_bytes_per_second', 'retry_delays_seconds']);
});

test(G1, 'published stamp: config_version "p3-2026-10-21" (India date of 2026-10-20T20:15Z)', () => {
  const doc = plain(M.PP_compile(fresh(), STAMP));
  check(doc.config_version === 'p3-2026-10-21', doc.config_version);
  check(doc.survey.config_version === 'p3-2026-10-21', doc.survey.config_version);
  check(doc.version === 3 && doc.published_at === STAMP.published_at && doc.published_by === STAMP.published_by && doc.note === STAMP.note, 'stamp');
  const early = plain(M.PP_compile(fresh(), Object.assign({}, STAMP, { published_at: '2026-10-20T18:29:59.000Z' })));
  check(early.config_version === 'p3-2026-10-20', early.config_version);
  const asDate = plain(M.PP_compile(fresh(), Object.assign({}, STAMP, { published_at: new Date('2026-10-20T18:30:00.000Z') })));
  check(asDate.config_version === 'p3-2026-10-21' && asDate.published_at === '2026-10-20T18:30:00.000Z', JSON.stringify([asDate.config_version, asDate.published_at]));
  return doc.config_version;
});

test(G1, 'compile is deterministic (same model -> same JSON)', () => {
  const a = JSON.stringify(M.PP_compile(fresh(), STAMP));
  const b = JSON.stringify(M.PP_compile(JSON.parse(JSON.stringify(BASE)), STAMP));
  check(a === b, 'two compiles differ');
  return a.length + ' characters';
});

test(G1, 'the compiled survey runs in the form\'s own flow.js (buildSteps / canProceed)', () => {
  const flow = require(path.join(ROOT, 'web/js/flow.js'));
  const survey = plain(M.PP_compile(fresh(), null)).survey;
  const steps = flow.buildSteps(survey, { answers: { support_gate: 'yes', 'fn_rating:payments': 2 }, langInUrl: false, hasWhatsChanged: true });
  const ids = steps.map(step => step.id);
  check(ids[0] === 'language' && ids.includes('fn_deep_dive:payments') && ids.includes('support') && ids[ids.length - 1] === 'thanks', ids.join(','));
  return steps.length + ' steps: ' + ids.join(', ');
});

// =============================================================================
// (2) Export back to the repo formats
// =============================================================================
const G2 = '2. export vs repo files';

function lineDiff(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  const out = [];
  const length = Math.max(a.length, e.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== e[i]) out.push({ line: i + 1, exported: a[i], repo: e[i] });
  }
  return out;
}

test(G2, 'strings.json byte-identical', () => {
  const out = M.PP_exportStatic(fresh(), { apps_script_url: '' });
  check(out['strings.json'] === RAW.strings, 'differs: ' + JSON.stringify(lineDiff(out['strings.json'], RAW.strings).slice(0, 3)));
  return Buffer.byteLength(out['strings.json']) + ' bytes';
});

test(G2, 'whats_changed.json byte-identical', () => {
  const out = M.PP_exportStatic(fresh(), { apps_script_url: '' });
  check(out['whats_changed.json'] === RAW.whats_changed, 'differs: ' + JSON.stringify(lineDiff(out['whats_changed.json'], RAW.whats_changed).slice(0, 3)));
  return Buffer.byteLength(out['whats_changed.json']) + ' bytes';
});

test(G2, 'audio_clips.json byte-identical', () => {
  const out = M.PP_exportStatic(fresh(), { apps_script_url: '' });
  check(out['audio_clips.json'] === RAW.audio_clips, 'differs: ' + JSON.stringify(lineDiff(out['audio_clips.json'], RAW.audio_clips)));
  return Buffer.byteLength(out['audio_clips.json']) + ' bytes';
});

test(G2, 'survey.json byte-identical without a web app address (test mode "mock", as in the repo)', () => {
  // 21 Oct 2026 (STATE item 3): without an address the copy stays in test mode,
  // so it passes the settings check; before, it said "apps_script" with "".
  const out = M.PP_exportStatic(fresh(), { apps_script_url: '' });
  const diff = lineDiff(out['survey.json'], RAW.survey);
  diff.forEach(d => note(G2, `survey.json line ${d.line}: repo ${JSON.stringify(d.repo)}  ->  export ${JSON.stringify(d.exported)}`));
  check(diff.length === 0, diff.length + ' lines differ: ' + JSON.stringify(diff.slice(0, 4)));
  return 'identical, including "mode": "mock"';
});

test(G2, 'export with an /exec address and an explicit config_version; files parse as JSON', () => {
  const url = 'https://script.google.com/macros/s/FAKE-DEPLOYMENT-ID/exec';
  const out = M.PP_exportStatic(fresh(), { apps_script_url: url, config_version: 'p7-2026-10-21' });
  const survey = JSON.parse(out['survey.json']);
  check(survey.backend.mode === 'apps_script' && survey.backend.apps_script_url === url && survey.backend.mock_url === '/api', JSON.stringify(survey.backend));
  check(survey.config_version === 'p7-2026-10-21', survey.config_version);
  eqJson(survey.links, FILES.survey.links, 'links');
  ['strings.json', 'whats_changed.json', 'audio_clips.json'].forEach(name => JSON.parse(out[name]));
  const noVersion = JSON.parse(M.PP_exportStatic(withoutConfigVersion(BASE), {})['survey.json']);
  check(noVersion.config_version === 'draft', 'a model without a remembered version exports "draft": ' + noVersion.config_version);
});

test(G2, 'export leaves out hidden items, keeps alignment with an extra threshold and a choice screen', () => {
  const m = fresh();
  m.areas[1].threshold = 2;                               // payments
  m.chips.find(c => c.code === 'invoice_gst').active = false;
  m.languages.find(l => l.code === 'ml').active = false;
  addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix', options: ['owner', 'manager'], required: false });
  addText(m, 'choice.role.owner', 'Owner', { hi: 'मालिक' });
  addText(m, 'choice.role.manager', 'Manager', { hi: 'मैनेजर' });
  const out = M.PP_exportStatic(m, { apps_script_url: '' });
  const survey = JSON.parse(out['survey.json']);
  check(survey.languages.length === 5 && !out['strings.json'].includes('"ml":'), 'hidden language left out');
  check(!survey.functions[1].issues.includes('invoice_gst') && survey.functions[1].threshold === 2, JSON.stringify(survey.functions[1]));
  const lines = out['survey.json'].split('\n');
  const payments = lines.find(line => line.includes('"payments"'));
  const role = lines.find(line => line.includes('"role"'));
  check(payments === '    { "id": "payments",    "issues": ["payout_delayed", "short_payment", "unclear_breakup", "incentive_missing"], "threshold": 2 },', payments);
  check(role === '    { "id": "role",          "type": "single_choice",   "text": "q.one_fix", "options": ["owner", "manager"], "required": false },', role);
  return 'sample lines:\n      ' + payments + '\n      ' + role;
});

test(G2, 'end-to-end: exported files pass scripts/check_config.py (copy of web/ in tests/model/checkcopy)', () => {
  const copyRoot = path.join(HERE, 'checkcopy');
  fs.rmSync(copyRoot, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'web'), path.join(copyRoot, 'web'), { recursive: true });
  const out = M.PP_exportStatic(fresh(), { apps_script_url: 'https://script.google.com/macros/s/FAKE-DEPLOYMENT-ID/exec' });
  fs.writeFileSync(path.join(copyRoot, 'web/config/survey.json'), out['survey.json']);
  fs.writeFileSync(path.join(copyRoot, 'web/i18n/strings.json'), out['strings.json']);
  fs.writeFileSync(path.join(copyRoot, 'web/config/whats_changed.json'), out['whats_changed.json']);
  fs.writeFileSync(path.join(copyRoot, 'web/config/audio_clips.json'), out['audio_clips.json']);
  let output;
  let code = 0;
  try {
    output = execFileSync('python3', [path.join(ROOT, 'scripts/check_config.py'), '--root', copyRoot], { encoding: 'utf8' });
  } catch (err) {
    code = err.status;
    output = String(err.stdout || '') + String(err.stderr || '');
  }
  const found = (output.match(/Found: .*/) || ['?'])[0];
  note(G2, 'check_config.py on the exported copy: ' + found.trim() + ' (exit code ' + code + ')');
  check(code === 0, 'check_config.py failed:\n' + output.split('\n').slice(0, 30).join('\n'));
  return found.trim();
});

// =============================================================================
// (3) Validate the imported model
// =============================================================================
const G3 = '3. validate the imported model';

test(G3, '0 errors; warnings listed below', () => {
  const result = plain(M.PP_validate(fresh(), null));
  result.warnings.forEach(w => note(G3, `WARNING [${w.section} | ${w.ref}] ${w.message}`));
  note(G3, 'summary: ' + JSON.stringify(result.summary));
  check(result.errors.length === 0, result.errors.length + ' errors: ' + JSON.stringify(result.errors.slice(0, 3), null, 1));
  return `${result.errors.length} errors, ${result.warnings.length} warnings`;
});

test(G3, 'summary counts', () => {
  const s = plain(M.PP_validate(fresh(), null)).summary;
  check(s.screens === 9 && s.areas === 6 && s.chips === 30 && s.support === 4, JSON.stringify(s));
  check(s.languages.length === 6 && s.languages[0].code === 'en' && s.languages[0].untranslated === 0 && s.languages[1].untranslated === 0, JSON.stringify(s.languages));
  check(s.languages[2].untranslated === s.languages[2].total && s.compiled_chars > 1000 && s.compiled_chars < 200000, JSON.stringify(s));
});

test(G3, 'validating the live version itself gives no "live code missing" warnings', () => {
  const live = M.PP_compile(fresh(), STAMP);
  const result = plain(M.PP_validate(fresh(), live));
  check(!result.warnings.some(w => /live today/.test(w.message)), JSON.stringify(result.warnings));
});

// =============================================================================
// (4) Deliberate breakages, each must give the right error
// =============================================================================
const G4 = '4. deliberate breakages';

const BREAKAGES = [
  // ---- Screens
  ['duplicate screen id', m => { m.screens[2].id = 'language'; }, 'screens', 'screen 3', /^Question 3 \("How likely are you to recommend Valmo to another DC owner\?"\) has the same code as question 1 \(Language buttons\)\..*\(The code is "language"\.\)$/],
  ['invalid screen id', m => { m.screens[7].id = 'One Fix'; }, 'screens', 'screen 8', /^Question 8 \("If Valmo could fix just one thing for you, what should it be\?"\) has a code that is not allowed: use only lowercase.*\(Its code is "One Fix"; "one_fix" would work\.\)$/],
  ['screen without id', m => { m.screens[7].id = ''; }, 'screens', 'screen 8', /^Question 8 \("If Valmo could fix.*"\) has no code\. Give it one/],
  ['unknown screen type (typo)', m => { m.screens[2].type = 'nps_0_11'; }, 'screens', 'screen 3', /is a kind of screen the form does not know\..*\(Its type is "nps_0_11"\. Did you mean "nps_0_10"\?/],
  ['built-in type used twice', m => { addScreenBefore(m, 'thanks', { id: 'support2', type: 'support_block', text: 'q.support_block' }); }, 'screens', 'screen 9', /already a "Support ratings" screen \(question 7\)/],
  ['thank-you screen not last', m => { const t = m.screens.splice(8, 1)[0]; m.screens.splice(7, 0, t); }, 'screens', 'screen 8', /The thank-you screen \(question 8\) must be the last one, but 1 question comes after it/],
  ['thank-you screen missing', m => { m.screens.splice(8, 1); }, 'screens', '', /There is no thank-you screen/],
  ['thank-you screen hidden', m => { m.screens[8].active = false; }, 'screens', 'screen 9', /The thank-you screen \(question 9\) is hidden/],
  ['problem screens before area ratings', m => { const d = m.screens.splice(4, 1)[0]; m.screens.splice(3, 0, d); }, 'screens', 'screen 4', /The problem screens \(question 4\) must come after the area ratings \(question 5\)/],
  ['problem screens without area ratings', m => { m.screens[3].active = false; }, 'screens', 'screen 5', /The problem screens \(question 5\) ask about areas rated low, but the area ratings screen is missing or hidden/],
  ['question without its text', m => { m.screens[2].text = ''; }, 'screens', 'screen 3', /^Question 3 \(0 to 10 question\) has no question text/],
  ['support block without its text', m => { m.screens[6].text = ''; }, 'screens', 'screen 7', /^Question 7 \(Support ratings\) has no question text/],
  ['pick-one question without options', m => { addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix' }); }, 'screens', 'screen 9', /is a "pick one" question with no answers to pick from/],
  ['pick-one option listed twice', m => { addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix', options: ['owner', 'owner'] }); addText(m, 'choice.role.owner', 'Owner'); }, 'screens', 'screen 9', /the answer "Owner" is listed twice\..*\(Its code is "owner"\.\)/],
  ['pick-one option with a bad code', m => { addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix', options: ['Owner'] }); }, 'screens', 'screen 9', /one of its answers has a code that is not allowed: use .*\(The answer code is "Owner"; "owner" would work\.\)/],
  ['skip_if on an ordinary question', m => { m.screens[2].skip_if = 'empty'; }, 'screens', 'screen 3', /is set to be skipped, but only the language buttons and the "What changed" card can be skipped/],
  ['wrong skip_if on the language screen', m => { m.screens[0].skip_if = 'empty'; }, 'screens', 'screen 1', /^Question 1 \(Language buttons\) has a skip setting the form does not know\. Choose "Skip this screen when the partner’s link already says the language"/],
  ['wrong skip_if on the What changed screen', m => { m.screens[1].skip_if = 'lang_in_url'; }, 'screens', 'screen 2', /^Question 2 \("What changed" card\) has a skip setting the form does not know\. Choose "Skip this screen when the round has nothing to show"/],
  ['"required" neither TRUE nor FALSE', m => { m.screens[7].required = 'maybe'; }, 'screens', 'screen 8', /has "required" set to "maybe"/],
  // ---- Rules
  ['rule with two tests', m => { m.screens[6].show_if = { answer: 'support_gate', equals: 'yes', not_equals: 'no' }; }, 'screens', 'screen 7', /the rule must have exactly one test for its answer.*it has 2\..*\(The tests it has: equals, not_equals\.\)/],
  ['empty "all of these" group', m => { m.screens[6].show_if = { all: [] }; }, 'screens', 'screen 7', /empty "all of these" group/],
  ['rule mixing "all" with a test', m => { m.screens[6].show_if = { all: [{ answer: 'nps', at_most: 6 }], answer: 'nps' }; }, 'screens', 'screen 7', /mixes "all of these"/],
  ['rule without "answer"', m => { m.screens[6].show_if = { equals: 'yes' }; }, 'screens', 'screen 7', /the rule does not say which earlier answer it tests/],
  ['rule on an unknown screen', m => { m.screens[6].show_if = { answer: 'support_gat', equals: 'yes' }; }, 'screens', 'screen 7', /the rule tests an answer that does not exist.*\(It tests "support_gat"\. Did you mean "support_gate"\?\)/],
  ['rule on a later screen', m => { m.screens[2].show_if = { answer: 'support_gate', equals: 'yes' }; }, 'screens', 'screen 3', /tests the answer to question 6 \("In the last 30 days, did you contact Valmo support\?"\), which comes later/],
  ['rule on a hidden screen', m => { m.screens[5].active = false; }, 'screens', 'screen 7', /tests the answer to question 6 \("In the last 30 days.*"\), which is hidden/],
  ['rule on its own answer', m => { m.screens[5].show_if = { answer: 'support_gate', equals: 'yes' }; }, 'screens', 'screen 6', /cannot depend on its own answer/],
  ['free-text answer tested without "answered"', m => { addScreenBefore(m, 'thanks', { id: 'follow_up', type: 'yes_no', text: 'q.support_gate', required: true, show_if: { answer: 'one_fix', equals: 'yes' } }); }, 'screens', 'screen 9', /tests the answer to question 8 \("If Valmo could fix.*"\), which is a voice note or typed answer, so it can only use "was answered"/],
  ['"answered" written in quotes', m => { addScreenBefore(m, 'thanks', { id: 'follow_up', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'one_fix', answered: 'true' } }); }, 'screens', 'screen 9', /uses "was answered" with "true"\. It must be true or false/],
  ['rule on an unknown area', m => { m.screens[6].show_if = { answer: 'fn_rating:payment', at_most: 2 }; }, 'screens', 'screen 7', /tests an area that does not exist\..*"fn_rating:payment".*Did you mean "payments"\?/],
  ['rule on a hidden area', m => { m.areas[1].active = false; m.screens[6].show_if = { answer: 'fn_rating:payments', at_most: 2 }; }, 'screens', 'screen 7', /tests the rating of the area "Payments \/ Payouts", but that area is hidden/],
  ['rule on a support rating before the support screen', m => { addScreenBefore(m, 'support', { id: 'early', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'support:kept_updated', at_most: 2 } }); }, 'screens', 'screen 7', /the rating of the support question "Kept me updated", but the "Support ratings" screen comes later \(question 8\)/],
  ['rule on a problem picked before the problem screens', m => { addScreenBefore(m, 'fn_deep_dives', { id: 'pay_check', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'fn_deep_dive:payments', equals: 'payout_delayed' } }); }, 'screens', 'screen 5', /the problem picked for the area "Payments \/ Payouts", but the "Problem screens" screen comes later \(question 6\)/],
  ['rule value with wrong capital letters', m => { m.screens[6].show_if = { answer: 'support_gate', equals: 'Yes' }; }, 'screens', 'screen 7', /can only be "yes" or "no", so "Yes" can never match\. Capital letters matter/],
  ['number test on a yes/no answer', m => { m.screens[6].show_if = { answer: 'support_gate', at_most: 1 }; }, 'screens', 'screen 7', /uses "is at most", which compares numbers, but the answer to question 6 \("In the last 30 days.*"\) is never a number/],
  ['number test with text', m => { m.screens[6].show_if = { answer: 'nps', at_most: 'six' }; }, 'screens', 'screen 7', /needs a number/],
  ['"is one of" without a list', m => { m.screens[6].show_if = { answer: 'support_gate', in: 'yes' }; }, 'screens', 'screen 7', /needs a list of possible answers/],
  ['impossible problem code', m => { m.screens[6].show_if = { answer: 'fn_deep_dive:payments', equals: 'late_payout' }; }, 'screens', 'screen 7', /the problem picked for the area "Payments \/ Payouts", but "late_payout" is not one of its answers, so the rule can never match\..*\(Its answers are "payout_delayed", .* or "other"\.\)/],
  ['unknown test name', m => { m.screens[6].show_if = { answer: 'nps', at_mostt: 6 }; }, 'screens', 'screen 7', /uses a test the form does not know\..*\(It uses "at_mostt"\. Did you mean "at_most"\?/],
  ['unreadable rule text (from the Screens tab)', m => { m.screens[6].show_if = '{"answer": "support_gate", equals: yes}'; }, 'screens', 'screen 7', /could not be read/],
  ['rule testing an information card', m => { addScreenBefore(m, 'thanks', { id: 'card', type: 'info_card', text: 'q.one_fix' }); addScreenBefore(m, 'thanks', { id: 'after_card', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'card', answered: true } }); }, 'screens', 'screen 10', /tests question 9 \("If Valmo could fix.*"\) \(it is a screen of the kind "Information card"\), which does not record an answer/],
  ['rule on the support comment while the comment box is off', m => { m.settings['support.allow_comment'] = false; addScreenBefore(m, 'thanks', { id: 'follow_up', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'support_comment', answered: true } }); }, 'screens', 'screen 9', /comment box is switched off/],
  ['nested rule problem', m => { m.screens[6].show_if = { any: [{ answer: 'support_gate', equals: 'yes' }, { answer: 'nps', at_most: 'low' }] }; }, 'screens', 'screen 7', /condition 2 of the rule uses "is at most" with "low", but it needs a number/],
  // ---- Areas, problems, support
  ['area listed twice', m => { m.areas[1].id = 'losses'; }, 'areas', 'losses', /^The area "Losses & Debits" is listed twice\..*\(Its code is "losses"\.\)$/],
  ['invalid area code', m => { m.areas[1].id = 'Payments'; }, 'areas', 'Payments', /^Area 2 has a code that is not allowed: use .*\(Its code is "Payments"; "payments" would work\.\)$/],
  ['threshold 7', m => { m.areas[0].threshold = 7; }, 'areas', 'losses', /low-rating number of the area "Losses & Debits" is 7\. Leave it empty to use the standard \(3\)/],
  ['threshold that is not a number', m => { m.areas[0].threshold = 'two'; }, 'areas', 'losses', /is "two"/],
  ['no area switched on while area ratings are on', m => { m.areas.forEach(a => { a.active = false; }); }, 'areas', '', /area ratings screen is switched on, but no area is/],
  ['problem in an unknown area', m => { m.chips[0].area = 'loss'; }, 'chips', 'loss/wrong_debit', /belongs to an area that does not exist\..*\(Its area code is "loss" and its own code is "wrong_debit"\. Did you mean "losses" \(the area "Losses & Debits"\)\?\)/],
  ['problem code "other"', m => { m.chips[0].code = 'other'; }, 'chips', 'losses/other', /is an extra "Other" button\. Delete it/],
  ['problem listed twice', m => { m.chips[1].code = 'wrong_debit'; }, 'chips', 'losses/wrong_debit', /^The problem "Wrong debit raised" is listed twice in the area "Losses & Debits"\./],
  ['invalid problem code', m => { m.chips[0].code = 'Wrong Debit'; }, 'chips', 'losses/Wrong Debit', /^Problem 1 of the area "Losses & Debits" has a code that is not allowed: use .*\(Its code is "Wrong Debit"; "wrong_debit" would work\.\)$/],
  ['invalid support code', m => { m.support[0].code = 'Agent Behaviour'; }, 'support', 'Agent Behaviour', /^Support question 1 has a code that is not allowed: use .*\(Its code is "Agent Behaviour"; "agent_behaviour" would work\.\)$/],
  ['support code listed twice', m => { m.support[1].code = 'agent_behaviour'; }, 'support', 'agent_behaviour', /listed twice/],
  // ---- Languages
  ['invalid language code', m => { m.languages[2].code = 'TA1'; }, 'languages', 'TA1', /^The code of language 3 \(தமிழ்\) is not allowed: use .*\(Right now it is "TA1"; for example "ta" stands for Tamil\.\)$/],
  ['language listed twice', m => { m.languages[2].code = 'hi'; }, 'languages', 'hi', /^Hindi is listed twice in the language list/],
  ['language without its own-script name', m => { m.languages[2].native_name = ''; }, 'languages', 'ta', /^Tamil needs its name written in its own script/],
  ['language without voice tag', m => { m.languages[2].bcp47 = ''; }, 'languages', 'ta', /^Tamil needs its voice tag, such as "ta-IN"/],
  ['no language switched on', m => { m.languages.forEach(l => { l.active = false; }); }, 'languages', '', /No language is switched on/],
  ['English removed from the language list', m => { m.languages.splice(0, 1); m.settings.default_language = 'hi'; m.settings.fallback_language = 'hi'; }, 'languages', 'en', /^English is not in the language list\./],
  // ---- Settings
  ['bad colour', m => { m.settings['branding.colors.primary'] = '#4B2E8'; }, 'settings', 'Settings > branding.colors.primary', /"Main colour" must be a colour code like "#4B2E83"/],
  ['number out of range', m => { m.settings['voice.max_seconds'] = 400; }, 'settings', 'Settings > voice.max_seconds', /whole number from 5 to 300.*Right now it is 400/],
  ['text in a number setting', m => { m.settings['text.max_chars'] = 'lots'; }, 'settings', 'Settings > text.max_chars', /whole number from 50 to 10000.*"lots"/],
  ['on/off setting written as text', m => { m.settings['navigation.auto_advance'] = 'yes'; }, 'settings', 'Settings > navigation.auto_advance', /must be on or off/],
  ['starting language switched off', m => { m.languages[2].active = false; m.settings.default_language = 'ta'; }, 'settings', 'Settings > default_language', /a language that is switched on: English, Hindi, Telugu, Kannada or Malayalam\. Right now it is Tamil, which is switched off\./],
  ['backup language not in the list', m => { m.settings.fallback_language = 'mr'; }, 'settings', 'Settings > fallback_language', /switched on/],
  ['four faces', m => { m.settings['rating.faces'] = '😠 🙁 😐 🙂'; }, 'settings', 'Settings > rating.faces', /exactly 5 faces .* there are 4/],
  ['form address without https', m => { m.settings.form_url = 'http://example.org/form/'; }, 'settings', 'Settings > form_url', /starts with https:\/\/ and ends with \//],
  ['form address without the final /', m => { m.settings.form_url = 'https://pranavakellaps37.github.io/NPS-Form-'; }, 'settings', 'Settings > form_url', /ends with \//],
  ['comment question text missing', m => { m.settings['support.comment_text'] = 'q.support_note'; }, 'settings', 'Settings > support.comment_text', /names a text that is not in Texts & translations\..*\(The missing text is called "q\.support_note"\.\)/],
  ['shortest voice note not below the longest', m => { m.settings['voice.min_seconds'] = 60; }, 'settings', 'Settings > voice.min_seconds', /must be shorter than the longest voice note/],
  ['retry waits with junk', m => { m.settings['backend.retry_delays_seconds'] = '2, 0, x'; }, 'settings', 'Settings > backend.retry_delays_seconds', /These are not: 0, x/],
  ['too many retry waits', m => { m.settings['backend.retry_delays_seconds'] = Array(21).fill('5').join(', '); }, 'settings', 'Settings > backend.retry_delays_seconds', /1 to 20 numbers .* there are 21/],
  ['invalid survey code', m => { m.settings.survey_id = 'Valmo Pulse'; }, 'settings', 'Settings > survey_id', /lowercase letters/],
  ['unknown choice', m => { m.settings['deep_dive.when'] = 'later'; }, 'settings', 'Settings > deep_dive.when', /must be "After all the area ratings" or "Straight after each low rating"\. Right now it is "later"\. \(In the Settings tab: after_all_ratings or immediate\.\)/],
  ['logo outside the web folder', m => { m.settings['branding.logo'] = '../logo.png'; }, 'settings', 'Settings > branding.logo', /inside the web folder/],
  ['logo over plain http', m => { m.settings['branding.logo'] = 'http://example.org/logo.png'; }, 'settings', 'Settings > branding.logo', /https:\/\/ address/],
  ['empty audio formats', m => { m.settings['voice.mime_types'] = ' , '; }, 'settings', 'Settings > voice.mime_types', /needs at least one entry/],
  // ---- Texts
  ['missing text of an area', m => { delete m.texts['fn.payments.name']; }, 'texts', 'fn.payments.name', /^A text is missing: the name of area 2\..*\(Its name there must be "fn\.payments\.name"\.\)$/],
  ['missing text the form needs', m => { delete m.texts['ui.next']; }, 'texts', 'ui.next', /^A text is missing: one of the form's own texts \(its buttons and messages\)\..*"ui\.next"/],
  ['missing label of a pick-one answer', m => { addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix', options: ['owner'] }); }, 'texts', 'choice.role.owner', /^A text is missing: the label of answer 1 of question 9 \(/],
  ['renamed area code, texts not renamed', m => { m.areas[5].id = 'tech'; m.chips.forEach(c => { if (c.area === 'app') c.area = 'tech'; }); }, 'texts', 'fn.tech.name', /Did you rename a code\? Then give the old text "fn\.app\.name" this name\./],
  ['[TRANSLATE] left in English', m => { m.texts['ui.back'].en = '[TRANSLATE] Back'; }, 'texts', 'ui.back', /^The English text "\[TRANSLATE\] Back" still has the \[TRANSLATE\] tag\..*\(Text name: "ui\.back"\.\)$/],
  ['empty English', m => { m.texts['ui.back'].en = ''; }, 'texts', 'ui.back', /^One of the form's own texts \(its buttons and messages\) has no English\..*\(Text name: "ui\.back"\.\)$/],
  ['{s} dropped in Hindi', m => { m.texts['voice.seconds_left'].hi = 'सेकंड बाकी'; }, 'texts', 'voice.seconds_left (hi)', /^The Hindi version of "\{s\} s left" is missing \{s\}\./],
  ['{n} added in Hindi', m => { m.texts['ui.next'].hi = '{n} आगे'; }, 'texts', 'ui.next (hi)', /^The Hindi version of "Next" has \{n\}, which the English does not have/],
  ['backup language still marked [TRANSLATE]', m => { m.settings.fallback_language = 'hi'; m.texts['ui.next'].hi = '[TRANSLATE] Next'; }, 'texts', 'ui.next', /^The Hindi version of "Next" still has the \[TRANSLATE\] tag\. Hindi is the backup language/],
  ['backup language empty', m => { m.settings.fallback_language = 'hi'; m.texts['ui.next'].hi = ''; }, 'texts', 'ui.next', /^The Hindi version of "Next" is empty\. Hindi is the backup language/],
  // ---- What changed, rounds, size
  ['What changed item without English', m => { m.whats_changed['DEMO-R1'][0].en = ''; }, 'whats_changed', 'DEMO-R1 item 1', /^Item 1 of "What changed" for the round "DEMO-R1" has no English\./],
  ['What changed item with [TRANSLATE] in English', m => { m.whats_changed['DEMO-R1'][1].en = '[TRANSLATE] x'; }, 'whats_changed', 'DEMO-R1 item 2', /^The English of item 2 of "What changed" for the round "DEMO-R1" still has the \[TRANSLATE\] tag/],
  ['bad round code in What changed', m => { m.whats_changed['2026 R1'] = [{ en: 'Faster payouts', hi: '', ta: '', te: '', kn: '', ml: '' }]; }, 'whats_changed', '2026 R1', /^The round "2026 R1" in What changed has a name that is not allowed/],
  ['bad round code in Rounds', m => { m.rounds.push({ id: '2026 R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' }); }, 'rounds', '2026 R2', /^The round "2026 R2" has a name that is not allowed/],
  ['questionnaire too big to download', m => { addText(m, 'huge.text', 'x'.repeat(210000)); }, 'texts', '', /more than the limit of 200000/]
];

BREAKAGES.forEach(([name, mutate, section, ref, pattern]) => {
  test(G4, name, () => {
    const m = fresh();
    mutate(m);
    const result = plain(M.PP_validate(m, null));
    const hit = result.errors.find(e => e.section === section && (ref === undefined || e.ref === ref) && pattern.test(e.message));
    if (!hit) {
      throw new Error(`expected an error [${section} | ${ref}] matching ${pattern}; got:\n      ` +
        result.errors.map(e => `[${e.section} | ${e.ref}] ${e.message}`).join('\n      '));
    }
    return `[${hit.section} | ${hit.ref}] ${hit.message}` + (result.errors.length > 1 ? `  (+${result.errors.length - 1} more)` : '');
  });
});

test(G4, 'the unchanged model still has no errors after all those copies (no shared state)', () => {
  check(plain(M.PP_validate(fresh(), null)).errors.length === 0, 'baseline broke');
});

// Warnings (never block Publish)
const WARNINGS = [
  ['area with 3 problems', m => { m.chips.filter(c => c.area === 'losses').slice(0, 2).forEach(c => { c.active = false; }); }, 'chips', 'losses', /^The area "Losses & Debits" has 3 problems switched on/],
  ['open DEMO round', m => { m.rounds[0].status = 'open'; }, 'rounds', 'DEMO-R1', /is OPEN, but its name contains DEMO/],
  ['[SAMPLE] left in a real round', m => { m.whats_changed['2026-R1'] = [{ en: '[SAMPLE] Faster payouts', hi: 'तेज़ पेआउट', ta: '', te: '', kn: '', ml: '' }]; }, 'whats_changed', '2026-R1 item 1', /\[SAMPLE\]/],
  ['text nothing uses', m => { addText(m, 'old.thing', 'Old thing'); }, 'texts', 'old.thing', /^1 text is not used by any question, area, problem, support question or the form itself.*\(Text name: "old\.thing"\.\)$/],
  ['rule that lets every answer through', m => { m.screens[6].show_if = { answer: 'nps', at_most: 10 }; }, 'screens', 'screen 7', /lets every answer through/],
  ['support screen with no support question', m => { m.support.forEach(s => { s.active = false; }); }, 'support', '', /no support question is/],
  ['odd voice tag', m => { m.languages[2].bcp47 = 'ta_IN'; }, 'languages', 'ta', /does not look like a language tag/]
];

WARNINGS.forEach(([name, mutate, section, ref, pattern]) => {
  test(G4, 'warning: ' + name, () => {
    const m = fresh();
    mutate(m);
    const result = plain(M.PP_validate(m, null));
    const hit = result.warnings.find(w => w.section === section && w.ref === ref && pattern.test(w.message));
    if (!hit) throw new Error(`expected a warning [${section} | ${ref}] ${pattern}; got:\n      ` + result.warnings.map(w => `[${w.section} | ${w.ref}] ${w.message}`).join('\n      '));
    check(result.errors.length === 0, 'unexpected errors: ' + JSON.stringify(result.errors));
    return `[${hit.section} | ${hit.ref}] ${hit.message}`;
  });
});

/** A message without its closing "( ... )" group (one level of brackets inside it is allowed). */
function withoutClosingBracket(message) {
  return message.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '');
}

test(G4, 'every message says "question N" (never "screen N") and mentions codes only in the closing brackets', () => {
  const problems = [];
  let count = 0;
  BREAKAGES.concat(WARNINGS).forEach(([name, mutate]) => {
    const m = fresh();
    mutate(m);
    const tidy = plain(M.PP_normalizeModel(m));
    const result = plain(M.PP_validate(m, null));
    result.errors.concat(result.warnings).forEach(issue => {
      count++;
      const message = issue.message;
      if (/\bscreen \d/i.test(message)) problems.push(name + ': says "screen N": ' + message);
      if (/undefined|NaN|\[object Object\]/.test(message)) problems.push(name + ': not plain English: ' + message);
      const codes = [];
      if (['areas', 'support', 'languages'].indexOf(issue.section) !== -1 && !/^(area|language) \d/.test(issue.ref)) codes.push(issue.ref);
      if (issue.section === 'chips') issue.ref.split('/').forEach(part => { if (part !== '?' && !/^problem \d/.test(part)) codes.push(part); });
      const screen = /^screen (\d+)$/.exec(issue.ref);
      if (screen && tidy.screens[Number(screen[1]) - 1]) codes.push(tidy.screens[Number(screen[1]) - 1].id);
      const body = withoutClosingBracket(message);
      codes.filter(Boolean).forEach(code => {
        if (body.indexOf('"' + code + '"') !== -1) problems.push(name + ': code "' + code + '" outside the closing brackets: ' + message);
      });
    });
  });
  check(!problems.length, problems.length + ' problems:\n      ' + problems.slice(0, 8).join('\n      '));
  return count + ' messages checked';
});

test(G4, 'warning: codes live today but missing from the draft (hidden ones do not count)', () => {
  const live = M.PP_compile(fresh(), STAMP);
  const m = fresh();
  m.areas = m.areas.filter(a => a.id !== 'orders');                       // deleted area
  m.chips = m.chips.filter(c => c.area !== 'orders' && c.code !== 'invoice_gst');
  m.support = m.support.filter(s => s.code !== 'kept_updated');
  m.screens = m.screens.filter(s => s.id !== 'one_fix');
  m.chips.find(c => c.code === 'late_supply').active = false;              // hidden: fine
  const result = plain(M.PP_validate(m, live));
  const live_ = result.warnings.filter(w => /live today but is no longer in the draft/.test(w.message));
  const refs = live_.map(w => w.section + ':' + w.ref).sort();
  eqJson(refs, ['areas:orders', 'chips:payments/invoice_gst', 'screens:one_fix', 'support:kept_updated'], 'live warnings');
  check(/rename|change the label/.test(live_[0].message), live_[0].message);
  return live_.map(w => w.message).join('\n      ');
});

test(G4, 'hidden items keep their texts "in use" (no unused-text warning)', () => {
  const m = fresh();
  m.areas[0].active = false;
  m.screens[7].active = false;
  const result = plain(M.PP_validate(m, null));
  check(!result.warnings.some(w => /not used by/.test(w.message)), JSON.stringify(result.warnings.filter(w => /not used/.test(w.message))));
});

// =============================================================================
// (5) Write to a (fake) Sheet and read back
// =============================================================================
const G5 = '5. write + read round trip (fake Sheet)';

/** A richer model: hidden things, odd text, rules, a 7th language, rounds with dates. */
function richModel() {
  const m = fresh();
  delete m.config_version;
  m.languages.push({ code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: false });
  Object.keys(m.texts).forEach(key => { m.texts[key].mr = ''; });
  m.texts['ui.next'].mr = 'पुढे';
  m.areas[1].threshold = 2;
  m.areas.push({ id: 'returns', threshold: null, active: false });
  m.chips.push({ area: 'returns', code: 'late_pickup', active: true });
  m.chips.push({ area: 'returns', code: 'no_label', active: false });
  m.chips.find(c => c.code === 'invoice_gst').active = false;
  m.support[3].active = false;
  m.settings['rating.faces'] = '1 2 3 4 5';
  m.settings['voice.max_seconds'] = 45;
  m.settings['voice.min_seconds'] = 1.5;
  m.settings['backend.retry_delays_seconds'] = '3, 9, 27';
  m.settings['voice.mime_types'] = 'audio/webm, audio/mp4';
  m.settings['navigation.auto_advance'] = false;
  m.settings['branding.logo'] = 'assets/logo.svg';
  m.settings.form_url = 'https://example.org/form/';
  m.screens[7].required = true;
  m.screens[6].required = 'maybe';                                           // kept as typed (the check reports it)
  m.screens[6].show_if = { all: [{ answer: 'support_gate', equals: 'yes' }, { any: [{ answer: 'nps', at_most: 6 }, { answer: 'fn_rating:payments', in: [1, 2, 'na'] }] }] };
  addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner', 'manager'], required: false });
  addScreenBefore(m, 'thanks', { id: 'odd_rule', type: 'yes_no', text: 'q.support_gate', show_if: { unreadable: '{answer: nps' }, active: false });
  addScreenBefore(m, 'thanks', { id: 'card', type: 'info_card', text: 'q.card', body: 'q.card.body' });
  addText(m, 'q.role', 'What is your role?', { hi: 'आपकी भूमिका क्या है?' });
  addText(m, 'choice.role.owner', 'Owner', { hi: 'मालिक' });
  addText(m, 'choice.role.manager', 'Manager', { hi: 'मैनेजर' });
  addText(m, 'q.card', '10', { hi: '2026-10-21', ta: 'TRUE', te: '=1+1', kn: "'quoted'", ml: ' spaced ', mr: '007' });
  addText(m, 'q.card.body', 'Line one\nLine two 😀', { hi: '+91 98', ta: '-5', te: '1/2', kn: '0.50', ml: '#N/A', mr: '' });
  m.text_notes['q.card'] = 'English changed on 2026-10-01: please re-check the translations.';
  m.text_notes['ui.next'] = 'Keep it short';
  m.whats_changed['2026-R1'] = [
    { en: 'Payouts now arrive on Tuesdays.', hi: 'पेआउट अब मंगलवार को आते हैं।', ta: '', te: '', kn: '', ml: '', mr: '' },
    { en: 'Second change', hi: '', ta: '', te: '', kn: '', ml: '', mr: '' }
  ];
  Object.keys(m.whats_changed).forEach(id => m.whats_changed[id].forEach(item => { if (!('mr' in item)) item.mr = ''; }));
  m.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', ta: 'https://example.org/ta/q.nps.mp3' }, 'ui.next': { mr: 'audio/mr/next.mp3' } };
  m.rounds.push({ id: '2026-R2', status: 'open', opens_on: '2026-11-01', closes_on: '2026-11-15',
    data_sheet: 'https://docs.google.com/spreadsheets/d/FAKE/edit', audio_folder: 'https://drive.google.com/drive/folders/FAKE', notes: 'Second round' });
  return m;
}

function roundTrip(context, model, book) {
  const ss = book || new FakeSpreadsheet();
  context.PP_writeModel(ss, model);
  return { ss, back: plain(context.PP_readModel(ss)) };
}

test(G5, 'imported model: write every section to an empty spreadsheet, read back -> identical', () => {
  const { ss, back } = roundTrip(M, fresh());
  eqJson(back, withoutConfigVersion(M.PP_normalizeModel(fresh())), 'model');
  const tabs = ss.getSheets().map(s => s.getName());
  eqJson(tabs, ['Settings', 'Languages', 'Areas', 'Chips', 'Support', 'Screens', 'Texts', 'What changed', 'Audio clips', 'Rounds']);
  return 'tabs created: ' + tabs.join(', ');
});

test(G5, 'rich model (hidden items, odd texts, rules, 7th language, dates): identical after write + read', () => {
  const rich = richModel();
  const { ss, back } = roundTrip(M, rich);
  eqJson(back, plain(M.PP_normalizeModel(rich)), 'model');
  const texts = ss.getSheetByName('Texts');
  const row = texts.dump().find(line => line[0] === 'q.card');
  check(row[1] === '10' && row[2] === '2026-10-21' && row[3] === 'TRUE' && row[4] === '=1+1' && row[5] === "'quoted'" && row[6] === ' spaced ' && row[7] === '007',
    'text stored exactly as typed: ' + JSON.stringify(row));
  const round = ss.getSheetByName('Rounds').dump().find(line => line[0] === '2026-R2');
  check(round[2] === '2026-11-01' && round[3] === '2026-11-15', 'dates kept as text: ' + JSON.stringify(round));
  const screens = ss.getSheetByName('Screens').dump();
  const odd = screens.find(line => line[1] === 'odd_rule');
  check(odd[5] === '{answer: nps' && odd[12] === false, 'unreadable rule written back as typed, hidden screen unticked: ' + JSON.stringify(odd));
});

test(G5, 'reading again and writing again changes nothing (stable)', () => {
  const { ss, back } = roundTrip(M, richModel());
  const before = ss.getSheets().map(s => JSON.stringify(s.dump()));
  M.PP_writeModel(ss, back);
  const after = ss.getSheets().map(s => JSON.stringify(s.dump()));
  eqJson(after, before, 'sheet contents');
});

test(G5, 'one setValues per tab when the headings exist (10 tabs with rows -> 10 writes)', () => {
  const m = fresh();
  m.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3' } };     // so every one of the 10 tabs has rows
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, m);
  const writesBefore = ss.calls.setValues;
  M.PP_writeModel(ss, m);
  check(ss.calls.setValues - writesBefore === 10, 'setValues calls: ' + (ss.calls.setValues - writesBefore));
  const empty = fresh();                                  // no clips: an empty tab needs no write at all
  const before2 = ss.calls.setValues;
  M.PP_writeModel(ss, empty);
  check(ss.calls.setValues - before2 === 9 && ss.getSheetByName('Audio clips').getLastRow() === 1, 'empty Audio clips tab: ' + (ss.calls.setValues - before2));
  return `first save on an empty spreadsheet: ${writesBefore} writes (headings + rows); next saves: 1 per tab with rows`;
});

test(G5, 'your own columns: one between headings follows its row; one on the right is never touched', () => {
  const ss = new FakeSpreadsheet();
  const texts = ss.insertSheet('Texts');
  texts.type([
    ['key', 'en', 'comment', 'hi', 'ta', 'te', 'kn', 'ml', 'note', 'mine'],
    ['ui.back', 'Back', 'C-back', 'पीछे', '', '', '', '', '', 'M1'],
    ['ui.next', 'Next', 'C-next', 'आगे', '', '', '', '', '', 'M2'],
    ['brand.name', 'Valmo Partner Pulse', 'C-brand', '', '', '', '', '', '', 'M3']
  ]);
  M.PP_writeModel(ss, fresh());
  const grid = texts.dump();
  const comments = {};
  grid.slice(1).forEach(line => { if (line[2] !== '') comments[line[0]] = line[2]; });
  eqJson(comments, { 'brand.name': 'C-brand', 'ui.next': 'C-next', 'ui.back': 'C-back' }, 'comments follow their key');
  check(grid[1][0] === 'brand.name' && grid[1][9] === 'M1' && grid[2][9] === 'M2' && grid[3][9] === 'M3', 'right-hand column untouched: ' + JSON.stringify(grid.slice(1, 4).map(l => [l[0], l[9]])));
  check(grid.slice(4).every(line => line[9] === ''), 'nothing else written in the right-hand column');
  eqJson(plain(M.PP_readModel(ss)), withoutConfigVersion(M.PP_normalizeModel(fresh())), 'model read back');
});

test(G5, 'fewer rows: left-over rows are emptied, model read back identical', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const smaller = fresh();
  Object.keys(smaller.texts).slice(100).forEach(key => { delete smaller.texts[key]; delete smaller.text_notes[key]; });
  smaller.screens.splice(7, 1);
  M.PP_writeModel(ss, smaller, ['texts', 'screens']);
  check(ss.getSheetByName('Texts').getLastRow() === 101, 'Texts last row ' + ss.getSheetByName('Texts').getLastRow());
  check(ss.getSheetByName('Screens').getLastRow() === 9, 'Screens last row ' + ss.getSheetByName('Screens').getLastRow());
  eqJson(plain(M.PP_readModel(ss)), withoutConfigVersion(M.PP_normalizeModel(smaller)), 'model');
});

test(G5, 'a new language gets new columns at the right of Texts and What changed', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const m = fresh();
  delete m.config_version;
  m.languages.push({ code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: true });
  Object.keys(m.texts).forEach(key => { m.texts[key].mr = '[TRANSLATE] ' + m.texts[key].en; });
  m.texts['ui.next'].mr = 'पुढे';
  m.whats_changed['DEMO-R1'].forEach(item => { item.mr = '[TRANSLATE] ' + item.en; });
  M.PP_writeModel(ss, m);
  eqJson(ss.getSheetByName('Texts').dump()[0], ['key', 'en', 'hi', 'ta', 'te', 'kn', 'ml', 'note', 'mr'], 'Texts headings');
  eqJson(ss.getSheetByName('What changed').dump()[0], ['round_id', 'order', 'en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr'], 'What changed headings');
  eqJson(plain(M.PP_readModel(ss)), plain(M.PP_normalizeModel(m)), 'model');
});

test(G5, 'tabs created by set-up (headings only, any column order) are filled correctly', () => {
  const ss = new FakeSpreadsheet();
  ss.insertSheet('Screens').type([['screen_id', 'order', 'active', 'type', 'text_key', 'show_if', 'required', 'skip_if', 'options', 'low_label', 'high_label', 'scale_hint', 'body']]);
  ss.insertSheet('Texts').type([['note', 'key', 'ml', 'kn', 'te', 'ta', 'hi', 'en']]);
  const { back } = roundTrip(M, fresh(), ss);
  eqJson(back, withoutConfigVersion(M.PP_normalizeModel(fresh())), 'model');
});

test(G5, 'only the listed sections are written', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const before = ss.getSheets().map(s => [s.getName(), JSON.stringify(s.dump())]);
  const m = fresh();
  m.settings['voice.max_seconds'] = 30;
  m.texts['ui.next'].en = 'Continue';
  M.PP_writeModel(ss, m, ['settings']);
  const after = ss.getSheets().map(s => [s.getName(), JSON.stringify(s.dump())]);
  const changed = after.filter((pair, i) => pair[1] !== before[i][1]).map(pair => pair[0]);
  eqJson(changed, ['Settings'], 'changed tabs');
  const back = plain(M.PP_readModel(ss));
  check(back.settings['voice.max_seconds'] === 30 && back.texts['ui.next'].en === 'Next', 'settings saved, texts untouched');
  let thrown = '';
  try { M.PP_writeModel(ss, m, ['setings']); } catch (err) { thrown = err.message; }
  check(/Cannot save "setings"/.test(thrown), thrown);
});

test(G5, 'a missing key heading stops reading with a plain message (nothing guessed)', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  ss.getSheetByName('Texts').getRange(1, 1).setValue('text key');
  let message = '';
  try { M.PP_readModel(ss); } catch (err) { message = err.message; }
  check(/"Texts" tab has no column headed "key"/.test(message), message || 'no error');
  return message;
});

test(G5, 'wrong values typed in the Settings tab are kept and reported by the check', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const sheet = ss.getSheetByName('Settings');
  const rowOf = key => sheet.dump().findIndex(line => line[0] === key) + 1;
  sheet.getRange(rowOf('voice.max_seconds'), 2).setValue('abc');
  sheet.getRange(rowOf('branding.colors.primary'), 2).setValue('#12');
  sheet.getRange(rowOf('navigation.auto_advance'), 2).setValue('maybe');
  sheet.getRange(rowOf('text.max_chars'), 2).setValue('');                // empty -> default
  const back = plain(M.PP_readModel(ss));
  check(back.settings['voice.max_seconds'] === 'abc' && back.settings['branding.colors.primary'] === '#12' && back.settings['text.max_chars'] === 1500, JSON.stringify(back.settings).slice(0, 300));
  const refs = plain(M.PP_validate(back, null)).errors.map(e => e.ref).sort();
  eqJson(refs, ['Settings > branding.colors.primary', 'Settings > navigation.auto_advance', 'Settings > voice.max_seconds'], 'errors');
});

test(G5, 'rows typed by a person: order numbers sort, blank orders stay put, empty rows are skipped', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const areas = ss.getSheetByName('Areas');
  areas.getRange(2, 1, 6, 1).setValues([[6], [5], [4], [3], [2], [1]]);    // reverse the order numbers
  areas.getRange(9, 1, 1, 4).setValues([['', "'extra", '', true]]);         // new row, no order number, after an empty row
  const back = plain(M.PP_readModel(ss));
  // "extra" has no number, so it stays right after the row above it ("app", number 1).
  eqJson(back.areas.map(a => a.id), ['app', 'extra', 'orders', 'consumables', 'linehaul', 'payments', 'losses'], 'area order');
  return back.areas.map(a => a.id).join(', ');
});

test(G5, 'with Google\'s tick boxes: "active" and Settings on/off cells get tick boxes, "required" a TRUE/FALSE list', () => {
  const ss = new FakeSpreadsheet();
  MS.PP_writeModel(ss, richModel());
  const screens = ss.getSheetByName('Screens');
  const activeCell = screens._cell(2, 13);
  const requiredCell = screens._cell(2, 5);
  check(activeCell.validation && activeCell.validation.kind === 'checkbox', 'active tick box');
  check(requiredCell.validation && requiredCell.validation.kind === 'list' && requiredCell.validation.list.join() === 'TRUE,FALSE', 'required list');
  const settings = ss.getSheetByName('Settings');
  const row = settings.dump().findIndex(line => line[0] === 'navigation.auto_advance') + 1;
  const whenRow = settings.dump().findIndex(line => line[0] === 'deep_dive.when') + 1;
  check(settings._cell(row, 2).validation.kind === 'checkbox' && settings._cell(whenRow, 2).validation.kind === 'list', 'settings checks');
  // shrinking afterwards: empty tick-box cells read as false, but those rows are not items
  const smaller = richModel();
  smaller.screens.splice(2, 4);
  MS.PP_writeModel(ss, smaller, ['screens']);
  eqJson(plain(MS.PP_readModel(ss)).screens, plain(MS.PP_normalizeModel(smaller)).screens, 'screens');
  eqJson(plain(MS.PP_readModel(ss)), plain(MS.PP_normalizeModel(smaller)), 'whole model');
});

test(G5, 'a text too long for one cell is refused before anything is written', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const before = ss.getSheets().map(s => JSON.stringify(s.dump()));
  const m = fresh();
  m.texts['ui.next'].hi = 'x'.repeat(60000);
  let message = '';
  try { M.PP_writeModel(ss, m); } catch (err) { message = err.message; }
  check(/more than Google Sheets can keep in one cell.*Nothing was saved/.test(message), message || 'no error');
  eqJson(ss.getSheets().map(s => JSON.stringify(s.dump())), before, 'sheet unchanged');
});

test(G5, 'a save that shrinks EVERY tab, with fake Sheets that (like Google) have no Range.clearContents', () => {
  check(typeof FakeRange.prototype.clearContents === 'undefined' && typeof FakeRange.prototype.clearContent === 'function',
    'the fake Range must offer clearContent only, like Google');
  const ss = new FakeSpreadsheet();
  const big = richModel();
  big.languages.push({ code: 'gu', bcp47: 'gu-IN', native_name: 'ગુજરાતી', active: false });   // an 8th language, nothing translated
  MS.PP_writeModel(ss, big);
  ss.getSheetByName('Settings').getRange(41, 1, 1, 2).setValues([["'old.setting", 'x']]);   // a left-over row under the settings
  // Only a language with an EMPTY column is dropped: a dropped language's column is left alone like any
  // column the code does not know (its old values would stay in the Texts and What changed tabs).
  const small = richModel();
  small.areas = small.areas.slice(0, 1);
  small.chips = small.chips.filter(c => c.area === small.areas[0].id).slice(0, 2);
  small.support = small.support.slice(0, 1);
  small.screens = small.screens.filter(s => ['language', 'nps', 'thanks'].indexOf(s.id) !== -1);
  const keep = ['brand.name', 'ui.next', 'q.nps', 'fn.losses.name'];
  Object.keys(small.texts).forEach(key => { if (keep.indexOf(key) === -1) { delete small.texts[key]; delete small.text_notes[key]; } });
  small.rounds = small.rounds.filter(r => r.id === 'DEMO-R1');
  small.whats_changed = { 'DEMO-R1': small.whats_changed['DEMO-R1'].slice(0, 1) };
  small.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3' } };
  const before = {};
  ss.getSheets().forEach(sheet => { before[sheet.getName()] = sheet.getLastRow(); });
  const cleared = ss.calls.clearContent;
  MS.PP_writeModel(ss, small);
  const after = {};
  ss.getSheets().forEach(sheet => { after[sheet.getName()] = sheet.getLastRow(); });
  eqJson(after, { Settings: 39, Languages: 8, Areas: 2, Chips: 3, Support: 2, Screens: 4, Texts: 5, 'What changed': 2, 'Audio clips': 2, Rounds: 2 }, 'rows per tab after shrinking');
  check(Object.keys(after).every(tab => after[tab] < before[tab]), 'every tab shrank: ' + JSON.stringify([before, after]));
  check(ss.calls.clearContent - cleared === 10, 'left-over rows emptied in every tab: ' + (ss.calls.clearContent - cleared));
  eqJson(plain(MS.PP_readModel(ss)), plain(MS.PP_normalizeModel(small)), 'model read back');
  return 'rows before ' + JSON.stringify(before) + ', after ' + JSON.stringify(after);
});

test(G5, 'Google refuses a tab half-way (protected): plain message, "may be only partly changed", reload the panel', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const m = fresh();
  m.settings['voice.max_seconds'] = 30;
  m.texts['ui.next'].en = 'Continue';
  ss.refuseWritesTo = 'Texts';
  let message = '';
  try { M.PP_writeModel(ss, m); } catch (err) { message = err.message; }
  ss.refuseWritesTo = null;
  check(/^Saving stopped half-way: Google Sheets would not change the "Texts" tab \(it said: "You are trying to edit a protected cell or object/.test(message), message || 'no error');
  check(/The draft may be only partly changed now/.test(message) && /Reload the control panel/.test(message) && /Protect sheets and ranges/.test(message), message);
  check(!/TypeError|undefined|is not a function/.test(message), 'plain English: ' + message);
  const back = plain(M.PP_readModel(ss));
  check(back.settings['voice.max_seconds'] === 30 && back.texts['ui.next'].en === 'Next', 'tabs before Texts were saved, Texts was not (that is why the message warns)');
  return message;
});

test(G5, 'a tab named "texts" instead of "Texts": refused before ANYTHING is written', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  ss.getSheetByName('Texts').name = 'texts';
  const before = ss.getSheets().map(s => s.getName() + JSON.stringify(s.dump()));
  const m = fresh();
  m.settings['voice.max_seconds'] = 30;
  let message = '';
  try { M.PP_writeModel(ss, m); } catch (err) { message = err.message; }
  check(/There is a tab called "texts", but it must be called "Texts" exactly.*Nothing was changed\./.test(message), message || 'no error');
  eqJson(ss.getSheets().map(s => s.getName() + JSON.stringify(s.dump())), before, 'every tab unchanged (Settings comes first and was not written)');
});

test(G5, 'a tab Google cannot read: refused before anything is written', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const before = ss.getSheets().map(s => JSON.stringify(s.dump()));
  const texts = ss.getSheetByName('Texts');
  texts.getLastRow = () => { throw new Error('Service Spreadsheets timed out while accessing document.'); };
  const m = fresh();
  m.settings['voice.max_seconds'] = 30;
  let message = '';
  try { M.PP_writeModel(ss, m); } catch (err) { message = err.message; }
  delete texts.getLastRow;
  check(/^Could not read the "Texts" tab before saving \(Google Sheets said: "Service Spreadsheets timed out while accessing document"\)\. Nothing was changed\./.test(message), message || 'no error');
  eqJson(ss.getSheets().map(s => JSON.stringify(s.dump())), before, 'nothing changed');
});

test(G5, 'no free column on the right: the tab gets new columns for a new language (no error)', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  ss.getSheetByName('Texts').maxCols = 8;                 // exactly key, 6 languages, note
  ss.getSheetByName('What changed').maxCols = 8;          // exactly round_id, order, 6 languages
  const m = fresh();
  delete m.config_version;
  m.languages.push({ code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: false });
  Object.keys(m.texts).forEach(key => { m.texts[key].mr = ''; });
  m.texts['ui.next'].mr = 'पुढे';
  M.PP_writeModel(ss, m);
  check(ss.getSheetByName('Texts').getMaxColumns() === 9 && ss.getSheetByName('Texts').dump()[0][8] === 'mr', 'Texts got a 9th column');
  check(ss.getSheetByName('What changed').getMaxColumns() === 9 && ss.calls.insertColumns === 2, 'What changed got one too');
  eqJson(plain(M.PP_readModel(ss)), plain(M.PP_normalizeModel(m)), 'model');
});

test(G5, 'more rows than the tab has: rows are added first', () => {
  const ss = new FakeSpreadsheet();
  ss.insertSheet('Texts').maxRows = 50;
  const { back } = roundTrip(M, fresh(), ss);
  check(ss.getSheetByName('Texts').getMaxRows() >= 131, 'rows added');
  eqJson(back, withoutConfigVersion(M.PP_normalizeModel(fresh())), 'model');
});

test(G5, 'empty spreadsheet reads as an empty model with default settings', () => {
  const back = plain(M.PP_readModel(new FakeSpreadsheet()));
  eqJson(back, plain(M.PP_emptyModel()), 'empty model');
});

// =============================================================================
// (6) Publish -> restore keeps rounds and the right settings
// =============================================================================
const G6 = '6. restore (PP_modelFromPublished)';

test(G6, 'compile(model, stamp) -> modelFromPublished(doc, model) gives the model back (rounds kept)', () => {
  const m = fresh();
  m.rounds[1].status = 'open';
  m.rounds[1].data_sheet = 'https://docs.google.com/spreadsheets/d/FAKE/edit';
  const doc = M.PP_compile(m, STAMP);
  const back = plain(M.PP_modelFromPublished(doc, m));
  check(back.config_version === 'p3-2026-10-21', back.config_version);
  eqJson(withoutConfigVersion(back), withoutConfigVersion(M.PP_normalizeModel(m)), 'model');
  return 'rounds: ' + back.rounds.map(r => `${r.id} (${r.status})`).join(', ');
});

test(G6, 'form address, settings missing from the old version, and translator notes come from the current draft', () => {
  const current = fresh();
  current.settings.form_url = 'https://example.org/other/';
  current.settings['telemetry.enabled'] = false;
  current.settings['voice.max_seconds'] = 60;
  current.text_notes['ui.next'] = 'Keep it short';
  const old = fresh();
  old.settings['voice.max_seconds'] = 45;
  const doc = plain(M.PP_compile(old, STAMP));
  delete doc.survey.telemetry;                                 // an old version without this setting group
  const back = plain(M.PP_modelFromPublished(doc, current));
  check(back.settings.form_url === 'https://example.org/other/', 'form_url kept');
  check(back.settings['telemetry.enabled'] === false, 'setting missing from the document kept');
  check(back.settings['voice.max_seconds'] === 45, 'setting in the document restored');
  check(back.text_notes['ui.next'] === 'Keep it short', 'note kept');
});

// CHANGED EXPECTATION (2026-10-20): restore used to drop everything that was
// hidden (a published version leaves hidden things out). Now everything the
// draft has that the version lacks comes back SWITCHED OFF, in its place,
// with its texts; nothing comes back switched on.
test(G6, 'restore over the same draft gives it back, hidden things included (hidden built-in, question, language, area, problem, support)', () => {
  const m = fresh();
  m.screens[1].active = false;                                   // the "What changed" card (built-in)
  m.screens[7].active = false;                                   // one_fix
  m.languages[5].active = false;                                 // ml
  m.areas[4].active = false;                                     // orders (its problems stay switched on in the draft)
  m.chips.find(c => c.code === 'invoice_gst').active = false;
  m.support[3].active = false;
  m.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', ml: 'audio/ml/q.nps.mp3' } };
  const doc = M.PP_compile(m, STAMP);
  check(!doc.survey.flow.some(s => s.id === 'whats_changed' || s.id === 'one_fix') && doc.survey.languages.length === 5, 'the version leaves hidden things out');
  const back = plain(M.PP_modelFromPublished(doc, m, '2026-10-21'));
  const expected = plain(M.PP_normalizeModel(m));
  expected.chips.forEach(c => { if (c.area === 'orders') c.active = false; });   // kept problems are never switched on
  eqJson(withoutConfigVersion(back), withoutConfigVersion(expected), 'model');
  return 'hidden items back in place: ' + back.screens.filter(s => !s.active).map(s => s.id).concat(back.languages.filter(l => !l.active).map(l => l.code), back.areas.filter(a => !a.active).map(a => a.id)).join(', ');
});

test(G6, 'restore keeps what the draft has but the version lacks: switched off, in its place, with its texts', () => {
  const doc = M.PP_compile(fresh(), STAMP);                       // the version: everything switched on
  const draft = fresh();
  // a language added since (hidden), with translations, a What changed translation and a recording
  draft.languages.splice(2, 0, { code: 'mr', bcp47: 'mr-IN', native_name: 'मराठी', active: false });
  Object.keys(draft.texts).forEach(key => { draft.texts[key].mr = '[TRANSLATE] ' + draft.texts[key].en; });
  draft.texts['ui.next'].mr = 'पुढे';
  draft.texts['ui.skip'].en = 'Skip this';                          // English changed since the version...
  draft.texts['ui.skip'].mr = 'हे वगळा';                            // ...and Marathi was translated from the new English
  draft.whats_changed['DEMO-R1'].forEach(item => { item.mr = ''; });
  draft.whats_changed['DEMO-R1'][0].mr = 'मराठी बदल';
  draft.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', mr: 'audio/mr/q.nps.mp3' } };
  // an area added since (hidden) after "linehaul", with a problem switched on and one switched off
  draft.areas.splice(3, 0, { id: 'returns', threshold: 2, active: false });
  draft.chips.push({ area: 'returns', code: 'late_pickup', active: true }, { area: 'returns', code: 'no_label', active: false });
  addText(draft, 'fn.returns.name', 'Returns', { hi: 'रिटर्न' });
  addText(draft, 'fn.returns.help', 'Pickups of returned shipments');
  addText(draft, 'issue.returns.late_pickup', 'Pickup comes late');
  addText(draft, 'issue.returns.no_label', 'No return label');
  draft.text_notes['fn.returns.name'] = 'Check the Hindi';
  // a problem added since to an area the version has, switched ON in the draft, second in its area
  const at = draft.chips.findIndex(c => c.area === 'payments' && c.code === 'payout_delayed');
  draft.chips.splice(at + 1, 0, { area: 'payments', code: 'late_credit', active: true });
  addText(draft, 'issue.payments.late_credit', 'Credit note comes late');
  // a support question added since (hidden), first
  draft.support.unshift({ code: 'callback_time', active: false });
  addText(draft, 'support.callback_time', 'Time to call back');
  // a question added since (hidden) before one_fix, with answers; a second "What changed" card (built-in, hidden)
  addScreenBefore(draft, 'one_fix', { id: 'q_role', type: 'single_choice', text: 'q.role', options: ['owner', 'manager'], active: false });
  addText(draft, 'q.role', 'What is your role?');
  addText(draft, 'choice.q_role.owner', 'Owner');
  addText(draft, 'choice.q_role.manager', 'Manager');
  addScreenBefore(draft, 'nps', { id: 'news_again', type: 'whats_changed', active: false });
  draft.texts['ui.back'].en = 'Go back';                          // reworded since: the version's wording comes back

  const back = plain(M.PP_modelFromPublished(doc, draft, '2026-10-21'));
  eqJson(back.languages.map(l => l.code + ':' + l.active), ['en:true', 'hi:true', 'mr:false', 'ta:true', 'te:true', 'kn:true', 'ml:true'], 'languages');
  eqJson(back.areas.map(a => a.id + ':' + a.active), ['losses:true', 'payments:true', 'linehaul:true', 'returns:false', 'consumables:true', 'orders:true', 'app:true'], 'areas');
  check(back.areas[3].threshold === 2, 'a kept area keeps its own low-rating number');
  eqJson(back.chips.filter(c => c.area === 'payments').map(c => c.code + ':' + c.active),
    ['payout_delayed:true', 'late_credit:false', 'short_payment:true', 'unclear_breakup:true', 'invoice_gst:true', 'incentive_missing:true'], 'payments problems');
  eqJson(back.chips.filter(c => c.area === 'returns').map(c => c.code + ':' + c.active), ['late_pickup:false', 'no_label:false'], 'returns problems (never switched on)');
  eqJson(back.support.map(s => s.code + ':' + s.active), ['callback_time:false', 'agent_behaviour:true', 'understood_problem:true', 'time_to_resolve:true', 'kept_updated:true'], 'support');
  eqJson(back.screens.map(s => s.id + ':' + s.active),
    ['language:true', 'whats_changed:true', 'nps:true', 'fn_ratings:true', 'fn_deep_dives:true', 'support_gate:true', 'support:true', 'q_role:false', 'one_fix:true', 'thanks:true'],
    'screens (the second "What changed" card is not added: that kind of screen appears only once)');
  eqJson(back.screens[7].options, ['owner', 'manager'], 'kept question keeps its answers');
  ['fn.returns.name', 'fn.returns.help', 'issue.returns.late_pickup', 'issue.returns.no_label', 'issue.payments.late_credit',
    'support.callback_time', 'q.role', 'choice.q_role.owner', 'choice.q_role.manager'].forEach(key => {
    check(back.texts[key] && back.texts[key].en === draft.texts[key].en, 'text kept: ' + key);
  });
  check(back.texts['fn.returns.name'].hi === 'रिटर्न' && back.text_notes['fn.returns.name'] === 'Check the Hindi', 'a kept text keeps its translations and its note');
  check(back.texts['ui.back'].en === 'Back', 'texts the version has come back in its wording: ' + back.texts['ui.back'].en);
  check(back.texts['ui.next'].mr === 'पुढे' && back.texts['nps.low'].mr === '[TRANSLATE] Not at all likely', 'the hidden language keeps its translations: ' + JSON.stringify(back.texts['ui.next']));
  check(back.texts['ui.skip'].en === 'Skip' && back.texts['ui.skip'].mr === 'हे वगळा' &&
    back.text_notes['ui.skip'] === 'English changed on 2026-10-21: please re-check the translations.', 'a kept translation of other English gets the re-check note: ' + JSON.stringify([back.texts['ui.skip'], back.text_notes['ui.skip']]));
  check(back.text_notes['ui.next'] === '', 'no note when the English is the same');
  check(back.whats_changed['DEMO-R1'][0].mr === 'मराठी बदल', 'What changed translation kept');
  eqJson(back.clips['q.nps'], { mr: 'audio/mr/q.nps.mp3' }, 'the returning language keeps its recording (the version had no Hindi one)');
  // partners see exactly the restored version: nothing kept is switched on
  const survey = plain(M.PP_compile(back, null)).survey;
  const original = plain(doc).survey;
  delete survey.config_version;
  delete original.config_version;
  eqJson(survey, original, 'compiled questionnaire');
  const result = plain(M.PP_validate(back, doc));
  check(result.errors.length === 0, 'the restored draft can be published: ' + JSON.stringify(result.errors.slice(0, 3)));
});

test(G6, 'restore: a kept screen never lands after the thank-you screen; nothing without a draft stays the same', () => {
  const draft = fresh();
  draft.screens.push(newScreen({ id: 'after_end', type: 'info_card', text: 'q.one_fix', active: false }));
  const back = plain(M.PP_modelFromPublished(M.PP_compile(fresh(), STAMP), draft, '2026-10-21'));
  eqJson(back.screens.slice(-2).map(s => s.id + ':' + s.active), ['after_end:false', 'thanks:true'], 'last two screens');
  const alone = plain(M.PP_modelFromPublished(M.PP_compile(fresh(), STAMP)));
  check(alone.screens.every(s => s.active) && alone.languages.every(l => l.active), 'without a draft nothing is added');
});

test(G6, 'works without a current model (as Code.gs calls it) and refuses a file that is not a questionnaire', () => {
  const back = plain(M.PP_modelFromPublished(M.PP_compile(fresh(), STAMP)));
  check(back.rounds.length === 0 && back.whats_changed['DEMO-R1'].length === 3 && !('2026-R1' in back.whats_changed), JSON.stringify(Object.keys(back.whats_changed)));
  let message = '';
  try { M.PP_modelFromPublished({ hello: 1 }, fresh()); } catch (err) { message = err.message; }
  check(/not a Partner Pulse questionnaire file/.test(message), message);
});

test(G6, 'draft vs live: PP_compileForCompare returns comparable text (PanelServer.gs compares with !==)', () => {
  const m = fresh();
  const live = M.PP_compile(m, STAMP);
  const a = M.PP_compileForCompare(m);
  const b = M.PP_compileForCompare(live);
  check(typeof a === 'string' && a === b, 'same content should compare equal');
  check(M.PP_draftDiffersFromLive(m, live) === false, 'draft equals live');
  const reordered = fresh();
  const keys = Object.keys(reordered.texts).reverse();
  const texts = {};
  keys.forEach(key => { texts[key] = reordered.texts[key]; });
  reordered.texts = texts;
  check(M.PP_compileForCompare(reordered) === b, 'only the order of the Texts rows changed: not a difference');
  const changed = fresh();
  changed.texts['ui.next'].en = 'Continue';
  check(M.PP_compileForCompare(changed) !== b && M.PP_draftDiffersFromLive(changed, live) === true, 'a reworded text is a difference');
  check(M.PP_draftDiffersFromLive(m, null) === true, 'nothing live: differs');
});

test(G6, 'PP_liveIds lists the codes partners answered', () => {
  const m = fresh();
  addScreenBefore(m, 'thanks', { id: 'role', type: 'single_choice', text: 'q.one_fix', options: ['owner', 'manager'] });
  const ids = plain(M.PP_liveIds(M.PP_compile(m, STAMP)));
  eqJson(ids.screens, ['language', 'whats_changed', 'nps', 'fn_ratings', 'fn_deep_dives', 'support_gate', 'support', 'one_fix', 'role', 'thanks'], 'screens');
  eqJson(ids.areas, ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app'], 'areas');
  eqJson(ids.chips.payments, ['payout_delayed', 'short_payment', 'unclear_breakup', 'invoice_gst', 'incentive_missing'], 'chips');
  eqJson(ids.support, ['agent_behaviour', 'understood_problem', 'time_to_resolve', 'kept_updated'], 'support');
  eqJson(ids.options, { role: ['owner', 'manager'] }, 'options');
  eqJson(plain(M.PP_liveIds(null)), { screens: [], areas: [], chips: {}, support: [], options: {} }, 'empty');
});

// =============================================================================
// (7) Translation helpers (applied by panelSave)
// =============================================================================
const G7 = '7. translation helpers';

function helped(mutate, today) {
  const old = fresh();
  old.texts['ui.continue'].en = 'Continue';
  old.text_notes['ui.continue'] = 'English changed on 2026-10-01: please re-check the translations. Keep it short';
  old.text_notes['ui.submit'] = 'Keep it short';
  addText(old, 'x.only_en', 'A', { hi: '[TRANSLATE] A', ta: '[TRANSLATE] A' });
  const changed = plain(old);
  mutate(changed);
  return { old, out: plain(M.PP_applyTranslationHelpers(old, changed, today === undefined ? '2026-10-21' : today)) };
}

test(G7, 'empty translation becomes "[TRANSLATE] " + English', () => {
  const { out } = helped(m => { m.texts['ui.next'].ta = ''; m.texts['ui.next'].kn = '   '; });
  check(out.texts['ui.next'].ta === '[TRANSLATE] Next' && out.texts['ui.next'].kn === '[TRANSLATE] Next', JSON.stringify(out.texts['ui.next']));
  check(out.text_notes['ui.next'] === '', 'English unchanged: no note');
});

test(G7, 'a value still marked [TRANSLATE] follows the current English', () => {
  const { out } = helped(m => { m.texts['ui.back'].ta = '[TRANSLATE] Old back'; });
  check(out.texts['ui.back'].ta === '[TRANSLATE] Back', out.texts['ui.back'].ta);
});

test(G7, 'English changed + a real translation exists -> note; [TRANSLATE] values follow the new English', () => {
  const { out } = helped(m => { m.texts['ui.skip'].en = 'Skip this'; });
  check(out.text_notes['ui.skip'] === 'English changed on 2026-10-21: please re-check the translations.', out.text_notes['ui.skip']);
  check(out.texts['ui.skip'].hi === 'छोड़ें' && out.texts['ui.skip'].ta === '[TRANSLATE] Skip this', JSON.stringify(out.texts['ui.skip']));
  return out.text_notes['ui.skip'];
});

test(G7, 'English changed but only [TRANSLATE] values -> no note, values updated', () => {
  const { out } = helped(m => { m.texts['x.only_en'].en = 'B'; });
  check(out.text_notes['x.only_en'] === '' && out.texts['x.only_en'].hi === '[TRANSLATE] B' && out.texts['x.only_en'].te === '[TRANSLATE] B', JSON.stringify(out.texts['x.only_en']));
});

test(G7, 'a translator\'s own note is kept after the new sentence; an old "English changed" sentence is replaced', () => {
  const { out } = helped(m => { m.texts['ui.submit'].en = 'Send'; m.texts['ui.continue'].en = 'Go on'; });
  check(out.text_notes['ui.submit'] === 'English changed on 2026-10-21: please re-check the translations. Keep it short', out.text_notes['ui.submit']);
  check(out.text_notes['ui.continue'] === 'English changed on 2026-10-21: please re-check the translations. Keep it short', out.text_notes['ui.continue']);
});

test(G7, 'only spaces changed in English -> no note', () => {
  const { out } = helped(m => { m.texts['ui.yes'].en = ' Yes '; });
  check(out.text_notes['ui.yes'] === '', out.text_notes['ui.yes']);
});

test(G7, 'a new text: filled, no note; a text with empty English: left alone', () => {
  const { out } = helped(m => { addText(m, 'q.new', 'New question', { hi: '' }); addText(m, 'q.blank', '', { hi: 'कुछ' }); });
  check(out.texts['q.new'].hi === '[TRANSLATE] New question' && out.text_notes['q.new'] === '', JSON.stringify(out.texts['q.new']));
  check(out.texts['q.blank'].hi === 'कुछ' && out.texts['q.blank'].ta === '', JSON.stringify(out.texts['q.blank']));
});

test(G7, 'What changed bullets get the same [TRANSLATE] help', () => {
  const { out } = helped(m => { m.whats_changed['DEMO-R1'][0].ta = ''; m.whats_changed['DEMO-R1'][1].hi = '[TRANSLATE] old'; });
  check(out.whats_changed['DEMO-R1'][0].ta === '[TRANSLATE] [SAMPLE] Debit disputes now get a first reply within 48 hours.', out.whats_changed['DEMO-R1'][0].ta);
  check(out.whats_changed['DEMO-R1'][1].hi === '[TRANSLATE] [SAMPLE] The payout breakup is now shown line by line in the app.', out.whats_changed['DEMO-R1'][1].hi);
});

test(G7, 'the date may be given as a Date or a full ISO time (India date is used)', () => {
  const a = helped(m => { m.texts['ui.skip'].en = 'Skip this'; }, new Date('2026-10-20T20:00:00.000Z')).out;
  const b = helped(m => { m.texts['ui.skip'].en = 'Skip this'; }, '2026-10-20T20:00:00.000Z').out;
  check(a.text_notes['ui.skip'].indexOf('2026-10-21') > 0 && b.text_notes['ui.skip'].indexOf('2026-10-21') > 0, a.text_notes['ui.skip'] + ' / ' + b.text_notes['ui.skip']);
});

test(G7, 'PanelServer.gs save sequence (it passes draft first, saved model second): edits are kept, helpers applied', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const edited = fresh();                                   // what the panel sends
  edited.texts['ui.skip'].en = 'Skip this';
  edited.texts['ui.next'].ta = '';
  // ---- the lines of PanelServer.gs PP_prepareDraft_ + panelSave, as written today:
  const previous = M.PP_readModel(ss);
  const draft = M.PP_normalizeModel(JSON.parse(JSON.stringify(edited)));
  const helped = M.PP_applyTranslationHelpers(draft, previous, '2026-10-21') || draft;
  M.PP_writeModel(ss, helped, ['settings', 'languages', 'areas', 'chips', 'support', 'screens', 'texts', 'whats_changed', 'clips', 'rounds']);
  // ----
  const saved = plain(M.PP_readModel(ss));
  check(saved.texts['ui.skip'].en === 'Skip this', 'the edit was lost: ' + saved.texts['ui.skip'].en);
  check(saved.text_notes['ui.skip'] === 'English changed on 2026-10-21: please re-check the translations.', saved.text_notes['ui.skip']);
  check(saved.texts['ui.next'].ta === '[TRANSLATE] Next', saved.texts['ui.next'].ta);
  const declared = plain(M.PP_applyTranslationHelpers(M.PP_readModel(ss), M.PP_normalizeModel(plain(saved)), '2026-10-21'));
  eqJson(declared, saved, 'declared order gives the same');
  check(consoleLines.some(line => /second argument/.test(line)), 'the swap is logged');
});

test(G7, 'the "read from the Sheet" mark is invisible (not in JSON, not copied by tidying)', () => {
  const ss = new FakeSpreadsheet();
  M.PP_writeModel(ss, fresh());
  const model = M.PP_readModel(ss);
  check(model.PP_fromSheet === true, 'mark present');
  check(!Object.keys(model).includes('PP_fromSheet') && !JSON.stringify(model).includes('PP_fromSheet'), 'mark visible');
  check(M.PP_normalizeModel(model).PP_fromSheet === undefined, 'mark copied by tidying');
  // both from the Sheet: the declared order is used
  const other = M.PP_readModel(ss);
  other.texts['ui.back'].en = 'Go back';
  const out = plain(M.PP_applyTranslationHelpers(model, other, '2026-10-21'));
  check(out.texts['ui.back'].en === 'Go back', 'declared order not used when both come from the Sheet');
});

test(G7, 'the input models are not changed', () => {
  const old = fresh();
  const changed = fresh();
  changed.texts['ui.next'].ta = '';
  const before = JSON.stringify(changed);
  M.PP_applyTranslationHelpers(old, changed, '2026-10-21');
  check(JSON.stringify(changed) === before, 'newModel was modified');
});

// =============================================================================
// (8) Codes made from text (PP_slug)
// =============================================================================
const G8 = '8. PP_slug';

const SLUGS = [
  ['How easy is it to reach support?', [], 'how_easy_is_it_to_reach_support'],
  ['How easy is it?', ['how_easy_is_it'], 'how_easy_is_it_2'],
  ['How easy is it?', ['how_easy_is_it', 'how_easy_is_it_2'], 'how_easy_is_it_3'],
  ['  --Hello__World!!  ', [], 'hello_world'],
  ['Payments / Payouts', [], 'payments_payouts'],
  ['2nd question', [], 'n2nd_question'],
  ['पेमेंट', [], 'item'],
  ['पेमेंट', ['item'], 'item_2'],
  ['', [], 'item'],
  [null, [], 'item'],
  ['a'.repeat(39) + ' b', [], 'a'.repeat(39)],
  ['x'.repeat(60), [], 'x'.repeat(40)],
  ['Late Supply', { late_supply: true }, 'late_supply_2'],
  ['ÉCOLE café', [], 'cole_caf']
];

SLUGS.forEach(([text, taken, expected]) => {
  test(G8, `${JSON.stringify(text).slice(0, 40)} taken=${JSON.stringify(taken).slice(0, 50)} -> ${expected.slice(0, 45)}`, () => {
    const got = M.PP_slug(text, taken);
    check(got === expected, 'got ' + got);
    check(/^[a-z][a-z0-9_]*$/.test(got), 'not a valid code: ' + got);
  });
});

// =============================================================================
// Extra checks of the catalogue and helpers
// =============================================================================
const G9 = '9. catalogue and helpers';

test(G9, 'PP_FORM_TEXT_KEYS is the same list as FIXED_STRING_KEYS in scripts/check_config.py', () => {
  const python = fs.readFileSync(path.join(ROOT, 'scripts/check_config.py'), 'utf8');
  const match = /FIXED_STRING_KEYS = """([\s\S]*?)"""\.split\(\)/.exec(python);
  check(match, 'list not found in check_config.py');
  eqJson(plain(M.PP_FORM_TEXT_KEYS), match[1].split(/\s+/).filter(Boolean), 'keys');
  return M.PP_FORM_TEXT_KEYS.length + ' keys';
});

test(G9, 'PP_SETTINGS_SCHEMA: 38 rows, every field present, groups from the contract, defaults pass their own check', () => {
  const groups = ['Form address', 'Languages', 'Look & feel', 'Moving between screens', 'Ratings', 'Problem screens',
    'Support questions', 'Voice notes', 'Typing', 'Read aloud', 'What changed', 'Progress messages', 'Sending'];
  const schema = plain(M.PP_SETTINGS_SCHEMA);
  check(schema.length === 38, 'rows: ' + schema.length);
  schema.forEach(entry => {
    eqJson(Object.keys(entry), ['key', 'type', 'default', 'min', 'max', 'options', 'help', 'group', 'label'], entry.key);
    check(groups.includes(entry.group), entry.key + ' group ' + entry.group);
    check(M.PP_mdlSettingProblem_(M.PP_SETTINGS_SCHEMA.find(e => e.key === entry.key), entry.default) === '', entry.key + ' default fails');
    check(entry.help.length > 10 && entry.label.length > 2, entry.key + ' help/label');
  });
  check(groups.every(group => schema.some(entry => entry.group === group)), 'every group used');
  return groups.map(group => group + ': ' + schema.filter(e => e.group === group).length).join(', ');
});

test(G9, 'settings help never shows option codes or text keys; the Sheet\'s drop-down help names the options', () => {
  const textKeys = Object.keys(FILES.strings).filter(key => key.charAt(0) !== '_');
  const bad = [];
  M.PP_SETTINGS_SCHEMA.forEach(entry => {
    textKeys.forEach(key => { if (entry.help.indexOf(key) !== -1) bad.push(entry.key + ' shows the text key ' + key); });
    if (/\(text [a-z]/.test(entry.help)) bad.push(entry.key + ' says "(text ...)"');
    (entry.options || []).forEach(option => {
      if (option.indexOf('_') !== -1 && entry.help.indexOf(option) !== -1) bad.push(entry.key + ' shows the code ' + option);
      if (new RegExp('\\b' + option + '\\s*:').test(entry.help)) bad.push(entry.key + ' explains the code "' + option + ':"');
    });
  });
  check(!bad.length, bad.join('; '));
  const help = key => M.PP_SETTINGS_SCHEMA.find(entry => entry.key === key).help;
  check(/"After all the area ratings"/.test(help('deep_dive.when')) && /"Straight after each low rating"/.test(help('deep_dive.when')), help('deep_dive.when'));
  check(/"Press and hold to talk"/.test(help('voice.gesture')) && /"Tap to start and stop"/.test(help('voice.gesture')), help('voice.gesture'));
  check(/its wording: the text "I don't handle this" in Texts & translations/.test(help('rating.allow_not_applicable')), help('rating.allow_not_applicable'));
  check(/its wording: the text "Doesn't apply" in Texts & translations/.test(help('support.allow_not_applicable')), help('support.allow_not_applicable'));
  const ss = new FakeSpreadsheet();
  MS.PP_writeModel(ss, fresh());
  const settings = ss.getSheetByName('Settings');
  const row = settings.dump().findIndex(line => line[0] === 'deep_dive.when') + 1;
  const rule = settings._cell(row, 2).validation;
  check(rule.help === 'Pick one: after_all_ratings (After all the area ratings) or immediate (Straight after each low rating).', rule.help);
  return help('deep_dive.when');
});

test(G9, 'every setting in web/config/survey.json has a Settings row (and the reverse)', () => {
  const leaves = [];
  (function walk(obj, prefix) {
    Object.keys(obj).forEach(key => {
      if (key.charAt(0) === '_') return;
      const value = obj[key];
      const where = prefix ? prefix + '.' + key : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, where);
      else leaves.push(where);
    });
  }(FILES.survey, ''));
  const notSettings = ['config_version', 'backend.mode', 'backend.mock_url', 'backend.apps_script_url', 'links.mock_defaults.dc',
    'links.mock_defaults.round', 'links.mock_defaults.t', 'languages', 'functions', 'flow', 'support.items'];
  const keys = M.PP_SETTINGS_SCHEMA.map(entry => entry.key);
  const missing = leaves.filter(leaf => !notSettings.includes(leaf) && !keys.includes(leaf));
  const extra = keys.filter(key => key !== 'form_url' && !leaves.includes(key));
  check(!missing.length && !extra.length, 'missing rows ' + JSON.stringify(missing) + ', rows not in survey.json ' + JSON.stringify(extra));
});

test(G9, 'PP_SCREEN_TYPES matches the contract table', () => {
  const types = plain(M.PP_SCREEN_TYPES);
  const table = {
    language_picker: [true, false, ['skip_if']], whats_changed: [true, false, ['skip_if']], function_ratings: [true, false, []],
    function_deep_dives: [true, false, []], support_block: [true, true, []], thank_you: [true, false, []],
    nps_0_10: [false, true, ['low_label', 'high_label', 'scale_hint', 'required']], rating_1_5: [false, true, ['required']],
    yes_no: [false, true, ['required']], single_choice: [false, true, ['options', 'required']], free_text: [false, true, ['required']],
    info_card: [false, true, ['body']]
  };
  eqJson(types.map(t => t.type), Object.keys(table), 'types');
  types.forEach(t => {
    eqJson([t.builtin, t.needs_text, t.fields], table[t.type], t.type);
    check(t.label && t.description, t.type + ' label/description');
  });
});

test(G9, 'PP_TABS and PP_tabHeaders follow contract section 3', () => {
  eqJson(Object.keys(M.PP_TABS), ['Settings', 'Languages', 'Areas', 'Chips', 'Support', 'Screens', 'Texts', 'What changed', 'Audio clips', 'Rounds', 'DCs', 'Links', 'Publish history', '_meta']);
  eqJson(plain(M.PP_tabHeaders('Texts', ['en', 'hi', 'mr'])), ['key', 'en', 'hi', 'mr', 'note']);
  eqJson(plain(M.PP_tabHeaders('What changed', ['en', 'ta'])), ['round_id', 'order', 'en', 'ta']);
  eqJson(plain(M.PP_tabHeaders('Texts')), plain(M.PP_TABS.Texts));
  eqJson(plain(M.PP_tabHeaders('Screens')), ['order', 'screen_id', 'type', 'text_key', 'required', 'show_if', 'skip_if', 'options', 'low_label', 'high_label', 'scale_hint', 'body', 'active']);
});

test(G9, 'PP_SURVEY_HELP holds exactly the notes of survey.json', () => {
  const found = {};
  Object.keys(FILES.survey).forEach(key => {
    if (key.charAt(0) === '_') found[key] = FILES.survey[key];
    else if (FILES.survey[key] && typeof FILES.survey[key] === 'object' && !Array.isArray(FILES.survey[key]) && FILES.survey[key]._help) found[key + '._help'] = FILES.survey[key]._help;
  });
  eqJson(sortKeys(plain(M.PP_SURVEY_HELP)), sortKeys(found), 'notes');
});

test(G9, 'PP_derivedTextKeys: the texts active items need (not the form\'s own texts)', () => {
  const keys = plain(M.PP_derivedTextKeys(fresh()));
  ['fn.losses.name', 'fn.app.help', 'issue.payments.payout_delayed', 'issue.other', 'support.kept_updated', 'q.support_comment',
    'q.nps', 'nps.low', 'nps.high', 'nps.scale_hint', 'q.support_gate', 'q.support_block', 'q.one_fix'].forEach(key => check(keys.includes(key), 'missing ' + key));
  check(!keys.includes('ui.next') && !keys.includes('support.not_applicable'), 'form keys / switched-off option included');
  const m = fresh();
  m.areas[0].active = false;
  m.settings['support.allow_not_applicable'] = true;
  const keys2 = plain(M.PP_derivedTextKeys(m));
  check(!keys2.includes('fn.losses.name') && !keys2.includes('issue.losses.wrong_debit') && keys2.includes('support.not_applicable'), 'hidden area / option');
  return keys.length + ' keys for the imported model';
});

test(G9, 'PP_normalizeModel: tidying twice gives the same; junk dropped; types fixed', () => {
  const once = plain(M.PP_normalizeModel(richModel()));
  eqJson(plain(M.PP_normalizeModel(once)), once, 'idempotent');
  const messy = {
    settings: { 'voice.max_seconds': '45', 'navigation.auto_advance': 'FALSE', 'rating.faces': ['😠', '🙁', '😐', '🙂', '😄'],
      'backend.retry_delays_seconds': [2, 5], 'voice.mime_types': ['audio/webm', 'audio/mp4'], unknown: 1, 'text.max_chars': '' },
    languages: [{ code: ' en ', bcp47: 'en-IN', native_name: 'English' }, null, { code: '', bcp47: '', native_name: '' }, 'junk'],
    areas: [{ id: 'losses', threshold: '2', active: 'TRUE' }, { id: '', threshold: '' }],
    chips: [{ area: 'losses', code: 'a', active: '' }, { area: 'other_area', code: 'b' }, { area: 'losses', code: 'c', active: false }],
    support: [{ code: '' }, { code: 'x' }],
    screens: [{ id: 'q', type: 'yes_no', text: 'q.x', required: 'false', show_if: '{"answer":"nps","at_most":6}', options: 'a, b,, c' }, {}],
    texts: { _help: 'note', 'q.x': { en: 'X', hi: 5, zz: 'dropped' }, ' q.y ': 'not an object' },
    whats_changed: { 'R-1': { title: null, items: [{ en: 'One' }, { en: '' }] }, 'R-2': [] },
    rounds: [{ id: 'R-1' }, { id: '' }],
    clips: { _note: {}, 'q.x': { hi: ' url ', ta: '' } },
    extra_section: { anything: true }
  };
  const tidy = plain(M.PP_normalizeModel(messy));
  check(tidy.settings['voice.max_seconds'] === 45 && tidy.settings['navigation.auto_advance'] === false && tidy.settings['text.max_chars'] === 1500, 'numbers/flags/defaults');
  check(tidy.settings['rating.faces'] === '😠 🙁 😐 🙂 😄' && tidy.settings['backend.retry_delays_seconds'] === '2, 5' && tidy.settings['voice.mime_types'] === 'audio/webm, audio/mp4', 'lists as text');
  check(!('unknown' in tidy.settings) && !('extra_section' in tidy), 'junk dropped');
  eqJson(tidy.languages, [{ code: 'en', bcp47: 'en-IN', native_name: 'English', active: true }], 'languages');
  eqJson(tidy.areas, [{ id: 'losses', threshold: 2, active: true }], 'areas');
  eqJson(tidy.chips.map(c => c.area + '/' + c.code + ':' + c.active), ['losses/a:true', 'losses/c:false', 'other_area/b:true'], 'chips grouped by area');
  eqJson(tidy.support, [{ code: 'x', active: true }], 'support');
  eqJson(tidy.screens, [{ id: 'q', type: 'yes_no', text: 'q.x', required: false, show_if: { answer: 'nps', at_most: 6 }, skip_if: '', options: ['a', 'b', 'c'], low_label: '', high_label: '', scale_hint: '', body: '', active: true }], 'screens');
  eqJson(tidy.texts, { 'q.x': { en: 'X' }, 'q.y': { en: '' } }, 'texts (only the model\'s languages; the _help note dropped)');
  eqJson(tidy.text_notes, { 'q.x': '', 'q.y': '' }, 'a note for every text');
  eqJson(tidy.whats_changed, { 'R-1': [{ en: 'One' }] }, 'what changed');
  eqJson(tidy.rounds.map(r => r.id + ':' + r.status), ['R-1:draft'], 'rounds');
  eqJson(tidy.clips, { 'q.x': { hi: 'url' } }, 'clips');
});

test(G9, 'PP_dateIST', () => {
  check(M.PP_dateIST(new Date('2026-10-20T18:29:59Z')) === '2026-10-20', 'before midnight IST');
  check(M.PP_dateIST('2026-10-20T18:30:00Z') === '2026-10-21', 'midnight IST');
  check(M.PP_dateIST('nonsense') === '' && M.PP_dateIST(null) === '', 'bad input');
});

test(G9, 'compile leaves out hidden items and fills missing translations', () => {
  const m = fresh();
  m.screens[7].active = false;
  m.areas[0].active = false;
  m.chips.find(c => c.code === 'payout_delayed').active = false;
  m.support[0].active = false;
  m.languages[5].active = false;
  m.texts['ui.next'].ta = '';
  m.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', ml: 'audio/ml/q.nps.mp3' } };
  const doc = plain(M.PP_compile(m, null));
  check(!doc.survey.flow.some(s => s.id === 'one_fix') && doc.survey.functions[0].id === 'payments', 'hidden screen/area');
  check(!doc.survey.functions[0].issues.includes('payout_delayed') && !doc.survey.support.items.includes('agent_behaviour'), 'hidden chip/support');
  check(doc.survey.languages.length === 5 && !('ml' in doc.strings['ui.next']) && doc.strings['ui.next'].ta === '[TRANSLATE] Next', JSON.stringify(doc.strings['ui.next']));
  eqJson(doc.clips, { 'q.nps': { hi: 'audio/hi/q.nps.mp3' } }, 'clips for active languages only');
  check(Array.isArray(doc.survey.rating.faces) && doc.survey.rating.faces.length === 5 && Array.isArray(doc.survey.voice.mime_types) && doc.survey.backend.retry_delays_seconds[0] === 2, 'typed settings');
});

test(G9, 'Preview still compiles a model with errors (bad values fall back to defaults)', () => {
  const m = fresh();
  m.settings['voice.max_seconds'] = 'abc';
  m.settings['rating.faces'] = 'x';
  m.screens[6].show_if = '{broken';
  const doc = plain(M.PP_compile(m, null));
  check(doc.survey.voice.max_seconds === 60 && doc.survey.rating.faces.length === 5 && !('show_if' in doc.survey.flow[6]), JSON.stringify(doc.survey.voice));
});

// =============================================================================
// (10) Fixes of 21 Oct 2026 (docs/STATE.md, item 3)
// =============================================================================
const G10 = '10. 21 Oct fixes: export, empty rounds, nps and support_gate';

test(G10, 'export without a web app address passes scripts/check_config.py (copy of web/ in tests/model/checkcopy)', () => {
  const copyRoot = path.join(HERE, 'checkcopy');
  fs.rmSync(copyRoot, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'web'), path.join(copyRoot, 'web'), { recursive: true });
  const m = fresh();
  m.areas[1].threshold = 2;                               // a real change, so the files are not just the repo's own
  const out = M.PP_exportStatic(m, { apps_script_url: '' });
  const survey = JSON.parse(out['survey.json']);
  check(survey.backend.mode === 'mock' && survey.backend.apps_script_url === '', 'test mode without an address: ' + JSON.stringify(survey.backend));
  Object.keys(out).forEach(name => {
    const where = name === 'strings.json' ? 'web/i18n/' : 'web/config/';
    fs.writeFileSync(path.join(copyRoot, where + name), out[name]);
  });
  let output;
  let code = 0;
  try {
    output = execFileSync('python3', [path.join(ROOT, 'scripts/check_config.py'), '--root', copyRoot], { encoding: 'utf8' });
  } catch (err) {
    code = err.status;
    output = String(err.stdout || '') + String(err.stderr || '');
  }
  check(code === 0, 'check_config.py failed:\n' + output.split('\n').slice(0, 30).join('\n'));
  return (output.match(/Found: .*/) || ['?'])[0].trim();
});

test(G10, 'a new round with no "What changed" bullets is not a change; a bullet is', () => {
  const live = M.PP_compile(fresh(), null);
  const m = fresh();
  m.rounds.push({ id: '2026-R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' });
  m.whats_changed['2026-R2'] = [];
  check(M.PP_draftDiffersFromLive(m, live) === false, 'an empty new round counted as a change');
  delete m.whats_changed['2026-R2'];
  check(M.PP_draftDiffersFromLive(m, live) === false, 'a new round without a "What changed" entry counted as a change');
  m.whats_changed['2026-R2'] = [{ en: 'Payouts now arrive every Tuesday.' }];
  check(M.PP_draftDiffersFromLive(m, live) === true, 'a bullet in the new round was not counted as a change');
  const m2 = fresh();
  m2.whats_changed['DEMO-R1'] = [];
  check(M.PP_draftDiffersFromLive(m2, live) === true, 'emptying a round that has live bullets was not counted as a change');
});

test(G10, 'a warning (never an error) when the nps or support_gate question is missing', () => {
  const base = M.PP_validate(fresh(), null);
  check(!base.warnings.some(w => /The question with the code "(nps|support_gate)" is missing/.test(w.message)), 'the imported questionnaire already warns');
  const out = [];
  [['nps', 'nps'], ['support_gate', 'support_contacted']].forEach(([id, column]) => {
    const m = fresh();
    m.screens = m.screens.filter(s => s.id !== id);
    m.screens.forEach(s => { if (s.show_if && JSON.stringify(s.show_if).includes('"' + id + '"')) delete s.show_if; });
    const v = M.PP_validate(m, null);
    const w = v.warnings.find(x => x.message.indexOf('The question with the code "' + id + '" is missing') === 0);
    check(w && w.section === 'screens' && w.message.includes(column + ' column'), id + ': ' + JSON.stringify(v.warnings.map(x => x.message.slice(0, 80))));
    check(!v.errors.some(e => /is missing/.test(e.message)), id + ': it must stay a warning');
    out.push(w.message);
  });
  const hidden = fresh();
  hidden.screens.find(s => s.id === 'nps').active = false;
  check(!M.PP_validate(hidden, null).warnings.some(w => /The question with the code "nps" is missing/.test(w.message)), 'hiding nps must not warn');
  return out[0];
});

// 21 Oct (STATE item 8): the panel's checks and scripts/check_config.py use the
// same rules for logo and clip addresses, so a GitHub copy the panel accepts
// also passes the settings check that guards GitHub Pages.
const G11 = '11. Panel checks agree with check_config.py (logo, clips, round names)';

test(G11, 'clips: a bad address or a missing text is an error; https and web/ paths pass; switched-off languages are not checked', () => {
  const clipErrors = (clips) => {
    const m = fresh();
    m.clips = clips;
    return M.PP_validate(m, null).errors.filter(e => e.section === 'clips');
  };
  check(clipErrors({ 'q.nps': { hi: 'audio/hi/q.nps.mp3', en: 'https://example.org/en/q.nps.mp3' } }).length === 0, 'a web/ path and an https address must pass');
  const bad = clipErrors({ 'q.nps': { hi: 'http://example.org/q.nps.mp3', en: 'javascript:alert(1)' }, 'q.tell_more': { hi: 'audio/hi/a b.mp3', en: '/audio/en/x.mp3' } });
  check(bad.length === 4, '4 bad addresses, 4 errors: ' + JSON.stringify(bad.map(e => e.message)));
  check(bad.every(e => /^The read-aloud clip for the text "q\.(nps|tell_more)" in (hi|en) \(Audio clips tab\) must/.test(e.message)), 'each names its text and language: ' + bad[0].message);
  const typo = clipErrors({ 'q.npss': { hi: 'audio/hi/q.nps.mp3' } });
  check(typo.length === 1 && /is for a text that does not exist/.test(typo[0].message) && /Did you mean "q\.nps"\?/.test(typo[0].message), 'a typo gets a suggestion: ' + JSON.stringify(typo));
  check(clipErrors({ 'q.nps': { mr: 'not a path at all' } }).length === 0, 'a language that is not switched on is never published, so not checked');
  return bad[0].message;
});

test(G11, 'the logo rule is the same function as the clip rule', () => {
  const logoError = (logo) => {
    const m = fresh();
    m.settings['branding.logo'] = logo;
    return M.PP_validate(m, null).errors.filter(e => /Logo/.test(e.message));
  };
  check(logoError('https://example.org/logo.png').length === 0 && logoError('assets/logo.svg').length === 0 && logoError('').length === 0, 'https, a web/ path and empty must pass');
  ['http://example.org/logo.png', 'data:image/png;base64,AAAA', 'assets/my logo.svg', '../logo.svg'].forEach(bad => {
    check(logoError(bad).length === 1, bad + ' must be refused');
  });
});

test(G11, 'a GitHub copy with https clips and logo passes check_config.py; a dotted round name fails both', () => {
  const copyRoot = path.join(HERE, 'checkcopy');
  fs.rmSync(copyRoot, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'web'), path.join(copyRoot, 'web'), { recursive: true });
  const m = fresh();
  m.settings['branding.logo'] = 'https://example.org/logo.png';
  m.clips = { 'q.nps': { hi: 'https://example.org/hi/q.nps.mp3' } };
  check(M.PP_validate(m, null).errors.length === 0, 'the panel accepts it: ' + JSON.stringify(M.PP_validate(m, null).errors));
  const run = () => {
    try {
      return { code: 0, output: execFileSync('python3', [path.join(ROOT, 'scripts/check_config.py'), '--root', copyRoot], { encoding: 'utf8' }) };
    } catch (err) {
      return { code: err.status, output: String(err.stdout || '') + String(err.stderr || '') };
    }
  };
  const write = (model) => {
    const out = M.PP_exportStatic(model, { apps_script_url: '' });
    Object.keys(out).forEach(name => fs.writeFileSync(path.join(copyRoot, (name === 'strings.json' ? 'web/i18n/' : 'web/config/') + name), out[name]));
  };
  write(m);
  let r = run();
  check(r.code === 0, 'check_config.py refused the copy the panel accepts:\n' + r.output.split('\n').slice(0, 20).join('\n'));
  const dotted = fresh();
  dotted.whats_changed['2026.R2'] = [{ en: 'Payouts now arrive every Tuesday.', hi: 'पेमेंट अब हर मंगलवार आता है।' }];   // kept only with a bullet (not in Rounds)
  check(M.PP_validate(dotted, null).errors.some(e => /2026\.R2/.test(e.message)), 'the panel refuses a dotted round name');
  write(dotted);
  r = run();
  check(r.code === 1 && /round "2026\.R2" has a name that is not allowed/.test(r.output), 'check_config.py must refuse it too:\n' + r.output.split('\n').slice(0, 20).join('\n'));
  return (r.output.match(/Found: .*/) || ['?'])[0].trim();
});

// =============================================================================
// Report
// =============================================================================
const groups = [];
results.forEach(r => { if (!groups.includes(r.group)) groups.push(r.group); });
let failed = 0;
groups.forEach(group => {
  const list = results.filter(r => r.group === group);
  const bad = list.filter(r => !r.ok);
  failed += bad.length;
  console.log(`\n=== ${group}: ${list.length - bad.length}/${list.length} passed`);
  list.forEach(r => {
    if (!r.ok) {
      console.log(`  FAIL  ${r.name}\n        ${String(r.err && r.err.stack || r.err).split('\n').slice(0, 6).join('\n        ')}`);
    } else if (VERBOSE || group === G2 || group === G3 || (group === G4 && VERBOSE)) {
      console.log(`  ok    ${r.name}${r.info ? '\n        -> ' + r.info : ''}`);
    } else {
      console.log(`  ok    ${r.name}`);
    }
  });
  (notes[group] || []).forEach(line => console.log('  | ' + line));
});
console.log(`\nTOTAL: ${results.length - failed}/${results.length} passed, ${failed} failed`);
if (consoleLines.length) console.log('Model.gs console output during tests:\n  ' + consoleLines.join('\n  '));
process.exit(failed ? 1 : 0);

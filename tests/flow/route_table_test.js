/* =============================================================================
   tests/flow/route_table_test.js: checks "Paste a route" (27 Oct 2026), the
   table format of the questionnaire's route in web/js/flow-panel.js:
   PP.flowPanel.fromTable, toTable, templateCsv, aiInstruction and the small
   rule language (parseRule, ruleText, parseJumps, jumpsText).

   WHAT IT CHECKS
     1. The rule language both ways: every way of writing a rule the table
        accepts ("nps <= 6", "support_gate = yes", "language = hi", "round =
        2026-R2", "fn_rating:payments <= 2", "one_fix answered", "not
        answered", "!=", "in (a, b)", and / or with brackets) gives the
        condition JSON of docs/flow-engine.md 2.3, and printing that JSON gives
        the rule back; rules it can't write in words come back as JSON and
        still read back the same; bad rules give a plain-English problem. The
        same for jumps ("if nps >= 9 go to support_gate; ...").
     2. Every format: rows copied from Excel or Google Sheets (tabs, a cell
        with a line break in quotes, empty cells at the end, Windows line
        ends), a CSV file (a BOM, quotes, commas, doubled quotes, or ";"
        between cells), and the Markdown table an AI writes (with words around
        it, ``` fences, `code` and **bold**, <br>, \| inside a cell, with or
        without the outer | ). Header names are forgiving and case-insensitive.
     3. Every column and every kind of row, with the text keys the control
        panel uses (q.<code>, the built-in keys, choice.<code>.<answer>,
        end.<code>.title / body) and the [TRANSLATE] rule: English and the
        Hindi the table gives go in; every other language is "[TRANSLATE] " +
        English unless a real translation is already there. NOTHING is ever
        translated: checked on every result of this file.
     4. Problems with their row numbers (the header is row 1): an unknown
        kind, a rule on a code no row has, a jump back up the table, a missing
        built-in row (nps, support_gate, the thank-you screen), bad answers,
        and the rest; warnings that block nothing.
     5. Round trips: today's questionnaire, and a route with jumps, questions
        asked for each area, hidden rows and two endings: draft -> toTable ->
        fromTable gives the same rows and changes no text (TSV, CSV and
        Markdown); and today's draft -> table -> rows -> the graph Publish
        makes is exactly today's graph (also the repo's survey.json).
     6. The checker: what fromTable makes passes PP.flowCheck.check (the
        checker Publish uses) with no errors for every valid example, and the
        engine walks the pasted routes as the table says.
     7. templateCsv and aiInstruction: the template reads back as today's
        route; the instruction names every column, kind, area, problem code,
        support question and language, says never to translate, and its
        example table reads with no problems.
     7b. The review fixes of 27 Oct 2026 (round W8), each failing on the code
        before them: fillers ("NA", "-", "TBD" ...) are empty cells; new or
        changed translations and built-in English are told; a route below
        the thank-you that runs on into another is a problem; a live
        question keeps its kind; only the first "thank you" row is the main
        one; the answers cell (AI marks, ";" in quotes, at least 2 answers);
        the Screens tab and text keys; headers in Hindi script; what comes
        after the table; unknown rounds; endings' rules and place; the
        checker's words; and the instruction's new rules.
     8. A kind of question added as a plug-in (the guide's example
        tests/flow/fixtures/types/stars_1_10.js) works in the table too.
     9. flow-panel.js is still ES5 (Chrome 61, Apps Script).

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/route_table_test.js
     One line starting with PASS per check, then "N tests passed". A mistake
     stops it with an error naming what was expected (exit code 1).
     Needs acorn from "cd tests && npm install" for check 9 (else it says SKIP).

   WHAT IT READS / WRITES
     Reads web/js/flow.js, web/js/flow-panel.js, web/js/flow-check.js,
     web/config/survey.json, web/i18n/strings.json, the FAKE example tables
     in tests/flow/fixtures/route-table/ and the example kind
     tests/flow/fixtures/types/stars_1_10.js. Writes nothing.
   ============================================================================= */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');

const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/flow/)
const flow = require(path.join(REPO, 'web/js/flow.js'));
const panel = require(path.join(REPO, 'web/js/flow-panel.js'));
const checker = require(path.join(REPO, 'web/js/flow-check.js'));
const SURVEY_FILE = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const STRINGS = JSON.parse(fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8'));
delete STRINGS._help;
const FIXTURES = path.join(__dirname, 'fixtures', 'route-table');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

let count = 0;
const ok = (name) => { count++; console.log('PASS', name); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const deep = (a, b, what) => assert.ok(util.isDeepStrictEqual(clone(a), clone(b)),
  (what || 'not equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b));
const TODO = '[TRANSLATE] ';
const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];

/* The questionnaire as the control panel passes it (its draftSurvey: no "flow"). */
function survey(patch) {
  const s = clone(SURVEY_FILE);
  delete s.flow;
  Object.keys(s).forEach((k) => { if (k.charAt(0) === '_') delete s[k]; });
  if (patch) Object.keys(patch).forEach((k) => { s[k] = clone(patch[k]); });
  return s;
}
/* A Screens row as the panel keeps it (every field present). */
function row(fields) {
  return Object.assign({ id: '', type: '', text: '', required: null, show_if: null, skip_if: '', options: [], low_label: '',
    high_label: '', scale_hint: '', body: '', active: true, next: '', jumps: [], repeat: '' }, fields);
}
/* Today's rows: what the panel shows after "Import from GitHub" (the repo's graph as rows). */
function todayRows() {
  const back = panel.toRows(SURVEY_FILE.flow, SURVEY_FILE);
  deep(back.unsupported, [], 'the repo graph reads as rows');
  return back.screens;
}
/* A text in every language: English, the Hindi given (or [TRANSLATE]), the rest [TRANSLATE]. */
function words(en, hi, extra) {
  const out = {};
  LANGS.forEach((L) => { out[L] = L === 'en' ? en : (L === 'hi' && hi ? hi : TODO + en); });
  return Object.assign(out, extra || {});
}
function withTexts(strings, texts) {
  const out = clone(strings);
  Object.keys(texts).forEach((k) => { out[k] = clone(texts[k]); });
  return out;
}

/* NOTHING IS EVER TRANSLATED: every word fromTable writes in a language other
   than English is the table's own (Hindi it was given), a translation that was
   already there (under that key, or the standard 0-10 labels it copies, as the
   panel does), or the [TRANSLATE] placeholder. */
function assertNothingTranslated(res, tableText, strings, label) {
  const LABELS = { '.low': 'nps.low', '.high': 'nps.high', '.hint': 'nps.scale_hint' };
  Object.keys(res.texts).forEach((key) => {
    const v = res.texts[key];
    assert.ok(typeof v.en === 'string' && v.en.trim(), label + ': ' + key + ' has English');
    Object.keys(v).forEach((L) => {
      if (L === 'en') return;
      const x = v[L];
      const old = strings[key];
      const suffix = Object.keys(LABELS).filter((s) => key.endsWith(s))[0];
      const fine = x === TODO + v.en || (old && old[L] === x) ||
        (L !== 'en' && tableText.indexOf(x) !== -1 && !x.startsWith('[TRANSLATE]')) ||
        (suffix && strings[LABELS[suffix]] && strings[LABELS[suffix]][L] === x);
      assert.ok(fine, label + ': ' + key + ' / ' + L + ' was not given, not kept and not [TRANSLATE]: ' + JSON.stringify(x));
    });
  });
}

/* The checker Publish uses, on what fromTable made: its errors (with the merged texts, so T1 checks them too). */
function checkerErrors(res, strings, s) {
  assert.ok(res.survey && res.survey.flow, 'fromTable gives the compiled survey when there are no problems');
  const hidden = [];
  res.rows.forEach((r) => {
    if (r.active === false) { hidden.push(r.id); r.options.forEach((o) => hidden.push(o)); }
  });
  const sv = clone(res.survey);
  const out = checker.check(sv, withTexts(strings, res.texts), { surface: 'panel', hiddenCodes: hidden });
  return out.findings.filter((f) => f.level === 'error');
}

/* The screens the real engine shows for some answers. */
function walk(sv, answers, facts) {
  const steps = flow.path(flow.load(sv), sv, { facts: Object.assign({ lang: 'en', lang_in_url: true, whats_changed_count: 0, round: 'R1' }, facts || {}) },
    { answers: answers || {}, texts: {}, audio: {} });
  return steps.map((x) => x.id);
}
const graphText = (rows, s) => panel.formatFlow(panel.fromRows(rows, s).graph);
/* Every call of fromTable in this file goes through here, so "nothing is translated" is checked on every result. */
function fromTable(text, s, strings, opts) {
  const res = panel.fromTable(text, s, strings, opts);
  assertNothingTranslated(res, String(text), strings || {}, 'fromTable');
  return res;
}

// ---------------------------------------------------------------------------
// 1. The rule language
// ---------------------------------------------------------------------------
const RULES = [
  ['nps <= 6', { answer: 'nps', at_most: 6 }],
  ['nps >= 9', { answer: 'nps', at_least: 9 }],
  ['support_gate = yes', { answer: 'support_gate', equals: 'yes' }],
  ['support_gate != yes', { answer: 'support_gate', not_equals: 'yes' }],
  ['language = hi', { fact: 'lang', equals: 'hi' }],
  ['round = 2026-R2', { fact: 'round', equals: '2026-R2' }],
  ['round = 2026', { fact: 'round', equals: '2026' }],
  ['fn_rating:payments <= 2', { answer: 'fn_rating:payments', at_most: 2 }],
  ['fn_rating:app = na', { answer: 'fn_rating:app', equals: 'na' }],
  ['fn_rating:payments in (1, 2)', { answer: 'fn_rating:payments', in: [1, 2] }],
  ['fn_deep_dive:payments = payout_delayed', { answer: 'fn_deep_dive:payments', equals: 'payout_delayed' }],
  ['callback:losses = yes', { answer: 'callback:losses', equals: 'yes' }],
  ['one_fix answered', { answer: 'one_fix', answered: true }],
  ['one_fix not answered', { answer: 'one_fix', answered: false }],
  ['language in (hi, ta)', { fact: 'lang', in: ['hi', 'ta'] }],
  ['whats_changed_count >= 1', { fact: 'whats_changed_count', at_least: 1 }],
  ['lang_in_url = false', { fact: 'lang_in_url', equals: false }],
  ['nps = "6"', { answer: 'nps', equals: '6' }],
  ['support_gate = "Yes"', { answer: 'support_gate', equals: 'Yes' }],
  ['language = "hindi"', { fact: 'lang', equals: 'hindi' }],
  ['nps <= 6 and support_gate = yes', { all: [{ answer: 'nps', at_most: 6 }, { answer: 'support_gate', equals: 'yes' }] }],
  ['nps <= 6 or one_fix answered', { any: [{ answer: 'nps', at_most: 6 }, { answer: 'one_fix', answered: true }] }],
  ['(nps <= 6 or one_fix answered) and language = hi',
    { all: [{ any: [{ answer: 'nps', at_most: 6 }, { answer: 'one_fix', answered: true }] }, { fact: 'lang', equals: 'hi' }] }],
  ['nps <= 6 and (support_gate = no or round = R2) and language != ml',
    { all: [{ answer: 'nps', at_most: 6 }, { any: [{ answer: 'support_gate', equals: 'no' }, { fact: 'round', equals: 'R2' }] }, { fact: 'lang', not_equals: 'ml' }] }],
  ['not (nps >= 9)', { not: { answer: 'nps', at_least: 9 } }],
  ['not (support_gate = yes and one_fix answered)', { not: { all: [{ answer: 'support_gate', equals: 'yes' }, { answer: 'one_fix', answered: true }] } }]
];
{
  RULES.forEach(([text, json]) => {
    const r = panel.parseRule(text, { languages: LANGS });
    assert.ok(!r.problem, text + ': ' + r.problem);
    deep(r.rule, json, 'reads "' + text + '"');
    assert.strictEqual(panel.ruleText(json), text, 'writes ' + JSON.stringify(json));
  });
  ok('the rule language: ' + RULES.length + ' rules read as the condition JSON, and the JSON is written back as the same words');
}
{
  const OTHER = [
    ['NPS < 7', { answer: 'nps', at_most: 6 }],
    ['nps > 8', { answer: 'nps', at_least: 9 }],
    ['nps \u2264 6', { answer: 'nps', at_most: 6 }],
    ['nps \u2265 9', { answer: 'nps', at_least: 9 }],
    ['support_gate is yes', { answer: 'support_gate', equals: 'yes' }],
    ['support_gate == Yes', { answer: 'support_gate', equals: 'yes' }],
    ['Support_Gate = YES', { answer: 'support_gate', equals: 'yes' }],
    ['support_gate is not yes', { answer: 'support_gate', not_equals: 'yes' }],
    ['support_gate <> yes', { answer: 'support_gate', not_equals: 'yes' }],
    ['support_gate \u2260 yes', { answer: 'support_gate', not_equals: 'yes' }],
    ["support_gate = 'yes'", { answer: 'support_gate', equals: 'yes' }],
    ['support_gate = \u201cyes\u201d', { answer: 'support_gate', equals: 'yes' }],
    ['language = Hindi', { fact: 'lang', equals: 'hi' }],
    ['lang = hi', { fact: 'lang', equals: 'hi' }],
    ['round = 2026-r2', { fact: 'round', equals: '2026-r2' }],
    ['one_fix is answered', { answer: 'one_fix', answered: true }],
    ['one_fix is not answered', { answer: 'one_fix', answered: false }],
    ['nps <= 6 && support_gate = yes', { all: [{ answer: 'nps', at_most: 6 }, { answer: 'support_gate', equals: 'yes' }] }],
    ['nps <= 6 || one_fix answered', { any: [{ answer: 'nps', at_most: 6 }, { answer: 'one_fix', answered: true }] }],
    ['NPS<=6 AND support_gate=yes', { all: [{ answer: 'nps', at_most: 6 }, { answer: 'support_gate', equals: 'yes' }] }],
    ['x not in (a, b)', { not: { answer: 'x', in: ['a', 'b'] } }],
    ['(nps <= 6)', { answer: 'nps', at_most: 6 }],
    ['not nps >= 9', { not: { answer: 'nps', at_least: 9 } }],
    ['nps = -1', { answer: 'nps', equals: -1 }],
    ['{"answer": "nps", "at_most": 6}', { answer: 'nps', at_most: 6 }]
  ];
  OTHER.forEach(([text, json]) => {
    const r = panel.parseRule(text, { languages: LANGS });
    assert.ok(!r.problem, text + ': ' + r.problem);
    deep(r.rule, json, 'reads "' + text + '"');
  });
  ['', '  ', 'always', 'Always', 'everyone'].forEach((text) => deep(panel.parseRule(text), { rule: null }, 'no rule: "' + text + '"'));
  ok('the rule language also reads <, >, the panel\'s signs, is / is not, ==, <>, quotes, language names, && and ||, not in, and JSON');
}
{
  const BAD = [
    ['nps <= 6 and support_gate = yes or one_fix answered', /mixes "and" and "or" without brackets/],
    ['nps <=', /a value is missing/],
    ['nps <= six', /"<=" needs a number/],
    ['nps', /a comparison \(=, !=, <=, >=, in, answered\) is missing after "nps"/],
    ['(nps <= 6', /a "\(" is not closed with "\)"/],
    ['nps <= 6 support_gate = yes', /something after the end of the rule/],
    ['language answered', /"answered" works on answers, not on the language/],
    ['nps < 6.5', /works only with whole numbers/],
    ['support_gate = "yes', /a text in quotes is not closed/],
    ['{nps <= 6}', /cannot be read as JSON/],
    ['[1, 2]', /"\[1" is not a question code/],
    ['2 <= nps', /"2" is not a question code/],
    ['x in 1, 2', /"in" needs a list in brackets/],
    ['= yes', /a question code is missing/],
    ['nps ~ 6', /a comparison \(=, !=, <=, >=, in, answered\) is missing after "nps" \(at "~ 6"\)/]
  ];
  BAD.forEach(([text, re]) => {
    const r = panel.parseRule(text, { languages: LANGS });
    assert.ok(r.problem && re.test(r.problem), '"' + text + '" gives a plain problem matching ' + re + ', got ' + JSON.stringify(r));
    assert.ok(!/undefined|\[object Object\]|NaN/.test(r.problem), 'plain English: ' + r.problem);
  });
  ok('bad rules give a plain-English problem (' + BAD.length + ' kinds of mistake)');
}
{
  // Rules the words can't say exactly are written as JSON, and read back the same.
  const ODD = [
    { all: [{ answer: 'nps', at_most: 6 }] },
    { answer: 'fn_rating:{area}', at_most: 2 },
    { var: 'area.threshold', at_most: 2 },
    { answer: 'nps', at_most: 6, equals: 3 },
    { answer: 'nps', at_most: '6' },
    { answer: 'round', equals: 'x' },
    { answer: 'nps', equals: null },
    { answer: 'nps', in: [] },
    { fact: 'lang', answered: true },
    { answer: 'nps', at_most: 6, _note: 'hand-written' }
  ];
  ODD.forEach((rule) => {
    const text = panel.ruleText(rule);
    assert.strictEqual(text.charAt(0), '{', 'written as JSON: ' + text);
    deep(panel.parseRule(text).rule, rule, 'JSON reads back: ' + text);
  });
  assert.strictEqual(panel.ruleText(null), '');
  assert.strictEqual(panel.ruleText({ unreadable: 'nps <= ' }), 'nps <= ', 'a rule the Sheet could not read is shown as typed');
  ok('rules the words cannot say are written as JSON and read back unchanged');
}
{
  const J = [{ when: { answer: 'nps', at_least: 9 }, goto: 'support_gate' }, { when: { any: [{ answer: 'nps', at_most: 2 }, { fact: 'round', equals: 'R1' }] }, goto: 'why_low' }];
  const text = 'if nps >= 9 go to support_gate; if nps <= 2 or round = R1 go to why_low';
  assert.strictEqual(panel.jumpsText(J), text);
  deep(panel.parseJumps(text), { list: J, problems: [] }, 'reads back');
  const same = [
    'If nps >= 9, then go to support_gate\nif nps <= 2 or round = R1 -> why_low',
    'when nps >= 9 then support_gate; if (nps <= 2 or round = R1) goto why_low',
    'if nps >= 9 go to Support_Gate;; if nps <= 2 or round = R1 \u2192 why_low.',
    JSON.stringify(J)
  ];
  same.forEach((t) => deep(panel.parseJumps(t), { list: J, problems: [] }, 'reads ' + JSON.stringify(t)));
  deep(panel.parseJumps('if nps <= 3 go to the end').list, [{ when: { answer: 'nps', at_most: 3 }, goto: '@end' }], '"the end" is the main thank-you');
  deep(panel.parseJumps(''), { list: [], problems: [] });
  const bad = panel.parseJumps('if nps >= 9; go to why_low; if nps >= go to x; if nps >= 9 go to; if nps <= 1 and go to x');
  assert.strictEqual(bad.problems.length, 5, JSON.stringify(bad.problems));
  assert.ok(/jump 1 .*does not say where to go/.test(bad.problems[0]), bad.problems[0]);
  assert.ok(/jump 2 .*rule before "go to" is missing/.test(bad.problems[1]), bad.problems[1]);
  assert.ok(/jump 3 .*value is missing/.test(bad.problems[2]), bad.problems[2]);
  assert.ok(/jump 4 .*code to go to is missing/.test(bad.problems[3]), bad.problems[3]);
  assert.ok(/jump 5 /.test(bad.problems[4]), bad.problems[4]);
  const odd = [{ when: { var: 'x' }, goto: 'a' }];
  assert.strictEqual(panel.jumpsText(odd), JSON.stringify(odd), 'jumps the words cannot say are written as JSON');
  deep(panel.parseJumps(panel.jumpsText(odd)).list, odd, 'and read back');
  assert.strictEqual(panel.jumpsText({ unreadable: 'if nps go' }), 'if nps go', 'unreadable jumps are shown as typed');
  ok('jumps: "if <rule> go to <code>", several with ";" or one per line, "then" / "->" / goto, JSON both ways, and plain problems');
}

// ---------------------------------------------------------------------------
// 2. Every format
// ---------------------------------------------------------------------------
{
  const s = survey();
  const res = fromTable(fixture('excel-copy.tsv'), s, STRINGS);
  assert.strictEqual(res.format, 'tsv');
  deep(res.problems, [], 'no problems');
  deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[7, 'question (Hindi)', 'callback'], [8, 'question (Hindi)', 'visit_type'],
    [8, 'answers (Hindi)', 'visit_type'], [11, 'show only if', 'old_question']],
    'the new Hindi (one warning per cell: a person must have written it), and the hidden row\'s rule on a code that is gone (a warning, ' +
    'as it is hidden); the Notes column and the empty one are left out quietly');
  assert.strictEqual(res.warnings[0].message, 'Row 7 (callback), question (Hindi): new Hindi words: "\u0939\u093f\u0902\u0926\u0940 1". Keep them ' +
    'only if a person wrote them: the panel never translates, and an AI must not either.');
  assert.ok(/^Row 8 \(visit_type\), answers \(Hindi\): the Hindi words of 2 answers are new or change: phone: "\u0939\u093f\u0902\u0926\u0940 3" \(new\); visit: "\u0939\u093f\u0902\u0926\u0940 4" \(new\)\. Keep them only if a person wrote them/.test(res.warnings[2].message), res.warnings[2].message);
  const r = (id) => res.rows.find((x) => x.id === id);
  deep(res.rows.map((x) => x.id), ['language', 'whats_changed', 'nps', 'fn_ratings', 'fn_deep_dives', 'callback', 'visit_type', 'support_gate',
    'support', 'old_question', 'note_card', 'one_fix', 'thanks', 'why_low', 'low_end']);
  deep(r('note_card'), row({ id: 'note_card', type: 'info_card', text: 'q.note_card', body: 'q.note_card.body', show_if: { fact: 'lang', equals: 'hi' } }),
    'an info card with a message on two lines (a quoted Excel cell)');
  deep(res.texts['q.note_card.body'], words('Line one\nLine two'), 'the line break is kept');
  deep(r('nps').jumps, [{ when: { answer: 'nps', at_most: 3 }, goto: 'why_low' }, { when: { answer: 'nps', at_least: 9 }, goto: 'support_gate' }]);
  assert.strictEqual(r('old_question').active, false, 'show = no hides the row');
  assertNothingTranslated(res, fixture('excel-copy.tsv'), STRINGS, 'excel-copy');
  ok('rows copied from Excel / Google Sheets: tabs, Windows line ends, a quoted cell with a line break, empty and unknown-but-ignored columns');
}
{
  const s = survey();
  const text = fixture('template-filled.csv');
  assert.strictEqual(text.charCodeAt(0), 0xfeff, 'the fixture starts with a BOM, as Excel saves "CSV UTF-8"');
  const res = fromTable(text, s, STRINGS);
  assert.strictEqual(res.format, 'csv');
  deep(res.problems, []);
  deep(res.warnings, []);
  const who = res.rows.find((x) => x.id === 'who_answered');
  deep(who, row({ id: 'who_answered', type: 'single_choice', text: 'q.who_answered', required: true, options: ['agent', 'ivr', 'nobody'],
    show_if: { answer: 'support_gate', equals: 'yes' }, jumps: [{ when: { answer: 'who_answered', equals: 'nobody' }, goto: 'one_fix' }] }));
  assert.strictEqual(res.texts['q.who_answered'].en, 'When you call, who picks up?', 'a comma inside quotes');
  assert.strictEqual(res.texts['choice.who_answered.ivr'].en, 'The phone menu ("IVR")', 'doubled quotes');
  assert.strictEqual(res.texts['choice.who_answered.nobody'].en, 'Nobody, it rings out', 'a comma in an answer');
  deep(res.rows.find((x) => x.id === 'agent_name').show_if, { answer: 'who_answered', in: ['agent', 'ivr'] }, 'a quoted rule with a comma');
  // the same table with ";" between the cells (Excel in some countries)
  const semi = text.replace(/^\ufeff/, '').split('\r\n').map((line) => {
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '""'; i++; } else if (ch === '"') { q = false; cur += ch; } else cur += ch; }
      else if (ch === '"') { q = true; cur += ch; } else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => (/;/.test(c) && c.charAt(0) !== '"' ? '"' + c + '"' : c)).join(';');
  }).join('\n');
  const res2 = fromTable(semi, s, STRINGS);
  deep(res2.problems, [], 'semicolon CSV: no problems');
  deep(res2.rows, res.rows, 'semicolon CSV: the same rows');
  deep(res2.texts, res.texts, 'semicolon CSV: the same texts');
  assertNothingTranslated(res, text, STRINGS, 'template-filled');
  ok('a CSV file: BOM, Windows line ends, quotes around commas, doubled quotes; and the same with ";" between cells');
}
{
  const s = survey();
  const text = fixture('ai-answer.md');
  const res = fromTable(text, s, STRINGS);
  assert.strictEqual(res.format, 'markdown');
  deep(res.problems, []);
  deep(res.warnings.map((w) => w.message), ['The line of other text above the table is left out.',
    'The line of other text below the table is left out.'], 'the words around the table are counted, above and below');
  const r = (id) => res.rows.find((x) => x.id === id);
  deep(res.rows.map((x) => x.id), ['language', 'nps', 'fn_ratings', 'fn_deep_dives', 'support_gate', 'support', 'one_fix', 'thanks', 'effort',
    'effort_why', 'detractor_end'], '`code` cells read as codes; the words after the table are left out');
  assert.strictEqual(res.texts['q.effort'].en, 'How easy is it to work with Valmo | day to day?', '\\| is a | inside a cell');
  assert.strictEqual(res.texts['q.effort_why'].en, 'What makes it hard?\nTell us in your own words.', '<br> is a line break');
  assert.strictEqual(res.texts['end.detractor_end.title'].en, 'Thank you, we will look into it', '**bold** around a whole cell is dropped');
  assert.strictEqual(r('one_fix').next, 'thanks', '"then go to: end" is the main thank-you screen');
  deep([r('effort').low_label, r('effort').high_label, r('effort').scale_hint], ['q.effort.low', 'q.effort.high', 'q.effort.hint'], 'a new 0 to 10 question gets its own end labels');
  deep(res.texts['q.effort.low'], words('Very hard'), 'the left end from the table');
  deep(res.texts['q.effort.hint'], STRINGS['nps.scale_hint'], 'no hint given: the standard one, copied as the panel does');
  assertNothingTranslated(res, text, STRINGS, 'ai-answer');
  // without outer pipes, and without a fence
  const bare = 'Here you go\n\ncode | kind | question (English)\n--- | --- | ---\nnps | nps |\nsupport_gate | support question |\nthanks | thank you |\n\nThanks!';
  const res2 = fromTable(bare, s, STRINGS);
  assert.strictEqual(res2.format, 'markdown');
  deep(res2.problems, [], 'GFM table without outer pipes');
  deep(res2.rows.map((x) => x.id), ['nps', 'support_gate', 'thanks']);
  // a table copied from the chat window (the browser copies a rendered table as tabs), with words above
  const copied = 'Here is the table:\n\ncode\tkind\tquestion (English)\tshow only if\nnps\tnps\t\t\nsupport_gate\tsupport question\t\t\n' +
    'detail\tvoice/typing\tWhat should we know?\tnps <= 6\nthanks\tthank you\t\t\n';
  const res3 = fromTable(copied, s, STRINGS);
  assert.strictEqual(res3.format, 'tsv');
  deep(res3.problems, []);
  deep(res3.warnings.map((w) => w.message), ['The line of other text above the table is left out.']);
  // CSV inside a ``` fence with chatter after it
  const fenced = 'Sure.\n```csv\ncode,kind,question (English)\nnps,nps,\nsupport_gate,support question,\nthanks,thank you,\n```\nAnything else?';
  const res4 = fromTable(fenced, s, STRINGS);
  assert.strictEqual(res4.format, 'csv');
  deep(res4.problems, []);
  deep(res4.rows.map((x) => x.id), ['nps', 'support_gate', 'thanks']);
  // a line of words under a CSV without a fence is not a row
  const trailing = 'code,kind\nnps,nps\nsupport_gate,support question\nthanks,thank you\nLet me know if you need anything else.\n';
  const res5 = fromTable(trailing, s, STRINGS);
  deep(res5.problems, []);
  deep(res5.warnings.map((w) => [w.row, w.message]), [[5, 'Row 5: this line is not a row of the table, so it is left out: "Let me know if you need anything else.".']]);
  // ... even when those words have commas (they look like cells)
  const res6 = fromTable(trailing + '\nNote: codes are in small letters, as you asked, and nothing is translated.\n', s, STRINGS);
  deep(res6.problems, []);
  deep(res6.warnings.map((w) => w.row), [5, 7], 'both lines under the table are left out, with a warning');
  // a broken row in the middle of the table is still a problem
  const res7 = fromTable('code,kind\nnps,nps\nQ 1,yes no maybe\nsupport_gate,support question\nthanks,thank you\n', s, STRINGS);
  deep(res7.problems.map((p) => [p.row, p.column]), [[3, 'kind'], [3, 'code']], 'a bad row above real rows is not skipped: its kind and code are problems');
  ok('the AI\'s Markdown table: words around it, ``` fences, `code`, **bold**, <br>, \\|, other header names; also without outer pipes, copied from the chat window, and CSV in a fence');
}
{
  // Header names: case and spelling don't matter.
  const s = survey();
  const variants = [
    ['Code', 'Kind', 'Question (English)', 'Question (Hindi)', 'Show only if', 'Then go to', 'Jumps', 'Ask for (once / each area / each area rated low)', 'Show (yes/no)', 'Required (yes/no)'],
    ['id', 'type', 'question_en', 'question_hi', 'show_if', 'next', 'jump', 'repeat', 'visible', 'mandatory'],
    ['CODE', 'TYPE', 'English', 'Hindi', 'Show if', 'Go to', 'Branches', 'Ask', 'Active', 'Must answer'],
    ['code', 'kind', 'English question', 'Hindi question', 'condition', 'usually go to', 'jump rules', 'asked for', 'shown', 'compulsory']
  ];
  const body = [
    ['nps', 'nps', 'How likely are you to recommend Valmo to another DC owner?', '', '', '', 'if nps <= 3 go to why_low', '', 'yes', 'yes'],
    ['speed', 'faces', 'How fast are payouts?', '\u0939\u093f\u0902\u0926\u0940 1', 'nps <= 6', '', '', 'each area', 'yes', ''],
    ['support_gate', 'support question', 'In the last 30 days, did you contact Valmo support?', '', '', '', '', '', 'yes', 'yes'],
    ['thanks', 'thank you', '', '', '', '', '', '', 'yes', ''],
    ['why_low', 'voice/typing', 'What went wrong?', '', '', 'low_end', '', '', 'yes', 'no'],
    ['low_end', 'ending', 'Thanks for telling us', '', '', '', '', '', 'yes', '']
  ];
  let first = null;
  variants.forEach((header) => {
    const res = fromTable([header].concat(body).map((r) => r.join('\t')).join('\n'), s, STRINGS);
    deep(res.problems, [], header.join(' | '));
    deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[3, 'question (Hindi)', 'speed']], header.join(' | ') +
      ': only the new Hindi is told (a person must have written it)');
    if (!first) first = res; else { deep(res.rows, first.rows, 'same rows: ' + header.join(' | ')); deep(res.texts, first.texts, 'same texts'); }
  });
  const speed = first.rows.find((x) => x.id === 'speed');
  deep(speed, row({ id: 'speed', type: 'rating_1_5', text: 'q.speed', show_if: { answer: 'nps', at_most: 6 }, repeat: 'each_area' }));
  ok('header names are forgiving and case-insensitive: ' + variants.length + ' spellings of the same table give the same route');
}

// ---------------------------------------------------------------------------
// 3. Every column and every kind
// ---------------------------------------------------------------------------
{
  const s = survey();
  const H = ['code', 'kind', 'question (English)', 'question (Hindi)', 'answers', 'answers (Hindi)', 'message (English)', 'message (Hindi)',
    'left end', 'right end (English)', 'hint (Hindi)', 'required', 'show only if', 'then go to', 'jumps', 'ask for', 'show'];
  const T = [
    ['language', 'language', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['whats_changed', 'what changed', '', '', '', '', '', '', '', '', '', '', 'always', '', '', '', 'yes'],
    ['nps', 'nps', 'How likely are you to recommend Valmo to another DC owner?', '', '', '', '', '', '', '', '', 'yes', '', '',
      'if nps <= 2 go to short_q; if nps >= 9 go to support_gate', '', 'yes'],
    ['fn_ratings', 'area ratings', '', '', '', '', '', '', '', '', '', 'no', '', '', '', '', 'yes'],
    ['fn_deep_dives', 'problem screens', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['effort', '0 to 10', 'How easy is Valmo to work with?', '\u0939\u093f\u0902\u0926\u0940 1', '', '', '', '', 'Very hard', 'Very easy', '\u0939\u093f\u0902\u0926\u0940 2', '', '', '', '', '', 'yes'],
    ['speed', 'faces', 'How fast are payouts?', '', '', '', '', '', '', '', '', 'no', 'nps <= 6', '', '', 'each area rated low', 'yes'],
    ['callback', 'yes/no', 'Should we call you?', '', '', '', '', '', '', '', '', '', '', 'channel', '', '', 'yes'],
    ['channel', 'pick one', 'Which channel do you use most?', '\u0939\u093f\u0902\u0926\u0940 3', 'whatsapp: WhatsApp; phone: Phone call; email: Email',
      'whatsapp: \u0939\u093f\u0902\u0926\u0940 4; phone: \u0939\u093f\u0902\u0926\u0940 5', '', '', '', '', '', 'yes', '', '', 'if channel:losses = email go to one_fix', 'each area', 'yes'],
    ['support_gate', 'support question', 'In the last 30 days, did you contact Valmo support?', '', '', '', '', '', '', '', '', 'yes', '', '', '', '', 'yes'],
    ['support', 'support ratings', '', '', '', '', '', '', '', '', '', '', 'support_gate = yes', '', '', '', 'yes'],
    ['tip', 'info card', 'A tip', '', '', '', 'Keep your app updated.', '\u0939\u093f\u0902\u0926\u0940 6', '', '', '', '', '', '', '', 'once', 'yes'],
    ['one_fix', 'voice/typing', 'If Valmo could fix just one thing for you, what should it be?', '', '', '', '', '', '', '', '', 'no', '', '', '', '', 'yes'],
    ['thanks', 'thank you', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['short_q', 'voice/typing', 'Tell us what went wrong.', '', '', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['short_end', 'ending', 'Sorry to hear that', '', '', '', 'We will call you.', '', '', '', '', '', '', '', '', '', 'yes'],
    ['spare', 'yes/no', 'A spare question', '', '', '', '', '', '', '', '', '', '', '', '', '', 'no']
  ];
  const text = [H].concat(T).map((r) => r.join('\t')).join('\n');
  const res = fromTable(text, s, STRINGS);
  deep(res.problems, []);
  deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[7, 'question (Hindi)', 'effort'], [7, 'hint (Hindi)', 'effort'],
    [10, 'question (Hindi)', 'channel'], [10, 'answers (Hindi)', 'channel'], [13, 'message (Hindi)', 'tip']],
    'only the new Hindi, one warning per cell (never translated: a person must have written it)');
  res.warnings.forEach((w) => assert.ok(/Keep them only if a person wrote them: the panel never translates, and an AI must not either\.$/.test(w.message), w.message));
  const r = (id) => res.rows.find((x) => x.id === id);
  deep(res.rows.map((x) => [x.id, x.type]), [['language', 'language_picker'], ['whats_changed', 'whats_changed'], ['nps', 'nps_0_10'],
    ['fn_ratings', 'function_ratings'], ['fn_deep_dives', 'function_deep_dives'], ['effort', 'nps_0_10'], ['speed', 'rating_1_5'], ['callback', 'yes_no'],
    ['channel', 'single_choice'], ['support_gate', 'yes_no'], ['support', 'support_block'], ['tip', 'info_card'], ['one_fix', 'free_text'],
    ['thanks', 'thank_you'], ['short_q', 'free_text'], ['short_end', 'thank_you'], ['spare', 'yes_no']], 'every kind');
  deep(r('language'), row({ id: 'language', type: 'language_picker', skip_if: 'lang_in_url' }), 'language: skipped when the link says the language');
  deep(r('whats_changed'), row({ id: 'whats_changed', type: 'whats_changed', skip_if: '' }), '"always": what changed is never skipped');
  deep(r('fn_ratings').required, false, 'required = no on the area ratings (their Skip button)');
  deep(r('effort'), row({ id: 'effort', type: 'nps_0_10', text: 'q.effort', low_label: 'q.effort.low', high_label: 'q.effort.high', scale_hint: 'q.effort.hint' }));
  deep(res.texts['q.effort.low'], words('Very hard'), 'left end');
  deep(res.texts['q.effort.high'], words('Very easy'), 'right end');
  deep(res.texts['q.effort.hint'], Object.assign(clone(STRINGS['nps.scale_hint']), { hi: '\u0939\u093f\u0902\u0926\u0940 2' }), 'hint: only the Hindi given, the English kept');
  deep(r('speed'), row({ id: 'speed', type: 'rating_1_5', text: 'q.speed', required: false, show_if: { answer: 'nps', at_most: 6 }, repeat: 'each_low_area' }));
  deep(r('callback'), row({ id: 'callback', type: 'yes_no', text: 'q.callback', next: 'channel' }), 'then go to');
  deep(r('channel'), row({ id: 'channel', type: 'single_choice', text: 'q.channel', required: true, options: ['whatsapp', 'phone', 'email'],
    jumps: [{ when: { answer: 'channel:losses', equals: 'email' }, goto: 'one_fix' }], repeat: 'each_area' }));
  deep(res.texts['choice.channel.whatsapp'], words('WhatsApp', '\u0939\u093f\u0902\u0926\u0940 4'), 'answers (Hindi) by code');
  deep(res.texts['choice.channel.phone'], words('Phone call', '\u0939\u093f\u0902\u0926\u0940 5'));
  deep(res.texts['choice.channel.email'], words('Email'), 'an answer without Hindi: [TRANSLATE]');
  deep(r('tip'), row({ id: 'tip', type: 'info_card', text: 'q.tip', body: 'q.tip.body' }));
  deep(res.texts['q.tip.body'], words('Keep your app updated.', '\u0939\u093f\u0902\u0926\u0940 6'), 'message and its Hindi');
  deep(r('thanks'), row({ id: 'thanks', type: 'thank_you' }), 'thank you: the standard words');
  deep(r('short_end'), row({ id: 'short_end', type: 'thank_you', text: 'end.short_end.title', body: 'end.short_end.body' }), 'ending: its own words');
  deep(res.texts['end.short_end.body'], words('We will call you.'));
  deep(r('spare').active, false, 'show = no');
  assert.strictEqual(r('one_fix').required, false);
  deep(Object.keys(res.texts).sort(), ['choice.channel.email', 'choice.channel.phone', 'choice.channel.whatsapp', 'end.short_end.body', 'end.short_end.title',
    'q.callback', 'q.channel', 'q.effort', 'q.effort.high', 'q.effort.hint', 'q.effort.low', 'q.short_q', 'q.spare', 'q.speed', 'q.tip', 'q.tip.body'].sort(),
    'only the new texts (today\'s questions keep their words: nothing to change)');
  assertNothingTranslated(res, text, STRINGS, 'every kind');
  deep(checkerErrors(res, STRINGS, s), [], 'the checker Publish uses finds no errors');
  const sv = res.survey;
  deep(walk(sv, { nps: 1 }), ['whats_changed', 'nps', 'short_q', 'short_end'], 'nps 1: the jump to the short route and its ending ("what changed" always shows)');
  deep(walk(sv, { nps: 10 }).slice(0, 3), ['whats_changed', 'nps', 'support_gate'], 'nps 10: the second jump');
  ok('every column (incl. answers / message / left end / right end / hint in English and Hindi) and every kind of row, as the panel\'s rows and text keys');
}
{
  // The words: what changes and what is kept.
  const s = survey();
  const strings = clone(STRINGS);
  strings['q.callback'] = { en: 'Should we call you?', hi: '\u0939\u093f\u0902\u0926\u0940 7', ta: 'TA-HUMAN', te: TODO + 'Should we call you?', kn: '', ml: TODO + 'old English' };
  const head = 'code\tkind\tquestion (English)\tquestion (Hindi)\n';
  const base = 'nps\tnps\t\t\nsupport_gate\tsupport question\t\t\nthanks\tthank you\t\t\n';
  // 1. same English, no Hindi cell text: the existing Hindi and Tamil stay; the empty / stale ones become [TRANSLATE]
  let res = fromTable(head + base + 'callback\tyes/no\tShould we call you?\t\n', s, strings);
  deep(res.texts['q.callback'], { en: 'Should we call you?', hi: '\u0939\u093f\u0902\u0926\u0940 7', ta: 'TA-HUMAN', te: TODO + 'Should we call you?',
    kn: TODO + 'Should we call you?', ml: TODO + 'Should we call you?' }, 'real translations kept; the rest filled');
  // 2. a new Hindi: only the Hindi changes
  res = fromTable(head + base + 'callback\tyes/no\tShould we call you?\t\u0939\u093f\u0902\u0926\u0940 8\n', s, strings);
  assert.strictEqual(res.texts['q.callback'].hi, '\u0939\u093f\u0902\u0926\u0940 8');
  assert.strictEqual(res.texts['q.callback'].ta, 'TA-HUMAN');
  deep(res.warnings.map((w) => w.message), ['Row 5 (callback), question (Hindi): the Hindi words change: "\u0939\u093f\u0902\u0926\u0940 7" -> ' +
    '"\u0939\u093f\u0902\u0926\u0940 8". Keep them only if a person wrote them: the panel never translates, and an AI must not either.'],
    'a real translation that changes is told, old -> new');
  // 3. new English, the old Hindi still in the table: kept, with a warning to check the translations
  res = fromTable(head + base + 'callback\tyes/no\tShall we call you back?\t\u0939\u093f\u0902\u0926\u0940 7\n', s, strings);
  assert.strictEqual(res.texts['q.callback'].en, 'Shall we call you back?');
  assert.strictEqual(res.texts['q.callback'].hi, '\u0939\u093f\u0902\u0926\u0940 7');
  assert.strictEqual(res.texts['q.callback'].ta, 'TA-HUMAN');
  assert.strictEqual(res.texts['q.callback'].kn, TODO + 'Shall we call you back?', 'placeholders follow the new English');
  deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[5, 'question (English)', 'callback']]);
  assert.ok(/the English changed but the Hindi and Tamil did not: check them in Texts & translations \(q\.callback\)/.test(res.warnings[0].message), res.warnings[0].message);
  // 4. today's question with no English in the table: its words stay (nothing to change)
  res = fromTable(head + 'nps\tnps\t\t\nsupport_gate\tsupport question\t\t\none_fix\tvoice/typing\t\t\nthanks\tthank you\t\t\n', s, strings);
  deep(res.problems, []);
  deep(res.texts, {}, 'nothing to change');
  // 5. Hindi only, for a text that has English already: only the Hindi changes
  res = fromTable(head + 'nps\tnps\t\t\u0939\u093f\u0902\u0926\u0940 9\nsupport_gate\tsupport question\t\t\nthanks\tthank you\t\t\n', s, strings);
  deep(res.texts, { 'q.nps': Object.assign(clone(STRINGS['q.nps']), { hi: '\u0939\u093f\u0902\u0926\u0940 9' }) });
  // 6. a language that is switched off keeps its words; a Tamil column is used when Tamil is a language
  const s2 = survey({ languages: [{ code: 'en', bcp47: 'en-IN', native_name: 'English' }, { code: 'hi', bcp47: 'hi-IN', native_name: 'Hindi' }] });
  res = fromTable('code\tkind\tquestion (English)\tquestion (Tamil)\n' + base + 'extra\tyes/no\tA new one\tTA-GIVEN\n', s2, strings);
  deep(res.texts['q.extra'], { en: 'A new one', hi: TODO + 'A new one' }, 'only the questionnaire\'s languages');
  deep(res.warnings.map((w) => [w.row, w.column]), [[1, 'question (Tamil)']], 'the Tamil column is left out (Tamil is not a language here)');
  res = fromTable('code\tkind\tquestion (English)\tquestion (Tamil)\n' + base + 'extra\tyes/no\tA new one\tTA-GIVEN\n', s, strings);
  assert.strictEqual(res.texts['q.extra'].ta, 'TA-GIVEN', 'a Tamil column (a person\'s translation) is used');
  // 7. answers (Hindi) without codes are matched in order; a different count is a warning
  const ah = 'code\tkind\tquestion (English)\tanswers\tanswers (Hindi)\n' + base;
  res = fromTable(ah + 'pq\tpick one\tWhich?\ta: A; b: B\t\u0939\u093f\u0902\u0926\u0940 1; \u0939\u093f\u0902\u0926\u0940 2\n', s, strings);
  deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[5, 'answers (Hindi)', 'pq']], 'only the new Hindi is told, once for the cell');
  deep([res.texts['choice.pq.a'].hi, res.texts['choice.pq.b'].hi], ['\u0939\u093f\u0902\u0926\u0940 1', '\u0939\u093f\u0902\u0926\u0940 2'], 'in order');
  res = fromTable(ah + 'pq\tpick one\tWhich?\ta: A; b: B; c: C\t\u0939\u093f\u0902\u0926\u0940 1; \u0939\u093f\u0902\u0926\u0940 2\n', s, strings);
  deep(res.warnings.map((w) => [w.row, w.column, w.code]), [[5, 'answers (Hindi)', 'pq'], [5, 'answers (Hindi)', 'pq']]);
  assert.ok(/it has 2 answers but "answers" has 3, so they are matched in order/.test(res.warnings[0].message), res.warnings[0].message);
  assert.ok(/the Hindi words of 2 answers are new or change/.test(res.warnings[1].message), res.warnings[1].message);
  assert.strictEqual(res.texts['choice.pq.c'].hi, TODO + 'C', 'the third answer has no Hindi: [TRANSLATE]');
  ok('the words: English and the Hindi given go in; real translations are kept; everything else is "[TRANSLATE] " + English; nothing is translated');
}

// ---------------------------------------------------------------------------
// 4. Problems (with row numbers) and warnings
// ---------------------------------------------------------------------------
{
  const s = survey();
  const res = fromTable(fixture('bad.tsv'), s, STRINGS);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.survey, null, 'nothing is checked further while there are problems');
  deep(res.problems.map((p) => [p.row, p.column, p.code]), [
    [null, null, 'nps'],
    [4, 'kind', 'rating_q'],
    [5, 'show only if', 'slow_why'],
    [6, 'jumps', 'back_jump'],
    [7, 'answers', 'channel'],
    [8, 'answers', 'empty_pick']
  ], 'one problem per mistake, in the table\'s order (the whole table first)');
  const m = res.problems.map((p) => p.message);
  assert.ok(/^The table has no row with the code "nps" \(kind: nps\)\. The NPS question fills the nps column/.test(m[0]), m[0]);
  assert.ok(/^Row 4 \(rating_q\), kind: "ratting" is not a kind the panel knows\. Did you mean "faces"\?/.test(m[1]), m[1]);
  assert.ok(/^Row 5 \(slow_why\), show only if: "sped" is not an answer of any row in this table\. Did you mean "speed"\?$/.test(m[2]), m[2]);
  assert.ok(/^Row 6 \(back_jump\), jumps: jump 1 goes back up to row 3 \("speed"\)\. Arrows may only go down the table/.test(m[3]), m[3]);
  assert.ok(/^Row 7 \(channel\), answers: two answers have the code "a"/.test(m[4]), m[4]);
  assert.ok(/^Row 8 \(empty_pick\), answers: a "pick one" question needs its answers, written like: phone: Phone call/.test(m[5]), m[5]);
  res.problems.concat(res.warnings).forEach((p) => assert.ok(!/undefined|\[object Object\]|NaN/.test(p.message), 'plain English: ' + p.message));
  ok('bad input: an unknown kind, an unknown code in a rule, a jump back up, a missing built-in and bad answers, each a plain problem with its row number');
}
{
  const s = survey();
  const H = 'code\tkind\tquestion (English)\tanswers\trequired\tshow only if\tthen go to\tjumps\task for\tshow\n';
  const NPS = 'nps\tnps\t\t\t\t\t\t\t\tyes\n';
  const GATE = 'support_gate\tsupport question\t\t\t\t\t\t\t\tyes\n';
  const THANKS = 'thanks\tthank you\t\t\t\t\t\t\t\tyes\n';
  const cases = [
    ['no support_gate', H + NPS + THANKS, [[null, null, 'support_gate', /no row with the code "support_gate" \(kind: support question\)\. The support question fills the support_contacted column/]]],
    ['no thank-you', H + NPS + GATE, [[null, null, null, /The table has no thank-you row/]]],
    ['hidden main thank-you', H + NPS + GATE + 'thanks\tthank you\t\t\t\t\t\t\t\tno\n', [[4, 'show', 'thanks', /first thank-you row .* must be shown/]]],
    ['two area ratings', H + NPS + 'fn_ratings\tarea ratings\t\t\t\t\t\t\t\tyes\nmore\tarea ratings\t\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[4, 'kind', 'more', /already a "area ratings" row \(row 3\)/]]],
    ['problem screens above the ratings', H + NPS + 'fn_deep_dives\tproblem screens\t\t\t\t\t\t\t\tyes\nfn_ratings\tarea ratings\t\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'kind', 'fn_deep_dives', /must come after the area ratings \(row 4\)/]]],
    ['problem screens without ratings', H + NPS + 'fn_deep_dives\tproblem screens\t\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'kind', 'fn_deep_dives', /no shown "area ratings" row/]]],
    ['nps with another code', H + 'score\tnps\t\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[null, null, 'nps', /no row with the code "nps"/], [2, 'code', 'score', /a "nps" row must have the code "nps"/]]],
    ['nps of the wrong kind', H + 'nps\tyes/no\tAre you happy?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[2, 'kind', 'nps', /its kind must be "nps"/]]],
    ['the same code twice', H + NPS + 'q1\tyes/no\tOne?\t\t\t\t\t\t\tyes\nq1\tyes/no\tTwo?\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[4, 'code', 'q1', /the same code as row 3/]]],
    ['a code that is not allowed', H + NPS + 'Bad Code!\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'code', null, /"Bad Code!" cannot be a code: .*for example "bad_code"/]]],
    ['a code too long', H + NPS + 'q' + 'x'.repeat(60) + '\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'code', 'q' + 'x'.repeat(60), /61 characters long; the most is 60/]]],
    ['a reserved code', H + NPS + 'support_comment\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'code', 'support_comment', /kept for the comment under the support ratings/]]],
    ['a code the rules read as a fact', H + NPS + 'round\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'code', 'round', /the rules read it as the round/]]],
    ['a code whose text is a built-in screen\'s', H + NPS + 'fn_rating\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'code', 'fn_rating', /its question text \(q\.fn_rating\) holds the words of the area ratings\. Use another code/]]],
    ['required: maybe', H + NPS + 'q1\tyes/no\tOne?\t\tmaybe\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'required', 'q1', /"maybe" is not yes or no/]]],
    ['show: perhaps', H + NPS + 'q1\tyes/no\tOne?\t\t\t\t\t\t\tperhaps\n' + GATE + THANKS, [[3, 'show', 'q1', /"perhaps" is not yes or no/]]],
    ['ask for: twice', H + NPS + 'q1\tyes/no\tOne?\t\t\t\t\t\ttwice\tyes\n' + GATE + THANKS, [[3, 'ask for', 'q1', /"twice" is not one of: once/]]],
    ['ask for on a built-in', H + NPS + 'fn_ratings\tarea ratings\t\t\t\t\t\t\teach area\tyes\n' + GATE + THANKS,
      [[3, 'ask for', 'fn_ratings', /a "area ratings" row is never asked once per area\. Only these kinds can be: 0 to 10, faces, yes\/no, pick one, pick several, voice\/typing, info card/]]],
    ['a rule that cannot be read', H + NPS + 'q1\tyes/no\tOne?\t\t\tnps <= 6 and support_gate = yes or nps = 1\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'show only if', 'q1', /the rule "nps <= 6 and .*" cannot be read: it mixes "and" and "or"/]]],
    ['then go to a code no row has', H + NPS + 'q1\tyes/no\tOne?\t\t\t\tsuport_gate\t\t\tyes\n' + GATE + THANKS,
      [[3, 'then go to', 'q1', /"then go to" goes to "suport_gate", but no row has that code\. Did you mean "support_gate"\?/]]],
    ['then go to itself', H + NPS + 'q1\tyes/no\tOne?\t\t\t\tq1\t\t\tyes\n' + GATE + THANKS, [[3, 'then go to', 'q1', /goes to this row itself/]]],
    ['then go back up', H + NPS + 'q1\tyes/no\tOne?\t\t\t\tnps\t\t\tyes\n' + GATE + THANKS, [[3, 'then go to', 'q1', /goes back up to row 2 \("nps"\)/]]],
    ['a rule on a later question', H + 'nps\tnps\t\t\t\tq1 = yes\t\t\t\tyes\nq1\tyes/no\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[2, 'show only if', 'nps', /R1|can't exist yet|cannot exist|later|before/]]],
    ['a rule on the area ratings row itself', H + NPS + 'fn_ratings\tarea ratings\t\t\t\t\t\t\t\tyes\nq1\tyes/no\tOne?\t\t\tfn_ratings <= 2\t\t\t\tyes\n' + GATE + THANKS,
      [[4, 'show only if', 'q1', /tested one area at a time: write fn_rating:<area>, for example fn_rating:losses/]]],
    ['an area that does not exist', H + NPS + 'fn_ratings\tarea ratings\t\t\t\t\t\t\t\tyes\nq1\tyes/no\tOne?\t\t\tfn_rating:shipping <= 2\t\t\t\tyes\n' + GATE + THANKS,
      [[4, 'show only if', 'q1', /There is no area "shipping"\. The areas are: losses, payments, linehaul, consumables, orders, app/]]],
    ['a question asked per area, without the area', H + NPS + 'fn_ratings\tarea ratings\t\t\t\t\t\t\t\tyes\nq1\tyes/no\tOne?\t\t\t\t\t\teach area\tyes\nq2\tyes/no\tTwo?\t\t\tq1 = yes\t\t\t\tyes\n' + GATE + THANKS,
      [[5, 'show only if', 'q2', /asked once per area, so name the area: q1:<area>, for example q1:losses/]]],
    ['a language that is not one', H + NPS + 'q1\tyes/no\tOne?\t\t\tlanguage = fr\t\t\t\tyes\n' + GATE + THANKS, [[3, 'show only if', 'q1', /"fr" is not one of the questionnaire's languages/]]],
    ['a pick one with an answer without words', H + NPS + 'q1\tpick one\tOne?\ta: Yes; b:\t\t\t\t\t\tyes\n' + GATE + THANKS,
      [[3, 'answers', 'q1', /the answer "b" has no words: write them in English, like: b: Phone call/]]],
    ['a question without words', H + NPS + 'q1\tyes/no\t\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'question (English)', 'q1', /the question is empty: write it in English/]]],
    ['an ending without a title', H + NPS + GATE + THANKS + 'other_end\tending\t\t\t\t\t\t\t\tyes\n', [[5, 'question (English)', 'other_end', /the ending's title \(the question column\) is empty/]]],
    // a second "thank you" row with its own words is read as an ending (review W8 finding 4): here nothing leads to it
    ['two thank-you rows with different titles', H + NPS + GATE + 'thanks\tthank you\tThanks!\t\t\t\t\t\t\tyes\nbye\tthank you\tBye!\t\t\t\t\t\t\tyes\n',
      [[5, null, 'bye', /^Row 5 \("Bye!"\) can never be reached: no arrow leads to it from the start\. Point the "then go to" of an earlier row at it, or remove it\.$/]]],
    ['an unknown kind', H + NPS + 'q1\tslider\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'kind', 'q1', /"slider" is not a kind the panel knows\. The kinds are: language, /]]],
    ['an empty kind', H + NPS + 'q1\t\tOne?\t\t\t\t\t\t\tyes\n' + GATE + THANKS, [[3, 'kind', 'q1', /the kind is empty\. Write one of:/]]]
  ];
  cases.forEach(([name, text, want]) => {
    const res = fromTable(text, s, STRINGS);
    assert.strictEqual(res.ok, false, name + ': not ok');
    deep(res.problems.map((p) => [p.row, p.column, p.code]), want.map((w) => w.slice(0, 3)), name + ': ' + JSON.stringify(res.problems.map((p) => p.message)));
    want.forEach((w, i) => assert.ok(w[3].test(res.problems[i].message), name + ': ' + res.problems[i].message));
    res.problems.forEach((p) => assert.ok(!/undefined|\[object Object\]|NaN/.test(p.message), 'plain English: ' + p.message));
  });
  // a rule on a later question is the checker's (R1): it names the table's row
  ok('every other mistake is a plain problem at its row and column (' + cases.length + ' cases, incl. the checker\'s own, worded for the table)');
}
{
  const s = survey();
  const check = (text, re) => {
    const res = fromTable(text, s, STRINGS);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.problems.length, 1, JSON.stringify(res.problems));
    assert.ok(re.test(res.problems[0].message), res.problems[0].message);
    return res;
  };
  check('', /The box is empty/);
  check('   \n \n', /The box is empty/);
  check('Here are my questions:\n1. How likely are you to recommend us?\n2. Why?', /The header row could not be found/);
  check('nps\tnps\t\nthanks\tthank you\t\n', /The header row could not be found/);
  check('code\tquestion (English)\nnps\tHow likely?\n', /The table has no "kind" column/);
  check('code\tkind\n', /header row but no rows under it/);
  const dup = check('code\tkind\tquestion (English)\tEnglish\nnps\tnps\t\t\nsupport_gate\tsupport question\t\t\nthanks\tthank you\t\t\n',
    /The column "English" means the same as the column "question \(English\)"/);
  deep([dup.problems[0].row, dup.problems[0].column], [1, 'English']);
  // a row with more cells than the header: words would be lost (an unquoted comma in a CSV, a | in Markdown)
  const extra = check('code,kind,question (English)\nnps,nps,\nsupport_gate,support question,In the last 30 days, did you contact support?\nthanks,thank you,\n',
    /^Row 3 \(support_gate\): this row has more cells than the header row has columns \(3\), so some of its words would be lost\. Is there a comma inside a text\? Put that text in "double quotes"\.$/);
  deep([extra.problems[0].row, extra.problems[0].column], [3, null]);
  check('| code | kind | question (English) |\n|---|---|---|\n| nps | nps | |\n| support_gate | support question | Yes | No |\n| thanks | thank you | |\n',
    /Row 3 .*more cells than the header row has columns \(3\).*Write it as \\\|\./);
  // codes partners answered can't go
  const live = fromTable('code\tkind\nnps\tnps\nsupport_gate\tsupport question\nthanks\tthank you\n', s, STRINGS, { liveCodes: ['nps', 'screen:one_fix', 'area:losses'] });
  deep(live.problems.map((p) => [p.row, p.code]), [[null, 'one_fix']]);
  assert.ok(/partners already answered it in a real round, so it can never be removed/.test(live.problems[0].message), live.problems[0].message);
  // an answer partners picked can't go either (Publish refuses it: Model.gs PP_mdlCheckLiveCodes_)
  const liveOpt = fromTable('code\tkind\tquestion (English)\tanswers\nnps\tnps\t\t\nsupport_gate\tsupport question\t\t\n' +
    'way\tpick one\tWhich way?\tphone: Phone; app: App\nthanks\tthank you\t\t\n', s, STRINGS,
    { liveCodes: ['option:way/visit', 'option:way/phone', 'chip:losses/no_proof'] });
  deep(liveOpt.problems.map((p) => [p.row, p.column, p.code]), [[4, 'answers', 'way']]);
  assert.ok(/the answer "visit" was already picked by partners in a real round, so it must stay/.test(liveOpt.problems[0].message), liveOpt.problems[0].message);
  ok('an empty box, no header, no "kind" column, no rows, a column twice, a row with more cells than the header, and a code or answer partners answered that the table drops');
}
{
  const s = survey();
  const H = 'code\tkind\tquestion (English)\tanswers\tmessage\trequired\tshow\tjumps\tNotes\tColour\n';
  const text = H + 'NPS\tnps\t\t\t\t\tyes\tif nps = 0 go to thanks_2; if nps <= 2 go to bye_for_now\tthe big one\t\n' +
    '\tyes/no\tDid you get your payout on time?\t\t\t\tyes\t\t\t\n' +
    'Support_Gate\tsupport question\t\t\t\t\tyes\t\t\t\n' +
    'card\tinfo card\tA card\t\t\tyes\tyes\t\t\t\n' +
    'yn\tyes/no\tYes or no?\tyes: Yes; no: No\t\t\tyes\t\t\t\n' +
    'yn2\tyes/no\tAnother?\tmaybe: Maybe\tA message\t\tyes\t\t\t\n' +
    'pick\tpick one\tWhich?\tPhone call; In the app; Phone-Call: Phone\t\t\tyes\t\t\t\n' +
    'thanks\tthank you\t\t\t\t\tyes\t\t\t\n' +
    '\tending\tBye for now\t\t\t\tyes\t\t\t\n' +
    '\tthank you\t\t\t\t\tyes\t\t\t\n';
  const current = todayRows();
  const res = fromTable(text, s, STRINGS, { rows: current });
  deep(res.problems, [], JSON.stringify(res.problems));
  const got = res.warnings.map((w) => [w.row, w.column, w.code]);
  deep(got, [
    [null, null, 'language'], [null, null, 'whats_changed'], [null, null, 'fn_ratings'], [null, null, 'fn_deep_dives'], [null, null, 'support'], [null, null, 'one_fix'],
    [1, 'Colour', null],
    [2, 'code', 'nps'],
    [3, 'code', 'did_you_get_your_payout_on_time'],
    [4, 'code', 'support_gate'],
    [5, 'required', 'card'],
    [7, 'message (English)', 'yn2'], [7, 'answers', 'yn2'],
    [8, 'answers', 'pick'], [8, 'answers', 'pick'],
    [10, 'code', 'bye_for_now'],
    [11, 'code', 'thanks_2']
  ], JSON.stringify(res.warnings.map((w) => w.message), null, 1));
  const w = res.warnings.map((x) => x.message);
  assert.ok(/^The current questionnaire has a row "language" \(language\) that this table does not have: using the table removes it\.$/.test(w[0]), w[0]);
  assert.ok(/^The current questionnaire has a row "one_fix" \("If Valmo could fix just one thing/.test(w[5]), w[5]);
  assert.ok(/^The column "Colour" is not one the panel reads, so it is left out\./.test(w[6]), w[6]);
  assert.ok(/codes are written in small letters, so "NPS" is read as "nps"/.test(w[7]), w[7]);
  assert.ok(/the code was empty, so the panel made one from the English question: "did_you_get_your_payout_on_time"\. Answers are saved under it/.test(w[8]), w[8]);
  assert.ok(/a "info card" row has nothing to answer, so "required" changes nothing/.test(w[10]), w[10]);
  assert.ok(/a "yes\/no" row shows no message/.test(w[11]), w[11]);
  assert.ok(/only "pick one" and "pick several" questions have answers to write here/.test(w[12]), w[12]);
  assert.ok(/the answer code "Phone-Call" is written "phone_call"/.test(w[13]), w[13]);
  assert.ok(/answers without a code got one made from their English: phone_call_2, in_the_app/.test(w[14]), w[14]);
  assert.ok(/made one from the English question: "bye_for_now"/.test(w[15]), w[15]);
  assert.ok(/made one from the kind: "thanks_2"/.test(w[16]), w[16]);
  deep(res.rows.find((x) => x.id === 'nps').jumps.map((j) => j.goto), ['thanks_2', 'bye_for_now'], 'jumps may name the codes the panel made');
  const pick = res.rows.find((x) => x.id === 'pick');
  deep(pick.options, ['phone_call_2', 'in_the_app', 'phone_call'], 'codes made like the panel makes them (_2 when taken)');
  assert.strictEqual(res.rows.find((x) => x.id === 'yn').options.length, 0, 'yes/no answers are always Yes and No (no warning for writing them)');
  ok('warnings: rows the table drops, an unknown column, small letters, codes made from the English (as the panel makes them), unused cells');
}

// ---------------------------------------------------------------------------
// 5. Round trips
// ---------------------------------------------------------------------------
/* A route with jumps, questions asked for each area, hidden rows and two endings (all FAKE). */
function richDraft() {
  const rows = todayRows();
  const strings = clone(STRINGS);
  const at = (id) => rows.findIndex((x) => x.id === id);
  rows[at('nps')].jumps = [{ when: { answer: 'nps', at_most: 3 }, goto: 'why_low' }, { when: { answer: 'nps', at_least: 9 }, goto: 'support_gate' }];
  rows.splice(at('fn_deep_dives') + 1, 0,
    row({ id: 'callback', type: 'yes_no', text: 'q.callback', required: false, repeat: 'each_low_area' }),
    row({ id: 'pick', type: 'single_choice', text: 'q.pick', options: ['a', 'b'], repeat: 'each_area', required: false }),
    row({ id: 'effort', type: 'nps_0_10', text: 'q.effort', low_label: 'q.effort.low', high_label: 'q.effort.high', scale_hint: 'q.effort.hint', required: true,
      show_if: { any: [{ answer: 'nps', at_most: 6 }, { fact: 'lang', equals: 'hi' }] } }));
  rows.splice(at('support') + 1, 0,
    row({ id: 'note', type: 'info_card', text: 'q.note', body: 'q.note.body', show_if: { fact: 'round', equals: '2026-R2' } }),
    row({ id: 'old_q', type: 'free_text', text: 'q.old_q', active: false, show_if: { answer: 'gone_code', answered: true } }));
  rows[at('one_fix')].show_if = { not: { answer: 'support_gate', equals: 'no' } };
  rows.push(
    row({ id: 'why_low', type: 'free_text', text: 'q.why_low', required: false, next: 'short_end', jumps: [{ when: { answer: 'why_low', answered: false }, goto: 'thanks' }] }),
    row({ id: 'skipped_q', type: 'yes_no', text: 'q.skipped_q', active: false }),
    row({ id: 'short_end', type: 'thank_you', text: 'end.short_end.title', body: 'end.short_end.body' }));
  const add = (key, en, hi, extra) => { strings[key] = words(en, hi, extra); };
  add('q.callback', 'Should someone call you about this?', '\u0939\u093f\u0902\u0926\u0940 1', { ta: 'TA-HUMAN-1' });
  add('q.pick', 'Pick one', '');
  add('choice.pick.a', 'Option A', '\u0939\u093f\u0902\u0926\u0940 2');
  add('choice.pick.b', 'Option B', '');
  add('q.effort', 'How easy is Valmo to work with?', '');
  add('q.effort.low', 'Very hard', '');
  add('q.effort.high', 'Very easy', '');
  add('q.effort.hint', '0 means very hard, 10 very easy.', '');
  add('q.note', 'A note for this round', '');
  add('q.note.body', 'Line one\nLine two | with a bar', '\u0939\u093f\u0902\u0926\u0940 3');
  add('q.old_q', 'An old question', '');
  add('q.why_low', 'What went wrong, in your words?', '');
  add('q.skipped_q', 'A hidden question', '');
  add('end.short_end.title', 'Sorry to hear that', '');
  add('end.short_end.body', 'Our team will call you, "soon".', '');
  return { rows, strings };
}
{
  const s = survey();
  const rows = todayRows();
  ['tsv', 'csv', 'markdown'].forEach((format) => {
    const table = panel.toTable(rows, STRINGS, s, { format });
    [{ rows }, {}].forEach((opts) => {
      const back = fromTable(table, s, STRINGS, opts);
      const label = format + (opts.rows ? ' (with the draft)' : ' (on its own)');
      deep(back.problems, [], label + ': no problems');
      deep(back.warnings, [], label + ': no warnings');
      deep(back.rows, rows, label + ': the same rows');
      deep(back.texts, {}, label + ': no text changes');
      assert.strictEqual(back.format, format);
    });
  });
  const back = fromTable(panel.toTable(rows, STRINGS, s), s, STRINGS, { rows });
  assert.strictEqual(graphText(back.rows, s), graphText(rows, s), 'the graph Publish makes is the same');
  const notes = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
  deep(panel.fromRows(back.rows, s).graph, notes(SURVEY_FILE.flow), 'and it is exactly the repo\'s survey.json route');
  deep(checkerErrors(back, STRINGS, s), [], 'the checker finds no errors');
  ok('today\'s questionnaire: draft -> table (TSV, CSV, Markdown) -> rows is identical, no text changes, and the compiled graph is today\'s graph');
}
{
  const s = survey();
  const { rows, strings } = richDraft();
  ['tsv', 'csv', 'markdown'].forEach((format) => {
    const table = panel.toTable(rows, strings, s, { format });
    [{ rows }, {}].forEach((opts) => {
      const back = fromTable(table, s, strings, opts);
      const label = 'rich ' + format + (opts.rows ? ' (with the draft)' : ' (on its own)');
      deep(back.problems, [], label + ': no problems');
      deep(back.warnings.map((w) => [w.row, w.column, w.code]), [[rows.findIndex((x) => x.id === 'old_q') + 2, 'show only if', 'old_q']],
        label + ': only the hidden row\'s stale rule');
      deep(back.rows, rows, label + ': the same rows');
      deep(back.texts, {}, label + ': no text changes');
      assert.strictEqual(graphText(back.rows, s), graphText(rows, s), label + ': the same graph');
    });
  });
  const back = fromTable(panel.toTable(rows, strings, s), s, strings, { rows });
  deep(checkerErrors(back, strings, s), [], 'the checker finds no errors');
  const sv = back.survey;
  deep(walk(sv, { nps: 2 }), ['nps', 'why_low', 'thanks'], 'nps 2: the short route (no answer: the jump to the main thank-you)');
  deep(walk(sv, { nps: 2 }, {}).slice(-1), ['thanks']);
  const ids = walk(sv, { nps: 5, 'fn_rating:losses': 2, 'fn_rating:payments': 5, 'fn_rating:linehaul': 4, 'fn_rating:consumables': 5, 'fn_rating:orders': 5,
    'fn_rating:app': 5, support_gate: 'no' }, { round: '2026-R2' });
  assert.ok(ids.indexOf('callback:losses') !== -1 && ids.filter((x) => /^callback:/.test(x)).length === 1, 'asked for the one area rated low: ' + ids);
  assert.strictEqual(ids.filter((x) => /^pick:/.test(x)).length, 6, 'asked for every area');
  assert.ok(ids.indexOf('effort') !== -1 && ids.indexOf('note') !== -1 && ids.indexOf('one_fix') === -1 && ids.indexOf('old_q') === -1, ids.join(','));
  const table = panel.toTable(rows, strings, s);
  assert.ok(table.indexOf('if nps <= 3 go to why_low; if nps >= 9 go to support_gate') !== -1, 'jumps in words');
  assert.ok(table.indexOf('\teach area rated low\t') !== -1 && table.indexOf('\teach area\t') !== -1, 'ask for in words');
  assert.ok(table.indexOf('nps <= 6 or language = hi') !== -1 && table.indexOf('not (support_gate = no)') !== -1, 'rules in words');
  assert.ok(table.indexOf('"Line one\nLine two | with a bar"') !== -1, 'a text with a line break is quoted, as Excel does');
  assert.ok(table.split('\n').filter((l) => /^old_q\t/.test(l))[0].endsWith('\tno'), 'hidden rows are written with show = no');
  ok('a route with jumps, each area / each area rated low, hidden rows and two endings: draft -> table -> rows is identical in every format, walked by the engine');
}
{
  // "straight after each low rating": the area ratings row becomes a group; the round trip still holds
  const s = survey({ deep_dive: Object.assign(clone(SURVEY_FILE.deep_dive), { when: 'immediate' }) });
  const rows = todayRows();
  const back = fromTable(panel.toTable(rows, STRINGS, s), s, STRINGS, { rows });
  deep(back.problems, []);
  deep(back.rows, rows);
  assert.strictEqual(graphText(back.rows, s), graphText(rows, s));
  assert.ok(back.survey.flow.nodes.some((n) => n.type === 'group'), 'compiled as the group');
  deep(checkerErrors(back, STRINGS, s), []);
  ok('"straight after each low rating" mode: the same round trip, and the checker is clean');
}
{
  // The table keeps what it has no column for: a 0 to 10 question's own label keys, an ending's keys, from the draft
  const s = survey();
  const rows = todayRows();
  const strings = clone(STRINGS);
  rows.splice(3, 0, row({ id: 'odd', type: 'nps_0_10', text: 'q.odd_text', low_label: 'q.odd.low_2', high_label: '', scale_hint: 'nps.scale_hint' }));
  strings['q.odd_text'] = words('An odd question', '');
  strings['q.odd.low_2'] = words('Low', '');
  const back = fromTable(panel.toTable(rows, strings, s), s, strings, { rows });
  deep(back.problems, []);
  deep(back.rows, rows, 'the draft\'s own keys are kept');
  deep(back.texts, {});
  // an ending in the draft with its own message but the standard title (text '') reads back the same
  const rows2 = todayRows();
  rows2.push(row({ id: 'msg_end', type: 'thank_you', body: 'end.msg_end.body' }));
  strings['end.msg_end.body'] = words('Only a message of its own', '');
  rows2[rows2.findIndex((x) => x.id === 'nps')].jumps = [{ when: { answer: 'nps', equals: 0 }, goto: 'msg_end' }];
  const table2 = panel.toTable(rows2, strings, s);
  assert.ok(table2.indexOf('msg_end\tending\t\t') !== -1, 'written as an ending without a title');
  const back2 = fromTable(table2, s, strings, { rows: rows2 });
  deep(back2.problems, []);
  deep(back2.rows, rows2, 'an ending with only its own message');
  deep(back2.texts, {});
  ok('settings without a column (a question\'s own text keys and end labels, an ending without its own title) are kept from the draft');
}

// ---------------------------------------------------------------------------
// 6. The checker on what fromTable makes
// ---------------------------------------------------------------------------
{
  ['excel-copy.tsv', 'template-filled.csv', 'ai-answer.md'].forEach((name) => {
    const s = survey();
    const res = fromTable(fixture(name), s, STRINGS);
    assert.ok(res.ok, name + ': ok');
    deep(checkerErrors(res, STRINGS, s), [], name + ': the checker Publish uses finds no errors');
    const again = fromTable(fixture(name), s, STRINGS, { check: false });
    assert.strictEqual(again.survey, null, 'check: false does not compile');
    deep(again.rows, res.rows, 'the same rows either way');
  });
  const ex = fromTable(fixture('excel-copy.tsv'), survey(), STRINGS).survey;
  deep(walk(ex, { nps: 2 }), ['nps', 'why_low', 'low_end'], 'excel-copy: nps 2 goes to the short route and its ending');
  assert.ok(walk(ex, { nps: 10 }).slice(0, 2).join() === 'nps,support_gate', 'excel-copy: nps 10 jumps to the support question');
  const ai = fromTable(fixture('ai-answer.md'), survey(), STRINGS).survey;
  deep(walk(ai, { nps: 5, effort: 2 }), ['nps', 'effort', 'effort_why', 'detractor_end'], 'ai-answer: the detractor route');
  deep(walk(ai, { nps: 5, effort: 8 }), ['nps', 'effort', 'detractor_end'], 'ai-answer: effort_why only when effort <= 4');
  // the checker's own findings are reported at the table's row
  const s = survey();
  const later = fromTable('code\tkind\tquestion (English)\tshow only if\nnps\tnps\t\tq1 = yes\nq1\tyes/no\tOne?\t\nsupport_gate\tsupport question\t\t\nthanks\tthank you\t\t\n', s, STRINGS);
  deep(later.problems.map((p) => [p.row, p.column, p.code]), [[2, 'show only if', 'nps']]);
  assert.ok(/^Row 2 \("How likely are you to recommend Valmo/.test(later.problems[0].message), 'the checker names the table\'s row: ' + later.problems[0].message);
  ok('everything fromTable makes from the fixtures passes the checker; the engine walks it as the table says; the checker\'s findings name table rows');
}

// ---------------------------------------------------------------------------
// 7. The template and the instruction for Claude / ChatGPT
// ---------------------------------------------------------------------------
{
  const s = survey();
  const rows = todayRows();
  const csv = panel.templateCsv(SURVEY_FILE, STRINGS);
  assert.strictEqual(csv.charCodeAt(0), 0xfeff, 'starts with a BOM (Excel then reads the Hindi correctly)');
  assert.ok(/\r\n$/.test(csv) && csv.split('\r\n').length === rows.length + 2, 'Windows line ends: the header, today\'s rows and a last line end');
  assert.ok(csv.indexOf('\ufeffcode,kind,question (English),question (Hindi),answers,answers (Hindi),message (English),message (Hindi),required,show only if,then go to,jumps,ask for,show\r\n') === 0);
  assert.ok(!/\b0-10\b|\b1-5\b/.test(csv), 'no "0-10" or "1-5" (Excel would turn them into dates)');
  const back = fromTable(csv, s, STRINGS);
  deep(back.problems, []);
  deep(back.rows, rows, 'the template reads back as today\'s route');
  deep(back.texts, {});
  // from a draft (opts.rows), and from a survey without a route (the standard one)
  const { rows: rich, strings } = richDraft();
  deep(fromTable(panel.templateCsv(s, strings, { rows: rich }), s, strings, { rows: rich }).rows, rich, 'opts.rows: the draft\'s route');
  const std = fromTable(panel.templateCsv(s, STRINGS), s, STRINGS);
  deep(std.rows, rows, 'no route in the survey: the standard route (today\'s)');
  ok('templateCsv: BOM, Windows line ends, the header and today\'s route, and it reads back unchanged');
}
{
  const s = survey();
  const text = panel.aiInstruction(SURVEY_FILE, STRINGS);
  ['code', 'kind', 'question (English)', 'question (Hindi)', 'answers', 'answers (Hindi)', 'message (English)', 'message (Hindi)', 'required',
    'show only if', 'then go to', 'jumps', 'ask for', 'show'].forEach((c) => assert.ok(text.indexOf(c) !== -1, 'names the column ' + c));
  ['language', 'what changed', 'nps', 'area ratings', 'problem screens', 'support question', 'support ratings', 'thank you', 'ending', '0 to 10', 'faces',
    'yes/no', 'pick one', 'voice/typing', 'info card'].forEach((k) => assert.ok(text.indexOf('- ' + k + ' ') !== -1 || text.indexOf('- ' + k + ':') !== -1, 'explains the kind ' + k));
  ['nps <= 6', 'support_gate = yes', 'language = hi', 'round = <your round id>', 'one_fix answered', 'not answered', 'in (a, b)', '!=', 'fn_rating:<area code>',
    'if <rule> go to <code>', '(nps <= 6 or support_gate = no) and language = hi'].forEach((r) => assert.ok(text.indexOf(r) !== -1, 'the rule language: ' + r));
  assert.ok(text.indexOf('2026-R2') === -1, 'no made-up round id (review W8 finding 12): a clear placeholder when no round is given');
  SURVEY_FILE.functions.forEach((f) => {
    assert.ok(text.indexOf('- ' + f.id + ' (' + STRINGS['fn.' + f.id + '.name'].en + '): ') !== -1, 'the area ' + f.id + ' with its name');
    f.issues.forEach((c) => assert.ok(text.indexOf(c + ' (' + STRINGS['issue.' + f.id + '.' + c].en + ')') !== -1, 'the problem code ' + f.id + '/' + c));
  });
  SURVEY_FILE.support.items.forEach((c) => assert.ok(text.indexOf(c + ' (' + STRINGS['support.' + c].en + ')') !== -1, 'the support question ' + c));
  assert.ok(text.indexOf('en (English), hi (Hindi), ta (Tamil), te (Telugu), kn (Kannada), ml (Malayalam)') !== -1, 'the languages');
  assert.ok(/Never translate anything yourself/.test(text) && /ONLY with Hindi that I give you, copied exactly/.test(text), 'never translate; copy only the Hindi given');
  assert.ok(/Output only the table/.test(text), 'output only the table');
  assert.ok(/Optional, only when my notes give these words for a "0 to 10" question: left end, right end .* and hint/.test(text), 'the optional end-label columns');
  assert.ok(/Never leave out the rows nps, support_gate and the first "thank you"/.test(text), 'the rows that must stay');
  // its example reads with no problems and passes the checker; its "current route" is today's route
  const example = text.slice(text.indexOf('A SHORT EXAMPLE'), text.indexOf('THE CURRENT ROUTE'));
  const ex = fromTable(example, s, STRINGS);
  deep(ex.problems, [], 'the example has no problems');
  deep(checkerErrors(ex, STRINGS, s), [], 'the example passes the checker');
  deep(ex.rows.map((r) => r.type).filter((t, i, a) => a.indexOf(t) === i).sort(), ['free_text', 'function_deep_dives', 'function_ratings', 'language_picker',
    'nps_0_10', 'single_choice', 'support_block', 'thank_you', 'yes_no'], 'the example shows the common kinds');
  const cur = fromTable(text.slice(text.indexOf('THE CURRENT ROUTE')), s, STRINGS);
  deep(cur.problems, []);
  deep(cur.rows, todayRows(), 'the current route in the instruction is today\'s route');
  deep(cur.texts, {});
  // no Hindi of its own: the only Hindi in the instruction is the current route's (the project's own texts)
  const ownWords = text.slice(0, text.indexOf('THE CURRENT ROUTE'));
  assert.ok(!/[\u0900-\u097f]/.test(ownWords), 'the instruction itself contains no Hindi it made up');
  // without Hindi among the languages
  const enOnly = panel.aiInstruction(Object.assign(clone(SURVEY_FILE), { languages: [{ code: 'en', bcp47: 'en-IN', native_name: 'English' }] }), STRINGS);
  assert.ok(enOnly.indexOf('question (Hindi)') === -1 && /Never translate anything yourself/.test(enOnly), 'no Hindi columns when Hindi is not a language');
  ok('aiInstruction: every column, kind, rule word, area, problem code, support question and language; never translate; output only the table; its example and today\'s route read back');
}

// ---------------------------------------------------------------------------
// 7b. The review fixes of 27 Oct 2026 (round W8; the findings are numbered as
//     in the review). Each check below failed on the code before the fix.
// ---------------------------------------------------------------------------
/* Today's table as "Copy the current route" gives it (tab-separated), as lines; rows 2 to 10 are
   language, whats_changed, nps, fn_ratings, fn_deep_dives, support_gate, support, one_fix, thanks. */
function todayLines(format) { return panel.toTable(todayRows(), STRINGS, survey(), { format: format || 'tsv' }).split('\n'); }
const COLS = todayLines()[0].split('\t');
function setCell(lines, code, column, value) {
  const k = COLS.indexOf(column);
  assert.ok(k !== -1, 'the column ' + column);
  return lines.map((l) => (l.split('\t')[0] === code ? l.split('\t').map((c, i) => (i === k ? value : c)).join('\t') : l));
}
/* One tab-separated line, quoted as Excel copies a cell with a line break (or one starting with a quote). */
const lineOf = (cells) => COLS.map((h) => {
  const v = cells[h] === undefined ? '' : String(cells[h]);
  return /[\t\n\r]/.test(v) || v.charAt(0) === '"' ? '"' + v.replace(/"/g, '""') + '"' : v;
}).join('\t');
function addBefore(lines, code, cells) {
  const out = lines.slice();
  out.splice(lines.findIndex((l) => l.split('\t')[0] === code), 0, lineOf(cells));
  return out;
}
const paste = (lines, opts, strings) => fromTable(lines.join('\n'), survey(), strings || STRINGS, Object.assign({ rows: todayRows() }, opts || {}));
const where = (list) => list.map((p) => [p.row, p.column, p.code]);
/* A text on one line, cut to n characters with "..." as the messages show it (flow-panel.js shorten). */
const shortText = (t, n) => { const x = String(t).trim().replace(/\s+/g, ' '); return x.length <= n ? x : x.slice(0, n - 1) + '\u2026'; };
{
  // Finding 1: a text cell holding only a filler is an empty cell (the words stay), with a warning at its cell
  let lines = addBefore(todayLines(), 'thanks', { code: 'payout_speed', kind: 'faces', 'question (English)': 'How fast are your payouts?', required: 'yes', show: 'yes' });
  lines = lines.map((l, i) => (i === 0 ? l : l.split('\t').map((c, k) => (k === 3 ? 'NA' : c)).join('\t')));
  const res = paste(lines);
  deep(res.problems, [], 'NA in every Hindi cell (review/e28.js)');
  deep(Object.keys(res.texts), ['q.payout_speed'], 'no real Hindi is replaced by "NA"');
  deep(res.texts['q.payout_speed'], words('How fast are your payouts?'), 'the new question\'s Hindi stays [TRANSLATE]');
  deep(where(res.warnings), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n, i) => [n, 'question (Hindi)',
    ['language', 'whats_changed', 'nps', 'fn_ratings', 'fn_deep_dives', 'support_gate', 'support', 'one_fix', 'payout_speed', 'thanks'][i]]));
  assert.strictEqual(res.warnings[7].message, 'Row 9 (one_fix), question (Hindi): "NA" was read as an empty cell, so the words stay as they are. ' +
    'Leave a cell empty when you don\'t want to change it.');
  const FILLERS = ['-', '\u2013', '\u2014', '.', '...', '\u2026', '?', '*', '\'\'', 'NA', 'N/A', 'n.a.', 'N. A.', 'none', 'nil', 'null', 'TBD', 'TBA', 'TBC',
    'same', 'keep', 'ditto', 'do', '-do-', 'to be translated', '(to be translated)', 'To be translated.', 'translate', '[TRANSLATE]', 'blank', 'empty',
    '"NA"', '[TBD]', '(none)', ' N/A ', 'Same.', '**TBD**', '<my Hindi>', '(keep today\'s words)', '(built-in)', 'no change'];
  FILLERS.forEach((f) => {
    let t = setCell(todayLines(), 'one_fix', 'question (Hindi)', f);
    t = setCell(t, 'language', 'question (English)', f);
    t = setCell(t, 'thanks', 'message (English)', f);
    const r = paste(t);
    deep(r.problems, [], JSON.stringify(f) + ': no problems');
    deep(r.texts, {}, JSON.stringify(f) + ': nothing changes, in English or Hindi');
    deep(where(r.warnings), [[2, 'question (English)', 'language'], [9, 'question (Hindi)', 'one_fix'], [10, 'message (English)', 'thanks']], JSON.stringify(f));
  });
  ['None of these', 'Same day delivery', 'No', 'Keep your app updated.', 'Empty boxes?', 'N/A means it does not apply'].forEach((w) => {
    const r = paste(setCell(todayLines(), 'one_fix', 'question (English)', w));
    deep(r.problems, [], w);
    assert.strictEqual(r.texts['q.one_fix'].en, w, 'a real sentence that merely contains such a word is words: ' + w);
  });
  const fresh = paste(addBefore(todayLines(), 'thanks', { code: 'q_na', kind: 'yes/no', 'question (English)': 'N/A', show: 'yes' }));
  deep(where(fresh.problems), [[10, 'question (English)', 'q_na']], 'a new row whose English is a filler needs its English');
  assert.ok(/the question is empty: write it in English/.test(fresh.problems[0].message), fresh.problems[0].message);
  // answers: one English answer's words "Same", "None" or "Empty" are real; fillers as Hindi answers, or alone between answers, are not words
  const cmp = paste(addBefore(todayLines(), 'thanks', { code: 'cmp', kind: 'pick one', 'question (English)': 'Compared with last month?',
    answers: 'better: Better; same: Same; none: None; empty: Empty', 'answers (Hindi)': 'better: NA; same: -', show: 'yes' }));
  deep(cmp.problems, []);
  deep(['better', 'same', 'none', 'empty'].map((c) => cmp.texts['choice.cmp.' + c].en), ['Better', 'Same', 'None', 'Empty'], 'real one-word answers');
  deep(['better', 'same'].map((c) => cmp.texts['choice.cmp.' + c].hi), [TODO + 'Better', TODO + 'Same'], 'Hindi fillers are no Hindi');
  deep(where(cmp.warnings), [[10, 'answers (Hindi)', 'cmp']]);
  assert.ok(/^Row 10 \(cmp\), answers \(Hindi\): better: "NA" and same: "-" were read as empty, so the words stay as they are/.test(cmp.warnings[0].message), cmp.warnings[0].message);
  const lone = paste(addBefore(todayLines(), 'thanks', { code: 'way', kind: 'pick one', 'question (English)': 'Which way?', answers: 'phone: Phone; -; app: App', show: 'yes' }));
  deep(lone.problems, []);
  deep(lone.rows.find((r) => r.id === 'way').options, ['phone', 'app'], 'a lone "-" between answers is no answer');
  deep(lone.warnings.map((w) => w.message), ['Row 10 (way), answers: "-" between the answers is not an answer, so it is left out.']);
  // a draft's pick-one with "N/A" as its whole answers cell keeps its answers and their words
  const { rows: rich, strings } = richDraft();
  const richTable = panel.toTable(rich, strings, survey()).split('\n');
  const na = fromTable(setCell(richTable, 'pick', 'answers', 'N/A').join('\n'), survey(), strings, { rows: rich });
  deep(na.problems, []);
  deep(na.rows, rich, 'the same rows');
  deep(na.texts, {}, 'and the same words');
  ok('W8 finding 1: fillers (' + FILLERS.length + ' ways: -, NA, N/A, TBD, [TRANSLATE] ...) in a text cell or an answer are read as empty, with a warning at the cell; real sentences are words');
}
{
  // Finding 8: never machine-translate: new or changed non-English words are told, one warning per cell
  const strings = clone(STRINGS);
  strings['q.one_fix'] = Object.assign(clone(STRINGS['q.one_fix']), { ta: 'TA-HUMAN' });
  const same = paste(todayLines(), {}, strings);
  deep(same.warnings, [], 'the same Hindi: nothing to tell');
  const changed = paste(setCell(todayLines(), 'one_fix', 'question (Hindi)', '\u0928\u092f\u093e'), {}, strings);
  deep(where(changed.warnings), [[9, 'question (Hindi)', 'one_fix']]);
  assert.strictEqual(changed.warnings[0].message, 'Row 9 (one_fix), question (Hindi): the Hindi words change: "' + shortText(STRINGS['q.one_fix'].hi, 40) +
    '" -> "\u0928\u092f\u093e". Keep them only if a person wrote them: the panel never translates, and an AI must not either.');
  const tamil = fromTable('code\tkind\tquestion (English)\tquestion (Tamil)\nnps\tnps\t\t\nsupport_gate\tsupport question\t\t\none_fix\tvoice/typing\t\tTA-AI\nthanks\tthank you\t\t\n',
    survey(), strings);
  deep(tamil.warnings.map((w) => w.message), ['Row 4 (one_fix), question (Tamil): the Tamil words change: "TA-HUMAN" -> "TA-AI". Keep them only if a person wrote them: the panel never translates, and an AI must not either.'],
    'every language, not only Hindi');
  // a built-in screen's English: partners see it, so the change is told (with the translations that did not change)
  const nps = paste(setCell(todayLines(), 'nps', 'question (English)', 'How likely would you recommend Valmo?'));
  deep(where(nps.warnings), [[4, 'question (English)', 'nps']]);
  assert.strictEqual(nps.warnings[0].message, 'Row 4 (nps), question (English): the English of a built-in screen changes: "' + shortText(STRINGS['q.nps'].en, 50) +
    '" -> "How likely would you recommend Valmo?". Partners see it, so check that this is what you want. The Hindi did not change: check it in ' +
    'Texts & translations (q.nps).');
  const thanks = paste(setCell(todayLines(), 'thanks', 'message (English)', 'We read every answer.'));
  assert.ok(/^Row 10 \(thanks\), message \(English\): the English of a built-in screen changes: ".*" -> "We read every answer\."/.test(thanks.warnings[0].message), thanks.warnings[0].message);
  ok('W8 finding 8: every new or changed non-English text is a warning naming the language, old -> new ("keep it only if a person wrote it"), and a built-in screen\'s English change too');
}
{
  // Finding 2: a route below the thank-you that runs on into another route is a problem in "then go to" (review/e9b.js)
  const H = 'code\tkind\tquestion (English)\trequired\tthen go to\tjumps\tshow\n';
  const head = ['language\tlanguage\t\t\t\t\tyes', 'nps\tnps\tHow likely are you to recommend Valmo to another DC owner?\tyes\t\tif nps <= 6 go to detractor_q; if nps >= 9 go to promo_q\tyes',
    'fn_ratings\tarea ratings\t\t\t\t\tyes', 'support_gate\tsupport question\t\tyes\t\t\tyes', 'one_fix\tvoice/typing\t\tno\t\t\tyes', 'thanks\tthank you\t\t\t\t\tyes'];
  const promo = 'promo_q\tvoice/typing\tWhat do you like most?\tno\t\t\tyes';
  const tail = ['detractor_q\tvoice/typing\tWhat went wrong?\tno\t\t\tyes', 'detractor_end\tending\tThanks, we will call you\t\t\t\tyes'];
  const run = (lines) => fromTable(H + lines.join('\n'), survey(), STRINGS);
  const res = run(head.concat([promo], tail));
  deep(where(res.problems), [[8, 'then go to', 'promo_q']]);
  assert.ok(/^Row 8 \("What do you like most\?"\) has no "then go to", so partners who answer it go straight on to row 9 \("What went wrong\?"\), which starts another route: row 3 \("How likely are you to recommend Valmo to another \u2026"\) jumps there\. Write where it goes in its "then go to" column, for example its own ending, or add an ending row between them\. If both routes should carry on there, write "detractor_q" in its "then go to" to say so\. \(Its code is "promo_q"; the code of the row after it is "detractor_q"\.\)$/.test(res.problems[0].message),
    res.problems[0].message);
  // the ways out the message offers are all fine
  [[promo.replace('\tno\t\t', '\tno\tthanks\t')], [promo, 'promo_end\tending\tThanks, fan!\t\t\t\tyes'], [promo.replace('\tno\t\t', '\tno\tdetractor_q\t')],
    [promo, 'promo_end\tending\tThanks, fan!\t\t\t\tno']].forEach((middle, k) => {
    const r = run(head.concat(middle, tail));
    deep(r.problems, [], 'way out ' + (k + 1) + ': ' + JSON.stringify(r.problems));
  });
  // straight on into another route's ending
  const end = run(head.concat([promo, 'detractor_end\tending\tThanks, we will call you\t\t\t\tyes']).map((l) => l.replace('go to detractor_q', 'go to detractor_end')));
  assert.ok(/go straight on to row 9 \("Thanks, we will call you"\), the ending of another route: row 3 .* jumps there\./.test(end.problems[0].message), end.problems[0].message);
  ok('W8 finding 2: a route below the thank-you that runs on into another route is a problem at its "then go to" (as Publish says), and each way out is fine');
}
{
  // Finding 3: a question partners answered keeps its kind (review/e13.js, e8.js)
  const faces = setCell(todayLines(), 'one_fix', 'kind', 'faces');
  const a = paste(faces, { liveKinds: { one_fix: 'free_text' } });
  deep(where(a.problems), [[9, 'kind', 'one_fix']]);
  assert.strictEqual(a.problems[0].message, 'Row 9 (one_fix), kind: partners have already answered it as a question of the kind "voice/typing", so its kind ' +
    'can\'t change (the dashboard compares rounds by its code). Keep its kind, or write no in its show column and add the new question in a new row with a new code.');
  deep(where(paste(faces, { liveCodes: ['screen:one_fix'] }).problems), [[9, 'kind', 'one_fix']], 'a live code: its kind is the draft row\'s');
  deep(paste(faces).problems, [], 'not answered yet: the kind may change');
  deep(where(paste(setCell(todayLines(), 'fn_ratings', 'kind', 'faces'), { liveCodes: ['fn_ratings'] }).problems).slice(0, 1), [[5, 'kind', 'fn_ratings']], 'built-in rows too');
  deep(paste(setCell(todayLines(), 'one_fix', 'kind', 'info card'), { liveKinds: { one_fix: 'info_card' } }).problems, [], 'a live info card stores nothing: its kind may change');
  // the answers partners picked are still checked when the kind changed
  const { rows: rich, strings } = richDraft();
  const pickTable = setCell(panel.toTable(rich, strings, survey()).split('\n'), 'pick', 'kind', 'yes/no');
  const picked = fromTable(pickTable.join('\n'), survey(), strings, { rows: rich, liveCodes: ['pick', 'option:pick/a'] });
  deep(where(picked.problems).map((p) => p.slice(1)), [['kind', 'pick'], ['answers', 'pick']], 'its kind, and the answer "a" partners picked');
  ok('W8 finding 3: a question partners answered (opts.liveKinds, or a live code with the draft\'s kind) cannot change its kind; its picked answers are still checked');
}
{
  // Finding 4: only the first "thank you" row is the main thank-you screen (review/e23.js)
  const lines = setCell(todayLines(), 'nps', 'jumps', 'if nps <= 6 go to why_low');
  const extra = (kind) => lines.concat([lineOf({ code: 'why_low', kind: 'voice/typing', 'question (English)': 'What went wrong for you?', required: 'no', show: 'yes' }),
    lineOf({ code: 'low_end', kind: kind, 'question (English)': 'Sorry to hear that.', 'message (English)': 'Our team will call within 2 days.', show: 'yes' })]);
  ['thank you', 'Thanks', 'Thank you screen', 'End', 'ending'].forEach((kind) => {
    const r = paste(extra(kind));
    deep(r.problems, [], kind);
    assert.ok(!r.texts['thanks.title'] && !r.texts['thanks.body'], kind + ': the main thank-you keeps its words');
    deep(r.rows.find((x) => x.id === 'low_end'), row({ id: 'low_end', type: 'thank_you', text: 'end.low_end.title', body: 'end.low_end.body' }), kind + ': read as an ending');
    deep(r.texts['end.low_end.title'], words('Sorry to hear that.'));
    deep(where(r.warnings), /^thank you|^thanks/i.test(kind) ? [[12, 'kind', 'low_end']] : [], kind + ': ' + JSON.stringify(r.warnings));
    if (r.warnings.length) {
      assert.strictEqual(r.warnings[0].message, 'Row 12 (low_end), kind: only the first "thank you" row is the main thank-you screen; this row was read as an ' +
        '"ending" with its own words. Write ending in its kind.');
    }
  });
  // the main end written "end" (or "ending") without words is the standard thank-you screen
  ['end', 'ending'].forEach((kind) => {
    [{ rows: todayRows() }, {}].forEach((opts) => {
      const r = fromTable(setCell(todayLines(), 'thanks', 'kind', kind).join('\n'), survey(), STRINGS, opts);
      deep(r.problems, [], kind);
      deep(r.rows.find((x) => x.id === 'thanks'), row({ id: 'thanks', type: 'thank_you' }), kind + ': the standard thank-you screen');
      deep(r.texts, {});
    });
  });
  ok('W8 finding 4: a later "thank you" row with words is read as an ending (with a warning), never as the main thank-you\'s words; "end" is an ending');
}
{
  // Findings 5 and 13: the answers cell (review/e17.js, e15.js)
  const ask = (answers, hindi, show) => paste(addBefore(todayLines(), 'thanks', { code: 'contact_way', kind: 'pick one', 'question (English)': 'How do you contact support?',
    answers: answers, 'answers (Hindi)': hindi || '', show: show || 'yes' }));
  const read = (res) => { const r = res.rows.find((x) => x.id === 'contact_way'); return r.options.map((o) => o + '=' + res.texts['choice.contact_way.' + o].en); };
  [['`phone`: Phone call; `app`: In the app', ['phone=Phone call', 'app=In the app']],
    ['**phone**: Phone call; **app**: In the app', ['phone=Phone call', 'app=In the app']],
    ['__phone__: `Phone call`; app: **In the app**', ['phone=Phone call', 'app=In the app']],
    ['phone: Phone call\napp: In the app', ['phone=Phone call', 'app=In the app']],
    ['- phone: Phone call\n- app: In the app', ['phone=Phone call', 'app=In the app']],
    ['* phone: Phone call; \u2022 app: In the app', ['phone=Phone call', 'app=In the app']],
    ['1. phone: Phone call; 2) app: In the app', ['phone=Phone call', 'app=In the app']],
    ['a) Phone call; b) In the app', ['phone_call=Phone call', 'in_the_app=In the app']],
    ['phone: Phone call, app: In the app', ['phone=Phone call', 'app=In the app']],
    ['always: "Yes; always"; never: No', ['always=Yes; always', 'never=No']],
    ['a: "He said ""ok""; fine"; b: \u201cNo; never\u201d', ['a=He said "ok"; fine', 'b=No; never']]
  ].forEach(([cell, want]) => {
    const res = ask(cell);
    deep(res.problems, [], cell);
    deep(read(res), want, cell);
  });
  const one = (cell) => { const res = ask(cell); deep(where(res.problems), [[10, 'answers', 'contact_way']], cell); return res.problems[0].message; };
  assert.strictEqual(one('phone: Phone call'), 'Row 10 (contact_way), answers: a "pick one" question needs at least 2 answers, separated by ";" (for example: phone: Phone call; app: In the app).');
  assert.ok(/needs at least 2 answers, .* Commas and slashes don't separate answers: use ";"\.$/.test(one('Phone call, In the app, A visit')));
  assert.ok(/Commas and slashes don't separate answers: use ";"\.$/.test(one('Phone call / In the app / A visit')));
  assert.ok(/the answer "always" has no code, but the answers around it have one: is there a ";" inside a label\? Put that label in double quotes, like: always: "Yes; always"\.$/
    .test(one('yes: Yes; always; no: No')));
  assert.ok(/the answer "phone" has formatting marks around its words \("\*\*Phone\*\* call"\), which partners would see\. Write only the words\.$/.test(one('phone: **Phone** call; app: App')));
  const hidden = ask('phone: Phone call', '', 'no');
  deep(hidden.problems, [], 'a hidden "pick one" with one answer: a warning only');
  deep(where(hidden.warnings), [[10, 'answers', 'contact_way']]);
  const hindi = ask('yes: Yes; always: Always; no: No', 'yes: \u0939\u093e\u0901; \u0939\u092e\u0947\u0936\u093e; no: \u0928\u0939\u0940\u0902');
  deep(where(hindi.problems), [[10, 'answers (Hindi)', 'contact_way']], 'a ";" inside Hindi words is found too');
  // "Copy the current route" -> paste back: words with ";" or quotes go in double quotes and come back the same, in every format
  const { rows: rich, strings } = richDraft();
  strings['choice.pick.a'] = words('Yes; always', '\u0939\u093e\u0901; \u0939\u092e\u0947\u0936\u093e');
  strings['choice.pick.b'] = words('He said "ok"', '"\u0939\u093e\u0901"');
  ['tsv', 'csv', 'markdown'].forEach((format) => {
    const table = panel.toTable(rich, strings, survey(), { format });
    assert.ok(table.indexOf('a: "Yes; always"; b: "He said ""ok"""') !== -1 || format === 'csv', format + ': written in double quotes');
    const back = fromTable(table, survey(), strings, { rows: rich });
    deep(back.problems, [], format);
    deep(back.rows, rich, format + ': the same rows');
    deep(back.texts, {}, format + ': the same words, the Hindi too');
  });
  ok('W8 findings 5 and 13: answers lose the marks AIs add (backticks, **, bullets, numbers), ";" splits only outside "double quotes", fewer than 2 answers or a stray ";" is a problem, and quoted words round-trip');
}
{
  // Finding 6: the Sheet's Screens tab, and text keys where words should be (review/e22.js)
  const tab = 'order\tscreen_id\ttype\ttext_key\trequired\tshow_if\tskip_if\toptions\tlow_label\thigh_label\tscale_hint\tbody\tactive\tnext\tjumps\trepeat\n' +
    '1\tnps\tnps_0_10\tq.nps\tTRUE\t\t\t\tnps.low\tnps.high\tnps.scale_hint\t\tTRUE\t\t\t\n';
  const res = fromTable(tab, survey(), STRINGS, { rows: todayRows() });
  deep(res.problems.map((p) => p.message), ['This looks like the Sheet\'s Screens tab. In the control panel use Questions > Copy the current route, change that table, and paste it here.']);
  const reviewHeader = 'id\ttype\ttext\trequired\tshow_if\tskip_if\toptions\tlow_label\thigh_label\tscale_hint\tbody\tactive\tnext\tjumps\trepeat\nnps\tnps_0_10\tq.nps\n';
  assert.ok(/Screens tab/.test(fromTable(reviewHeader, survey(), STRINGS).problems[0].message), 'the header the review pasted');
  const key = paste(setCell(todayLines(), 'one_fix', 'question (English)', 'q.one_fix'));
  deep(key.problems.map((p) => p.message), ['Row 9 (one_fix), question (English): looks like a text key ("q.one_fix"), not words. Write the words partners should see.']);
  deep(where(paste(setCell(todayLines(), 'thanks', 'message (English)', 'end.low.title')).problems), [[10, 'message (English)', 'thanks']]);
  deep(where(paste(setCell(todayLines(), 'one_fix', 'question (Hindi)', 'lang.title')).problems), [[9, 'question (Hindi)', 'one_fix']], 'a key the texts have');
  const label = paste(addBefore(todayLines(), 'thanks', { code: 'web', kind: 'pick one', 'question (English)': 'Where?', answers: 'site: meesho.com; app: choice.web.app', show: 'yes' }));
  deep(label.problems.map((p) => p.message), ['Row 10 (web), answers: the answer "app" looks like a text key ("choice.web.app"), not words. Write the words partners should see.'],
    'a web address is words');
  ok('W8 finding 6: the Sheet\'s Screens tab is refused as a whole; a text key in a text cell or an answer is a problem at its cell');
}
{
  // Finding 7: header names written in the languages' own scripts (review/e4.js)
  const HI = '\u0906\u092a\u0915\u093e \u092d\u0941\u0917\u0924\u093e\u0928';
  const withHead = (h) => {
    const lines = addBefore(todayLines(), 'thanks', { code: 'speed', kind: 'faces', 'question (English)': 'How fast are your payouts?', 'question (Hindi)': HI, show: 'yes' });
    lines[0] = lines[0].split('\t').map((c, i) => (i === 3 ? h : c)).join('\t');
    return paste(lines);
  };
  ['\u092a\u094d\u0930\u0936\u094d\u0928 (\u0939\u093f\u0902\u0926\u0940)', '\u0939\u093f\u0902\u0926\u0940', '\u0939\u093f\u0928\u094d\u0926\u0940', 'Question (\u0939\u093f\u0902\u0926\u0940)',
    '\u0938\u0935\u093e\u0932 \u0939\u093f\u0902\u0926\u0940', 'Hindi translation', 'translation (Hindi)', 'Translation_hi'].forEach((h) => {
    const r = withHead(h);
    deep(r.problems, [], h);
    assert.strictEqual(r.texts['q.speed'].hi, HI, h + ': read as the Hindi of the question');
  });
  const unknown = withHead('\u091f\u093f\u092a\u094d\u092a\u0923\u0940 (\u0939\u093f\u0902\u0926\u0940)');
  assert.strictEqual(unknown.texts['q.speed'].hi, TODO + 'How fast are your payouts?');
  deep(where(unknown.warnings), [[1, '\u091f\u093f\u092a\u094d\u092a\u0923\u0940 (\u0939\u093f\u0902\u0926\u0940)', null]], 'an unknown header in another script is told');
  assert.ok(/is not one the panel reads, so it is left out, with the words in it \(10 rows\)\. The columns are:/.test(unknown.warnings[0].message), unknown.warnings[0].message);
  const numbered = todayLines().map((l, i) => (i ? i : '#') + '\t' + l);
  deep(paste(numbered).warnings, [], 'a "#" numbering column is left out quietly');
  const unnamed = todayLines().map((l, i) => l + '\t' + (i === 3 ? 'a stray note' : ''));
  deep(paste(unnamed).warnings.map((w) => w.message), ['Column 15 has no name in the header row, so it is left out, with the words in it (1 row). Name it (the columns are: ' +
    'code, kind, required, show only if, then go to, jumps, ask for, show, question (English), question (Hindi), answers, answers (Hindi), message (English), message (Hindi)), or remove it.']);
  ok('W8 finding 7: headers in Hindi script (and "Hindi translation") are read; an unknown header in any script, or an unnamed column with words, is told');
}
{
  // Finding 11: what comes after the table (review/e5.js, e6.js)
  const md = todayLines('markdown');
  const whyLow = '| why_low | voice/typing | What went wrong for you? |  |  |  |  |  | no |  |  |  |  | yes |';
  const lowEnd = '| low_end | ending | Thank you for telling us |  |  |  | Our team will call you back. |  |  |  |  |  |  | yes |';
  const jump = md.map((l) => (l.indexOf('| nps |') === 0 ? l.replace('| yes |  |  |  |  | yes |', '| yes |  |  | if nps <= 6 go to why_low |  | yes |') : l));
  assert.ok(jump.join('\n') !== md.join('\n'), 'the jump is set');
  const later = fromTable(jump.concat(['', '**Other routes:**', '', whyLow, lowEnd]).join('\n'), survey(), STRINGS, { rows: todayRows() });
  deep(later.problems, [], 'rows after a heading are read (they have the table\'s cells)');
  deep(later.rows.map((x) => x.id).slice(-2), ['why_low', 'low_end']);
  deep(later.warnings.map((w) => w.message), ['The line of other text below the table is left out.',
    'Rows 11 to 12 come after an empty line or other text inside the table; they were read as rows of the table too.']);
  const second = fromTable(jump.concat(['', 'Other routes:', '', md[0], md[1], whyLow, lowEnd]).join('\n'), survey(), STRINGS, { rows: todayRows() });
  deep(second.problems, [], 'a second table with the same columns is merged');
  assert.ok(second.warnings.some((w) => w.message === 'A second table with the same columns follows the first one: its 2 rows were added after the first table, as rows 11 to 12. Check that it is not an old copy of the route: each code may appear only once.'),
    JSON.stringify(second.warnings));
  const other = fromTable(md.concat(['', '| area | problem |', '|---|---|', '| payments | late |']).join('\n'), survey(), STRINGS, { rows: todayRows() });
  deep(other.problems.map((p) => p.message), ['Below the table there is a second table with other columns ("area | problem"). Paste one table only: the route, with one header row.']);
  const twoTsv = todayLines().concat(['', todayLines()[0], 'extra_q\tyes/no\tOne more?\t\t\t\t\t\t\t\t\t\t\tyes']);
  const tsv2 = paste(twoTsv);
  assert.ok(tsv2.warnings.some((w) => /^Row 12 repeats the header row, so a second table starts there/.test(w.message)), JSON.stringify(tsv2.warnings));
  deep(tsv2.rows.map((x) => x.id).slice(-1), ['extra_q']);
  // the AI's "Left out:" line is repeated in a warning, never a problem; "Left out: nothing" says nothing
  const lo = fromTable(md.concat(['', 'Left out: the question about trucks (no kind fits)']).join('\n'), survey(), STRINGS, { rows: todayRows() });
  deep(lo.problems, []);
  deep(lo.warnings.map((w) => w.message), ['Left out of the table, as the line under it says: "the question about trucks (no kind fits)". Check whether it is needed.']);
  deep(fromTable(md.concat(['Left out: nothing']).join('\n'), survey(), STRINGS, { rows: todayRows() }).warnings, []);
  deep(fromTable(md.concat(['Left outside the table on purpose.']).join('\n'), survey(), STRINGS, { rows: todayRows() }).warnings.map((w) => w.message),
    ['The line of other text below the table is left out.'], '"Left outside" is not a "Left out:" line');
  // no message says a code is missing when it is only in a part of the paste that was left out
  const lost = fromTable(jump.concat(['', 'The detractors also get: why_low (voice/typing) "What went wrong for you?"']).join('\n'), survey(), STRINGS, { rows: todayRows() });
  assert.ok(/jump 1 goes to "why_low", but no row has that code\. "why_low" is in the text outside the table, which was left out: put its row inside the table\.$/.test(lost.problems[0].message),
    lost.problems[0].message);
  ok('W8 finding 11: after the table, more rows or a second table with the same columns are read (with a warning), another table is a problem, other lines and "Left out:" are told');
}
{
  // Finding 12: a round id that does not exist (review/e18.js)
  const rounds = ['DEMO-R1', '2026-R1'];
  const ask = (rule, opts) => paste(setCell(todayLines(), 'one_fix', 'show only if', rule), opts);
  deep(ask('round = 2099-R9', { rounds }).warnings.map((w) => w.message), ['Row 9 (one_fix), show only if: the rule tests the round "2099-R9", but no round has that id (the rounds are: DEMO-R1, 2026-R1).']);
  deep(ask('round = demo-r1', { rounds }).warnings.map((w) => w.message), ['Row 9 (one_fix), show only if: the rule tests the round "demo-r1", but no round has that id (the rounds are: DEMO-R1, 2026-R1). Did you mean "DEMO-R1"? Round ids must match exactly.']);
  deep(ask('round in (DEMO-R1, 2026-R1)', { rounds }).warnings, []);
  deep(ask('round = 2099-R9').warnings, [], 'without opts.rounds, no warning');
  deep(paste(setCell(todayLines(), 'nps', 'jumps', 'if round != demo-r1 go to thanks'), { rounds }).warnings.map((w) => [w.row, w.column]), [[4, 'jumps']], 'in jumps too');
  const placeholder = ask('round = <your round id>');
  deep(where(placeholder.problems), [[9, 'show only if', 'one_fix']], 'the instruction\'s placeholder pasted as it is: a clear problem');
  assert.ok(/still has the placeholder "<your round id>" from the instruction's examples: write the real value there/.test(placeholder.problems[0].message));
  const ins = panel.aiInstruction(SURVEY_FILE, STRINGS, { rounds: [{ id: 'DEMO-R1' }, { id: '2026-R1' }] });
  assert.ok(ins.indexOf('  round = DEMO-R1\n') !== -1 && ins.indexOf('(today: DEMO-R1, 2026-R1)') !== -1, 'the instruction uses the first real round id');
  ok('W8 finding 12: a rule on a round that does not exist (opts.rounds) is a warning, with "did you mean" for other capitals; the instruction\'s round example is real or a clear placeholder');
}
{
  // Finding 14: words a table user understands (review/e14.js)
  const msg = (lines) => { const r = paste(lines); assert.ok(r.problems.length, 'a problem'); return r.problems; };
  const endRule = msg(todayLines().concat([lineOf({ code: 'e2', kind: 'ending', 'question (English)': 'Bye', 'show only if': 'nps <= 3', show: 'yes' })]));
  deep(endRule.map((p) => p.message), ['Row 11 (e2), show only if: an ending can\'t have a "show only if": partners reach it through a jump or a "then go to". Leave the cell empty.']);
  deep(where(msg(setCell(todayLines(), 'thanks', 'show only if', 'nps >= 0'))), [[10, 'show only if', 'thanks']], 'the thank-you row too');
  const mid = msg(addBefore(todayLines(), 'support_gate', { code: 'mid_end', kind: 'ending', 'question (English)': 'Early end', 'message (English)': 'Bye', show: 'yes' }));
  deep(mid.map((p) => p.message), ['Row 7 (mid_end), kind: endings go below the "thank you" row (row 11): an ending ends the survey, so partners who reach this row would never see the rows after it. Move it below the "thank you" row.']);
  const moved = todayLines();
  moved.splice(3, 0, moved.splice(1, 1)[0]);
  deep(msg(moved).map((p) => p.message), ['Row 4 (language, the language buttons) must be the first row: otherwise partners read questions before they can choose their language. Move it to the top.']);
  const wc = msg(setCell(todayLines(), 'whats_changed', 'show only if', 'nps >= 0'))[0].message;
  assert.ok(/^Row 3 \(whats_changed\): its rule \("show only if"\) tests "nps"/.test(wc) && wc.indexOf('>') === -1, wc);
  const nested = msg(setCell(todayLines(), 'one_fix', 'show only if', 'nps >= 0 and (support_gate = yes or one_fix answered)'))[0].message;
  assert.ok(/: the 2nd part of the 2nd part of its rule \("show only if"\) tests "one_fix", which is this screen's own answer/.test(nested), nested);
  assert.ok(/a jump \(its "jumps" column\)/.test(nested), nested);
  const ge = msg(setCell(todayLines(), 'support', 'show only if', 'support_gate >= 1'))[0].message;
  assert.ok(/">=" compares numbers, but the yes\/no question "support_gate" is never a number\. Use "=", "!=" or "in" instead\./.test(ge), ge);
  const noEnd = msg(todayLines().concat([lineOf({ code: 'late_q', kind: 'yes/no', 'question (English)': 'One more?', show: 'yes' })]));
  assert.ok(noEnd.some((p) => /^The thank-you screen the form adds at the end can never be reached/.test(p.message)), JSON.stringify(noEnd));
  noEnd.concat(endRule, mid).forEach((p) => assert.ok(!/thanks_auto|"start"|> all >|"next"|"show_if"|at_least/.test(p.message), 'table words: ' + p.message));
  ok('W8 finding 14: an ending with a rule or above the thank-you row is its own problem, and the checker\'s words reach the table without ids, JSON names or rule paths');
}
{
  // Finding 15: the instruction for Claude / ChatGPT
  const text = panel.aiInstruction(SURVEY_FILE, STRINGS);
  [/Right after the table write one line that starts with "Left out:"/, /Exactly one row has the kind "thank you": the main end/,
    /Every other end is an "ending" row below it/, /its last row needs "then go to" \(its ending, or thanks\), unless its own ending row comes right after it/,
    /When an answer's words contain ";", put them in double quotes \(for example: always: "Yes; always"\)/,
    /Leave a cell completely empty when there is nothing to write in it\. Never fill it with -, \u2014, N\/A, NA or TBD\./, /ONE Markdown table/,
    /name it in the "Left out:" line/, /  round = <your round id>\n/].forEach((re) => assert.ok(re.test(text), 'the instruction says ' + re));
  assert.ok(text.indexOf('except thank you') === -1, 'it no longer invites a second "thank you" row');
  ok('W8 finding 15: the instruction asks for empty cells, one thank-you row, an end for every route, quoted answers with ";", one table and a "Left out:" line');
}

// ---------------------------------------------------------------------------
// 8. A kind of question added as a plug-in (the guide's example, stars_1_10).
//    Last on purpose: registering it changes the list of kinds from here on.
// ---------------------------------------------------------------------------
{
  require(path.join(__dirname, 'fixtures', 'types', 'stars_1_10.js'));
  assert.ok(flow && global.PP.types.get('stars_1_10'), 'the example kind is registered');
  const s = survey();
  const strings = clone(STRINGS);
  const base = 'nps\tnps\t\t\t\nsupport_gate\tsupport question\t\t\t\n';
  const table = 'code\tkind\tquestion (English)\tleft end\task for\n' + base +
    'stars\tstars_1_10\tHow many stars for Valmo?\tNo stars at all\t\n' +
    'stars_each\tStars (1 to 10)\tAnd for this area?\t\teach area\n' +
    'thanks\tthank you\t\t\t\n';
  const res = fromTable(table, s, strings);
  deep(res.problems, []);
  deep(res.rows.find((x) => x.id === 'stars'), row({ id: 'stars', type: 'stars_1_10', text: 'q.stars', low_label: 'q.stars.low' }),
    'read by its code, with its own end label');
  deep(res.rows.find((x) => x.id === 'stars_each'), row({ id: 'stars_each', type: 'stars_1_10', text: 'q.stars_each', low_label: 'q.stars_each.low',
    repeat: 'each_area' }), 'read by its name in the panel, asked for each area (it says it can be)');
  deep(res.texts['q.stars.low'], words('No stars at all'));
  deep(checkerErrors(res, strings, s), [], 'the checker knows the kind from its description');
  const back = fromTable(panel.toTable(res.rows, withTexts(strings, res.texts), s), s, withTexts(strings, res.texts), { rows: res.rows });
  deep(back.rows, res.rows, 'round trip');
  deep(back.texts, {});
  assert.ok(panel.toTable(res.rows, strings, s).indexOf('stars\tstars_1_10\t') !== -1, 'written with its code as the kind');
  const ins = panel.aiInstruction(SURVEY_FILE, STRINGS);
  assert.ok(/- also: stars_1_10\./.test(ins), 'the instruction names the added kind');
  assert.ok(/Only for 0 to 10, faces, yes\/no, pick one, pick several, voice\/typing, info card, stars_1_10\./.test(ins), 'and says it can be asked for each area');
  ok('a kind added as a plug-in (web/js/types/): read by its code or its name, round trip, checked, and named in the instruction');
}

// ---------------------------------------------------------------------------
// 9. ES5
// ---------------------------------------------------------------------------
{
  let acorn = null;
  try { acorn = require('acorn'); } catch (e) { acorn = null; }
  const source = fs.readFileSync(path.join(REPO, 'web/js/flow-panel.js'), 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(source), 'flow-panel.js is plain ASCII (special characters are written as \\u escapes)');
  if (!acorn) {
    console.log('SKIP the ES5 parse check: run "cd tests && npm install" once (acorn).');
  } else {
    acorn.parse(source, { ecmaVersion: 5 });
    assert.ok(source.trimEnd().endsWith("}(typeof window !== 'undefined' ? window : globalThis));"), 'the exact footer Flow.gs relies on');
    ok('flow-panel.js parses as ES5, is plain ASCII, and ends with the footer the Flow.gs generator needs');
  }
}

// Pick several (28 Oct 2026): the kind "pick several" (and its other spellings), its answers like a pick
// one, a rule "areas = load" meaning "load is one of the ticked", one follow-up per ticked area, the round
// trip, and "multiple choice" refused as ambiguous.
{
  const lines = todayLines('tsv');
  const H = lines[0].split('\t');
  const col = (name) => H.indexOf(name);
  const mk = (f) => { const b = H.map(() => ''); Object.keys(f).forEach((k) => { b[col(k)] = f[k]; }); return b.join('\t'); };
  const table = (kind, answers, rule) => {
    const rows = lines.slice(1).filter(Boolean);
    const at = rows.findIndex((l) => l.split('\t')[0] === 'nps');
    rows.splice(at + 1, 0,
      mk({ code: 'areas', kind: kind, 'question (English)': 'Which areas? You can pick more than one.', answers: answers }),
      mk({ code: 'load_low', kind: 'pick one', 'question (English)': 'What went wrong with load?', answers: 'a: Late; other: Others', 'show only if': rule }));
    return [H.join('\t')].concat(rows).join('\n');
  };
  const res = panel.fromTable(table('pick several', 'load: Load & volume; payments: Payments; app: App', 'nps <= 8 and areas = load'),
    survey(), STRINGS, { rows: todayRows() });
  assert.ok(res.ok, JSON.stringify(res.problems));
  const r = res.rows.find((x) => x.id === 'areas');
  assert.strictEqual(r.type, 'multi_choice');
  deep(r.options, ['load', 'payments', 'app']);
  deep(res.texts['choice.areas.load'].en, 'Load & volume');
  deep(res.rows.find((x) => x.id === 'load_low').show_if, { all: [{ answer: 'nps', at_most: 8 }, { answer: 'areas', equals: 'load' }] });
  // the compiled route: one follow-up per ticked area (the engine reads "=" as "is one of the ticked")
  const walk = (answers) => checker.simulate(res.survey, Object.assign({}, answers), { lang: 'en' }).steps.map((s) => s.screen);
  assert.ok(walk({ nps: 4, areas: ['load', 'app'] }).indexOf('load_low') !== -1, 'load ticked with others: its follow-up shows');
  assert.strictEqual(walk({ nps: 4, areas: ['app'] }).indexOf('load_low'), -1, 'load not ticked: no follow-up');
  assert.strictEqual(walk({ nps: 10, areas: ['load'] }).indexOf('load_low'), -1, 'a promoter: no "went wrong"');
  // round trip: the table writes "pick several" and reads back the same rows, with no text changes
  const strings2 = withTexts(STRINGS, res.texts);
  const back = panel.toTable(res.rows, strings2, survey(), { format: 'tsv' });
  assert.ok(back.split('\n').some((l) => l.split('\t')[0] === 'areas' && l.split('\t')[1] === 'pick several'), 'written as "pick several"');
  const again = panel.fromTable(back, survey(), strings2, { rows: res.rows });
  assert.ok(again.ok, JSON.stringify(again.problems));
  deep(again.rows, res.rows, 'the same rows');
  deep(again.texts, {}, 'no text changes');
  // other spellings of the kind
  ['multi select', 'Pick all that apply', 'checkboxes', 'multi_choice', 'Tick all that apply'].forEach((w) => {
    const x = panel.fromTable(table(w, 'load: Load; payments: Payments', 'areas = load'), survey(), STRINGS, { rows: todayRows() });
    assert.ok(x.ok, w + ': ' + JSON.stringify(x.problems));
    assert.strictEqual(x.rows.find((y) => y.id === 'areas').type, 'multi_choice', w);
  });
  // "multiple choice" can mean either: a problem at its kind, never a guess
  const mc = panel.fromTable(table('Multiple choice', 'load: Load; payments: Payments', ''), survey(), STRINGS, { rows: todayRows() });
  assert.ok(!mc.ok);
  assert.ok(mc.problems.some((p) => p.column === 'kind' && /can mean two things: write "pick one" .* or "pick several"/.test(p.message)), JSON.stringify(mc.problems));
  // a number test on a list is refused by the checker; fewer than 2 answers too
  const num = panel.fromTable(table('pick several', 'load: Load; payments: Payments', 'areas <= 2'), survey(), STRINGS, { rows: todayRows() });
  assert.ok(!num.ok && num.problems.some((p) => /never a number/.test(p.message)), JSON.stringify(num.problems));
  const one = panel.fromTable(table('pick several', 'load: Load', ''), survey(), STRINGS, { rows: todayRows() });
  assert.ok(!one.ok && one.problems.some((p) => p.column === 'answers' && /"pick several" question needs at least 2 answers/.test(p.message)), JSON.stringify(one.problems));
  // the AI instruction teaches it, and says never to write "multiple choice"
  const ins = panel.aiInstruction(survey(), STRINGS, { rows: todayRows() });
  assert.ok(/- pick several: a list of answers; the partner ticks one or more/.test(ins));
  assert.ok(/Never write "multiple choice"/.test(ins));
  assert.ok(/"= x" means x is one of the answers ticked/.test(ins));
  ok('pick several: read and written as "pick several", answers like pick one, "= x" means x is ticked, round trip, "multiple choice" refused');
}

console.log(count, 'tests passed');

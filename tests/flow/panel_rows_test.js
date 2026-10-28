/* =============================================================================
   tests/flow/panel_rows_test.js: checks web/js/flow-panel.js, the control
   panel's side of the questionnaire's route (stage 4 of the flow-graph work).

   WHAT IT CHECKS
     1. fromRows: a Sheet that uses none of the new columns (next, jumps,
        repeat) gives EXACTLY the graph the form's own converter makes of
        today's list (PP.flow.fromLegacy): today's questionnaire in both
        problem-screen modes, with hidden rows, and every list-format
        questionnaire in tests/flow/legacy/variants/.
     2. The new columns: a jump, an explicit "next", a question asked for each
        area or each area rated low, several endings with their own wording,
        the "straight after each low rating" group, and arrows to hidden rows
        (re-targeted, warning C2). Each one is walked with the real engine.
     3. Round trips: rows -> graph -> rows gives the same rows, and graph ->
        rows -> graph gives byte-identical text (formatFlow), for all of them.
     4. Arrows that would be unsafe are left out with a plain-English warning
        (backwards, unknown, unreadable, an ending's next, repeat where it
        can't apply), so the result can never go round in circles.
     4b. A route below the thank-you that runs on into another route: note
        G5 (level "error"), the same rows as a FROZEN copy of Model.gs
        PP_mdlCheckRunIntoRoutes_ on 3,000 generated routes; and every note
        in the route table's words (27 Oct 2026, review W8 findings 2, 10).
     5. toRows refuses graphs the panel can't show, naming each screen.
     6. formatFlow and surveyTextWithFlow: the same text every time, valid
        JSON, the note at the top, and only the "flow" part of survey.json
        changes.
     7. flow-panel.js parses as ES5 (Chrome 61, Apps Script).

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/panel_rows_test.js
     One line starting with PASS per check, then "N tests passed". A mistake
     stops it with an error naming what was expected (exit code 1).
     Needs acorn from "cd tests && npm install" for check 7.

   WHAT IT READS / WRITES
     Reads web/js/flow.js, web/js/flow-panel.js, web/config/survey.json and
     tests/flow/legacy/variants/*.json. Writes nothing.
   ============================================================================= */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/flow/)
const flow = require(path.join(REPO, 'web/js/flow.js'));
const panel = require(path.join(REPO, 'web/js/flow-panel.js'));
const VARIANTS = path.join(__dirname, 'legacy', 'variants');
const BASE = JSON.parse(fs.readFileSync(path.join(VARIANTS, 'base.json'), 'utf8'));
const SURVEY_TEXT = fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8');

let count = 0;
const ok = (name) => { count++; console.log('PASS', name); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const deep = (a, b, what) => assert.ok(util.isDeepStrictEqual(clone(a), clone(b)),
  (what || 'not equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b));

/* A Screens row as Model.gs keeps it (PP_mdlNormalizeScreen_): every field present. */
function row(fields) {
  return Object.assign({ id: '', type: '', text: '', required: null, show_if: null, skip_if: '', options: [], low_label: '',
    high_label: '', scale_hint: '', body: '', active: true, next: '', jumps: [], repeat: '' }, fields);
}
/* A list line as the Screens tab holds it (Model.gs import: PP_mdlScreenFromFlow_ + tidying). */
function rowOfLine(e) {
  const text = (v) => (typeof v === 'string' ? v.trim() : (v === undefined || v === null ? '' : String(v).trim()));
  const show = e.show_if && typeof e.show_if === 'object' && !Array.isArray(e.show_if) && Object.keys(e.show_if).length ? clone(e.show_if) : null;
  return row({ id: text(e.id), type: text(e.type), text: text(e.text),
    required: typeof e.required === 'boolean' ? e.required : (e.required === undefined || e.required === null || e.required === '' ? null : e.required),
    show_if: show, skip_if: text(e.skip_if),
    options: (Array.isArray(e.options) ? e.options : []).map(text).filter(Boolean),
    low_label: text(e.low_label), high_label: text(e.high_label), scale_hint: text(e.scale_hint), body: text(e.body) });
}
const rowsOf = (list) => list.map(rowOfLine);
function survey(patch) {
  const s = clone(BASE);
  delete s._source;
  if (patch) Object.keys(patch).forEach((k) => { s[k] = clone(patch[k]); });
  return s;
}
const withFlow = (s, graph) => Object.assign(clone(s), { flow: clone(graph) });
const text = (graph) => panel.formatFlow(graph);

/* The screens the real engine shows for some answers. */
function walk(s, graph, answers, facts) {
  const sv = withFlow(s, graph);
  const steps = flow.path(flow.load(sv), sv, { facts: Object.assign({ lang: 'en', lang_in_url: true, whats_changed_count: 0, round: 'R1' }, facts || {}) },
    { answers: answers || {}, texts: {}, audio: {} });
  return steps.map((x) => x.id);
}

/* rows -> graph -> rows (the same rows) and graph -> rows -> graph (byte-identical text). */
function roundTrips(rows, s, label) {
  const made = panel.fromRows(rows, s);
  const back = panel.toRows(made.graph, s);
  deep(back.unsupported, [], label + ': toRows can show every screen');
  deep(back.screens, rows.filter((r) => r.active !== false), label + ': rows -> graph -> rows gives the same rows');
  const again = panel.fromRows(back.screens, s).graph;
  assert.strictEqual(text(again), text(made.graph), label + ': graph -> rows -> graph is byte-identical');
  const viaText = panel.toRows(JSON.parse(text(made.graph)), s);
  deep(viaText.unsupported, [], label + ': the written text reads back');
  assert.strictEqual(text(panel.fromRows(viaText.screens, s).graph), text(made.graph), label + ': text -> rows -> graph is byte-identical');
  return made;
}

// ---------------------------------------------------------------------------
// 1. Without the new columns: exactly fromLegacy
// ---------------------------------------------------------------------------
{
  for (const when of ['after_all_ratings', 'immediate']) {
    const s = survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when }) });
    const rows = rowsOf(s.flow);
    const made = panel.fromRows(rows, s);
    deep(made.graph, flow.fromLegacy(s), when + ': same as fromLegacy');
    assert.strictEqual(JSON.stringify(made.graph), JSON.stringify(flow.fromLegacy(s)), when + ': even the key order is the same');
    deep(made.warnings, [], when + ': no warnings');
    roundTrips(rows, s, 'today (' + when + ')');
  }
  const repo = JSON.parse(SURVEY_TEXT);
  if (Array.isArray(repo.flow)) {
    deep(panel.fromRows(rowsOf(repo.flow), repo).graph, flow.fromLegacy(repo), 'web/config/survey.json: same as fromLegacy');
  } else {
    // since 26 Oct 2026 the project's survey.json holds the graph (scripts/flow.js migrate --write): the control
    // panel shows it as today's rows, and those rows give exactly that graph again
    const notes = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
    const back = panel.toRows(repo.flow, repo);
    deep(back.unsupported, [], 'web/config/survey.json: the panel can show every screen');
    deep(back.screens, rowsOf(BASE.flow), 'web/config/survey.json: the rows are today\'s list, line for line');
    const again = panel.fromRows(back.screens, repo).graph;
    deep(again, notes(repo.flow), 'web/config/survey.json: rows -> graph is the file\'s graph');
    assert.strictEqual(panel.formatFlow(again), panel.formatFlow(repo.flow), 'web/config/survey.json: and it is written as the same text');
  }
  ok("today's rows give exactly PP.flow.fromLegacy (both problem-screen modes), and the repo's survey.json (a graph) reads back as today's rows");
}
{
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'one_fix').active = false;
  rows.find((r) => r.id === 'support').active = false;
  rows.find((r) => r.id === 'whats_changed').active = false;
  const visible = s.flow.filter((e) => ['one_fix', 'support', 'whats_changed'].indexOf(e.id) === -1);
  deep(panel.fromRows(rows, s).graph, flow.fromLegacy(Object.assign(clone(s), { flow: visible })), 'hidden rows are left out, like before');
  rows.find((r) => r.id === 'thanks').active = false;   // the form then adds its own thank-you, as before
  const g = panel.fromRows(rows, s).graph;
  deep(g, flow.fromLegacy(Object.assign(clone(s), { flow: visible.filter((e) => e.id !== 'thanks') })), 'a hidden thank-you: the safety-net one is added');
  ok('hidden rows (no new columns): exactly fromLegacy of the visible rows');
}
{
  // Every list-format questionnaire the audit and the engine build used (tests/flow/legacy/variants).
  const files = fs.readdirSync(VARIANTS).filter((f) => /\.json$/.test(f));
  let exact = 0;
  let rebuilt = 0;
  for (const file of files) {
    const v = JSON.parse(fs.readFileSync(path.join(VARIANTS, file), 'utf8'));
    const s = survey();
    Object.keys(v).forEach((k) => { if (k.charAt(0) !== '_') s[k] = clone(v[k]); });
    if (!Array.isArray(s.flow)) continue;
    const rows = rowsOf(s.flow.filter((e) => e && typeof e === 'object' && !Array.isArray(e)));
    const made = panel.fromRows(rows, s);
    deep(made.warnings, [], file + ': no warnings');
    // the list Model.gs would build from those rows (its old PP_mdlCompileFlow_), converted by the engine
    const list = rows.map((r) => {
      const e = { id: r.id, type: r.type };
      if (r.text) e.text = r.text;
      if (r.options.length) e.options = r.options.slice();
      ['low_label', 'high_label', 'scale_hint', 'body'].forEach((f) => { if (r[f]) e[f] = r[f]; });
      if (typeof r.required === 'boolean') e.required = r.required;
      if (r.show_if) e.show_if = clone(r.show_if);
      if (r.skip_if) e.skip_if = r.skip_if;
      return e;
    });
    deep(made.graph, flow.fromLegacy(Object.assign(clone(s), { flow: list })), file + ': same as fromLegacy of the rows\' list');
    rebuilt++;
    if (util.isDeepStrictEqual(list, s.flow)) {
      deep(made.graph, flow.fromLegacy(s), file + ': same as fromLegacy of the original list');
      exact++;
    }
  }
  assert.ok(rebuilt >= 50 && exact >= 30, 'variants checked: ' + rebuilt + ' (' + exact + ' exactly as written)');
  ok('every list questionnaire in tests/flow/legacy/variants: ' + rebuilt + ' checked, ' + exact + ' equal to fromLegacy of the file itself');
}

// ---------------------------------------------------------------------------
// 2. The new columns
// ---------------------------------------------------------------------------
const PROMOTER = { answer: 'nps', at_least: 9 };
const ALL_LOW = { 'fn_rating:losses': 2, 'fn_rating:payments': 5, 'fn_rating:linehaul': 3, 'fn_rating:consumables': 'na', 'fn_rating:orders': 4, 'fn_rating:app': 5 };
const AREAS = ['losses', 'payments', 'linehaul', 'consumables', 'orders', 'app'];
const ratings = AREAS.map((a) => 'fn_rating:' + a);

{
  // A jump: promoters skip the area questions.
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: PROMOTER, goto: 'support_gate' }];
  const made = roundTrips(rows, s, 'jump');
  deep(made.warnings, [], 'jump: no warnings');
  const nps = made.graph.nodes.find((n) => n.id === 'nps');
  deep(nps.next, [{ when: PROMOTER, goto: 'support_gate' }, { default: 'fn_ratings' }], 'jump: the arrow list, default last');
  deep(walk(s, made.graph, { nps: 10 }), ['nps', 'support_gate', 'one_fix', 'thanks'], 'a promoter jumps');
  deep(walk(s, made.graph, Object.assign({ nps: 4 }, ALL_LOW)),
    ['nps'].concat(ratings, ['fn_deep_dive:losses', 'fn_deep_dive:linehaul', 'support_gate', 'one_fix', 'thanks']), 'a detractor goes the usual way');
  ok('jumps: "if NPS is at least 9 go to the support question" (walked by the engine)');
}
{
  // An explicit "next" skipping a row, and a jump that is the default arrow written out.
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'support_gate').next = 'one_fix';
  rows.splice(rows.findIndex((r) => r.id === 'one_fix'), 0, row({ id: 'callback', type: 'yes_no', text: 'q.callback', required: false }));
  const made = roundTrips(rows, s, 'next');
  assert.strictEqual(made.graph.nodes.find((n) => n.id === 'support_gate').next, 'one_fix');
  deep(walk(s, made.graph, { nps: 7, support_gate: 'yes' }).slice(-4), ['fn_rating:app', 'support_gate', 'one_fix', 'thanks'], 'support and callback are skipped');
  ok('"next": after this question usually go to a later one');
}
{
  // Asked once for each area, and once for each area rated low.
  const s = survey();
  const rows = rowsOf(s.flow);
  const at = rows.findIndex((r) => r.id === 'support_gate');
  rows.splice(at, 0, row({ id: 'callback', type: 'yes_no', text: 'q.callback', repeat: 'each_low_area' }),
    row({ id: 'pick', type: 'single_choice', text: 'q.pick', options: ['a', 'b'], repeat: 'each_area', required: false }));
  const made = roundTrips(rows, s, 'repeat');
  deep(made.warnings, [], 'repeat: no warnings');
  const cb = made.graph.nodes.find((n) => n.id === 'callback');
  deep({ store_as: cb.store_as, label: cb.label, repeat_for: cb.repeat_for },
    { store_as: 'callback:{area}', label: 'fn.{area}.name', repeat_for: { each: 'area', in: 'areas', where: { answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } } } },
    'each_low_area: store_as, label and the "low" filter');
  deep(made.graph.nodes.find((n) => n.id === 'pick').repeat_for, { each: 'area', in: 'areas' }, 'each_area: no filter');
  const ids = walk(s, made.graph, Object.assign({ nps: 5 }, ALL_LOW));
  deep(ids.filter((id) => /^callback:/.test(id)), ['callback:losses', 'callback:linehaul'], 'asked for the two areas rated low ("na" is never low)');
  deep(ids.filter((id) => /^pick:/.test(id)), AREAS.map((a) => 'pick:' + a), 'asked for every area');
  const sv = withFlow(s, made.graph);
  const step = flow.path(flow.load(sv), sv, { facts: { lang_in_url: true } }, { answers: Object.assign({ nps: 5 }, ALL_LOW) })
    .find((x) => x.id === 'pick:payments');
  deep({ label: step.keys.label, options: step.keys.options }, { label: 'fn.payments.name', options: [{ code: 'a', text: 'choice.pick.a' }, { code: 'b', text: 'choice.pick.b' }] },
    'the repeated step carries the area\'s name and the usual answer labels');
  ok('repeat: once per area / once per area rated low (store_as "<id>:{area}", label fn.{area}.name)');
}
{
  // Several endings: a short route for detractors, reached only by a jump, with its own wording.
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: { answer: 'nps', at_most: 3 }, goto: 'why_low' }];
  rows.push(row({ id: 'why_low', type: 'free_text', text: 'q.why_low', required: false }),
    row({ id: 'short_end', type: 'thank_you', text: 'end.short_end.title', body: 'end.short_end.body' }));
  const made = roundTrips(rows, s, 'two endings');
  deep(made.warnings, [], 'two endings: no warnings');
  const end = made.graph.nodes.find((n) => n.id === 'short_end');
  deep(end, { id: 'short_end', type: 'thank_you', text: 'end.short_end.title', body: 'end.short_end.body' }, 'the second ending keeps its own wording');
  assert.ok(!('next' in made.graph.nodes.find((n) => n.id === 'thanks')), 'the main thank-you is an ending (no next)');
  deep(walk(s, made.graph, { nps: 2 }), ['nps', 'why_low', 'short_end'], 'a detractor gets the short route and its ending');
  deep(walk(s, made.graph, { nps: 8, 'fn_rating:losses': 5 }).slice(-2), ['one_fix', 'thanks'], 'everyone else ends at the main thank-you');
  const sv = withFlow(s, made.graph);
  const last = flow.path(flow.load(sv), sv, { facts: {} }, { answers: { nps: 1 } }).pop();
  deep(last.keys, { text: 'end.short_end.title', body: 'end.short_end.body' }, 'the ending step gets its own text keys');
  ok('several endings: rows after the main thank-you are reached only by a jump');
}
{
  // "Straight after each low rating" (immediate): the area ratings row is the group.
  const s = survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: 'immediate' }) });
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: { answer: 'nps', at_least: 10 }, goto: 'one_fix' }];
  rows.find((r) => r.id === 'language').next = 'fn_ratings';            // an arrow to the group
  rows.find((r) => r.id === 'fn_ratings').jumps = [{ when: { answer: 'fn_rating:app', equals: 'na' }, goto: 'one_fix' }];
  const made = roundTrips(rows, s, 'immediate');
  deep(made.warnings, [], 'immediate: no warnings');
  const group = made.graph.nodes.find((n) => n.type === 'group');
  assert.strictEqual(made.graph.nodes.find((n) => n.id === 'language').next, group.id, 'an arrow to the area ratings row goes to the group');
  deep(group.next, [{ when: { answer: 'fn_rating:app', equals: 'na' }, goto: 'one_fix' }, { default: 'support_gate' }], 'the ratings row\'s jump is the group\'s');
  const ids = walk(s, made.graph, Object.assign({ nps: 6, support_gate: 'no' }, ALL_LOW, { 'fn_rating:app': 'na' }), { lang_in_url: false });
  deep(ids, ['language', 'fn_rating:losses', 'fn_deep_dive:losses', 'fn_rating:payments', 'fn_rating:linehaul', 'fn_deep_dive:linehaul',
    'fn_rating:consumables', 'fn_rating:orders', 'fn_rating:app', 'one_fix', 'thanks'], 'walked: problem screens right after low ratings, then the jump');
  ok('the immediate group: arrows to and from the area ratings row');
}
{
  // Arrows to hidden rows go where the hidden row would have gone (C2).
  const s = survey();
  const names = [];
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: PROMOTER, goto: 'support_gate' }, { when: { answer: 'nps', at_most: 2 }, goto: 'one_fix' }];
  rows.find((r) => r.id === 'support_gate').active = false;               // jump 1 -> its following visible row
  const fix = rows.find((r) => r.id === 'one_fix');
  fix.active = false;
  fix.next = 'thanks';                                                    // jump 2 -> the hidden row's own next
  rows.find((r) => r.id === 'whats_changed').next = 'support_gate';       // next -> hidden -> following visible (support)
  const made = panel.fromRows(rows, s, { nameOf: (r, i) => { names.push(r.id); return 'question ' + (i + 1) + ' ("' + r.id.toUpperCase() + '")'; } });
  deep(made.graph.nodes.find((n) => n.id === 'nps').next,
    [{ when: PROMOTER, goto: 'support' }, { when: { answer: 'nps', at_most: 2 }, goto: 'thanks' }, { default: 'fn_ratings' }], 'jumps re-targeted');
  assert.strictEqual(made.graph.nodes.find((n) => n.id === 'whats_changed').next, 'support', '"next" re-targeted');
  deep(made.warnings.map((w) => [w.code, w.node, w.row]), [['C2', 'whats_changed', 1], ['C2', 'nps', 2], ['C2', 'nps', 2]], 'one C2 warning per re-targeted arrow');
  assert.ok(/^Question 3 \("NPS"\): jump 1 goes to question 6 \("SUPPORT_GATE"\), which is hidden, so it goes to question 7 \("SUPPORT"\) instead\./.test(made.warnings[1].message),
    'plain English, naming the questions with nameOf: ' + made.warnings[1].message);
  assert.ok(names.length > 0, 'nameOf is used');
  // graph -> rows -> graph: the visible rows carry the re-targeted arrows
  const back = panel.toRows(made.graph, s);
  deep(back.unsupported, [], 're-targeted graph: toRows can show it');
  assert.strictEqual(text(panel.fromRows(back.screens, s).graph), text(made.graph), 're-targeted: graph -> rows -> graph is byte-identical');
  deep(back.screens.find((r) => r.id === 'nps').jumps, [{ when: PROMOTER, goto: 'support' }, { when: { answer: 'nps', at_most: 2 }, goto: 'thanks' }], 'rows name the new targets');
  // a hidden row with nothing visible after it: the jump is left out
  const rows2 = rowsOf(s.flow);
  rows2.push(row({ id: 'late', type: 'free_text', text: 'q.late', active: false }));
  rows2.find((r) => r.id === 'nps').jumps = [{ when: PROMOTER, goto: 'late' }];
  const made2 = panel.fromRows(rows2, s);
  assert.strictEqual(made2.graph.nodes.find((n) => n.id === 'nps').next, 'fn_ratings', 'nowhere to go: no jump at all');
  deep(made2.warnings.map((w) => w.code), ['C2'], 'and a C2 warning');
  ok('arrows to hidden rows: re-targeted (C2), and the round trip holds');
}

// ---------------------------------------------------------------------------
// 4. Unsafe or unusable settings are left out, with a warning
// ---------------------------------------------------------------------------
{
  const s = survey();
  const rows = rowsOf(s.flow);
  const r = (id) => rows.find((x) => x.id === id);
  r('support_gate').jumps = [{ when: PROMOTER, goto: 'nps' }];                      // backwards: G3
  r('support').next = 'nowhere_at_all';                                             // unknown: G2
  r('one_fix').jumps = '{"when": nps';                                              // unreadable: F1
  r('nps').jumps = [{ goto: 'support_gate' }, { when: PROMOTER }, 'junk'];          // malformed: F1 x3
  r('fn_ratings').repeat = 'each_area';                                             // built-in: F1
  r('support_gate').repeat = 'twice';                                               // unknown value: F1
  r('thanks').next = 'nps';                                                         // ending: G4
  r('whats_changed').next = 'whats_changed';                                        // itself: G3
  const made = panel.fromRows(rows, s);
  deep(made.warnings.map((w) => w.code + ':' + w.node).sort(), ['F1:fn_ratings', 'F1:nps', 'F1:nps', 'F1:nps', 'F1:one_fix', 'F1:support_gate',
    'G2:support', 'G3:support_gate', 'G3:whats_changed', 'G4:thanks'].sort(), 'one warning per problem');
  deep(made.graph, flow.fromLegacy(s), 'nothing unsafe reaches the graph: it is today\'s graph');
  made.warnings.forEach((w) => {
    assert.ok(/^Question \d+/.test(w.message) && !/undefined|\[object Object\]|NaN/.test(w.message) && /\)$|\.$/.test(w.message), 'plain English: ' + w.message);
    assert.ok(typeof w.row === 'number' && rows[w.row].id === w.node, 'row and node point at the same row');
  });
  assert.ok(/goes back to question 3/.test(made.warnings.find((w) => w.node === 'support_gate' && w.code === 'G3').message), 'G3 names the earlier question');
  // the immediate mode ignores the problem screens row
  const si = survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: 'immediate' }) });
  const ri = rowsOf(si.flow);
  ri.find((x) => x.id === 'fn_deep_dives').next = 'one_fix';
  const mi = panel.fromRows(ri, si);
  deep(mi.warnings.map((w) => w.code + ':' + w.node), ['F1:fn_deep_dives'], 'immediate: the problem screens row\'s next is not used');
  deep(mi.graph, flow.fromLegacy(si), 'immediate: the graph is unchanged');
  ok('unsafe arrows and settings are left out with a warning (G2, G3, G4, F1)');
}

// ---------------------------------------------------------------------------
// 4b. A route below the thank-you that runs on into another route (G5, level
//     "error"; 27 Oct 2026, review W8 finding 2): the rule Model.gs
//     PP_mdlCheckRunIntoRoutes_ had alone, now in fromRows, so the table's
//     Check, the panel's cards and Publish share it.
// ---------------------------------------------------------------------------
/* FROZEN REFERENCE: apps-script/Model.gs PP_mdlCheckRunIntoRoutes_ (and PP_mdlMainThanks_) as they were on
   27 Oct 2026, copied line for line; only the helpers are plain JS here and report.error() records
   { row, into, from } instead of a message. Never change it: fromRows must agree with it. */
function referenceRunInto(model) {
  const PP_mdlHas_ = (obj, key) => obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
  const PP_mdlIsObject_ = (value) => Object.prototype.toString.call(value) === '[object Object]';
  const PP_mdlTrim_ = (value) => (value === null || value === undefined ? '' : String(value)).trim();
  function PP_mdlMainThanks_(m) {
    let at = -1;
    m.screens.forEach((screen, index) => { if (at < 0 && screen.type === 'thank_you' && screen.active) at = index; });
    return at;
  }
  const flagged = [];
  const main = PP_mdlMainThanks_(model);
  if (main < 0) return flagged;
  const screens = model.screens;
  const immediate = model.settings['deep_dive.when'] === 'immediate';
  const jumpedTo = {};   // '#code' -> the shown rows whose jumps lead there
  screens.forEach((screen, index) => {
    if (!screen.active || !Array.isArray(screen.jumps)) return;
    screen.jumps.forEach(jump => {
      const to = PP_mdlIsObject_(jump) ? PP_mdlTrim_(jump['goto']) : '';
      if (!to) return;
      if (!PP_mdlHas_(jumpedTo, '#' + to)) jumpedTo['#' + to] = [];
      if (jumpedTo['#' + to].indexOf(index) === -1) jumpedTo['#' + to].push(index);
    });
  });
  for (let i = main + 1; i < screens.length; i += 1) {
    const row = screens[i];
    if (!row.active || row.type === 'thank_you' || PP_mdlTrim_(row.next)) continue;
    if (immediate && row.type === 'function_deep_dives') continue;   // not part of the route in that mode
    let k = i + 1;
    while (k < screens.length && !screens[k].active && screens[k].type !== 'thank_you') k += 1;
    if (k >= screens.length || !screens[k].active) continue;         // the end, or a hidden ending: the route ends
    const into = screens[k];
    const from = (PP_mdlHas_(jumpedTo, '#' + into.id) ? jumpedTo['#' + into.id] : []).filter(at => at !== i);
    if (!into.id || !from.length) continue;
    flagged.push({ row: i, into: k, from: from });
  }
  return flagged;
}
{
  // The review's case (review/e9b.js): promoters' question below the thank-you runs on into the detractors' route
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: { answer: 'nps', at_most: 6 }, goto: 'detractor_q' }, { when: PROMOTER, goto: 'promo_q' }];
  rows.push(row({ id: 'promo_q', type: 'free_text', text: 'q.promo_q', required: false }),
    row({ id: 'detractor_q', type: 'free_text', text: 'q.detractor_q', required: false }),
    row({ id: 'detractor_end', type: 'thank_you', text: 'end.detractor_end.title' }));
  const made = panel.fromRows(rows, s, { nameOf: (r, i) => 'row ' + (i + 2) + ' ("' + r.id.toUpperCase() + '")' });
  const notes = made.warnings.filter((w) => w.code === 'G5');
  deep(notes.map((w) => [w.code, w.level, w.node, w.row]), [['G5', 'error', 'promo_q', 9]], 'one G5 note, level "error", at the row');
  assert.strictEqual(notes[0].message, 'Row 11 ("PROMO_Q") has no "then go to", so partners who answer it go straight on to row 12 ("DETRACTOR_Q"), ' +
    'which starts another route: row 4 ("NPS") jumps there. Write where it goes in its "then go to" column, for example its own ending, or add an ' +
    'ending row between them. If both routes should carry on there, write "detractor_q" in its "then go to" to say so. (Its code is "promo_q"; ' +
    'the code of the row after it is "detractor_q".)');
  deep(walk(s, made.graph, { nps: 10 }), ['nps', 'promo_q', 'detractor_q', 'detractor_end'], 'what it warns about: promoters run on (the graph is unchanged)');
  rows.find((r) => r.id === 'promo_q').next = 'thanks';
  deep(panel.fromRows(rows, s).warnings.filter((w) => w.code === 'G5'), [], 'with its own "then go to": fine');
  ok('G5: a route below the thank-you that runs on into another route is an error note at its row, in the table\'s words');
}
{
  // Parity with the frozen Model.gs rule on generated routes: random jumps, "next", hidden rows, endings, both modes
  let seed = 20261027;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const pick = (a) => a[rnd(a.length)];
  let flaggedLists = 0;
  let total = 0;
  for (let iter = 0; iter < 3000; iter++) {
    const immediate = rnd(4) === 0;
    const s = survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: immediate ? 'immediate' : 'after_all_ratings' }) });
    const rows = rowsOf(BASE.flow);
    const n = 2 + rnd(7);
    for (let k = 0; k < n; k++) {
      const kind = pick(['free_text', 'yes_no', 'rating_1_5', 'info_card', 'thank_you', 'thank_you', 'free_text', 'function_deep_dives']);
      const id = rnd(12) === 0 ? pick(['promo_q', 'thanks', 'r0']) : 'r' + k;      // now and then a code twice
      rows.push(row({ id, type: kind, text: kind === 'thank_you' ? 'end.' + id + '.title' : 'q.' + id }));
    }
    if (rnd(3) === 0) rows.splice(1 + rnd(rows.length - 1), 0, row({ id: 'mid' + iter, type: pick(['yes_no', 'thank_you']) }));
    const codes = rows.map((r) => r.id).concat(['nowhere']);
    rows.forEach((r, i) => {
      if (rnd(5) === 0) r.active = false;
      if (rnd(5) === 0) r.next = pick(codes);
      if (rnd(3) === 0) {
        const list = [];
        for (let j = rnd(3); j >= 0; j--) list.push(rnd(10) === 0 ? { goto: pick(codes) } : { when: { answer: 'nps', at_most: rnd(11) }, goto: pick(codes) });
        r.jumps = rnd(15) === 0 ? { unreadable: 'if nps go' } : list;
      }
      if (r.type === 'thank_you' && rnd(6) === 0) r.show_if = { answer: 'nps', at_least: 9 };
    });
    total++;
    const want = referenceRunInto({ screens: clone(rows), settings: { 'deep_dive.when': immediate ? 'immediate' : 'after_all_ratings' } });
    const got = panel.fromRows(clone(rows), s).warnings.filter((w) => w.code === 'G5');
    deep(got.map((w) => w.row), want.map((f) => f.row), 'iteration ' + iter + ': the same rows flagged\n' + JSON.stringify(rows));
    got.forEach((w, k) => {
      assert.strictEqual(w.level, 'error');
      assert.strictEqual(w.node, rows[w.row].id);
      assert.ok(w.message.indexOf('"' + rows[want[k].into].id + '"') !== -1, 'names the row it runs into: ' + w.message);
    });
    if (want.length) flaggedLists++;
  }
  assert.ok(flaggedLists >= 200, 'enough generated routes run on into another: ' + flaggedLists + ' of ' + total);
  ok('G5 agrees with the frozen Model.gs PP_mdlCheckRunIntoRoutes_ on ' + total + ' generated routes (' + flaggedLists + ' with a run-on)');
}
{
  // Review W8 finding 10: the notes are written in the route table's words (they reach Publish and the panel's cards as they are)
  const s = survey();
  const rows = rowsOf(s.flow);
  const r = (id) => rows.find((x) => x.id === id);
  r('support_gate').jumps = [{ when: PROMOTER, goto: 'nps' }];
  r('support').next = 'nowhere_at_all';
  r('one_fix').jumps = '{"when": nps';
  r('nps').jumps = [{ goto: 'support_gate' }];
  r('fn_ratings').repeat = 'each_area';
  r('support_gate').repeat = 'twice';
  r('thanks').next = 'nps';
  rows.push(row({ id: 'late_end', type: 'thank_you', text: 'end.late_end.title', active: false }));
  r('whats_changed').jumps = [{ when: PROMOTER, goto: 'late_end' }];
  const notes = panel.fromRows(rows, s, { nameOf: (x, i) => 'row ' + (i + 2) + ' ("' + x.id.toUpperCase() + '")' }).warnings;
  const si = survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: 'immediate' }) });
  const ri = rowsOf(si.flow);
  ri.find((x) => x.id === 'fn_deep_dives').next = 'one_fix';
  const all = notes.concat(panel.fromRows(ri, si).warnings);
  assert.ok(all.length >= 9, JSON.stringify(all.map((w) => w.code)));
  all.forEach((w) => {
    assert.ok(!/control panel|Edit this question|Clear them\)|Pick the question|Build (it|them) again|Screens tab|"usually go to"|"next"|"repeat"|its type is/.test(w.message),
      'table words: ' + w.message);
  });
  const hiddenEnd = notes.find((w) => w.code === 'C2' && w.node === 'whats_changed');
  assert.strictEqual(hiddenEnd.message, 'Row 3 ("WHATS_CHANGED"): jump 1 goes to row 11 ("LATE_END"), an ending that is hidden, so partners end at the main ' +
    'thank-you screen, row 10 ("THANKS"), instead. (Its code is "whats_changed"; that ending\'s code is "late_end".)', 'the main thank-you is named like every row');
  assert.ok(/Correct it in the route table \(Questions > Paste a route\)\./.test(notes.find((w) => w.code === 'G2').message));
  assert.ok(/its "ask for" says "twice", which the form does not know, so it is asked once\. Write one of: once \(empty\), each area, each area rated low\./
    .test(notes.find((w) => w.code === 'F1' && w.node === 'support_gate').message));
  assert.ok(/only some kinds of question \(0 to 10, faces, yes\/no, pick one, voice\/typing, info card\) can be asked once per area, so its "ask for" is not used here\. \(Its code is "fn_ratings"; its kind is "area ratings"\.\)/
    .test(notes.find((w) => w.code === 'F1' && w.node === 'fn_ratings').message));
  ok('fromRows notes use the route table\'s words ("then go to", "jumps", "ask for", "Correct it in the route table"), and name the main thank-you like any row');
}

// ---------------------------------------------------------------------------
// 5. toRows refuses graphs the panel can't show
// ---------------------------------------------------------------------------
{
  const s = survey();
  const base = () => clone(flow.fromLegacy(s));
  const refused = (g, sv) => panel.toRows(g, sv || s).unsupported;
  const one = (g, node, pattern, sv) => {
    const u = refused(g, sv);
    assert.ok(u.some((x) => x.node === node && pattern.test(x.message)), 'expected ' + node + ' ' + pattern + ', got ' + JSON.stringify(u));
    u.forEach((x) => assert.ok(typeof x.message === 'string' && x.message.length > 20 && !/undefined|\[object/.test(x.message), x.message));
  };
  let g = base();
  g.nodes.splice(3, 0, { id: 'mine', type: 'group', repeat_for: { each: 'item', in: 'support_items' },
    body: { start: 'x', nodes: [{ id: 'x', type: 'yes_no', text: 'q.x', store_as: 'x:{item}', next: '@next_item' }] }, next: 'fn_ratings' });
  g.nodes[2].next = 'mine';
  one(g, 'mine', /group of screens/);
  g = base();
  const sup = g.nodes.find((n) => n.id === 'support_gate');
  sup.repeat_for = { each: 'item', in: 'support_items' };
  sup.store_as = 'support_gate:{item}';
  one(g, 'support_gate', /each item of "support_items"/);
  g = base();
  g.nodes.find((n) => n.id === 'support_gate').help = 'q.gate_help';
  one(g, 'support_gate', /cannot show or keep: help/);
  g = base();
  g.nodes.find((n) => n.id === 'nps').next = [{ when: PROMOTER, goto: 'support_gate' }];
  one(g, 'nps', /no final "default"/);
  g = base();
  g.start = 'nps';
  one(g, 'nps', /starts at "nps"/);
  g = base();
  g.collections.areas.defaults.threshold = 2;
  one(g, '', /collections/);
  g = base();
  g.nodes.find((n) => n.id === 'fn_ratings').repeat_for.where = { answer: 'nps', at_most: 6 };
  one(g, 'fn_ratings', /standard way/);
  const gi = clone(flow.fromLegacy(survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: 'immediate' }) })));
  one(gi, 'area_loop', /deep_dive\.when/);                                 // the group, but settings say "after all"
  g = base();
  g.nodes.find((n) => n.id === 'nps').next = [{ when: PROMOTER, goto: 'nowhere' }, { default: 'fn_ratings' }];
  one(g, 'nps', /not in the list of screens/);
  g = base();
  g.nodes.pop();                                                           // no thank-you, and a dead end
  g.nodes[g.nodes.length - 1].next = undefined;
  one(clone(g), 'one_fix', /does not say where to go next/);
  g = base();
  g.nodes.pop();                                                           // no thank-you: the panel would add one
  g.nodes[g.nodes.length - 1].next = 'thanks_elsewhere';
  one(clone(g), 'one_fix', /not in the list of screens \("thanks_elsewhere"\)/);
  deep(panel.toRows({ nodes: [] }, s).unsupported.length, 1, 'not a graph at all');
  deep(refused(base()), [], 'today\'s graph is fine');
  ok('toRows names every screen the panel cannot show (groups, other lists, extra settings, missing default, start, collections, mode)');
}

// ---------------------------------------------------------------------------
// 6. formatFlow and surveyTextWithFlow
// ---------------------------------------------------------------------------
{
  const s = survey();
  const rows = rowsOf(s.flow);
  rows.find((r) => r.id === 'nps').jumps = [{ when: PROMOTER, goto: 'support_gate' }];
  const graph = panel.fromRows(rows, s).graph;
  const t = panel.formatFlow(graph);
  const parsed = JSON.parse(t);
  assert.strictEqual(parsed._help, panel.FLOW_HELP, 'the note is at the top');
  assert.strictEqual(Object.keys(parsed).join(), '_help,format,start,collections,nodes', 'top-level order');
  const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
  deep(strip(parsed), graph, 'the text is the graph (plus the note)');
  // the same graph with its keys in another order gives the same text
  const shuffle = (v) => (Array.isArray(v) ? v.map(shuffle) : v && typeof v === 'object'
    ? Object.keys(v).reverse().reduce((o, k) => { o[k] = shuffle(v[k]); return o; }, {}) : v);
  assert.strictEqual(panel.formatFlow(shuffle(graph)), t, 'every key in a stable order (nodes, rules, loops, lists, arrows)');
  assert.strictEqual(panel.formatFlow(flow.load(withFlow(s, graph))), t, 'the engine\'s prepared graph (byId) writes the same text');
  assert.strictEqual(panel.formatFlow(Object.assign(clone(graph), { _help: 'old note' })), t, 'an old note is replaced by FLOW_HELP');
  const indented = panel.formatFlow(graph, 2);
  assert.strictEqual(indented.split('\n').slice(1).join('\n'), t.split('\n').slice(1).map((l) => (l ? '  ' + l : l)).join('\n'), 'indent shifts every later line');
  assert.ok(/\n {6}"next": \[\n {8}\{ "when": \{ "answer": "nps", "at_least": 9 \}, "goto": "support_gate" \},\n {8}\{ "default": "fn_ratings" \}\n {6}\] \},\n\n/.test(t),
    'a jump list: one arrow per line');
  assert.ok(/\n {4}\{ "id": "thanks", "type": "thank_you" \}\n {2}\]\n\}$/.test(t), 'an ending on one line, at the end');
  assert.ok(!/[ \t]$/m.test(t), 'no line ends with a space');
  const gi = flow.fromLegacy(survey({ deep_dive: Object.assign(clone(BASE.deep_dive), { when: 'immediate' }) }));
  const ti = panel.formatFlow(gi);
  deep(strip(JSON.parse(ti)), gi, 'a group writes and reads back');
  assert.ok(/\n {6}"body": \{\n {8}"start": "fn_ratings",\n {8}"nodes": \[\n {10}\{ "id": "fn_ratings"/.test(ti), 'a group\'s body is nested');
  ok('formatFlow: valid JSON, the note on top, stable layout and key order, groups and jump lists readable');
}
{
  // survey.json as it was until 26 Oct 2026: the old list (frozen in tests/flow/legacy/variants/base.json), then its note
  const at = SURVEY_TEXT.indexOf('\n  "flow": ');
  assert.ok(at > 0, 'survey.json has its "flow"');
  const listText = Array.isArray(JSON.parse(SURVEY_TEXT).flow) ? SURVEY_TEXT
    : SURVEY_TEXT.slice(0, at + 1) + '  "flow": ' + JSON.stringify(BASE.flow) + ',\n  "_flow_help": "The screens, in order."\n}\n';
  const repo = JSON.parse(listText);
  const graph = flow.fromLegacy(repo);
  const out = panel.surveyTextWithFlow(listText, graph);
  const parsed = JSON.parse(out);
  const expected = clone(repo);
  delete expected._flow_help;
  expected.flow = JSON.parse(panel.formatFlow(graph));
  deep(parsed, expected, 'only "flow" changed, and "_flow_help" is gone');
  assert.ok(out.indexOf('  "flow": ' + panel.formatFlow(graph, 2) + '\n}\n') > 0, 'the flow is written by formatFlow, indented 2');
  const before = listText.slice(0, listText.indexOf('  "flow": '));
  assert.strictEqual(out.slice(0, before.length), before, 'every byte before "flow" is unchanged');
  assert.strictEqual(panel.surveyTextWithFlow(out, graph), out, 'doing it twice changes nothing');
  if (listText !== SURVEY_TEXT) {
    assert.strictEqual(out, SURVEY_TEXT, 'the project\'s survey.json is exactly this conversion of the old list (scripts/flow.js migrate --write)');
    assert.strictEqual(panel.surveyTextWithFlow(SURVEY_TEXT, JSON.parse(SURVEY_TEXT).flow), SURVEY_TEXT, 'and writing its own graph again changes nothing');
  }
  // "flow" not last, and the note first: still exact
  const odd = '{\n  "_flow_help": "x",\n  "flow": [1, 2],\n  "a": { "b": "} ] \\" ," }\n}\n';
  assert.strictEqual(panel.surveyTextWithFlow(odd, { format: 'pp-flow/1', nodes: [] }),
    '{\n  "flow": ' + panel.formatFlow({ format: 'pp-flow/1', nodes: [] }, 2) + ',\n  "a": { "b": "} ] \\" ," }\n}\n', 'other layouts');
  ok('surveyTextWithFlow: survey.json with its flow written by formatFlow, everything else byte for byte; the project\'s file is exactly that');
}

// ---------------------------------------------------------------------------
// 7. ES5
// ---------------------------------------------------------------------------
{
  let acorn = null;
  try { acorn = require('acorn'); } catch (e) { acorn = null; }
  if (!acorn) {
    console.log('SKIP the ES5 parse check: run "cd tests && npm install" once (acorn).');
  } else {
    const source = fs.readFileSync(path.join(REPO, 'web/js/flow-panel.js'), 'utf8');
    acorn.parse(source, { ecmaVersion: 5 });
    assert.ok(source.trimEnd().endsWith("}(typeof window !== 'undefined' ? window : globalThis));"), 'the exact footer Flow.gs relies on');
    ok('flow-panel.js parses as ES5 and ends with the footer the Flow.gs generator needs');
  }
}

console.log(count, 'tests passed');

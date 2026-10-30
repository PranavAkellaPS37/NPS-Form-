/* =============================================================================
   tests/flow/check_test.js: tests the flow checker, web/js/flow-check.js.

   WHAT IT CHECKS
     1. Every check code of docs/flow-engine.md section 6 (G1 ... C2, and S1:
        survey.json's own settings disagreeing with a graph) on the
        small fake questionnaires in tests/flow/cases/: each mistake must be
        reported with the expected code, level and screen, and the valid
        cases (today's questionnaire in both formats, and the proposal's
        examples: a jump, a new loop, a rule on the language, two endings,
        "immediate" mode as a group) must give no errors and no warnings.
        Every code must have at least one failing case.
     2. The real questionnaire in web/config and web/i18n: no errors. Codes
        such as "constructor" are ordinary codes (no false C1, C2 or L1), and
        S1 names both values and is never reported in the control panel.
        Each finding about one rule or arrow says where it is (site:
        show_if, where, jump or next; a jump's target and its place in
        "next"), even for two jumps to one screen; and answersAt (what a rule
        at a screen may test, for the control panel) agrees with the rule
        checks on every node and answer of five questionnaires.
     3. The other tools on PP.flowCheck: the Mermaid map (its syntax is
        parsed here, line by line), docs/flow.md, simulate, paths, compare
        and screens: their shape, and that they agree with the engine. A
        rule on a pick-several answer is written as the engine tests it
        ("areas includes load", not "areas == load"; 30 Oct 2026) in the
        map, docs/flow.md, the skipped reasons and --explain, and by
        sentence(cond, survey) / sentenceFor(survey) for the control panel.
        A template such as "{area}_why" is read by the screen that stores
        that template (whatever its item is called: "{fn}_why" too), even
        when an unrelated pick-one answer ("other_why") fits its pattern
        (reviews of 30 Oct 2026).
     4. flow-check.js itself: ES5 only (acorn, when tests/node_modules has
        it), and web/index.html never loads it (phones get no extra bytes).

   THE CASE FILES (tests/flow/cases/*.json; _base.json is the frozen base)
     "base": "list" or "graph" (today's flow in that format), "patch": edits
     ("set" / "remove_field" a field of a node, "remove" / "replace" a node,
     "add" a node after another, "set_flow" a field of the graph itself),
     "survey": fields to replace, "strings_set" / "strings_delete":
     [key, language(, text)], "opts": the checker's options. Then "expect":
     findings that must be there ({code, level, node}), "expect_clean": no
     errors and no warnings, "expect_no_errors", "forbid": findings that must
     not be there. Everything in them is fake.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/check_test.js
     You should see one PASS line per case and per tool, then "N tests
     passed". A failure stops with a message naming what was expected.

   WHAT IT READS / WRITES
     Reads web/js/flow.js, web/js/flow-check.js, tests/flow/cases/,
     web/config/survey.json, web/i18n/strings.json, web/index.html and
     tests/flow/legacy/variants/ (the audit's questionnaires). Writes nothing.
   ============================================================================= */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const flow = require(path.join(REPO, 'web/js/flow.js'));
const C = require(path.join(REPO, 'web/js/flow-check.js'));
const CASES = path.join(__dirname, 'cases');
const BASE = JSON.parse(fs.readFileSync(path.join(CASES, '_base.json'), 'utf8'));
const CODES = ['G1', 'G2', 'G3', 'G4', 'T1', 'R1', 'R2', 'R3', 'R4', 'R5', 'F1', 'F2', 'L1', 'L2', 'D1', 'D2', 'D3', 'D4', 'P1', 'P2', 'P3', 'C1', 'C2', 'S1'];
const clone = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
const ok = (name) => { passed++; console.log('PASS', name); };

/* ---- building a case ------------------------------------------------------------ */
function findNode(list, id) {   // [the list holding it, its index] (group bodies included)
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n && n.id === id) return [list, i];
    if (n && n.type === 'group' && n.body && Array.isArray(n.body.nodes)) {
      const found = findNode(n.body.nodes, id);
      if (found) return found;
    }
  }
  return null;
}
function patch(flowValue, p, name) {
  const nodes = Array.isArray(flowValue) ? flowValue : flowValue.nodes;
  if (p.op === 'set_flow') { flowValue[p.field] = clone(p.value); return; }
  const where = p.op === 'add' ? findNode(nodes, p.after) : findNode(nodes, p.node);
  assert(where, `${name}: patch ${JSON.stringify(p).slice(0, 80)}: no node ${p.op === 'add' ? p.after : p.node}`);
  const [list, i] = where;
  if (p.op === 'set') list[i][p.field] = clone(p.value);
  else if (p.op === 'remove_field') delete list[i][p.field];
  else if (p.op === 'remove') list.splice(i, 1);
  else if (p.op === 'replace') list[i] = clone(p.value);
  else if (p.op === 'add') list.splice(i + 1, 0, clone(p.value));
  else assert.fail(`${name}: unknown patch op ${p.op}`);
}
function build(c, name) {
  const survey = clone(BASE.survey);
  survey.flow = clone(c.base === 'list' ? BASE.flow_list : BASE.flow_graph);
  Object.keys(c.survey || {}).forEach((k) => { survey[k] = clone(c.survey[k]); });
  (c.patch || []).forEach((p) => patch(survey.flow, p, name));
  const strings = clone(BASE.strings);
  (c.strings_set || []).forEach(([key, lang, text]) => { strings[key][lang] = text; });
  (c.strings_delete || []).forEach(([key, lang]) => { if (lang) delete strings[key][lang]; else delete strings[key]; });
  return { survey, strings, opts: c.opts || {} };
}
const brief = (fs2) => fs2.map((f) => `${f.level}:${f.code}${f.node ? '@' + f.node : ''}`).join(' ') || '(none)';
function matches(f, e) { return f.code === e.code && f.level === e.level && (!e.node || f.node === e.node); }

/* ---- 1. the cases ---------------------------------------------------------------- */
const files = fs.readdirSync(CASES).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const failingCodes = new Set();
files.forEach((file) => {
  const name = file.replace(/\.json$/, '');
  const c = JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8'));
  assert(c._about, `${name}: every case says what it checks in "_about"`);
  const { survey, strings, opts } = build(c, name);
  const before = JSON.stringify(survey);
  const r = C.check(survey, strings, opts);
  assert.strictEqual(JSON.stringify(survey), before, `${name}: the checker must not change the questionnaire`);
  assert(Array.isArray(r.findings) && r.stats && typeof r.stats.longest_path === 'number', `${name}: result shape`);
  r.findings.forEach((f) => {
    assert(['error', 'warning', 'info'].includes(f.level), `${name}: level ${f.level}`);
    assert(CODES.includes(f.code), `${name}: unknown code ${f.code}`);
    assert(typeof f.message === 'string' && f.message.length > 20 && !/undefined|\[object Object\]|NaN/.test(f.message), `${name}: a readable message: ${f.message}`);
    assert(f.node === null || typeof f.node === 'string', `${name}: node is an id or null`);
  });
  (c.expect || []).forEach((e) => {
    assert(r.findings.some((f) => matches(f, e)), `${name}: expected ${e.level} ${e.code}${e.node ? ' on ' + e.node : ''}; got ${brief(r.findings)}`);
    if (e.level !== 'info' && !name.startsWith('valid')) failingCodes.add(e.code);
  });
  (c.forbid || []).forEach((e) => assert(!r.findings.some((f) => matches(f, e)), `${name}: must not report ${e.level} ${e.code}; got ${brief(r.findings)}`));
  const errors = r.findings.filter((f) => f.level === 'error');
  const warnings = r.findings.filter((f) => f.level === 'warning');
  if (c.expect_clean) assert(!errors.length && !warnings.length, `${name}: expected no errors or warnings; got ${brief(errors.concat(warnings))}`);
  if (c.expect_no_errors) assert(!errors.length, `${name}: expected no errors; got ${brief(errors)}`);
  if (name.startsWith('valid')) assert(c.expect_clean, `${name}: a valid case must say "expect_clean"`);
  else assert((c.expect || []).length, `${name}: a failing case must say what it expects`);
  ok(`case ${name}: ${brief(r.findings.filter((f) => f.level !== 'info' || (c.expect || []).some((e) => e.code === f.code)))}`);
});
// R5 is an info note; it is "failing" in its own case.
failingCodes.add('R5');
CODES.forEach((code) => assert(failingCodes.has(code), `no failing case for ${code}: add one to tests/flow/cases/`));
ok(`every one of the ${CODES.length} check codes has a failing case (${files.length} case files)`);

/* ---- 2. the real questionnaire ------------------------------------------------------ */
const live = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const liveStrings = JSON.parse(fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8'));
{
  const r = C.check(live, liveStrings, { surface: 'repo' });
  const errors = r.findings.filter((f) => f.level === 'error');
  assert(!errors.length, 'web/config/survey.json must have no flow errors: ' + brief(errors));
  ok(`the real questionnaire (web/config): no errors (${brief(r.findings.filter((f) => f.level !== 'info'))}); longest route ${r.stats.longest_path} screens`);
}
{
  // both formats of today's questionnaire: same stats, same screens, same text keys
  const list = build({ base: 'list' }, 'list'), graph = build({ base: 'graph' }, 'graph');
  const a = C.check(list.survey, list.strings), b = C.check(graph.survey, graph.strings);
  assert.deepStrictEqual(a.stats, { answers: 2, ratings: 10, free_text: 8, longest_path: 19 });
  assert.deepStrictEqual(b.stats, a.stats);
  assert.deepStrictEqual(C.screens(graph.survey, graph.strings), C.screens(list.survey, list.strings));
  assert.deepStrictEqual(C.textKeys(graph.survey), C.textKeys(list.survey));
  ok('list and graph formats of today: same stats (2 answers, 10 ratings, 8 typed/voice, 19 screens), screens and texts');
}
{
  // every audit questionnaire (tests/flow/legacy/variants): the checker never crashes
  const dir = path.join(REPO, 'tests/flow/legacy/variants');
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf8'));
  let n = 0;
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => {
    const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const s = Object.assign(clone(BASE.survey), clone(base), clone(v));
    const r = C.check(s, BASE.strings, {});
    assert(Array.isArray(r.findings), f);
    C.toMarkdown(s, BASE.strings, {});
    n++;
  });
  ok(`the ${n} audit questionnaires in tests/flow/legacy/variants: checked and mapped without a crash`);
}
{
  // malformed input never throws (except an arrow loop, which the engine stops)
  [null, 5, {}, { flow: 7 }, { flow: [] }, { flow: { format: 'pp-flow/9' } }, { flow: [null, 3, { id: 'x' }] },
    { flow: { format: 'pp-flow/1', nodes: 'x' } }, { flow: { format: 'pp-flow/1', start: 'a', nodes: [{ id: 'a', type: 'group' }] } }
  ].forEach((s, i) => {
    const r = C.check(s, null, {});
    assert(r.findings.some((f) => f.level === 'error'), `bad input ${i} must give an error`);
  });
  ok('malformed questionnaires give errors, never a crash');
}

{
  // in the panel, an answer of something switched off (opts.hiddenCodes) is "hidden", not a typo (26 Oct 2026)
  const c = build(JSON.parse(fs.readFileSync(path.join(CASES, 'R1-hidden-answer.json'), 'utf8')), 'hidden');
  const f = C.check(c.survey, c.strings, c.opts).findings.find((x) => x.code === 'R1');
  assert(f && /tests "support_gate", but what answers it is hidden \(switched off\)/.test(f.message) && !/Use the code of an earlier answer/.test(f.message), f && f.message);
  const repo = C.check(c.survey, c.strings, {}).findings.find((x) => x.code === 'R1');
  assert(repo && /no screen stores that answer/.test(repo.message), 'outside the panel: the usual wording: ' + (repo && repo.message));
  // a hidden area or support question counts too (the code after the ":")
  const area = build({ base: 'graph', patch: [{ op: 'set', node: 'support', field: 'show_if', value: { answer: 'fn_rating:payments', at_most: 2 } }],
    survey: { functions: BASE.survey.functions.filter((x) => x.id !== 'payments') } }, 'hidden area');
  const fa = C.check(area.survey, area.strings, { surface: 'panel', hiddenCodes: ['payments'] }).findings.find((x) => x.code === 'R1');
  assert(fa && /is hidden \(switched off\)/.test(fa.message), fa && fa.message);
  // codes are looked up as the object's own keys: a code like "constructor" is never mistaken for a hidden one,
  // nor for one already used (until 26 Oct 2026 the id maps were plain { }, which gave a false L1 "used twice")
  const odd = build({ base: 'graph', patch: [{ op: 'set', node: 'one_fix', field: 'id', value: 'constructor' },
    { op: 'set', node: 'support', field: 'next', value: 'constructor' }] }, 'constructor');
  const fo = C.check(odd.survey, odd.strings, { surface: 'panel', everLiveCodes: ['constructor', 'nps'] }).findings;
  assert(!fo.some((x) => x.code === 'C2' || x.code === 'C1'), brief(fo));
  const quiet = (fs2) => fs2.filter((x) => x.level !== 'info');
  assert.deepStrictEqual(quiet(fo), [], 'panel: "constructor" gives no errors or warnings: ' + brief(fo));
  const repoOdd = C.check(odd.survey, odd.strings, {}).findings;
  assert(!repoOdd.some((x) => x.code === 'L1'), 'graph: no false L1 for "constructor": ' + brief(repoOdd));
  assert.deepStrictEqual(quiet(repoOdd), [], 'graph: no errors or warnings: ' + brief(repoOdd));
  const oddList = build({ base: 'list', patch: [{ op: 'set', node: 'one_fix', field: 'id', value: 'constructor' }] }, 'constructor list');
  const fl = C.check(oddList.survey, oddList.strings, {}).findings;
  assert(!fl.some((x) => x.code === 'L1' || /function Object/.test(x.message)), 'list: no false L1 for "constructor": ' + brief(fl));
  assert.deepStrictEqual(quiet(fl), [], 'list: no errors or warnings: ' + brief(fl));
  // the tools built on the checker treat it as ordinary too: its typed answer is sent once, routes are counted
  const simOdd = C.simulate(odd.survey, { nps: 3, constructor: 'text:hi' }, {}, {});
  assert.deepStrictEqual(simOdd.submission.free_text.map((x) => [x.item_id, x.text]), [['constructor', 'hi']]);
  assert(simOdd.steps.some((x) => x.screen === 'constructor') && !simOdd.skipped.some((x) => x.id === 'constructor'), 'shown, not skipped');
  assert.strictEqual(C.paths(odd.survey, {}).total, 16, 'the same 16 routes as today');
  ok('panel: an answer of something hidden is called hidden (a question, an area); "constructor" is an ordinary code (no C1, C2 or L1, list and graph)');
}
{
  // S1: survey.json's own settings against the graph (repo surface). The message names both values and says phones
  // follow the screen (or the flow); the control panel makes its screens from its settings, so it never reports S1.
  fs.readdirSync(CASES).filter((f) => /^S1-.*\.json$/.test(f)).forEach((file) => {
    const c = build(JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8')), file);
    const s1 = C.check(c.survey, c.strings, { surface: 'repo' }).findings.filter((x) => x.code === 'S1');
    assert.strictEqual(s1.length, 1, file + ': one S1: ' + brief(s1));
    assert(/^survey\.json's (deep_dive|rating|support) > \w+ is .+, but .+\. Phones follow the (screen|flow)/.test(s1[0].message) &&
      /changes nothing on phones\. Make the two the same/.test(s1[0].message), file + ': ' + s1[0].message);
    const panel = C.check(c.survey, c.strings, { surface: 'panel' }).findings;
    assert(!panel.some((x) => x.code === 'S1'), file + ': never in the panel: ' + brief(panel));
  });
  const t = build({ base: 'graph', survey: { deep_dive: Object.assign({}, BASE.survey.deep_dive, { threshold: 2 }) } }, 'threshold');
  const m1 = C.check(t.survey, t.strings, {}).findings.find((x) => x.code === 'S1').message;
  assert(m1.includes('deep_dive > threshold is 2') && m1.includes('defaults > threshold, is 3') && m1.includes('Phones follow the flow\'s value (3'), m1);
  const r = build({ base: 'graph', survey: { deep_dive: Object.assign({}, BASE.survey.deep_dive, { require_chip: false }) } }, 'chip');
  const m2 = C.check(r.survey, r.strings, {}).findings.find((x) => x.code === 'S1').message;
  assert(m2.includes('require_chip is false') && m2.includes('says "require_choice": true') && m2.includes('Phones follow the screen\'s own value (true'), m2);
  // another collection over the areas, which no area rating or problem screen repeats over, is not the problem screens' threshold
  const extra = build({ base: 'graph', patch: [{ op: 'set_flow', field: 'collections', value: Object.assign({}, BASE.flow_graph.collections,
    { few_areas: { list: 'functions', defaults: { threshold: 1 } } }) }] }, 'extra collection');
  assert(!C.check(extra.survey, extra.strings, {}).findings.some((x) => x.code === 'S1'), 'an unrelated collection is not compared');
  // a setting survey.json does not have is not compared
  const none = build({ base: 'graph' }, 'no settings');
  ['deep_dive', 'rating', 'support'].forEach((k) => { delete none.survey[k]; });
  assert(!C.check(none.survey, none.strings, {}).findings.some((x) => x.code === 'S1'), 'no settings: nothing to compare');
  ok('S1: survey.json\'s deep_dive, rating and support settings that disagree with the graph are errors naming both values (repo only, never in the panel)');
}
{
  // the control panel names screens its own way (opts.nameOf), e.g. 'question 6 "In the last 30 days..."'
  const c = build(JSON.parse(fs.readFileSync(path.join(CASES, 'R1-later-answer.json'), 'utf8')), 'nameOf');
  const r = C.check(c.survey, c.strings, { surface: 'panel', nameOf: (node) => (node && node.id === 'nps' ? 'question 3 "How likely..."' : null) });
  const f = r.findings.find((x) => x.code === 'R1');
  assert(f && f.message.startsWith('Question 3 "How likely..."'), f && f.message);
  ok('opts.nameOf: the panel\'s own names appear in the messages');
}

/* ---- 2b. where a finding is, and what a rule may test (for the control panel) ------------------
   Since 26 Oct 2026 the control panel never reads a message: each finding about a rule or an arrow says
   where it is (site: show_if, where, jump or next; for a jump its target and its place in "next"), and
   answersAt says which answers a rule at a node may test, exactly what the rule checks accept. */
const SITES = ['show_if', 'where', 'jump', 'next'];
const LABEL_OF = { show_if: /its rule \("show only if"\)/, where: /its "repeat for" filter \("where"\)/ };
{
  // on every case file: the fields are well formed and agree with the words of the message
  let sited = 0;
  const seenSites = new Set();
  files.forEach((file) => {
    const { survey, strings, opts } = build(JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8')), file);
    C.check(survey, strings, opts).findings.forEach((f) => {
      const tag = `${file}: ${f.level} ${f.code} "${f.message.slice(0, 90)}"`;
      if (f.site === undefined) {
        assert(f.target === undefined && f.index === undefined, tag + ': target or index without a site');
        // a message about a rule or a jump always comes with its site
        assert(!LABEL_OF.show_if.test(f.message) && !LABEL_OF.where.test(f.message) && !/its jump (to "|\d+ \(to ")/.test(f.message), tag + ': no site');
        return;
      }
      sited++;
      seenSites.add(f.site);
      assert(SITES.includes(f.site), tag + ': site ' + f.site);
      if (/^R[1-5]$/.test(f.code)) assert(['show_if', 'where', 'jump'].includes(f.site), tag + ': a rule check says show_if, where or jump');
      if (f.site === 'show_if' || f.site === 'where') {
        assert(f.target === undefined && f.index === undefined, tag + ': a rule has no target or index');
        assert(LABEL_OF[f.site].test(f.message), tag + ': the message names the same rule');
      }
      if (f.site === 'jump') {
        assert(Number.isInteger(f.index) && f.index >= 0, tag + ': a jump has its place in "next"');
        const next = (function find(list) {
          for (const n of list || []) {
            if (n && n.id === f.node) return n.next;
            const inner = n && n.body ? find(n.body.nodes) : undefined;
            if (inner !== undefined) return inner;
          }
          return undefined;
        }(survey.flow.nodes));
        assert(Array.isArray(next) && next[f.index] && typeof next[f.index] === 'object' && !('default' in next[f.index]), tag + ': index ' + f.index + ' is a jump of the node');
        if (typeof next[f.index].goto === 'string') assert.strictEqual(f.target, next[f.index].goto, tag + ': target = where that jump goes');
      }
      if (f.site === 'next' && f.target !== undefined) assert.strictEqual(typeof f.target, 'string', tag);
    });
  });
  ['show_if', 'where', 'jump', 'next'].forEach((s) => assert(seenSites.has(s), 'some case reports the site ' + s));
  ok(`findings say where they are: ${sited} findings over the case files with site (show_if, where, jump, next), target and index, agreeing with their words`);
}
{
  // one node, several jumps: each finding is about one of them (two jumps to the same screen are told apart)
  const g = build({ base: 'graph', patch: [{ op: 'set', node: 'nps', field: 'next', value: [
    { when: { answer: 'nps', equals: 11 }, goto: 'one_fix' },          // 0: R3 (0-10 can never be 11)
    { when: { answer: 'nps', at_least: 9 }, goto: 'one_fix' },          // 1: fine, same target as 0
    { when: { answer: 'one_fix', answered: true }, goto: 'support' },  // 2: R1 (one_fix comes later)
    { default: 'fn_ratings' }] }] }, 'jumps');
  const fs1 = C.check(g.survey, g.strings, {}).findings.filter((f) => f.node === 'nps' && /^R/.test(f.code));
  const at = (i) => fs1.filter((f) => f.site === 'jump' && f.index === i);
  assert.deepStrictEqual(at(0).map((f) => [f.code, f.target]), [['R3', 'one_fix']], brief(fs1));
  assert(/its jump 1 \(to "one_fix"\)/.test(at(0)[0].message), 'two jumps to one screen: the message says which: ' + at(0)[0].message);
  assert.deepStrictEqual(at(1), [], 'the second jump to the same screen is fine: nothing about it');
  assert.deepStrictEqual(at(2).map((f) => [f.code, f.target]), [['R1', 'support']], brief(fs1));
  assert(/its jump to "support"/.test(at(2)[0].message), at(2)[0].message);
  // a rule, a loop filter, R4, and the arrow checks
  const r = build({ base: 'graph', patch: [{ op: 'set', node: 'one_fix', field: 'show_if', value: { answer: 'one_fix', answered: true } },
    { op: 'set', node: 'support', field: 'next', value: [{ when: { answer: 'nps', at_least: 9 }, goto: 'thanks' }, { default: 'one_fix' }] }] }, 'sites');
  const fr = C.check(r.survey, r.strings, {}).findings;
  const r2 = fr.find((f) => f.code === 'R2' && f.node === 'one_fix');
  assert(r2 && r2.site === 'show_if' && r2.target === undefined && r2.index === undefined, 'a rule on its own answer: site show_if: ' + JSON.stringify(r2));
  const r4 = fr.find((f) => f.code === 'R4' && f.node === 'support');
  assert(r4 && r4.site === 'jump' && r4.target === 'thanks' && r4.index === 0, 'R4 names its jump: ' + JSON.stringify(r4));
  const w = build({ base: 'graph', patch: [{ op: 'set', node: 'fn_deep_dives', field: 'repeat_for', value: { each: 'area', in: 'areas', where: { answer: 'one_fix', answered: true } } }] }, 'where');
  const fw = C.check(w.survey, w.strings, {}).findings.find((f) => f.code === 'R1' && f.node === 'fn_deep_dives');
  assert(fw && fw.site === 'where' && fw.target === undefined, 'a loop filter: site where: ' + JSON.stringify(fw));
  const arrows = build({ base: 'graph', patch: [{ op: 'set', node: 'support_gate', field: 'next', value: [{ when: { answer: 'support_gate', equals: 'no' }, goto: 'nowhere' }, { default: 'gone' }] }] }, 'arrows');
  const fa = C.check(arrows.survey, arrows.strings, {}).findings.filter((f) => f.code === 'G2' && f.node === 'support_gate');
  assert(fa.some((f) => f.site === 'jump' && f.target === 'nowhere' && f.index === 0), 'an arrow of a jump to nowhere: ' + JSON.stringify(fa));
  assert(fa.some((f) => f.site === 'next' && f.target === 'gone' && f.index === 1), 'its default to nowhere: ' + JSON.stringify(fa));
  const plain = build({ base: 'graph', patch: [{ op: 'set', node: 'one_fix', field: 'next', value: 'gone' }] }, 'plain next');
  const fp = C.check(plain.survey, plain.strings, {}).findings.find((f) => f.code === 'G2' && f.node === 'one_fix');
  assert(fp && fp.site === 'next' && fp.target === 'gone' && fp.index === undefined, 'a plain "next" has no index: ' + JSON.stringify(fp));
  const hid = C.check(g.survey, g.strings, { surface: 'panel', hiddenCodes: ['support'] }).findings.find((f) => f.code === 'C2');
  assert(hid && hid.site === 'jump' && hid.target === 'support' && hid.index === 2, 'C2: the jump to a hidden question: ' + JSON.stringify(hid));
  ok('each finding is about one rule, loop filter, jump (its target and place in "next", even two jumps to one screen) or "next" arrow');
}

/* What the rule checks say about a test of "key" at a site of a node: true = accepted (no R1/R2 there). */
function acceptedAt(survey, strings, nodeId, siteName, key) {
  const s = clone(survey);
  const [list, i] = findNode(s.flow.nodes, nodeId);
  const n = list[i];
  const cond = { answer: key, answered: true };
  if (siteName === 'show_if') n.show_if = cond;
  else if (siteName === 'where') n.repeat_for = Object.assign({}, n.repeat_for, { where: cond });
  else {   // a jump to a screen that does not exist: its arrow is wrong (G2), its rule is still checked
    const old = Array.isArray(n.next) ? n.next.filter((x) => x && !('default' in x)) : [];
    const dflt = Array.isArray(n.next) ? (n.next.find((x) => x && 'default' in x) || {}).default : n.next;
    n.next = old.concat([{ when: cond, goto: '__probe' }, { default: dflt === undefined ? 'thanks' : dflt }]);
  }
  return !C.check(s, strings, {}).findings.some((f) => f.node === nodeId && (f.code === 'R1' || f.code === 'R2') && f.site === (siteName === 'jump' ? 'jump' : siteName) &&
    (siteName !== 'jump' || f.target === '__probe'));
}
{
  // answersAt on today's graph: what each kind of rule may test, described for the rule builder
  const g = build({ base: 'graph' }, 'graph');
  const keys = (r) => r.answers.map((a) => a.key + (a.own ? '*' : ''));
  const at = (id, o) => C.answersAt(g.survey, id, Object.assign({ strings: g.strings }, o));
  const nps = at('nps', {});
  assert(nps.ok && nps.site === 'show_if' && nps.node === 'nps', JSON.stringify(nps).slice(0, 200));
  assert.deepStrictEqual(keys(nps), [], 'nothing is answered before the 0-10 question');
  assert.deepStrictEqual(keys(at('nps', { forJump: true })), ['nps*'], 'its jump may test its own answer');
  const AREAS = BASE.survey.functions.map((f) => f.id);
  const before = ['nps'].concat(AREAS.map((a) => 'fn_rating:' + a), AREAS.map((a) => 'fn_deep_dive:' + a), ['support_gate']);
  assert.deepStrictEqual(keys(at('support', {})), before, 'the support screen\'s rule: the answers before it, not its own');
  const items = BASE.survey.support.items;
  assert.deepStrictEqual(keys(at('support', { forJump: true })), before.concat(items.map((x) => 'support:' + x + '*'), ['support_comment*']), 'its jumps: its own too');
  assert.deepStrictEqual(keys(at('fn_deep_dives', { site: 'where' })), ['nps'].concat(AREAS.map((a) => 'fn_rating:' + a), AREAS.slice(0, -1).map((a) => 'fn_deep_dive:' + a + '*')),
    'the problem screens\' loop filter: the ratings, and the problems of earlier areas');
  assert.deepStrictEqual(keys(at(null, {})), before.concat(items.map((x) => 'support:' + x), ['support_comment', 'one_fix']), 'no node: every answer');
  const all = at('thanks', {});
  const by = Object.fromEntries(all.answers.map((a) => [a.key, a]));
  assert.deepStrictEqual(by.nps, { key: 'nps', kind: 'number', label: g.strings['q.nps'].en, what: 'the 0-10 question "nps"', node: 'nps', item: null, own: false, optional: false, min: 0, max: 10, na: false });
  assert.deepStrictEqual([by['fn_rating:payments'].kind, by['fn_rating:payments'].min, by['fn_rating:payments'].max, by['fn_rating:payments'].na, by['fn_rating:payments'].item, by['fn_rating:payments'].node],
    ['number', 1, 5, true, 'payments', 'fn_ratings'], 'an area rating: 1-5 or "I don\'t handle this"');
  assert.strictEqual(by['fn_rating:payments'].label, g.strings['fn.payments.name'].en + ': ' + g.strings['q.fn_rating'].en);
  const chips = BASE.survey.functions.find((f) => f.id === 'payments').issues;
  assert.deepStrictEqual(by['fn_deep_dive:payments'].values, chips.concat(['other']), 'the problems of the area, and Other');
  assert.strictEqual(by['fn_deep_dive:payments'].value_texts.other, 'issue.other');
  assert.strictEqual(by['fn_deep_dive:payments'].value_texts[chips[0]], 'issue.payments.' + chips[0]);
  assert.deepStrictEqual([by.support_gate.kind, by.support_gate.values], ['choice', ['yes', 'no']]);
  assert.deepStrictEqual([by['support:kept_updated'].min, by['support:kept_updated'].max, by['support:kept_updated'].na, by['support:kept_updated'].item, by['support:kept_updated'].label],
    [1, 5, false, 'kept_updated', g.strings['support.kept_updated'].en], 'a support question: its own words and code');
  assert.deepStrictEqual([by.support_comment.kind, by.support_comment.optional, by.support_comment.label], ['text', true, g.strings['q.support_comment'].en]);
  assert.deepStrictEqual([by.one_fix.kind, by.one_fix.optional, 'values' in by.one_fix], ['text', true, false], 'typed or recorded text: only "answered"');
  assert.strictEqual(at('thanks', { strings: undefined }).answers.find((a) => a.key === 'nps').label, 'q.nps', 'without the texts: the text keys');
  assert.deepStrictEqual(all.facts, [
    { fact: 'lang', kind: 'choice', label: 'the language', values: BASE.survey.languages.map((l) => l.code) },
    { fact: 'lang_in_url', kind: 'choice', label: 'the language in the link', values: [true, false] },
    { fact: 'whats_changed_count', kind: 'number', label: 'the number of "what changed" items', min: 0 },
    { fact: 'round', kind: 'choice', label: 'the round', values: [] }]);
  assert.deepStrictEqual(at('nps', { rounds: ['2026-R1', '2026-R1', 'DEMO-R1'] }).facts[3].values, ['2026-R1', 'DEMO-R1']);
  // what it cannot answer: said plainly, never a crash
  const missing = at('nope', {});
  assert(!missing.ok && missing.answers.length === 0 && /No screen of this questionnaire has the code "nope"/.test(missing.message), JSON.stringify(missing));
  const noLoop = at('nps', { site: 'where' });
  assert(!noLoop.ok && /does not repeat/.test(noLoop.message), JSON.stringify(noLoop));
  [null, 5, {}, { flow: 7 }, { flow: { format: 'pp-flow/9' } }].forEach((s, i) => {
    const r = C.answersAt(s, 'nps', {});
    assert(r.ok === false && Array.isArray(r.answers) && r.facts.length === 4 && /no usable "flow"/.test(r.message), 'bad input ' + i + ': ' + JSON.stringify(r).slice(0, 160));
  });
  ok('answersAt: a rule ("show only if"), a jump (also its own answers), a loop filter, or anywhere; each answer described (kind, min/max/na, codes, English words) with the facts');
}
{
  // answersAt is exactly what the rule checks accept: for every node and every answer, a rule (and a jump, and a
  // loop filter) testing it is refused (R1/R2) if and only if answersAt leaves it out. Today's graph, "immediate"
  // mode as a group, a new loop and two endings.
  let tried = 0;
  ['valid-today-graph', 'valid-immediate-graph', 'valid-new-loop', 'valid-two-endings', 'valid-jump'].forEach((name) => {
    const c = build(JSON.parse(fs.readFileSync(path.join(CASES, name + '.json'), 'utf8')), name);
    const every = C.answersAt(c.survey, null, {}).answers.map((a) => a.key);
    const ids = [];
    (function walk(list) { (list || []).forEach((n) => { if (n && n.id) ids.push(n.id); if (n && n.body) walk(n.body.nodes); }); }(c.survey.flow.nodes));
    ids.forEach((id) => {
      const node = findNode(c.survey.flow.nodes, id);
      const kinds = [['jump', { forJump: true }]];
      if (name === 'valid-today-graph' || name === 'valid-immediate-graph') kinds.push(['show_if', {}]);
      if (node[0][node[1]].repeat_for && node[0][node[1]].type !== 'group') kinds.push(['where', { site: 'where' }]);
      kinds.forEach(([siteName, o]) => {
        const said = new Set(C.answersAt(c.survey, id, o).answers.map((a) => a.key));
        every.forEach((key) => {
          tried++;
          assert.strictEqual(acceptedAt(c.survey, c.strings, id, siteName, key), said.has(key),
            `${name}: ${siteName} on "${id}" testing "${key}": the checks ${said.has(key) ? 'refuse' : 'accept'} it, answersAt ${said.has(key) ? 'offers' : 'leaves it out'}`);
        });
      });
    });
  });
  ok(`answersAt agrees with the rule checks (R1, R2) on ${tried} rules, jumps and loop filters: what it offers is accepted, what it leaves out is refused`);
}

/* ---- 3. the other tools ---------------------------------------------------------------- */
/* A parser for the Mermaid this checker writes: every line must be one of the
   statement forms below, quotes balanced, every edge between defined ids,
   subgraph/end balanced, no reserved words as ids. (Checked with the real
   Mermaid 10 and 11 in a browser on 23 Oct; this keeps it that way.) */
function parseMermaid(text) {
  const lines = text.split('\n');
  assert.strictEqual(lines[0], 'flowchart TD', 'first line');
  const ID = '[A-Za-z][A-Za-z0-9_]*';
  const Q = '"[^"]*"';
  const shapes = [`\\[${Q}\\]`, `\\(\\[${Q}\\]\\)`, `\\{${Q}\\}`, `\\(\\(${Q}\\)\\)`, `\\[\\[${Q}\\]\\]`, `\\{\\{${Q}\\}\\}`];
  const nodeRe = new RegExp(`^(${ID})(?:${shapes.join('|')})$`);
  const edgeRe = new RegExp(`^(${ID}) (-->|-\\.->)(?:\\|(?:${Q}|[A-Za-z][A-Za-z ]*)\\|)? (${ID})$`);
  const subRe = new RegExp(`^subgraph (${ID}) \\[${Q}\\]$`);
  const defined = new Set(), used = [];
  let depth = 0;
  lines.slice(1).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) return;
    let m;
    if ((m = nodeRe.exec(line))) defined.add(m[1]);
    else if ((m = edgeRe.exec(line))) used.push(m[1], m[3]);
    else if ((m = subRe.exec(line))) { defined.add(m[1]); depth++; }
    else if (line === 'end') { depth--; assert(depth >= 0, 'end without subgraph'); }
    else assert.fail(`Mermaid line ${i + 2} is not a known statement: ${line}`);
    (line.match(/"[^"]*"/g) || []).forEach((label) => {   // inside labels: only <b>, <br/>, <small>; the rest escaped
      assert(!/[<>]/.test(label.replace(/<\/?(b|small)>|<br\/>/g, '')), `a raw < or > in a label: ${label}`);
    });
  });
  assert.strictEqual(depth, 0, 'subgraph/end balanced');
  used.forEach((id) => assert(defined.has(id), `edge to an undefined id ${id}`));
  defined.forEach((id) => assert(!['end', 'graph', 'subgraph', 'style', 'class', 'click', 'flowchart'].includes(id.toLowerCase()), `reserved id ${id}`));
  return { nodes: defined.size, edges: used.length / 2 };
}
{
  const list = build({ base: 'list' }, 'list');
  const s = parseMermaid(C.toMermaid(list.survey, list.strings));
  assert(s.nodes >= 12 && s.edges >= 15, JSON.stringify(s));
  ['valid-immediate-graph', 'valid-two-endings', 'valid-new-loop', 'G2-missing-target', 'G3-cycle', 'L2-leaves-backwards'].forEach((name) => {
    const c = build(JSON.parse(fs.readFileSync(path.join(CASES, name + '.json'), 'utf8')), name);
    parseMermaid(C.toMermaid(c.survey, c.strings));
  });
  const tricky = build({ base: 'graph', patch: [{ op: 'set', node: 'one_fix', field: 'show_if', value: { answer: 'nps', in: ['"a"', '<b>', '{x}', 'a|b', '`c`', '#1;'] } }] }, 'tricky');
  const text = C.toMermaid(tricky.survey, tricky.strings);
  parseMermaid(text);
  assert(text.includes('#quot;a#quot;') && text.includes('#lt;b#gt;') && text.includes('#123;x#125;'), 'quotes, < > and { } are escaped');
  ok('toMermaid: valid flowchart syntax for today, a group, two endings, a loop, broken arrows and odd characters');
}
{
  const list = build({ base: 'list' }, 'list');
  const md = C.toMarkdown(list.survey, list.strings, { source: 'web/config/survey.json' });
  assert(md.startsWith('<!-- GENERATED by'), 'header');
  assert.strictEqual(md, C.toMarkdown(list.survey, list.strings, { source: 'web/config/survey.json' }), 'the same every time');
  ['## 1. Before the questionnaire', '## 2. The questionnaire', '## 3. Every screen', '## 4. Example routes'].forEach((h) => assert(md.includes(h), h));
  assert.strictEqual((md.match(/```mermaid/g) || []).length, 2, 'two diagrams');
  md.split('```mermaid\n').slice(1).forEach((block) => parseMermaid(block.split('\n```')[0]));
  assert(/\| `support` \| Support ratings \|/.test(md), 'the table has every node');
  assert(!/\/Users\/|\/private\/|\/home\//.test(md), 'no personal paths');
  const examples = md.split('## 4. Example routes')[1];
  assert((examples.match(/^\*\*\d\. /gm) || []).length === 3, 'three example routes');
  ok('toMarkdown: the four sections, two valid diagrams, the node table, three example routes, the same every time');
}
{
  const g = build({ base: 'graph' }, 'graph');
  const sim = C.simulate(g.survey, { nps: 4, 'fn_rating:payments': 2, support_gate: 'no', 'fn_deep_dive:payments': ['other', 'text:late again'] },
    { lang: 'hi', lang_in_url: true, whats_changed_count: 0 }, { strings: g.strings, explain: true });
  const ids = sim.steps.map((s) => s.screen);
  const engine = flow.path(flow.load(g.survey), g.survey, { facts: { lang: 'hi', lang_in_url: true, whats_changed_count: 0 } },
    { answers: { nps: 4, 'fn_rating:payments': 2, support_gate: 'no', 'fn_deep_dive:payments': 'other' }, texts: { 'fn_deep_dive:payments': 'late again' }, audio: {}, lang_chosen: true });
  assert.deepStrictEqual(ids, engine.map((s) => s.id), 'simulate shows exactly the engine\'s route');
  assert.deepStrictEqual(ids.slice(0, 2), ['nps', 'fn_rating:losses']);
  assert(ids.includes('fn_deep_dive:payments') && !ids.includes('support'));
  assert.deepStrictEqual(sim.blocked, ['fn_rating:losses', 'fn_rating:linehaul', 'fn_rating:consumables', 'fn_rating:orders', 'fn_rating:app']);
  const skip = Object.fromEntries(sim.skipped.map((s) => [s.id, s.reason]));
  assert(/only if support_gate == yes.*"no"/.test(skip.support), skip.support);
  assert(/link has no \?lang=/.test(skip.language), skip.language);
  assert(/fn_rating:losses is not answered/.test(skip['fn_deep_dive:losses']), skip['fn_deep_dive:losses']);
  assert.strictEqual(sim.submission.schema_version, 1);
  assert.deepStrictEqual(sim.submission.answers, { nps: 4, support_gate: 'no' });
  assert.deepStrictEqual(sim.submission.free_text.map((f) => [f.item_id, f.issue_code, f.text]), [['fn_deep_dive:payments', 'other', 'late again']]);
  assert(sim.steps.find((s) => s.screen === 'fn_deep_dive:payments').why.some((w) => /payments/.test(w)), 'explain says why it is shown');
  ok('simulate: the engine\'s own route, why others are skipped, where Next is blocked, and the message (schema_version 1)');
}
{
  const g = build({ base: 'graph' }, 'graph');
  const p = C.paths(g.survey, {});
  assert.strictEqual(p.total, 16, '16 routes: language shown or not x what changed x problem screens x support');
  assert(p.exhaustive && p.sets === 512, JSON.stringify({ sets: p.sets }));
  assert.strictEqual(p.routes.reduce((n, r) => n + r.count, 0), p.sets, 'counts add up');
  p.routes.forEach((r) => {
    const steps = flow.path(flow.load(g.survey), g.survey, { facts: r.example.facts }, { answers: r.example.answers, texts: {}, audio: {} });
    assert.deepStrictEqual(steps.map((s) => s.id), r.screens, 'each example gives its route');
  });
  assert.strictEqual(C.paths(g.survey, { limit: 3 }).routes.length, 3);
  assert(C.paths(g.survey, { screens: true }).total > 16, 'screen by screen there are more routes');
  ok('paths: 16 routes for today, each example reproduces its route, counts add up, --limit and screen-level work');
}
{
  const list = build({ base: 'list' }, 'list'), graph = build({ base: 'graph' }, 'graph');
  const same = C.compare(list.survey, graph.survey, { samples: 150 });
  assert(same.same && same.count === 0 && same.sets > 500, JSON.stringify(same).slice(0, 300));
  const changed = clone(graph.survey);
  changed.flow.nodes.find((n) => n.id === 'support').show_if = { answer: 'support_gate', equals: 'no' };
  const diff = C.compare(graph.survey, changed, { samples: 50 });
  assert(!diff.same && diff.count > 0 && diff.differences[0].what === 'screens', JSON.stringify(diff).slice(0, 300));
  const relabel = clone(graph.survey);
  relabel.functions[0].threshold = 2;
  const d2 = C.compare(graph.survey, relabel, { samples: 50 });
  assert(!d2.same, 'a different threshold changes routes or data');
  ok('compare: the list and the graph of today are the same; a changed rule or threshold is found');
}
{
  const list = build({ base: 'list' }, 'list');
  const s = C.screens(list.survey, list.strings);
  assert.strictEqual(s.length, 19);
  s.forEach((x) => assert.deepStrictEqual(Object.keys(x), ['screen', 'node', 'type', 'item', 'label_en', 'end']));
  assert.deepStrictEqual(s.slice(0, 4).map((x) => x.screen), ['language', 'whats_changed', 'nps', 'fn_rating:losses']);
  assert.deepStrictEqual(s[3], { screen: 'fn_rating:losses', node: 'fn_ratings', type: 'function_rating', item: 'losses', label_en: '[test] fn.losses.name: [test] q.fn_rating', end: false });
  assert(s[18].end && s[18].screen === 'thanks');
  const imm = build(JSON.parse(fs.readFileSync(path.join(CASES, 'valid-immediate-list.json'), 'utf8')), 'imm');
  assert.deepStrictEqual(C.screens(imm.survey, imm.strings).slice(3, 7).map((x) => x.screen),
    ['fn_rating:losses', 'fn_deep_dive:losses', 'fn_rating:payments', 'fn_deep_dive:payments'], 'immediate mode: rating, problem, rating, ...');
  ok('screens: 19 screens for today in display order, with node, item, English label and endings');
}

/* ---- 4. the file itself ------------------------------------------------------------------- */
{
  const src = fs.readFileSync(path.join(REPO, 'web/js/flow-check.js'), 'utf8');
  let acorn = null;
  try { acorn = require(path.join(REPO, 'tests/node_modules/acorn')); } catch (e) { /* run "cd tests && npm install" */ }
  if (acorn) acorn.parse(src, { ecmaVersion: 5 });   // throws on let, const, arrows, template strings, ?. or ??
  else console.log('NOTE acorn is not installed (cd tests && npm install), so the ES5 check of flow-check.js was skipped');
  const html = fs.readFileSync(path.join(REPO, 'web/index.html'), 'utf8');
  assert(!/flow-check\.js/.test(html), 'web/index.html must not load flow-check.js');
  ok('flow-check.js: ES5 (' + (acorn ? 'parsed by acorn' : 'acorn not installed: text check only') + '), and phones never load it');
}

// Pick several (multi_choice, 28 Oct 2026): rules may test it with =, !=, in and answered (its codes),
// never with <= or >=, and a code it does not have is an error; answersAt describes it as "choices";
// the simulator takes a list as the codes ticked; paths cover each code ticked and all of them.
{
  const s = clone(live);
  const nodes = s.flow.nodes;
  const at = nodes.findIndex((n) => n.id === 'nps');
  const after = nodes[at].next;
  nodes[at].next = 'areas';
  nodes.splice(at + 1, 0,
    { id: 'areas', type: 'multi_choice', text: 'q.areas', options: ['load', 'payments', 'app'], next: 'load_low' },
    { id: 'load_low', type: 'single_choice', text: 'q.load_low', options: ['late', 'other'], next: after,
      show_if: { all: [{ answer: 'nps', at_most: 8 }, { answer: 'areas', equals: 'load' }] } });
  const strings = clone(liveStrings);
  ['q.areas', 'choice.areas.load', 'choice.areas.payments', 'choice.areas.app', 'q.load_low', 'choice.load_low.late', 'choice.load_low.other']
    .forEach((k) => { strings[k] = { en: k, hi: '[TRANSLATE] ' + k, ta: '[TRANSLATE] ' + k, te: '[TRANSLATE] ' + k, kn: '[TRANSLATE] ' + k, ml: '[TRANSLATE] ' + k }; });
  const errors = (sv) => C.check(sv, strings).findings.filter((f) => f.level === 'error');
  assert.deepStrictEqual(errors(s).map((f) => f.code + ' ' + f.message), [], 'a pick-several rule with "=": no error');
  const withRule = (rule) => { const t = clone(s); t.flow.nodes.find((n) => n.id === 'load_low').show_if = rule; return t; };
  const num = errors(withRule({ answer: 'areas', at_most: 2 }));
  assert.ok(num.some((f) => f.code === 'R3' && /never a number/.test(f.message)), 'a number test on a list: R3 ' + JSON.stringify(num));
  const bad = errors(withRule({ answer: 'areas', equals: 'trucks' }));
  assert.ok(bad.some((f) => f.code === 'R3' && /can only be/.test(f.message) && /"trucks"/.test(f.message)), 'an unknown code: R3 ' + JSON.stringify(bad));
  assert.deepStrictEqual(errors(withRule({ answer: 'areas', 'in': ['app', 'payments'] })), [], '"in": fine');
  assert.deepStrictEqual(errors(withRule({ answer: 'areas', not_equals: 'app' })), [], '"!=": fine');
  assert.deepStrictEqual(errors(withRule({ answer: 'areas', answered: true })), [], '"answered": fine');
  // what the panel reads about it
  const av = C.answersAt(s, 'load_low', {});
  const a = av.answers.find((x) => x.key === 'areas');
  assert.strictEqual(a.kind, 'choices', 'answersAt: "choices"');
  assert.deepStrictEqual(a.values, ['load', 'payments', 'app']);
  // the simulator: a list is the codes ticked (each ticked area gets its follow-up)
  const walk = (answers) => C.simulate(s, answers, { lang: 'en' }).steps.map((x) => x.screen);
  assert.ok(walk({ nps: 4, areas: ['payments', 'load'] }).indexOf('load_low') !== -1);
  assert.strictEqual(walk({ nps: 4, areas: ['payments'] }).indexOf('load_low'), -1);
  const sub = C.simulate(s, { nps: 4, areas: ['load', 'app'], load_low: 'late' }, { lang: 'en' }).submission;
  assert.deepStrictEqual(sub.answers.areas, ['load', 'app'], 'sent as the list ticked');
  // paths: the route with load ticked and the one without both exist
  const routes = C.paths(s).routes.map((r) => r.nodes.join(' '));
  assert.ok(routes.some((r) => / areas load_low /.test(' ' + r + ' ')) && routes.some((r) => / areas (?!load_low)/.test(' ' + r + ' ')), routes.join(' | '));
  ok('pick several: rules with =, !=, in and answered; <= and >= refused (R3); unknown codes refused; simulated as the list ticked');
}

// Pick several in words (30 Oct 2026): a rule on a pick-several answer is written the way the engine tests it
// ("areas includes load", not "areas == load") by the map, docs/flow.md, simulate's skipped reasons and --explain;
// a pick-one rule in the same questionnaire keeps "==". sentence(cond) without the questionnaire is unchanged.
{
  const s = {
    survey_id: 'fake', config_version: 'fake-1', default_language: 'en', languages: [{ code: 'en' }],
    functions: [{ id: 'load', issues: [] }, { id: 'app', issues: [] }],
    flow: { format: 'pp-flow/1', start: 'nps', collections: { areas: { list: 'functions' } }, nodes: [
      { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'areas' },
      { id: 'areas', type: 'multi_choice', text: 'q.areas', options: ['load', 'payments', 'app'], required: false,   // so "no tick" can happen
        next: [{ when: { answer: 'areas', equals: 'app' }, goto: 'app_note' }, { default: 'load_low' }] },
      { id: 'load_low', type: 'single_choice', text: 'q.load_low', options: ['late', 'other'],
        show_if: { all: [{ answer: 'nps', at_most: 8 }, { answer: 'areas', equals: 'load' }] },
        next: [{ when: { answer: 'load_low', equals: 'late' }, goto: 'late_note' }, { default: 'app_note' }] },
      { id: 'late_note', type: 'free_text', text: 'q.late_note', next: 'app_note' },
      { id: 'app_note', type: 'free_text', text: 'q.app_note', next: 'none_note',
        show_if: { any: [{ answer: 'areas', in: ['app', 'payments'] }, { answer: 'areas', not_equals: 'load' }] } },
      { id: 'none_note', type: 'info_card', text: 'q.none_note', show_if: { answer: 'areas', answered: false }, next: 'reasons' },
      { id: 'reasons', type: 'multi_choice', text: 'q.reasons', store_as: 'reasons:{area}', options: ['slow', 'rude'],
        repeat_for: { each: 'area', in: 'areas' }, next: 'why' },
      { id: 'why', type: 'free_text', text: 'q.why', store_as: 'why:{area}', next: 'support_gate',
        repeat_for: { each: 'area', in: 'areas', where: { answer: 'reasons:{area}', equals: 'slow' } } },
      { id: 'support_gate', type: 'yes_no', text: 'q.support_gate', next: 'thanks' },
      { id: 'thanks', type: 'thank_you' }] }
  };
  const nodeOf = (id) => s.flow.nodes.find((n) => n.id === id);
  assert.deepStrictEqual(C.check(s, null).findings.filter((f) => f.level !== 'info').map((f) => f.code + ' ' + f.message), [], 'the small questionnaire is valid');
  // the map: the diamonds, the jump labels and the loop title
  const mm = C.toMermaid(s, null);
  parseMermaid(mm);
  ['only if nps #lt;= 8 AND areas includes load', '"if areas includes app"', 'only if areas includes one of [app, payments] OR areas does not include load',
    'only if areas has no tick', 'where reasons:#123;area#125; includes slow', '"if load_low == late"'].forEach((t) => assert(mm.includes(t), 'the map says ' + t + ':\n' + mm));
  assert(!/areas (==|!=|in|exists|not exists) |== load|area#125; ==/.test(mm), 'never "==", "!=", "in" or "exists" for the pick-several answers:\n' + mm);
  // docs/flow.md's table of screens
  const md = C.toMarkdown(s, null, { source: 'fake' });
  ['| only if nps &lt;= 8 AND areas includes load |', 'if areas includes app → app_note', 'if load_low == late → late_note',
    'for each area (2) where reasons:{area} includes slow'].forEach((t) => assert(md.includes(t), 'docs/flow.md says ' + t));
  assert(!/areas ==|reasons:\{area\} ==/.test(md), 'docs/flow.md: no "==" for the pick-several answers');
  // simulate: why a screen is skipped, and --explain (explain: true): why it is shown
  const sim1 = C.simulate(s, { nps: 5, areas: ['load', 'app'] }, { lang: 'en' }, { explain: true });
  const skip1 = Object.fromEntries(sim1.skipped.map((x) => [x.id, x.reason]));
  assert.strictEqual(skip1.load_low, 'not on this route: after "areas" it went to "app_note" (jump: areas includes app)');
  assert.strictEqual(skip1.none_note, 'only if areas has no tick: not true here (areas is ["load","app"])');
  assert.deepStrictEqual(sim1.steps.find((x) => x.screen === 'app_note').why, [
    'only if areas includes one of [app, payments] OR areas does not include load: true (areas is ["load","app"])',
    'reached by the jump from "areas": areas includes app']);
  const sim0 = C.simulate(s, { nps: 5 }, { lang: 'en' }, { explain: true });
  assert.deepStrictEqual(sim0.steps.find((x) => x.screen === 'none_note').why, ['only if areas has no tick: true (areas is not answered on this route)']);
  const sim2 = C.simulate(s, { nps: 5, areas: ['payments'] }, { lang: 'en' }, { explain: true });
  assert.strictEqual(sim2.skipped.find((x) => x.id === 'load_low').reason,
    'only if nps <= 8 AND areas includes load: not true here (nps is 5, areas is ["payments"])');
  const sim3 = C.simulate(s, { nps: 5, areas: ['load'], load_low: 'late', 'reasons:load': ['slow'] }, { lang: 'en' }, { explain: true });
  const why3 = Object.fromEntries(sim3.steps.map((x) => [x.screen, x.why]));
  assert.deepStrictEqual(why3.load_low, ['only if nps <= 8 AND areas includes load: true (nps is 5, areas is ["load"])']);
  assert.deepStrictEqual(why3.late_note, ['reached by the jump from "load_low": load_low == late'], 'a pick-one answer keeps "=="');
  assert.deepStrictEqual(why3['why:load'], ['for each area where reasons:{area} includes slow: true for "load" (reasons:load is ["slow"])']);
  assert.strictEqual(sim3.skipped.find((x) => x.id === 'why:app').reason,
    'only for each area where reasons:{area} includes slow: not true for "app" (reasons:app is not answered on this route)');
  // the API: sentence(cond) as before; sentence(cond, survey) and sentenceFor(survey) know the kinds
  const rule = nodeOf('load_low').show_if;
  assert.strictEqual(C.sentence(rule), 'nps <= 8 AND areas == load', 'without the questionnaire: exactly as before');
  assert.deepStrictEqual([rule].map(C.sentence), ['nps <= 8 AND areas == load'], 'used with map(): the index is not a questionnaire');
  assert.strictEqual(C.sentence(rule, s), 'nps <= 8 AND areas includes load');
  const say = C.sentenceFor(s);
  assert.strictEqual(say(rule), 'nps <= 8 AND areas includes load');
  assert.strictEqual(say({ not: { answer: 'areas', answered: true } }), 'NOT (areas has at least one tick)');
  assert.strictEqual(say({ answer: 'areas', in: ['load', { var: 'area' }] }), 'areas includes one of [load, area]');
  assert.strictEqual(say({ answer: 'areas', at_least: 1 }), 'areas >= 1', 'a number test (refused by R3) keeps its symbol');
  assert.strictEqual(say({ answer: 'reasons:{area}', not_equals: 'rude' }), 'reasons:{area} does not include rude', 'a template: through the keys it becomes');
  assert.strictEqual(say({ answer: 'reasons:load', equals: 'rude' }), 'reasons:load includes rude');
  ['nps', 'load_low', 'support_gate', 'why:load', 'nope'].forEach((key) => {
    assert.strictEqual(say({ answer: key, equals: 'x' }), key + ' == x', key + ': not a pick-several answer');
    assert.strictEqual(say({ answer: key, answered: true }), key + ' exists');
  });
  assert.strictEqual(say({ fact: 'lang', in: ['hi', 'ta'] }), 'language in [hi, ta]', 'a fact: unchanged');
  assert.strictEqual(say({ fact: 'lang_in_url', equals: false }), 'the link has no ?lang=');
  [null, 5, {}, { flow: 7 }, { flow: { format: 'pp-flow/9' } }].forEach((bad, i) => {
    assert.strictEqual(C.sentence(rule, bad), 'nps <= 8 AND areas == load', 'a questionnaire that cannot be read (' + i + '): the plain words');
    assert.strictEqual(C.sentenceFor(bad)(rule), 'nps <= 8 AND areas == load');
  });
  // a group whose way out jumps on a pick-several answer, and an AND inside an OR (the review of 30 Oct: these two
  // places of the map were not tested)
  const g2 = {
    survey_id: 'fake2', config_version: 'fake-2', default_language: 'en', languages: [{ code: 'en' }],
    functions: [{ id: 'load', issues: [] }, { id: 'app', issues: [] }],
    flow: { format: 'pp-flow/1', start: 'nps', collections: { areas: { list: 'functions' } }, nodes: [
      { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'areas' },
      { id: 'areas', type: 'multi_choice', text: 'q.areas', options: ['load', 'app'], required: true, next: 'per_area' },
      { id: 'per_area', type: 'group', repeat_for: { each: 'area', in: 'areas' },
        next: [{ when: { answer: 'areas', equals: 'app' }, goto: 'app_note' }, { default: 'mixed_note' }],
        body: { start: 'reasons', nodes: [
          { id: 'reasons', type: 'multi_choice', text: 'q.reasons', store_as: 'reasons:{area}', options: ['slow', 'rude'], next: '@next_item' }] } },
      { id: 'app_note', type: 'free_text', text: 'q.app_note', next: 'mixed_note' },
      { id: 'mixed_note', type: 'free_text', text: 'q.mixed_note', next: 'thanks',
        show_if: { any: [{ answer: 'areas', equals: 'app' }, { all: [{ answer: 'nps', at_most: 6 }, { answer: 'areas', not_equals: 'load' }] }] } },
      { id: 'thanks', type: 'thank_you' }] }
  };
  assert.deepStrictEqual(C.check(g2, null).findings.filter((f) => f.level === 'error').map((f) => f.code + ' ' + f.message), [], 'the second questionnaire is valid');
  const mm2 = C.toMermaid(g2, null);
  parseMermaid(mm2);
  assert(mm2.includes('|"if areas includes app"|'), 'the jump out of a group says "includes":\n' + mm2);
  assert(mm2.includes('nps #lt;= 6 AND areas does not include load'), 'an AND inside an OR says "does not include":\n' + mm2);
  assert(!/areas (==|!=) /.test(mm2), 'never "==" or "!=" for the pick-several answer:\n' + mm2);
  const nested = C.sentenceFor(g2)(g2.flow.nodes.find((n) => n.id === 'mixed_note').show_if);
  assert(/areas includes app/.test(nested) && /nps <= 6 AND areas does not include load/.test(nested) && !/==|!=/.test(nested), nested);
  // a template whose pattern also fits an unrelated answer (the review of 30 Oct 2026): "{area}_why" is the pick-several
  // screen asked for each area, and "other_why" (it fits "{area}_why" too) a pick-one question. The screen that stores
  // exactly "{area}_why" decides: "includes". Until then "other_why" made it "==".
  const g3 = {
    survey_id: 'fake3', config_version: 'fake-3', default_language: 'en', languages: [{ code: 'en' }],
    functions: [{ id: 'load', issues: [] }, { id: 'app', issues: [] }],
    flow: { format: 'pp-flow/1', start: 'nps', collections: { areas: { list: 'functions' } }, nodes: [
      { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'other_why' },
      { id: 'other_why', type: 'single_choice', text: 'q.other_why', options: ['price', 'speed'], next: 'why' },
      { id: 'why', type: 'multi_choice', text: 'q.why', store_as: '{area}_why', options: ['slow', 'rude'],
        repeat_for: { each: 'area', in: 'areas' }, next: 'more' },
      { id: 'more', type: 'free_text', text: 'q.more', store_as: 'more:{area}', next: 'thanks', show_if: { answer: 'other_why', equals: 'speed' },
        repeat_for: { each: 'area', in: 'areas', where: { answer: '{area}_why', equals: 'slow' } } },
      { id: 'thanks', type: 'thank_you' }] }
  };
  assert.deepStrictEqual(C.check(g3, null).findings.filter((f) => f.level === 'error').map((f) => f.code + ' ' + f.message), [], 'the third questionnaire is valid');
  const say3 = C.sentenceFor(g3);
  assert.strictEqual(say3({ answer: '{area}_why', equals: 'slow' }), '{area}_why includes slow', 'the screen that stores "{area}_why" decides, not "other_why"');
  assert.strictEqual(say3({ answer: '{area}_why', answered: false }), '{area}_why has no tick');
  assert.strictEqual(say3({ answer: 'load_why', not_equals: 'rude' }), 'load_why does not include rude', 'a key the template becomes');
  assert.strictEqual(say3({ answer: 'other_why', equals: 'speed' }), 'other_why == speed', 'the pick-one answer keeps "=="');
  assert.strictEqual(C.sentence({ answer: '{area}_why', in: ['slow', 'rude'] }, g3), '{area}_why includes one of [slow, rude]');
  const mm3 = C.toMermaid(g3, null);
  parseMermaid(mm3);
  assert(mm3.includes('where #123;area#125;_why includes slow') && mm3.includes('only if other_why == speed') && !/_why ==/.test(mm3.replace('other_why ==', '')),
    'the map: "includes" for the template, "==" for the pick-one answer:\n' + mm3);
  // the same answer named with another item name ("{fn}_why", "{area.id}_why"): the engine fills it with the loop's
  // item just the same, so it is still the pick-several screen's answer (second review of 30 Oct 2026)
  assert.strictEqual(say3({ answer: '{fn}_why', equals: 'slow' }), '{fn}_why includes slow', 'another item name, same shape');
  assert.strictEqual(say3({ answer: '{area.id}_why', equals: 'slow' }), '{area.id}_why includes slow', 'an item field, same shape');
  assert.strictEqual(say3({ answer: '{fn}_note', equals: 'slow' }), '{fn}_note == slow', 'another shape: not a pick-several answer');
  // the real questionnaire has no pick-several question: its map is word for word the same with or without the kinds
  const plain = C.toMermaid(live, liveStrings).split('\n').filter((l) => /_if\{|-->\|"if /.test(l));
  assert(plain.length && plain.every((l) => !/includes|tick/.test(l)), plain.join('\n'));
  ok('pick several in words: the map, docs/flow.md, skipped reasons and --explain say "includes", "does not include", "includes one of", "has no tick"; pick one keeps "=="; sentence(cond) unchanged, sentence(cond, survey) and sentenceFor(survey) for the panel');
}

console.log(passed, 'tests passed');

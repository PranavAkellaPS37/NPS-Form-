/* =============================================================================
   tests/flow/flow_test.js: checks the form's question-flow rules.

   WHAT IT CHECKS
     web/js/flow.js decides which screen comes next (the language picker, the
     "What changed" card, one rating screen per area, a problem screen for
     each low rating, the support questions, show_if rules, and since
     23 Oct 2026 the graph format "pp-flow/1": jumps, loops, groups, several
     endings, rules on the language or round).
     Cases 1-8 build the screen list for 8 situations from today's
     questionnaire in the LIST format and check the order is exactly right;
     they are unchanged since 21 Oct. Since 26 Oct (stage 4)
     web/config/survey.json holds the GRAPH, so these cases use survey.json
     with its flow replaced by the last list (frozen in
     tests/flow/legacy/variants/base.json), and case 24 checks that the
     repo's graph shows the same screens and sends the same data.
     Cases 9 onwards use small fake questionnaires written in the graph
     format, inside this file: a jump with a default, a loop over areas rated
     low (each area's own threshold, "na" never low), "problem screen straight
     after each low rating" as a group, two endings, facts of the link, rules
     that only see the partner's current path (after going Back), "not",
     loop values inside rules, the safety-net thank-you, broken graphs that
     must not crash, both ways of calling buildSteps, the format checks, and
     the text keys each kind of screen gets (step.keys).
     The side-by-side comparison with the old engine is legacy_diff.js.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/flow_test.js
     You should see one line starting with PASS per case, then
     "N tests passed" (the old cases also print "7 tests passed" half-way).
     Any mistake stops it with an error that names what was expected.

   WHAT IT READS / WRITES
     Reads web/js/flow.js, web/config/survey.json,
     tests/flow/legacy/variants/base.json and graph-default.json. Writes
     nothing.
   ============================================================================= */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/flow/)
const flow = require(path.join(REPO, 'web/js/flow.js'));
// Today's questionnaire as a LIST: survey.json (a graph since stage 4) with the last list as its flow.
const repoSurvey = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const baseList = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy', 'variants', 'base.json'), 'utf8'));
const config = Object.assign(JSON.parse(JSON.stringify(repoSurvey)), { flow: baseList.flow });
const ids = (steps) => steps.map((s) => s.id);
let n = 0; const ok = (name) => { n++; console.log('PASS', name); };

// 1. defaults
let steps = flow.buildSteps(config, { answers: {}, langInUrl: false, hasWhatsChanged: true });
assert.deepStrictEqual(ids(steps), ['language','whats_changed','nps','fn_rating:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_rating:app','support_gate','one_fix','thanks']);
ok('default path');

// 2. lang in url + no what-changed
steps = flow.buildSteps(config, { answers: {}, langInUrl: true, hasWhatsChanged: false });
assert.strictEqual(ids(steps)[0], 'nps'); ok('skip_if language + empty what-changed');

// 3. low ratings -> deep dives after all ratings
const answers = { 'fn_rating:losses': 2, 'fn_rating:payments': 3, 'fn_rating:linehaul': 4, 'fn_rating:consumables': 'na', 'fn_rating:orders': 1, 'fn_rating:app': 5, support_gate: 'yes' };
steps = flow.buildSteps(config, { answers, langInUrl: true, hasWhatsChanged: false });
assert.deepStrictEqual(ids(steps), ['nps','fn_rating:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_rating:app','fn_deep_dive:losses','fn_deep_dive:payments','fn_deep_dive:orders','support_gate','support','one_fix','thanks']);
ok('deep dives after all ratings + support block on yes');

// 4. immediate mode + per-area threshold
const cfg2 = JSON.parse(JSON.stringify(config));
cfg2.deep_dive.when = 'immediate';
cfg2.functions[1].threshold = 2; // payments: 3 is no longer low
steps = flow.buildSteps(cfg2, { answers, langInUrl: true, hasWhatsChanged: false });
assert.deepStrictEqual(ids(steps).slice(0, 9), ['nps','fn_rating:losses','fn_deep_dive:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_deep_dive:orders','fn_rating:app']);
ok('immediate mode + per-area threshold override');

// 5. conditions
const A = { nps: 6, support_gate: 'yes', 'fn_rating:payments': 2 };
assert(flow.evalCondition({ answer: 'nps', at_most: 6 }, A));
assert(!flow.evalCondition({ answer: 'nps', at_least: 7 }, A));
assert(flow.evalCondition({ answer: 'support_gate', equals: 'yes' }, A));
assert(flow.evalCondition({ answer: 'support_gate', not_equals: 'no' }, A));
assert(flow.evalCondition({ answer: 'fn_rating:payments', in: [1, 2] }, A));
assert(flow.evalCondition({ answer: 'one_fix', answered: false }, A));
assert(flow.evalCondition({ all: [{ answer: 'nps', at_most: 6 }, { any: [{ answer: 'support_gate', equals: 'no' }, { answer: 'fn_rating:payments', at_most: 2 }] }] }, A));
assert(!flow.evalCondition({ answer: 'missing', equals: 'x' }, A));
assert(!flow.evalCondition({ answer: 'fn_rating:payments', at_most: 'x' }, { 'fn_rating:payments': 'na' }));
ok('show_if conditions');

// 6. canProceed
const st = { answers: {}, texts: {}, audio: {} };
const dd = { id: 'fn_deep_dive:losses', type: 'function_deep_dive', entry: {}, fn: config.functions[0] };
assert(!flow.canProceed(dd, st, config));
st.answers['fn_deep_dive:losses'] = 'other';
assert(!flow.canProceed(dd, st, config), 'other needs detail');
st.texts['fn_deep_dive:losses'] = '   ';
assert(!flow.canProceed(dd, st, config), 'blank text is not detail');
st.audio['fn_deep_dive:losses'] = { mime: 'audio/webm', duration_s: 3, bytes: 100 };
assert(flow.canProceed(dd, st, config));
const sup = { id: 'support', type: 'support_block', entry: {} };
assert(!flow.canProceed(sup, st, config));
['agent_behaviour','understood_problem','time_to_resolve','kept_updated'].forEach((i) => st.answers['support:' + i] = 4);
assert(flow.canProceed(sup, st, config));
assert(flow.canProceed({ id: 'one_fix', type: 'free_text', entry: { required: false } }, st, config));
assert(!flow.canProceed({ id: 'nps', type: 'nps_0_10', entry: { required: true } }, st, config));
ok('canProceed');

// 7. submission: only final-path answers
const state = {
  submission_id: 'sub_x', session_id: 'ses_x', opened_at: 'o', started_at: 's', submitted_at: 'f', resume_count: 1,
  answers: Object.assign({}, answers, { nps: 4, support_gate: 'no', 'support:agent_behaviour': 2,
    'fn_deep_dive:losses': 'no_proof', 'fn_deep_dive:linehaul': 'late_arrival', 'fn_deep_dive:orders': 'other' }),
  texts: { 'fn_deep_dive:losses': 'no photo proof', 'fn_deep_dive:linehaul': 'stale answer', 'support_comment': 'stale', 'one_fix': ' faster payouts ' , 'fn_deep_dive:orders': ''},
  audio: { 'fn_deep_dive:orders': { mime: 'audio/webm;codecs=opus', duration_s: 4.2, bytes: 3000 } },
  events: [{ seq: 1, screen: 'nps', at: 'x' }]
};
steps = flow.buildSteps(config, { answers: state.answers, langInUrl: true, hasWhatsChanged: false });
const sub = flow.buildSubmission(config, state, steps, { survey_id: 'valmo-partner-pulse', config_version: 'v', app_version: '0.1.0', dc: 'DC-DEMO-001', t: 'tok', round: 'DEMO-R1', lang: 'hi', mode: 'mock', sent_at: 'now', attempt: 1, client: {} }, (id) => id === 'fn_deep_dive:orders' ? 'QUJD' : null);
assert.deepStrictEqual(sub.answers, { nps: 4, support_gate: 'no' });
const fr = sub.ratings.filter((r) => r.block === 'function');
assert.strictEqual(fr.length, 6);
assert.deepStrictEqual(fr.find((r) => r.item === 'losses'), { block: 'function', item: 'losses', rating: 2, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'no_proof' });
assert.strictEqual(fr.find((r) => r.item === 'linehaul').issue_code, null, 'linehaul rated 4: stale chip dropped');
assert.deepStrictEqual(fr.find((r) => r.item === 'consumables'), { block: 'function', item: 'consumables', rating: null, not_applicable: true, threshold: 3, below_threshold: false, issue_code: null });
assert.strictEqual(sub.ratings.filter((r) => r.block === 'support').length, 0, 'support dropped when gate = no');
const items = sub.free_text.map((f) => f.item_id);
assert.deepStrictEqual(items, ['fn_deep_dive:losses', 'fn_deep_dive:orders', 'one_fix']);
const orders = sub.free_text.find((f) => f.item_id === 'fn_deep_dive:orders');
assert.deepStrictEqual(orders.audio, { mime: 'audio/webm;codecs=opus', duration_s: 4.2, bytes: 3000, base64: 'QUJD' });
assert.strictEqual(orders.text, '');
assert.strictEqual(orders.issue_code, 'other');
assert.strictEqual(sub.free_text.find((f) => f.item_id === 'one_fix').text, 'faster payouts');
assert.strictEqual(sub.free_text.find((f) => f.item_id === 'one_fix').block, 'one_fix');
assert.strictEqual(sub.kind, 'submit'); assert.strictEqual(sub.schema_version, 1); assert.strictEqual(sub.resume_count, 1);
ok('submission keeps only final-path answers');
console.log(n, 'tests passed');

// 8. show_if can test free-text screens via ruleAnswers
const cfg3 = JSON.parse(JSON.stringify(config));
cfg3.flow.splice(cfg3.flow.length - 1, 0, { id: 'callback', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'one_fix', answered: true } });
const st3 = { answers: { nps: 8, support_gate: 'no' }, texts: { one_fix: '' }, audio: {} };
let s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(!ids(s3).includes('callback'), 'hidden while one_fix empty');
st3.texts.one_fix = 'faster payouts';
s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(ids(s3).includes('callback'), 'shown once one_fix has text');
st3.texts.one_fix = ''; st3.audio.one_fix = { mime: 'audio/webm', duration_s: 2, bytes: 10 };
s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(ids(s3).includes('callback'), 'shown once one_fix has a voice note');
assert.strictEqual(flow.ruleAnswers({ answers: { 'fn_deep_dive:x': 'other' }, texts: { 'fn_deep_dive:x': 'hi' }, audio: {} })['fn_deep_dive:x'], 'other', 'chip value wins over text marker');
const subm = flow.buildSubmission(cfg3, Object.assign({ submission_id: 's', session_id: 's', events: [] }, st3, { answers: Object.assign({ callback: 'yes' }, st3.answers) }), s3, { client: {} }, () => 'QQ==');
assert.deepStrictEqual(Object.keys(subm.answers).sort(), ['callback', 'nps', 'support_gate'], 'markers never leak into answers');
ok('free-text screens can be tested by show_if');
console.log(n, 'tests passed');

// =============================================================================
// Cases 9 onwards: the graph format "pp-flow/1" (23 Oct 2026, docs/flow-engine.md).
// Small fake questionnaires, written here. Each case is in its own { block }.
// =============================================================================
const clone = (x) => JSON.parse(JSON.stringify(x));
const legacyEngine = require(path.join(__dirname, 'legacy', 'flow_v1.js'));   // the frozen old engine
const G_AREAS = [
  { id: 'losses', issues: ['wrong_debit', 'no_proof'] },
  { id: 'payments', issues: ['payout_delayed', 'short_payment'], threshold: 2 },
  { id: 'app', issues: ['scan_issue'] }
];
const G_COLLECTIONS = { areas: { list: 'functions', defaults: { threshold: 3 } }, support_items: { list: 'support.items' } };
const G_META = { survey_id: 'valmo-partner-pulse', config_version: 'v', app_version: '0.2.0', dc: 'DC-DEMO-001', t: 'tok',
  round: 'DEMO-R1', lang: 'en', mode: 'mock', sent_at: 'now', attempt: 1, client: {} };
function gSurvey(nodes, start) {
  return { functions: clone(G_AREAS), support: { items: ['agent_behaviour', 'kept_updated'] },
    flow: { format: 'pp-flow/1', start: start || nodes[0].id, collections: clone(G_COLLECTIONS), nodes: nodes } };
}
const gState = (answers, texts, audio) => ({ answers: answers || {}, texts: texts || {}, audio: audio || {}, lang_chosen: true,
  submission_id: 'sub_g', session_id: 'ses_g', events: [] });
const gPath = (s, state, facts) => flow.path(flow.load(s), s, { facts: facts || {} }, state || gState());
const gIds = (s, state, facts) => ids(gPath(s, state, facts));
const gSend = (s, state, steps) => flow.buildSubmission(s, state, steps, G_META, () => 'QUJD');

// 9. a jump with a default
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: [{ when: { answer: 'nps', at_least: 9 }, goto: 'one_fix' }, { default: 'support_gate' }] },
    { id: 'support_gate', type: 'yes_no', text: 'q.support_gate', next: 'one_fix' },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', required: false, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  assert.deepStrictEqual(gIds(s, gState({ nps: 10 })), ['nps', 'one_fix', 'thanks'], 'a promoter jumps over support_gate (the jump sees its own answer)');
  assert.deepStrictEqual(gIds(s, gState({ nps: 5 })), ['nps', 'support_gate', 'one_fix', 'thanks'], 'otherwise the default arrow');
  assert.deepStrictEqual(gIds(s, gState({})), ['nps', 'support_gate', 'one_fix', 'thanks'], 'no answer yet: the default arrow');
  // a skipped screen follows its default arrow, even when one of its jumps would match
  const s2 = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'gate' },
    { id: 'gate', type: 'yes_no', text: 'q.g', show_if: { answer: 'nps', at_most: 6 },
      next: [{ when: { answer: 'nps', answered: true }, goto: 'thanks' }, { default: 'one_fix' }] },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  assert.deepStrictEqual(gIds(s2, gState({ nps: 3 })), ['nps', 'gate', 'thanks']);
  assert.deepStrictEqual(gIds(s2, gState({ nps: 8 })), ['nps', 'one_fix', 'thanks'], 'hidden: its jumps are ignored');
  ok('graph: a jump with a default');
}

// 10. a loop over the areas rated low: each area's own threshold, and "na" is never low
{
  const s = gSurvey([
    { id: 'fn_ratings', type: 'function_rating', repeat_for: { each: 'area', in: 'areas' }, store_as: 'fn_rating:{area}',
      text: 'q.fn_rating', label: 'fn.{area}.name', help: 'fn.{area}.help', issue_code_from: 'fn_deep_dive:{area}', next: 'fn_deep_dives' },
    { id: 'fn_deep_dives', type: 'function_deep_dive', store_as: 'fn_deep_dive:{area}',
      repeat_for: { each: 'area', in: 'areas', where: { answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } } },
      text: 'q.deep_dive', options: { from: 'area.issues', text: 'issue.{area}.{code}', other: 'issue.other' }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  const state = gState({ 'fn_rating:losses': 3, 'fn_rating:payments': 3, 'fn_rating:app': 'na',
    'fn_deep_dive:losses': 'no_proof', 'fn_deep_dive:payments': 'payout_delayed' }, { 'fn_deep_dive:losses': 'no photo' });
  const steps = gPath(s, state);
  assert.deepStrictEqual(ids(steps), ['fn_rating:losses', 'fn_rating:payments', 'fn_rating:app', 'fn_deep_dive:losses', 'thanks'],
    'losses 3 <= 3 is low; payments 3 > its own threshold 2; app "na" is never low');
  assert.strictEqual(steps[1].fn.id, 'payments');
  assert.strictEqual(steps[1].fn.threshold, 2, 'its own threshold');
  assert.strictEqual(steps[2].fn.threshold, 3, 'the default threshold fills a missing one');
  assert.strictEqual(steps[0].vars.area, steps[0].fn, 'fn = the loop item');
  const out = gSend(s, state, steps);
  assert.deepStrictEqual(out.ratings, [
    { block: 'function', item: 'losses', rating: 3, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'no_proof' },
    { block: 'function', item: 'payments', rating: 3, not_applicable: false, threshold: 2, below_threshold: false, issue_code: null },
    { block: 'function', item: 'app', rating: null, not_applicable: true, threshold: 3, below_threshold: false, issue_code: null }
  ], 'the stale payments chip is not sent: its problem screen is off the path');
  assert.deepStrictEqual(out.free_text.map((f) => [f.item_id, f.block, f.function, f.issue_code, f.question_key, f.text]),
    [['fn_deep_dive:losses', 'function', 'losses', 'no_proof', 'q.tell_more', 'no photo']]);
  state.answers['fn_rating:payments'] = 2;
  assert.deepStrictEqual(ids(gPath(s, state)).slice(3), ['fn_deep_dive:losses', 'fn_deep_dive:payments', 'thanks'], 'payments 2 is low');
  ok('graph: a loop with "where", per-area thresholds and "na"');
}

// 11. "problem screen straight after each low rating" as a group; leaving a loop early
{
  const nodes = [
    { id: 'area_loop', type: 'group', repeat_for: { each: 'area', in: 'areas' }, next: 'one_fix',
      body: { start: 'rate', nodes: [
        { id: 'rate', type: 'function_rating', store_as: 'fn_rating:{area}', issue_code_from: 'fn_deep_dive:{area}', next: 'dive' },
        { id: 'dive', type: 'function_deep_dive', store_as: 'fn_deep_dive:{area}',
          show_if: { answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } }, next: '@next_item' }
      ] } },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ];
  const s = gSurvey(nodes);
  const state = gState({ 'fn_rating:losses': 1, 'fn_rating:payments': 2, 'fn_rating:app': 5, 'fn_deep_dive:losses': 'other' });
  assert.deepStrictEqual(gIds(s, state), ['fn_rating:losses', 'fn_deep_dive:losses', 'fn_rating:payments', 'fn_deep_dive:payments',
    'fn_rating:app', 'one_fix', 'thanks']);
  assert(flow.hasType(s, 'group') && flow.hasType(s, 'function_deep_dive'), 'hasType looks inside group bodies');
  // a body arrow to a later top-level screen leaves the loop early
  const s2 = gSurvey(clone(nodes));
  s2.flow.nodes[0].body.nodes[1].next = [{ when: { answer: 'fn_deep_dive:{area}', equals: 'other' }, goto: 'one_fix' }, { default: '@next_item' }];
  assert.deepStrictEqual(gIds(s2, state), ['fn_rating:losses', 'fn_deep_dive:losses', 'one_fix', 'thanks']);
  state.answers['fn_deep_dive:losses'] = 'no_proof';
  assert.deepStrictEqual(gIds(s2, state).length, 7, 'no "other": every area');
  // today's immediate mode, converted, is exactly this group
  const cfgI = clone(config); cfgI.deep_dive.when = 'immediate';
  const g = flow.fromLegacy(cfgI);
  assert.deepStrictEqual(g.nodes.map((x) => x.id), ['language', 'whats_changed', 'nps', 'area_loop', 'support_gate', 'support', 'one_fix', 'thanks'],
    'the problem-screens line is dropped (the old engine ignored it in immediate mode)');
  assert.deepStrictEqual(g.nodes[3].body.nodes.map((x) => [x.id, x.next]), [['fn_ratings', 'fn_deep_dives'], ['fn_deep_dives', '@next_item']]);
  ok('graph: immediate mode as a group, and leaving a loop early');
}

// 12. two endings
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: [{ when: { answer: 'nps', at_most: 2 }, goto: 'thanks_short' }, { default: 'one_fix' }] },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', next: 'thanks' },
    { id: 'thanks_short', type: 'thank_you', text: 'thanks.short_title', body: 'thanks.short_body' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  const state = gState({ nps: 1 }, { one_fix: 'typed before going Back' });
  const steps = gPath(s, state);
  assert.deepStrictEqual(ids(steps), ['nps', 'thanks_short']);
  assert(flow.isEnd(steps[1]) && flow.isEnd(s.flow.nodes[3]) && !flow.isEnd(steps[0]), 'every thank_you is an ending');
  assert.deepStrictEqual(steps[1].keys, { text: 'thanks.short_title', body: 'thanks.short_body' }, 'its own texts');
  const out = gSend(s, state, steps);
  assert.deepStrictEqual([out.answers, out.free_text], [{ nps: 1 }, []], 'only what is on the path to that ending is sent');
  state.answers.nps = 8;
  const steps2 = gPath(s, state);
  assert.deepStrictEqual(ids(steps2), ['nps', 'one_fix', 'thanks']);
  assert.deepStrictEqual(steps2[2].keys, {}, 'no texts set: the screen uses thanks.title / thanks.body');
  // an ending with a show_if follows its "next" when it is skipped
  const s2 = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'early_end' },
    { id: 'early_end', type: 'thank_you', show_if: { answer: 'nps', equals: 0 }, next: 'one_fix' },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  assert.deepStrictEqual(gIds(s2, gState({ nps: 0 })), ['nps', 'early_end']);
  assert.deepStrictEqual(gIds(s2, gState({ nps: 4 })), ['nps', 'one_fix', 'thanks']);
  ok('graph: two endings');
}

// 13. facts of the link: lang, lang_in_url, whats_changed_count, round
{
  const s = gSurvey([
    { id: 'language', type: 'language_picker', show_if: { fact: 'lang_in_url', equals: false }, next: 'whats_changed' },
    { id: 'whats_changed', type: 'whats_changed', show_if: { fact: 'whats_changed_count', at_least: 1 }, next: 'south' },
    { id: 'south', type: 'info_card', text: 'q.south', show_if: { fact: 'lang', in: ['ta', 'te', 'kn', 'ml'] }, next: 'round2' },
    { id: 'round2', type: 'info_card', text: 'q.r2', show_if: { fact: 'round', equals: 'R2' }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  assert.deepStrictEqual(gIds(s, gState(), { lang: 'ta', lang_in_url: true, whats_changed_count: 0, round: 'R2' }), ['south', 'round2', 'thanks']);
  assert.deepStrictEqual(gIds(s, gState(), { lang: 'hi', lang_in_url: false, whats_changed_count: 3, round: 'R1' }), ['language', 'whats_changed', 'thanks']);
  assert.deepStrictEqual(gIds(s, gState(), {}), ['language', 'thanks'], 'missing facts: no ?lang=, nothing changed, language and round unknown');
  assert.deepStrictEqual(gIds(s, gState({ lang: 'ta', round: 'R2' }), {}), ['language', 'thanks'], 'an answer is not a fact');
  ok('graph: facts (lang, lang_in_url, whats_changed_count, round)');
}

// 14. rules only see answers on the current path: going Back and changing A drops C (chain A -> B -> C)
{
  const lines = [
    { id: 'a', type: 'yes_no', text: 'q.a' },
    { id: 'b', type: 'yes_no', text: 'q.b', show_if: { answer: 'a', equals: 'yes' } },
    { id: 'c', type: 'yes_no', text: 'q.c', show_if: { answer: 'b', equals: 'yes' } },
    { id: 'thanks', type: 'thank_you' }
  ];
  const listSurvey = { flow: clone(lines) };
  const s = gSurvey(lines.map((l, i) => Object.assign(clone(l), i < 3 ? { next: lines[i + 1].id } : {})));
  const state = gState({ a: 'yes', b: 'yes', c: 'yes' });
  assert.deepStrictEqual(gIds(s, state), ['a', 'b', 'c', 'thanks']);
  state.answers.a = 'no';   // Back to "a", changed to no
  const steps = gPath(s, state);
  assert.deepStrictEqual(ids(steps), ['a', 'thanks'], 'b is off the path, so its "yes" no longer shows c');
  assert.deepStrictEqual(gSend(s, state, steps).answers, { a: 'no' }, 'b and c are not sent');
  assert.strictEqual(state.answers.c, 'yes', 'but they stay saved on the phone');
  const ctx = { langInUrl: true, hasWhatsChanged: false };
  assert.deepStrictEqual(ids(legacyEngine.buildSteps(listSurvey, Object.assign({ answers: legacyEngine.ruleAnswers(state) }, ctx))), ['a', 'c', 'thanks'],
    'the old engine still asked c from the stale answer (the bug this fixes)');
  assert.deepStrictEqual(ids(flow.buildSteps(listSurvey, Object.assign({ answers: flow.ruleAnswers(state) }, ctx))), ['a', 'thanks'],
    'the same list in the new engine');
  state.answers.a = 'yes';   // and back again: b and c return with their saved answers
  const again = gPath(s, state);
  assert.deepStrictEqual(ids(again), ['a', 'b', 'c', 'thanks']);
  assert.deepStrictEqual(gSend(s, state, again).answers, { a: 'yes', b: 'yes', c: 'yes' });
  ok('graph: path-scoped answers after Back (chain A -> B -> C)');
}

// 15. "not"
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'why' },
    { id: 'why', type: 'free_text', text: 'q.why', show_if: { not: { answer: 'nps', at_most: 6 } }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  assert.deepStrictEqual(gIds(s, gState({ nps: 9 })), ['nps', 'why', 'thanks']);
  assert.deepStrictEqual(gIds(s, gState({ nps: 3 })), ['nps', 'thanks']);
  assert.deepStrictEqual(gIds(s, gState({})), ['nps', 'why', 'thanks'], 'no answer: "at most 6" is false, so "not" is true');
  assert(flow.evalCondition({ not: { all: [{ answer: 'x', equals: 1 }, { answer: 'y', equals: 2 }] } }, { x: 1, y: 3 }));
  assert(!flow.evalCondition({ not: { any: [{ answer: 'x', equals: 1 }] } }, { x: 1 }));
  ok('graph: "not"');
}

// 16. loop values inside rules ({"var": ...})
{
  const s = gSurvey([
    { id: 'focus', type: 'single_choice', text: 'q.focus', options: ['losses', 'payments', 'app'], next: 'callback' },
    { id: 'callback', type: 'yes_no', text: 'q.callback.{area}', store_as: 'callback:{area}',
      repeat_for: { each: 'area', in: 'areas', where: { any: [{ answer: 'focus', equals: { var: 'area' } }, { var: 'area.threshold', at_most: 2 }] } },
      next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  const steps = gPath(s, gState({ focus: 'app' }));
  assert.deepStrictEqual(ids(steps), ['focus', 'callback:payments', 'callback:app', 'thanks'], 'payments: threshold 2; app: picked');
  assert.strictEqual(steps[2].keys.text, 'q.callback.app', 'templates in text keys are filled');
  const env = { facts: { lang: 'ta' }, vars: { area: { id: 'losses', threshold: 3, issues: ['a', 'b'] } } };
  assert(flow.evalCondition({ var: 'area.threshold', at_least: 3 }, {}, env));
  assert(flow.evalCondition({ answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } }, { 'fn_rating:losses': 3 }, env));
  assert(!flow.evalCondition({ answer: 'fn_rating:{area}', at_most: { var: 'area.threshold' } }, { 'fn_rating:losses': 'na' }, env));
  assert(flow.evalCondition({ answer: 'pick', in: [{ var: 'area' }, 'app'] }, { pick: 'losses' }, env));
  assert(flow.evalCondition({ var: 'area', equals: 'losses' }, {}, env), '"area" alone = its id');
  assert(flow.evalCondition({ fact: 'lang', in: ['ta', 'te'] }, {}, env));
  assert(!flow.evalCondition({ fact: 'lang', equals: 'ta' }, { lang: 'ta' }), 'two arguments: no facts');
  ok('graph: a loop value ({"var"}) inside rules');
}

// 17. the safety-net thank-you
{
  const s = gSurvey([{ id: 'nps', type: 'nps_0_10', text: 'q.nps' }]);
  const steps = gPath(s, gState({ nps: 4 }));
  assert.deepStrictEqual(steps.map((x) => [x.id, x.type]), [['nps', 'nps_0_10'], ['thanks', 'thank_you']], 'ran off the graph: a thank-you is added');
  assert.deepStrictEqual(steps[1].keys, {});
  s.flow.nodes[0].next = 'nowhere';
  assert.deepStrictEqual(gIds(s, gState()), ['nps', 'thanks'], 'an arrow to a missing screen');
  assert.deepStrictEqual(gIds(gSurvey([{ id: 'nps', type: 'nps_0_10' }], 'missing')), ['thanks'], 'a missing start');
  ok('graph: the safety-net thank-you');
}

// 18. broken graphs never crash (the checker refuses them); an arrow loop stops with an error
{
  const broken = [
    { format: 'pp-flow/1' },
    { format: 'pp-flow/1', start: 'x', nodes: 'x', collections: 5 },
    { format: 'pp-flow/1', start: 'a', nodes: [null, 5, 'a', [], { id: 'a', type: 'yes_no', next: null }] },
    { format: 'pp-flow/1', start: 'a', nodes: [{ id: 'a', type: 'yes_no', next: 7 }] },
    { format: 'pp-flow/1', start: 'a', nodes: [{ id: 'a', type: 'yes_no', next: [null, 5, {}, { when: 'x' }, { goto: 'b' }] }, { id: 'b', type: 'thank_you' }] },
    { format: 'pp-flow/1', start: 'g', nodes: [{ id: 'g', type: 'group', next: 'z' }] },
    { format: 'pp-flow/1', start: 'g', nodes: [{ id: 'g', type: 'group', body: { nodes: 'x' }, repeat_for: 'areas' }] },
    { format: 'pp-flow/1', start: 'g', nodes: [{ id: 'g', type: 'group', repeat_for: { each: 'area', in: 'areas' }, body: { start: 'r', nodes: [{ id: 'r', type: 'function_rating' }] } }] },
    { format: 'pp-flow/1', start: 'r', nodes: [{ id: 'r', type: 'function_rating', repeat_for: { each: 'area', in: 'nowhere' }, next: '@next_item' }] },
    { format: 'pp-flow/1', start: 'r', nodes: [{ id: 'r', type: 'support_block', rows: { in: 'x' }, comment: {}, show_if: 'x', store_as: 5 }] },
    { format: 'pp-flow/1', start: 'c', nodes: [{ id: 'c', type: 'yes_no', show_if: { answer: 'c', in: 'x' }, next: 'constructor' }] },
    { format: 'pp-flow/1', start: 'q', nodes: [{ id: 'q', type: 'single_choice', options: { from: 'area.issues' }, store_as: 'q:{area}', next: 'm' },
      { id: 'm', type: 'mystery', options: 5, rows: { each: 'i', in: 'areas' }, next: 't' }, { id: 't', type: 'thank_you', repeat_for: { each: 'x', in: 'areas' } }] },
    { format: 'pp-flow/1', start: 'a', nodes: [{ id: 'a', type: 'yes_no', show_if: { all: 'x', any: 5, not: 'y' }, repeat_for: true, next: '@next_item' }] }
  ];
  broken.forEach((g, i) => {
    const s = { functions: clone(G_AREAS), support: { items: ['agent_behaviour'] }, flow: g };
    const state = gState({ a: 'yes', c: 'no' }, { q: 'x' });
    const steps = gPath(s, state);
    assert(Array.isArray(steps) && steps.length >= 1 && flow.isEnd(steps[steps.length - 1]), 'broken graph ' + i + ' ends on an ending');
    steps.forEach((x) => { flow.canProceed(x, state, s); flow.isAnswered(x, state); });
    gSend(s, state, steps);
  });
  [null, undefined, 5, {}, { flow: 'x' }, { flow: { format: 'pp-flow/9', start: 'a', nodes: [{ id: 'a', type: 'yes_no' }] } }].forEach((s) => {
    assert.deepStrictEqual(ids(flow.path(flow.load(s), s, null, null)), ['thanks'], 'an unusable questionnaire: just the thank-you');
  });
  assert.deepStrictEqual(ids(flow.buildSteps({ flow: [] })), ['thanks'], 'buildSteps without ctx, and an empty list');
  const loop = gSurvey([{ id: 'a', type: 'yes_no', next: 'b' }, { id: 'b', type: 'yes_no', next: 'a' }]);
  assert.throws(() => gPath(loop), /^Error: flow: /, 'an arrow loop stops at the 2,000-step safety net');
  const hiddenLoop = gSurvey([{ id: 'a', type: 'yes_no', show_if: { answer: 'x', equals: 1 }, next: 'b' },
    { id: 'b', type: 'yes_no', show_if: { answer: 'x', equals: 1 }, next: 'a' }]);
  assert.throws(() => gPath(hiddenLoop), /^Error: flow: /, 'also when every screen in the loop is skipped');
  ok('graph: broken graphs never crash; an arrow loop throws a clear error');
}

// 19. buildSteps: the old ctx and the new ctx give the same screens
{
  const state = gState({ nps: 3, 'fn_rating:payments': 2, support_gate: 'yes' }, { one_fix: 'faster' });
  const oldCtx = flow.buildSteps(config, { answers: flow.ruleAnswers(state), langInUrl: true, hasWhatsChanged: false });
  const newCtx = flow.buildSteps(config, { state: state, langInUrl: true, whatsChangedCount: 0, lang: 'hi', round: 'R1' });
  assert.deepStrictEqual(ids(newCtx), ids(oldCtx));
  assert.deepStrictEqual(ids(flow.buildSteps(config, { state: state, whatsChangedCount: 2 })).slice(0, 3), ['language', 'whats_changed', 'nps']);
  assert.deepStrictEqual(ids(flow.buildSteps(config, { answers: {}, hasWhatsChanged: true })).slice(0, 2), ['language', 'whats_changed'], 'true = 1 item');
  const s = gSurvey([{ id: 'r2', type: 'info_card', text: 'q.r2', show_if: { all: [{ fact: 'round', equals: 'R2' }, { fact: 'lang', equals: 'hi' }] }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }]);
  assert.deepStrictEqual(ids(flow.buildSteps(s, { state: gState(), lang: 'hi', round: 'R2' })), ['r2', 'thanks'], 'the new ctx carries lang and round');
  assert.deepStrictEqual(ids(flow.buildSteps(s, { answers: {}, langInUrl: true })), ['thanks'], 'the old ctx has no language or round');
  ok('buildSteps with both ctx shapes');
}

// 20. the format checks, load(), items(), fill(), keysOf()
{
  assert.strictEqual(flow.ENGINE, 2);
  assert.strictEqual(flow.FORMAT, 'pp-flow/1');
  assert(flow.supportsFormat(config.flow) && flow.supportsFormat({ format: 'pp-flow/1' }));
  assert(!flow.supportsFormat([]) && !flow.supportsFormat({ format: 'pp-flow/2' }) && !flow.supportsFormat(null) && !flow.supportsFormat('x') && !flow.supportsFormat({}));
  assert(flow.isGraph({ format: 'pp-flow/1', nodes: [] }) && !flow.isGraph(config.flow) && !flow.isGraph([{ format: 'pp-flow/1' }]));
  assert(flow.hasType(config, 'whats_changed') && flow.hasType(config, 'function_rating') && !flow.hasType(config, 'group') && !flow.hasType(config, 'function_ratings'));
  const g = flow.load(config);
  assert.strictEqual(flow.load(config), g, 'remembered per survey object');
  assert(g.legacy === true && g.byId.nps.type === 'nps_0_10' && g.format === 'pp-flow/1');
  const copyOf = clone(config);
  assert.notStrictEqual(flow.load(copyOf), g, 'another survey object: prepared again');
  const s = gSurvey([{ id: 'a', type: 'yes_no' }]);
  const gs = flow.load(s);
  assert(gs.legacy === false && gs.byId.a && !s.flow.byId, 'a graph is copied, never changed');
  s.flow = clone(s.flow); s.flow.nodes[0].id = 'b';
  assert(flow.load(s).byId.b, 'a new flow on the same survey is prepared again');
  const items = flow.items({ collections: { areas: { list: 'functions', defaults: { threshold: 3 } }, plain: { list: 'support.items' } } },
    { functions: [{ id: 'x', threshold: '2' }, { id: 'y', threshold: 1 }], support: { items: ['p', 'q'] } }, 'areas');
  assert.deepStrictEqual(items, [{ id: 'x', threshold: 3 }, { id: 'y', threshold: 1 }], 'a threshold of the wrong kind gets the default');
  assert.deepStrictEqual(flow.items({ collections: { plain: { list: 'support.items' } } }, { support: { items: ['p', 'q'] } }, 'plain'), [{ id: 'p' }, { id: 'q' }]);
  assert.deepStrictEqual(flow.items({}, {}, 'nothing'), []);
  const v = { area: { id: 'payments', threshold: 2 }, item: { id: 'kept_updated' } };
  assert.strictEqual(flow.fill('fn_rating:{area}', v), 'fn_rating:payments');
  assert.strictEqual(flow.fill('{area.threshold}/{item}/{other}', v), '2/kept_updated/{other}', 'unknown names stay as they are');
  assert.strictEqual(flow.fill(5, v), 5);
  const sup = flow.load(config).byId.support;
  assert.deepStrictEqual(flow.keysOf(g, config, sup, {}), ['support', 'support:agent_behaviour', 'support:understood_problem',
    'support:time_to_resolve', 'support:kept_updated', 'support_comment']);
  assert.deepStrictEqual(flow.keysOf(g, config, g.byId.fn_ratings, { area: { id: 'app' } }), ['fn_rating:app']);
  assert.deepStrictEqual(flow.keysOf(g, config, { id: 'grp', type: 'group' }, {}), [], 'a group stores nothing');
  ok('supportsFormat, isGraph, hasType, load, items, fill, keysOf');
}

// 21. step.keys for every type: templates filled; absent when the node does not set them
{
  const s = gSurvey([
    { id: 'language', type: 'language_picker', next: 'wc' },
    { id: 'wc', type: 'whats_changed', next: 'nps' },
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', low_label: 'nps.low', high_label: 'nps.high', scale_hint: 'nps.scale_hint', next: 'gate' },
    { id: 'gate', type: 'yes_no', text: 'q.gate', next: 'role' },
    { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner', 'manager'], next: 'role2' },
    { id: 'role2', type: 'single_choice', text: 'q.role2', options: [{ code: 'x', text: 'choice.custom.x' }], next: 'ease' },
    { id: 'ease', type: 'rating_1_5', text: 'q.ease', next: 'note' },
    { id: 'note', type: 'info_card', text: 'q.note', body: 'q.note_body', next: 'rate' },
    { id: 'rate', type: 'function_rating', repeat_for: { each: 'area', in: 'areas' }, store_as: 'fn_rating:{area}',
      text: 'q.fn_rating', label: 'fn.{area}.name', help: 'fn.{area}.help', next: 'dive' },
    { id: 'dive', type: 'function_deep_dive', repeat_for: { each: 'area', in: 'areas', where: { var: 'area', equals: 'payments' } },
      store_as: 'fn_deep_dive:{area}', text: 'q.deep_dive', label: 'fn.{area}.name',
      options: { from: 'area.issues', text: 'issue.{area}.{code}', other: 'issue.other' },
      detail_text: 'q.tell_more', detail_text_required: 'q.tell_more_required', next: 'pick' },
    { id: 'pick', type: 'single_choice', text: 'q.pick', repeat_for: { each: 'area', in: 'areas', where: { var: 'area', equals: 'losses' } },
      store_as: 'pick:{area}', options: { from: 'area.issues', text: 'issue.{area}.{code}' }, next: 'support' },
    { id: 'support', type: 'support_block', text: 'q.support_block',
      rows: { each: 'item', in: 'support_items', store_as: 'support:{item}', text: 'support.{item}' },
      comment: { store_as: 'support_comment', text: 'q.support_comment' }, next: 'bare' },
    { id: 'bare', type: 'support_block', text: 'q.bare', next: 'one_fix' },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', next: 'thanks' },
    { id: 'thanks', type: 'thank_you', text: 'thanks.title_v2' }
  ]);
  const steps = gPath(s, gState());
  const k = {};
  steps.forEach((x) => { k[x.id] = x.keys; });
  assert.deepStrictEqual(k.language, {});
  assert.deepStrictEqual(k.wc, {});
  assert.deepStrictEqual(k.nps, { text: 'q.nps', low_label: 'nps.low', high_label: 'nps.high', scale_hint: 'nps.scale_hint' });
  assert.deepStrictEqual(k.gate, { text: 'q.gate' });
  assert.deepStrictEqual(k.role, { text: 'q.role', options: [{ code: 'owner', text: 'choice.role.owner' }, { code: 'manager', text: 'choice.role.manager' }] });
  assert.deepStrictEqual(k.role2, { text: 'q.role2', options: [{ code: 'x', text: 'choice.custom.x' }] });
  assert.deepStrictEqual(k.ease, { text: 'q.ease' });
  assert.deepStrictEqual(k.note, { text: 'q.note', body: 'q.note_body' });
  assert.deepStrictEqual(k['fn_rating:app'], { text: 'q.fn_rating', label: 'fn.app.name', help: 'fn.app.help' });
  assert.deepStrictEqual(k['fn_deep_dive:payments'], { text: 'q.deep_dive', label: 'fn.payments.name', detail_text: 'q.tell_more',
    detail_text_required: 'q.tell_more_required', options: [{ code: 'payout_delayed', text: 'issue.payments.payout_delayed' },
      { code: 'short_payment', text: 'issue.payments.short_payment' }, { code: 'other', text: 'issue.other' }] });
  assert.deepStrictEqual(k['pick:losses'], { text: 'q.pick', options: [{ code: 'wrong_debit', text: 'issue.losses.wrong_debit' },
    { code: 'no_proof', text: 'issue.losses.no_proof' }] }, 'no "other" unless the node asks for it');
  assert.deepStrictEqual(k.support, { text: 'q.support_block',
    rows: [{ id: 'agent_behaviour', key: 'support:agent_behaviour', text: 'support.agent_behaviour' },
      { id: 'kept_updated', key: 'support:kept_updated', text: 'support.kept_updated' }],
    comment: { key: 'support_comment', text: 'q.support_comment' } });
  assert.deepStrictEqual(k.bare, { text: 'q.bare' }, 'no rows, no comment: absent');
  assert.deepStrictEqual(k.one_fix, { text: 'q.one_fix' });
  assert.deepStrictEqual(k.thanks, { text: 'thanks.title_v2' });
  steps.forEach((x) => {
    assert.deepStrictEqual(Object.keys(x), ['id', 'type', 'node', 'entry', 'vars', 'fn', 'keys'], 'step shape');
    assert.strictEqual(x.entry, x.node, 'entry = node, for older code');
    assert.strictEqual(x.fn, x.vars.area, 'fn = the area in a loop over areas, else undefined');
  });
  // today's questionnaire (list format): the same keys the screens use today
  const t = {};
  flow.buildSteps(config, { answers: { 'fn_rating:payments': 2, support_gate: 'yes' }, langInUrl: false, hasWhatsChanged: true })
    .forEach((x) => { t[x.id] = x.keys; });
  assert.deepStrictEqual(t.language, {});
  assert.deepStrictEqual(t.nps, { text: 'q.nps', low_label: 'nps.low', high_label: 'nps.high', scale_hint: 'nps.scale_hint' });
  assert.deepStrictEqual(t['fn_rating:payments'], { text: 'q.fn_rating', label: 'fn.payments.name', help: 'fn.payments.help' });
  assert.deepStrictEqual(t['fn_deep_dive:payments'].options.map((o) => o.text), config.functions[1].issues.map((c) => 'issue.payments.' + c).concat(['issue.other']));
  assert.deepStrictEqual([t['fn_deep_dive:payments'].text, t['fn_deep_dive:payments'].detail_text, t['fn_deep_dive:payments'].detail_text_required],
    ['q.deep_dive', 'q.tell_more', 'q.tell_more_required']);
  assert.deepStrictEqual(t.support.rows.map((r) => r.key + '=' + r.text), config.support.items.map((i) => 'support:' + i + '=support.' + i));
  assert.deepStrictEqual(t.support.comment, { key: 'support_comment', text: 'q.support_comment' });
  assert.deepStrictEqual([t.support_gate, t.one_fix, t.thanks], [{ text: 'q.support_gate' }, { text: 'q.one_fix' }, {}]);
  const noComment = clone(config); noComment.support.allow_comment = false;
  assert(!('comment' in flow.buildSteps(noComment, { answers: { support_gate: 'yes' } }).find((x) => x.id === 'support').keys),
    'support.allow_comment false: no comment box, so no keys.comment');
  ok('step.keys for every type');
}

// 22. fromLegacy: today's list is the hand-written graph of docs/flow-graph-proposal.md section 5
{
  const hand = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy', 'variants', 'graph-default.json'), 'utf8')).flow;
  const sorted = (x) => JSON.stringify(x, (key, val) => (key.charAt(0) === '_' ? undefined
    : (val && typeof val === 'object' && !Array.isArray(val) ? Object.keys(val).sort().reduce((o, kk) => { o[kk] = val[kk]; return o; }, {}) : val)));
  const g = flow.fromLegacy(config);
  assert.strictEqual(sorted(g), sorted(hand), 'same nodes, fields and arrows');
  assert.deepStrictEqual(Object.keys(g), ['format', 'start', 'collections', 'nodes']);
  assert.deepStrictEqual(flow.fromLegacy(JSON.parse(JSON.stringify(config))), JSON.parse(JSON.stringify(g)), 'survives JSON');
  // the thank-you safety net, as before
  const noThanks = clone(config); noThanks.flow.pop();
  assert.deepStrictEqual(flow.fromLegacy(noThanks).nodes.slice(-1), [{ id: 'thanks', type: 'thank_you' }]);
  const takenThanks = clone(config); takenThanks.flow[takenThanks.flow.length - 1].show_if = { answer: 'nps', equals: 0 };
  const gt = flow.fromLegacy(takenThanks);
  assert.deepStrictEqual(gt.nodes.slice(-2).map((x) => [x.id, x.next]), [['thanks', 'thanks_auto'], ['thanks_auto', undefined]], '"thanks" taken: thanks_auto');
  // settings move into the nodes
  const settings = clone(config);
  Object.assign(settings.deep_dive, { threshold: 2, require_chip: false });
  Object.assign(settings.support, { allow_comment: false, allow_not_applicable: true });
  settings.rating.allow_not_applicable = false;
  settings.flow[3].required = false;   // the area ratings line: the form's Skip button reads it
  const gs = flow.fromLegacy(settings);
  const byId = {}; gs.nodes.forEach((x) => { byId[x.id] = x; });
  assert.deepStrictEqual(gs.collections.areas.defaults, { threshold: 2 });
  assert.deepStrictEqual([byId.fn_deep_dives.require_choice, byId.fn_deep_dives.require_detail_if_other], [false, true]);
  assert.deepStrictEqual([byId.support.allow_not_applicable, 'comment' in byId.support, byId.fn_ratings.allow_not_applicable, byId.fn_ratings.required],
    [true, false, false, false]);
  assert.deepStrictEqual(byId.language.show_if, { fact: 'lang_in_url', equals: false });
  assert.deepStrictEqual(byId.whats_changed.show_if, { fact: 'whats_changed_count', at_least: 1 });
  const both = clone(config); both.flow[0].show_if = { answer: 'x', equals: 1 };
  assert.deepStrictEqual(flow.fromLegacy(both).nodes[0].show_if, { all: [{ fact: 'lang_in_url', equals: false }, { answer: 'x', equals: 1 }] });
  ok('fromLegacy: today\'s list = the hand-written graph; the old quirks kept');
}

// 23. what each type allows and sends, in the graph format
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'role' },
    { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner'], required: false, next: 'ease' },
    { id: 'ease', type: 'rating_1_5', text: 'q.ease', next: 'dive' },
    { id: 'dive', type: 'function_deep_dive', store_as: 'fn_deep_dive:{area}', repeat_for: { each: 'area', in: 'areas', where: { var: 'area', equals: 'app' } },
      require_choice: false, require_detail_if_other: false, detail_text: 'q.more.{area}', next: 'support' },
    { id: 'support', type: 'support_block', text: 'q.s', required: false,
      rows: { each: 'item', in: 'support_items', store_as: 'support:{item}', text: 'support.{item}' },
      comment: { store_as: 'support_comment', text: 'q.support_comment' }, next: 'must' },
    { id: 'must', type: 'free_text', text: 'q.must', required: true, block: 'one_fix', next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }
  ]);
  const state = gState({});
  let steps = gPath(s, state);
  const can = (id) => flow.canProceed(steps.find((x) => x.id === id), state, s);
  assert.deepStrictEqual(['nps', 'role', 'ease', 'fn_deep_dive:app', 'support', 'must', 'thanks'].map(can),
    [false, true, false, true, true, false, true], 'Next allowed on an empty form');
  Object.assign(state.answers, { nps: 6, ease: 2, 'fn_deep_dive:app': 'other', 'support:kept_updated': 'na' });
  state.texts.must = ' words ';
  state.audio['fn_deep_dive:app'] = { mime: 'audio/webm', duration_s: 2, bytes: 50 };
  steps = gPath(s, state);
  assert.deepStrictEqual(['nps', 'ease', 'must'].map(can), [true, true, true]);
  const out = gSend(s, state, steps);
  assert.deepStrictEqual(out.answers, { nps: 6, ease: 2 });
  assert.deepStrictEqual(out.ratings, [
    { block: 'question', item: 'ease', rating: 2, not_applicable: false, threshold: null, below_threshold: null, issue_code: null },
    { block: 'support', item: 'kept_updated', rating: null, not_applicable: true, threshold: null, below_threshold: null, issue_code: null }]);
  assert.deepStrictEqual(out.free_text, [
    { item_id: 'fn_deep_dive:app', block: 'function', function: 'app', issue_code: 'other', question_key: 'q.more.app', text: '',
      audio: { mime: 'audio/webm', duration_s: 2, bytes: 50, base64: 'QUJD' } },
    { item_id: 'must', block: 'one_fix', function: null, issue_code: null, question_key: 'q.must', text: 'words', audio: null }]);
  assert.deepStrictEqual(Object.keys(out), ['kind', 'schema_version', 'survey_id', 'config_version', 'app_version', 'submission_id', 'session_id',
    'dc', 't', 'round', 'lang', 'mode', 'opened_at', 'started_at', 'submitted_at', 'sent_at', 'attempt', 'resume_count', 'client',
    'answers', 'ratings', 'free_text', 'events'], 'the message keeps its key order');
  assert.deepStrictEqual(Object.keys(flow.types).sort(), ['free_text', 'function_deep_dive', 'function_rating', 'info_card', 'language_picker',
    'multi_choice', 'nps_0_10', 'rating_1_5', 'single_choice', 'support_block', 'thank_you', 'whats_changed', 'yes_no']);
  ok('graph: what each type allows (canProceed) and sends (buildSubmission)');
}

// 24. the repo's own questionnaire (web/config/survey.json, the graph since stage 4) behaves exactly like the list
{
  assert(flow.isGraph(repoSurvey.flow), 'web/config/survey.json holds the graph');
  const sets = [
    [{}, false, 1], [{ nps: 9, support_gate: 'no' }, true, 0],
    [{ nps: 3, 'fn_rating:losses': 2, 'fn_rating:payments': 'na', 'fn_rating:app': 1, 'fn_deep_dive:losses': 'other', support_gate: 'yes',
      'support:kept_updated': 4 }, true, 2],
    [answers, false, 0]
  ];
  sets.forEach(([ans, langInUrl, wc]) => {
    const state = { submission_id: 's', session_id: 's', events: [], answers: clone(ans), texts: { one_fix: 'faster', 'fn_deep_dive:losses': 'no proof' },
      audio: { support_comment: { mime: 'audio/webm', duration_s: 2, bytes: 10 } } };
    const ctx = { state, langInUrl, whatsChangedCount: wc };
    const a = flow.buildSteps(repoSurvey, ctx), b = flow.buildSteps(config, ctx);
    assert.deepStrictEqual(ids(a), ids(b), 'same screens');
    a.forEach((st, i) => assert.strictEqual(flow.canProceed(st, state, repoSurvey), flow.canProceed(b[i], state, config), 'Next on ' + st.id));
    const meta = { client: {} };
    assert.strictEqual(JSON.stringify(flow.buildSubmission(repoSurvey, state, a, meta, () => 'QQ==')),
      JSON.stringify(flow.buildSubmission(config, state, b, meta, () => 'QQ==')), 'same message');
  });
  ok('the repo\'s survey.json (the graph) shows the same screens, allows Next alike and sends the same data as the list');
}

// 25. isUsable: can a phone run this flow at all? (26 Oct 2026: a published graph without screens, or whose
//     start names no screen, showed an empty page that sent nothing; web/js/net.js now falls back to the form's own copy)
{
  assert(flow.isUsable(config.flow) && flow.isUsable(repoSurvey.flow), 'the old list and the repo\'s graph');
  assert(flow.isUsable({ format: 'pp-flow/1', start: 'a', nodes: [{ id: 'a', type: 'thank_you' }] }), 'a start that names a node');
  [[], null, undefined, 'x', 5, {}, { format: 'pp-flow/2', start: 'a', nodes: [{ id: 'a' }] }, { format: 'pp-flow/1' },
    { format: 'pp-flow/1', start: 'a', nodes: [] }, { format: 'pp-flow/1', start: 'gone', nodes: [{ id: 'nps', type: 'nps_0_10' }] },
    { format: 'pp-flow/1', nodes: [{ id: 'nps', type: 'nps_0_10' }] }, { format: 'pp-flow/1', start: 'a', nodes: 'a' },
    { format: 'pp-flow/1', start: 5, nodes: [{ id: 5 }] }, { format: 'pp-flow/1', start: 'constructor', nodes: [{ id: 'x' }] },
    { format: 'pp-flow/1', start: 'b', nodes: [{ id: 'g', type: 'group', body: { start: 'b', nodes: [{ id: 'b', type: 'yes_no' }] } }] }
  ].forEach((v, i) => assert(!flow.isUsable(v), 'unusable ' + i + ': ' + JSON.stringify(v)));
  assert(flow.supportsFormat({ format: 'pp-flow/1' }), 'supportsFormat still looks only at the format (the checker explains the rest: G4)');
  ok('isUsable: a non-empty list, or a graph whose start names one of its top-level screens');
}

// 26. "constructor" and other names every JavaScript object inherits are ordinary answer keys: always own keys
//     (until 26 Oct 2026 a store_as "constructor" counted as answered before any tap and sent "function Object() ...")
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'note' },
    { id: 'note', type: 'free_text', store_as: 'constructor', text: 'q.one_fix', required: true, next: 'proto' },
    { id: 'proto', type: 'yes_no', store_as: 'toString', text: 'q.p', show_if: { answer: 'constructor', answered: true }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }]);
  const fresh = gState({ nps: 5 });
  const steps = gPath(s, fresh);
  assert.deepStrictEqual(ids(steps), ['nps', 'constructor', 'thanks'], 'nothing typed: the rule on "constructor" sees no answer');
  assert.strictEqual(flow.isAnswered(steps[1], fresh), false, 'not answered before any tap');
  assert.strictEqual(flow.hasDetail(fresh, 'constructor'), false, 'no typed text or voice note');
  assert.strictEqual(flow.canProceed(steps[1], fresh, s), false, 'required: Next waits for a voice note or text');
  assert.deepStrictEqual(gSend(s, fresh, steps).free_text, [], 'nothing typed, nothing sent');
  assert.strictEqual(flow.evalCondition({ answer: 'constructor', answered: true }, {}), false);
  assert.strictEqual(flow.evalCondition({ answer: 'toString', answered: false }, {}), true);
  assert.deepStrictEqual(flow.ruleAnswers(gState({}, { constructor: 'typed' })), { constructor: true }, 'typed text counts for rules');
  const typed = gState({ nps: 5 }, { constructor: 'late payouts' });
  const st2 = gPath(s, typed);
  assert.deepStrictEqual(ids(st2), ['nps', 'constructor', 'toString', 'thanks'], 'typed: the rule sees it');
  assert.strictEqual(flow.canProceed(st2[1], typed, s), true);
  assert.strictEqual(flow.isAnswered(st2[2], typed), false, '"toString" is not answered either');
  const sent = gSend(s, typed, st2);
  assert.deepStrictEqual(sent.free_text.map((x) => [x.item_id, x.text]), [['constructor', 'late payouts']]);
  assert.deepStrictEqual(sent.answers, { nps: 5 }, '"toString" sends nothing until it is answered');
  const answered = gState({ nps: 5, toString: 'no' }, { constructor: 'x' });
  assert.deepStrictEqual(gSend(s, answered, gPath(s, answered)).answers, { nps: 5, toString: 'no' }, 'and its own answer once given');
  // an area rating, a problem screen and a support row stored under such names
  const a = gSurvey([
    { id: 'r', type: 'function_rating', store_as: 'constructor:{area}', repeat_for: { each: 'area', in: 'areas' }, issue_code_from: 'valueOf', next: 'sup' },
    { id: 'sup', type: 'support_block', text: 'q.s', rows: { each: 'item', in: 'support_items', store_as: 'constructor', text: 's.{item}' }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }]);
  const st3 = gPath(a, gState({}));
  assert.strictEqual(flow.canProceed(st3[st3.length - 2], gState({}), a), false, 'support rows not answered');
  assert.deepStrictEqual(gSend(a, gState({}), st3).ratings, [], 'no rating sent before any tap');
  assert.deepStrictEqual(flow.items({ collections: { a: { list: 'x', defaults: { constructor: 1 } } } }, { x: ['p'] }, 'a'), [{ id: 'p', constructor: 1 }],
    'a default named like an inherited property is still filled in');
  ok('"constructor", "toString" and "valueOf" are ordinary answer keys: not answered before a tap, nothing sent, rules see only real answers');
}
// 27. pick several (multi_choice, 28 Oct 2026): the answer is the list of codes ticked. A rule's "=" means
//     "is one of them", so each ticked area gets its own follow-up; nothing ticked is no answer at all.
{
  const s = gSurvey([
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', next: 'areas' },
    { id: 'areas', type: 'multi_choice', text: 'q.areas', options: ['load', 'payments', 'app'], next: 'load_low' },
    { id: 'load_low', type: 'single_choice', text: 'q.load_low', options: ['x', 'other'],
      show_if: { all: [{ answer: 'nps', at_most: 8 }, { answer: 'areas', equals: 'load' }] }, next: 'pay_low' },
    { id: 'pay_low', type: 'single_choice', text: 'q.pay_low', options: ['y', 'other'],
      show_if: { all: [{ answer: 'nps', at_most: 8 }, { answer: 'areas', equals: 'payments' }] }, next: 'not_app' },
    { id: 'not_app', type: 'yes_no', text: 'q.not_app', show_if: { answer: 'areas', not_equals: 'app' }, next: 'any_of' },
    { id: 'any_of', type: 'yes_no', text: 'q.any_of', show_if: { answer: 'areas', 'in': ['app', 'payments'] }, next: 'none' },
    { id: 'none', type: 'yes_no', text: 'q.none', show_if: { answer: 'areas', answered: false }, next: 'thanks' },
    { id: 'thanks', type: 'thank_you' }]);
  // the rules
  const E = (cond, v) => flow.evalCondition(cond, { areas: v }, {});
  assert.strictEqual(E({ answer: 'areas', equals: 'load' }, ['load', 'app']), true, '"= load": load is ticked');
  assert.strictEqual(E({ answer: 'areas', equals: 'payments' }, ['load', 'app']), false, '"= payments": not ticked');
  assert.strictEqual(E({ answer: 'areas', not_equals: 'payments' }, ['load', 'app']), true, '"!= payments": not ticked');
  assert.strictEqual(E({ answer: 'areas', not_equals: 'load' }, ['load']), false);
  assert.strictEqual(E({ answer: 'areas', in: ['app', 'payments'] }, ['load', 'app']), true, '"in": any of them ticked');
  assert.strictEqual(E({ answer: 'areas', in: ['payments'] }, ['load']), false);
  assert.strictEqual(E({ answer: 'areas', answered: true }, ['load']), true);
  assert.strictEqual(E({ answer: 'areas', answered: true }, []), false, 'nothing ticked is not answered');
  assert.strictEqual(E({ answer: 'areas', answered: false }, []), true);
  assert.strictEqual(E({ answer: 'areas', not_equals: 'load' }, []), true, 'nothing ticked: load is not ticked');
  assert.strictEqual(E({ answer: 'areas', at_most: 3 }, ['load']), false, 'a number test is never true of a list');
  assert.strictEqual(E({ answer: 'areas', at_least: 0 }, ['load']), false);
  // the route: one follow-up per ticked area
  assert.deepStrictEqual(gIds(s, gState({ nps: 4, areas: ['load', 'payments'] })),
    ['nps', 'areas', 'load_low', 'pay_low', 'not_app', 'any_of', 'thanks'], 'two areas ticked: two follow-ups');
  assert.deepStrictEqual(gIds(s, gState({ nps: 4, areas: ['app'] })), ['nps', 'areas', 'any_of', 'thanks']);
  assert.deepStrictEqual(gIds(s, gState({ nps: 10, areas: ['load', 'payments'] })), ['nps', 'areas', 'not_app', 'any_of', 'thanks'],
    'a promoter gets no "went wrong" screen');
  assert.deepStrictEqual(gIds(s, gState({ nps: 4 })), ['nps', 'areas', 'not_app', 'none', 'thanks'], 'not answered yet');
  // Next: at least one tick when required; an optional one may stay empty
  const steps = gPath(s, gState({ nps: 4, areas: [] }));
  const step = steps.filter((x) => x.id === 'areas')[0];
  assert.strictEqual(flow.canProceed(step, gState({ nps: 4, areas: [] }), s), false, 'required: an empty list waits');
  assert.strictEqual(flow.canProceed(step, gState({ nps: 4 }), s), false, 'required: nothing yet waits');
  assert.strictEqual(flow.canProceed(step, gState({ nps: 4, areas: ['app'] }), s), true, 'one tick is enough');
  const opt = gSurvey([{ id: 'areas', type: 'multi_choice', text: 'q.areas', options: ['a', 'b'], required: false, next: 'thanks' }, { id: 'thanks', type: 'thank_you' }]);
  assert.strictEqual(flow.canProceed(gPath(opt, gState({}))[0], gState({ areas: [] }), opt), true, 'optional: may stay empty');
  // what is sent: the list (a copy), never an empty list
  const ticked = gState({ nps: 4, areas: ['load', 'payments'], load_low: 'x', pay_low: 'other', not_app: 'yes', any_of: 'no' });
  const sent = gSend(s, ticked, gPath(s, ticked));
  assert.deepStrictEqual(sent.answers.areas, ['load', 'payments'], 'the codes ticked are sent as a list');
  assert.notStrictEqual(sent.answers.areas, ticked.answers.areas, 'a copy, not the phone\'s own list');
  assert.strictEqual(sent.answers.load_low, 'x');
  const empty = gState({ nps: 4, areas: [] });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(gSend(s, empty, gPath(s, empty)).answers, 'areas'), false, 'nothing ticked: nothing sent');
  // the kind's description (the catalogue, the checks and the panel read it)
  const d = flow.types.multi_choice;
  assert.strictEqual(d.answer.kind, 'choices');
  assert.strictEqual(d.answer.values_from, 'options');
  assert.strictEqual(d.row.label, 'Pick several answers');
  assert.ok(d.row.repeatable, 'may be asked once per area');
  ok('pick several: rules test "is one of the ticked", each ticked area gets its follow-up, Next needs a tick, the list is sent');
}
console.log(n, 'tests passed');
